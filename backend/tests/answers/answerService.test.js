/**
 * @file answerService.test.js
 * @description Unit & integration tests for Phase 7 Answers, OCC revision sequence, retry recognition, clear semantics, deadline enforcement, and batch atomicity.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as answerService from '../../src/modules/answers/answers.service.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { AttemptStatus } from '../../src/domain/attempt/attemptStates.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  UnprocessableEntityError
} from '../../src/utils/errors.js';

describe('Answers Service & Concurrency Invariants', () => {
  let facultyUser;
  let otherFacultyUser;
  let adminUser;
  let proctorUser;
  let studentUser1;
  let studentUser2;
  let testSubject;
  let testTopic;
  let publishedExam;
  let activeSession;
  let attempt1;
  let attempt2;
  let attempt1Questions = [];
  let attempt2Questions = [];
  let q1; // MCQ 1
  let q2; // MCQ 2
  let q3; // MCQ 3
  let tfQ; // TRUE_FALSE
  let numQ; // NUMERIC

  before(async () => {
    // 1. Create Users
    const faculty = await authService.register({
      name: 'Prof. AnswerTester',
      email: `faculty_ans_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY'] };

    const otherFaculty = await authService.register({
      name: 'Prof. OtherFaculty',
      email: `other_faculty_ans_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [otherFaculty.userId]);
    otherFacultyUser = { userId: otherFaculty.userId, roles: ['FACULTY'] };

    const admin = await authService.register({
      name: 'Admin AnswerTester',
      email: `admin_ans_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING;`, [admin.userId]);
    adminUser = { userId: admin.userId, roles: ['ADMIN'] };

    const proctor = await authService.register({
      name: 'Proctor AnswerTester',
      email: `proctor_ans_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR') ON CONFLICT DO NOTHING;`, [proctor.userId]);
    proctorUser = { userId: proctor.userId, roles: ['INVIGILATOR'] };

    const student1 = await authService.register({
      name: 'Alice Answers',
      email: `alice_ans_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student1.userId]);
    studentUser1 = { userId: student1.userId, roles: ['STUDENT'] };

    const student2 = await authService.register({
      name: 'Bob Answers',
      email: `bob_ans_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student2.userId]);
    studentUser2 = { userId: student2.userId, roles: ['STUDENT'] };

    // 2. Create Subject and Topic
    const subjectRes = await query(`
      INSERT INTO subjects (code, name, description)
      VALUES ($1, 'CS-ANS', 'Subject for answer tests')
      RETURNING *;
    `, [`CS-ANS-${Date.now()}`]);
    testSubject = subjectRes.rows[0];

    const topicRes = await query(`
      INSERT INTO topics (subject_id, name, description)
      VALUES ($1, 'Concurrency & Databases', 'Answers Test Topic')
      RETURNING *;
    `, [testSubject.subject_id]);
    testTopic = topicRes.rows[0];

    // 3. Seed Questions: 3 MCQ questions, 1 TRUE_FALSE question, 1 NUMERIC question
    for (let i = 1; i <= 3; i++) {
      const qRes = await query(`
        INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
        VALUES ($1, 'MCQ', $2, 2.00)
        RETURNING *;
      `, [testTopic.topic_id, `MCQ Question ${i}`]);

      await query(`
        INSERT INTO question_options (question_id, option_text, is_correct, display_order)
        VALUES 
          ($1, 'Option A (Correct)', true, 0),
          ($1, 'Option B', false, 1),
          ($1, 'Option C', false, 2);
      `, [qRes.rows[0].question_id]);
    }

    const tfRes = await query(`
      INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
      VALUES ($1, 'TRUE_FALSE', 'Is PostgreSQL ACID compliant?', 2.00)
      RETURNING *;
    `, [testTopic.topic_id]);
    await query(`
      INSERT INTO question_options (question_id, option_text, is_correct, display_order)
      VALUES 
        ($1, 'True', true, 0),
        ($1, 'False', false, 1);
    `, [tfRes.rows[0].question_id]);

    await query(`
      INSERT INTO questions (topic_id, question_type, prompt_text, default_points, correct_numeric_value)
      VALUES ($1, 'NUMERIC', 'What is 6 * 7?', 2.00, 42.0000)
      RETURNING *;
    `, [testTopic.topic_id]);

    // 4. Create & Publish Exam: 5 questions from Topic (5 * 2 = 10 total marks)
    const exam = await examService.createExam({
      title: 'Database Concurrency Exam',
      description: 'OCC and Autosave Verification',
      subject_id: testSubject.subject_id,
      duration_minutes: 60,
      total_marks: 10.00,
      passing_marks: 5.00
    }, facultyUser.userId);

    await examService.configureTopicRule(exam.exam_id, {
      topic_id: testTopic.topic_id,
      question_count: 5,
      points_per_question: 2.00
    }, facultyUser);

    publishedExam = await examService.publishExam(exam.exam_id, facultyUser);

    // 5. Create Room and Session
    const roomRes = await query(`
      INSERT INTO rooms (name, capacity, building)
      VALUES ($1, 50, 'Science Complex')
      RETURNING *;
    `, [`Room-Ans-${Date.now()}`]);
    const room = roomRes.rows[0];

    const now = new Date();
    const startTime = new Date(now.getTime() - 10 * 60 * 1000); // 10 mins ago
    const endTime = new Date(now.getTime() + 120 * 60 * 1000);  // 2 hours later

    const sessionRes = await query(`
      INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
      VALUES ($1, $2, $3, $4, 'ACTIVE')
      RETURNING *;
    `, [publishedExam.exam_id, room.room_id, startTime.toISOString(), endTime.toISOString()]);
    activeSession = sessionRes.rows[0];

    // Assign Students and Proctor
    await query(`
      INSERT INTO session_students (session_id, student_id, status)
      VALUES 
        ($1, $2, 'ASSIGNED'),
        ($1, $3, 'ASSIGNED');
    `, [activeSession.session_id, studentUser1.userId, studentUser2.userId]);

    await query(`
      INSERT INTO session_invigilators (session_id, user_id, role)
      VALUES ($1, $2, 'PRIMARY');
    `, [activeSession.session_id, proctorUser.userId]);

    // 6. Start Attempts for Student 1 and Student 2
    const startResult1 = await attemptService.startAttempt(activeSession.session_id, studentUser1);
    attempt1 = startResult1;

    const startResult2 = await attemptService.startAttempt(activeSession.session_id, studentUser2);
    attempt2 = startResult2;

    // Fetch mapped attempt questions
    const qRes1 = await attemptService.getAttemptQuestions(attempt1.attempt_id, studentUser1);
    attempt1Questions = qRes1.questions;

    const qRes2 = await attemptService.getAttemptQuestions(attempt2.attempt_id, studentUser2);
    attempt2Questions = qRes2.questions;

    const mcqQuestions = attempt1Questions.filter((q) => q.question_type === 'MCQ');
    q1 = mcqQuestions[0];
    q2 = mcqQuestions[1];
    q3 = mcqQuestions[2];
    tfQ = attempt1Questions.find((q) => q.question_type === 'TRUE_FALSE');
    numQ = attempt1Questions.find((q) => q.question_type === 'NUMERIC');
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });

  // --- 1. FIRST SAVE & UNANSWERED OCC INVARIANTS ---

  it('saves first answer on unanswered question (expected_revision = 0 -> creates revision 1)', async () => {
    const optionA = q1.options[0];

    const result = await answerService.saveAnswer(
      attempt1.attempt_id,
      q1.attempt_question_id,
      {
        answer_value: { selected_option_id: optionA.option_id },
        expected_revision: 0
      },
      studentUser1
    );

    assert.ok(result.answer_id);
    assert.strictEqual(result.attempt_question_id, q1.attempt_question_id);
    assert.strictEqual(result.revision, 1);
    assert.strictEqual(result.answer_value.selected_option_id, optionA.option_id);
    assert.ok(result.saved_at);
    assert.ok(result.server_time);
  });

  it('rejects non-zero expected_revision on unanswered question with 409 Conflict', async () => {
    const optionA = q2.options[0];

    await assert.rejects(
      async () => {
        await answerService.saveAnswer(
          attempt1.attempt_id,
          q2.attempt_question_id,
          {
            answer_value: { selected_option_id: optionA.option_id },
            expected_revision: 1 // Invalid: question is unanswered, expected_revision MUST be 0
          },
          studentUser1
        );
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'STALE_REVISION_CONFLICT');
        return true;
      }
    );
  });

  // --- 2. SUBSEQUENT UPDATE & OCC REVISION SEQUENCE ---

  it('updates existing answer at revision 1 with expected_revision = 1 -> creates revision 2', async () => {
    const optionB = q1.options[1];

    const result = await answerService.saveAnswer(
      attempt1.attempt_id,
      q1.attempt_question_id,
      {
        answer_value: { selected_option_id: optionB.option_id },
        expected_revision: 1
      },
      studentUser1
    );

    assert.strictEqual(result.revision, 2);
    assert.strictEqual(result.answer_value.selected_option_id, optionB.option_id);
  });

  // --- 3. REVISION-AWARE PAYLOAD-BASED RETRY HANDLING ---

  it('recognizes idempotent retry with expected_revision = K - 1 and same payload -> returns revision K without incrementing', async () => {
    const optionB = q1.options[1]; // Current saved value at revision 2

    // Client retries request with expected_revision = 1 and same payload (Option B)
    const result = await answerService.saveAnswer(
      attempt1.attempt_id,
      q1.attempt_question_id,
      {
        answer_value: { selected_option_id: optionB.option_id },
        expected_revision: 1
      },
      studentUser1
    );

    assert.strictEqual(result.revision, 2, 'Revision should remain 2 and NOT increment to 3');
    assert.strictEqual(result.answer_value.selected_option_id, optionB.option_id);
  });

  it('rejects stale revision with different payload with 409 Conflict', async () => {
    const optionC = q1.options[2]; // Different payload

    // Current revision is 2. Client sends expected_revision = 1 with different payload
    await assert.rejects(
      async () => {
        await answerService.saveAnswer(
          attempt1.attempt_id,
          q1.attempt_question_id,
          {
            answer_value: { selected_option_id: optionC.option_id },
            expected_revision: 1
          },
          studentUser1
        );
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'STALE_REVISION_CONFLICT');
        return true;
      }
    );
  });

  it('rejects future revision with 409 Conflict', async () => {
    const optionA = q1.options[0];

    // Current revision is 2. Client sends expected_revision = 5
    await assert.rejects(
      async () => {
        await answerService.saveAnswer(
          attempt1.attempt_id,
          q1.attempt_question_id,
          {
            answer_value: { selected_option_id: optionA.option_id },
            expected_revision: 5
          },
          studentUser1
        );
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'STALE_REVISION_CONFLICT');
        return true;
      }
    );
  });

  // --- 4. CONCURRENT UPDATE RACE ---

  it('handles concurrent updates: two requests at expected_revision = 2 with different payloads -> exactly one succeeds (rev 3), one receives 409', async () => {
    const optionA = q1.options[0];
    const optionC = q1.options[2];

    const results = await Promise.allSettled([
      answerService.saveAnswer(
        attempt1.attempt_id,
        q1.attempt_question_id,
        { answer_value: { selected_option_id: optionA.option_id }, expected_revision: 2 },
        studentUser1
      ),
      answerService.saveAnswer(
        attempt1.attempt_id,
        q1.attempt_question_id,
        { answer_value: { selected_option_id: optionC.option_id }, expected_revision: 2 },
        studentUser1
      )
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent request must succeed');
    assert.strictEqual(rejected.length, 1, 'Exactly one concurrent request must fail');
    assert.strictEqual(fulfilled[0].value.revision, 3);
    assert.strictEqual(rejected[0].reason.statusCode, 409);
    assert.strictEqual(rejected[0].reason.code, 'STALE_REVISION_CONFLICT');
  });

  // --- 5. OCC CLEAR-ANSWER SEMANTICS ---

  it('clears an existing answer with matching expected_revision -> deletes row and returns cleared = true', async () => {
    // Currently at revision 3
    const clearResult = await answerService.clearAnswer(
      attempt1.attempt_id,
      q1.attempt_question_id,
      { expected_revision: 3 },
      studentUser1
    );

    assert.strictEqual(clearResult.cleared, true);
    assert.strictEqual(clearResult.attempt_question_id, q1.attempt_question_id);
    assert.ok(clearResult.server_time);

    // Verify row is deleted in DB
    const answersList = await answerService.getAnswersForAttempt(attempt1.attempt_id, studentUser1);
    const found = answersList.answers.find((a) => a.attempt_question_id === q1.attempt_question_id);
    assert.strictEqual(found, undefined, 'Cleared answer row must not exist in answers table');
  });

  it('rejects stale clear request with 409 Conflict', async () => {
    // First save q2 to revision 1
    const opt = q2.options[0];
    await answerService.saveAnswer(
      attempt1.attempt_id,
      q2.attempt_question_id,
      { answer_value: { selected_option_id: opt.option_id }, expected_revision: 0 },
      studentUser1
    );

    // Attempt to clear q2 with expected_revision = 5
    await assert.rejects(
      async () => {
        await answerService.clearAnswer(
          attempt1.attempt_id,
          q2.attempt_question_id,
          { expected_revision: 5 },
          studentUser1
        );
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'STALE_REVISION_CONFLICT');
        return true;
      }
    );
  });

  it('repeated clear on already-unanswered question with expected_revision = 0 is safe and idempotent (200 cleared = true)', async () => {
    // q1 is already cleared
    const clearResult = await answerService.clearAnswer(
      attempt1.attempt_id,
      q1.attempt_question_id,
      { expected_revision: 0 },
      studentUser1
    );

    assert.strictEqual(clearResult.cleared, true);
  });

  it('rejects clear on unanswered question if expected_revision > 0 with 409 Conflict', async () => {
    // q1 is currently unanswered
    await assert.rejects(
      async () => {
        await answerService.clearAnswer(
          attempt1.attempt_id,
          q1.attempt_question_id,
          { expected_revision: 1 },
          studentUser1
        );
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'STALE_REVISION_CONFLICT');
        return true;
      }
    );
  });

  it('post-clear re-save requires expected_revision = 0 and creates revision 1', async () => {
    const optionA = q1.options[0];

    const result = await answerService.saveAnswer(
      attempt1.attempt_id,
      q1.attempt_question_id,
      {
        answer_value: { selected_option_id: optionA.option_id },
        expected_revision: 0
      },
      studentUser1
    );

    assert.strictEqual(result.revision, 1);
    assert.strictEqual(result.answer_value.selected_option_id, optionA.option_id);
  });

  // --- 6. QUESTION-TYPE VALIDATIONS ---

  it('validates TRUE_FALSE question type option existence', async () => {
    assert.ok(tfQ);
    const trueOption = tfQ.options.find((o) => o.option_text === 'True');

    const result = await answerService.saveAnswer(
      attempt1.attempt_id,
      tfQ.attempt_question_id,
      {
        answer_value: { selected_option_id: trueOption.option_id },
        expected_revision: 0
      },
      studentUser1
    );

    assert.strictEqual(result.revision, 1);
  });

  it('rejects foreign option UUID for MCQ with 422 Unprocessable Entity', async () => {
    const foreignOptionId = '00000000-0000-0000-0000-000000000999';

    await assert.rejects(
      async () => {
        await answerService.saveAnswer(
          attempt1.attempt_id,
          q1.attempt_question_id,
          {
            answer_value: { selected_option_id: foreignOptionId },
            expected_revision: 1
          },
          studentUser1
        );
      },
      (err) => {
        assert.ok(err instanceof UnprocessableEntityError);
        assert.strictEqual(err.statusCode, 422);
        return true;
      }
    );
  });

  it('validates NUMERIC question type with finite number', async () => {
    assert.ok(numQ);

    const result = await answerService.saveAnswer(
      attempt1.attempt_id,
      numQ.attempt_question_id,
      {
        answer_value: { numeric_value: 42.0 },
        expected_revision: 0
      },
      studentUser1
    );

    assert.strictEqual(result.revision, 1);
    assert.strictEqual(result.answer_value.numeric_value, 42.0);
  });

  it('rejects non-numeric or non-finite value for NUMERIC question with 422 Unprocessable Entity', async () => {
    assert.ok(numQ);

    await assert.rejects(
      async () => {
        await answerService.saveAnswer(
          attempt1.attempt_id,
          numQ.attempt_question_id,
          {
            answer_value: { numeric_value: 'forty-two' },
            expected_revision: 1
          },
          studentUser1
        );
      },
      (err) => {
        assert.ok(err instanceof UnprocessableEntityError);
        assert.strictEqual(err.statusCode, 422);
        return true;
      }
    );
  });

  // --- 7. QUESTION MAPPING & ATTEMPT GUARDS ---

  it('rejects save when attempt_question_id belongs to another attempt with 404 Not Found', async () => {
    const foreignQ = attempt2Questions.find((q) => q.question_type === 'MCQ');

    await assert.rejects(
      async () => {
        await answerService.saveAnswer(
          attempt1.attempt_id,
          foreignQ.attempt_question_id,
          {
            answer_value: { selected_option_id: foreignQ.options[0].option_id },
            expected_revision: 0
          },
          studentUser1
        );
      },
      (err) => {
        assert.ok(err instanceof NotFoundError);
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );
  });

  it('rejects answer modification when attempt is not in ACTIVE state with 409 Conflict', async () => {
    const student3 = await authService.register({
      name: 'Charlie InactiveTester',
      email: `charlie_inactive_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student3.userId]);
    const studentUser3 = { userId: student3.userId, roles: ['STUDENT'] };

    await query(`
      INSERT INTO session_students (session_id, student_id, status)
      VALUES ($1, $2, 'ASSIGNED');
    `, [activeSession.session_id, student3.userId]);

    const submittedAttemptRes = await query(`
      INSERT INTO exam_attempts (session_id, student_id, status, started_at, expires_at, submitted_at)
      VALUES ($1, $2, 'SUBMITTED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP)
      RETURNING *;
    `, [activeSession.session_id, student3.userId]);
    const submittedAttempt = submittedAttemptRes.rows[0];

    const aqRes = await query(`
      INSERT INTO attempt_questions (attempt_id, question_id, display_order)
      VALUES ($1, $2, 99)
      RETURNING *;
    `, [submittedAttempt.attempt_id, q1.question_id]);
    const aq = aqRes.rows[0];

    await assert.rejects(
      async () => {
        await answerService.saveAnswer(
          submittedAttempt.attempt_id,
          aq.attempt_question_id,
          {
            answer_value: { selected_option_id: q1.options[0].option_id },
            expected_revision: 0
          },
          studentUser3
        );
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'ATTEMPT_NOT_ACTIVE');
        return true;
      }
    );
  });

  // --- 8. AUTHORITATIVE DEADLINE ENFORCEMENT ---

  it('enforces authoritative server deadline: transitions attempt to EXPIRED and rejects save with 409 Conflict', async () => {
    // Set attempt2's expires_at to 10 seconds in the past
    await query(`
      UPDATE exam_attempts
      SET expires_at = CURRENT_TIMESTAMP - INTERVAL '10 seconds'
      WHERE attempt_id = $1;
    `, [attempt2.attempt_id]);

    const q = attempt2Questions.find((q) => q.question_type === 'MCQ');

    await assert.rejects(
      async () => {
        await answerService.saveAnswer(
          attempt2.attempt_id,
          q.attempt_question_id,
          {
            answer_value: { selected_option_id: q.options[0].option_id },
            expected_revision: 0
          },
          studentUser2
        );
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'ATTEMPT_EXPIRED');
        return true;
      }
    );

    // Verify attempt transitioned to EXPIRED
    const checkRes = await query(`SELECT status FROM exam_attempts WHERE attempt_id = $1;`, [attempt2.attempt_id]);
    assert.strictEqual(checkRes.rows[0].status, AttemptStatus.EXPIRED);
  });

  // --- 9. BATCH AUTOSAVE ATOMICITY & DUPLICATE REJECTION ---

  it('rejects batch containing duplicate attempt_question_id with 400 Bad Request and zero modifications', async () => {
    await assert.rejects(
      async () => {
        await answerService.batchSaveAnswers(
          attempt1.attempt_id,
          {
            answers: [
              { attempt_question_id: q1.attempt_question_id, answer_value: { selected_option_id: q1.options[0].option_id }, expected_revision: 1 },
              { attempt_question_id: q1.attempt_question_id, answer_value: { selected_option_id: q1.options[1].option_id }, expected_revision: 1 }
            ]
          },
          studentUser1
        );
      },
      (err) => {
        assert.ok(err instanceof BadRequestError);
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });

  it('executes batch autosave successfully across multiple questions', async () => {
    // q2 is currently at rev 1 (saved earlier in stale clear test), q3 is unanswered (rev 0)
    const result = await answerService.batchSaveAnswers(
      attempt1.attempt_id,
      {
        answers: [
          {
            attempt_question_id: q2.attempt_question_id,
            answer_value: { selected_option_id: q2.options[1].option_id },
            expected_revision: 1
          },
          {
            attempt_question_id: q3.attempt_question_id,
            answer_value: { selected_option_id: q3.options[0].option_id },
            expected_revision: 0
          }
        ]
      },
      studentUser1
    );

    assert.strictEqual(result.saved_count, 2);
    assert.ok(result.server_time);
    assert.strictEqual(result.answers.length, 2);
  });

  it('rolls back entire batch if any item has a stale revision (all-or-nothing atomicity)', async () => {
    // q1 is currently revision 1
    // q3 is currently revision 1

    // Attempt a batch where q1 has valid expected_revision = 1, but q3 has invalid expected_revision = 99
    await assert.rejects(
      async () => {
        await answerService.batchSaveAnswers(
          attempt1.attempt_id,
          {
            answers: [
              {
                attempt_question_id: q1.attempt_question_id,
                answer_value: { selected_option_id: q1.options[1].option_id },
                expected_revision: 1 // Valid
              },
              {
                attempt_question_id: q3.attempt_question_id,
                answer_value: { selected_option_id: q3.options[1].option_id },
                expected_revision: 99 // Invalid stale
              }
            ]
          },
          studentUser1
        );
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'STALE_REVISION_CONFLICT');
        return true;
      }
    );

    // Verify q1 was NOT updated (remained revision 1)
    const answersList = await answerService.getAnswersForAttempt(attempt1.attempt_id, studentUser1);
    const q1Ans = answersList.answers.find((a) => a.attempt_question_id === q1.attempt_question_id);
    assert.strictEqual(q1Ans.revision, 1, 'q1 must remain at revision 1 due to batch rollback');
  });

  // --- 10. AUTHORIZATION & READ ACCESS ---

  it('allows owner student, exam creator faculty, assigned invigilator, and admin to read answers', async () => {
    // 1. Owner Student
    const studentRes = await answerService.getAnswersForAttempt(attempt1.attempt_id, studentUser1);
    assert.strictEqual(studentRes.attempt_id, attempt1.attempt_id);
    assert.ok(studentRes.answers.length > 0);

    // 2. Exam Creator Faculty
    const facultyRes = await answerService.getAnswersForAttempt(attempt1.attempt_id, facultyUser);
    assert.strictEqual(facultyRes.attempt_id, attempt1.attempt_id);

    // 3. Assigned Invigilator
    const proctorRes = await answerService.getAnswersForAttempt(attempt1.attempt_id, proctorUser);
    assert.strictEqual(proctorRes.attempt_id, attempt1.attempt_id);

    // 4. Admin
    const adminRes = await answerService.getAnswersForAttempt(attempt1.attempt_id, adminUser);
    assert.strictEqual(adminRes.attempt_id, attempt1.attempt_id);
  });

  it('rejects unauthorized users from reading answers with 403 Forbidden', async () => {
    // Other student
    await assert.rejects(
      async () => {
        await answerService.getAnswersForAttempt(attempt1.attempt_id, studentUser2);
      },
      (err) => {
        assert.ok(err instanceof ForbiddenError);
        assert.strictEqual(err.statusCode, 403);
        return true;
      }
    );

    // Other faculty not exam creator
    await assert.rejects(
      async () => {
        await answerService.getAnswersForAttempt(attempt1.attempt_id, otherFacultyUser);
      },
      (err) => {
        assert.ok(err instanceof ForbiddenError);
        assert.strictEqual(err.statusCode, 403);
        return true;
      }
    );
  });
});
