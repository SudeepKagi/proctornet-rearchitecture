/**
 * @file antiTamper.test.js
 * @description Comprehensive security tests for Phase 18 Cryptographic Anti-Tampering,
 * Request Signing, Replay Prevention, Redis Fail-Closed, and Development Fallback.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';

import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { getRedisClient, closeRedis } from '../../src/infrastructure/redis/client.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';
import {
  deriveAttemptSigningKey,
  computePayloadSignature,
  canonicalizeBody,
  computeBodySha256
} from '../../src/utils/antiTamper.js';
import { resetInMemoryNonceCache } from '../../src/middleware/antiTamper.js';

describe('Phase 18 Security: Cryptographic Anti-Tamper & Replay Defense', () => {
  let studentUser;
  let studentToken;
  let exam;
  let session;
  let attempt;
  let question;
  let aq;
  let signingKey;

  before(async () => {
    process.env.ENFORCE_ANTI_TAMPER = 'true';

    // 1. Register candidate
    const student = await authService.register({
      name: 'Anti-Tamper Candidate',
      email: `antitamper_${Date.now()}@proctornet.test`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student.userId]);
    const login = await authService.login({ email: student.email, password: 'Password123!' });
    studentToken = login.accessToken;
    studentUser = { userId: student.userId, roles: ['STUDENT'] };

    // 2. Register faculty and create exam
    const faculty = await authService.register({
      name: 'Anti-Tamper Faculty',
      email: `faculty_at_${Date.now()}@proctornet.test`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    const facultyUser = { userId: faculty.userId, roles: ['FACULTY'] };

    const subjectRes = await query(
      `INSERT INTO subjects (code, name, description)
       VALUES ($1, 'Security Test Subject', 'Testing anti-tamper')
       RETURNING *;`,
      [`SEC-${Date.now()}`]
    );
    const subject = subjectRes.rows[0];

    const topicRes = await query(
      `INSERT INTO topics (subject_id, name, description)
       VALUES ($1, 'Cryptographic Integrity', 'Testing HMAC signatures')
       RETURNING *;`,
      [subject.subject_id]
    );
    const topic = topicRes.rows[0];

    const qRes = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'MCQ', 'What algorithm is used for anti-tamper signing?', 5.00)
       RETURNING *;`,
      [topic.topic_id]
    );
    question = qRes.rows[0];

    await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
       VALUES 
         ($1, 'HMAC-SHA256', true, 0),
         ($1, 'MD5', false, 1);`,
      [question.question_id]
    );

    exam = await examService.createExam({
      title: 'Anti-Tamper Security Exam',
      description: 'Testing HMAC request signing and replay defenses',
      subject_id: subject.subject_id,
      duration_minutes: 60,
      total_marks: 5.00,
      passing_marks: 2.50
    }, faculty.userId);

    await examService.configureTopicRule(exam.exam_id, {
      topic_id: topic.topic_id,
      question_count: 1,
      points_per_question: 5.00
    }, facultyUser);

    await examService.publishExam(exam.exam_id, facultyUser);

    // 3. Create Room & Session & assign candidate
    const roomRes = await query(
      `INSERT INTO rooms (name, capacity, building)
       VALUES ($1, 30, 'Security Lab')
       RETURNING *;`,
      [`Room-SEC-${Date.now()}`]
    );
    const room = roomRes.rows[0];

    const now = new Date();
    const startTime = new Date(now.getTime() - 5 * 60 * 1000);
    const endTime = new Date(now.getTime() + 120 * 60 * 1000);

    const sessionRes = await query(
      `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING *;`,
      [exam.exam_id, room.room_id, startTime.toISOString(), endTime.toISOString()]
    );
    session = sessionRes.rows[0];

    await query(
      `INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, 'ASSIGNED');`,
      [session.session_id, studentUser.userId]
    );

    // 4. Start attempt
    attempt = await attemptService.startAttempt(session.session_id, studentUser);

    // Derive expected signing key
    signingKey = deriveAttemptSigningKey(
      config.ANTI_TAMPER_SECRET,
      attempt.attempt_id,
      studentUser.userId,
      attempt.started_at
    );

    // Verify token returned in startAttempt matches
    assert.equal(attempt.anti_tamper_token, signingKey);

    const attemptData = await attemptService.getAttemptQuestions(attempt.attempt_id, studentUser);
    aq = attemptData.questions[0];
  });

  after(async () => {
    delete process.env.ENFORCE_ANTI_TAMPER;
    await closeRedis();
    await closePool();
  });

  beforeEach(() => {
    resetInMemoryNonceCache();
  });

  it('should accept a mutating request with a valid HMAC-SHA256 signature', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;
    const method = 'PUT';
    const body = {
      answer_value: { selected_option_id: aq.options[0].option_id },
      expected_revision: 0
    };

    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const signature = computePayloadSignature(signingKey, timestamp, nonce, method, path, body);
    const signatureHeader = `t=${timestamp},nonce=${nonce},v1=${signature}`;

    const res = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Payload-Signature', signatureHeader)
      .send(body);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.revision, 1);
  });

  it('should reject requests missing the X-Payload-Signature header with 400', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;

    const res = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        answer_value: { selected_option_id: aq.options[0].option_id },
        expected_revision: 1
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'ERR_SIGNATURE_MISSING');
  });

  it('should reject malformed signature header formats with 400', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;

    const res = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Payload-Signature', 'invalid-header-format')
      .send({
        answer_value: { selected_option_id: aq.options[0].option_id },
        expected_revision: 1
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'ERR_SIGNATURE_INVALID_FORMAT');
  });

  it('should reject expired signatures with excessive clock drift (> 5 minutes)', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;
    const method = 'PUT';
    const body = {
      answer_value: { selected_option_id: aq.options[0].option_id },
      expected_revision: 1
    };

    const expiredTimestamp = Date.now() - 400000; // 6.6 minutes ago
    const nonce = crypto.randomUUID();
    const signature = computePayloadSignature(signingKey, expiredTimestamp, nonce, method, path, body);
    const signatureHeader = `t=${expiredTimestamp},nonce=${nonce},v1=${signature}`;

    const res = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Payload-Signature', signatureHeader)
      .send(body);

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ERR_SIGNATURE_EXPIRED');
  });

  it('should reject tampered request payloads where body was modified in transit', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;
    const method = 'PUT';

    const originalBody = {
      answer_value: { selected_option_id: aq.options[0].option_id },
      expected_revision: 1
    };

    const tamperedBody = {
      answer_value: { selected_option_id: aq.options[1].option_id },
      expected_revision: 1
    };

    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    // Signature computed on originalBody
    const signature = computePayloadSignature(signingKey, timestamp, nonce, method, path, originalBody);
    const signatureHeader = `t=${timestamp},nonce=${nonce},v1=${signature}`;

    // But sending tamperedBody!
    const res = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Payload-Signature', signatureHeader)
      .send(tamperedBody);

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ERR_SIGNATURE_INVALID');
  });

  it('should reject signatures computed with invalid/wrong attempt key', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;
    const method = 'PUT';
    const body = {
      answer_value: { selected_option_id: aq.options[0].option_id },
      expected_revision: 1
    };

    const wrongKey = crypto.createHmac('sha256', 'wrong-secret').update('fake-message').digest('hex');
    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const signature = computePayloadSignature(wrongKey, timestamp, nonce, method, path, body);
    const signatureHeader = `t=${timestamp},nonce=${nonce},v1=${signature}`;

    const res = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Payload-Signature', signatureHeader)
      .send(body);

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ERR_SIGNATURE_INVALID');
  });

  it('should detect and reject replayed nonces with 409 Conflict', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;
    const method = 'PUT';
    const body = {
      answer_value: { selected_option_id: aq.options[1].option_id },
      expected_revision: 1
    };

    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const signature = computePayloadSignature(signingKey, timestamp, nonce, method, path, body);
    const signatureHeader = `t=${timestamp},nonce=${nonce},v1=${signature}`;

    // 1st request succeeds
    const res1 = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Payload-Signature', signatureHeader)
      .send(body);

    assert.equal(res1.status, 200);

    // 2nd request with the EXACT SAME nonce fails with 409 Conflict
    const res2 = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Payload-Signature', signatureHeader)
      .send(body);

    assert.equal(res2.status, 409);
    assert.equal(res2.body.code, 'ERR_REPLAY_DETECTED');
  });

  it('should handle concurrent duplicate nonces atomically rejecting duplicates', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;
    const method = 'PUT';
    const body = {
      answer_value: { selected_option_id: aq.options[0].option_id },
      expected_revision: 2
    };

    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const signature = computePayloadSignature(signingKey, timestamp, nonce, method, path, body);
    const signatureHeader = `t=${timestamp},nonce=${nonce},v1=${signature}`;

    const [resA, resB] = await Promise.all([
      request(app)
        .put(path)
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Payload-Signature', signatureHeader)
        .send(body),
      request(app)
        .put(path)
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Payload-Signature', signatureHeader)
        .send(body)
    ]);

    const statuses = [resA.status, resB.status];
    assert.ok(statuses.includes(200), 'One request must succeed');
    assert.ok(statuses.includes(409), 'One request must be rejected as replay');
  });

  it('should support answer retry idempotency with fresh nonce and timestamp', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;
    const method = 'PUT';
    const body = {
      answer_value: { selected_option_id: aq.options[0].option_id },
      expected_revision: 2
    };

    // Retry request has identical payload but fresh timestamp & fresh nonce
    const retryTimestamp = Date.now() + 50;
    const retryNonce = crypto.randomUUID();
    const retrySig = computePayloadSignature(signingKey, retryTimestamp, retryNonce, method, path, body);
    const retryHeader = `t=${retryTimestamp},nonce=${retryNonce},v1=${retrySig}`;

    const retryRes = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Payload-Signature', retryHeader)
      .send(body);

    // Business idempotency recognizes same answer payload and returns 200 without error
    assert.equal(retryRes.status, 200);
    assert.equal(retryRes.body.data.revision, 3);
  });

  it('should fail closed with 503 when Redis is down in production environment', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;
    const method = 'PUT';
    const body = {
      answer_value: { selected_option_id: aq.options[1].option_id },
      expected_revision: 3
    };

    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const signature = computePayloadSignature(signingKey, timestamp, nonce, method, path, body);
    const signatureHeader = `t=${timestamp},nonce=${nonce},v1=${signature}`;

    // Temporarily simulate production environment & simulate Redis failure
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const redis = getRedisClient();
    const originalSet = redis.set;
    redis.set = async () => {
      throw new Error('Connection to Redis lost');
    };

    try {
      const res = await request(app)
        .put(path)
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Payload-Signature', signatureHeader)
        .send(body);

      assert.equal(res.status, 503);
      assert.equal(res.body.code, 'ERR_REPLAY_SERVICE_UNAVAILABLE');
      assert.equal(res.headers['retry-after'], '5');
    } finally {
      process.env.NODE_ENV = originalEnv;
      redis.set = originalSet;
    }
  });

  it('should allow in-memory LRU fallback when Redis is down in development/test', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/answers/${aq.attempt_question_id}`;
    const method = 'PUT';
    const body = {
      answer_value: { selected_option_id: aq.options[1].option_id },
      expected_revision: 3
    };

    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const signature = computePayloadSignature(signingKey, timestamp, nonce, method, path, body);
    const signatureHeader = `t=${timestamp},nonce=${nonce},v1=${signature}`;

    const redis = getRedisClient();
    const originalSet = redis.set;
    redis.set = async () => {
      throw new Error('Simulated Redis outage');
    };

    try {
      // In non-production with ALLOW_IN_MEMORY_NONCE_FALLBACK=true
      assert.equal(config.ALLOW_IN_MEMORY_NONCE_FALLBACK, true);
      const res = await request(app)
        .put(path)
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Payload-Signature', signatureHeader)
        .send(body);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.revision, 4);

      // Verify that replay is STILL caught by the in-memory fallback cache!
      const replayRes = await request(app)
        .put(path)
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Payload-Signature', signatureHeader)
        .send(body);

      assert.equal(replayRes.status, 409);
      assert.equal(replayRes.body.code, 'ERR_REPLAY_DETECTED');
    } finally {
      redis.set = originalSet;
    }
  });

  it('should protect POST /:attemptId/events with anti-tamper signature and reject unauthenticated / tampered telemetry', async () => {
    const path = `/api/v1/attempts/${attempt.attempt_id}/events`;
    const method = 'POST';
    const body = {
      events: [
        {
          eventId: crypto.randomUUID(),
          eventType: 'WINDOW_BLUR',
          clientTimestamp: new Date().toISOString(),
          metadata: { windowFocused: false }
        }
      ]
    };

    // 1. Missing signature -> 400
    const resNoSig = await request(app)
      .post(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .send(body);
    assert.equal(resNoSig.status, 400);
    assert.equal(resNoSig.body.code, 'ERR_SIGNATURE_MISSING');

    // 2. Valid signature -> 200/201
    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const signature = computePayloadSignature(signingKey, timestamp, nonce, method, path, body);
    const signatureHeader = `t=${timestamp},nonce=${nonce},v1=${signature}`;

    const resValid = await request(app)
      .post(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Payload-Signature', signatureHeader)
      .send(body);
    assert.ok([200, 201].includes(resValid.status));

    // 3. Replayed nonce -> 409
    const resReplay = await request(app)
      .post(path)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Payload-Signature', signatureHeader)
      .send(body);
    assert.equal(resReplay.status, 409);
    assert.equal(resReplay.body.code, 'ERR_REPLAY_DETECTED');
  });
});
