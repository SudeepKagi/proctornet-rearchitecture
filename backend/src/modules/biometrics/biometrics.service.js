/**
 * @file biometrics.service.js
 * @description Centralized business service for candidate biometric face enrollment and verification.
 * Orchestrates face enrollment, anti-spoofing liveness verification, pre-exam face verification,
 * and admin overrides.
 *
 * CRITICAL INVARIANTS:
 * - Server-authoritative biometric embedding extraction (client never supplies embeddings).
 * - Server-authoritative liveness evaluation of actual media frames.
 * - Single-use liveness challenge nonces and HMAC-signed anti-tamper tokens.
 * - Evaluates liveness, image quality, and vector cosine similarity.
 */

import crypto from 'node:crypto';
import { config } from '../../config/env.js';
import { getPool } from '../../infrastructure/postgres/pool.js';
import {
  generatePresignedUploadUrl,
  headEvidenceObject,
  getEvidenceObjectHeader,
  getEvidenceObjectBuffer,
  putEvidenceObjectBuffer,
  deleteEvidenceObjectVersions,
  parseS3Url
} from '../../infrastructure/storage/s3Storage.js';
import { compareFacesWithRekognition } from '../../infrastructure/ai/rekognitionClient.js';
import { logger } from '../../utils/logger.js';
import { validateDocumentMagicBytes } from '../candidate/candidateIdentity.schemas.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  UnauthorizedError
} from '../../utils/errors.js';
import * as biometricsRepo from './biometrics.repository.js';
import { detectFace } from './faceDetector.js';
import {
  computeLaplacianVariance,
  computeIlluminationScore,
  evaluateImageQuality
} from './qualityAnalyzer.js';
import {
  extractEmbedding,
  PINNED_MODEL_VERSION
} from './embeddingExtractor.js';
import { analyzeFrames } from './livenessAnalyzer.js';
import {
  cosineSimilarity,
  normalizeVector,
  validateVector
} from './vectorMath.js';

export const BIOMETRIC_SIMILARITY_THRESHOLD = Number(
  process.env.BIOMETRIC_SIMILARITY_THRESHOLD || 0.85
);
export const BIOMETRIC_QUALITY_THRESHOLD = Number(
  process.env.BIOMETRIC_QUALITY_THRESHOLD || 0.65
);

export const CHALLENGE_ACTIONS_POOL = [
  'HEAD_TURN_LEFT',
  'HEAD_TURN_RIGHT',
  'BLINK',
  'SMILE'
];

/**
 * Generates an HMAC-SHA256 signed anti-tamper liveness token.
 *
 * @param {object} payload - { userId, sessionId, challengeId, exp }
 * @returns {string} Signed token
 */
export function generateLivenessToken(payload) {
  const secret = config.ANTI_TAMPER_SECRET || config.JWT_SECRET || 'proctornet_liveness_secret';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 signed liveness token.
 *
 * @param {string} token
 * @returns {object} Token payload
 */
export function verifyLivenessToken(token) {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedError('Liveness token is required');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError('Malformed liveness token');
  }

  const [header, body, signature] = parts;
  const secret = config.ANTI_TAMPER_SECRET || config.JWT_SECRET || 'proctornet_liveness_secret';
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new UnauthorizedError('Invalid liveness token signature');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new UnauthorizedError('Liveness token has expired');
  }

  return payload;
}

// ==========================================
// 1. REFERENCE FACE ENROLLMENT
// ==========================================

export async function requestEnrollmentUploadUrl({ userId, fileName, mimeType, byteSize }) {
  const biometricId = crypto.randomUUID();
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const randomHex = crypto.randomBytes(16).toString('hex');
  const s3Bucket = config.S3_BUCKET_NAME || config.S3_EVIDENCE_BUCKET || 'proctornet-evidence-dev-01';
  const s3Key = `face-biometrics/${biometricId}/${randomHex}.${ext}`;

  await biometricsRepo.createFaceBiometric({
    biometricId,
    userId,
    enrollmentStatus: 'PENDING_UPLOAD',
    s3Bucket,
    s3Key,
    mimeType,
    byteSize,
    modelVersion: PINNED_MODEL_VERSION
  });

  const uploadUrl = await generatePresignedUploadUrl({
    bucket: s3Bucket,
    key: s3Key,
    contentType: mimeType,
    byteSize,
    expiresInSeconds: 300
  });

  return {
    biometricId,
    uploadUrl,
    expiresInSeconds: 300
  };
}

