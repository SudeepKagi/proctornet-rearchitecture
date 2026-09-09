/**
 * @file biometrics.repository.js
 * @description Database repository for Phase 25 Biometric Identity:
 * face_biometrics, liveness_challenges, and biometric_verifications.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';

// ==========================================
// 1. FACE BIOMETRICS REPOSITORY
// ==========================================

export async function createFaceBiometric(data, client = null) {
  const runner = client || getPool();
  const query = `
    INSERT INTO face_biometrics (
      biometric_id,
      user_id,
      enrollment_status,
      s3_bucket,
      s3_key,
      mime_type,
      byte_size,
      model_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;
  const values = [
    data.biometricId,
    data.userId,
    data.enrollmentStatus || 'PENDING_UPLOAD',
    data.s3Bucket,
    data.s3Key,
    data.mimeType,
    data.byteSize,
    data.modelVersion
  ];
  const res = await runner.query(query, values);
  return res.rows[0];
}

export async function findFaceBiometricById(biometricId, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT *
    FROM face_biometrics
    WHERE biometric_id = $1;
  `;
  const res = await runner.query(query, [biometricId]);
  return res.rows[0] || null;
}

export async function findActiveEnrolledBiometric(userId, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT *
    FROM face_biometrics
    WHERE user_id = $1 AND enrollment_status = 'ENROLLED'
    ORDER BY created_at DESC
    LIMIT 1;
  `;
  const res = await runner.query(query, [userId]);
  return res.rows[0] || null;
}

export async function updateFaceBiometricStatus(biometricId, status, updates = {}, client = null) {
  const runner = client || getPool();
  const query = `
    UPDATE face_biometrics
    SET
      enrollment_status = $2,
      embedding = COALESCE($3, embedding),
      embedding_dimension = COALESCE($4, embedding_dimension),
      quality_score = COALESCE($5, quality_score),
      pose_pitch = COALESCE($6, pose_pitch),
      pose_yaw = COALESCE($7, pose_yaw),
      pose_roll = COALESCE($8, pose_roll),
      sharpness_score = COALESCE($9, sharpness_score),
      illumination_score = COALESCE($10, illumination_score),
      updated_at = CURRENT_TIMESTAMP
    WHERE biometric_id = $1
    RETURNING *;
  `;
  const values = [
    biometricId,
    status,
    updates.embedding ? JSON.stringify(updates.embedding) : null,
    updates.embeddingDimension || null,
    updates.qualityScore !== undefined ? updates.qualityScore : null,
    updates.posePitch !== undefined ? updates.posePitch : null,
    updates.poseYaw !== undefined ? updates.poseYaw : null,
    updates.poseRoll !== undefined ? updates.poseRoll : null,
    updates.sharpnessScore !== undefined ? updates.sharpnessScore : null,
    updates.illuminationScore !== undefined ? updates.illuminationScore : null
  ];
  const res = await runner.query(query, values);
  return res.rows[0] || null;
}

export async function supersedeActiveEnrollments(userId, excludeBiometricId, client = null) {
  const runner = client || getPool();
  const query = `
    UPDATE face_biometrics
    SET
      enrollment_status = 'SUPERSEDED',
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND enrollment_status = 'ENROLLED' AND biometric_id != $2
    RETURNING *;
  `;
  const res = await runner.query(query, [userId, excludeBiometricId]);
  return res.rows;
}

// ==========================================
// 2. LIVENESS CHALLENGES REPOSITORY
// ==========================================

export async function createLivenessChallenge(data, client = null) {
  const runner = client || getPool();
  const query = `
    INSERT INTO liveness_challenges (
      challenge_id,
      user_id,
      session_id,
      challenge_type,
      expected_actions,
      nonce,
      status,
      expires_at,
      live_media_s3_bucket,
      live_media_s3_key,
      live_media_consumed
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
    RETURNING *;
  `;
  const values = [
    data.challengeId,
    data.userId,
    data.sessionId,
    data.challengeType || 'SEQUENCE',
    JSON.stringify(data.expectedActions),
    data.nonce,
    data.status || 'PENDING',
    data.expiresAt,
    data.liveMediaS3Bucket || null,
    data.liveMediaS3Key || null
  ];
  const res = await runner.query(query, values);
  return res.rows[0];
}

export async function findLivenessChallengeById(challengeId, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT *
    FROM liveness_challenges
    WHERE challenge_id = $1;
  `;
  const res = await runner.query(query, [challengeId]);
  return res.rows[0] || null;
}

export async function markChallengeConsumed(challengeId, client = null) {
  const runner = client || getPool();
  const query = `
    UPDATE liveness_challenges
    SET live_media_consumed = true
    WHERE challenge_id = $1 AND live_media_consumed = false
    RETURNING *;
  `;
  const res = await runner.query(query, [challengeId]);
  return res.rows[0] || null;
}

export async function updateLivenessChallengeResult(challengeId, updates, client = null) {
  const runner = client || getPool();
  const query = `
    UPDATE liveness_challenges
    SET
      status = $2,
      passive_texture_score = COALESCE($3, passive_texture_score),
      active_action_score = COALESCE($4, active_action_score),
      verified_at = COALESCE($5, verified_at)
    WHERE challenge_id = $1
    RETURNING *;
  `;
  const values = [
    challengeId,
    updates.status,
    updates.passiveScore !== undefined ? updates.passiveScore : null,
    updates.activeScore !== undefined ? updates.activeScore : null,
    updates.verifiedAt || null
  ];
  const res = await runner.query(query, values);
  return res.rows[0] || null;
}

// ==========================================
// 3. BIOMETRIC VERIFICATIONS REPOSITORY
// ==========================================

export async function createProvisionalVerification(data, client = null) {
  const runner = client || getPool();
  const query = `
    INSERT INTO biometric_verifications (
      verification_id,
      session_id,
      user_id,
      live_image_s3_key,
      final_status,
      attempt_number
    ) VALUES ($1, $2, $3, $4, 'PENDING', $5)
    RETURNING *;
  `;
  const values = [
    data.verificationId,
    data.sessionId,
    data.userId,
    data.liveImageS3Key,
    data.attemptNumber || 1
  ];
  const res = await runner.query(query, values);
  return res.rows[0];
}

export async function findVerificationById(verificationId, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT *
    FROM biometric_verifications
    WHERE verification_id = $1;
  `;
  const res = await runner.query(query, [verificationId]);
  return res.rows[0] || null;
}

export async function findLatestVerificationForUserSession(
  { sessionId, userId },
  { forUpdate = false, forShare = false } = {},
  client = null
) {
  const runner = client || getPool();
  let query = `
    SELECT *
    FROM biometric_verifications
    WHERE session_id = $1 AND user_id = $2
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (forUpdate) {
    query += ' FOR UPDATE;';
  } else if (forShare) {
    query += ' FOR SHARE;';
  } else {
    query += ';';
  }
  const res = await runner.query(query, [sessionId, userId]);
  return res.rows[0] || null;
}

export async function updateVerificationVerdict(verificationId, updates, client = null) {
  const runner = client || getPool();
  const query = `
    UPDATE biometric_verifications
    SET
      final_status = $2,
      match_verdict = $3,
      liveness_verdict = $4,
      similarity_score = $5,
      threshold_applied = $6,
      attempt_number = $7,
      biometric_reference_id = COALESCE($8, biometric_reference_id),
      challenge_id = COALESCE($9, challenge_id),
      metadata = COALESCE($10, metadata)
    WHERE verification_id = $1
    RETURNING *;
  `;
  const values = [
    verificationId,
    updates.finalStatus,
    updates.matchVerdict,
    updates.livenessVerdict,
    updates.similarityScore !== undefined ? updates.similarityScore : null,
    updates.thresholdApplied || 0.85,
    updates.attemptNumber,
    updates.biometricReferenceId || null,
    updates.challengeId || null,
    updates.metadata ? JSON.stringify(updates.metadata) : null
  ];
  const res = await runner.query(query, values);
  return res.rows[0] || null;
}

export async function createAdminOverride(
  { sessionId, studentId, adminUserId, reason },
  client = null
) {
  const runner = client || getPool();
  const query = `
    INSERT INTO biometric_verifications (
      session_id,
      user_id,
      match_verdict,
      liveness_verdict,
      final_status,
      attempt_number,
      override_by,
      override_reason
    ) VALUES ($1, $2, 'MATCHED', 'PASSED', 'OVERRIDDEN', 1, $3, $4)
    RETURNING *;
  `;
  const res = await runner.query(query, [sessionId, studentId, adminUserId, reason]);
  return res.rows[0];
}

export async function listVerificationsBySession(
  { sessionId, status, limit = 20, offset = 0 },
  client = null
) {
  const runner = client || getPool();
  let countQuery = `
    SELECT COUNT(*) AS total
    FROM biometric_verifications
    WHERE session_id = $1
  `;
  let dataQuery = `
    SELECT
      verification_id,
      session_id,
      user_id,
      attempt_number,
      final_status,
      liveness_verdict,
      match_verdict,
      similarity_score,
      threshold_applied,
      override_by,
      override_reason,
      created_at
    FROM biometric_verifications
    WHERE session_id = $1
  `;

  const values = [sessionId];
  let paramIdx = 2;

  if (status) {
    countQuery += ` AND final_status = $${paramIdx}`;
    dataQuery += ` AND final_status = $${paramIdx}`;
    values.push(status);
    paramIdx++;
  }

  dataQuery += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1};`;
  const dataValues = [...values, limit, offset];

  const [countRes, dataRes] = await Promise.all([
    runner.query(countQuery, values),
    runner.query(dataQuery, dataValues)
  ]);

  return {
    verifications: dataRes.rows,
    total: parseInt(countRes.rows[0].total, 10)
  };
}
