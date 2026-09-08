/**
 * @file proctoring-telemetry.js
 * @description k6 load scenario simulating candidate proctoring telemetry event ingestion
 * with HMAC-SHA256 signature and periodic keepalive heartbeats.
 *
 * Usage:
 *   k6 run scripts/load/k6/proctoring-telemetry.js
 *   k6 run -e VUS=25 -e DURATION=15s scripts/load/k6/proctoring-telemetry.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  BASE_URL,
  generateAntiTamperHeader,
  generateUUID,
  getCandidateForVU,
  loginCandidate,
  getAttemptContext
} from './k6-helpers.js';

// Load fixture data at initialization stage
const fixturesRaw = open('../fixtures/benchmark-fixtures.json');
const fixtures = JSON.parse(fixturesRaw);

const targetVUs = parseInt(__ENV.VUS || '25', 10);
const duration = __ENV.DURATION || '15s';

export const options = {
  scenarios: {
    telemetry_stream: {
      executor: 'constant-vus',
      vus: targetVUs,
      duration: duration,
      gracefulStop: '5s'
    }
  },
  thresholds: {
    'http_req_duration{name:POST /api/v1/attempts/:id/events}': ['p(95)<1000'],
    http_req_failed: ['rate<0.10'],
    'telemetry_success_rate': ['rate>0.90']
  }
};

const telemetrySuccessRate = new Rate('telemetry_success_rate');
const telemetryDuration = new Trend('telemetry_duration_ms', true);

let vuToken = null;
let vuSigningKey = null;

export default function () {
  const candidate = getCandidateForVU(fixtures.candidates, __VU);

  if (!vuToken) {
    try {
      const auth = loginCandidate(candidate.email, __ENV.BENCHMARK_PASSWORD || 'BenchPass#123!', BASE_URL);
      vuToken = auth.token;
      const ctx = getAttemptContext(vuToken, candidate.attemptId, BASE_URL);
      vuSigningKey = ctx.antiTamperToken;
    } catch (err) {
      telemetrySuccessRate.add(false);
      sleep(1);
      return;
    }
  }

  const eventPath = `/api/v1/attempts/${candidate.attemptId}/events`;
  const eventPayloadObj = {
    events: [
      {
        eventId: generateUUID(),
        eventType: 'PERIODIC_HEARTBEAT',
        clientTimestamp: new Date().toISOString(),
        metadata: { tab_focus: true, battery_level: 0.95 }
      }
    ]
  };

  const { header: eventAntiTamper, bodyStr: eventBodyStr } = generateAntiTamperHeader(
    vuSigningKey,
    'POST',
    eventPath,
    eventPayloadObj
  );

  const startMs = Date.now();
  const res = http.post(`${BASE_URL}${eventPath}`, eventBodyStr, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vuToken}`,
      'X-Anti-Tamper': eventAntiTamper
    },
    tags: { name: 'POST /api/v1/attempts/:id/events' }
  });

  const durationMs = Date.now() - startMs;
  telemetryDuration.add(durationMs);

  const isSuccess = res.status === 200 || res.status === 201;
  telemetrySuccessRate.add(isSuccess);

  check(res, {
    'telemetry accepted (200/201)': () => isSuccess
  });

  sleep(1);
}
