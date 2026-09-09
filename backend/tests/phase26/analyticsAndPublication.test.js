/**
 * @file analyticsAndPublication.test.js
 * @description Targeted tests for Phase 26 Workstream D: Item Difficulty (P-value), Discrimination Index (D_i), Score Histograms, Completion Statistics, Analytics Caching, and Results Publication Policies.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, query } from '../../src/infrastructure/postgres/pool.js';
import { getExamAnalytics } from '../../src/modules/exams/examAnalytics.service.js';
import * as resultsService from '../../src/modules/results/results.service.js';
import { ResultsReleasePolicy } from '../../src/domain/index.js';

describe('Phase 26 Workstream D: Analytics, Histograms & Results Publication Policies', () => {
  let facultyA, facultyB, adminUser, studentUsers = [];
  let testExamId;
  let testSessionId;
  let testBankId;
  let attemptIds = [];
  let questionIds = [];

  before(async () => {
    const tag = Date.now() + Math.floor(Math.random() * 1000);
    // 1. Create test users
    const facultyARes = await query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Prof Analytics A', $1, 'hash')
      RETURNING user_id;
    `, [`prof.analytics.a.${tag}@example.com`]);
    facultyA = facultyARes.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY')`, [facultyA]);

    const facultyBRes = await query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Prof Analytics B', $1, 'hash')
      RETURNING user_id;
    `, [`prof.analytics.b.${tag}@example.com`]);
    facultyB = facultyBRes.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY')`, [facultyB]);

    const adminRes = await query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Admin Analytics', $1, 'hash')
      RETURNING user_id;
    `, [`admin.analytics.${tag}@example.com`]);
    adminUser = adminRes.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN')`, [adminUser]);

    // Create 6 student users to test quartile discrimination (k = round(6 * 0.27) = 2 upper, 2 lower)
    for (let i = 1; i <= 6; i++) {
      const sRes = await query(`
        INSERT INTO users (name, email, password_hash)
        VALUES ($1, $2, 'hash')
        RETURNING user_id;
      `, [`Student ${i}`, `student.${i}.${tag}@example.com`]);
      const sId = sRes.rows[0].user_id;
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT')`, [sId]);
      studentUsers.push(sId);
    }

    // 1b. Create Subject & Topic
    const sub = await query(`
      INSERT INTO subjects (name, code, description)
      VALUES ('Psychometrics', $1, 'Psychometrics') RETURNING subject_id;
    `, [`PSY_${tag}`]);
    const subjectId = sub.rows[0].subject_id;

    const top = await query(`
      INSERT INTO topics (subject_id, name, description)
      VALUES ($1, 'Item Analysis', 'Item response theory') RETURNING topic_id;
    `, [subjectId]);
    const topicId = top.rows[0].topic_id;

    // 2. Create Exam
    const examRes = await query(`
      INSERT INTO exams (title, description, status, total_marks, passing_marks, duration_minutes, created_by, results_release_policy, subject_id)
      VALUES ('Psychometrics 101', 'Analytics Test Exam', 'EVALUATED', 100, 40, 60, $1, 'MANUAL', $2)
      RETURNING exam_id;
    `, [facultyA, subjectId]);
    testExamId = examRes.rows[0].exam_id;

    // 3. Create Session
    const sessRes = await query(`
      INSERT INTO exam_sessions (exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES ($1, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'ACTIVE')
      RETURNING session_id;
    `, [testExamId]);
    testSessionId = sessRes.rows[0].session_id;

    // 3b. Create Question Bank
    const bankRes = await query(`
      INSERT INTO question_banks (created_by, title, description, subject_id)
      VALUES ($1, 'Analytics Question Bank', 'Questions for analytics test', $2)
      RETURNING bank_id;
    `, [facultyA, subjectId]);
    testBankId = bankRes.rows[0].bank_id;

    // 4. Create 3 Questions:
    // Q1: Easy MCQ (default_points: 30) - high p-value
    const q1Res = await query(`
      INSERT INTO questions (prompt_text, question_type, default_points, difficulty, bloom_level, bank_id, topic_id)
      VALUES ('What is 2 + 2?', 'MCQ', 30, 'EASY', 'REMEMBER', $1, $2)
      RETURNING question_id;
    `, [testBankId, topicId]);
    const q1 = q1Res.rows[0].question_id;

    const opt1Correct = await query(`
      INSERT INTO question_options (question_id, option_text, is_correct, display_order)
      VALUES ($1, '4', TRUE, 1) RETURNING option_id;
    `, [q1]);
    const opt1Wrong = await query(`
      INSERT INTO question_options (question_id, option_text, is_correct, display_order)
      VALUES ($1, '5', FALSE, 2) RETURNING option_id;
    `, [q1]);

    // Q2: Moderate NUMERIC (default_points: 30) - discriminating question
    const q2Res = await query(`
      INSERT INTO questions (prompt_text, question_type, default_points, difficulty, bloom_level, correct_numeric_value, bank_id, topic_id)
      VALUES ('Compute sqrt(144)', 'NUMERIC', 30, 'MEDIUM', 'APPLY', 12, $1, $2)
      RETURNING question_id;
    `, [testBankId, topicId]);
    const q2 = q2Res.rows[0].question_id;

    // Q3: Hard Subjective ESSAY (default_points: 40)
    const q3Res = await query(`
      INSERT INTO questions (prompt_text, question_type, default_points, difficulty, bloom_level, bank_id, topic_id)
      VALUES ('Explain quantum superposition', 'ESSAY', 40, 'HARD', 'ANALYZE', $1, $2)
      RETURNING question_id;
    `, [testBankId, topicId]);
    const q3 = q3Res.rows[0].question_id;

    questionIds = [q1, q2, q3];

    // 5. Enroll 6 candidates and create completed attempts with staggered scores
    const candidateScores = [
      { q1Correct: true,  q2Val: 12, q3Pts: 35, total: 95, durMin: 30 },
      { q1Correct: true,  q2Val: 12, q3Pts: 25, total: 85, durMin: 35 },
      { q1Correct: true,  q2Val: 12, q3Pts: 10, total: 70, durMin: 40 },
      { q1Correct: true,  q2Val: 99, q3Pts: 20, total: 50, durMin: 45 },
      { q1Correct: true,  q2Val: 99, q3Pts: 5,  total: 35, durMin: 50 },
      { q1Correct: false, q2Val: 99, q3Pts: 0,  total: 0,  durMin: 55 }
    ];

    for (let i = 0; i < 6; i++) {
      const studentId = studentUsers[i];
      const cfg = candidateScores[i];

      await query(`
        INSERT INTO session_students (session_id, student_id)
        VALUES ($1, $2);
      `, [testSessionId, studentId]);

      const start = new Date(Date.now() - (cfg.durMin + 10) * 60000);
      const submit = new Date(start.getTime() + cfg.durMin * 60000);

      const attRes = await query(`
        INSERT INTO exam_attempts (session_id, student_id, status, started_at, submitted_at, expires_at)
        VALUES ($1, $2, 'SUBMITTED', $3, $4, NOW() + INTERVAL '2 hours')
        RETURNING attempt_id;
      `, [testSessionId, studentId, start, submit]);
      const attId = attRes.rows[0].attempt_id;
      attemptIds.push(attId);

      // Attempt questions
      const aq1 = (await query(`
        INSERT INTO attempt_questions (attempt_id, question_id, display_order)
        VALUES ($1, $2, 1) RETURNING attempt_question_id;
      `, [attId, q1])).rows[0].attempt_question_id;

      const aq2 = (await query(`
        INSERT INTO attempt_questions (attempt_id, question_id, display_order)
        VALUES ($1, $2, 2) RETURNING attempt_question_id;
      `, [attId, q2])).rows[0].attempt_question_id;

      const aq3 = (await query(`
        INSERT INTO attempt_questions (attempt_id, question_id, display_order)
        VALUES ($1, $2, 3) RETURNING attempt_question_id;
      `, [attId, q3])).rows[0].attempt_question_id;

      // Answers
      const selectedOpt = cfg.q1Correct ? opt1Correct.rows[0].option_id : opt1Wrong.rows[0].option_id;
      await query(`
        INSERT INTO answers (attempt_question_id, answer_value)
        VALUES ($1, $2);
      `, [aq1, JSON.stringify({ selected_option_id: selectedOpt })]);

      await query(`
        INSERT INTO answers (attempt_question_id, answer_value)
        VALUES ($1, $2);
      `, [aq2, JSON.stringify({ numeric_value: cfg.q2Val })]);

      await query(`
        INSERT INTO answers (attempt_question_id, answer_value)
        VALUES ($1, $2);
      `, [aq3, JSON.stringify({ text: 'Quantum superposition essay...' })]);

      // Manual grade for Q3
      await query(`
        INSERT INTO manual_grades (attempt_question_id, attempt_id, grader_user_id, points_awarded, max_points, feedback, rationale)
        VALUES ($1, $2, $3, $4, 40, 'Graded', 'Valid test grading');
      `, [aq3, attId, facultyA, cfg.q3Pts]);

      // Result row
      await query(`
        INSERT INTO results (attempt_id, score, correct_count, wrong_count, unanswered_count)
        VALUES ($1, $2, $3, $4, 0);
      `, [attId, cfg.total, cfg.q1Correct ? 1 : 0, cfg.q1Correct ? 0 : 1]);
    }
  });

  after(async () => {
    // Teardown test data
    if (testExamId) {
      await query(`DELETE FROM exam_analytics_cache WHERE exam_id = $1;`, [testExamId]);
      await query(`DELETE FROM results WHERE attempt_id = ANY($1::uuid[]);`, [attemptIds]);
      await query(`DELETE FROM manual_grades WHERE attempt_id = ANY($1::uuid[]);`, [attemptIds]);
      await query(`DELETE FROM answers WHERE attempt_question_id IN (SELECT attempt_question_id FROM attempt_questions WHERE attempt_id = ANY($1::uuid[]));`, [attemptIds]);
      await query(`DELETE FROM attempt_questions WHERE attempt_id = ANY($1::uuid[]);`, [attemptIds]);
      await query(`DELETE FROM exam_attempts WHERE attempt_id = ANY($1::uuid[]);`, [attemptIds]);
      await query(`DELETE FROM session_students WHERE session_id = $1;`, [testSessionId]);
      await query(`DELETE FROM exam_sessions WHERE session_id = $1;`, [testSessionId]);
      await query(`DELETE FROM question_options WHERE question_id = ANY($1::uuid[]);`, [questionIds]);
      await query(`DELETE FROM questions WHERE question_id = ANY($1::uuid[]);`, [questionIds]);
      if (testBankId) await query(`DELETE FROM question_banks WHERE bank_id = $1;`, [testBankId]);
      await query(`DELETE FROM exams WHERE exam_id = $1;`, [testExamId]);
    }
    const pool = getPool();
    await pool.end();
  });

  describe('Psychometric Item Analytics & Histograms', () => {
    test('should compute item difficulty (P-value) correctly for all questions', async () => {
      const analytics = await getExamAnalytics(testExamId, { userId: facultyA, roles: ['FACULTY'] }, true);

      assert.strictEqual(analytics.sampleSize, 6);
      assert.strictEqual(analytics.itemAnalytics.length, 3);

      // Q1: 5 out of 6 candidates got 30 pts.
      // Mean = (5*30) / 6 = 25. P-value = 25 / 30 = 0.833 -> EASY
      const item1 = analytics.itemAnalytics.find(q => q.questionId === questionIds[0]);
      assert.ok(item1);
      assert.strictEqual(item1.pValue, 0.833);
      assert.strictEqual(item1.difficultyRating, 'EASY');

      // Q2: 3 out of 6 candidates got 30 pts.
      // Mean = (3*30) / 6 = 15. P-value = 15 / 30 = 0.500 -> MODERATE
      const item2 = analytics.itemAnalytics.find(q => q.questionId === questionIds[1]);
      assert.ok(item2);
      assert.strictEqual(item2.pValue, 0.5);
      assert.strictEqual(item2.difficultyRating, 'MODERATE');
    });

    test('should compute Upper-Lower 27% Quartile Discrimination Index and Point-Biserial Correlation', async () => {
      const analytics = await getExamAnalytics(testExamId, { userId: facultyA, roles: ['FACULTY'] });

      // Q2: S1 and S2 (Upper) both got 30 pts (P_upper = 1.0)
      // S5 and S6 (Lower) both got 0 pts (P_lower = 0.0)
      // D_i = 1.0 - 0.0 = 1.0 -> EXCELLENT
      const item2 = analytics.itemAnalytics.find(q => q.questionId === questionIds[1]);
      assert.ok(item2);
      assert.strictEqual(item2.discriminationIndex, 1);
      assert.strictEqual(item2.discriminationRating, 'EXCELLENT');
      assert.ok(item2.rPbis > 0.5, `Expected high point-biserial correlation, got ${item2.rPbis}`);
    });

    test('should distribute candidate scores into 10 histogram bins accurately', async () => {
      const analytics = await getExamAnalytics(testExamId, { userId: facultyA, roles: ['FACULTY'] });

      assert.strictEqual(analytics.histogram.length, 10);
      const totalCountInBins = analytics.histogram.reduce((sum, b) => sum + b.count, 0);
      assert.strictEqual(totalCountInBins, 6);

      // S1 (95) -> bin 9 (90 - 100)
      const topBin = analytics.histogram[9];
      assert.strictEqual(topBin.count, 1);

      // S6 (0) -> bin 0 (0 - 10)
      const bottomBin = analytics.histogram[0];
      assert.strictEqual(bottomBin.count, 1);
    });

    test('should calculate candidate duration and completion statistics', async () => {
      const analytics = await getExamAnalytics(testExamId, { userId: facultyA, roles: ['FACULTY'] });

      const stats = analytics.completionStats;
      assert.strictEqual(stats.enrolledCount, 6);
      assert.strictEqual(stats.submittedCount, 6);
      assert.strictEqual(stats.completionRate, 100);
      // Durations: [30, 35, 40, 45, 50, 55] => Mean = 42.5, Median = (40+45)/2 = 42.5
      assert.strictEqual(stats.meanDurationMinutes, 42.5);
      assert.strictEqual(stats.medianDurationMinutes, 42.5);
      assert.strictEqual(stats.minDurationMinutes, 30);
      assert.strictEqual(stats.maxDurationMinutes, 55);
    });

    test('should cache analytics in exam_analytics_cache and serve subsequent requests from cache', async () => {
      // First call (without forceRefresh) returns cached=true from previous test
      const cached = await getExamAnalytics(testExamId, { userId: facultyA, roles: ['FACULTY'] }, false);
      assert.strictEqual(cached.cached, true);
      assert.ok(cached.computedAt);

      // Force refresh recalculates and sets cached=false
      const refreshed = await getExamAnalytics(testExamId, { userId: facultyA, roles: ['FACULTY'] }, true);
      assert.strictEqual(refreshed.cached, false);
    });

    test('should enforce BOLA on analytics: forbid unauthorized faculty and students', async () => {
      // Unauthorized faculty B
      await assert.rejects(
        () => getExamAnalytics(testExamId, { userId: facultyB, roles: ['FACULTY'] }),
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );

      // Student
      await assert.rejects(
        () => getExamAnalytics(testExamId, { userId: studentUsers[0], roles: ['STUDENT'] }),
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );

      // Admin allowed
      const adminAnalytics = await getExamAnalytics(testExamId, { userId: adminUser, roles: ['ADMIN'] });
      assert.strictEqual(adminAnalytics.examId, testExamId);
    });
  });

  describe('Results Publication Policies & Candidate Access Enforcement', () => {
    test('should prevent candidate from accessing result when policy is MANUAL and unpublished', async () => {
      await assert.rejects(
        () => resultsService.getCandidateAttemptResult({
          attemptId: attemptIds[0],
          candidateUserId: studentUsers[0]
        }),
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, 'RESULT_NOT_PUBLISHED');
          return true;
        }
      );
    });

    test('should allow exam results publication by faculty author', async () => {
      const pubResult = await resultsService.publishExamResults({
        examId: testExamId,
        user: { userId: facultyA, roles: ['FACULTY'] }
      });

      assert.strictEqual(pubResult.examId, testExamId);
      assert.strictEqual(pubResult.status, 'RESULT_PUBLISHED');
      assert.ok(pubResult.resultsPublishedAt);
    });

    test('should allow candidate to access result once publication is released', async () => {
      const candidateResult = await resultsService.getCandidateAttemptResult({
        attemptId: attemptIds[0],
        candidateUserId: studentUsers[0]
      });

      assert.ok(candidateResult);
      assert.strictEqual(candidateResult.attemptId, attemptIds[0]);
      assert.strictEqual(candidateResult.score, 95);
      assert.strictEqual(candidateResult.passed, true);
    });
  });
});
