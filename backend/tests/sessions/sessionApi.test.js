/**
 * @file sessionApi.test.js
 * @description Integration tests for Exam Sessions REST API endpoints, candidate rosters, and invigilator mappings.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';

describe('Sessions REST API Endpoints (Integration)', () => {
  let facultyToken;
  let facultyUserId;
  let studentToken;
  let studentUserId;
  let proctorUserId;
  let testSubject;
  let testTopic;
  let publishedExamId;
  let testRoomId;
  let createdSessionId;

  before(async () => {
    // 1. Create Faculty
    const faculty = await authService.register({
      name: 'Prof. Session Host',
      email: `faculty_session_api_${Date.now()}@example.com`,
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
      name: 'Candidate Enrollee',
      email: `student_session_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    studentUserId = student.userId;
    const studentLogin = await authService.login({
      email: student.email,
      password: 'Password123!'
    });
    studentToken = studentLogin.accessToken;

    // 3. Create Proctor
    const proctor = await authService.register({
      name: 'Session Proctor',
      email: `proctor_session_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'INVIGILATOR')
      ON CONFLICT DO NOTHING;
    `, [proctor.userId]);
    proctorUserId = proctor.userId;

    // 4. Create Subject, Topic, Question
    const subRes = await query(`
      INSERT INTO subjects (code, name, description)
      VALUES ($1, $2, $3)
      RETURNING *;
    `, [`DBMS_${Date.now()}`, 'Database Systems', 'SQL and Transactions']);
    testSubject = subRes.rows[0];

    const topRes = await query(`
      INSERT INTO topics (subject_id, name)
      VALUES ($1, $2)
      RETURNING *;
    `, [testSubject.subject_id, 'ACID Properties']);
    testTopic = topRes.rows[0];

    await query(`
      INSERT INTO questions (topic_id, question_type, prompt_text, metadata)
      VALUES
        ($1, 'MCQ', 'What is Atomicity?', '{}'),
        ($1, 'MCQ', 'What is Isolation?', '{}');
    `, [testTopic.topic_id]);

    // 5. Create Exam & Publish
    const exam = await examService.createExam(
      {
        title: 'DBMS Final Exam',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 20,
        passing_marks: 8
      },
      facultyUserId
    );

    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: testTopic.topic_id,
        question_count: 2,
        points_per_question: 10
      },
      { userId: facultyUserId, roles: ['FACULTY'] }
    );

    const pub = await examService.publishExam(exam.exam_id, { userId: facultyUserId, roles: ['FACULTY'] });
    publishedExamId = pub.exam_id;
  });

  after(async () => {
    try {
      if (publishedExamId) {
        await query('DELETE FROM session_students WHERE session_id IN (SELECT session_id FROM exam_sessions WHERE exam_id = $1)', [publishedExamId]);
        await query('DELETE FROM session_invigilators WHERE session_id IN (SELECT session_id FROM exam_sessions WHERE exam_id = $1)', [publishedExamId]);
        await query('DELETE FROM exam_sessions WHERE exam_id = $1', [publishedExamId]);
        await query('DELETE FROM exam_topic_rules WHERE exam_id = $1', [publishedExamId]);
        await query('DELETE FROM exams WHERE exam_id = $1', [publishedExamId]);
      }
      if (testRoomId) await query('DELETE FROM rooms WHERE room_id = $1', [testRoomId]);
      if (testSubject) {
        await query('DELETE FROM questions WHERE topic_id IN (SELECT topic_id FROM topics WHERE subject_id = $1)', [testSubject.subject_id]);
        await query('DELETE FROM topics WHERE subject_id = $1', [testSubject.subject_id]);
        await query('DELETE FROM subjects WHERE subject_id = $1', [testSubject.subject_id]);
      }
      if (facultyUserId) await query('DELETE FROM users WHERE user_id = $1', [facultyUserId]);
      if (studentUserId) await query('DELETE FROM users WHERE user_id = $1', [studentUserId]);
      if (proctorUserId) await query('DELETE FROM users WHERE user_id = $1', [proctorUserId]);
    } catch {
      // Ignore cleanup error
    } finally {
      await closeRedis();
      await closePool();
    }
  });

  it('POST /api/v1/sessions/rooms — should create an examination room', async () => {
    const res = await request(app)
      .post('/api/v1/sessions/rooms')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        name: `Lab_${Date.now()}`,
        capacity: 30,
        building: 'IT Complex'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.room.room_id);
    assert.equal(res.body.data.room.capacity, 30);

    testRoomId = res.body.data.room.room_id;
  });

  it('GET /api/v1/sessions/rooms — should list available rooms', async () => {
    const res = await request(app)
      .get('/api/v1/sessions/rooms')
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.rooms));
    assert.ok(res.body.data.rooms.some((r) => r.room_id === testRoomId));
  });

  it('POST /api/v1/sessions — should schedule an exam session', async () => {
    const startTime = new Date(Date.now() + 86400000);
    const endTime = new Date(startTime.getTime() + 120 * 60000);

    const res = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        exam_id: publishedExamId,
        room_id: testRoomId,
        scheduled_start_time: startTime.toISOString(),
        scheduled_end_time: endTime.toISOString()
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.session.session_id);
    assert.equal(res.body.data.session.status, 'SCHEDULED');

    createdSessionId = res.body.data.session.session_id;
  });

  it('GET /api/v1/sessions — should list scheduled sessions with pagination and filters', async () => {
    const res = await request(app)
      .get('/api/v1/sessions')
      .query({ exam_id: publishedExamId })
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.sessions));
    assert.ok(res.body.data.sessions.some((s) => s.session_id === createdSessionId));
  });

  it('POST /api/v1/sessions/:id/students — should enroll candidate students into session roster', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${createdSessionId}/students`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        student_ids: [studentUserId]
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.assigned_count, 1);
    assert.equal(res.body.data.total_enrolled, 1);
  });

  it('GET /api/v1/sessions/:id — should return session details with enrolled roster', async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${createdSessionId}`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.session.session_id, createdSessionId);
    assert.equal(res.body.data.session.students.length, 1);
    assert.equal(res.body.data.session.students[0].student_id, studentUserId);
  });

  it('POST /api/v1/sessions/:id/invigilators — should assign proctor/invigilator', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${createdSessionId}/invigilators`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        user_id: proctorUserId,
        role: 'PRIMARY'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.assignment.user_id, proctorUserId);
    assert.equal(res.body.data.assignment.role, 'PRIMARY');
  });

  it('DELETE /api/v1/sessions/:id/invigilators/:userId — should remove invigilator', async () => {
    const res = await request(app)
      .delete(`/api/v1/sessions/${createdSessionId}/invigilators/${proctorUserId}`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
  });

  it('DELETE /api/v1/sessions/:id/students/:studentId — should remove candidate student', async () => {
    const res = await request(app)
      .delete(`/api/v1/sessions/${createdSessionId}/students/${studentUserId}`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
  });
});
