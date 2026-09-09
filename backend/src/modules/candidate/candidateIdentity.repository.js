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
 * Updates editable candidate profile fields (department, semester, phone).
 * @param {string} userId
 * @param {object} updates
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function updateStudentProfile(userId, updates, client = null) {
  const runner = client || getPool();

  if (updates.phone !== undefined) {
    await runner.query(
      `UPDATE users SET phone = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
      [userId, updates.phone]
    );
  }

  const profileUpdates = [];
  const profileValues = [userId];

  if (updates.department !== undefined) {
    profileValues.push(updates.department);
    profileUpdates.push(`department = $${profileValues.length}`);
  }

  if (updates.semester !== undefined) {
    profileValues.push(updates.semester);
    profileUpdates.push(`semester = $${profileValues.length}`);
  }

  if (profileUpdates.length > 0) {
    const query = `
      UPDATE student_profiles
      SET ${profileUpdates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *;
    `;
    await runner.query(query, profileValues);
  }

  return await findStudentProfile(userId, client);
}