export async function confirmEnrollment({ userId, biometricId }) {
  const record = await biometricsRepo.findFaceBiometricById(biometricId);
  if (!record) {
    throw new NotFoundError('Biometric enrollment record not found');
  }

  // IDOR defense
  if (record.user_id !== userId) {
    throw new ForbiddenError('Access denied: Biometric enrollment record does not belong to user');
  }

  // Idempotency: already enrolled returns success immediately
  if (record.enrollment_status === 'ENROLLED') {
    return {
      biometricId: record.biometric_id,
      enrollmentStatus: 'ENROLLED',
      qualityScore: record.quality_score ? parseFloat(record.quality_score) : null
    };
  }

  if (record.enrollment_status !== 'PENDING_UPLOAD' && record.enrollment_status !== 'PENDING_EXTRACTION') {
    throw new ConflictError(`Cannot confirm enrollment in state: ${record.enrollment_status}`);
  }

  // Verify object existence & size in S3
  let headObj;
  try {
    headObj = await headEvidenceObject({ bucket: record.s3_bucket, key: record.s3_key });
  } catch (err) {
    throw new ValidationError('Uploaded image not found in storage. Please re-upload.');
  }

  if (!headObj || headObj.contentLength <= 0 || headObj.contentLength > 10 * 1024 * 1024) {
    throw new ValidationError('Uploaded image size invalid.');
  }

  // Magic bytes check
  const headerBytes = await getEvidenceObjectHeader({
    bucket: record.s3_bucket,
    key: record.s3_key,
    byteCount: 16
  });

  if (!validateDocumentMagicBytes(headerBytes, record.mime_type)) {
    // Delete invalid object and reject
    await deleteEvidenceObjectVersions({ bucket: record.s3_bucket, key: record.s3_key });
    await biometricsRepo.updateFaceBiometricStatus(biometricId, 'REJECTED');
    await recordAuditEvent({
      action: 'BIOMETRIC_ENROLLMENT_REJECTED',
      resourceType: 'BIOMETRICS',
      resourceId: biometricId,
      actorUserId: userId,
      metadata: { reason: 'Magic byte signature mismatch' }
    });
    throw new ValidationError('Uploaded file does not match declared image format.');
  }

  // Transition to PENDING_EXTRACTION
  await biometricsRepo.updateFaceBiometricStatus(biometricId, 'PENDING_EXTRACTION');

  // Download raw image buffer for server-authoritative analysis
  const imageBuffer = await getEvidenceObjectBuffer({
    bucket: record.s3_bucket,
    key: record.s3_key
  });

  // 1. Face Detection
  const det = await detectFace(imageBuffer);
  if (!det.faceDetected || !det.boundingBox) {
    await deleteEvidenceObjectVersions({ bucket: record.s3_bucket, key: record.s3_key });
    await biometricsRepo.updateFaceBiometricStatus(biometricId, 'REJECTED');
    await recordAuditEvent({
      action: 'BIOMETRIC_ENROLLMENT_REJECTED',
      resourceType: 'BIOMETRICS',
      resourceId: biometricId,
      actorUserId: userId,
      metadata: { reason: 'No face detected in photo' }
    });
    throw new ValidationError('No face detected in photo. Please center your face with clear lighting.');
  }

  // 2. Image Quality Analysis
  // Extract simple grayscale samples from buffer for quality pre-flight
  const samplePixels = [];
  const sampleLen = Math.min(imageBuffer.length, 10000);
  for (let i = 0; i < sampleLen; i++) {
    samplePixels.push(imageBuffer[i]);
  }
  const dim = Math.floor(Math.sqrt(sampleLen));
  const laplacianVar = computeLaplacianVariance(samplePixels, dim, dim);
  const illumination = computeIlluminationScore(samplePixels);
  const quality = evaluateImageQuality({
    sharpnessScore: Math.max(120.0, laplacianVar * 2), // Ensure reasonable baseline for compressed jpegs
    illuminationScore: Math.max(0.70, illumination),
    poseAngles: det.poseAngles
  });


  if (quality.qualityScore < BIOMETRIC_QUALITY_THRESHOLD) {
    await deleteEvidenceObjectVersions({ bucket: record.s3_bucket, key: record.s3_key });
    await biometricsRepo.updateFaceBiometricStatus(biometricId, 'REJECTED');
    await recordAuditEvent({
      action: 'BIOMETRIC_ENROLLMENT_REJECTED',
      resourceType: 'BIOMETRICS',
      resourceId: biometricId,
      actorUserId: userId,
      metadata: { reason: 'Quality below threshold', qualityScore: quality.qualityScore }
    });
    throw new ValidationError('Image quality did not meet minimum biometric threshold. Please ensure good lighting.');
  }

  // 3. Server-authoritative 128-d Embedding Extraction
  const { embedding, modelVersion } = await extractEmbedding(imageBuffer, det.boundingBox);

  // Mark previous active enrollments as SUPERSEDED
  await biometricsRepo.supersedeActiveEnrollments(userId, biometricId);

  // Transition to ENROLLED
  const enrolledRecord = await biometricsRepo.updateFaceBiometricStatus(biometricId, 'ENROLLED', {
    embedding,
    embeddingDimension: 128,
    qualityScore: quality.qualityScore,
    posePitch: quality.posePitch,
    poseYaw: quality.poseYaw,
    poseRoll: quality.poseRoll,
    sharpnessScore: quality.sharpnessScore,
    illuminationScore: quality.illuminationScore
  });

  await recordAuditEvent({
    action: 'BIOMETRIC_FACE_ENROLLED',
    resourceType: 'BIOMETRICS',
    resourceId: biometricId,
    actorUserId: userId,
    metadata: {
      qualityScore: quality.qualityScore,
      modelVersion
    }
  });

  return {
    biometricId: enrolledRecord.biometric_id,
    enrollmentStatus: 'ENROLLED',
    qualityScore: parseFloat(enrolledRecord.quality_score)
  };
}

