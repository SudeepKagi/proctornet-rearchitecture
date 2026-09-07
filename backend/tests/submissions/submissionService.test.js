/**
 * @file submissionService.test.js
 * @description Unit and Integration tests for Submissions Service:
 * - ACTIVE -> SUBMITTED state transition
 * - Mandatory Idempotency-Key validation
 * - Idempotent replay with same key and fingerprint
 * - Rejection of key reuse with modified payload (409 IDEMPOTENCY_KEY_REUSE)
 * - Rejection of submission on already submitted attempt (409 ATTEMPT_ALREADY_SUBMITTED)
 * - Final dirty answers under OCC rules (insert on rev 0, update on rev K)
 * - Rollback of submission if dirty answer has OCC version conflict
 * - Authoritative deadline enforcement (ACTIVE -> EXPIRED with ATTEMPT_EXPIRED event)
 * - Concurrency handling
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as sessionService from '../../src/modules/sessions/sessions.service.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';
import * as answersService from '../../src/modules/answers/answers.service.js';
import * as submissionsService from '../../src/modules/submissions/submissions.service.js';
import { ConflictError, BadRequestError, ForbiddenError } from '../../src/utils/errors.js';

describe('Submissions Service (Integration)', () => {
  let facultyUser;
  let exam;
  let session;
  let mcqQuestion;
  let opt1A;
  let opt1B;

  /**
   * Helper to create and assign a new student, then start an active attempt
   */
  async function createStudentWithAttempt() {
    const student = await authService.register({
      name: `Student Sub ${Date.now()} ${Math.random()}`,
      email: `student_sub_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      password: 'Password123!'
    });
    const studentUser = { userId: student.userId, roles: ['STUDENT'] };

    await sessionService.assignStudents(session.session_id, [studentUser.userId], facultyUser);
    const attempt = await attemptService.startAttempt(session.session_id, studentUser);

    return { studentUser, attempt };
  }

  before(async () => {
    // 1. Create Faculty
    const faculty = await authService.register({
      name: 'Faculty Submissions Test',
      email: `faculty_sub_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY'] };

    // 2. Create Subject & Topic
    const subRes = await query(
      `INSERT INTO subjects (name, code) VALUES ($1, $2) RETURNING *;`,
      [`Sub Subject ${Date.now()}`, `SUB_${Date.now().toString().slice(-4)}`]
    );
    const subject = subRes.rows[0];

    const topRes = await query(
      `INSERT INTO topics (subject_id, name) VALUES ($1, $2) RETURNING *;`,
      [subject.subject_id, 'Submission Topics']
    );
    const topic = topRes.rows[0];

    // 3. Create MCQ Question
    const qRes = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'MCQ', 'What is 2+2?', 2.00) RETURNING *;`,
      [topic.topic_id]
    );
    mcqQuestion = qRes.rows[0];

    const optRes = await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
       VALUES ($1, '3', false, 0), ($1, '4', true, 1)
       RETURNING *;`,
      [mcqQuestion.question_id]
    );
    opt1A = optRes.rows.find((o) => !o.is_correct);
    opt1B = optRes.rows.find((o) => o.is_correct);

    // 4. Create Exam & Configure Topic Rule
    exam = await examService.createExam(
      {
        title: `Submission Test Exam ${Date.now()}`,
        subject_id: subject.subject_id,
        duration_minutes: 30,
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
    const roomRes = await query(`INSERT INTO rooms (name, capacity) VALUES ($1, 50) RETURNING *;`, [`Room Sub ${Date.now()}`]);
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
  });

  after(async () => {
    // Wait for any background setImmediate outbox triggers to finish before pool closure
    await new Promise((resolve) => setTimeout(resolve, 200));
    await closeRedis();
    await closePool();
  });

  it('should reject submission if Idempotency-Key is missing or empty', async () => {
    const { studentUser, attempt } = await createStudentWithAttempt();

    await assert.rejects(
      async () => {
        await submissionsService.submitAttempt(attempt.attempt_id, '', {}, studentUser);
      },
      (err) => {
        assert.ok(err instanceof BadRequestError);
        assert.equal(err.code, 'BAD_REQUEST');
        assert.equal(err.details, 'MISSING_IDEMPOTENCY_KEY');
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await submissionsService.submitAttempt(attempt.attempt_id, '   ', {}, studentUser);
      },
      (err) => {
        assert.ok(err instanceof BadRequestError);
        assert.equal(err.code, 'BAD_REQUEST');
        assert.equal(err.details, 'MISSING_IDEMPOTENCY_KEY');
        return true;
      }
    );
  });

  it('should reject submission by non-owner candidate (BOLA defense)', async () => {
    const { attempt } = await createStudentWithAttempt();
    const otherStudent = await authService.register({
      name: `Other Student ${Date.now()}`,
      email: `other_sub_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    const otherStudentUser = { userId: otherStudent.userId, roles: ['STUDENT'] };

    await assert.rejects(
      async () => {
        await submissionsService.submitAttempt(attempt.attempt_id, 'key-bola-1', {}, otherStudentUser);
      },
      (err) => {
        assert.ok(err instanceof ForbiddenError);
        assert.match(err.message, /cannot submit another candidate/);
        return true;
      }
    );
  });

  it('should successfully submit ACTIVE attempt, creating idempotency record and outbox event', async () => {
    const { studentUser, attempt } = await createStudentWithAttempt();
    const idempotencyKey = `key-${randomUUID()}`;

    const res = await submissionsService.submitAttempt(attempt.attempt_id, idempotencyKey, {}, studentUser);

    assert.equal(res.attempt_id, attempt.attempt_id);
    assert.equal(res.status, 'SUBMITTED');
    assert.ok(res.submitted_at);
    assert.ok(res.server_time);

    // Verify DB attempt row
    const attemptCheck = await query(`SELECT status, submitted_at FROM exam_attempts WHERE attempt_id = $1;`, [attempt.attempt_id]);
    assert.equal(attemptCheck.rows[0].status, 'SUBMITTED');
    assert.ok(attemptCheck.rows[0].submitted_at);

    // Verify submission_idempotency row
    const idempCheck = await query(`SELECT * FROM submission_idempotency WHERE attempt_id = $1;`, [attempt.attempt_id]);
    assert.equal(idempCheck.rows.length, 1);
    assert.equal(idempCheck.rows[0].idempotency_key, idempotencyKey);
    assert.equal(idempCheck.rows[0].user_id, studentUser.userId);

    // Verify outbox_events row
    const outboxCheck = await query(
      `SELECT * FROM outbox_events WHERE aggregate_type = 'ATTEMPT' AND aggregate_id = $1 AND event_type = 'ATTEMPT_SUBMITTED';`,
      [attempt.attempt_id]
    );
    assert.ok(outboxCheck.rows.length >= 1);
    const outboxEvt = outboxCheck.rows[0];
    assert.equal(outboxEvt.retry_count, 0);
  });

  it('should return cached response on idempotent replay with exact same key and payload', async () => {
    const { studentUser, attempt } = await createStudentWithAttempt();
    const idempotencyKey = `key-${randomUUID()}`;

    const res1 = await submissionsService.submitAttempt(attempt.attempt_id, idempotencyKey, {}, studentUser);
    const res2 = await submissionsService.submitAttempt(attempt.attempt_id, idempotencyKey, {}, studentUser);

    assert.deepEqual(res1, res2);

    // Ensure outbox event was NOT duplicated
    const outboxCount = await query(
      `SELECT COUNT(*) as cnt FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ATTEMPT_SUBMITTED';`,
      [attempt.attempt_id]
    );
    assert.equal(Number(outboxCount.rows[0].cnt), 1);
  });

  it('should reject with 409 IDEMPOTENCY_KEY_REUSE if same key used with different payload', async () => {
    const { studentUser, attempt } = await createStudentWithAttempt();
    const idempotencyKey = `key-${randomUUID()}`;

    await submissionsService.submitAttempt(attempt.attempt_id, idempotencyKey, {}, studentUser);

    // Attempt to submit same key with answers payload
    await assert.rejects(
      async () => {
        await submissionsService.submitAttempt(
          attempt.attempt_id,
          idempotencyKey,
          { answers: [{ attempt_question_id: randomUUID(), expected_revision: 0, answer_value: {} }] },
          studentUser
        );
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSE');
        return true;
      }
    );
  });

  it('should reject with 409 ATTEMPT_ALREADY_SUBMITTED if different key used on already submitted attempt', async () => {
    const { studentUser, attempt } = await createStudentWithAttempt();
    const key1 = `key-${randomUUID()}`;
    const key2 = `key-${randomUUID()}`;

    await submissionsService.submitAttempt(attempt.attempt_id, key1, {}, studentUser);

    await assert.rejects(
      async () => {
        await submissionsService.submitAttempt(attempt.attempt_id, key2, {}, studentUser);
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.code, 'ATTEMPT_ALREADY_SUBMITTED');
        return true;
      }
    );
  });

  it('should persist final dirty answers under OCC rules and increment revision', async () => {
    const { studentUser, attempt } = await createStudentWithAttempt();
    const qMapRes = await query(`SELECT attempt_question_id FROM attempt_questions WHERE attempt_id = $1;`, [attempt.attempt_id]);
    const attemptQuestionId = qMapRes.rows[0].attempt_question_id;

    const idempotencyKey = `key-${randomUUID()}`;
    const dirtyAnswers = [
      {
        attempt_question_id: attemptQuestionId,
        expected_revision: 0,
        answer_value: { selected_option_id: opt1B.option_id }
      }
    ];

    const res = await submissionsService.submitAttempt(
      attempt.attempt_id,
      idempotencyKey,
      { answers: dirtyAnswers },
      studentUser
    );

    assert.equal(res.status, 'SUBMITTED');

    // Verify answer is persisted with revision 1
    const ansCheck = await query(`SELECT * FROM answers WHERE attempt_question_id = $1;`, [attemptQuestionId]);
    assert.equal(ansCheck.rows.length, 1);
    assert.equal(ansCheck.rows[0].revision, 1);
    assert.equal(ansCheck.rows[0].answer_value.selected_option_id, opt1B.option_id);
  });

  it('should rollback entire submission if dirty answer fails OCC revision check', async () => {
    const { studentUser, attempt } = await createStudentWithAttempt();
    const qMapRes = await query(`SELECT attempt_question_id FROM attempt_questions WHERE attempt_id = $1;`, [attempt.attempt_id]);
    const attemptQuestionId = qMapRes.rows[0].attempt_question_id;

    // Simulate prior autosave: revision is now 1
    await answersService.saveAnswer(
      attempt.attempt_id,
      attemptQuestionId,
      {
        answer_value: { selected_option_id: opt1A.option_id },
        expected_revision: 0
      },
      studentUser
    );

    // Try to submit with stale expected_revision = 0
    const idempotencyKey = `key-${randomUUID()}`;
    await assert.rejects(
      async () => {
        await submissionsService.submitAttempt(
          attempt.attempt_id,
          idempotencyKey,
          {
            answers: [
              {
                attempt_question_id: attemptQuestionId,
                expected_revision: 0, // stale!
                answer_value: { selected_option_id: opt1B.option_id }
              }
            ]
          },
          studentUser
        );
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.code, 'STALE_REVISION_CONFLICT');
        return true;
      }
    );

    // Verify attempt is STILL ACTIVE! Transaction was rolled back!
    const attemptCheck = await query(`SELECT status FROM exam_attempts WHERE attempt_id = $1;`, [attempt.attempt_id]);
    assert.equal(attemptCheck.rows[0].status, 'ACTIVE');

    // Verify no idempotency record was persisted
    const idempCheck = await query(`SELECT * FROM submission_idempotency WHERE attempt_id = $1;`, [attempt.attempt_id]);
    assert.equal(idempCheck.rows.length, 0);
  });

  it('should transition attempt to EXPIRED and emit ATTEMPT_EXPIRED event if submitted after deadline', async () => {
    const { studentUser, attempt } = await createStudentWithAttempt();

    // Artificially expire the attempt
    await query(
      `UPDATE exam_attempts 
       SET expires_at = CURRENT_TIMESTAMP - interval '10 seconds' 
       WHERE attempt_id = $1;`,
      [attempt.attempt_id]
    );

    const idempotencyKey = `key-${randomUUID()}`;
    await assert.rejects(
      async () => {
        await submissionsService.submitAttempt(attempt.attempt_id, idempotencyKey, {}, studentUser);
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.code, 'ATTEMPT_EXPIRED');
        return true;
      }
    );

    // Verify attempt status is EXPIRED
    const attemptCheck = await query(`SELECT status FROM exam_attempts WHERE attempt_id = $1;`, [attempt.attempt_id]);
    assert.equal(attemptCheck.rows[0].status, 'EXPIRED');

    // Verify outbox has ATTEMPT_EXPIRED event
    const outboxCheck = await query(
      `SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ATTEMPT_EXPIRED';`,
      [attempt.attempt_id]
    );
    assert.equal(outboxCheck.rows.length, 1);
  });

  it('should handle concurrent submissions with the same idempotency key safely', async () => {
    const { studentUser, attempt } = await createStudentWithAttempt();
    const idempotencyKey = `key-${randomUUID()}`;

    // Fire 2 concurrent submissions with same key
    const [res1, res2] = await Promise.all([
      submissionsService.submitAttempt(attempt.attempt_id, idempotencyKey, {}, studentUser),
      submissionsService.submitAttempt(attempt.attempt_id, idempotencyKey, {}, studentUser)
    ]);

    assert.equal(res1.status, 'SUBMITTED');
    assert.equal(res2.status, 'SUBMITTED');
    assert.deepEqual(res1, res2);

    // Exactly one row in outbox
    const outboxCount = await query(
      `SELECT COUNT(*) as cnt FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ATTEMPT_SUBMITTED';`,
      [attempt.attempt_id]
    );
    assert.equal(Number(outboxCount.rows[0].cnt), 1);
  });
});
