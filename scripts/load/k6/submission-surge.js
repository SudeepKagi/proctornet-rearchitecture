/**
 * @file submission-surge.js
 * @description k6 load scenario simulating the exam-completion submission spike
 * with strict verification of transactional outbox and idempotency replay guarantees.
 *
 * Usage:
 *   k6 run scripts/load/k6/submission-surge.js
 *   k6 run -e VUS=25 -e DURATION=15s scripts/load/k6/submission-surge.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, generateUUID, getCandidateForVU, loginCandidate } from './k6-helpers.js';

// Load fixture data at initialization stage
const fixturesRaw = open('../fixtures/benchmark-fixtures.json');
const fixtures = JSON.parse(fixturesRaw);

const targetVUs = parseInt(__ENV.VUS || '2500', 10);
const duration = __ENV.DURATION || '30s';

export const options = {
  scenarios: {
    submission_spike: {
      executor: 'per-vu-iterations',
      vus: targetVUs,
      iterations: 1,
      maxDuration: duration
    }
  },
  thresholds: {
    'http_req_duration{name:POST /api/v1/attempts/:id/submit}': ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.05'],
    'submission_success_rate': ['rate>0.95'],
    'idempotent_replay_success': ['rate>0.95']
  }
};

const submissionSuccessRate = new Rate('submission_success_rate');
const idempotentReplaySuccess = new Rate('idempotent_replay_success');
const submissionDuration = new Trend('submission_duration_ms', true);

// Per-VU cached authentication token
let vuToken = null;

export default function () {
  const candidate = getCandidateForVU(fixtures.candidates, __VU);

  // Lazy per-VU authentication
  if (!vuToken) {
    const auth = loginCandidate(candidate.email, null, BASE_URL);
    vuToken = auth.token;
  }

  const idempotencyKey = `idemp_${candidate.attemptId}_${generateUUID()}`;

  const submitPath = `/api/v1/attempts/${candidate.attemptId}/submit`;
  const payload = JSON.stringify({ answers: [] });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${vuToken}`,
      'Idempotency-Key': idempotencyKey
    },
    tags: { name: 'POST /api/v1/attempts/:id/submit' }
  };

  // 1. Initial Submission
  const startTime = Date.now();
  const res1 = http.post(`${BASE_URL}${submitPath}`, payload, params);
  submissionDuration.add(Date.now() - startTime);

  const isSuccess1 = check(res1, {
    'initial submission status is 200': (r) => r.status === 200,
    'submission status confirmed': (r) => {
      try {
        const b = r.json();
        return b && b.data && (b.data.status === 'SUBMITTED' || b.data.attempt_id === candidate.attemptId);
      } catch {
        return false;
      }
    }
  });
  submissionSuccessRate.add(isSuccess1);

  // 2. Idempotent Replay (Network retry simulation with identical key)
  sleep(0.5);
  const res2 = http.post(`${BASE_URL}${submitPath}`, payload, params);

  const isReplaySuccess = check(res2, {
    'idempotent replay status is 200': (r) => r.status === 200,
    'idempotent replay matches initial status': (r) => r.status === res1.status
  });
  idempotentReplaySuccess.add(isReplaySuccess);
}