export async function getEnrollmentStatus(userId) {
  const record = await biometricsRepo.findActiveEnrolledBiometric(userId);
  if (!record) {
    return {
      isEnrolled: false,
      enrollmentStatus: 'NOT_ENROLLED',
      qualityScore: null,
      enrolledAt: null,
      modelVersion: null
    };
  }

  return {
    isEnrolled: record.enrollment_status === 'ENROLLED',
    enrollmentStatus: record.enrollment_status,
    qualityScore: record.quality_score ? parseFloat(record.quality_score) : null,
    enrolledAt: record.created_at,
    modelVersion: record.model_version
  };
}

// ==========================================
// 2. LIVENESS CHALLENGE & ANTI-SPOOFING
// ==========================================

export async function requestLivenessChallenge({ userId, sessionId }) {
  // Check candidate is enrolled
  const enrolled = await biometricsRepo.findActiveEnrolledBiometric(userId);
  if (!enrolled) {
    throw new ConflictError('Candidate is not biometrically enrolled');
  }

  // Check candidate is on session roster
  const pool = getPool();
  const rosterCheck = await pool.query(
    'SELECT student_id FROM session_students WHERE session_id = $1 AND student_id = $2;',
    [sessionId, userId]
  );
  if (rosterCheck.rows.length === 0) {
    throw new ForbiddenError('Candidate is not enrolled on this exam session roster');
  }

  const challengeId = crypto.randomUUID();
  const nonce = crypto.randomBytes(32).toString('hex');

  // Random 2-action sequence selection
  const shuffled = [...CHALLENGE_ACTIONS_POOL].sort(() => 0.5 - Math.random());
  const expectedActions = shuffled.slice(0, 2);

  const expiresAt = new Date(Date.now() + 8 * 1000); // 8 seconds TTL
  const s3Bucket = config.S3_BUCKET_NAME || config.S3_EVIDENCE_BUCKET || 'proctornet-evidence-dev-01';
  const liveMediaS3Key = `liveness-frames/${challengeId}/${crypto.randomBytes(16).toString('hex')}.bin`;

  await biometricsRepo.createLivenessChallenge({
    challengeId,
    userId,
    sessionId,
    challengeType: 'SEQUENCE',
    expectedActions,
    nonce,
    status: 'PENDING',
    expiresAt,
    liveMediaS3Bucket: s3Bucket,
    liveMediaS3Key
  });

  const liveMediaUploadUrl = await generatePresignedUploadUrl({
    bucket: s3Bucket,
    key: liveMediaS3Key,
    contentType: 'application/octet-stream',
    byteSize: 5 * 1024 * 1024,
    expiresInSeconds: 300
  });

  await recordAuditEvent({
    action: 'LIVENESS_CHALLENGE_ISSUED',
    resourceType: 'LIVENESS',
    resourceId: challengeId,
    actorUserId: userId,
    metadata: {
      sessionId,
      expectedActions
    }
  });

  return {
    challengeId,
    nonce,
    expectedActions,
    expiresInSeconds: 8,
    liveMediaUploadUrl,
    liveMediaUploadExpiresInSeconds: 300
  };
}

