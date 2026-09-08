/**
 * @file pool-saturation.js
 * @description k6 load scenario testing PostgreSQL connection pool saturation limits,
 * connection acquisition queuing, and response latency degradation under high concurrency.
 *
 * Usage:
 *   k6 run scripts/load/k6/pool-saturation.js
 *   k6 run -e VUS=50 -e DURATION=30s scripts/load/k6/pool-saturation.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, getCandidateForVU } from './k6-helpers.js';

const fixturesRaw = open('../fixtures/benchmark-fixtures.json');
const fixtures = JSON.parse(fixturesRaw);

const targetVUs = parseInt(__ENV.VUS || '50', 10);
const duration = __ENV.DURATION || '30s';

export const options = {
  scenarios: {
    pool_stress: {
      executor: 'constant-vus',
      vus: targetVUs,
      duration: duration,
      gracefulStop: '10s'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.02'],
    'pool_req_success_rate': ['rate>0.98']
  }
};

const poolReqSuccessRate = new Rate('pool_req_success_rate');
const reqDuration = new Trend('pool_req_duration_ms', true);

export default function () {
  const candidate = getCandidateForVU(fixtures.candidates, __VU);

  // Read answers for candidate attempt (hits database pool directly)
  const answersPath = `/api/v1/attempts/${candidate.attemptId}/answers`;
  const params = {
    headers: {
      'Authorization': `Bearer ${candidate.token}`
    },
    tags: { name: 'GET /api/v1/attempts/:id/answers' }
  };

  const t0 = Date.now();
  const res = http.get(`${BASE_URL}${answersPath}`, params);
  reqDuration.add(Date.now() - t0);

  const isSuccess = check(res, {
    'pool read query status is 200': (r) => r.status === 200
  });

  poolReqSuccessRate.add(isSuccess);
  sleep(0.2);
}
