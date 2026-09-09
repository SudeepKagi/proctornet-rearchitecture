import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabaseHealth, closePool, query } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as manualGradingService from '../../src/modules/evaluation/manualGrading.service.js';
import * as manualGradingRepo from '../../src/modules/evaluation/manualGrading.repository.js';
import { ForbiddenError, ValidationError } from '../../src/utils/errors.js';

describe('Phase 26 Workstream C: Manual Grading, Rubrics, Score Overrides & Auditing', () => {
  let dbAvailable = false;
  let facultyAId = null;
  let facultyBId = null;
  let studentId = null;
  let subjectId = null;
  let topicId = null;
  let examId = null;
  let sessionId = null;
  let attemptId = null;
  let resultId = null;
  let essayAqId = null;
  let codeAqId = null;

  before(async () => {
    const health = await checkDatabaseHealth(2000);
    dbAvailable = health.healthy;
    if (!dbAvailable) return;

    // Faculty A
    const fa = await query(`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('fac_a_wsc@test.com', 'hash', 'Faculty A WSC', 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING user_id;
    `);
    facultyAId = fa.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [facultyAId]);

    // Faculty B
    const fb = await query(`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('fac_b_wsc@test.com', 'hash', 'Faculty B WSC', 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING user_id;
    `);
    facultyBId = fb.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [facultyBId]);

    // Student
    const st = await query(`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('student_wsc@test.com', 'hash', 'Student WSC', 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING user_id;
    `);
    studentId = st.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [studentId]);

    // Subject & Topic
    const sub = await query(`
      INSERT INTO subjects (name, code, description)
      VALUES ('Database Systems WSC', 'DB2603', 'Databases') RETURNING subject_id;
    `);
    subjectId = sub.rows[0].subject_id;

    const top = await query(`
      INSERT INTO topics (subject_id, name, description)
      VALUES ($1, 'Transactions & Concurrency', 'ACID, Serializability') RETURNING topic_id;
    `, [subjectId]);
    topicId = top.rows[0].topic_id;

    // Exam created by Faculty A
    const ex = await query(`
      INSERT INTO exams (title, description, subject_id, duration_minutes, total_marks, passing_marks, created_by, status)
      VALUES ('Database Concurrency Midterm', 'ACID review', $1, 60, 22.0, 10.0, $2, 'PUBLISHED')
      RETURNING exam_id;
    `, [subjectId, facultyAId]);
    examId = ex.rows[0].exam_id;

    // Session
    const sess = await query(`
      INSERT INTO exam_sessions (exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES ($1, CURRENT_TIMESTAMP - interval '2 hours', CURRENT_TIMESTAMP + interval '2 hours', 'ACTIVE')
      RETURNING session_id;
    `, [examId]);
    sessionId = sess.rows[0].session_id;

    // Attempt
    const att = await query(`
      INSERT INTO exam_attempts (session_id, student_id, status, started_at, submitted_at, expires_at)
      VALUES ($1, $2, 'SUBMITTED', CURRENT_TIMESTAMP - interval '1 hour', CURRENT_TIMESTAMP - interval '10 minutes', CURRENT_TIMESTAMP + interval '1 hour')
      RETURNING attempt_id;
    `, [sessionId, studentId]);
    attemptId = att.rows[0].attempt_id;

    // 1 MCQ Question (2 pts)
    const q1 = await query(`
      INSERT INTO questions (topic_id, question_type, prompt_text, default_points, status)
      VALUES ($1, 'MCQ', 'What does ACID stand for?', 2.0, 'PUBLISHED') RETURNING question_id;
    `, [topicId]);
    const q1Id = q1.rows[0].question_id;

    const opt1 = await query(`
      INSERT INTO question_options (question_id, option_text, is_correct, display_order)
      VALUES ($1, 'Atomicity, Consistency, Isolation, Durability', TRUE, 0) RETURNING option_id;
    `, [q1Id]);
    const opt1Id = opt1.rows[0].option_id;

    // 1 ESSAY Question (10 pts)
    const q2 = await query(`
      INSERT INTO questions (topic_id, question_type, prompt_text, default_points, rubric, status)
      VALUES ($1, 'ESSAY', 'Explain 2PL (Two-Phase Locking) protocol and its deadlock conditions.', 10.0,
        '{"criteria": [{"name": "Growing Phase", "max": 4.0}, {"name": "Shrinking Phase", "max": 3.0}, {"name": "Deadlocks", "max": 3.0}]}'::jsonb, 'PUBLISHED')
      RETURNING question_id;
    `, [topicId]);
    const q2Id = q2.rows[0].question_id;

    // 1 CODE Question (10 pts)
    const q3 = await query(`
      INSERT INTO questions (topic_id, question_type, prompt_text, default_points, rubric, status)
      VALUES ($1, 'CODE', 'Implement an MVCC timestamp ordering validation in Python.', 10.0,
        '{"criteria": [{"name": "Read Timestamp", "max": 5.0}, {"name": "Write Timestamp", "max": 5.0}]}'::jsonb, 'PUBLISHED')
      RETURNING question_id;
    `, [topicId]);
    const q3Id = q3.rows[0].question_id;

    // Attempt Questions
    const aq1 = await query(`
      INSERT INTO attempt_questions (attempt_id, question_id, display_order)
      VALUES ($1, $2, 1) RETURNING attempt_question_id;
    `, [attemptId, q1Id]);
    const mcqAqId = aq1.rows[0].attempt_question_id;

    const aq2 = await query(`
      INSERT INTO attempt_questions (attempt_id, question_id, display_order)
      VALUES ($1, $2, 2) RETURNING attempt_question_id;
    `, [attemptId, q2Id]);
    essayAqId = aq2.rows[0].attempt_question_id;

    const aq3 = await query(`
      INSERT INTO attempt_questions (attempt_id, question_id, display_order)
      VALUES ($1, $2, 3) RETURNING attempt_question_id;
    `, [attemptId, q3Id]);
    codeAqId = aq3.rows[0].attempt_question_id;

    // Answers
    await query(`
      INSERT INTO answers (attempt_question_id, answer_value)
      VALUES ($1, $2);
    `, [mcqAqId, JSON.stringify({ selected_option_id: opt1Id })]);

    await query(`
      INSERT INTO answers (attempt_question_id, answer_value)
      VALUES ($1, $2);
    `, [essayAqId, JSON.stringify({ text_value: 'In 2PL, a transaction cannot acquire locks once it releases any lock.' })]);

    await query(`
      INSERT INTO answers (attempt_question_id, answer_value)
      VALUES ($1, $2);
    `, [codeAqId, JSON.stringify({ code_value: 'def validate_ts(r_ts, w_ts, cur_ts): return cur_ts >= r_ts' })]);

    // Initial Objective Auto-Evaluation Result (MCQ = 2, subjective = 0)
    const res = await query(`
      INSERT INTO results (attempt_id, score, correct_count, wrong_count, unanswered_count)
      VALUES ($1, 2.0, 1, 0, 0) RETURNING result_id;
    `, [attemptId]);
    resultId = res.rows[0].result_id;
  });

  after(async () => {
    if (dbAvailable) {
      if (attemptId) {
        await query('DELETE FROM manual_grade_audits WHERE attempt_id = $1', [attemptId]).catch(() => {});
        await query('DELETE FROM manual_grades WHERE attempt_id = $1', [attemptId]).catch(() => {});
        await query('DELETE FROM results WHERE attempt_id = $1', [attemptId]).catch(() => {});
        await query('DELETE FROM answers WHERE attempt_question_id IN (SELECT attempt_question_id FROM attempt_questions WHERE attempt_id = $1)', [attemptId]).catch(() => {});
        await query('DELETE FROM attempt_questions WHERE attempt_id = $1', [attemptId]).catch(() => {});
        await query('DELETE FROM exam_attempts WHERE attempt_id = $1', [attemptId]).catch(() => {});
      }
      if (sessionId) await query('DELETE FROM exam_sessions WHERE session_id = $1', [sessionId]).catch(() => {});
      if (examId) await query('DELETE FROM exams WHERE exam_id = $1', [examId]).catch(() => {});
      if (topicId) {
        await query('DELETE FROM question_options WHERE question_id IN (SELECT question_id FROM questions WHERE topic_id = $1)', [topicId]).catch(() => {});
        await query('DELETE FROM questions WHERE topic_id = $1', [topicId]).catch(() => {});
        await query('DELETE FROM topics WHERE topic_id = $1', [topicId]).catch(() => {});
      }
      if (subjectId) await query('DELETE FROM subjects WHERE subject_id = $1', [subjectId]).catch(() => {});
    }
    await closeRedis();
    await closePool();
  });

  describe('Evaluation Breakdown & Workspace Retrieval', () => {
    it('should retrieve full evaluation breakdown for exam author', async () => {
      if (!dbAvailable) return;

      const evalData = await manualGradingService.getEvaluation(resultId, facultyAId, 'FACULTY');
      assert.ok(evalData.result);
      assert.equal(evalData.result.score, 2.0);
      assert.equal(evalData.attempt.exam_title, 'Database Concurrency Midterm');
      assert.equal(evalData.questions.length, 3);

      const essayItem = evalData.questions.find(q => q.attempt_question_id === essayAqId);
      assert.ok(essayItem);
      assert.equal(essayItem.question_type, 'ESSAY');
      assert.ok(essayItem.answer_value.text_value);
      assert.equal(essayItem.manual_points, null);
    });

    it('should reject unauthorized faculty (Faculty B) from viewing evaluation breakdown', async () => {
      if (!dbAvailable) return;

      await assert.rejects(
        () => manualGradingService.getEvaluation(resultId, facultyBId, 'FACULTY'),
        (err) => err instanceof ForbiddenError
      );
    });
  });

  describe('Manual Grading Submission & Score Recalculation', () => {
    it('should allow Faculty A to grade subjective ESSAY question with rubric and mandatory rationale', async () => {
      if (!dbAvailable) return;

      const gradeResult = await manualGradingService.submitManualGrade(
        resultId,
        {
          attemptQuestionId: essayAqId,
          pointsAwarded: 8.5,
          rubricScores: {
            "Growing Phase": 4.0,
            "Shrinking Phase": 2.5,
            "Deadlocks": 2.0
          },
          feedback: 'Clear understanding of shrinking phase rules',
          rationale: 'Awarded 8.5/10: Full marks on growing phase; partial deduction on deadlock avoidance details'
        },
        facultyAId,
        'FACULTY'
      );

      assert.ok(gradeResult.grade);
      assert.equal(Number(gradeResult.grade.points_awarded), 8.5);
      assert.equal(gradeResult.previousPoints, 0);
      assert.equal(gradeResult.newPoints, 8.5);
      // Recalculated score: 2.0 (MCQ) + 8.5 (Essay) = 10.5
      assert.equal(gradeResult.recalculatedScore, 10.5);

      // Verify results row in database updated
      const res = await query('SELECT score FROM results WHERE result_id = $1', [resultId]);
      assert.equal(Number(res.rows[0].score), 10.5);
    });

    it('should reject manual grade when pointsAwarded exceeds max allowed points', async () => {
      if (!dbAvailable) return;

      await assert.rejects(
        () => manualGradingService.submitManualGrade(
          resultId,
          {
            attemptQuestionId: codeAqId,
            pointsAwarded: 15.0, // max is 10.0
            rationale: 'Over allocation'
          },
          facultyAId,
          'FACULTY'
        ),
        (err) => err instanceof ValidationError && err.message.includes('cannot exceed maximum allowed points')
      );
    });

    it('should grade the CODE question and atomically recalculate total score', async () => {
      if (!dbAvailable) return;

      const gradeResult = await manualGradingService.submitManualGrade(
        resultId,
        {
          attemptQuestionId: codeAqId,
          pointsAwarded: 9.0,
          rubricScores: { "Read Timestamp": 4.5, "Write Timestamp": 4.5 },
          feedback: 'Concise timestamp validation',
          rationale: 'Correct logic for read and write timestamp verification'
        },
        facultyAId,
        'FACULTY'
      );

      assert.equal(Number(gradeResult.grade.points_awarded), 9.0);
      // Recalculated score: 2.0 (MCQ) + 8.5 (Essay) + 9.0 (Code) = 19.5
      assert.equal(gradeResult.recalculatedScore, 19.5);

      const res = await query('SELECT score FROM results WHERE result_id = $1', [resultId]);
      assert.equal(Number(res.rows[0].score), 19.5);
    });
  });

  describe('Score Override & Immutable Audit History', () => {
    it('should allow score override and record immutable audit history', async () => {
      if (!dbAvailable) return;

      // Faculty A adjusts Essay score from 8.5 to 9.5
      const overrideResult = await manualGradingService.submitManualGrade(
        resultId,
        {
          attemptQuestionId: essayAqId,
          pointsAwarded: 9.5,
          feedback: 'Re-evaluated upon student clarification',
          rationale: 'Student correctly referenced strict 2PL cascading abort mitigation in follow-up note'
        },
        facultyAId,
        'FACULTY'
      );

      assert.equal(overrideResult.previousPoints, 8.5);
      assert.equal(overrideResult.newPoints, 9.5);
      // New total: 2.0 (MCQ) + 9.5 (Essay) + 9.0 (Code) = 20.5
      assert.equal(overrideResult.recalculatedScore, 20.5);

      // Verify audit history
      const audits = await manualGradingService.getAuditHistory(resultId, facultyAId, 'FACULTY');
      assert.ok(audits.length >= 2, 'Should have at least 2 audit entries for essay question');

      const latestAudit = audits[0];
      assert.equal(Number(latestAudit.previous_points), 8.5);
      assert.equal(Number(latestAudit.new_points), 9.5);
      assert.match(latestAudit.rationale, /cascading abort/);
      assert.equal(latestAudit.grader_user_id, facultyAId);
    });

    it('should reject unauthorized faculty (Faculty B) from submitting score overrides', async () => {
      if (!dbAvailable) return;

      await assert.rejects(
        () => manualGradingService.submitManualGrade(
          resultId,
          {
            attemptQuestionId: essayAqId,
            pointsAwarded: 10.0,
            rationale: 'BOLA bypass attempt'
          },
          facultyBId,
          'FACULTY'
        ),
        (err) => err instanceof ForbiddenError
      );
    });
  });
});