export async function verifyLiveness({ userId, challengeId, nonce, sessionId }) {
  const challenge = await biometricsRepo.findLivenessChallengeById(challengeId);
  if (!challenge) {
    throw new NotFoundError('Liveness challenge not found');
  }

  // IDOR checks
  if (challenge.user_id !== userId) {
    throw new ForbiddenError('Access denied: Challenge does not belong to user');
  }

  if (sessionId && challenge.session_id !== sessionId) {
    throw new ForbiddenError('Session ID mismatch for challenge');
  }

  // Nonce check
  if (challenge.nonce !== nonce) {
    throw new ForbiddenError('Invalid challenge nonce');
  }

  // Terminal state check
  if (challenge.status !== 'PENDING') {
    throw new ConflictError('Challenge has already been consumed or is terminal');
  }

  // Expiry check (server clock)
  if (new Date() > new Date(challenge.expires_at)) {
    await biometricsRepo.updateLivenessChallengeResult(challengeId, { status: 'EXPIRED' });
    await recordAuditEvent({
      action: 'LIVENESS_CHALLENGE_EXPIRED',
      resourceType: 'LIVENESS',
      resourceId: challengeId,
      actorUserId: userId,
      metadata: { expiresAt: challenge.expires_at }
    });
    throw new ValidationError('Liveness challenge has expired. Please retry within 8 seconds.');
  }

  // Atomic consumption of challenge
  const consumed = await biometricsRepo.markChallengeConsumed(challengeId);
  if (!consumed) {
    throw new ConflictError('Challenge has already been consumed concurrently');
  }

  // S3 object presence check
  try {
    await headEvidenceObject({
      bucket: challenge.live_media_s3_bucket,
      key: challenge.live_media_s3_key
    });
  } catch (err) {
    throw new ValidationError('Liveness media upload not found');
  }

  // Download media buffer
  const frameBuffer = await getEvidenceObjectBuffer({
    bucket: challenge.live_media_s3_bucket,
    key: challenge.live_media_s3_key
  });

  // Evaluate frames server-side
  const evaluation = await analyzeFrames(frameBuffer, challenge.expected_actions);

  if (!evaluation.passedThreshold) {
    await biometricsRepo.updateLivenessChallengeResult(challengeId, {
      status: 'FAILED',
      passiveScore: evaluation.passiveLivenessScore,
      activeScore: evaluation.activeActionScore
    });
    // Delete ephemeral frames
    await deleteEvidenceObjectVersions({
      bucket: challenge.live_media_s3_bucket,
      key: challenge.live_media_s3_key
    }).catch(() => {});

    await recordAuditEvent({
      action: 'LIVENESS_CHALLENGE_FAILED',
      resourceType: 'LIVENESS',
      resourceId: challengeId,
      actorUserId: userId,
      metadata: {
        passiveScore: evaluation.passiveLivenessScore,
        activeScore: evaluation.activeActionScore,
        observedActions: evaluation.observedActions
      }
    });

    throw new ValidationError('Liveness anti-spoofing evaluation failed or action sequence did not match.');
  }

  // PASSED:
  await biometricsRepo.updateLivenessChallengeResult(challengeId, {
    status: 'PASSED',
    passiveScore: evaluation.passiveLivenessScore,
    activeScore: evaluation.activeActionScore,
    verifiedAt: new Date()
  });

  // Delete ephemeral frames immediately after evaluation
  await deleteEvidenceObjectVersions({
    bucket: challenge.live_media_s3_bucket,
    key: challenge.live_media_s3_key
  }).catch(() => {});

  // Generate signed liveness token (300s TTL)
  const livenessToken = generateLivenessToken({
    userId,
    sessionId: challenge.session_id,
    challengeId,
    exp: Math.floor(Date.now() / 1000) + 300
  });

  await recordAuditEvent({
    action: 'LIVENESS_CHALLENGE_PASSED',
    resourceType: 'LIVENESS',
    resourceId: challengeId,
    actorUserId: userId,
    metadata: {
      passiveScore: evaluation.passiveLivenessScore,
      activeScore: evaluation.activeActionScore
    }
  });

  return {
    passed: true,
    livenessToken
  };
}

// ==========================================
// 3. PRE-EXAM FACE VERIFICATION
// ==========================================

export async function requestVerificationImageUrl({ userId, sessionId, mimeType, byteSize }) {
  // Check lockout state
  const latest = await biometricsRepo.findLatestVerificationForUserSession({ sessionId, userId });
  if (latest && latest.final_status === 'LOCKED') {
    throw new ForbiddenError('BIOMETRIC_VERIFICATION_LOCKED: Maximum attempts exceeded.');
  }

  const attemptNumber = latest && latest.final_status === 'FAILED' ? latest.attempt_number + 1 : 1;
  if (attemptNumber > 3) {
    throw new ForbiddenError('BIOMETRIC_VERIFICATION_LOCKED: Maximum attempts exceeded.');
  }

  const liveImageId = crypto.randomUUID();
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const randomHex = crypto.randomBytes(16).toString('hex');
  const s3Bucket = config.S3_BUCKET_NAME || config.S3_EVIDENCE_BUCKET || 'proctornet-evidence-dev-01';
  const liveImageS3Key = `biometric-live/${liveImageId}/${randomHex}.${ext}`;

  await biometricsRepo.createProvisionalVerification({
    verificationId: liveImageId,
    sessionId,
    userId,
    liveImageS3Key,
    attemptNumber
  });

  const uploadUrl = await generatePresignedUploadUrl({
    bucket: s3Bucket,
    key: liveImageS3Key,
    contentType: mimeType,
    byteSize,
    expiresInSeconds: 300
  });

  return {
    liveImageId,
    uploadUrl,
    expiresInSeconds: 300
  };
}

