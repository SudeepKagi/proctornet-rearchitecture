/**
 * @file evidence.repository.js
 * @description Direct PostgreSQL data access repository for Evidence Storage.
 * Supports row-level locking (FOR UPDATE) and bounded concurrency lease claims (FOR UPDATE SKIP LOCKED).
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

/**
 * Inserts a new evidence record with status 'INITIATED'.
 *
 * @param {object} data
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function createEvidenceRecord(data, client = null) {
  const text = `
    INSERT INTO evidence_records (
      evidence_id,
      attempt_id,
      session_id,
      student_id,
      violation_id,
      flag_id,
      evidence_type,
      bucket_name,
      object_key,
      content_type,
      declared_byte_size,
      sha256_checksum,
      status,
      upload_expires_at,
      metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'INITIATED', $13, $14
    )
    RETURNING
      evidence_id,
      attempt_id,
      session_id,
      student_id,
      violation_id,
      flag_id,
      evidence_type,
      bucket_name,
      object_key,
      content_type,
      declared_byte_size,
      sha256_checksum,
      status,
      upload_expires_at,
      metadata,
      created_at,
      updated_at;
  `;

  const values = [
    data.evidenceId,
    data.attemptId,
    data.sessionId,
    data.studentId,
    data.violationId || null,
    data.flagId || null,
    data.evidenceType,
    data.bucketName,
    data.objectKey,
    data.contentType,
    data.declaredByteSize,
    data.sha256Checksum || null,
    data.uploadExpiresAt,
    data.metadata ? JSON.stringify(data.metadata) : '{}'
  ];

  const executor = client ? client.query.bind(client) : query;
  const result = await executor(text, values);
  return result.rows[0];
}

/**
 * Finds an evidence record by ID.
 *
 * @param {string} evidenceId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findEvidenceById(evidenceId, client = null) {
  const text = `
    SELECT *
    FROM evidence_records
    WHERE evidence_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(text, [evidenceId]);
  return result.rows[0] || null;
}

/**
 * Locks and retrieves an evidence record for confirmation update using FOR UPDATE.
 *
 * @param {string} evidenceId
 * @param {string} attemptId
 * @param {import('pg').PoolClient} client - Must be an active transaction client
 * @returns {Promise<object|null>}
 */
export async function findEvidenceByIdForUpdate(evidenceId, attemptId, client) {
  const text = `
    SELECT *
    FROM evidence_records
    WHERE evidence_id = $1 AND attempt_id = $2
    FOR UPDATE;
  `;
  const result = await client.query(text, [evidenceId, attemptId]);
  return result.rows[0] || null;
}

/**
 * Updates an evidence record to AVAILABLE after S3 confirmation verification.
 * Pins authoritative S3 VersionId, actual byte size, and calculates retention.
 *
 * @param {string} evidenceId
 * @param {object} params
 * @param {string} [params.s3VersionId]
 * @param {number} params.actualByteSize
 * @param {Date|string} params.confirmedAt
 * @param {Date|string} params.retentionExpiresAt
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function updateEvidenceConfirmed(
  evidenceId,
  { s3VersionId, actualByteSize, confirmedAt, retentionExpiresAt },
  client = null
) {
  const text = `
    UPDATE evidence_records
    SET status = 'AVAILABLE',
        s3_version_id = $2,
        actual_byte_size = $3,
        confirmed_at = $4,
        retention_expires_at = $5,
        updated_at = CURRENT_TIMESTAMP
    WHERE evidence_id = $1
    RETURNING *;
  `;
  const values = [evidenceId, s3VersionId || null, actualByteSize, confirmedAt, retentionExpiresAt];
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(text, values);
  return result.rows[0];
}

/**
 * Updates status of an evidence record (e.g. FAILED, ABANDONED, PURGED).
 *
 * @param {string} evidenceId
 * @param {string} status
 * @param {object} [extra={}]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function updateEvidenceStatus(evidenceId, status, extra = {}, client = null) {
  const actualByteSize = extra.actualByteSize !== undefined ? extra.actualByteSize : null;
  const text = `
    UPDATE evidence_records
    SET status = $2,
        actual_byte_size = COALESCE($3, actual_byte_size),
        updated_at = CURRENT_TIMESTAMP
    WHERE evidence_id = $1
    RETURNING *;
  `;
  const values = [evidenceId, status, actualByteSize];
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(text, values);
  return result.rows[0];
}

/**
 * Associates confirmed evidence object key to a violation event.
 *
 * @param {string} violationId
 * @param {string} objectKey
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<void>}
 */
