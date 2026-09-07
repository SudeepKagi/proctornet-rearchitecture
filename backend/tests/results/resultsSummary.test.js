/**
 * @file resultsSummary.test.js
 * @description Tests for aggregated summary statistics calculations and mathematical invariants:
 * - Zero attempts state (null averages, 0 counts)
 * - All evaluated attempts (passCount + failCount === evaluatedCount)
 * - Mixed evaluated and unevaluated attempts (unevaluated included in totalAttempts, excluded from scores)
 * - Session-filtered summary statistics
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

describe('Results Summary Statistics Calculations (Integration)', () => {
  let faculty;
  let subject;
  let topic;
  let room;
  let exam;
  let sessionA;
  let sessionB;

  before(async () => {
    const f = await authService.register({
      name: 'Faculty Summary API',
      email: `faculty_summary_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [f.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [f.userId]);
    const fLogin = await authService.login({ email: f.email, password: 'Password123!' });
    faculty = { userId: f.userId, token: fLogin.accessToken };

    const subjectRes = await query(
      `INSERT INTO subjects (code, name, description) VALUES ($1, 'CS-SUMM', 'Summary Stats') RETURNING *;`,
      [`CS-SUMM-${Date.now()}`]
    );
    subject = subjectRes.rows[0];

    const topicRes = await query(
      `INSERT INTO topics (subject_id, name) VALUES ($1, 'Summary Topic') RETURNING *;`,
      [subject.subject_id]
    );
    topic = topicRes.rows[0];

    const qRes = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'MCQ', 'Summary Question 1', 100.00) RETURNING *;`,
      [topic.topic_id]
    );

    await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
       VALUES ($1, 'Correct', true, 0);`,
      [qRes.rows[0].question_id]
    );

    const roomRes = await query(`INSERT INTO rooms (name, capacity) VALUES ($1, 50) RETURNING *;`, [`Room-Summ-${Date.now()}`]);
    room = roomRes.rows[0];

    // Create exam with total 100, passing 50
    exam = await examService.createExam(
      {
        title: 'Summary Stats Exam',
        subject_id: subject.subject_id,
        duration_minutes: 60,
        total_marks: 100.0,
        passing_marks: 50.0
      },
      faculty.userId
    );

    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: topic.topic_id,
        difficulty: 'EASY',
        question_count: 1,
        points_per_question: 100.0
      },
      faculty
    );

    await examService.publishExam(exam.exam_id, faculty);

    const now = new Date();
    const sARes = await query(
      `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *;`,
      [exam.exam_id, room.room_id, new Date(now.getTime() - 3600000), new Date(now.getTime() + 3600000)]
    );
    sessionA = sARes.rows[0];

    const sBRes = await query(
      `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *;`,
      [exam.exam_id, room.room_id, new Date(now.getTime() - 3600000), new Date(now.getTime() + 3600000)]
    );
    sessionB = sBRes.rows[0];
  });

  after(async () => {
    await closePool();
  });

  async function createStudentAttempt(session, score = null) {
    const student = await authService.register({
      name: `Student Summary ${Date.now()} ${Math.random()}`,
      email: `student_summ_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student.userId]);

    await query(`INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, 'ASSIGNED');`, [session.session_id, student.userId]);
    const attempt = await attemptService.startAttempt(session.session_id, { userId: student.userId, roles: ['STUDENT'] });
    await query(`UPDATE exam_attempts SET status = 'SUBMITTED', submitted_at = NOW() WHERE attempt_id = $1;`, [attempt.attempt_id]);

    if (score !== null) {
      await query(
        `INSERT INTO results (attempt_id, score, correct_count, wrong_count, unanswered_count, evaluated_at)
         VALUES ($1, $2, 1, 0, 0, NOW());`,
        [attempt.attempt_id, score]
      );
    }

    return attempt;
  }

  it('should return default zero-state structure when exam has zero attempts', async () => {
    // Create an unattempted exam
    const emptyExam = await examService.createExam(
      {
        title: 'Empty Exam',
        subject_id: subject.subject_id,
        duration_minutes: 60,
        total_marks: 100.0,
        passing_marks: 50.0
      },
      faculty.userId
    );

    const res = await request(app)
      .get(`/api/v1/exams/${emptyExam.exam_id}/results/summary`)
      .set('Authorization', `Bearer ${faculty.token}`);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, {
      examId: emptyExam.exam_id,
      totalAttempts: 0,
      evaluatedCount: 0,
      passCount: 0,
      failCount: 0,
      averageScore: null,
      highestScore: null,
      lowestScore: null
    });
  });

  it('should compute summary stats accurately for evaluated attempts', async () => {
    // Session A: 2 passed (80, 90), 1 failed (30)
    await createStudentAttempt(sessionA, 80.0);
    await createStudentAttempt(sessionA, 90.0);
    await createStudentAttempt(sessionA, 30.0);

    // Session B: 1 passed (60), 1 failed (40)
    await createStudentAttempt(sessionB, 60.0);
    await createStudentAttempt(sessionB, 40.0);

    // Total evaluated = 5 (scores: 90, 80, 60, 40, 30; sum = 300, avg = 60.0)
    // passCount (>= 50): 3 (90, 80, 60)
    // failCount (< 50): 2 (40, 30)
    const res = await request(app)
      .get(`/api/v1/exams/${exam.exam_id}/results/summary`)
      .set('Authorization', `Bearer ${faculty.token}`);

    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.equal(data.totalAttempts, 5);
    assert.equal(data.evaluatedCount, 5);
    assert.equal(data.passCount, 3);
    assert.equal(data.failCount, 2);
    assert.equal(data.passCount + data.failCount, data.evaluatedCount);
    assert.equal(data.averageScore, 60.0);
    assert.equal(data.highestScore, 90.0);
    assert.equal(data.lowestScore, 30.0);
  });

  it('should exclude unevaluated attempts from score averages but count in totalAttempts', async () => {
    // Add an unevaluated attempt (result = null) to Session A
    await createStudentAttempt(sessionA, null);

    const res = await request(app)
      .get(`/api/v1/exams/${exam.exam_id}/results/summary`)
      .set('Authorization', `Bearer ${faculty.token}`);

    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.equal(data.totalAttempts, 6); // 5 evaluated + 1 unevaluated
    assert.equal(data.evaluatedCount, 5);
    assert.equal(data.passCount, 3);
    assert.equal(data.failCount, 2);
    assert.equal(data.averageScore, 60.0); // Unevaluated attempt does not skew average!
  });

  it('should filter summary statistics by sessionId when provided', async () => {
    // Query only Session B: 2 attempts (60, 40)
    const res = await request(app)
      .get(`/api/v1/exams/${exam.exam_id}/results/summary?sessionId=${sessionB.session_id}`)
      .set('Authorization', `Bearer ${faculty.token}`);

    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.equal(data.totalAttempts, 2);
    assert.equal(data.evaluatedCount, 2);
    assert.equal(data.passCount, 1);
    assert.equal(data.failCount, 1);
    assert.equal(data.averageScore, 50.0); // (60 + 40) / 2
    assert.equal(data.highestScore, 60.0);
    assert.equal(data.lowestScore, 40.0);
  });
});