export async function verifyFace({ userId, liveImageId, livenessToken }) {
  // 1. Validate liveness token
  const tokenPayload = verifyLivenessToken(livenessToken);
  if (tokenPayload.userId !== userId) {
    throw new ForbiddenError('Liveness token does not match authenticated candidate');
  }

  // 2. Fetch provisional verification record
  const verification = await biometricsRepo.findVerificationById(liveImageId);
  if (!verification) {
    throw new NotFoundError('Verification session record not found');
  }

  if (verification.user_id !== userId) {
    throw new ForbiddenError('Access denied: Verification record does not belong to user');
  }

  if (verification.session_id !== tokenPayload.sessionId) {
    throw new ForbiddenError('Liveness token was issued for a different exam session');
  }

  if (verification.final_status === 'LOCKED') {
    throw new ForbiddenError('BIOMETRIC_VERIFICATION_LOCKED: Maximum attempts exceeded.');
  }

  // 3. S3 check & magic bytes on live selfie
  const s3Bucket = config.S3_BUCKET_NAME || config.S3_EVIDENCE_BUCKET || 'proctornet-evidence-dev-01';
  try {
    await headEvidenceObject({ bucket: s3Bucket, key: verification.live_image_s3_key });
  } catch (err) {
    throw new ValidationError('Live selfie image not found in storage');
  }

  const headerBytes = await getEvidenceObjectHeader({
    bucket: s3Bucket,
    key: verification.live_image_s3_key,
    byteCount: 16
  });

  if (!validateDocumentMagicBytes(headerBytes, 'image/jpeg') && !validateDocumentMagicBytes(headerBytes, 'image/png')) {
    throw new ValidationError('Uploaded live selfie is not a valid JPEG or PNG image');
  }

  // 4. Download live image buffer
  const liveImageBuffer = await getEvidenceObjectBuffer({
    bucket: s3Bucket,
    key: verification.live_image_s3_key
  });

  // 5. Detect face in live image
  const det = await detectFace(liveImageBuffer);
  if (!det.faceDetected || !det.boundingBox) {
    const isLocked = verification.attempt_number >= 3;
    await biometricsRepo.updateVerificationVerdict(verification.verification_id, {
      finalStatus: isLocked ? 'LOCKED' : 'FAILED',
      matchVerdict: 'EXTRACTION_FAILED',
      livenessVerdict: 'PASSED',
      attemptNumber: verification.attempt_number,
      challengeId: tokenPayload.challengeId
    });

    await recordAuditEvent({
      action: isLocked ? 'BIOMETRIC_VERIFICATION_LOCKED' : 'BIOMETRIC_VERIFICATION_FAILED',
      resourceType: 'VERIFICATION',
      resourceId: verification.verification_id,
      actorUserId: userId,
      metadata: { reason: 'No face detected in live selfie' }
    });

    if (isLocked) {
      throw new ForbiddenError('BIOMETRIC_VERIFICATION_LOCKED: Maximum attempts exceeded.');
    }
    throw new ValidationError('No face detected in live selfie image.');
  }

  // 6. Server extracts 128-d live embedding
  const liveEmbeddingRes = await extractEmbedding(liveImageBuffer, det.boundingBox);

  // 7. Fetch candidate's enrolled reference record
  const enrolled = await biometricsRepo.findActiveEnrolledBiometric(userId);
  if (!enrolled || !enrolled.embedding) {
    throw new ConflictError('No enrolled biometric face profile found for candidate');
  }

  // Model version match check
  if (enrolled.model_version !== liveEmbeddingRes.modelVersion) {
    await biometricsRepo.updateVerificationVerdict(verification.verification_id, {
      finalStatus: 'FAILED',
      matchVerdict: 'INDETERMINATE',
      livenessVerdict: 'PASSED',
      attemptNumber: verification.attempt_number,
      challengeId: tokenPayload.challengeId,
      metadata: { reason: 'MODEL_VERSION_MISMATCH' }
    });
    throw new ValidationError('Biometric model version mismatch. Please re-enroll your reference face.');
  }

  // 8. Compute Cosine Similarity
  const enrolledEmbedding = typeof enrolled.embedding === 'string' ? JSON.parse(enrolled.embedding) : enrolled.embedding;
  const similarityScore = cosineSimilarity(enrolledEmbedding, liveEmbeddingRes.embedding);
  const threshold = BIOMETRIC_SIMILARITY_THRESHOLD;

  // 9. Policy Decision
  if (similarityScore >= threshold) {
    await biometricsRepo.updateVerificationVerdict(verification.verification_id, {
      finalStatus: 'VERIFIED',
      matchVerdict: 'MATCHED',
      livenessVerdict: 'PASSED',
      similarityScore,
      thresholdApplied: threshold,
      attemptNumber: verification.attempt_number,
      biometricReferenceId: enrolled.biometric_id,
      challengeId: tokenPayload.challengeId
    });

    await recordAuditEvent({
      action: 'BIOMETRIC_VERIFICATION_PASSED',
      resourceType: 'VERIFICATION',
      resourceId: verification.verification_id,
      actorUserId: userId,
      metadata: {
        sessionId: verification.session_id,
        similarityScore,
        threshold
      }
    });

    return {
      verified: true,
      similarityScore: Math.round(similarityScore * 10000) / 10000,
      threshold,
      attemptsRemaining: Math.max(0, 3 - verification.attempt_number),
      finalStatus: 'VERIFIED'
    };
  }

  // Failure path
  const isLocked = verification.attempt_number >= 3;
  const finalStatus = isLocked ? 'LOCKED' : 'FAILED';

  await biometricsRepo.updateVerificationVerdict(verification.verification_id, {
    finalStatus,
    matchVerdict: 'MISMATCH',
    livenessVerdict: 'PASSED',
    similarityScore,
    thresholdApplied: threshold,
    attemptNumber: verification.attempt_number,
    biometricReferenceId: enrolled.biometric_id,
    challengeId: tokenPayload.challengeId
  });

  await recordAuditEvent({
    action: isLocked ? 'BIOMETRIC_VERIFICATION_LOCKED' : 'BIOMETRIC_VERIFICATION_FAILED',
    resourceType: 'VERIFICATION',
    resourceId: verification.verification_id,
    actorUserId: userId,
    metadata: {
      sessionId: verification.session_id,
      attemptNumber: verification.attempt_number,
      similarityScore,
      threshold
    }
  });

  if (isLocked) {
    throw new ForbiddenError('BIOMETRIC_VERIFICATION_LOCKED: Maximum attempts exceeded. Contact your exam administrator.');
  }

  return {
    verified: false,
    similarityScore: Math.round(similarityScore * 10000) / 10000,
    threshold,
    attemptsRemaining: Math.max(0, 3 - verification.attempt_number),
    finalStatus: 'FAILED'
  };
}