export async function linkViolationEvidenceKey(violationId, objectKey, client = null) {
  const text = `
    UPDATE violation_events
    SET evidence_object_key = $2
    WHERE violation_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  await executor(text, [violationId, objectKey]);
}

/**
 * Lists evidence records for an attempt with optional filters and pagination.
 *
 * @param {string} attemptId
 * @param {object} options
 * @param {string} [options.evidenceType]
 * @param {string} [options.status]
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<{ rows: Array<object>, total: number }>}
 */
export async function listEvidenceByAttempt(
  attemptId,
  { evidenceType, status, limit = 50, offset = 0 } = {},
  client = null
) {
  const conditions = ['attempt_id = $1'];
  const values = [attemptId];
  let paramIdx = 2;

  if (evidenceType) {
    conditions.push(`evidence_type = $${paramIdx++}`);
    values.push(evidenceType);
  }

  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    values.push(status);
  }

  const whereClause = conditions.join(' AND ');

  const countText = `
    SELECT COUNT(*)::int AS total
    FROM evidence_records
    WHERE ${whereClause};
  `;

  const dataText = `
    SELECT
      evidence_id,
      attempt_id,
      session_id,
      student_id,
      violation_id,
      flag_id,
      evidence_type,
      bucket_name,
      object_key,
      s3_version_id,
      content_type,
      declared_byte_size,
      actual_byte_size,
      sha256_checksum,
      status,
      upload_expires_at,
      confirmed_at,
      retention_expires_at,
      metadata,
      created_at,
      updated_at
    FROM evidence_records
    WHERE ${whereClause}
    ORDER BY created_at ASC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  const executor = client ? client.query.bind(client) : query;

  const countRes = await executor(countText, values);
  const total = countRes.rows[0]?.total || 0;

  const dataRes = await executor(dataText, [...values, limit, offset]);

  return {
    rows: dataRes.rows,
    total
  };
}

/**
 * Finds attempt details joined with session and exam created_by.
 *
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findAttemptWithSession(attemptId, client = null) {
  const text = `
    SELECT
      a.attempt_id,
      a.session_id,
      a.student_id,
      a.status AS attempt_status,
      s.exam_id,
      s.status AS session_status,
      e.created_by AS exam_created_by
    FROM exam_attempts a
    JOIN exam_sessions s ON a.session_id = s.session_id
    JOIN exams e ON s.exam_id = e.exam_id
    WHERE a.attempt_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(text, [attemptId]);
  return result.rows[0] || null;
}

/**
 * Checks if a user is an assigned invigilator for an exam session.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<boolean>}
 */
export async function isInvigilatorAssignedToSession(sessionId, userId, client = null) {
  const text = `
    SELECT 1
    FROM session_invigilators
    WHERE session_id = $1 AND user_id = $2
    LIMIT 1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(text, [sessionId, userId]);
  return (result.rowCount || 0) > 0;
}

/**
 * Claims expired unconfirmed INITIATED uploads using FOR UPDATE SKIP LOCKED.
 * Sets claim_expires_at lease to prevent duplicate sweeper processing.
 *
 * @param {number} [limit=50]
 * @param {number} [leaseMinutes=2]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<{evidence_id: string, bucket_name: string, object_key: string}>>}
 */
export async function claimOrphanedUploads(limit = 50, leaseMinutes = 2, client = null) {
  const text = `
    WITH claimed AS (
      SELECT evidence_id
      FROM evidence_records
      WHERE status = 'INITIATED'
        AND upload_expires_at < NOW() - INTERVAL '15 minutes'
        AND (claim_expires_at IS NULL OR claim_expires_at < NOW())
      ORDER BY upload_expires_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE evidence_records
    SET claim_expires_at = NOW() + (INTERVAL '1 minute' * $2)
    WHERE evidence_id IN (SELECT evidence_id FROM claimed)
    RETURNING evidence_id, bucket_name, object_key;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(text, [limit, leaseMinutes]);
  return result.rows;
}

/**
 * Finalizes an abandoned evidence record after S3 versions are pruned.
 *
 * @param {string} evidenceId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function finalizeAbandonedEvidence(evidenceId, client = null) {
  const text = `
    UPDATE evidence_records
    SET status = 'ABANDONED',
        claim_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE evidence_id = $1 AND status = 'INITIATED'
    RETURNING *;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(text, [evidenceId]);
  return result.rows[0];
}

/**
 * Claims expired AVAILABLE evidence for retention purge using FOR UPDATE SKIP LOCKED.
 *
 * @param {number} [limit=50]
 * @param {number} [leaseMinutes=2]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<{evidence_id: string, bucket_name: string, object_key: string, attempt_id: string}>>}
 */
export async function claimExpiredRetentionEvidence(limit = 50, leaseMinutes = 2, client = null) {
  const text = `
    WITH claimed AS (
      SELECT evidence_id
      FROM evidence_records
      WHERE status = 'AVAILABLE'
        AND retention_expires_at <= NOW()
        AND (claim_expires_at IS NULL OR claim_expires_at < NOW())
      ORDER BY retention_expires_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE evidence_records
    SET claim_expires_at = NOW() + (INTERVAL '1 minute' * $2)
    WHERE evidence_id IN (SELECT evidence_id FROM claimed)
    RETURNING evidence_id, bucket_name, object_key, attempt_id;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(text, [limit, leaseMinutes]);
  return result.rows;
}

/**
 * Finalizes a purged evidence record after all S3 versions/delete markers are confirmed destroyed.
 *
 * @param {string} evidenceId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function finalizePurgedEvidence(evidenceId, client = null) {
  const text = `
    UPDATE evidence_records
    SET status = 'PURGED',
        claim_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE evidence_id = $1 AND status = 'AVAILABLE'
    RETURNING *;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(text, [evidenceId]);
  return result.rows[0];
}

/**
 * Releases worker lease claim if an operation encounters an error before completion.
 *
 * @param {string} evidenceId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<void>}
 */
export async function releaseEvidenceClaim(evidenceId, client = null) {
  const text = `
    UPDATE evidence_records
    SET claim_expires_at = NULL
    WHERE evidence_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  await executor(text, [evidenceId]);
}
