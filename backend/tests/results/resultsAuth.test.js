/**
 * @file resultsAuth.test.js
 * @description Integration tests for Results authorization, BOLA defense, and role-based access control:
 * - Candidate BOLA defense (foreign student 403, non-existent 404, unauthenticated 401)
 * - Staff results listing scoping (Admin, Faculty Owner, Faculty Non-Owner, Invigilator, Student)
 * - Invigilator session scoping (missing sessionId, invalid session, unassigned session, assigned session)
 * - Administrative publication and policy modification authorization
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

describe('Results Authorization & Scoping Integration Tests', () => {
  let faculty1;
  let faculty2;
  let admin;
  let invigilator1;
  let invigilator2;
  let student1;
  let student2;

  let subject;
  let topic;
  let room;
  let exam1;
  let session1;
  let session2;
  let student1Attempt;
  let student2Attempt;

  before(async () => {
    // 1. Create Faculty 1 (Owner)
    const f1 = await authService.register({
      name: 'Faculty One',
      email: `faculty1_res_auth_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [f1.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [f1.userId]);
    const f1Login = await authService.login({ email: f1.email, password: 'Password123!' });
    faculty1 = { userId: f1.userId, token: f1Login.accessToken };

    // 2. Create Faculty 2 (Non-Owner)
    const f2 = await authService.register({
      name: 'Faculty Two',
      email: `faculty2_res_auth_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [f2.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [f2.userId]);
    const f2Login = await authService.login({ email: f2.email, password: 'Password123!' });
    faculty2 = { userId: f2.userId, token: f2Login.accessToken };

    // 3. Create Admin
    const adm = await authService.register({
      name: 'Admin User',
      email: `admin_res_auth_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING;`, [adm.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [adm.userId]);
    const admLogin = await authService.login({ email: adm.email, password: 'Password123!' });
    admin = { userId: adm.userId, token: admLogin.accessToken };

    // 4. Create Invigilators
    const inv1 = await authService.register({
      name: 'Invigilator One',
      email: `invig1_res_auth_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR') ON CONFLICT DO NOTHING;`, [inv1.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [inv1.userId]);
    const inv1Login = await authService.login({ email: inv1.email, password: 'Password123!' });
    invigilator1 = { userId: inv1.userId, token: inv1Login.accessToken };

    const inv2 = await authService.register({
      name: 'Invigilator Two',
      email: `invig2_res_auth_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR') ON CONFLICT DO NOTHING;`, [inv2.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [inv2.userId]);
    const inv2Login = await authService.login({ email: inv2.email, password: 'Password123!' });
    invigilator2 = { userId: inv2.userId, token: inv2Login.accessToken };

    // 5. Create Students
    const s1 = await authService.register({
      name: 'Student One',
      email: `student1_res_auth_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [s1.userId]);
    const s1Login = await authService.login({ email: s1.email, password: 'Password123!' });
    student1 = { userId: s1.userId, token: s1Login.accessToken };

    const s2 = await authService.register({
      name: 'Student Two',
      email: `student2_res_auth_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [s2.userId]);
    const s2Login = await authService.login({ email: s2.email, password: 'Password123!' });
    student2 = { userId: s2.userId, token: s2Login.accessToken };

    // 6. Subject, Topic, Question
    const subjectRes = await query(
      `INSERT INTO subjects (code, name, description) VALUES ($1, 'CS-AUTH', 'Auth Tests') RETURNING *;`,
      [`CS-AUTH-${Date.now()}`]
    );
    subject = subjectRes.rows[0];

    const topicRes = await query(
      `INSERT INTO topics (subject_id, name) VALUES ($1, 'Auth Topic') RETURNING *;`,
      [subject.subject_id]
    );
    topic = topicRes.rows[0];

    const qRes = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'MCQ', 'Auth Question 1', 10.00) RETURNING *;`,
      [topic.topic_id]
    );

    await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
       VALUES ($1, 'Option A', true, 0);`,
      [qRes.rows[0].question_id]
    );

    const roomRes = await query(`INSERT INTO rooms (name, capacity) VALUES ($1, 50) RETURNING *;`, [`Room-Auth-${Date.now()}`]);
    room = roomRes.rows[0];

    // 7. Exam created by Faculty 1
    exam1 = await examService.createExam(
      {
        title: 'Results Auth Test Exam',
        subject_id: subject.subject_id,
        duration_minutes: 60,
        total_marks: 10.0,
        passing_marks: 5.0
      },
      faculty1.userId
    );

    await examService.configureTopicRule(
      exam1.exam_id,
      {
        topic_id: topic.topic_id,
        difficulty: 'EASY',
        question_count: 1,
        points_per_question: 10.0
      },
      faculty1
    );

    await examService.publishExam(exam1.exam_id, faculty1);

    // 8. Create Session 1 & Session 2
    const now = new Date();
    const sess1Res = await query(
      `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *;`,
      [exam1.exam_id, room.room_id, new Date(now.getTime() - 3600000), new Date(now.getTime() + 3600000)]
    );
    session1 = sess1Res.rows[0];

    const sess2Res = await query(
      `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *;`,
      [exam1.exam_id, room.room_id, new Date(now.getTime() - 3600000), new Date(now.getTime() + 3600000)]
    );
    session2 = sess2Res.rows[0];

    // Assign Invigilator 1 to Session 1 only
    await query(
      `INSERT INTO session_invigilators (session_id, user_id) VALUES ($1, $2);`,
      [session1.session_id, invigilator1.userId]
    );

    // Enroll and start attempt for Student 1 in Session 1
    await query(`INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, 'ASSIGNED');`, [session1.session_id, student1.userId]);
    student1Attempt = await attemptService.startAttempt(session1.session_id, { userId: student1.userId, roles: ['STUDENT'] });
    await query(`UPDATE exam_attempts SET status = 'SUBMITTED', submitted_at = NOW() WHERE attempt_id = $1;`, [student1Attempt.attempt_id]);
    await query(
      `INSERT INTO results (attempt_id, score, correct_count, wrong_count, unanswered_count, evaluated_at)
       VALUES ($1, 10.0, 1, 0, 0, NOW());`,
      [student1Attempt.attempt_id]
    );

    // Enroll and start attempt for Student 2 in Session 2
    await query(`INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, 'ASSIGNED');`, [session2.session_id, student2.userId]);
    student2Attempt = await attemptService.startAttempt(session2.session_id, { userId: student2.userId, roles: ['STUDENT'] });
    await query(`UPDATE exam_attempts SET status = 'SUBMITTED', submitted_at = NOW() WHERE attempt_id = $1;`, [student2Attempt.attempt_id]);
    await query(
      `INSERT INTO results (attempt_id, score, correct_count, wrong_count, unanswered_count, evaluated_at)
       VALUES ($1, 4.0, 0, 1, 0, NOW());`,
      [student2Attempt.attempt_id]
    );

    // Conclude exam with IMMEDIATE policy
    await query(
      `UPDATE exams SET status = 'ENDED', results_release_policy = 'IMMEDIATE', updated_at = NOW() WHERE exam_id = $1;`,
      [exam1.exam_id]
    );
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });

  describe('Candidate BOLA & Authentication Defense', () => {
    it('should reject unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get(`/api/v1/attempts/${student1Attempt.attempt_id}/result`);
      assert.equal(res.status, 401);
    });

    it('should allow student to view their own result (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/attempts/${student1Attempt.attempt_id}/result`)
        .set('Authorization', `Bearer ${student1.token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.attemptId, student1Attempt.attempt_id);
    });

    it('BOLA Defense: should reject foreign student with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get(`/api/v1/attempts/${student1Attempt.attempt_id}/result`)
        .set('Authorization', `Bearer ${student2.token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('should return 404 ATTEMPT_NOT_FOUND for non-existent attempt UUID', async () => {
      const nonExistentId = randomUUID();
      const res = await request(app)
        .get(`/api/v1/attempts/${nonExistentId}/result`)
        .set('Authorization', `Bearer ${student1.token}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'ATTEMPT_NOT_FOUND');
    });
  });

  describe('Staff Results Listing & Role Scoping', () => {
    it('should allow Admin to list all results across sessions (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${exam1.exam_id}/results`)
        .set('Authorization', `Bearer ${admin.token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.totalCount, 2);
      assert.equal(res.body.data.results.length, 2);
    });

    it('should allow Faculty Owner to list results for their exam (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${exam1.exam_id}/results`)
        .set('Authorization', `Bearer ${faculty1.token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.totalCount, 2);
    });

    it('should reject Faculty Non-Owner with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${exam1.exam_id}/results`)
        .set('Authorization', `Bearer ${faculty2.token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('should reject Student accessing staff results with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${exam1.exam_id}/results`)
        .set('Authorization', `Bearer ${student1.token}`);

      assert.equal(res.status, 403);
    });

    it('Invigilator scoping: should require sessionId query param (400 SESSION_ID_REQUIRED)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${exam1.exam_id}/results`)
        .set('Authorization', `Bearer ${invigilator1.token}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'SESSION_ID_REQUIRED');
    });

    it('Invigilator scoping: should reject invigilator not assigned to session (403 FORBIDDEN)', async () => {
      // Invigilator 1 is only assigned to Session 1, not Session 2
      const res = await request(app)
        .get(`/api/v1/exams/${exam1.exam_id}/results?sessionId=${session2.session_id}`)
        .set('Authorization', `Bearer ${invigilator1.token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('Invigilator scoping: should allow assigned invigilator and return only that session results', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${exam1.exam_id}/results?sessionId=${session1.session_id}`)
        .set('Authorization', `Bearer ${invigilator1.token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.totalCount, 1);
      assert.equal(res.body.data.results[0].attemptId, student1Attempt.attempt_id);
    });
  });

  describe('Staff Results Summary Statistics Authorization', () => {
    it('should allow Faculty Owner to view summary statistics', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${exam1.exam_id}/results/summary`)
        .set('Authorization', `Bearer ${faculty1.token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.totalAttempts, 2);
      assert.equal(res.body.data.evaluatedCount, 2);
      assert.equal(res.body.data.passCount, 1);
      assert.equal(res.body.data.failCount, 1);
    });

    it('should reject Faculty Non-Owner from summary statistics (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${exam1.exam_id}/results/summary`)
        .set('Authorization', `Bearer ${faculty2.token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('Invigilator summary: should allow assigned invigilator with sessionId', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${exam1.exam_id}/results/summary?sessionId=${session1.session_id}`)
        .set('Authorization', `Bearer ${invigilator1.token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.totalAttempts, 1);
      assert.equal(res.body.data.passCount, 1);
      assert.equal(res.body.data.failCount, 0);
    });
  });

  describe('Publication & Policy Update Authorization', () => {
    it('should reject Invigilator attempting manual publication with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${exam1.exam_id}/results/publish`)
        .set('Authorization', `Bearer ${invigilator1.token}`);

      assert.equal(res.status, 403);
    });

    it('should reject Student attempting manual publication with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${exam1.exam_id}/results/publish`)
        .set('Authorization', `Bearer ${student1.token}`);

      assert.equal(res.status, 403);
    });

    it('should reject Faculty Non-Owner attempting manual publication with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${exam1.exam_id}/results/publish`)
        .set('Authorization', `Bearer ${faculty2.token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('should reject Invigilator attempting policy update with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${exam1.exam_id}/results/policy`)
        .set('Authorization', `Bearer ${invigilator1.token}`)
        .send({ resultsReleasePolicy: 'MANUAL' });

      assert.equal(res.status, 403);
    });
  });
});