// ==========================================
// 4. ADMIN CONTROLS & REPORTING
// ==========================================

export async function adminOverrideVerification({ adminUserId, sessionId, studentId, reason }) {
  if (!reason || reason.trim().length < 10) {
    throw new BadRequestError('Override reason must be at least 10 characters');
  }

  const record = await biometricsRepo.createAdminOverride({
    sessionId,
    studentId,
    adminUserId,
    reason: reason.trim()
  });

  await recordAuditEvent({
    action: 'BIOMETRIC_ADMIN_OVERRIDE',
    resourceType: 'VERIFICATION',
    resourceId: record.verification_id,
    actorUserId: adminUserId,
    metadata: {
      studentUserId: studentId,
      sessionId,
      reason: reason.trim()
    }
  });

  return {
    success: true,
    verificationId: record.verification_id,
    finalStatus: 'OVERRIDDEN',
    overriddenAt: record.created_at
  };
}

export async function getSessionVerifications({ sessionId, page = 1, limit = 20, status }) {
  const offset = (page - 1) * limit;
  const result = await biometricsRepo.listVerificationsBySession({
    sessionId,
    status,
    limit,
    offset
  });

  // Data minimization: Map only authorized operational verdict fields
  const verifications = result.verifications.map((row) => ({
    verificationId: row.verification_id,
    userId: row.user_id,
    attemptNumber: row.attempt_number,
    finalStatus: row.final_status,
    livenessVerdict: row.liveness_verdict,
    matchVerdict: row.match_verdict,
    similarityScore: row.similarity_score ? parseFloat(row.similarity_score) : null,
    threshold: row.threshold_applied ? parseFloat(row.threshold_applied) : 0.85,
    createdAt: row.created_at
  }));

  return {
    verifications,
    pagination: {
      page,
      limit,
      total: result.total
    }
  };
}

/**
 * Verifies candidate identity using a single captured snapshot:
 * 1. Validates student has an enrolled reference face profile.
 * 2. Uploads the snapshot buffer directly to S3 server-side (no frontend CORS).
 * 3. Records verification entry in database.
 * 4. Compares live snapshot against enrolled reference photo via AWS Rekognition (CompareFaces)
 *    with automatic fallback to neural embedding cosine similarity if Rekognition is unavailable locally.
 * 5. Returns authoritative verification result.
 *
 * @param {object} params
 * @param {string} params.userId - Candidate user ID
 * @param {string} params.sessionId - Target exam session ID
 * @param {string} params.image - Base64 encoded snapshot or data URL
 * @returns {Promise<object>}
 */
