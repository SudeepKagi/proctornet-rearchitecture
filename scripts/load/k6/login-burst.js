/**
 * @file login-burst.js
 * @description k6 load scenario simulating candidate authentication surge (2,500 candidates over 2 minutes).
 *
 * Usage:
 *   k6 run scripts/load/k6/login-burst.js
 *   k6 run -e VUS=25 -e RAMP=5s -e HOLD=10s scripts/load/k6/login-burst.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, getCandidateForVU } from './k6-helpers.js';

// Load fixture data at initialization stage
const fixturesRaw = open('../fixtures/benchmark-fixtures.json');
const fixtures = JSON.parse(fixturesRaw);

const targetVUs = parseInt(__ENV.VUS || '2500', 10);
const rampDuration = __ENV.RAMP || '2m';
const holdDuration = __ENV.HOLD || '1m';

export const options = {
  scenarios: {
    login_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: rampDuration, target: targetVUs },
        { duration: holdDuration, target: targetVUs },
        { duration: '30s', target: 0 }
      ],
      gracefulRampDown: '10s'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
    http_req_failed: ['rate<0.01'],
    'login_success_rate': ['rate>0.99']
  }
};

const loginSuccessRate = new Rate('login_success_rate');
const loginDuration = new Trend('login_duration_ms', true);

export default function () {
  const candidate = getCandidateForVU(fixtures.candidates, __VU);

  const payload = JSON.stringify({
    email: candidate.email,
    password: 'Password123!'
  });

  const params = {
    headers: {
      'Content-Type': 'application/json'
    },
    tags: { name: 'POST /api/v1/auth/login' }
  };

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, params);
  loginDuration.add(Date.now() - startTime);

  const isSuccess = check(res, {
    'login status is 200': (r) => r.status === 200,
    'access token present': (r) => {
      try {
        const body = r.json();
        return body && body.data && (typeof body.data.accessToken === 'string' || (body.data.tokens && typeof body.data.tokens.accessToken === 'string'));
      } catch {
        return false;
      }
    }
  });

  loginSuccessRate.add(isSuccess);

  // Pacing between candidate retries / interactions
  sleep(1);
}
