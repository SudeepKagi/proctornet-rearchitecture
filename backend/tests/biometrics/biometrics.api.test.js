import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPool, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';

import {
  setupMockBiometricS3,
  teardownMockBiometricS3,
  mockS3Storage,
  createSyntheticFaceJpeg,
  createTestUser
} from './biometricsTestHelper.js';
import * as biometricsRepo from '../../src/modules/biometrics/biometrics.repository.js';

describe('biometrics.api (Phase 25 Biometric REST API & RBAC Endpoints)', () => {
  let studentUser;
  let facultyUser;
  let adminUser;
  let testSessionId;
  const pool = getPool();

  before(async () => {
    setupMockBiometricS3();

    studentUser = await createTestUser({
      email: `bio_api_student_${Date.now()}@example.com`,
      role: 'STUDENT'
    });

    facultyUser = await createTestUser({
      email: `bio_api_faculty_${Date.now()}@example.com`,
      role: 'FACULTY'
    });

    adminUser = await createTestUser({
      email: `bio_api_admin_${Date.now()}@example.com`,
      role: 'ADMIN'
    });

    const examRes = await pool.query(`
      INSERT INTO exams (exam_id, title, description, created_by, duration_minutes, total_marks, passing_marks, status)
      VALUES (gen_random_uuid(), 'Biometric API Exam', 'Test Exam', $1, 60, 100, 40, 'PUBLISHED')
      RETURNING exam_id;
    `, [facultyUser.userId]);
    const examId = examRes.rows[0].exam_id;

    const sessionRes = await pool.query(`
      INSERT INTO exam_sessions (session_id, exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '1 hour', 'ACTIVE')
      RETURNING session_id;
    `, [examId]);
    testSessionId = sessionRes.rows[0].session_id;

    await pool.query(`
      INSERT INTO session_students (session_id, student_id, status)
      VALUES ($1, $2, 'ASSIGNED');
    `, [testSessionId, studentUser.userId]);
  });

  after(async () => {
    teardownMockBiometricS3();
    try {
      await pool.query('DELETE FROM biometric_verifications WHERE session_id = $1;', [testSessionId]);
      await pool.query('DELETE FROM liveness_challenges WHERE session_id = $1;', [testSessionId]);
      await pool.query('DELETE FROM face_biometrics WHERE user_id = $1;', [studentUser.userId]);
      await pool.query('DELETE FROM session_students WHERE session_id = $1;', [testSessionId]);
      await pool.query('DELETE FROM exam_sessions WHERE session_id = $1;', [testSessionId]);
      await pool.query('DELETE FROM users WHERE user_id IN ($1, $2, $3);', [
        studentUser.userId,
        facultyUser.userId,
        adminUser.userId
      ]);
    } catch {
      // Ignore cleanup error
    } finally {
      await closeRedis();
      await closePool();
    }
  });


  it('[REQUIRED — Schema Rejection]: POST /api/v1/candidate/biometrics/verify-face with liveEmbedding returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/candidate/biometrics/verify-face')
      .set('Authorization', `Bearer ${studentUser.token}`)
      .send({
        liveImageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        livenessToken: 'dummy.liveness.token',
        liveEmbedding: Array.from({ length: 128 }, () => 0.5)
      });

    assert.equal(res.status, 400);
    assert.match(res.body.message || JSON.stringify(res.body), /Client-supplied biometric field 'liveEmbedding' is strictly forbidden/);
  });

  it('[REQUIRED — Schema Rejection]: POST /api/v1/candidate/biometrics/enroll-confirm with embedding returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/candidate/biometrics/enroll-confirm')
      .set('Authorization', `Bearer ${studentUser.token}`)
      .send({
        biometricId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        embedding: Array.from({ length: 128 }, () => 0.5)
      });

    assert.equal(res.status, 400);
  });

  it('RBAC: non-STUDENT (FACULTY) cannot access candidate biometric endpoints (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/candidate/biometrics/enroll-url')
      .set('Authorization', `Bearer ${facultyUser.token}`)
      .send({
        fileName: 'face.jpg',
        mimeType: 'image/jpeg',
        byteSize: 4000
      });

    assert.equal(res.status, 403);
  });

  it('RBAC: non-ADMIN (STUDENT) cannot access admin biometric endpoints (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/biometrics/override')
      .set('Authorization', `Bearer ${studentUser.token}`)
      .send({
        sessionId: testSessionId,
        studentId: studentUser.userId,
        reason: 'Unauthorized student attempting self-override'
      });

    assert.equal(res.status, 403);
  });

  it('performs full enrollment and status query via REST API', async () => {
    // 1. Initial status -> NOT_ENROLLED
    const statusRes1 = await request(app)
      .get('/api/v1/candidate/biometrics/status')
      .set('Authorization', `Bearer ${studentUser.token}`);

    assert.equal(statusRes1.status, 200);
    assert.equal(statusRes1.body.isEnrolled, false);

    // 2. Request upload URL
    const urlRes = await request(app)
      .post('/api/v1/candidate/biometrics/enroll-url')
      .set('Authorization', `Bearer ${studentUser.token}`)
      .send({
        fileName: 'my_enrollment.jpg',
        mimeType: 'image/jpeg',
        byteSize: 4000
      });

    assert.equal(urlRes.status, 201);
    const { biometricId, uploadUrl } = urlRes.body;
    assert.ok(biometricId);
    assert.ok(uploadUrl);

    // Simulate S3 upload
    const record = await biometricsRepo.findFaceBiometricById(biometricId);
    const imgBuf = createSyntheticFaceJpeg({ seed: 505 });
    mockS3Storage.set(record.s3_key, {
      body: imgBuf,
      contentType: 'image/jpeg',
      length: imgBuf.length
    });

    // 3. Confirm enrollment
    const confirmRes = await request(app)
      .post('/api/v1/candidate/biometrics/enroll-confirm')
      .set('Authorization', `Bearer ${studentUser.token}`)
      .send({ biometricId });

    assert.equal(confirmRes.status, 202);
    assert.equal(confirmRes.body.enrollmentStatus, 'ENROLLED');

    // 4. Query status -> ENROLLED
    const statusRes2 = await request(app)
      .get('/api/v1/candidate/biometrics/status')
      .set('Authorization', `Bearer ${studentUser.token}`);

    assert.equal(statusRes2.status, 200);
    assert.equal(statusRes2.body.isEnrolled, true);
    assert.equal(statusRes2.body.enrollmentStatus, 'ENROLLED');
    assert.ok(statusRes2.body.qualityScore >= 0.65);
    assert.ok(statusRes2.body.modelVersion);
  });

  it('admin override endpoint permits authorized override with documented reason', async () => {
    const res = await request(app)
      .post('/api/v1/admin/biometrics/override')
      .set('Authorization', `Bearer ${adminUser.token}`)
      .send({
        sessionId: testSessionId,
        studentId: studentUser.userId,
        reason: 'Verified in-person identity by examination supervisor on duty'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.finalStatus, 'OVERRIDDEN');
    assert.ok(res.body.verificationId);
  });

  it('admin session verifications endpoint enforces data minimization (no raw embeddings)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/biometrics/sessions/${testSessionId}`)
      .set('Authorization', `Bearer ${adminUser.token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.verifications));
    assert.ok(res.body.pagination);

    for (const v of res.body.verifications) {
      assert.equal('embedding' in v, false);
      assert.equal('liveEmbedding' in v, false);
      assert.equal('s3_key' in v, false);
      assert.equal('uploadUrl' in v, false);
    }
  });
});