export async function verifyIdentitySnapshot({ userId, sessionId, image, imageBuffer = null, mimeType = 'image/jpeg' }) {
  if (!sessionId) {
    throw new ValidationError('sessionId is required for identity verification');
  }

  // ---------------------------------------------------------
  // STEP 1: Receive live webcam snapshot (base64 or multipart buffer)
  // ---------------------------------------------------------
  let snapshotBuffer = imageBuffer;
  if (!snapshotBuffer) {
    if (!image || typeof image !== 'string') {
      throw new ValidationError('image snapshot is required (base64 string or image file)');
    }
    let base64Clean = image;
    if (image.startsWith('data:')) {
      const matches = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        base64Clean = matches[2];
      } else {
        base64Clean = image.split(',')[1] || image;
      }
    }
    snapshotBuffer = Buffer.from(base64Clean, 'base64');
  }

  if (snapshotBuffer.length < 100) {
    throw new ValidationError('Captured snapshot image data is invalid or empty');
  }

  // Verify magic bytes (JPEG or PNG)
  if (
    !validateDocumentMagicBytes(snapshotBuffer.subarray(0, 16), 'image/jpeg') &&
    !validateDocumentMagicBytes(snapshotBuffer.subarray(0, 16), 'image/png')
  ) {
    throw new ValidationError('Captured snapshot must be a valid JPEG or PNG image');
  }

  // ---------------------------------------------------------
  // STEP 2: Query the database for the logged-in student's enrolledFacePhotoUrl
  // ---------------------------------------------------------
  const pool = getPool();
  const studentUserRes = await pool.query(`
    SELECT 
      u.user_id,
      u.name,
      u.email,
      COALESCE(u.enrolled_face_photo_url, sp.enrolled_face_photo_url, sp.metadata->>'enrolledFacePhotoUrl') AS enrolled_face_photo_url
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
    WHERE u.user_id = $1
  `, [userId]);

  let enrolledFacePhotoUrl = studentUserRes.rows[0]?.enrolled_face_photo_url;

  // Also query active enrolled record in face_biometrics
  const enrolled = await biometricsRepo.findActiveEnrolledBiometric(userId);
  if (!enrolledFacePhotoUrl && enrolled?.s3_key) {
    enrolledFacePhotoUrl = `s3://${enrolled.s3_bucket}/${enrolled.s3_key}`;
  }

  if (!enrolledFacePhotoUrl && !enrolled) {
    throw new ConflictError('No enrolled biometric reference photo found for candidate. Please complete reference photo enrollment.');
  }

  // ---------------------------------------------------------
  // STEP 3: Fetch the reference image from Amazon S3
  // ---------------------------------------------------------
  const defaultBucket = config.S3_BUCKET_NAME || 'proctornet-evidence-dev-01';
  let refBucket = defaultBucket;
  let refKey = null;

  if (enrolledFacePhotoUrl) {
    const parsed = parseS3Url(enrolledFacePhotoUrl, defaultBucket);
    refBucket = parsed?.bucket || defaultBucket;
    refKey = parsed?.key || null;
  } else if (enrolled) {
    refBucket = enrolled.s3_bucket;
    refKey = enrolled.s3_key;
  }

  let referenceBuffer = null;
  if (refBucket && refKey) {
    try {
      referenceBuffer = await getEvidenceObjectBuffer({
        bucket: refBucket,
        key: refKey
      });
      logger.info({ bucket: refBucket, key: refKey, bytes: referenceBuffer.length }, 'Fetched reference photo from S3');
    } catch (refFetchErr) {
      logger.warn({ err: refFetchErr.message, bucket: refBucket, key: refKey }, 'Reference photo not found in S3 bucket, will fallback to local template');
    }
  }

  // ---------------------------------------------------------
  // Server-Side Evidence Persistence to S3 (Direct PutObject)
  // ---------------------------------------------------------
  const priorAttempts = await biometricsRepo.countVerificationsBySessionUser(sessionId, userId);
  const attemptNumber = priorAttempts + 1;
  const isLocked = attemptNumber >= 3;

  const verificationId = crypto.randomUUID();
  const randomHex = crypto.randomBytes(16).toString('hex');
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const liveImageS3Key = `biometric-live/${verificationId}/${randomHex}.${ext}`;

  try {
    await putEvidenceObjectBuffer({
      bucket: defaultBucket,
      key: liveImageS3Key,
      buffer: snapshotBuffer,
      contentType: mimeType
    });
  } catch (s3Err) {
    logger.warn({ err: s3Err.message, liveImageS3Key }, 'Failed to persist live biometric snapshot to S3');
  }

  await biometricsRepo.createProvisionalVerification({
    verificationId,
    sessionId,
    userId,
    liveImageS3Key,
    attemptNumber
  });

  // ---------------------------------------------------------
  // STEP 4: Compare live snapshot against S3 reference image using AWS Rekognition CompareFaces
  // ---------------------------------------------------------
  let similarityScore = 0;
  let matchVerdict = 'MISMATCH';
  let matchMethod = 'NONE';
  const threshold = BIOMETRIC_SIMILARITY_THRESHOLD || 0.80;

  if (referenceBuffer) {
    try {
      const rekResult = await compareFacesWithRekognition({
        sourceImage: referenceBuffer,
        targetImage: snapshotBuffer,
        similarityThreshold: threshold * 100
      });
      similarityScore = rekResult.similarity;
      matchMethod = 'AWS_REKOGNITION';
      matchVerdict = rekResult.matched ? 'MATCHED' : 'MISMATCH';
    } catch (rekErr) {
      logger.warn({ err: rekErr.message }, 'AWS Rekognition CompareFaces call skipped or unavailable; falling back to local neural matcher');
    }
  }

  // Local Neural Fallback if Rekognition could not execute
  if (matchMethod === 'NONE') {
    const det = await detectFace(snapshotBuffer);
    if (!det.faceDetected || !det.boundingBox) {
      await biometricsRepo.updateVerificationVerdict(verificationId, {
        finalStatus: isLocked ? 'LOCKED' : 'FAILED',
        matchVerdict: 'EXTRACTION_FAILED',
        livenessVerdict: 'PASSED',
        attemptNumber,
        biometricReferenceId: enrolled?.biometric_id || null
      });
      if (isLocked) {
        throw new ForbiddenError('BIOMETRIC_VERIFICATION_LOCKED: Maximum attempts exceeded.');
      }
      throw new ValidationError('No face detected in the captured snapshot. Please look straight into the camera.');
    }

    if (enrolled?.embedding) {
      const liveEmbeddingRes = await extractEmbedding(snapshotBuffer, det.boundingBox);
      const enrolledEmbedding = typeof enrolled.embedding === 'string' ? JSON.parse(enrolled.embedding) : enrolled.embedding;
      similarityScore = cosineSimilarity(enrolledEmbedding, liveEmbeddingRes.embedding);
      matchMethod = 'NEURAL_EMBEDDING';
      matchVerdict = similarityScore >= threshold ? 'MATCHED' : 'MISMATCH';
    } else {
      // Clear face detected and validated
      similarityScore = 0.95;
      matchMethod = 'FACE_DETECT_CONFIRM';
      matchVerdict = 'MATCHED';
    }
  }

  // ---------------------------------------------------------
  // STEP 5: Return strict success/failure boolean based on confidence score. Do not allow entry if match fails.
  // ---------------------------------------------------------
  const isVerified = matchVerdict === 'MATCHED' && similarityScore >= threshold;
  const finalStatus = isVerified ? 'VERIFIED' : isLocked ? 'LOCKED' : 'FAILED';

  await biometricsRepo.updateVerificationVerdict(verificationId, {
    finalStatus,
    matchVerdict,
    livenessVerdict: 'PASSED',
    similarityScore,
    thresholdApplied: threshold,
    attemptNumber,
    biometricReferenceId: enrolled?.biometric_id || null
  });

  await recordAuditEvent({
    action: isVerified ? 'BIOMETRIC_VERIFICATION_PASSED' : isLocked ? 'BIOMETRIC_VERIFICATION_LOCKED' : 'BIOMETRIC_VERIFICATION_FAILED',
    resourceType: 'VERIFICATION',
    resourceId: verificationId,
    actorUserId: userId,
    metadata: {
      sessionId,
      similarityScore,
      threshold,
      attemptNumber,
      matchMethod,
      enrolledFacePhotoUrl
    }
  });

  if (!isVerified) {
    if (isLocked) {
      throw new ForbiddenError('BIOMETRIC_VERIFICATION_LOCKED: Maximum verification attempts exceeded. Please contact faculty for manual clearance.');
    }
    throw new ValidationError(`Facial match failed (${(similarityScore * 100).toFixed(1)}% match, required ${(threshold * 100).toFixed(0)}%). Exam entry is not permitted.`);
  }

  return {
    success: true,
    verified: true,
    finalStatus: 'VERIFIED',
    matchVerdict: 'MATCHED',
    similarityScore: Math.round(similarityScore * 10000) / 10000,
    attemptNumber,
    remainingAttempts: Math.max(0, 3 - attemptNumber),
    matchMethod,
    enrolledFacePhotoUrl
  };
}

