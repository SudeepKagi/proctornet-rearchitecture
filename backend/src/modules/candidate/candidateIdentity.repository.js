/**
 * @file candidateIdentity.repository.js
 * @description Database repository for candidate identity documents and candidate profile management.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';

/**
 * Retrieves a document record by document ID.
 * @param {string} documentId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findDocumentById(documentId, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT
      document_id,
      user_id,
      document_type,
      document_number_hash,
      document_number_last4,
      full_name_on_document,
      date_of_birth,
      expiry_date,
      issue_country,
      s3_bucket,
      s3_key,
      file_name,
      mime_type,
      byte_size,
      magic_bytes_verified,
      verification_status,
      reviewer_notes,
      reviewed_by,
      reviewed_at,
      submitted_at,
      created_at,
      updated_at
    FROM student_identity_documents
    WHERE document_id = $1;
  `;
  const result = await runner.query(query, [documentId]);
  return result.rows[0] || null;
}

/**
 * Retrieves the latest active (non-superseded) identity document for a student.
 * @param {string} userId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findActiveDocumentByUserId(userId, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT
      document_id,
      user_id,
      document_type,
      document_number_hash,
      document_number_last4,
      full_name_on_document,
      date_of_birth,
      expiry_date,
      issue_country,
      s3_bucket,
      s3_key,
      file_name,
      mime_type,
      byte_size,
      magic_bytes_verified,
      verification_status,
      reviewer_notes,
      reviewed_by,
      reviewed_at,
      submitted_at,
      created_at,
      updated_at
    FROM student_identity_documents
    WHERE user_id = $1 AND verification_status != 'SUPERSEDED'
    ORDER BY created_at DESC
    LIMIT 1;
  `;
  const result = await runner.query(query, [userId]);
  return result.rows[0] || null;
}

/**
 * Retrieves all identity documents for a candidate (including superseded documents for history).
 * @param {string} userId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function findDocumentsByUserId(userId, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT
      document_id,
      user_id,
      document_type,
      document_number_last4,
      full_name_on_document,
      s3_bucket,
      s3_key,
      file_name,
      mime_type,
      byte_size,
      magic_bytes_verified,
      verification_status,
      reviewer_notes,
      reviewed_by,
      reviewed_at,
      submitted_at,
      created_at
    FROM student_identity_documents
    WHERE user_id = $1
    ORDER BY created_at DESC;
  `;
  const result = await runner.query(query, [userId]);
  return result.rows;
}

/**
 * Inserts a new identity document in PENDING_UPLOAD status.
 * @param {object} data
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function createDocumentRecord(data, client = null) {
  const runner = client || getPool();
  const query = `
    INSERT INTO student_identity_documents (
      document_id,
      user_id,
      document_type,
      document_number_hash,
      document_number_last4,
      full_name_on_document,
      date_of_birth,
      expiry_date,
      issue_country,
      s3_bucket,
      s3_key,
      file_name,
      mime_type,
      byte_size,
      magic_bytes_verified,
      verification_status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PENDING_UPLOAD'
    )
    RETURNING *;
  `;
  const values = [
    data.documentId,
    data.userId,
    data.documentType,
    data.documentNumberHash,
    data.documentNumberLast4,
    data.fullNameOnDocument,
    data.dateOfBirth || null,
    data.expiryDate || null,
    data.issueCountry || null,
    data.s3Bucket,
    data.s3Key,
    data.fileName,
    data.mimeType,
    data.byteSize,
    data.magicBytesVerified || false
  ];

  const result = await runner.query(query, values);
  return result.rows[0];
}

/**
 * Updates document verification status and associated review metadata.
 * @param {string} documentId
 * @param {object} updates
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function updateDocumentStatus(documentId, updates, client = null) {
  const runner = client || getPool();
  const fields = ['verification_status = $2', 'updated_at = CURRENT_TIMESTAMP'];
  const values = [documentId, updates.verificationStatus];

  if (updates.magicBytesVerified !== undefined) {
    values.push(updates.magicBytesVerified);
    fields.push(`magic_bytes_verified = $${values.length}`);
  }

  if (updates.reviewerNotes !== undefined) {
    values.push(updates.reviewerNotes);
    fields.push(`reviewer_notes = $${values.length}`);
  }

  if (updates.reviewedBy !== undefined) {
    values.push(updates.reviewedBy);
    fields.push(`reviewed_by = $${values.length}`);
  }

  if (updates.reviewedAt !== undefined) {
    values.push(updates.reviewedAt);
    fields.push(`reviewed_at = $${values.length}`);
  }

  if (updates.submittedAt !== undefined) {
    values.push(updates.submittedAt);
    fields.push(`submitted_at = $${values.length}`);
  }

  const query = `
    UPDATE student_identity_documents
    SET ${fields.join(', ')}
    WHERE document_id = $1
    RETURNING *;
  `;

  const result = await runner.query(query, values);
  return result.rows[0];
}

/**
 * Marks any stale PENDING_UPLOAD document rows for a user as SUPERSEDED.
 * @param {string} userId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<number>} Number of updated rows
 */
