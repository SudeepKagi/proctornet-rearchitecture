/**
 * @file answerApi.test.js
 * @description REST API integration tests for Phase 7 Answers, Autosave, OCC Revisions, Clear operations, and Batch atomicity.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';

describe('Answers REST API Endpoints (Integration)', () => {
  let facultyUser;
  let facultyToken;
  let otherFacultyToken;
  let adminToken;
  let proctorToken;
  let student1Token;
  let student2Token;
  let studentUser1;
  let studentUser2;
  let testSubject;
  let testTopic;
  let publishedExam;
  let activeSession;
  let attempt1;
  let attempt2;
  let attempt1Questions = [];

  before(async () => {
    // 1. Create Users & Authenticate
    const faculty = await authService.register({
      name: 'Faculty Answers API',
      email: `faculty_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY'] };
    const facultyLogin = await authService.login({ email: faculty.email, password: 'Password123!' });
    facultyToken = facultyLogin.accessToken;

    const otherFaculty = await authService.register({
      name: 'Other Faculty Answers API',
      email: `other_faculty_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [otherFaculty.userId]);
    const otherFacultyLogin = await authService.login({ email: otherFaculty.email, password: 'Password123!' });
    otherFacultyToken = otherFacultyLogin.accessToken;

    const admin = await authService.register({
      name: 'Admin Answers API',
      email: `admin_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING;`, [admin.userId]);
    const adminLogin = await authService.login({ email: admin.email, password: 'Password123!' });
    adminToken = adminLogin.accessToken;

    const proctor = await authService.register({
      name: 'Proctor Answers API',
      email: `proctor_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR') ON CONFLICT DO NOTHING;`, [proctor.userId]);
    const proctorLogin = await authService.login({ email: proctor.email, password: 'Password123!' });
    proctorToken = proctorLogin.accessToken;

    const student1 = await authService.register({
      name: 'Student 1 API',
      email: `student1_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student1.userId]);
    studentUser1 = { userId: student1.userId, roles: ['STUDENT'] };
    const student1Login = await authService.login({ email: student1.email, password: 'Password123!' });
    student1Token = student1Login.accessToken;

    const student2 = await authService.register({
      name: 'Student 2 API',
      email: `student2_api_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student2.userId]);
    studentUser2 = { userId: student2.userId, roles: ['STUDENT'] };
    const student2Login = await authService.login({ email: student2.email, password: 'Password123!' });
    student2Token = student2Login.accessToken;

    // 2. Create Subject and Topic
    const subjectRes = await query(`
      INSERT INTO subjects (code, name, description)
      VALUES ($1, 'CS-API-ANS', 'Subject for Answer API tests')
      RETURNING *;
    `, [`CS-API-ANS-${Date.now()}`]);
    testSubject = subjectRes.rows[0];

    const topicRes = await query(`
      INSERT INTO topics (subject_id, name, description)
      VALUES ($1, 'Transactions & Atomicity', 'Atomicity Topic')
      RETURNING *;
    `, [testSubject.subject_id]);
    testTopic = topicRes.rows[0];

    // 3. Seed Questions
    for (let i = 1; i <= 4; i++) {
      const qRes = await query(`
        INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
        VALUES ($1, 'MCQ', $2, 2.50)
        RETURNING *;
      `, [testTopic.topic_id, `API MCQ Question ${i}`]);

      await query(`
        INSERT INTO question_options (question_id, option_text, is_correct, display_order)
        VALUES 
          ($1, 'Option A (Correct)', true, 0),
          ($1, 'Option B', false, 1);
      `, [qRes.rows[0].question_id]);
    }

    // 4. Create Exam
    const exam = await examService.createExam({
      title: 'API Concurrency Exam',
      description: 'REST API verification',
      subject_id: testSubject.subject_id,
      duration_minutes: 60,
      total_marks: 10.00,
      passing_marks: 5.00
    }, facultyUser.userId);

    await examService.configureTopicRule(exam.exam_id, {
      topic_id: testTopic.topic_id,
      question_count: 4,
      points_per_question: 2.50
    }, facultyUser);

    publishedExam = await examService.publishExam(exam.exam_id, facultyUser);

    // 5. Create Room and Session
    const roomRes = await query(`
      INSERT INTO rooms (name, capacity, building)
      VALUES ($1, 50, 'Engineering Block')
      RETURNING *;
    `, [`Room-API-Ans-${Date.now()}`]);
    const room = roomRes.rows[0];

    const now = new Date();
    const startTime = new Date(now.getTime() - 10 * 60 * 1000);
    const endTime = new Date(now.getTime() + 120 * 60 * 1000);

    const sessionRes = await query(`
      INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
      VALUES ($1, $2, $3, $4, 'ACTIVE')
      RETURNING *;
    `, [publishedExam.exam_id, room.room_id, startTime.toISOString(), endTime.toISOString()]);
    activeSession = sessionRes.rows[0];

    await query(`
      INSERT INTO session_students (session_id, student_id, status)
      VALUES 
        ($1, $2, 'ASSIGNED'),
        ($1, $3, 'ASSIGNED');
    `, [activeSession.session_id, studentUser1.userId, studentUser2.userId]);

    await query(`
      INSERT INTO session_invigilators (session_id, user_id, role)
      VALUES ($1, $2, 'PRIMARY');
    `, [activeSession.session_id, proctor.userId]);

    // 6. Start Attempts
    attempt1 = await attemptService.startAttempt(activeSession.session_id, studentUser1);
    attempt2 = await attemptService.startAttempt(activeSession.session_id, studentUser2);

    const qRes1 = await attemptService.getAttemptQuestions(attempt1.attempt_id, studentUser1);
    attempt1Questions = qRes1.questions;
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });

  // --- 1. SINGLE SAVE ENDPOINT (PUT) ---

  it('PUT /attempts/:attemptId/answers/:attemptQuestionId -> 401 without Bearer token', async () => {
    const q1 = attempt1Questions[0];
    const res = await request(app)
      .put(`/api/v1/attempts/${attempt1.attempt_id}/answers/${q1.attempt_question_id}`)
      .send({
        answer_value: { selected_option_id: q1.options[0].option_id },
        expected_revision: 0
      });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });

  it('PUT /attempts/:attemptId/answers/:attemptQuestionId -> 403 when candidate attempts to save for another student (BOLA)', async () => {
    const q1 = attempt1Questions[0];
    const res = await request(app)
      .put(`/api/v1/attempts/${attempt1.attempt_id}/answers/${q1.attempt_question_id}`)
      .set('Authorization', `Bearer ${student2Token}`) // Student 2 trying to write to Student 1's attempt
      .send({
        answer_value: { selected_option_id: q1.options[0].option_id },
        expected_revision: 0
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'FORBIDDEN');
  });

  it('PUT /attempts/:attemptId/answers/:attemptQuestionId -> 400 on malformed UUID or missing expected_revision', async () => {
    const res = await request(app)
      .put(`/api/v1/attempts/invalid-uuid/answers/invalid-uuid`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        answer_value: { selected_option_id: 'bad-uuid' }
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'BAD_REQUEST');
  });

  it('PUT /attempts/:attemptId/answers/:attemptQuestionId -> 200 on first save (0 -> 1)', async () => {
    const q1 = attempt1Questions[0];
    const res = await request(app)
      .put(`/api/v1/attempts/${attempt1.attempt_id}/answers/${q1.attempt_question_id}`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        answer_value: { selected_option_id: q1.options[0].option_id },
        expected_revision: 0
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.revision, 1);
    assert.strictEqual(res.body.data.attempt_question_id, q1.attempt_question_id);
    assert.ok(res.body.data.saved_at);
    assert.ok(res.body.data.server_time);
  });

  it('PUT /attempts/:attemptId/answers/:attemptQuestionId -> 200 on update (1 -> 2)', async () => {
    const q1 = attempt1Questions[0];
    const res = await request(app)
      .put(`/api/v1/attempts/${attempt1.attempt_id}/answers/${q1.attempt_question_id}`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        answer_value: { selected_option_id: q1.options[1].option_id },
        expected_revision: 1
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.revision, 2);
    assert.strictEqual(res.body.data.answer_value.selected_option_id, q1.options[1].option_id);
  });

  it('PUT /attempts/:attemptId/answers/:attemptQuestionId -> 200 on network retry (expected_revision = 1, same payload)', async () => {
    const q1 = attempt1Questions[0];
    const res = await request(app)
      .put(`/api/v1/attempts/${attempt1.attempt_id}/answers/${q1.attempt_question_id}`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        answer_value: { selected_option_id: q1.options[1].option_id },
        expected_revision: 1
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.revision, 2, 'Revision must remain 2');
  });

  it('PUT /attempts/:attemptId/answers/:attemptQuestionId -> 409 Conflict on stale revision with different payload', async () => {
    const q1 = attempt1Questions[0];
    const res = await request(app)
      .put(`/api/v1/attempts/${attempt1.attempt_id}/answers/${q1.attempt_question_id}`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        answer_value: { selected_option_id: q1.options[0].option_id },
        expected_revision: 1 // Stale: server is at revision 2, and payload differs
      });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error.code, 'STALE_REVISION_CONFLICT');
  });

  // --- 2. CLEAR ANSWER ENDPOINT (DELETE) ---

  it('DELETE /attempts/:attemptId/answers/:attemptQuestionId -> 409 Conflict on mismatched expected_revision', async () => {
    const q1 = attempt1Questions[0]; // Currently at revision 2
    const res = await request(app)
      .delete(`/api/v1/attempts/${attempt1.attempt_id}/answers/${q1.attempt_question_id}`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        expected_revision: 0 // Mismatched
      });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error.code, 'STALE_REVISION_CONFLICT');
  });

  it('DELETE /attempts/:attemptId/answers/:attemptQuestionId -> 200 OK with cleared: true when revision matches', async () => {
    const q1 = attempt1Questions[0]; // Currently at revision 2
    const res = await request(app)
      .delete(`/api/v1/attempts/${attempt1.attempt_id}/answers/${q1.attempt_question_id}`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        expected_revision: 2
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.cleared, true);
    assert.ok(res.body.data.server_time);
  });

  it('DELETE /attempts/:attemptId/answers/:attemptQuestionId -> 200 OK idempotent clear on already-unanswered question with expected_revision = 0', async () => {
    const q1 = attempt1Questions[0]; // Already cleared
    const res = await request(app)
      .delete(`/api/v1/attempts/${attempt1.attempt_id}/answers/${q1.attempt_question_id}`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        expected_revision: 0
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.cleared, true);
  });

  // --- 3. BATCH AUTOSAVE ENDPOINT (POST /batch) ---

  it('POST /attempts/:attemptId/answers/batch -> 400 Bad Request on duplicate attempt_question_id entries', async () => {
    const q2 = attempt1Questions[1];
    const res = await request(app)
      .post(`/api/v1/attempts/${attempt1.attempt_id}/answers/batch`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        answers: [
          { attempt_question_id: q2.attempt_question_id, answer_value: { selected_option_id: q2.options[0].option_id }, expected_revision: 0 },
          { attempt_question_id: q2.attempt_question_id, answer_value: { selected_option_id: q2.options[1].option_id }, expected_revision: 0 }
        ]
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'BAD_REQUEST');
  });

  it('POST /attempts/:attemptId/answers/batch -> 200 OK on valid batch autosave', async () => {
    const q1 = attempt1Questions[0]; // Currently unanswered (cleared)
    const q2 = attempt1Questions[1]; // Unanswered
    const res = await request(app)
      .post(`/api/v1/attempts/${attempt1.attempt_id}/answers/batch`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        answers: [
          { attempt_question_id: q1.attempt_question_id, answer_value: { selected_option_id: q1.options[0].option_id }, expected_revision: 0 },
          { attempt_question_id: q2.attempt_question_id, answer_value: { selected_option_id: q2.options[1].option_id }, expected_revision: 0 }
        ]
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.saved_count, 2);
    assert.strictEqual(res.body.data.answers.length, 2);
  });

  it('POST /attempts/:attemptId/answers/batch -> 409 Conflict with complete rollback when an item has stale revision', async () => {
    const q1 = attempt1Questions[0]; // Revision 1
    const q3 = attempt1Questions[2]; // Unanswered

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt1.attempt_id}/answers/batch`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        answers: [
          { attempt_question_id: q1.attempt_question_id, answer_value: { selected_option_id: q1.options[1].option_id }, expected_revision: 1 }, // Valid
          { attempt_question_id: q3.attempt_question_id, answer_value: { selected_option_id: q3.options[0].option_id }, expected_revision: 42 } // Stale
        ]
      });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error.code, 'STALE_REVISION_CONFLICT');

    // Confirm q1 was NOT modified (still at revision 1)
    const getRes = await request(app)
      .get(`/api/v1/attempts/${attempt1.attempt_id}/answers`)
      .set('Authorization', `Bearer ${student1Token}`);

    const q1Item = getRes.body.data.answers.find((a) => a.attempt_question_id === q1.attempt_question_id);
    assert.strictEqual(q1Item.revision, 1);
  });

  // --- 4. GET ANSWERS ENDPOINT (GET) ---

  it('GET /attempts/:attemptId/answers -> 200 OK for owner student, creator faculty, invigilator, admin', async () => {
    // 1. Owner Student
    const sRes = await request(app)
      .get(`/api/v1/attempts/${attempt1.attempt_id}/answers`)
      .set('Authorization', `Bearer ${student1Token}`);
    assert.strictEqual(sRes.status, 200);
    assert.strictEqual(sRes.body.data.attempt_id, attempt1.attempt_id);

    // 2. Creator Faculty
    const fRes = await request(app)
      .get(`/api/v1/attempts/${attempt1.attempt_id}/answers`)
      .set('Authorization', `Bearer ${facultyToken}`);
    assert.strictEqual(fRes.status, 200);

    // 3. Assigned Invigilator
    const pRes = await request(app)
      .get(`/api/v1/attempts/${attempt1.attempt_id}/answers`)
      .set('Authorization', `Bearer ${proctorToken}`);
    assert.strictEqual(pRes.status, 200);

    // 4. Admin
    const aRes = await request(app)
      .get(`/api/v1/attempts/${attempt1.attempt_id}/answers`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.strictEqual(aRes.status, 200);
  });

  it('GET /attempts/:attemptId/answers -> 403 Forbidden for non-owner student or other faculty', async () => {
    // Other Student
    const s2Res = await request(app)
      .get(`/api/v1/attempts/${attempt1.attempt_id}/answers`)
      .set('Authorization', `Bearer ${student2Token}`);
    assert.strictEqual(s2Res.status, 403);

    // Other Faculty
    const ofRes = await request(app)
      .get(`/api/v1/attempts/${attempt1.attempt_id}/answers`)
      .set('Authorization', `Bearer ${otherFacultyToken}`);
    assert.strictEqual(ofRes.status, 403);
  });
});
