import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPool, closePool } from '../../src/infrastructure/postgres/pool.js';
import * as biometricsService from '../../src/modules/biometrics/biometrics.service.js';
import * as biometricsRepo from '../../src/modules/biometrics/biometrics.repository.js';
import {
  setupMockBiometricS3,
  teardownMockBiometricS3,
  mockS3Storage,
  createSyntheticFaceJpeg,
  createTestUser
} from './biometricsTestHelper.js';
import { ForbiddenError, ConflictError, ValidationError } from '../../src/utils/errors.js';

describe('biometrics.service (Phase 25 Biometric Service Integration & Injection Tests)', () => {
  let studentUser;
  let testSessionId;
  const pool = getPool();

  before(async () => {
    setupMockBiometricS3();

    studentUser = await createTestUser({
      email: `bio_service_student_${Date.now()}@example.com`,
      role: 'STUDENT'
    });

    // Create minimal exam and session for testing
    const examRes = await pool.query(`
      INSERT INTO exams (exam_id, title, description, created_by, duration_minutes, total_marks, passing_marks, status)
      VALUES (gen_random_uuid(), 'Biometric Service Exam', 'Test Exam', $1, 60, 100, 40, 'PUBLISHED')
      RETURNING exam_id;
    `, [studentUser.userId]);
    const examId = examRes.rows[0].exam_id;

    const sessionRes = await pool.query(`
      INSERT INTO exam_sessions (session_id, exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '10 minutes', NOW() + INTERVAL '2 hours', 'ACTIVE')
      RETURNING session_id;
    `, [examId]);
    testSessionId = sessionRes.rows[0].session_id;

    // Enroll student in session roster
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
      await pool.query('DELETE FROM users WHERE user_id = $1;', [studentUser.userId]);
    } catch {
      // Ignore cleanup error
    } finally {
      await closePool();
    }
  });


  it('enrolls reference face from S3 upload: requestUrl -> S3 PUT -> confirm -> ENROLLED', async () => {
    const { biometricId, uploadUrl } = await biometricsService.requestEnrollmentUploadUrl({
      userId: studentUser.userId,
      fileName: 'ref_face.jpg',
      mimeType: 'image/jpeg',
      byteSize: 4000
    });

    assert.ok(biometricId);
    assert.ok(uploadUrl);

    // Simulate S3 upload
    const record = await biometricsRepo.findFaceBiometricById(biometricId);
    const jpegBuffer = createSyntheticFaceJpeg({ seed: 101 });
    mockS3Storage.set(record.s3_key, {
      body: jpegBuffer,
      contentType: 'image/jpeg',
      length: jpegBuffer.length
    });

    // Confirm enrollment
    const result = await biometricsService.confirmEnrollment({
      userId: studentUser.userId,
      biometricId
    });

    assert.equal(result.enrollmentStatus, 'ENROLLED');
    assert.ok(result.qualityScore >= 0.65);

    // Verify DB record
    const updated = await biometricsRepo.findFaceBiometricById(biometricId);
    assert.equal(updated.enrollment_status, 'ENROLLED');
    assert.equal(updated.embedding_dimension, 128);
    assert.ok(updated.embedding);
  });

  it('[REQUIRED — Embedding Injection A]: confirmEnrollment ignores any client embedding parameter and extracts server-authoritative vector', async () => {
    const { biometricId } = await biometricsService.requestEnrollmentUploadUrl({
      userId: studentUser.userId,
      fileName: 'ref_inject.jpg',
      mimeType: 'image/jpeg',
      byteSize: 4000
    });

    const record = await biometricsRepo.findFaceBiometricById(biometricId);
    const jpegBuffer = createSyntheticFaceJpeg({ seed: 202 });
    mockS3Storage.set(record.s3_key, {
      body: jpegBuffer,
      contentType: 'image/jpeg',
      length: jpegBuffer.length
    });

    // Injected client vector
    const fakeClientVector = Array.from({ length: 128 }, () => 0.999);

    // Call service with injected embedding property
    await biometricsService.confirmEnrollment({
      userId: studentUser.userId,
      biometricId,
      embedding: fakeClientVector
    });

    const enrolled = await biometricsRepo.findFaceBiometricById(biometricId);
    const storedEmbedding = typeof enrolled.embedding === 'string' ? JSON.parse(enrolled.embedding) : enrolled.embedding;

    // The stored embedding MUST NOT match the fake injected vector
    assert.notDeepEqual(storedEmbedding, fakeClientVector);
    assert.equal(storedEmbedding.length, 128);
  });

  it('handles liveness challenge: issues challenge with 8s TTL, evaluates frames, and generates token', async () => {
    const challenge = await biometricsService.requestLivenessChallenge({
      userId: studentUser.userId,
      sessionId: testSessionId
    });

    assert.ok(challenge.challengeId);
    assert.ok(challenge.nonce);
    assert.equal(challenge.expiresInSeconds, 8);
    assert.ok(challenge.expectedActions.length >= 1);

    // Simulate S3 frame upload matching the expected actions
    const challengeRecord = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    const frames = Buffer.concat(
      challenge.expectedActions.map((action, i) =>
        createSyntheticFaceJpeg({ seed: 10 + i, actionTag: action })
      )
    );

    mockS3Storage.set(challengeRecord.live_media_s3_key, {
      body: frames,
      contentType: 'application/octet-stream',
      length: frames.length
    });

    const verifyRes = await biometricsService.verifyLiveness({
      userId: studentUser.userId,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      sessionId: testSessionId
    });

    assert.equal(verifyRes.passed, true);
    assert.ok(verifyRes.livenessToken);

    // Challenge should now be marked consumed
    const updatedChallenge = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    assert.equal(updatedChallenge.status, 'PASSED');
    assert.equal(updatedChallenge.live_media_consumed, true);
  });

  it('pre-exam face verification: verifies matching live selfie against enrolled face', async () => {
    // 1. Issue liveness challenge and pass it
    const challenge = await biometricsService.requestLivenessChallenge({
      userId: studentUser.userId,
      sessionId: testSessionId
    });
    const challengeRecord = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    const frames = Buffer.concat(
      challenge.expectedActions.map((action, i) =>
        createSyntheticFaceJpeg({ seed: 20 + i, actionTag: action })
      )
    );
    mockS3Storage.set(challengeRecord.live_media_s3_key, {
      body: frames,
      contentType: 'application/octet-stream',
      length: frames.length
    });
    const { livenessToken } = await biometricsService.verifyLiveness({
      userId: studentUser.userId,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      sessionId: testSessionId
    });

    // 2. Request live selfie upload URL
    const { liveImageId } = await biometricsService.requestVerificationImageUrl({
      userId: studentUser.userId,
      sessionId: testSessionId,
      mimeType: 'image/jpeg',
      byteSize: 4000
    });

    const verificationRecord = await biometricsRepo.findVerificationById(liveImageId);
    // Upload identical face seed to ensure matching similarity >= 0.85
    const liveSelfie = createSyntheticFaceJpeg({ seed: 202 });
    mockS3Storage.set(verificationRecord.live_image_s3_key, {

      body: liveSelfie,
      contentType: 'image/jpeg',
      length: liveSelfie.length
    });

    // 3. Verify face
    const result = await biometricsService.verifyFace({
      userId: studentUser.userId,
      liveImageId,
      livenessToken
    });

    assert.equal(result.verified, true);
    assert.equal(result.finalStatus, 'VERIFIED');
    assert.ok(result.similarityScore >= 0.85);
  });

  it('[REQUIRED — Embedding Injection B]: verifyFace ignores client liveEmbedding and extracts from S3 image', async () => {
    const challenge = await biometricsService.requestLivenessChallenge({
      userId: studentUser.userId,
      sessionId: testSessionId
    });
    const challengeRecord = await biometricsRepo.findLivenessChallengeById(challenge.challengeId);
    const frames = Buffer.concat(
      challenge.expectedActions.map((action, i) =>
        createSyntheticFaceJpeg({ seed: 30 + i, actionTag: action })
      )
    );
    mockS3Storage.set(challengeRecord.live_media_s3_key, {
      body: frames,
      contentType: 'application/octet-stream',
      length: frames.length
    });
    const { livenessToken } = await biometricsService.verifyLiveness({
      userId: studentUser.userId,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      sessionId: testSessionId
    });



    const { liveImageId } = await biometricsService.requestVerificationImageUrl({
      userId: studentUser.userId,
      sessionId: testSessionId,
      mimeType: 'image/jpeg',
      byteSize: 4000
    });

    const verificationRecord = await biometricsRepo.findVerificationById(liveImageId);
    // Deliberately different face to produce mismatch
    const differentFace = createSyntheticFaceJpeg({ seed: 999 });
    mockS3Storage.set(verificationRecord.live_image_s3_key, {
      body: differentFace,
      contentType: 'image/jpeg',
      length: differentFace.length
    });

    // Attempt to inject a fake 1.0 similarity vector
    const fakeMatchingVector = Array.from({ length: 128 }, () => 1.0);

    const result = await biometricsService.verifyFace({
      userId: studentUser.userId,
      liveImageId,
      livenessToken,
      liveEmbedding: fakeMatchingVector
    });

    // Because the actual S3 image is different, verification must FAIL despite the fake injection
    assert.equal(result.verified, false);
    assert.equal(result.finalStatus, 'FAILED');
  });
});
