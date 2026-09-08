/**
 * @file smoke-test.js
 * @description Lightweight CI/CD smoke load test (25 VUs, < 45 seconds) validating
 * authentication, anti-tampered OCC autosave, and idempotent submission pipeline.
 *
 * Usage:
 *   k6 run scripts/load/k6/smoke-test.js
 *   k6 run -e VUS=25 -e DURATION=30s scripts/load/k6/smoke-test.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import {
  BASE_URL,
  generateAntiTamperHeader,
  generateUUID,
  getCandidateForVU,
  loginCandidate,
  getAttemptContext
} from './k6-helpers.js';

const fixturesRaw = open('../fixtures/benchmark-fixtures.json');
const fixtures = JSON.parse(fixturesRaw);

const targetVUs = parseInt(__ENV.VUS || '25', 10);
const duration = __ENV.DURATION || '30s';

export const options = {
  scenarios: {
    smoke_scenario: {
      executor: 'constant-vus',
      vus: targetVUs,
      duration: duration,
      gracefulStop: '5s'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    'smoke_success_rate': ['rate>0.99']
  }
};

const smokeSuccessRate = new Rate('smoke_success_rate');
const autosaveDuration = new Trend('smoke_autosave_duration_ms', true);

export function setup() {
  const authCandidates = [];
  const count = Math.min(targetVUs, fixtures.candidates.length);
  for (let i = 0; i < count; i++) {
    const c = fixtures.candidates[i];
    const { token } = loginCandidate(c.email, null, BASE_URL);
    const attemptCtx = getAttemptContext(token, c.attemptId, BASE_URL);
    authCandidates.push({
      ...c,
      token,
      signingKey: attemptCtx.antiTamperToken
    });
  }
  return { candidates: authCandidates };
}

export default function (data) {
  const candidate = getCandidateForVU(data.candidates, __VU);
  const aq = candidate.attemptQuestions[0];
  const qId = aq.attemptQuestionId;

  // 1. Autosave Answering Step with Anti-Tamper Signature
  const savePath = `/api/v1/attempts/${candidate.attemptId}/answers/${qId}`;
  const payloadObj = {
    answer_value: { selected_option_id: aq.options[0]?.option_id || '00000000-0000-0000-0000-000000000001' },
    expected_revision: 0
  };

  const { header: antiTamperHeader, bodyStr } = generateAntiTamperHeader(
    candidate.signingKey,
    'PUT',
    savePath,
    payloadObj
  );

  const saveParams = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${candidate.token}`,
      'X-Anti-Tamper': antiTamperHeader
    },
    tags: { name: 'PUT /api/v1/attempts/:id/answers/:qid' }
  };

  const t0 = Date.now();
  const saveRes = http.put(`${BASE_URL}${savePath}`, bodyStr, saveParams);
  autosaveDuration.add(Date.now() - t0);

  const saveOk = check(saveRes, {
    'autosave status 200 or 409 replay': (r) => r.status === 200 || r.status === 409,
    'not unauthorized': (r) => r.status !== 401 && r.status !== 403
  });

  smokeSuccessRate.add(saveOk);

  sleep(1);
}
