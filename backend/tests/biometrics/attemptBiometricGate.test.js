import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as attemptsService from '../../src/modules/attempts/attempts.service.js';
import * as biometricsRepo from '../../src/modules/biometrics/biometrics.repository.js';
import {
  setupMockBiometricS3,
  teardownMockBiometricS3,
  createTestUser
} from './biometricsTestHelper.js';
import { ForbiddenError } from '../../src/utils/errors.js';

describe('attemptBiometricGate (Phase 25 startAttempt Biometric Gate & Medical Exemption)', () => {
  let adminUser;
  let subjectId;
  let examId;
  let topicId;
  let testSessionId;
  const pool = getPool();

  before(async () => {
    process.env.BIOMETRIC_GATE_ENFORCED = 'true';
    setupMockBiometricS3();

    adminUser = await createTestUser({
      email: `gate_admin_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`,
      role: 'ADMIN'
    });

    // 1. Create subject & topic
    const uniqueSuffix = Date.now() + '_' + Math.floor(Math.random() * 1000);
    const subjRes = await pool.query(`
      INSERT INTO subjects (subject_id, name, code)
      VALUES (gen_random_uuid(), 'Biometric Subject ' || $1, 'BIO_' || $1)
      RETURNING subject_id;
    `, [uniqueSuffix]);
    subjectId = subjRes.rows[0].subject_id;

    const topicRes = await pool.query(`
      INSERT INTO topics (topic_id, subject_id, name)
      VALUES (gen_random_uuid(), $1, 'Biometric Topic ' || $2)
      RETURNING topic_id;
    `, [subjectId, uniqueSuffix]);
    topicId = topicRes.rows[0].topic_id;

    // 2. Create questions for topic
    for (let i = 1; i <= 5; i++) {
      const qRes = await pool.query(`
        INSERT INTO questions (question_id, topic_id, question_type, prompt_text, default_points)
        VALUES (gen_random_uuid(), $1, 'MCQ', 'Sample question ' || $2, 2.0)
        RETURNING question_id;
      `, [topicId, i]);
      const qId = qRes.rows[0].question_id;

      await pool.query(`
        INSERT INTO question_options (option_id, question_id, option_text, is_correct, display_order)
        VALUES (gen_random_uuid(), $1, 'Option A', true, 1),
               (gen_random_uuid(), $1, 'Option B', false, 2);
      `, [qId]);
    }

    // 3. Create exam & topic rule
    const examRes = await pool.query(`
      INSERT INTO exams (exam_id, subject_id, title, description, created_by, duration_minutes, total_marks, passing_marks, status)
      VALUES (gen_random_uuid(), $1, 'Biometric Gate Exam', 'Desc', $2, 60, 10.0, 4.0, 'PUBLISHED')
      RETURNING exam_id;
    `, [subjectId, adminUser.userId]);
    examId = examRes.rows[0].exam_id;

    await pool.query(`
      INSERT INTO exam_topic_rules (rule_id, exam_id, topic_id, question_count, points_per_question)
      VALUES (gen_random_uuid(), $1, $2, 3, 2.0);
    `, [examId, topicId]);

    // 4. Create active session
    const sRes = await pool.query(`
      INSERT INTO exam_sessions (session_id, exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '1 hour', 'ACTIVE')
      RETURNING session_id;
    `, [examId]);
    testSessionId = sRes.rows[0].session_id;
  });

  after(async () => {
    teardownMockBiometricS3();
    try {
      await pool.query('DELETE FROM biometric_verifications WHERE session_id = $1;', [testSessionId]).catch(() => {});
      await pool.query('DELETE FROM session_students WHERE session_id = $1;', [testSessionId]).catch(() => {});
      await pool.query('DELETE FROM exam_sessions WHERE session_id = $1;', [testSessionId]).catch(() => {});
      await pool.query('DELETE FROM exam_topic_rules WHERE exam_id = $1;', [examId]).catch(() => {});
      await pool.query('DELETE FROM question_options WHERE question_id IN (SELECT question_id FROM questions WHERE topic_id = $1);', [topicId]).catch(() => {});
      await pool.query('DELETE FROM questions WHERE topic_id = $1;', [topicId]).catch(() => {});
      await pool.query('DELETE FROM exams WHERE exam_id = $1;', [examId]).catch(() => {});
      await pool.query('DELETE FROM topics WHERE topic_id = $1;', [topicId]).catch(() => {});
      if (subjectId) {
        await pool.query('DELETE FROM subjects WHERE subject_id = $1;', [subjectId]).catch(() => {});
      }
    } finally {
      delete process.env.BIOMETRIC_GATE_ENFORCED;
      await closeRedis();
      await closePool();
    }
  });

  it('blocks candidate without any biometric verification record with 403 BIOMETRIC_VERIFICATION_REQUIRED', async () => {
    const student = await createTestUser({
      email: `gate_s1_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`,
      role: 'STUDENT'
    });
    await pool.query('INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, \'ASSIGNED\');', [testSessionId, student.userId]);

    await assert.rejects(
      () => attemptsService.startAttempt(testSessionId, { userId: student.userId, roles: ['STUDENT'] }),
      (err) => err instanceof ForbiddenError && /BIOMETRIC_VERIFICATION_REQUIRED/.test(err.message)
    );
  });

  it('blocks candidate when biometric verification is in LOCKED state with 403 BIOMETRIC_VERIFICATION_LOCKED', async () => {
    const student = await createTestUser({
      email: `gate_s2_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`,
      role: 'STUDENT'
    });
    await pool.query('INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, \'ASSIGNED\');', [testSessionId, student.userId]);

    // Insert LOCKED verification record
    await pool.query(`
      INSERT INTO biometric_verifications (
        session_id, user_id, final_status, match_verdict, liveness_verdict, attempt_number
      ) VALUES ($1, $2, 'LOCKED', 'MISMATCH', 'PASSED', 3);
    `, [testSessionId, student.userId]);

    await assert.rejects(
      () => attemptsService.startAttempt(testSessionId, { userId: student.userId, roles: ['STUDENT'] }),
      (err) => err instanceof ForbiddenError && /BIOMETRIC_VERIFICATION_LOCKED/.test(err.message)
    );
  });

  it('permits candidate when biometric verification is OVERRIDDEN by admin', async () => {
    const student = await createTestUser({
      email: `gate_s3_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`,
      role: 'STUDENT'
    });
    await pool.query('INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, \'ASSIGNED\');', [testSessionId, student.userId]);

    // Admin override
    await biometricsRepo.createAdminOverride({
      sessionId: testSessionId,
      studentId: student.userId,
      adminUserId: adminUser.userId,
      reason: 'Manual identity confirmed at reception desk'
    });

    const result = await attemptsService.startAttempt(testSessionId, {
      userId: student.userId,
      roles: ['STUDENT']
    });

    assert.ok(result.attempt_id);
    assert.equal(result.status, 'ACTIVE');
  });

  it('permits candidate when biometric verification is VERIFIED', async () => {
    const student = await createTestUser({
      email: `gate_s4_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`,
      role: 'STUDENT'
    });
    await pool.query('INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, \'ASSIGNED\');', [testSessionId, student.userId]);

    // Insert VERIFIED record
    await pool.query(`
      INSERT INTO biometric_verifications (
        session_id, user_id, final_status, match_verdict, liveness_verdict, similarity_score, attempt_number
      ) VALUES ($1, $2, 'VERIFIED', 'MATCHED', 'PASSED', 0.9250, 1);
    `, [testSessionId, student.userId]);

    const result = await attemptsService.startAttempt(testSessionId, {
      userId: student.userId,
      roles: ['STUDENT']
    });

    assert.ok(result.attempt_id);
    assert.equal(result.status, 'ACTIVE');
  });

  it('[REQUIRED — Medical Exemption Audit]: bypasses biometric gate and records BIOMETRIC_MEDICAL_EXEMPTION_APPLIED in same transaction', async () => {
    const student = await createTestUser({
      email: `gate_s5_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`,
      role: 'STUDENT'
    });
    await pool.query('INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, \'ASSIGNED\');', [testSessionId, student.userId]);

    // Set student proctoring_strictness to MEDICAL_EXEMPTION
    await pool.query(`
      INSERT INTO student_configurations (student_id, proctoring_strictness, created_by, updated_by)
      VALUES ($1, 'MEDICAL_EXEMPTION', $2, $2)
      ON CONFLICT (student_id) DO UPDATE SET proctoring_strictness = 'MEDICAL_EXEMPTION', updated_by = $2;
    `, [student.userId, adminUser.userId]);

    // startAttempt should succeed without a biometric verification record
    const result = await attemptsService.startAttempt(testSessionId, {
      userId: student.userId,
      roles: ['STUDENT']
    });

    assert.ok(result.attempt_id);
    assert.equal(result.status, 'ACTIVE');

    // Verify immutable audit event BIOMETRIC_MEDICAL_EXEMPTION_APPLIED was emitted
    const auditRes = await pool.query(`
      SELECT *
      FROM audit_logs
      WHERE action = 'BIOMETRIC_MEDICAL_EXEMPTION_APPLIED'
        AND actor_user_id = $1
      ORDER BY created_at DESC
      LIMIT 1;
    `, [student.userId]);

    assert.equal(auditRes.rows.length, 1);
    const auditRow = auditRes.rows[0];
    assert.equal(auditRow.action, 'BIOMETRIC_MEDICAL_EXEMPTION_APPLIED');
    assert.equal(auditRow.resource_type, 'ATTEMPT');
    assert.equal(auditRow.resource_id, result.attempt_id);
    assert.equal(auditRow.metadata.policyValue, 'MEDICAL_EXEMPTION');
    assert.equal(auditRow.metadata.adminGrantedBy, adminUser.userId);
    assert.equal(auditRow.metadata.sessionId, testSessionId);
    assert.equal(auditRow.metadata.attemptId, result.attempt_id);
  });
});