export async function supersedePendingUploads(userId, client = null) {
  const runner = client || getPool();
  const query = `
    UPDATE student_identity_documents
    SET verification_status = 'SUPERSEDED', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND verification_status = 'PENDING_UPLOAD';
  `;
  const result = await runner.query(query, [userId]);
  return result.rowCount;
}

/**
 * Marks a specific document row as SUPERSEDED.
 * @param {string} documentId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function supersedeDocument(documentId, client = null) {
  const runner = client || getPool();
  const query = `
    UPDATE student_identity_documents
    SET verification_status = 'SUPERSEDED', updated_at = CURRENT_TIMESTAMP
    WHERE document_id = $1
    RETURNING *;
  `;
  const result = await runner.query(query, [documentId]);
  return result.rows[0];
}

/**
 * Atomically updates user's verification status on the users table.
 * @param {string} userId
 * @param {string} verificationStatus
 * @param {string} [verificationNotes=null]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function updateUserVerificationStatus(userId, verificationStatus, verificationNotes = null, client = null) {
  const runner = client || getPool();
  const query = `
    UPDATE users
    SET
      verification_status = $2,
      verification_notes = $3,
      verification_updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING user_id, verification_status, verification_notes, verification_updated_at;
  `;
  const result = await runner.query(query, [userId, verificationStatus, verificationNotes]);
  return result.rows[0];
}

/**
 * Retrieves candidate academic profile joined with user account data.
 * @param {string} userId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findStudentProfile(userId, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT
      u.user_id,
      u.name,
      u.email,
      u.phone,
      u.status,
      u.verification_status,
      u.verification_notes,
      u.enrolled_face_photo_url,
      u.id_document_url,
      u.version,
      sp.enrollment_number,
      sp.department,
      sp.semester
    FROM users u
    LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
    WHERE u.user_id = $1;
  `;
  const result = await runner.query(query, [userId]);
  return result.rows[0] || null;
}

/**
 * Updates editable candidate profile fields (display name, phone) with OCC check on expected_version.
 * Students cannot modify department, semester, accommodations, or verification status.
 *
 * @param {string} userId
 * @param {object} params
 * @param {string} [params.name]
 * @param {string} [params.phone]
 * @param {number} params.expected_version
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function updateStudentProfile(userId, { name, phone, expected_version }, client = null) {
  const runner = client || getPool();

  const setClauses = ['version = version + 1', 'updated_at = CURRENT_TIMESTAMP'];
  const values = [userId, expected_version];

  if (name !== undefined) {
    values.push(name);
    setClauses.push(`name = $${values.length}`);
  }

  if (phone !== undefined) {
    values.push(phone);
    setClauses.push(`phone = $${values.length}`);
  }

  const query = `
    UPDATE users
    SET ${setClauses.join(', ')}
    WHERE user_id = $1 AND version = $2
    RETURNING user_id, name, email, phone, status, verification_status, version;
  `;

  const result = await runner.query(query, values);

  if (result.rowCount === 0) {
    const existing = await runner.query('SELECT version FROM users WHERE user_id = $1', [userId]);
    if (existing.rowCount === 0) {
      return null;
    }
    const currentVersion = existing.rows[0].version;
    const err = new Error(
      `Profile version conflict. Current version is ${currentVersion}, but expected ${expected_version}. Please reload.`
    );
    err.name = 'ConflictError';
    err.statusCode = 409;
    err.code = 'VERSION_CONFLICT';
    err.details = { current_version: currentVersion, expected_version };
    throw err;
  }

  return await findStudentProfile(userId, client);
}

/**
 * Finds user authentication credential fields by user ID.
 * @param {string} userId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<{ user_id: string, password_hash: string, email: string }|null>}
 */
export async function findUserAuthById(userId, client = null) {
  const runner = client || getPool();
  const query = `SELECT user_id, password_hash, email FROM users WHERE user_id = $1;`;
  const res = await runner.query(query, [userId]);
  return res.rows[0] || null;
}

/**
 * Updates user password hash.
 * @param {string} userId
 * @param {string} newPasswordHash
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function updateUserPassword(userId, newPasswordHash, client = null) {
  const runner = client || getPool();
  const query = `
    UPDATE users
    SET password_hash = $2, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING user_id;
  `;
  const res = await runner.query(query, [userId, newPasswordHash]);
  return res.rows[0] || null;
}

/**
 * Finds all active (non-revoked) session IDs for a user, optionally excluding a specific session.
 * @param {string} userId
 * @param {string|null} [excludeSessionId=null]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<string>>}
 */
