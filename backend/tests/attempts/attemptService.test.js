/**
 * @file attemptService.test.js
 * @description Unit & integration tests for Exam Attempts, Deterministic Question Mapping, Timing, and Concurrency.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';
import * as sessionService from '../../src/modules/sessions/sessions.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import {
  generateSeed,
  seededFisherYatesShuffle,
  selectQuestionsDeterministically
} from '../../src/modules/attempts/attempts.shuffler.js';
import { AttemptStatus } from '../../src/domain/attempt/attemptStates.js';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../../src/utils/errors.js';

describe('Attempts Service & Question Mapping Invariants', () => {
  let facultyUser;
  let adminUser;
  let proctorUser;
  let studentUser1;
  let studentUser2;
  let studentUser3;
  let testSubject;
  let testTopic1;
  let testTopic2;
  let publishedExam;
  let activeSession;
  let futureSession;
  let pastSession;

  before(async () => {
    // 1. Create Users
    const faculty = await authService.register({
      name: 'Prof. AttemptTester',
      email: `faculty_attempt_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY', 'STUDENT'] };

    const admin = await authService.register({
      name: 'Admin AttemptTester',
      email: `admin_attempt_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING;`, [admin.userId]);
    adminUser = { userId: admin.userId, roles: ['ADMIN', 'STUDENT'] };

    const proctor = await authService.register({
      name: 'Proctor AttemptTester',
      email: `proctor_attempt_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR') ON CONFLICT DO NOTHING;`, [proctor.userId]);
    proctorUser = { userId: proctor.userId, roles: ['INVIGILATOR', 'STUDENT'] };

    const student1 = await authService.register({
      name: 'Alice Student',
      email: `alice_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student1.userId]);
    studentUser1 = { userId: student1.userId, roles: ['STUDENT'] };

    const student2 = await authService.register({
      name: 'Bob Student',
      email: `bob_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student2.userId]);
    studentUser2 = { userId: student2.userId, roles: ['STUDENT'] };

    const student3 = await authService.register({
      name: 'Charlie Student',
      email: `charlie_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student3.userId]);
    studentUser3 = { userId: student3.userId, roles: ['STUDENT'] };

    // 2. Create Subject and 2 Topics
    const subjectRes = await query(`
      INSERT INTO subjects (code, name, description)
      VALUES ($1, 'CS-ATTEMPT', 'Subject for attempt tests')
      RETURNING *;
    `, [`CS-ATT-${Date.now()}`]);
    testSubject = subjectRes.rows[0];

    const topic1Res = await query(`
      INSERT INTO topics (subject_id, name, description)
      VALUES ($1, 'Algorithms', 'Topic 1')
      RETURNING *;
    `, [testSubject.subject_id]);
    testTopic1 = topic1Res.rows[0];

    const topic2Res = await query(`
      INSERT INTO topics (subject_id, name, description)
      VALUES ($1, 'Data Structures', 'Topic 2')
      RETURNING *;
    `, [testSubject.subject_id]);
    testTopic2 = topic2Res.rows[0];

    // 3. Seed 5 Questions in Topic 1, and 5 Questions in Topic 2
    for (let i = 1; i <= 5; i++) {
      const qRes = await query(`
        INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
        VALUES ($1, 'MCQ', $2, 2.00)
        RETURNING *;
      `, [testTopic1.topic_id, `Algo Question ${i}`]);

      await query(`
        INSERT INTO question_options (question_id, option_text, is_correct, display_order)
        VALUES 
          ($1, 'Option A (Correct)', true, 0),
          ($1, 'Option B', false, 1);
      `, [qRes.rows[0].question_id]);
    }

    for (let i = 1; i <= 5; i++) {
      const qRes = await query(`
        INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
        VALUES ($1, 'MCQ', $2, 3.00)
        RETURNING *;
      `, [testTopic2.topic_id, `DS Question ${i}`]);

      await query(`
        INSERT INTO question_options (question_id, option_text, is_correct, display_order)
        VALUES 
          ($1, 'Option A (Correct)', true, 0),
          ($1, 'Option B', false, 1);
      `, [qRes.rows[0].question_id]);
    }

    // 4. Create Exam: 3 questions from Topic 1 (3 * 2 = 6 marks) + 2 questions from Topic 2 (2 * 3 = 6 marks) = 12 total marks
    const exam = await examService.createExam({
      title: 'Algorithms & Data Structures Final Exam',
      description: 'Comprehensive test',
      subject_id: testSubject.subject_id,
      duration_minutes: 60,
      total_marks: 12.00,
      passing_marks: 6.00
    }, facultyUser.userId);

    await examService.configureTopicRule(exam.exam_id, {
      topic_id: testTopic1.topic_id,
      question_count: 3,
      points_per_question: 2.00
    }, facultyUser);

    await examService.configureTopicRule(exam.exam_id, {
      topic_id: testTopic2.topic_id,
      question_count: 2,
      points_per_question: 3.00
    }, facultyUser);

    publishedExam = await examService.publishExam(exam.exam_id, facultyUser);

    // 5. Schedule Active Session (covers current time)
    const now = new Date();
    const startActive = new Date(now.getTime() - 10 * 60 * 1000); // started 10m ago
    const endActive = new Date(now.getTime() + 120 * 60 * 1000);  // ends in 2 hours
    activeSession = await sessionService.createSession({
      exam_id: publishedExam.exam_id,
      scheduled_start_time: startActive.toISOString(),
      scheduled_end_time: endActive.toISOString()
    }, facultyUser);

    // Enroll studentUser1 and studentUser2
    await sessionService.assignStudents(activeSession.session_id, [studentUser1.userId, studentUser2.userId], facultyUser);
    await sessionService.assignInvigilator(activeSession.session_id, { userId: proctorUser.userId, role: 'PRIMARY' }, facultyUser);

    // 6. Schedule Future Session (window not open yet, non-overlapping with activeSession)
    const startFuture = new Date(now.getTime() + 150 * 60 * 1000);
    const endFuture = new Date(now.getTime() + 270 * 60 * 1000);
    futureSession = await sessionService.createSession({
      exam_id: publishedExam.exam_id,
      scheduled_start_time: startFuture.toISOString(),
      scheduled_end_time: endFuture.toISOString()
    }, facultyUser);
    await sessionService.assignStudents(futureSession.session_id, [studentUser1.userId], facultyUser);

    // 7. Schedule Past Session (window closed)
    const startPast = new Date(now.getTime() - 180 * 60 * 1000);
    const endPast = new Date(now.getTime() - 60 * 60 * 1000);
    // Directly insert past session to bypass createSession future window check if needed
    const pastRes = await query(`
      INSERT INTO exam_sessions (exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES ($1, $2, $3, 'ACTIVE')
      RETURNING *;
    `, [publishedExam.exam_id, startPast.toISOString(), endPast.toISOString()]);
    pastSession = pastRes.rows[0];
    await query(`
      INSERT INTO session_students (session_id, student_id, status)
      VALUES ($1, $2, 'ASSIGNED')
      ON CONFLICT DO NOTHING;
    `, [pastSession.session_id, studentUser1.userId]);
  });

  after(async () => {
    // Reverse-order database cleanup
    try {
      await query(`DELETE FROM audit_logs WHERE actor_user_id IN ($1, $2, $3, $4, $5, $6);`, [
        facultyUser?.userId, adminUser?.userId, proctorUser?.userId,
        studentUser1?.userId, studentUser2?.userId, studentUser3?.userId
      ]);
      await query(`DELETE FROM attempt_questions WHERE attempt_id IN (SELECT attempt_id FROM exam_attempts WHERE student_id IN ($1, $2, $3));`, [
        studentUser1?.userId, studentUser2?.userId, studentUser3?.userId
      ]);
      await query(`DELETE FROM exam_attempts WHERE student_id IN ($1, $2, $3);`, [
        studentUser1?.userId, studentUser2?.userId, studentUser3?.userId
      ]);
      await query(`DELETE FROM session_students WHERE session_id IN ($1, $2, $3);`, [
        activeSession?.session_id, futureSession?.session_id, pastSession?.session_id
      ]);
      await query(`DELETE FROM session_invigilators WHERE session_id IN ($1, $2, $3);`, [
        activeSession?.session_id, futureSession?.session_id, pastSession?.session_id
      ]);
      await query(`DELETE FROM exam_sessions WHERE exam_id = $1;`, [publishedExam?.exam_id]);
      await query(`DELETE FROM exam_topic_rules WHERE exam_id = $1;`, [publishedExam?.exam_id]);
      await query(`DELETE FROM exams WHERE created_by = $1;`, [facultyUser?.userId]);
      if (testTopic1) await query(`DELETE FROM question_options WHERE question_id IN (SELECT question_id FROM questions WHERE topic_id = $1);`, [testTopic1.topic_id]);
      if (testTopic2) await query(`DELETE FROM question_options WHERE question_id IN (SELECT question_id FROM questions WHERE topic_id = $1);`, [testTopic2.topic_id]);
      if (testTopic1) await query(`DELETE FROM questions WHERE topic_id = $1;`, [testTopic1.topic_id]);
      if (testTopic2) await query(`DELETE FROM questions WHERE topic_id = $1;`, [testTopic2.topic_id]);
      if (testSubject) await query(`DELETE FROM topics WHERE subject_id = $1;`, [testSubject.subject_id]);
      if (testSubject) await query(`DELETE FROM subjects WHERE subject_id = $1;`, [testSubject.subject_id]);
      await query(`DELETE FROM user_roles WHERE user_id IN ($1, $2, $3, $4, $5, $6);`, [
        facultyUser?.userId, adminUser?.userId, proctorUser?.userId,
        studentUser1?.userId, studentUser2?.userId, studentUser3?.userId
      ]);
      await query(`DELETE FROM users WHERE user_id IN ($1, $2, $3, $4, $5, $6);`, [
        facultyUser?.userId, adminUser?.userId, proctorUser?.userId,
        studentUser1?.userId, studentUser2?.userId, studentUser3?.userId
      ]);
    } catch {
      // Ignored
    } finally {
      await closeRedis();
      await closePool();
    }
  });

  describe('Deterministic Shuffler Invariants', () => {
    it('generates identical permutation for identical inputs', () => {
      const items = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
      const seed1 = generateSeed('session-123', 'student-abc', 'topic-xyz');
      const seed2 = generateSeed('session-123', 'student-abc', 'topic-xyz');

      assert.equal(seed1, seed2);

      const shuffled1 = seededFisherYatesShuffle(items, seed1);
      const shuffled2 = seededFisherYatesShuffle(items, seed2);

      assert.deepEqual(shuffled1, shuffled2);
      assert.equal(shuffled1.length, items.length);
    });

    it('generates different permutations for different student seeds', () => {
      const items = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8'];
      const seedAlice = generateSeed('session-123', 'student-alice', 'topic-xyz');
      const seedBob = generateSeed('session-123', 'student-bob', 'topic-xyz');

      assert.notEqual(seedAlice, seedBob);

      const shuffledAlice = seededFisherYatesShuffle(items, seedAlice);
      const shuffledBob = seededFisherYatesShuffle(items, seedBob);

      assert.notDeepEqual(shuffledAlice, shuffledBob);
    });

    it('selectQuestionsDeterministically returns exact count and preserves items', () => {
      const pool = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
      const seed = 12345;
      const selected = selectQuestionsDeterministically(pool, 3, seed);

      assert.equal(selected.length, 3);
      assert.equal(new Set(selected.map((s) => s.id)).size, 3);
    });
  });

  describe('startAttempt Workflow & Authorization', () => {
    it('creates attempt in ACTIVE status with authoritative timestamps and mapping', async () => {
      const result = await attemptService.startAttempt(activeSession.session_id, studentUser1);

      assert.ok(result.attempt_id);
      assert.equal(result.session_id, activeSession.session_id);
      assert.equal(result.student_id, studentUser1.userId);
      assert.equal(result.status, AttemptStatus.ACTIVE);
      assert.ok(result.started_at);
      assert.ok(result.expires_at);
      assert.equal(result.is_new, true);
      assert.equal(result.total_questions, 5); // 3 from topic 1 + 2 from topic 2
      assert.equal(result.total_marks, 12);
      assert.ok(result.time_remaining_seconds > 0);

      // Verify session_students status transitioned to PRESENT
      const studentRow = await query(`
        SELECT status FROM session_students
        WHERE session_id = $1 AND student_id = $2;
      `, [activeSession.session_id, studentUser1.userId]);
      assert.equal(studentRow.rows[0].status, 'PRESENT');

      // Verify attempt_questions contiguous display_order 1..5 and question uniqueness
      const questionsRes = await query(`
        SELECT question_id, display_order
        FROM attempt_questions
        WHERE attempt_id = $1
        ORDER BY display_order ASC;
      `, [result.attempt_id]);

      assert.equal(questionsRes.rows.length, 5);
      questionsRes.rows.forEach((row, index) => {
        assert.equal(row.display_order, index + 1);
      });
      const uniqueIds = new Set(questionsRes.rows.map((r) => r.question_id));
      assert.equal(uniqueIds.size, 5);
    });

    it('is idempotent: second call returns the existing active attempt without duplicates', async () => {
      const retryResult = await attemptService.startAttempt(activeSession.session_id, studentUser1);

      assert.equal(retryResult.is_new, false);
      assert.equal(retryResult.student_id, studentUser1.userId);
      assert.equal(retryResult.status, AttemptStatus.ACTIVE);
      assert.equal(retryResult.total_questions, 5);

      // Confirm only 1 attempt record in database
      const countRes = await query(`
        SELECT COUNT(*)::int AS count FROM exam_attempts
        WHERE session_id = $1 AND student_id = $2;
      `, [activeSession.session_id, studentUser1.userId]);
      assert.equal(countRes.rows[0].count, 1);
    });

    it('provides student-specific question order variation for different candidates', async () => {
      const resultBob = await attemptService.startAttempt(activeSession.session_id, studentUser2);

      assert.ok(resultBob.attempt_id);
      assert.equal(resultBob.student_id, studentUser2.userId);
      assert.equal(resultBob.total_questions, 5);

      const aliceQ = await attemptService.getAttemptQuestions(
        (await attemptService.getMyAttemptForSession(activeSession.session_id, studentUser1)).attempt_id,
        studentUser1
      );
      const bobQ = await attemptService.getAttemptQuestions(resultBob.attempt_id, studentUser2);

      const aliceIds = aliceQ.questions.map((q) => q.question_id);
      const bobIds = bobQ.questions.map((q) => q.question_id);

      assert.equal(aliceIds.length, 5);
      assert.equal(bobIds.length, 5);
      // Both got 5 questions, but permutations differ due to distinct student seeds
      assert.notDeepEqual(aliceIds, bobIds);
    });

    it('rejects attempt start if caller does not have STUDENT role', async () => {
      const nonStudentFaculty = { userId: facultyUser.userId, roles: ['FACULTY'] };
      await assert.rejects(
        () => attemptService.startAttempt(activeSession.session_id, nonStudentFaculty),
        (err) => err instanceof ForbiddenError && err.message.includes('STUDENT')
      );
    });

    it('rejects attempt start if student is not assigned to session roster', async () => {
      await assert.rejects(
        () => attemptService.startAttempt(activeSession.session_id, studentUser3),
        (err) => err instanceof ForbiddenError && err.message.includes('not assigned')
      );
    });

    it('rejects attempt start if session window has not opened yet', async () => {
      await assert.rejects(
        () => attemptService.startAttempt(futureSession.session_id, studentUser1),
        (err) => err instanceof BadRequestError && err.message.includes('not opened yet')
      );
    });

    it('rejects attempt start if session window has closed', async () => {
      await assert.rejects(
        () => attemptService.startAttempt(pastSession.session_id, studentUser1),
        (err) => err instanceof BadRequestError && err.message.includes('window has closed')
      );
    });
  });

  describe('getAttemptById & getAttemptQuestions & BOLA Defense', () => {
    let aliceAttempt;

    before(async () => {
      aliceAttempt = await attemptService.getMyAttemptForSession(activeSession.session_id, studentUser1);
    });

    it('allows student to retrieve own attempt details', async () => {
      const details = await attemptService.getAttemptById(aliceAttempt.attempt_id, studentUser1);
      assert.equal(details.attempt_id, aliceAttempt.attempt_id);
      assert.equal(details.student_id, studentUser1.userId);
      assert.equal(details.status, AttemptStatus.ACTIVE);
      assert.equal(details.total_questions, 5);
      assert.ok(details.time_remaining_seconds > 0);
    });

    it('allows exam-creator faculty, assigned invigilator, and admin to inspect attempt', async () => {
      // Faculty creator
      const facDetails = await attemptService.getAttemptById(aliceAttempt.attempt_id, facultyUser);
      assert.equal(facDetails.attempt_id, aliceAttempt.attempt_id);

      // Invigilator
      const procDetails = await attemptService.getAttemptById(aliceAttempt.attempt_id, proctorUser);
      assert.equal(procDetails.attempt_id, aliceAttempt.attempt_id);

      // Admin
      const admDetails = await attemptService.getAttemptById(aliceAttempt.attempt_id, adminUser);
      assert.equal(admDetails.attempt_id, aliceAttempt.attempt_id);
    });

    it('BOLA Defense: rejects unauthorized student accessing another candidate attempt', async () => {
      await assert.rejects(
        () => attemptService.getAttemptById(aliceAttempt.attempt_id, studentUser3),
        (err) => err instanceof ForbiddenError && err.message.includes('Access denied')
      );

      await assert.rejects(
        () => attemptService.getAttemptQuestions(aliceAttempt.attempt_id, studentUser3),
        (err) => err instanceof ForbiddenError && err.message.includes('Access denied')
      );
    });

    it('sanitizes questions: never exposes is_correct or correct_numeric_value', async () => {
      const qResult = await attemptService.getAttemptQuestions(aliceAttempt.attempt_id, studentUser1);

      assert.equal(qResult.attempt_id, aliceAttempt.attempt_id);
      assert.equal(qResult.questions.length, 5);

      for (const q of qResult.questions) {
        assert.ok(q.prompt_text);
        assert.ok(q.display_order >= 1);
        assert.equal(q.is_correct, undefined);
        assert.equal(q.correct_numeric_value, undefined);
        assert.equal(q.solution_notes, undefined);

        for (const opt of q.options) {
          assert.ok(opt.option_text);
          assert.equal(opt.is_correct, undefined);
        }
      }
    });
  });

  describe('Lazy On-Access Expiration', () => {
    it('transitions ACTIVE attempt to EXPIRED when queried past expires_at', async () => {
      // Create a test session with a student whose attempt has an expired expires_at
      const testExpSessionRes = await query(`
        INSERT INTO exam_sessions (exam_id, scheduled_start_time, scheduled_end_time, status)
        VALUES ($1, NOW() - interval '2 hours', NOW() + interval '2 hours', 'ACTIVE')
        RETURNING *;
      `, [publishedExam.exam_id]);
      const expSession = testExpSessionRes.rows[0];

      await query(`
        INSERT INTO session_students (session_id, student_id, status)
        VALUES ($1, $2, 'ASSIGNED');
      `, [expSession.session_id, studentUser3.userId]);

      // Manually insert an attempt with an expires_at in the past
      const attemptRes = await query(`
        INSERT INTO exam_attempts (session_id, student_id, status, started_at, expires_at)
        VALUES ($1, $2, 'ACTIVE', NOW() - interval '90 minutes', NOW() - interval '30 minutes')
        RETURNING *;
      `, [expSession.session_id, studentUser3.userId]);
      const expiredAttemptId = attemptRes.rows[0].attempt_id;

      // Query via getAttemptById
      const details = await attemptService.getAttemptById(expiredAttemptId, studentUser3);
      assert.equal(details.status, AttemptStatus.EXPIRED);
      assert.equal(details.time_remaining_seconds, 0);

      // Verify in DB directly
      const dbRow = await query(`SELECT status FROM exam_attempts WHERE attempt_id = $1;`, [expiredAttemptId]);
      assert.equal(dbRow.rows[0].status, AttemptStatus.EXPIRED);

      // Cleanup
      await query(`DELETE FROM exam_attempts WHERE attempt_id = $1;`, [expiredAttemptId]).catch(() => {});
      await query(`DELETE FROM session_students WHERE session_id = $1;`, [expSession.session_id]).catch(() => {});
      await query(`DELETE FROM exam_sessions WHERE session_id = $1;`, [expSession.session_id]).catch(() => {});
    });
  });

  describe('Concurrency Acceptance Test: N Concurrent Attempt Starts', () => {
    it('N=10 concurrent startAttempt calls produce exactly 1 attempt and 1 question mapping set', async () => {
      // Register a fresh student
      const concStudent = await authService.register({
        name: 'Concurrent Tester',
        email: `conc_${Date.now()}@example.com`,
        password: 'Password123!'
      });
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [concStudent.userId]);
      const concUser = { userId: concStudent.userId, roles: ['STUDENT'] };

      await sessionService.assignStudents(activeSession.session_id, [concStudent.userId], facultyUser);

      // Fire 10 simultaneous startAttempt calls
      const promises = Array.from({ length: 10 }).map(() =>
        attemptService.startAttempt(activeSession.session_id, concUser)
      );

      const results = await Promise.all(promises);

      // 1. All 10 requests succeeded
      assert.equal(results.length, 10);

      // 2. All 10 returned identical attempt_id
      const primaryAttemptId = results[0].attempt_id;
      for (const res of results) {
        assert.equal(res.attempt_id, primaryAttemptId);
        assert.equal(res.status, AttemptStatus.ACTIVE);
        assert.equal(res.total_questions, 5);
      }

      // 3. Exactly 1 row in exam_attempts
      const dbAttempts = await query(`
        SELECT COUNT(*)::int AS count FROM exam_attempts
        WHERE session_id = $1 AND student_id = $2;
      `, [activeSession.session_id, concStudent.userId]);
      assert.equal(dbAttempts.rows[0].count, 1);

      // 4. Exactly 5 mapped questions in attempt_questions
      const dbMappings = await query(`
        SELECT COUNT(*)::int AS count FROM attempt_questions
        WHERE attempt_id = $1;
      `, [primaryAttemptId]);
      assert.equal(dbMappings.rows[0].count, 5);

      // Cleanup
      await query(`DELETE FROM attempt_questions WHERE attempt_id = $1;`, [primaryAttemptId]).catch(() => {});
      await query(`DELETE FROM exam_attempts WHERE attempt_id = $1;`, [primaryAttemptId]).catch(() => {});
      await query(`DELETE FROM session_students WHERE session_id = $1 AND student_id = $2;`, [activeSession.session_id, concStudent.userId]).catch(() => {});
      await query(`DELETE FROM user_roles WHERE user_id = $1;`, [concStudent.userId]).catch(() => {});
      await query(`DELETE FROM users WHERE user_id = $1;`, [concStudent.userId]).catch(() => {});
    });
  });
});
