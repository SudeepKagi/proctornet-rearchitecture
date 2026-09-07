/**
 * @file submissionApi.test.js
 * @description REST API end-to-end integration tests for POST /api/v1/attempts/:attemptId/submit:
 * - Mandatory Idempotency-Key validation (missing, blank, length limit)
 * - Authentication & Role authorization (STUDENT only, rejects FACULTY/ADMIN)
 * - BOLA authorization defense
 * - URL parameter validation (UUID check)
 * - Successful ACTIVE -> SUBMITTED transition
 * - Idempotent replay with identical key and payload
 * - 409 IDEMPOTENCY_KEY_REUSE on modified payload
 * - 409 ATTEMPT_ALREADY_SUBMITTED on different key
 * - Final dirty answer persistence
 * - 409 ATTEMPT_EXPIRED on deadline elapsed
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';

describe('Submissions REST API Endpoints (Integration)', () => {
  let facultyUser;
  let facultyToken;
  let adminToken;
  let exam;
  let activeSession;
  let opt1A;
  let opt1B;

  /**
   * Helper to create and authenticate a new student, enroll them in activeSession, and start an attempt
   */
  async function createStudentWithAttempt() {
    const student = await authService.register({
      name: `Student API ${Date.now()} ${Math.random()}`,
      email: `student_api_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student.userId]);
    const studentUser = { userId: student.userId, roles: ['STUDENT'] };
    const loginRes = await authService.login({ email: student.email, password: 'Password123!' });
    const token = loginRes.accessToken;

    await query(
      `INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, 'ASSIGNED') ON CONFLICT DO NOTHING;`,
      [activeSession.session_id, student.userId]
    );

    const attempt = await attemptService.startAttempt(activeSession.session_id, studentUser);

    return { studentUser, token, attempt };
  }

  before(async () => {
    // 1. Create Faculty & Admin
    const faculty = await authService.register({
      name: 'Faculty Submissions API',
      email: `faculty_sub_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY'] };
    const facLogin = await authService.login({ email: faculty.email, password: 'Password123!' });
    facultyToken = facLogin.accessToken;

    const admin = await authService.register({
      name: 'Admin Submissions API',
      email: `admin_sub_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING;`, [admin.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [admin.userId]);
    const adminLogin = await authService.login({ email: admin.email, password: 'Password123!' });
    adminToken = adminLogin.accessToken;

    // 2. Create Subject and Topic
    const subjectRes = await query(
      `INSERT INTO subjects (code, name, description) VALUES ($1, 'CS-SUB-API', 'Submissions API tests') RETURNING *;`,
      [`CS-SUB-API-${Date.now()}`]
    );
    const subject = subjectRes.rows[0];

    const topicRes = await query(
      `INSERT INTO topics (subject_id, name) VALUES ($1, 'Submissions API Topic') RETURNING *;`,
      [subject.subject_id]
    );
    const topic = topicRes.rows[0];

    // 3. Create MCQ Question
    const qRes = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'MCQ', 'API Question 1', 2.00) RETURNING *;`,
      [topic.topic_id]
    );
    const question = qRes.rows[0];

    const optRes = await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
       VALUES ($1, 'Wrong', false, 0), ($1, 'Right', true, 1)
       RETURNING *;`,
      [question.question_id]
    );
    opt1A = optRes.rows.find((o) => !o.is_correct);
    opt1B = optRes.rows.find((o) => o.is_correct);

    // 4. Create & Publish Exam
    exam = await examService.createExam(
      {
        title: 'Submissions API Test Exam',
        subject_id: subject.subject_id,
        duration_minutes: 60,
        total_marks: 2.00,
        passing_marks: 1.00
      },
      facultyUser.userId
    );

    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: topic.topic_id,
        difficulty: 'EASY',
        question_count: 1,
        points_per_question: 2.00
      },
      facultyUser
    );

    await examService.publishExam(exam.exam_id, facultyUser);

    // 5. Create Room & Session
    const roomRes = await query(`INSERT INTO rooms (name, capacity) VALUES ($1, 50) RETURNING *;`, [`Room-Sub-API-${Date.now()}`]);
    const room = roomRes.rows[0];

    const now = new Date();
    const startTime = new Date(now.getTime() - 5 * 60000);
    const endTime = new Date(now.getTime() + 60 * 60000);

    const sessionRes = await query(
      `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING *;`,
      [exam.exam_id, room.room_id, startTime.toISOString(), endTime.toISOString()]
    );
    activeSession = sessionRes.rows[0];
  });

  after(async () => {
    // Small delay to let any background setImmediate outbox triggers finish
    await new Promise((resolve) => setTimeout(resolve, 200));
    await closePool();
  });

  it('should return 401 Unauthorized if request has no Bearer token', async () => {
    const res = await request(app)
      .post(`/api/v1/attempts/${randomUUID()}/submit`)
      .set('Idempotency-Key', 'some-key')
      .send({});

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  it('should return 403 Forbidden if non-student (FACULTY or ADMIN) attempts to submit', async () => {
    const { attempt } = await createStudentWithAttempt();

    const facultyRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .set('Idempotency-Key', 'faculty-sub-key')
      .send({});

    assert.equal(facultyRes.status, 403);
    assert.match(facultyRes.body.error.message, /STUDENT/);

    const adminRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'admin-sub-key')
      .send({});

    assert.equal(adminRes.status, 403);
  });

  it('should return 400 Bad Request if Idempotency-Key header is missing', async () => {
    const { token, attempt } = await createStudentWithAttempt();

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.details, 'MISSING_IDEMPOTENCY_KEY');
  });

  it('should return 400 Bad Request if Idempotency-Key header is blank or whitespace', async () => {
    const { token, attempt } = await createStudentWithAttempt();

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', '    ')
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error.details, 'MISSING_IDEMPOTENCY_KEY');
  });

  it('should return 400 Bad Request if Idempotency-Key exceeds 255 characters', async () => {
    const { token, attempt } = await createStudentWithAttempt();

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'a'.repeat(256))
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error.details, 'INVALID_IDEMPOTENCY_KEY');
  });

  it('should return 400 Bad Request if attemptId param is not a valid UUID', async () => {
    const { token } = await createStudentWithAttempt();

    const res = await request(app)
      .post(`/api/v1/attempts/not-a-valid-uuid/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'key-uuid-test')
      .send({});

    assert.equal(res.status, 400);
  });

  it('should return 403 Forbidden if Student A attempts to submit Student B attempt (BOLA check)', async () => {
    const { attempt } = await createStudentWithAttempt();
    const other = await createStudentWithAttempt();

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${other.token}`)
      .set('Idempotency-Key', 'key-bola')
      .send({});

    assert.equal(res.status, 403);
    assert.match(res.body.error.message, /cannot submit another candidate/);
  });

  it('should return 200 OK on successful submission and return expected schema', async () => {
    const { token, attempt } = await createStudentWithAttempt();
    const idempotencyKey = `key-${randomUUID()}`;

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({});

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.attempt_id, attempt.attempt_id);
    assert.equal(res.body.data.status, 'SUBMITTED');
    assert.ok(res.body.data.submitted_at);
    assert.ok(res.body.data.server_time);
    assert.match(res.body.data.message, /submitted successfully/);
  });

  it('should return 200 OK on idempotent replay with same key and payload', async () => {
    const { token, attempt } = await createStudentWithAttempt();
    const idempotencyKey = `key-${randomUUID()}`;

    const res1 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({});

    assert.equal(res1.status, 200);

    const res2 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({});

    assert.equal(res2.status, 200);
    assert.deepEqual(res1.body.data, res2.body.data);
  });

  it('should return 409 Conflict with IDEMPOTENCY_KEY_REUSE if same key sent with modified payload', async () => {
    const { token, attempt } = await createStudentWithAttempt();
    const idempotencyKey = `key-${randomUUID()}`;

    const res1 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({});

    assert.equal(res1.status, 200);

    const res2 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        answers: [
          {
            attempt_question_id: randomUUID(),
            expected_revision: 0,
            answer_value: { selected_option_id: opt1A.option_id }
          }
        ]
      });

    assert.equal(res2.status, 409);
    assert.equal(res2.body.error.code, 'IDEMPOTENCY_KEY_REUSE');
  });

  it('should return 409 Conflict with ATTEMPT_ALREADY_SUBMITTED if different key sent on submitted attempt', async () => {
    const { token, attempt } = await createStudentWithAttempt();
    const key1 = `key-${randomUUID()}`;
    const key2 = `key-${randomUUID()}`;

    const res1 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key1)
      .send({});

    assert.equal(res1.status, 200);

    const res2 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key2)
      .send({});

    assert.equal(res2.status, 409);
    assert.equal(res2.body.error.code, 'ATTEMPT_ALREADY_SUBMITTED');
  });

  it('should return 200 OK and persist final dirty answers submitted alongside attempt', async () => {
    const { token, attempt } = await createStudentWithAttempt();
    const qRes = await query(`SELECT attempt_question_id FROM attempt_questions WHERE attempt_id = $1;`, [attempt.attempt_id]);
    const attemptQuestionId = qRes.rows[0].attempt_question_id;

    const idempotencyKey = `key-${randomUUID()}`;
    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        answers: [
          {
            attempt_question_id: attemptQuestionId,
            expected_revision: 0,
            answer_value: { selected_option_id: opt1B.option_id }
          }
        ]
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'SUBMITTED');

    // Verify answer row in database
    const ansRes = await query(`SELECT revision, answer_value FROM answers WHERE attempt_question_id = $1;`, [attemptQuestionId]);
    assert.equal(ansRes.rows.length, 1);
    assert.equal(ansRes.rows[0].revision, 1);
    assert.equal(ansRes.rows[0].answer_value.selected_option_id, opt1B.option_id);
  });

  it('should return 409 Conflict with ATTEMPT_EXPIRED if submitting after attempt deadline', async () => {
    const { token, attempt } = await createStudentWithAttempt();

    // Expire attempt in database
    await query(
      `UPDATE exam_attempts SET expires_at = CURRENT_TIMESTAMP - interval '10 seconds' WHERE attempt_id = $1;`,
      [attempt.attempt_id]
    );

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `key-${randomUUID()}`)
      .send({});

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ATTEMPT_EXPIRED');
  });
});
