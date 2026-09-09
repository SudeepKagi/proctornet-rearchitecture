import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPool, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as biometricsService from '../../src/modules/biometrics/biometrics.service.js';
import * as biometricsRepo from '../../src/modules/biometrics/biometrics.repository.js';
import {
  setupMockBiometricS3,
  teardownMockBiometricS3,
  mockS3Storage,
  createSyntheticFaceJpeg,
  createTestUser
} from './biometricsTestHelper.js';

describe('biometrics.security (Phase 25 Anti-Forgery, Nonce Safety & IDOR Defenses)', () => {
  let studentA;
  let studentB;
  let testSessionA;
  let testSessionB;
  const pool = getPool();

  before(async () => {
    setupMockBiometricS3();

    studentA = await createTestUser({
      email: `sec_student_a_${Date.now()}@example.com`,
      role: 'STUDENT'
    });

    studentB = await createTestUser({
      email: `sec_student_b_${Date.now()}@example.com`,
      role: 'STUDENT'
    });

    // Create minimal exam and two sessions
    const examRes = await pool.query(`
      INSERT INTO exams (exam_id, title, description, created_by, duration_minutes, total_marks, passing_marks, status)
      VALUES (gen_random_uuid(), 'Security Test Exam', 'Desc', $1, 60, 100, 40, 'PUBLISHED')
      RETURNING exam_id;
    `, [studentA.userId]);
    const examId = examRes.rows[0].exam_id;

    const sARes = await pool.query(`
      INSERT INTO exam_sessions (session_id, exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '1 hour', 'ACTIVE')
      RETURNING session_id;
    `, [examId]);
    testSessionA = sARes.rows[0].session_id;

    const sBRes = await pool.query(`
      INSERT INTO exam_sessions (session_id, exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '1 hour', 'ACTIVE')
      RETURNING session_id;
    `, [examId]);
    testSessionB = sBRes.rows[0].session_id;

    // Allocate students
    await pool.query(`
      INSERT INTO session_students (session_id, student_id, status)
      VALUES ($1, $2, 'ASSIGNED'), ($3, $4, 'ASSIGNED');
    `, [testSessionA, studentA.userId, testSessionB, studentB.userId]);

    // Enroll Student A reference face
    const { biometricId } = await biometricsService.requestEnrollmentUploadUrl({
      userId: studentA.userId,
      fileName: 'ref_a.jpg',
      mimeType: 'image/jpeg',
      byteSize: 4000
    });
    const record = await biometricsRepo.findFaceBiometricById(biometricId);
    const imgBuf = createSyntheticFaceJpeg({ seed: 777 });
    mockS3Storage.set(record.s3_key, {
      body: imgBuf,
      contentType: 'image/jpeg',
      length: imgBuf.length
    });
    await biometricsService.confirmEnrollment({ userId: studentA.userId, biometricId });
  });

  after(async () => {
    teardownMockBiometricS3();
    try {
      await pool.query('DELETE FROM biometric_verifications WHERE session_id IN ($1, $2);', [testSessionA, testSessionB]);
      await pool.query('DELETE FROM liveness_challenges WHERE session_id IN ($1, $2);', [testSessionA, testSessionB]);
      await pool.query('DELETE FROM face_biometrics WHERE user_id IN ($1, $2);', [studentA.userId, studentB.userId]);
      await pool.query('DELETE FROM session_students WHERE session_id IN ($1, $2);', [testSessionA, testSessionB]);
      await pool.query('DELETE FROM exam_sessions WHERE session_id IN ($1, $2);', [testSessionA, testSessionB]);
      await pool.query('DELETE FROM users WHERE user_id IN ($1, $2);', [studentA.userId, studentB.userId]);
    } catch {
      // Ignore cleanup error
    } finally {
      await closeRedis();
      await closePool();
    }
  });

  it('[REQUIRED — Nonce Reuse]: prevents replay of consumed challenge nonce with 409 Conflict', async () => {
    const challenge = await biometricsService.requestLivenessChallenge({
      userId: studentA.userId,
      sessionId: testSessionA
    });

    const challengeRecord = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    const frames = Buffer.concat(
      challenge.expectedActions.map((action, i) =>
        createSyntheticFaceJpeg({ seed: 50 + i, actionTag: action })
      )
    );
    mockS3Storage.set(challengeRecord.live_media_s3_key, {
      body: frames,
      contentType: 'application/octet-stream',
      length: frames.length
    });

    // First attempt -> PASSED
    const firstRes = await request(app)
      .post('/api/v1/candidate/biometrics/verify-liveness')
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        sessionId: testSessionA
      });

    assert.equal(firstRes.status, 200);
    assert.equal(firstRes.body.passed, true);
    assert.ok(firstRes.body.livenessToken);

    // Second attempt with exact same challenge and nonce -> 409 Conflict
    const secondRes = await request(app)
      .post('/api/v1/candidate/biometrics/verify-liveness')
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        sessionId: testSessionA
      });

    assert.equal(secondRes.status, 409);
    assert.match(secondRes.body.message || JSON.stringify(secondRes.body), /already been consumed/i);

    // Verify DB integrity
    const finalRecord = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    assert.equal(finalRecord.status, 'PASSED');
    assert.equal(finalRecord.live_media_consumed, true);
  });

  it('[REQUIRED — Expired Nonce Replay]: challenge with expired server clock returns 422 and status EXPIRED', async () => {
    const challenge = await biometricsService.requestLivenessChallenge({
      userId: studentA.userId,
      sessionId: testSessionA
    });

    // Manually backdate expires_at in DB
    await pool.query(
      'UPDATE liveness_challenges SET expires_at = NOW() - INTERVAL \'10 seconds\' WHERE challenge_id = $1;',
      [challenge.challengeId]
    );

    const challengeRecord = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    mockS3Storage.set(challengeRecord.live_media_s3_key, {
      body: createSyntheticFaceJpeg({ seed: 99 }),
      contentType: 'application/octet-stream',
      length: 1000
    });

    const res = await request(app)
      .post('/api/v1/candidate/biometrics/verify-liveness')
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        sessionId: testSessionA
      });

    assert.equal(res.status, 422);

    const updated = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    assert.equal(updated.status, 'EXPIRED');
  });

  it('[REQUIRED — Wrong Action Sequence]: frames with wrong action sequence return 422 and status FAILED', async () => {
    const challenge = await biometricsService.requestLivenessChallenge({
      userId: studentA.userId,
      sessionId: testSessionA
    });

    const challengeRecord = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    // Provide an action deliberately missing from expected sequence
    const wrongFrames = Buffer.concat([
      createSyntheticFaceJpeg({ seed: 1, actionTag: 'WRONG_UNEXPECTED_ACTION' })
    ]);
    mockS3Storage.set(challengeRecord.live_media_s3_key, {
      body: wrongFrames,
      contentType: 'application/octet-stream',
      length: wrongFrames.length
    });

    const res = await request(app)
      .post('/api/v1/candidate/biometrics/verify-liveness')
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        sessionId: testSessionA
      });

    assert.equal(res.status, 422);

    const updated = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    assert.equal(updated.status, 'FAILED');
  });

  it('[REQUIRED — Liveness Token Forgery]: forged or tampered token returns 401 Unauthorized', async () => {
    // 1. Fabricated signature
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
      userId: studentA.userId,
      sessionId: testSessionA,
      challengeId: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 300
    })).toString('base64url');
    const forgedToken = `${header}.${body}.invalid_signature_hex_1234567890abcdef`;

    const res = await request(app)
      .post('/api/v1/candidate/biometrics/verify-face')
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({
        liveImageId: crypto.randomUUID(),
        livenessToken: forgedToken
      });

    assert.equal(res.status, 401);
  });

  it('[REQUIRED — Liveness Token Expiry]: token with exp in the past returns 401 Unauthorized', async () => {
    // Generate valid signature but expired timestamp
    const expiredPayload = {
      userId: studentA.userId,
      sessionId: testSessionA,
      challengeId: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) - 60 // expired 60s ago
    };
    const expiredToken = biometricsService.generateLivenessToken(expiredPayload);

    const res = await request(app)
      .post('/api/v1/candidate/biometrics/verify-face')
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({
        liveImageId: crypto.randomUUID(),
        livenessToken: expiredToken
      });

    assert.equal(res.status, 401);
  });

  it('[REQUIRED — IDOR — Wrong Candidate Media]: Candidate A submitting Candidate B challengeId returns 403 Forbidden', async () => {
    // Create challenge for Student B
    // Student B must be enrolled first
    const { biometricId } = await biometricsService.requestEnrollmentUploadUrl({
      userId: studentB.userId,
      fileName: 'ref_b.jpg',
      mimeType: 'image/jpeg',
      byteSize: 4000
    });
    const record = await biometricsRepo.findFaceBiometricById(biometricId);
    mockS3Storage.set(record.s3_key, {
      body: createSyntheticFaceJpeg({ seed: 888 }),
      contentType: 'image/jpeg',
      length: 4000
    });
    await biometricsService.confirmEnrollment({ userId: studentB.userId, biometricId });

    const challengeB = await biometricsService.requestLivenessChallenge({
      userId: studentB.userId,
      sessionId: testSessionB
    });

    // Student A tries to verify Student B's challenge
    const res = await request(app)
      .post('/api/v1/candidate/biometrics/verify-liveness')
      .set('Authorization', `Bearer ${studentA.token}`) // Authenticated as Student A
      .send({
        challengeId: challengeB.challengeId, // Belonging to Student B
        nonce: challengeB.nonce,
        sessionId: testSessionB
      });

    assert.equal(res.status, 403);
  });

  it('[REQUIRED — 3-Attempt Lockout]: 3 consecutive failed verification attempts lock candidate from further attempts', async () => {
    // Pass liveness to obtain valid token
    const challenge = await biometricsService.requestLivenessChallenge({
      userId: studentA.userId,
      sessionId: testSessionA
    });
    const challengeRecord = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    const frames = Buffer.concat(
      challenge.expectedActions.map((action, i) =>
        createSyntheticFaceJpeg({ seed: 70 + i, actionTag: action })
      )
    );
    mockS3Storage.set(challengeRecord.live_media_s3_key, {
      body: frames,
      contentType: 'application/octet-stream',
      length: frames.length
    });
    const { livenessToken } = await biometricsService.verifyLiveness({
      userId: studentA.userId,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      sessionId: testSessionA
    });

    // Deliberate mismatched face (seed 999 vs reference seed 777)
    const mismatchFace = createSyntheticFaceJpeg({ seed: 999 });

    // Attempt 1: Fail
    const { liveImageId: id1 } = await biometricsService.requestVerificationImageUrl({
      userId: studentA.userId,
      sessionId: testSessionA,
      mimeType: 'image/jpeg',
      byteSize: 4000
    });
    const rec1 = await biometricsRepo.findVerificationById(id1);
    mockS3Storage.set(rec1.live_image_s3_key, { body: mismatchFace, contentType: 'image/jpeg', length: mismatchFace.length });
    const res1 = await biometricsService.verifyFace({ userId: studentA.userId, liveImageId: id1, livenessToken });
    assert.equal(res1.verified, false);
    assert.equal(res1.finalStatus, 'FAILED');

    // Attempt 2: Fail
    const { liveImageId: id2 } = await biometricsService.requestVerificationImageUrl({
      userId: studentA.userId,
      sessionId: testSessionA,
      mimeType: 'image/jpeg',
      byteSize: 4000
    });
    const rec2 = await biometricsRepo.findVerificationById(id2);
    mockS3Storage.set(rec2.live_image_s3_key, { body: mismatchFace, contentType: 'image/jpeg', length: mismatchFace.length });
    const res2 = await biometricsService.verifyFace({ userId: studentA.userId, liveImageId: id2, livenessToken });
    assert.equal(res2.verified, false);
    assert.equal(res2.finalStatus, 'FAILED');

    // Attempt 3: Fail -> LOCKED
    const { liveImageId: id3 } = await biometricsService.requestVerificationImageUrl({
      userId: studentA.userId,
      sessionId: testSessionA,
      mimeType: 'image/jpeg',
      byteSize: 4000
    });
    const rec3 = await biometricsRepo.findVerificationById(id3);
    mockS3Storage.set(rec3.live_image_s3_key, { body: mismatchFace, contentType: 'image/jpeg', length: mismatchFace.length });

    await assert.rejects(
      () => biometricsService.verifyFace({ userId: studentA.userId, liveImageId: id3, livenessToken }),
      (err) => err.statusCode === 403 && /BIOMETRIC_VERIFICATION_LOCKED/.test(err.message)
    );

    const rec3Final = await biometricsRepo.findVerificationById(id3);
    assert.equal(rec3Final.final_status, 'LOCKED');

    // Subsequent request for upload URL is rejected with 403 LOCKED
    await assert.rejects(
      () => biometricsService.requestVerificationImageUrl({
        userId: studentA.userId,
        sessionId: testSessionA,
        mimeType: 'image/jpeg',
        byteSize: 4000
      }),
      (err) => err.statusCode === 403 && /BIOMETRIC_VERIFICATION_LOCKED/.test(err.message)
    );
  });
});
