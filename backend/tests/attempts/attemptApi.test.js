/**
 * @file attemptApi.test.js
 * @description Integration tests for Exam Attempts and Question Mapping REST API endpoints.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as sessionService from '../../src/modules/sessions/sessions.service.js';
import { generateAccessToken } from '../../src/modules/auth/token.service.js';
import { AttemptStatus } from '../../src/domain/attempt/attemptStates.js';

describe('Attempts REST API Endpoints (Integration)', () => {
  let facultyUser;
  let facultyToken;
  let adminUser;
  let adminToken;
  let proctorUser;
  let proctorToken;
  let studentUser1;
  let studentToken1;
  let studentUser2;
  let studentToken2;
  let testSubject;
  let testTopic;
  let publishedExam;
  let activeSession;
  let futureSession;
  let createdAttemptId;

  before(async () => {
    // 1. Create Users
    const faculty = await authService.register({
      name: 'Faculty API Tester',
      email: `faculty_api_att_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY'] };
    const facultyLogin = await authService.login({ email: faculty.email, password: 'Password123!' });
    facultyToken = facultyLogin.accessToken;

    const admin = await authService.register({
      name: 'Admin API Tester',
      email: `admin_api_att_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING;`, [admin.userId]);
    adminUser = { userId: admin.userId, roles: ['ADMIN'] };
    const adminLogin = await authService.login({ email: admin.email, password: 'Password123!' });
    adminToken = adminLogin.accessToken;

    const proctor = await authService.register({
      name: 'Proctor API Tester',
      email: `proctor_api_att_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR') ON CONFLICT DO NOTHING;`, [proctor.userId]);
    proctorUser = { userId: proctor.userId, roles: ['INVIGILATOR'] };
    const proctorLogin = await authService.login({ email: proctor.email, password: 'Password123!' });
    proctorToken = proctorLogin.accessToken;

    const student1 = await authService.register({
      name: 'Student One',
      email: `student1_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student1.userId]);
    studentUser1 = { userId: student1.userId, roles: ['STUDENT'] };
    const student1Login = await authService.login({ email: student1.email, password: 'Password123!' });
    studentToken1 = student1Login.accessToken;

    const student2 = await authService.register({
      name: 'Student Two',
      email: `student2_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student2.userId]);
    studentUser2 = { userId: student2.userId, roles: ['STUDENT'] };
    const student2Login = await authService.login({ email: student2.email, password: 'Password123!' });
    studentToken2 = student2Login.accessToken;

    // 2. Create Subject and Topic
    const subjectRes = await query(`
      INSERT INTO subjects (code, name, description)
      VALUES ($1, 'CS-API-ATT', 'Subject for API attempt tests')
      RETURNING *;
    `, [`CS-API-${Date.now()}`]);
    testSubject = subjectRes.rows[0];

    const topicRes = await query(`
      INSERT INTO topics (subject_id, name, description)
      VALUES ($1, 'Operating Systems', 'OS Concepts')
      RETURNING *;
    `, [testSubject.subject_id]);
    testTopic = topicRes.rows[0];

    // 3. Seed 4 Questions in Topic
    for (let i = 1; i <= 4; i++) {
      const qRes = await query(`
        INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
        VALUES ($1, 'MCQ', $2, 2.50)
        RETURNING *;
      `, [testTopic.topic_id, `OS Prompt ${i}`]);

      await query(`
        INSERT INTO question_options (question_id, option_text, is_correct, display_order)
        VALUES 
          ($1, 'Option 1 (Correct)', true, 0),
          ($1, 'Option 2', false, 1);
      `, [qRes.rows[0].question_id]);
    }

    // 4. Create & Publish Exam
    const exam = await examService.createExam({
      title: 'OS Midterm Examination',
      description: 'Midterm test',
      subject_id: testSubject.subject_id,
      duration_minutes: 45,
      total_marks: 10.00,
      passing_marks: 5.00
    }, facultyUser.userId);

    await examService.configureTopicRule(exam.exam_id, {
      topic_id: testTopic.topic_id,
      question_count: 4,
      points_per_question: 2.50
    }, facultyUser);

    publishedExam = await examService.publishExam(exam.exam_id, facultyUser);

    // 5. Active Session
    const now = new Date();
    const startActive = new Date(now.getTime() - 5 * 60 * 1000);
    const endActive = new Date(now.getTime() + 90 * 60 * 1000);
    activeSession = await sessionService.createSession({
      exam_id: publishedExam.exam_id,
      scheduled_start_time: startActive.toISOString(),
      scheduled_end_time: endActive.toISOString()
    }, facultyUser);

    await sessionService.assignStudents(activeSession.session_id, [studentUser1.userId], facultyUser);
    await sessionService.assignInvigilator(activeSession.session_id, { userId: proctorUser.userId, role: 'PRIMARY' }, facultyUser);

    // 6. Future Session
    const startFuture = new Date(now.getTime() + 100 * 60 * 1000);
    const endFuture = new Date(now.getTime() + 160 * 60 * 1000);
    futureSession = await sessionService.createSession({
      exam_id: publishedExam.exam_id,
      scheduled_start_time: startFuture.toISOString(),
      scheduled_end_time: endFuture.toISOString()
    }, facultyUser);
    await sessionService.assignStudents(futureSession.session_id, [studentUser1.userId], facultyUser);
  });

  after(async () => {
    try {
      await query(`DELETE FROM audit_logs WHERE actor_user_id IN ($1, $2, $3, $4, $5);`, [
        facultyUser?.userId, adminUser?.userId, proctorUser?.userId, studentUser1?.userId, studentUser2?.userId
      ]);
      await query(`DELETE FROM attempt_questions WHERE attempt_id IN (SELECT attempt_id FROM exam_attempts WHERE student_id IN ($1, $2));`, [
        studentUser1?.userId, studentUser2?.userId
      ]);
      await query(`DELETE FROM exam_attempts WHERE student_id IN ($1, $2);`, [
        studentUser1?.userId, studentUser2?.userId
      ]);
      await query(`DELETE FROM session_students WHERE session_id IN ($1, $2);`, [
        activeSession?.session_id, futureSession?.session_id
      ]);
      await query(`DELETE FROM session_invigilators WHERE session_id IN ($1, $2);`, [
        activeSession?.session_id, futureSession?.session_id
      ]);
      await query(`DELETE FROM exam_sessions WHERE exam_id = $1;`, [publishedExam?.exam_id]);
      await query(`DELETE FROM exam_topic_rules WHERE exam_id = $1;`, [publishedExam?.exam_id]);
      await query(`DELETE FROM exams WHERE created_by = $1;`, [facultyUser?.userId]);
      if (testTopic) await query(`DELETE FROM question_options WHERE question_id IN (SELECT question_id FROM questions WHERE topic_id = $1);`, [testTopic.topic_id]);
      if (testTopic) await query(`DELETE FROM questions WHERE topic_id = $1;`, [testTopic.topic_id]);
      if (testSubject) await query(`DELETE FROM topics WHERE subject_id = $1;`, [testSubject.subject_id]);
      if (testSubject) await query(`DELETE FROM subjects WHERE subject_id = $1;`, [testSubject.subject_id]);
      await query(`DELETE FROM user_roles WHERE user_id IN ($1, $2, $3, $4, $5);`, [
        facultyUser?.userId, adminUser?.userId, proctorUser?.userId, studentUser1?.userId, studentUser2?.userId
      ]);
      await query(`DELETE FROM users WHERE user_id IN ($1, $2, $3, $4, $5);`, [
        facultyUser?.userId, adminUser?.userId, proctorUser?.userId, studentUser1?.userId, studentUser2?.userId
      ]);
    } catch {
      // Ignored
    } finally {
      await closeRedis();
      await closePool();
    }
  });

  describe('POST /api/v1/sessions/:id/attempts', () => {
    it('returns 401 Unauthorized when no token is provided', async () => {
      const res = await request(app)
        .post(`/api/v1/sessions/${activeSession.session_id}/attempts`);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });

    it('returns 403 Forbidden when non-student attempts to start', async () => {
      const res = await request(app)
        .post(`/api/v1/sessions/${activeSession.session_id}/attempts`)
        .set('Authorization', `Bearer ${facultyToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('returns 403 Forbidden when student is not in session roster', async () => {
      const res = await request(app)
        .post(`/api/v1/sessions/${activeSession.session_id}/attempts`)
        .set('Authorization', `Bearer ${studentToken2}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('returns 400 Bad Request when session window is not open yet', async () => {
      const res = await request(app)
        .post(`/api/v1/sessions/${futureSession.session_id}/attempts`)
        .set('Authorization', `Bearer ${studentToken1}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    it('returns 201 Created on valid attempt start', async () => {
      const res = await request(app)
        .post(`/api/v1/sessions/${activeSession.session_id}/attempts`)
        .set('Authorization', `Bearer ${studentToken1}`);

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.attempt_id);
      assert.equal(res.body.data.status, AttemptStatus.ACTIVE);
      assert.equal(res.body.data.total_questions, 4);
      assert.equal(res.body.data.is_new, true);
      assert.ok(res.body.data.time_remaining_seconds > 0);

      createdAttemptId = res.body.data.attempt_id;
    });

    it('returns 200 OK on idempotent retry', async () => {
      const res = await request(app)
        .post(`/api/v1/sessions/${activeSession.session_id}/attempts`)
        .set('Authorization', `Bearer ${studentToken1}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.attempt_id, createdAttemptId);
      assert.equal(res.body.data.is_new, false);
    });

    it('supports alias POST /api/v1/attempts/start', async () => {
      const res = await request(app)
        .post('/api/v1/attempts/start')
        .set('Authorization', `Bearer ${studentToken1}`)
        .send({ sessionId: activeSession.session_id });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.attempt_id, createdAttemptId);
    });
  });

  describe('GET /api/v1/sessions/:id/my-attempt', () => {
    it('returns candidate attempt summary for session', async () => {
      const res = await request(app)
        .get(`/api/v1/sessions/${activeSession.session_id}/my-attempt`)
        .set('Authorization', `Bearer ${studentToken1}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.attempt_id, createdAttemptId);
      assert.equal(res.body.data.status, AttemptStatus.ACTIVE);
      assert.equal(res.body.data.total_questions, 4);
    });

    it('returns null if student has not started attempt yet', async () => {
      const res = await request(app)
        .get(`/api/v1/sessions/${activeSession.session_id}/my-attempt`)
        .set('Authorization', `Bearer ${studentToken2}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data, null);
    });
  });

  describe('GET /api/v1/attempts/:attemptId', () => {
    it('allows attempt owner (student) to retrieve details', async () => {
      const res = await request(app)
        .get(`/api/v1/attempts/${createdAttemptId}`)
        .set('Authorization', `Bearer ${studentToken1}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.attempt_id, createdAttemptId);
      assert.equal(res.body.data.exam_title, 'OS Midterm Examination');
      assert.equal(res.body.data.total_marks, 10);
    });

    it('allows faculty exam-creator to inspect attempt', async () => {
      const res = await request(app)
        .get(`/api/v1/attempts/${createdAttemptId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.attempt_id, createdAttemptId);
    });

    it('allows assigned invigilator to inspect attempt', async () => {
      const res = await request(app)
        .get(`/api/v1/attempts/${createdAttemptId}`)
        .set('Authorization', `Bearer ${proctorToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.attempt_id, createdAttemptId);
    });

    it('allows admin to inspect attempt', async () => {
      const res = await request(app)
        .get(`/api/v1/attempts/${createdAttemptId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.attempt_id, createdAttemptId);
    });

    it('BOLA Defense: returns 403 Forbidden for unauthorized student', async () => {
      const res = await request(app)
        .get(`/api/v1/attempts/${createdAttemptId}`)
        .set('Authorization', `Bearer ${studentToken2}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('returns 404 Not Found for non-existent attempt', async () => {
      const res = await request(app)
        .get('/api/v1/attempts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${studentToken1}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });
  });

  describe('GET /api/v1/attempts/:attemptId/questions', () => {
    it('returns sanitized questions in contiguous display_order without solution leak', async () => {
      const res = await request(app)
        .get(`/api/v1/attempts/${createdAttemptId}/questions`)
        .set('Authorization', `Bearer ${studentToken1}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.total_questions, 4);

      const questions = res.body.data.questions;
      assert.equal(questions.length, 4);

      questions.forEach((q, idx) => {
        assert.equal(q.display_order, idx + 1);
        assert.ok(q.prompt_text);
        assert.equal(q.default_points, 2.5);
        assert.equal(q.is_correct, undefined);
        assert.equal(q.correct_numeric_value, undefined);

        assert.ok(q.options.length >= 2);
        q.options.forEach((opt) => {
          assert.ok(opt.option_text);
          assert.equal(opt.is_correct, undefined);
        });
      });
    });

    it('BOLA Defense: returns 403 Forbidden for unauthorized student', async () => {
      const res = await request(app)
        .get(`/api/v1/attempts/${createdAttemptId}/questions`)
        .set('Authorization', `Bearer ${studentToken2}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });
  });
});
