/**
 * @file resultsApi.test.js
 * @description Integration tests for candidate result visibility matrix and derived fields:
 * - ACTIVE attempt -> 409 ATTEMPT_ACTIVE
 * - SUBMITTED attempt without evaluated result -> 404 RESULT_NOT_FOUND
 * - CORRECTION 1: LIVE exam + IMMEDIATE policy -> 403 RESULT_NOT_PUBLISHED
 * - CORRECTION 1: ENDED exam + IMMEDIATE policy -> 200 OK
 * - EVALUATED exam + IMMEDIATE policy -> 200 OK
 * - RESULT_PUBLISHED exam -> 200 OK
 * - SCHEDULED exam before release time -> 403 RESULT_NOT_PUBLISHED
 * - SCHEDULED exam after release time -> 200 OK
 * - MANUAL exam before publication -> 403 RESULT_NOT_PUBLISHED
 * - Derived fields computation (passed, percentage)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';

describe('Results API — Candidate Visibility Integration Tests', () => {
  let facultyUser;
  let subject;
  let topic;
  let room;

  async function createStudent() {
    const student = await authService.register({
      name: `Student Results API ${Date.now()} ${Math.random()}`,
      email: `student_results_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student.userId]);
    const loginRes = await authService.login({ email: student.email, password: 'Password123!' });
    return { userId: student.userId, token: loginRes.accessToken };
  }

  async function createExamAndSession() {
    const newExam = await examService.createExam(
      {
        title: `Results Test Exam ${Date.now()} ${Math.random()}`,
        subject_id: subject.subject_id,
        duration_minutes: 60,
        total_marks: 100.0,
        passing_marks: 40.0
      },
      facultyUser.userId
    );

    await examService.configureTopicRule(
      newExam.exam_id,
      {
        topic_id: topic.topic_id,
        difficulty: 'EASY',
        question_count: 1,
        points_per_question: 100.0
      },
      facultyUser
    );

    await examService.publishExam(newExam.exam_id, facultyUser);

    const now = new Date();
    const sessionRes = await query(
      `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *;`,
      [newExam.exam_id, room.room_id, new Date(now.getTime() - 3600000), new Date(now.getTime() + 3600000)]
    );

    return { exam: newExam, session: sessionRes.rows[0] };
  }

  async function createAttemptWithScenario({
    policy = 'MANUAL',
    releaseAt = null,
    examStatus = 'LIVE',
    attemptStatus = 'SUBMITTED',
    score = 75.0,
    createResult = true,
    publishedAt = null
  } = {}) {
    const { exam, session } = await createExamAndSession();
    const student = await createStudent();

    await query(
      `INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, 'ASSIGNED') ON CONFLICT DO NOTHING;`,
      [session.session_id, student.userId]
    );

    // Attempt started while exam is PUBLISHED
    const attempt = await attemptService.startAttempt(session.session_id, {
      userId: student.userId,
      roles: ['STUDENT']
    });

    // Update attempt status if needed
    if (attemptStatus !== 'ACTIVE') {
      await query(
        `UPDATE exam_attempts SET status = $1, submitted_at = NOW(), updated_at = NOW() WHERE attempt_id = $2;`,
        [attemptStatus, attempt.attempt_id]
      );
    }

    // Now update exam to target lifecycle state & release policy
    await query(
      `UPDATE exams 
       SET status = $1, results_release_policy = $2, results_release_at = $3, results_published_at = $4, updated_at = NOW()
       WHERE exam_id = $5;`,
      [examStatus, policy, releaseAt, publishedAt, exam.exam_id]
    );

    let result = null;
    if (createResult) {
      const res = await query(
        `INSERT INTO results (attempt_id, score, correct_count, wrong_count, unanswered_count, evaluated_at)
         VALUES ($1, $2, 1, 0, 0, NOW())
         RETURNING *;`,
        [attempt.attempt_id, score]
      );
      result = res.rows[0];
    }

    return { exam, session, student, attempt, result };
  }

  before(async () => {
    const faculty = await authService.register({
      name: 'Faculty Results API',
      email: `faculty_results_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY'] };

    const subjectRes = await query(
      `INSERT INTO subjects (code, name, description) VALUES ($1, 'CS-RES-API', 'Results API Tests') RETURNING *;`,
      [`CS-RES-${Date.now()}`]
    );
    subject = subjectRes.rows[0];

    const topicRes = await query(
      `INSERT INTO topics (subject_id, name) VALUES ($1, 'Results API Topic') RETURNING *;`,
      [subject.subject_id]
    );
    topic = topicRes.rows[0];

    const qRes = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'MCQ', 'Results Question 1', 100.00) RETURNING *;`,
      [topic.topic_id]
    );

    await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
       VALUES ($1, 'Wrong', false, 0), ($1, 'Right', true, 1);`,
      [qRes.rows[0].question_id]
    );

    const roomRes = await query(`INSERT INTO rooms (name, capacity) VALUES ($1, 50) RETURNING *;`, [`Room-Res-API-${Date.now()}`]);
    room = roomRes.rows[0];
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });

  it('should reject with 409 ATTEMPT_ACTIVE if attempt is still in progress', async () => {
    const { student, attempt } = await createAttemptWithScenario({
      policy: 'IMMEDIATE',
      examStatus: 'LIVE',
      attemptStatus: 'ACTIVE',
      createResult: false
    });

    const res = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/result`)
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ATTEMPT_ACTIVE');
  });

  it('should reject with 404 RESULT_NOT_FOUND if attempt is finalized but not yet evaluated', async () => {
    const { student, attempt } = await createAttemptWithScenario({
      policy: 'IMMEDIATE',
      examStatus: 'ENDED',
      attemptStatus: 'SUBMITTED',
      createResult: false
    });

    const res = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/result`)
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'RESULT_NOT_FOUND');
  });

  it('CORRECTION 1: should DENY result visibility (403 RESULT_NOT_PUBLISHED) while exam is LIVE under IMMEDIATE policy', async () => {
    const { student, attempt } = await createAttemptWithScenario({
      policy: 'IMMEDIATE',
      examStatus: 'LIVE',
      attemptStatus: 'SUBMITTED',
      score: 85.0,
      createResult: true
    });

    const res = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/result`)
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'RESULT_NOT_PUBLISHED');
  });

  it('CORRECTION 1: should ALLOW result visibility (200 OK) once exam is ENDED under IMMEDIATE policy', async () => {
    const { student, attempt } = await createAttemptWithScenario({
      policy: 'IMMEDIATE',
      examStatus: 'ENDED',
      attemptStatus: 'SUBMITTED',
      score: 85.0,
      createResult: true
    });

    const res = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/result`)
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.attemptId, attempt.attempt_id);
    assert.equal(res.body.data.score, 85);
    assert.equal(res.body.data.totalMarks, 100);
    assert.equal(res.body.data.passingMarks, 40);
    assert.equal(res.body.data.passed, true);
    assert.equal(res.body.data.percentage, 85);
  });

  it('should ALLOW result visibility when exam is in EVALUATED status under IMMEDIATE policy', async () => {
    const { student, attempt } = await createAttemptWithScenario({
      policy: 'IMMEDIATE',
      examStatus: 'EVALUATED',
      attemptStatus: 'SUBMITTED',
      score: 35.0,
      createResult: true
    });

    const res = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/result`)
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.passed, false);
    assert.equal(res.body.data.percentage, 35);
  });

  it('should ALLOW result visibility when exam is in RESULT_PUBLISHED status regardless of policy', async () => {
    const { student, attempt } = await createAttemptWithScenario({
      policy: 'MANUAL',
      examStatus: 'RESULT_PUBLISHED',
      attemptStatus: 'SUBMITTED',
      score: 92.5,
      createResult: true,
      publishedAt: new Date()
    });

    const res = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/result`)
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.score, 92.5);
    assert.equal(res.body.data.passed, true);
    assert.ok(res.body.data.publishedAt);
  });

  it('SCHEDULED policy: should DENY before scheduled release time has arrived', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const { student, attempt } = await createAttemptWithScenario({
      policy: 'SCHEDULED',
      releaseAt: futureDate,
      examStatus: 'ENDED',
      attemptStatus: 'SUBMITTED',
      score: 70.0,
      createResult: true
    });

    const res = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/result`)
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'RESULT_NOT_PUBLISHED');
  });

  it('SCHEDULED policy: should ALLOW once scheduled release time has arrived', async () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const { student, attempt } = await createAttemptWithScenario({
      policy: 'SCHEDULED',
      releaseAt: pastDate,
      examStatus: 'ENDED',
      attemptStatus: 'SUBMITTED',
      score: 70.0,
      createResult: true
    });

    const res = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/result`)
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.score, 70);
  });

  it('MANUAL policy: should DENY if exam is ENDED but not yet RESULT_PUBLISHED', async () => {
    const { student, attempt } = await createAttemptWithScenario({
      policy: 'MANUAL',
      examStatus: 'ENDED',
      attemptStatus: 'SUBMITTED',
      score: 70.0,
      createResult: true
    });

    const res = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/result`)
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'RESULT_NOT_PUBLISHED');
  });
});
