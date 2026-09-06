/**
 * @file examApi.test.js
 * @description Integration tests for Exam Authoring REST API endpoints, RBAC, and ownership boundaries.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import * as authService from '../../src/modules/auth/auth.service.js';

describe('Exams REST API Endpoints (Integration)', () => {
  let facultyToken;
  let facultyUserId;
  let studentToken;
  let studentUserId;
  let otherFacultyToken;
  let testSubject;
  let testTopic;
  let createdExamId;
  let createdRuleId;

  before(async () => {
    // 1. Create Faculty
    const faculty = await authService.register({
      name: 'Prof. Router',
      email: `faculty_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'FACULTY')
      ON CONFLICT DO NOTHING;
    `, [faculty.userId]);
    facultyUserId = faculty.userId;

    const facultyLogin = await authService.login({
      email: faculty.email,
      password: 'Password123!'
    });
    facultyToken = facultyLogin.accessToken;

    // 2. Create Student
    const student = await authService.register({
      name: 'Student Candidate',
      email: `student_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    studentUserId = student.userId;
    const studentLogin = await authService.login({
      email: student.email,
      password: 'Password123!'
    });
    studentToken = studentLogin.accessToken;

    // 3. Create Other Faculty
    const otherFaculty = await authService.register({
      name: 'Other Faculty',
      email: `other_faculty_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'FACULTY')
      ON CONFLICT DO NOTHING;
    `, [otherFaculty.userId]);
    const otherLogin = await authService.login({
      email: otherFaculty.email,
      password: 'Password123!'
    });
    otherFacultyToken = otherLogin.accessToken;

    // 4. Create Subject & Topic
    const subRes = await query(`
      INSERT INTO subjects (code, name, description)
      VALUES ($1, $2, $3)
      RETURNING *;
    `, [`OS_${Date.now()}`, 'Operating Systems', 'Processes and Memory']);
    testSubject = subRes.rows[0];

    const topRes = await query(`
      INSERT INTO topics (subject_id, name)
      VALUES ($1, $2)
      RETURNING *;
    `, [testSubject.subject_id, 'Concurrency & Deadlocks']);
    testTopic = topRes.rows[0];

    // Seed questions for topic
    await query(`
      INSERT INTO questions (topic_id, question_type, prompt_text, metadata)
      VALUES
        ($1, 'MCQ', 'What is mutual exclusion?', '{}'),
        ($1, 'MCQ', 'What is a semaphore?', '{}'),
        ($1, 'MCQ', 'What is a deadlock?', '{}');
    `, [testTopic.topic_id]);
  });

  after(async () => {
    try {
      if (facultyUserId) {
        await query('DELETE FROM exam_topic_rules WHERE exam_id IN (SELECT exam_id FROM exams WHERE created_by = $1)', [facultyUserId]);
        await query('DELETE FROM exams WHERE created_by = $1', [facultyUserId]);
      }
      if (testSubject) {
        await query('DELETE FROM questions WHERE topic_id IN (SELECT topic_id FROM topics WHERE subject_id = $1)', [testSubject.subject_id]);
        await query('DELETE FROM topics WHERE subject_id = $1', [testSubject.subject_id]);
        await query('DELETE FROM subjects WHERE subject_id = $1', [testSubject.subject_id]);
      }
      if (facultyUserId) await query('DELETE FROM users WHERE user_id = $1', [facultyUserId]);
      if (studentUserId) await query('DELETE FROM users WHERE user_id = $1', [studentUserId]);
    } catch {
      // Ignore cleanup error
    } finally {
      await closePool();
    }
  });

  it('POST /api/v1/exams — should reject unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/api/v1/exams')
      .send({
        title: 'Unauthenticated Exam',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 100,
        passing_marks: 40
      });

    assert.equal(res.status, 401);
  });

  it('POST /api/v1/exams — should reject STUDENT with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Student Attempting Exam Creation',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 100,
        passing_marks: 40
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('POST /api/v1/exams — should allow FACULTY to create DRAFT exam and return 201', async () => {
    const res = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        title: 'Operating Systems Midterm',
        description: 'Covers concurrency, deadlocks, and virtual memory',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 30,
        passing_marks: 12
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.exam.exam_id);
    assert.equal(res.body.data.exam.status, 'DRAFT');
    assert.equal(res.body.data.exam.created_by, facultyUserId);

    createdExamId = res.body.data.exam.exam_id;
  });

  it('GET /api/v1/exams — should list exams accessible to the authenticated user', async () => {
    const res = await request(app)
      .get('/api/v1/exams')
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.ok(Array.isArray(res.body.data.exams));
    assert.ok(res.body.data.pagination);
    assert.ok(res.body.data.exams.some((e) => e.exam_id === createdExamId));
  });

  it('GET /api/v1/exams/:id — should return exam details with topic rules', async () => {
    const res = await request(app)
      .get(`/api/v1/exams/${createdExamId}`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.exam.exam_id, createdExamId);
    assert.equal(res.body.data.exam.subject_name, 'Operating Systems');
    assert.ok(Array.isArray(res.body.data.exam.topic_rules));
  });

  it('PUT /api/v1/exams/:id — should reject modification by non-owner faculty with 403', async () => {
    const res = await request(app)
      .put(`/api/v1/exams/${createdExamId}`)
      .set('Authorization', `Bearer ${otherFacultyToken}`)
      .send({
        title: 'Hacked Title'
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('PUT /api/v1/exams/:id — should allow owner faculty to update draft exam', async () => {
    const res = await request(app)
      .put(`/api/v1/exams/${createdExamId}`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        title: 'Operating Systems Midterm 2026',
        duration_minutes: 75
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.exam.title, 'Operating Systems Midterm 2026');
    assert.equal(res.body.data.exam.duration_minutes, 75);
  });

  it('POST /api/v1/exams/:id/rules — should add a topic question rule', async () => {
    const res = await request(app)
      .post(`/api/v1/exams/${createdExamId}/rules`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        topic_id: testTopic.topic_id,
        question_count: 3,
        points_per_question: 10
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.rule.rule_id);
    assert.equal(res.body.data.rule.question_count, 3);
    assert.equal(Number(res.body.data.rule.points_per_question), 10);

    createdRuleId = res.body.data.rule.rule_id;
  });

  it('POST /api/v1/exams/:id/publish — should publish exam and lock contract', async () => {
    const res = await request(app)
      .post(`/api/v1/exams/${createdExamId}/publish`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.exam.status, 'PUBLISHED');
  });

  it('PUT /api/v1/exams/:id — should reject updating published exam', async () => {
    const res = await request(app)
      .put(`/api/v1/exams/${createdExamId}`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        title: 'Mutate After Publish'
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'DOMAIN_INVARIANT_VIOLATION');
  });

  it('DELETE /api/v1/exams/:id/rules/:ruleId — should reject deleting rules from published exam', async () => {
    const res = await request(app)
      .delete(`/api/v1/exams/${createdExamId}/rules/${createdRuleId}`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'DOMAIN_INVARIANT_VIOLATION');
  });
});