export async function findOtherActiveSessionIds(userId, excludeSessionId = null, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT session_id
    FROM user_sessions
    WHERE user_id = $1 AND is_revoked = FALSE ${excludeSessionId ? 'AND session_id != $2' : ''};
  `;
  const params = excludeSessionId ? [userId, excludeSessionId] : [userId];
  const res = await runner.query(query, params);
  return res.rows.map((r) => r.session_id);
}

/**
 * Checks if the student currently has an active attempt in progress.
 * @param {string} userId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<boolean>}
 */
export async function checkActiveAttemptForStudent(userId, client = null) {
  const runner = client || getPool();
  const query = `SELECT attempt_id FROM exam_attempts WHERE student_id = $1 AND status = 'ACTIVE' LIMIT 1;`;
  const res = await runner.query(query, [userId]);
  return res.rows.length > 0;
}

/**
 * Checks if the student has any upcoming or in-progress session starting within lockoutHours.
 * @param {string} userId
 * @param {number} [lockoutHours=24]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function checkUpcomingSessionForStudent(userId, lockoutHours = 24, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT s.session_id, s.title, s.start_time
    FROM session_students ss
    JOIN exam_sessions s ON ss.session_id = s.session_id
    WHERE ss.student_id = $1
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND s.start_time <= NOW() + ($2 || ' hours')::INTERVAL
      AND s.end_time >= NOW()
    LIMIT 1;
  `;
  const res = await runner.query(query, [userId, `${lockoutHours}`]);
  return res.rows[0] || null;
}

/**
 * Atomically re-enrolls candidate face reference in ONE DB transaction:
 * 1. Inserts new versioned face_biometrics row
 * 2. Deactivates previous active template (is_active=false, superseded_at=now())
 * 3. Updates users.enrolled_face_photo_url avatar pointer and verification_status
 * 4. Writes an audit_logs entry
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.biometricId
 * @param {string} params.s3Bucket
 * @param {string} params.s3Key
 * @param {string} params.mimeType
 * @param {number} params.byteSize
 * @param {string} params.modelVersion
 * @param {Array<number>} params.embedding
 * @param {object} params.quality
 * @param {string} params.newVerificationStatus
 * @param {import('../audit/audit.service.js').recordAuditEvent} params.recordAuditFn
 * @returns {Promise<object>}
 */
export async function reEnrollFaceBiometricTransaction({
  userId,
  biometricId,
  s3Bucket,
  s3Key,
  mimeType,
  byteSize,
  modelVersion,
  embedding,
  quality,
  newVerificationStatus,
  recordAuditFn
}) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get next version number
    const versionRes = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM face_biometrics WHERE user_id = $1',
      [userId]
    );
    const nextVersion = versionRes.rows[0].next_version;

    // 2. Deactivate previous active template
    await client.query(
      `UPDATE face_biometrics
       SET is_active = FALSE,
           superseded_at = CURRENT_TIMESTAMP,
           enrollment_status = 'SUPERSEDED',
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND is_active = TRUE`,
      [userId]
    );

    // 3. Insert new versioned active template
    const insertQuery = `
      INSERT INTO face_biometrics (
        biometric_id,
        user_id,
        version,
        is_active,
        enrollment_status,
        embedding,
        embedding_dimension,
        quality_score,
        pose_pitch,
        pose_yaw,
        pose_roll,
        sharpness_score,
        illumination_score,
        s3_bucket,
        s3_key,
        mime_type,
        byte_size,
        model_version
      ) VALUES ($1, $2, $3, TRUE, 'ENROLLED', $4, 128, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *;
    `;
    const insertValues = [
      biometricId,
      userId,
      nextVersion,
      JSON.stringify(embedding),
      quality.qualityScore,
      quality.posePitch || null,
      quality.poseYaw || null,
      quality.poseRoll || null,
      quality.sharpnessScore || null,
      quality.illuminationScore || null,
      s3Bucket,
      s3Key,
      mimeType,
      byteSize,
      modelVersion
    ];
    const insertRes = await client.query(insertQuery, insertValues);

    // 4. Update avatar pointer on users
    await client.query(
      `UPDATE users
       SET enrolled_face_photo_url = $2,
           verification_status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId, s3Key, newVerificationStatus]
    );

    // 5. Audit log entry within same transaction
    if (recordAuditFn) {
      await recordAuditFn(
        {
          actorUserId: userId,
          action: 'BIOMETRIC_PHOTO_REENROLLED',
          resourceType: 'BIOMETRICS',
          resourceId: biometricId,
          metadata: {
            version: nextVersion,
            verificationStatus: newVerificationStatus,
            qualityScore: quality.qualityScore
          }
        },
        client
      );
    }

    await client.query('COMMIT');
    return insertRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
