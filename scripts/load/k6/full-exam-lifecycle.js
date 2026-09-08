/**
 * @file full-exam-lifecycle.js
 * @description End-to-end composite load scenario modeling the full candidate journey:
 * authentication, question retrieval, anti-tampered autosaves, telemetry pings,
 * and idempotent final submission.
 *
 * Usage:
 *   k6 run scripts/load/k6/full-exam-lifecycle.js
 *   k6 run -e VUS=10 -e ITERATIONS=1 scripts/load/k6/full-exam-lifecycle.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  BASE_URL,
  BENCHMARK_PASSWORD,
  generateAntiTamperHeader,
  generateUUID,
  getCandidateForVU,
  randomChoice,
  randomInt,
  loginCandidate,
  getAttemptContext,
  startAttempt
} from './k6-helpers.js';

// Load fixture data at initialization stage
const fixturesRaw = open('../fixtures/benchmark-fixtures.json');
const fixtures = JSON.parse(fixturesRaw);

const targetVUs = parseInt(__ENV.VUS || '100', 10);
const numIterations = parseInt(__ENV.ITERATIONS || '1', 10);

export const options = {
  scenarios: {
    lifecycle: {
      executor: 'per-vu-iterations',
      vus: targetVUs,
      iterations: numIterations,
      maxDuration: '10m'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.02'],
    'lifecycle_success_rate': ['rate>0.98']
  }
};

const lifecycleSuccessRate = new Rate('lifecycle_success_rate');
const lifecycleDuration = new Trend('lifecycle_total_duration_ms', true);

export default function () {
  const startLifecycle = Date.now();
  const candidate = getCandidateForVU(fixtures.candidates, __VU);
  let userToken = null;
  let attemptId = candidate.attemptId;
  let signingKey = null;
  let questions = candidate.attemptQuestions || [];
  let allStepsPassed = true;

  // Step 1: Authentication / Session Check
  group('1. Authentication Verification', () => {
    try {
      const auth = loginCandidate(candidate.email, BENCHMARK_PASSWORD, BASE_URL);
      userToken = auth.token;
    } catch (err) {
      allStepsPassed = false;
      return;
    }
  });

  if (!userToken) {
    lifecycleSuccessRate.add(false);
    return;
  }

  // Step 2: Attempt Initialization (Start Attempt if not pre-seeded)
  group('2. Attempt Start or Retrieve', () => {
    try {
      if (!attemptId) {
        // Mode B: Real Lifecycle startup
        const started = startAttempt(userToken, fixtures.sessionId, BASE_URL);
        attemptId = started.attemptId;
        signingKey = started.antiTamperToken;
        const qRes = http.get(`${BASE_URL}/api/v1/attempts/${attemptId}/questions`, {
          headers: { Authorization: `Bearer ${userToken}` }
        });
        if (qRes.status === 200) {
          questions = qRes.json('data.questions') || [];
        }
      } else {
        // Mode A: Prepared Attempt retrieval
        const ctx = getAttemptContext(userToken, attemptId, BASE_URL);
        signingKey = ctx.antiTamperToken;
        if (ctx.questions && ctx.questions.length > 0) {
          questions = ctx.questions;
        }
      }
    } catch (err) {
      console.log(`[start or retrieve error] ${err.message}`);
      allStepsPassed = false;
      return;
    }
  });

  if (!attemptId || !signingKey) {
    lifecycleSuccessRate.add(false);
    return;
  }

  sleep(1);

  // Step 3: Answer Questions with Anti-Tamper Signatures
  group('3. Question Answering & Autosave Stream', () => {
    const questionsToAnswer = questions.slice(0, 5); // Answer up to 5 questions in lifecycle test
    let revMap = {};

    for (const q of questionsToAnswer) {
      const qId = q.attempt_question_id || q.attemptQuestionId;
      const qType = q.question_type || q.questionType;
      const expectedRev = revMap[qId] || 0;

      let answerVal = {};
      if (qType === 'NUMERIC') {
        answerVal = { numeric_value: 42.5 };
      } else if (q.options && q.options.length > 0) {
        answerVal = { selected_option_id: q.options[0].option_id };
      } else {
        answerVal = { text_value: 'Candidate answer' };
      }

      const path = `/api/v1/attempts/${attemptId}/answers/${qId}`;
      const payloadObj = {
        answer_value: answerVal,
        expected_revision: expectedRev
      };

      const { header: antiTamperHeader, bodyStr } = generateAntiTamperHeader(
        signingKey,
        'PUT',
        path,
        payloadObj
      );

      const saveRes = http.put(`${BASE_URL}${path}`, bodyStr, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
          'X-Anti-Tamper': antiTamperHeader
        },
        tags: { name: 'PUT /api/v1/attempts/:id/answers/:qid' }
      });

      const ok = check(saveRes, {
        'autosave ok (200)': (r) => r.status === 200
      });
      if (!ok) allStepsPassed = false;

      if (saveRes.status === 200) {
        try {
          revMap[qId] = saveRes.json('data.revision') || (expectedRev + 1);
        } catch {
          revMap[qId] = expectedRev + 1;
        }
      }

      // Small think time between questions
      sleep(0.5);
    }
  });

  // Step 4: Final Submission & Idempotent Replay
  group('4. Final Submission & Idempotency Replay', () => {
    const idempotencyKey = `lifecycle_${attemptId}_${generateUUID()}`;
    const submitPath = `/api/v1/attempts/${attemptId}/submit`;
    const submitPayload = JSON.stringify({ answers: [] });
    const submitHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
      'Idempotency-Key': idempotencyKey
    };

    // Primary Submission
    const submitRes = http.post(`${BASE_URL}${submitPath}`, submitPayload, {
      headers: submitHeaders,
      tags: { name: 'POST /api/v1/attempts/:id/submit' }
    });

    const submitOk = check(submitRes, {
      'submit ok (200)': (r) => r.status === 200
    });
    if (!submitOk) allStepsPassed = false;

    // Idempotent Replay
    const replayRes = http.post(`${BASE_URL}${submitPath}`, submitPayload, {
      headers: submitHeaders,
      tags: { name: 'POST /api/v1/attempts/:id/submit (replay)' }
    });

    const replayOk = check(replayRes, {
      'replay ok (200)': (r) => r.status === 200
    });
    if (!replayOk) allStepsPassed = false;
  });

  lifecycleDuration.add(Date.now() - startLifecycle);
  lifecycleSuccessRate.add(allStepsPassed);
}
