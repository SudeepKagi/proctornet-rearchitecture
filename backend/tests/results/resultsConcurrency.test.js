/**
 * @file resultsConcurrency.test.js
 * @description Concurrency and Policy Immutability tests:
 * - Concurrent manual publication calls (atomic lock, idempotent completion)
 * - Exam state machine validation for publication (rejects DRAFT/LIVE, allows ENDED/EVALUATED)
 * - Policy immutability once results have become candidate-visible (409 RESULT_ALREADY_RELEASED)
 * - Policy mutation allowed while exam is LIVE even if evaluated results exist (Correction 7)
 * - Scheduled release boundary and past release time validation (422 INVALID_RELEASE_TIME)
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

describe('Results Concurrency & Policy Immutability (Integration)', () => {
  let faculty;
  let admin;
  let subject;
  let topic;
  let room;

  before(async () => {
    const f = await authService.register({
      name: 'Faculty Concurrency',
      email: `faculty_conc_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [f.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [f.userId]);
    const fLogin = await authService.login({ email: f.email, password: 'Password123!' });
    faculty = { userId: f.userId, token: fLogin.accessToken };

    const adm = await authService.register({
      name: 'Admin Concurrency',
      email: `admin_conc_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING;`, [adm.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [adm.userId]);
    const admLogin = await authService.login({ email: adm.email, password: 'Password123!' });
    admin = { userId: adm.userId, token: admLogin.accessToken };

    const subjectRes = await query(
      `INSERT INTO subjects (code, name, description) VALUES ($1, 'CS-CONC', 'Concurrency Tests') RETURNING *;`,
      [`CS-CONC-${Date.now()}`]
    );
    subject = subjectRes.rows[0];

    const topicRes = await query(
      `INSERT INTO topics (subject_id, name) VALUES ($1, 'Concurrency Topic') RETURNING *;`,
      [subject.subject_id]
    );
    topic = topicRes.rows[0];

    const qRes = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'MCQ', 'Concurrency Q1', 10.00) RETURNING *;`,
      [topic.topic_id]
    );

    await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
       VALUES ($1, 'True', true, 0);`,
      [qRes.rows[0].question_id]
    );

    const roomRes = await query(`INSERT INTO rooms (name, capacity) VALUES ($1, 50) RETURNING *;`, [`Room-Conc-${Date.now()}`]);
    room = roomRes.rows[0];
  });

  after(async () => {
    await closePool();
  });

  async function createExamWithStatus(status, policy = 'MANUAL') {
    const exam = await examService.createExam(
      {
        title: `Conc Exam ${status} ${Date.now()}`,
        subject_id: subject.subject_id,
        duration_minutes: 60,
        total_marks: 10.0,
        passing_marks: 5.0
      },
      faculty.userId
    );

    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: topic.topic_id,
        difficulty: 'EASY',
        question_count: 1,
        points_per_question: 10.0
      },
      faculty
    );

    await examService.publishExam(exam.exam_id, faculty);

    await query(
      `UPDATE exams SET status = $1, results_release_policy = $2, updated_at = NOW() WHERE exam_id = $3;`,
      [status, policy, exam.exam_id]
    );

    return exam;
  }

  describe('Manual Publication Concurrency & State Machine', () => {
    it('should reject publication if exam is in LIVE status (409 INVALID_STATE_TRANSITION)', async () => {
      const exam = await createExamWithStatus('LIVE');

      const res = await request(app)
        .post(`/api/v1/exams/${exam.exam_id}/results/publish`)
        .set('Authorization', `Bearer ${faculty.token}`);

      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'INVALID_STATE_TRANSITION');
    });

    it('should handle concurrent publish requests safely and idempotently', async () => {
      const exam = await createExamWithStatus('ENDED');

      // Launch 5 concurrent publish requests
      const publishPromises = Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/v1/exams/${exam.exam_id}/results/publish`)
          .set('Authorization', `Bearer ${faculty.token}`)
      );

      const responses = await Promise.all(publishPromises);

      // All requests should succeed with 200 OK
      for (const res of responses) {
        assert.equal(res.status, 200);
        assert.equal(res.body.data.status, 'RESULT_PUBLISHED');
        assert.ok(res.body.data.resultsPublishedAt);
      }

      // Check database state
      const dbRes = await query(`SELECT status, results_published_at FROM exams WHERE exam_id = $1;`, [exam.exam_id]);
      assert.equal(dbRes.rows[0].status, 'RESULT_PUBLISHED');
      assert.ok(dbRes.rows[0].results_published_at);
    });
  });

  describe('Policy Immutability & Mutation Validation', () => {
    it('should reject past scheduled release time with 422 INVALID_RELEASE_TIME', async () => {
      const exam = await createExamWithStatus('PUBLISHED');
      const pastTime = new Date(Date.now() - 3600000).toISOString();

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.exam_id}/results/policy`)
        .set('Authorization', `Bearer ${faculty.token}`)
        .send({
          resultsReleasePolicy: 'SCHEDULED',
          resultsReleaseAt: pastTime
        });

      assert.equal(res.status, 422);
      assert.equal(res.body.error.code, 'INVALID_RELEASE_TIME');
    });

    it('should allow valid policy update before results are released', async () => {
      const exam = await createExamWithStatus('PUBLISHED');
      const futureTime = new Date(Date.now() + 86400000).toISOString();

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.exam_id}/results/policy`)
        .set('Authorization', `Bearer ${faculty.token}`)
        .send({
          resultsReleasePolicy: 'SCHEDULED',
          resultsReleaseAt: futureTime
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.resultsReleasePolicy, 'SCHEDULED');
      assert.ok(res.body.data.resultsReleaseAt);
    });

    it('CORRECTION 7: should ALLOW policy mutation while exam is LIVE even if evaluated results exist', async () => {
      // In Correction 7, while exam is LIVE, evaluated results are NOT candidate-visible under IMMEDIATE.
      // Therefore, policy changes must NOT be rejected prematurely!
      const exam = await createExamWithStatus('LIVE', 'IMMEDIATE');

      const sessionRes = await query(
        `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
         VALUES ($1, $2, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour', 'ACTIVE') RETURNING *;`,
        [exam.exam_id, room.room_id]
      );
      const session = sessionRes.rows[0];

      // Add student attempt with evaluated result
      const student = await authService.register({
        name: `Student Conc ${Date.now()}`,
        email: `student_conc_${Date.now()}@example.com`,
        password: 'Password123!'
      });
      await query(`INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, 'ASSIGNED');`, [session.session_id, student.userId]);
      const attempt = await attemptService.startAttempt(session.session_id, { userId: student.userId, roles: ['STUDENT'] });
      await query(`UPDATE exam_attempts SET status = 'SUBMITTED', submitted_at = NOW() WHERE attempt_id = $1;`, [attempt.attempt_id]);
      await query(`INSERT INTO results (attempt_id, score, correct_count, wrong_count, unanswered_count, evaluated_at) VALUES ($1, 10, 1, 0, 0, NOW());`, [attempt.attempt_id]);

      // Mutation from IMMEDIATE to MANUAL while still LIVE should succeed!
      const res = await request(app)
        .patch(`/api/v1/exams/${exam.exam_id}/results/policy`)
        .set('Authorization', `Bearer ${faculty.token}`)
        .send({
          resultsReleasePolicy: 'MANUAL'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.resultsReleasePolicy, 'MANUAL');
    });

    it('should reject policy mutation once exam results have become candidate-visible (409 RESULT_ALREADY_RELEASED)', async () => {
      // Create exam in PUBLISHED state first
      const exam = await createExamWithStatus('PUBLISHED', 'IMMEDIATE');

      const sessionRes = await query(
        `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
         VALUES ($1, $2, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour', 'ACTIVE') RETURNING *;`,
        [exam.exam_id, room.room_id]
      );
      const session = sessionRes.rows[0];

      const student = await authService.register({
        name: `Student Vis ${Date.now()}`,
        email: `student_vis_${Date.now()}@example.com`,
        password: 'Password123!'
      });
      await query(`INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, 'ASSIGNED');`, [session.session_id, student.userId]);
      const attempt = await attemptService.startAttempt(session.session_id, { userId: student.userId, roles: ['STUDENT'] });
      await query(`UPDATE exam_attempts SET status = 'SUBMITTED', submitted_at = NOW() WHERE attempt_id = $1;`, [attempt.attempt_id]);
      await query(`INSERT INTO results (attempt_id, score, correct_count, wrong_count, unanswered_count, evaluated_at) VALUES ($1, 10, 1, 0, 0, NOW());`, [attempt.attempt_id]);

      // Conclude exam (ENDED) with IMMEDIATE policy and evaluated result -> candidate visibility granted!
      await query(`UPDATE exams SET status = 'ENDED' WHERE exam_id = $1;`, [exam.exam_id]);

      // Attempting to change policy must be blocked with 409
      const res = await request(app)
        .patch(`/api/v1/exams/${exam.exam_id}/results/policy`)
        .set('Authorization', `Bearer ${faculty.token}`)
        .send({
          resultsReleasePolicy: 'MANUAL'
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'RESULT_ALREADY_RELEASED');
    });

    it('should reject policy mutation on already RESULT_PUBLISHED exam (409 RESULT_ALREADY_RELEASED)', async () => {
      const exam = await createExamWithStatus('RESULT_PUBLISHED');
      await query(`UPDATE exams SET results_published_at = NOW() WHERE exam_id = $1;`, [exam.exam_id]);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.exam_id}/results/policy`)
        .set('Authorization', `Bearer ${faculty.token}`)
        .send({
          resultsReleasePolicy: 'MANUAL'
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'RESULT_ALREADY_RELEASED');
    });
  });
});
