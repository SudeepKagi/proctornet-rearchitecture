/**
 * @file evaluationWorker.test.js
 * @description Integration and idempotency tests for EvaluationWorker, evaluation service, and post-result-insert crash recovery.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as sessionService from '../../src/modules/sessions/sessions.service.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';
import * as answersService from '../../src/modules/answers/answers.service.js';
import { EvaluationWorker } from '../../src/modules/evaluation/evaluation.worker.js';
import * as evaluationRepo from '../../src/modules/evaluation/evaluation.repository.js';
import { evaluateAttempt } from '../../src/modules/evaluation/evaluation.service.js';

describe('Evaluation Worker & Result Persistence (Integration)', () => {
  let facultyUser;
  let studentUser;
  let exam;
  let session;
  let attempt;
  let attemptQuestions;
  let worker;

  before(async () => {
    worker = new EvaluationWorker();

    // 1. Create Faculty & Student
    const faculty = await authService.register({
      name: 'Faculty Evaluator Test',
      email: `faculty_eval_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY'] };

    const student = await authService.register({
      name: 'Student Evaluator Test',
      email: `student_eval_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    studentUser = { userId: student.userId, roles: ['STUDENT'] };

    // 2. Create Subject & Topic
    const subRes = await query(
      `INSERT INTO subjects (name, code) VALUES ($1, $2) RETURNING *;`,
      [`Eval Subject ${Date.now()}`, `EVL_${Date.now().toString().slice(-4)}`]
    );
    const subject = subRes.rows[0];

    const topRes = await query(
      `INSERT INTO topics (subject_id, name) VALUES ($1, $2) RETURNING *;`,
      [subject.subject_id, 'Objective Questions']
    );
    const topic = topRes.rows[0];

    // 3. Create Questions: 1 MCQ, 1 TRUE_FALSE, 1 NUMERIC
    // Q1: MCQ (2 points)
    const q1Res = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'MCQ', 'What is 2 + 2?', 2.00) RETURNING *;`,
      [topic.topic_id]
    );
    const q1 = q1Res.rows[0];
    const opt1A = await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES ($1, '3', false, 0) RETURNING *;`,
      [q1.question_id]
    );
    const opt1B = await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES ($1, '4', true, 1) RETURNING *;`,
      [q1.question_id]
    );

    // Q2: TRUE_FALSE (2.0 points)
    const q2Res = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'TRUE_FALSE', 'The Earth is round.', 2.00) RETURNING *;`,
      [topic.topic_id]
    );
    const q2 = q2Res.rows[0];
    const opt2A = await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES ($1, 'True', true, 0) RETURNING *;`,
      [q2.question_id]
    );
    const opt2B = await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES ($1, 'False', false, 1) RETURNING *;`,
      [q2.question_id]
    );

    // Q3: NUMERIC (2 points, correct: 9.81)
    const q3Res = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points, correct_numeric_value)
       VALUES ($1, 'NUMERIC', 'Value of g in m/s^2?', 2.00, 9.81) RETURNING *;`,
      [topic.topic_id]
    );
    const q3 = q3Res.rows[0];

    // 4. Create Exam & Rules
    exam = await examService.createExam(
      {
        subject_id: subject.subject_id,
        title: 'Evaluation Test Exam',
        duration_minutes: 60,
        total_marks: 6.00,
        passing_marks: 3.00
      },
      facultyUser.userId
    );

    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: topic.topic_id,
        question_count: 3,
        points_per_question: 2.00
      },
      facultyUser
    );

    await examService.publishExam(exam.exam_id, facultyUser);

    // 5. Create Session
    const roomRes = await query(`INSERT INTO rooms (name, capacity) VALUES ($1, 50) RETURNING *;`, [`Room Eval ${Date.now()}`]);
    const room = roomRes.rows[0];

    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60000);
    const end = new Date(now.getTime() + 60 * 60000);

    session = await sessionService.createSession(
      {
        exam_id: exam.exam_id,
        room_id: room.room_id,
        scheduled_start_time: start.toISOString(),
        scheduled_end_time: end.toISOString()
      },
      facultyUser
    );

    await sessionService.assignStudents(session.session_id, [studentUser.userId], facultyUser);

    // 6. Start Attempt
    attempt = await attemptService.startAttempt(session.session_id, studentUser);

    // Load mapped questions
    const qRes = await query(
      `SELECT aq.attempt_question_id, q.question_type, q.question_id 
       FROM attempt_questions aq 
       JOIN questions q ON aq.question_id = q.question_id 
       WHERE aq.attempt_id = $1 
       ORDER BY aq.display_order ASC;`,
      [attempt.attempt_id]
    );
    attemptQuestions = qRes.rows;

    // Answer Q1 correctly (MCQ -> opt1B)
    const q1Mapping = attemptQuestions.find((q) => q.question_type === 'MCQ');
    await answersService.saveAnswer(
      attempt.attempt_id,
      q1Mapping.attempt_question_id,
      { answer_value: { selected_option_id: opt1B.rows[0].option_id }, expected_revision: 0 },
      studentUser
    );

    // Answer Q3 correctly (NUMERIC -> 9.81005 < 0.0001 tolerance)
    const q3Mapping = attemptQuestions.find((q) => q.question_type === 'NUMERIC');
    await answersService.saveAnswer(
      attempt.attempt_id,
      q3Mapping.attempt_question_id,
      { answer_value: { numeric_value: 9.81005 }, expected_revision: 0 },
      studentUser
    );

    // Leave Q2 (TRUE_FALSE) UNANSWERED to verify unanswered scoring
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });

  it('should successfully evaluate active/submitted attempt, calculating objective score correctly', async () => {
    const result = await evaluateAttempt(attempt.attempt_id);

    assert.ok(result);
    assert.equal(result.attempt_id, attempt.attempt_id);
    // Q1 MCQ: 2.0, Q3 NUMERIC: 3.0, Q2 Unanswered: 0.0 -> Total = 5.00
    assert.equal(Number(result.score), 4.0);
    assert.equal(result.correct_count, 2);
    assert.equal(result.wrong_count, 0);
    assert.equal(result.unanswered_count, 1);

    // Verify row was persisted in results table
    const inDb = await evaluationRepo.findResultByAttemptId(attempt.attempt_id);
    assert.ok(inDb);
    assert.equal(Number(inDb.score), 4.0);
  });

  it('should handle duplicate worker execution idempotently without throwing or modifying score', async () => {
    const event = {
      event_id: 'evt-test-1',
      aggregate_id: attempt.attempt_id,
      event_type: 'ATTEMPT_SUBMITTED',
      payload: { attempt_id: attempt.attempt_id }
    };

    // Second execution should recognize existing result
    const outcome = await worker.handle(event);

    assert.equal(outcome.alreadyEvaluated, true);
    assert.ok(outcome.result);
    assert.equal(Number(outcome.result.score), 4.0);

    // Verify exactly one row in results for this attempt
    const countRes = await query(`SELECT COUNT(*) as cnt FROM results WHERE attempt_id = $1;`, [attempt.attempt_id]);
    assert.equal(Number(countRes.rows[0].cnt), 1);
  });

  it('should handle post-result-insert crash: worker safely recovers and confirms result without duplicate rows', async () => {
    // Simulate crash scenario where results row was written, but dispatcher crashed before marking PUBLISHED
    // When retry occurs, worker receives event again:
    const retryEvent = {
      event_id: 'evt-test-retry',
      aggregate_id: attempt.attempt_id,
      event_type: 'ATTEMPT_SUBMITTED',
      payload: { attempt_id: attempt.attempt_id }
    };

    const outcome = await worker.handle(retryEvent);

    assert.equal(outcome.alreadyEvaluated, true);
    assert.equal(Number(outcome.result.score), 4.0);

    const countRes = await query(`SELECT COUNT(*) as cnt FROM results WHERE attempt_id = $1;`, [attempt.attempt_id]);
    assert.equal(Number(countRes.rows[0].cnt), 1);
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });
});
