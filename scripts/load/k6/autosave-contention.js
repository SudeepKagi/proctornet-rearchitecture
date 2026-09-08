/**
 * @file autosave-contention.js
 * @description k6 load scenario simulating high-frequency concurrent answer autosaves
 * under optimistic concurrency control (OCC) with anti-tamper payload signing.
 *
 * Usage:
 *   k6 run scripts/load/k6/autosave-contention.js
 *   k6 run -e VUS=25 -e DURATION=30s scripts/load/k6/autosave-contention.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  BASE_URL,
  generateAntiTamperHeader,
  getCandidateForVU,
  randomChoice,
  randomInt
} from './k6-helpers.js';

// Load fixture data at initialization stage
const fixturesRaw = open('../fixtures/benchmark-fixtures.json');
const fixtures = JSON.parse(fixturesRaw);

const targetVUs = parseInt(__ENV.VUS || '2500', 10);
const duration = __ENV.DURATION || '5m';

export const options = {
  scenarios: {
    autosave_stream: {
      executor: 'constant-vus',
      vus: targetVUs,
      duration: duration,
      gracefulStop: '15s'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<250', 'p(99)<500'],
    http_req_failed: ['rate<0.005'],
    'autosave_success_rate': ['rate>0.99'],
    'autosave_conflict_rate': ['rate<0.01']
  }
};

const autosaveSuccessRate = new Rate('autosave_success_rate');
const autosaveConflictRate = new Rate('autosave_conflict_rate');
const autosaveDuration = new Trend('autosave_duration_ms', true);

// In-memory per-VU state tracking revision numbers per attemptQuestionId
const vuQuestionRevisions = {};

export default function () {
  const candidate = getCandidateForVU(fixtures.candidates, __VU);
  const vuKey = `vu_${__VU}`;
  if (!vuQuestionRevisions[vuKey]) {
    vuQuestionRevisions[vuKey] = {};
  }

  // Pick a question from candidate's assigned questions
  const question = randomChoice(candidate.attemptQuestions);
  const qId = question.attemptQuestionId;
  const currentExpectedRev = vuQuestionRevisions[vuKey][qId] || 0;

  let answerValue = {};
  if (question.questionType === 'NUMERIC') {
    answerValue = { numeric_value: 42.0 };
  } else if (question.options && question.options.length > 0) {
    const opt = randomChoice(question.options);
    answerValue = { selected_option_id: opt.option_id };
  } else {
    answerValue = { text_value: 'Answer text' };
  }

  const endpointPath = `/api/v1/attempts/${candidate.attemptId}/answers/${qId}`;
  const payloadObj = {
    answer_value: answerValue,
    expected_revision: currentExpectedRev
  };

  const { header: antiTamperHeader, bodyStr } = generateAntiTamperHeader(
    candidate.signingKey,
    'PUT',
    endpointPath,
    payloadObj
  );

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${candidate.token}`,
      'X-Payload-Signature': antiTamperHeader
    },
    tags: { name: 'PUT /api/v1/attempts/:id/answers/:qid' }
  };

  const startTime = Date.now();
  const res = http.put(`${BASE_URL}${endpointPath}`, bodyStr, params);
  autosaveDuration.add(Date.now() - startTime);

  const isSuccess = res.status === 200;
  const isConflict = res.status === 409;

  autosaveSuccessRate.add(isSuccess);
  autosaveConflictRate.add(isConflict);

  check(res, {
    'autosave status is 200': (r) => r.status === 200,
    'no OCC conflict (409)': (r) => r.status !== 409,
    'no auth error (401/403)': (r) => r.status !== 401 && r.status !== 403
  });

  if (isSuccess) {
    try {
      const body = res.json();
      if (body && body.data && typeof body.data.revision === 'number') {
        vuQuestionRevisions[vuKey][qId] = body.data.revision;
      } else {
        vuQuestionRevisions[vuKey][qId] = currentExpectedRev + 1;
      }
    } catch {
      vuQuestionRevisions[vuKey][qId] = currentExpectedRev + 1;
    }
  }

  // Realistic human pacing with jitter (between 5s and 10s per candidate save)
  const pacingSec = __ENV.PACING ? parseFloat(__ENV.PACING) : randomInt(5, 10);
  sleep(pacingSec);
}
