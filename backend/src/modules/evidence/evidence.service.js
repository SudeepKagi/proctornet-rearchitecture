/**
 * @file evidence.service.js
 * @description Core business logic for Phase 15 Evidence Storage.
 * Direct presigned uploads, authoritative S3 HeadObject verification, VersionId pinning,
 * RBAC/BOLA access control, audit logging, and decoupled concurrency maintenance sweepers.
 */

import crypto from 'node:crypto';
import { getPool } from '../../infrastructure/postgres/pool.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import * as evidenceRepo from './evidence.repository.js';
import {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  headEvidenceObject,
  deleteEvidenceObjectVersions,
  getEvidenceObjectHeader
} from '../../infrastructure/storage/s3Storage.js';
import {
  getExtensionForMime,
  validateEvidenceSize,
  validateMagicBytes
} from './evidence.schemas.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import {
  evidenceUploadsInitiatedTotal,
  evidenceUploadsConfirmedTotal,
  evidenceDownloadsTotal,
  evidenceBytesTotal,
  securityMagicByteMismatchesTotal
} from '../../infrastructure/metrics/registry.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError
} from '../../utils/errors.js';

/**
 * Checks whether staff user has access to view/manage evidence for a session.
 *
 * @param {object} attemptWithSession - Joined attempt, session, and exam info
 * @param {object} user - Authenticated user
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<boolean>}
 */
async function authorizeStaffAccess(attemptWithSession, user, client = null) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];

  if (roles.includes('ADMIN')) {
    return true;
  }

  if (roles.includes('FACULTY')) {
    if (attemptWithSession.exam_created_by === user.userId) {
      return true;
    }
    const isAssigned = await evidenceRepo.isInvigilatorAssignedToSession(
      attemptWithSession.session_id,
      user.userId,
      client
    );
    if (isAssigned) {
      return true;
    }
  }

  if (roles.includes('INVIGILATOR')) {
    const isAssigned = await evidenceRepo.isInvigilatorAssignedToSession(
      attemptWithSession.session_id,
      user.userId,
      client
    );
    if (isAssigned) {
      return true;
    }
  }

  return false;
}

/**
 * Initiates an evidence upload by creating an INITIATED database record and minting
 * a temporary presigned PUT URL.
 *
 * @param {string} attemptId
 * @param {object} user - Authenticated candidate user
 * @param {object} payload - Validated requestUploadUrl payload
 * @returns {Promise<{evidenceId: string, uploadUrl: string, objectKey: string, expiresIn: number}>}
 */
export async function initiateUploadUrl(attemptId, user, payload) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (!roles.includes('STUDENT')) {
    throw new ForbiddenError('Forbidden: Only students can initiate evidence uploads');
  }

  const attempt = await evidenceRepo.findAttemptWithSession(attemptId);
  if (!attempt) {
    throw new NotFoundError(`Exam attempt '${attemptId}' not found`);
  }

  if (attempt.student_id !== user.userId) {
    throw new ForbiddenError('Forbidden: You can only upload evidence for your own exam attempt');
  }

  if (attempt.attempt_status !== 'ACTIVE') {
    throw new ConflictError(
      `Attempt is in status '${attempt.attempt_status}'. Evidence upload is only permitted for ACTIVE attempts.`,
      'ATTEMPT_NOT_ACTIVE'
    );
  }

  const extension = getExtensionForMime(payload.contentType);
  validateEvidenceSize(payload.evidenceType, payload.byteSize);

  const evidenceId = crypto.randomUUID();
  const objectKey = `evidence/${attempt.session_id}/${attemptId}/${payload.evidenceType}/${evidenceId}.${extension}`;
  const uploadExpiresAt = new Date(Date.now() + config.EVIDENCE_UPLOAD_TTL_SECONDS * 1000);

  const recordData = {
    evidenceId,
    attemptId,
    sessionId: attempt.session_id,
    studentId: attempt.student_id,
    violationId: payload.violationId || null,
    flagId: payload.flagId || null,
    evidenceType: payload.evidenceType,
    bucketName: config.S3_BUCKET_NAME,
    objectKey,
    contentType: payload.contentType,
    declaredByteSize: payload.byteSize,
    sha256Checksum: payload.sha256Checksum || null,
    uploadExpiresAt,
    metadata: payload.metadata || {}
  };

  await evidenceRepo.createEvidenceRecord(recordData);

  const uploadUrl = await generatePresignedUploadUrl({
    bucket: config.S3_BUCKET_NAME,
    key: objectKey,
    contentType: payload.contentType,
    byteSize: payload.byteSize,
    expiresInSeconds: config.EVIDENCE_UPLOAD_TTL_SECONDS
  });

  await recordAuditEvent({
    actorUserId: user.userId,
    action: 'EVIDENCE_UPLOAD_INITIATED',
    resourceType: 'evidence',
    resourceId: evidenceId,
    attemptId,
    metadata: {
      evidenceType: payload.evidenceType,
      contentType: payload.contentType,
      declaredByteSize: payload.byteSize,
      sha256Checksum: payload.sha256Checksum || null,
      objectKey
    }
  });

  evidenceUploadsInitiatedTotal.inc({ evidence_type: payload.evidenceType });

  return {
    evidenceId,
    uploadUrl,
    objectKey,
    expiresIn: config.EVIDENCE_UPLOAD_TTL_SECONDS
  };
}

/**
 * Confirms an uploaded evidence record by locking the row, calling S3 HeadObject,
 * validating exact byte size equality and MIME type, pinning S3 VersionId, and updating
 * the record status to AVAILABLE. Idempotent on repeated calls.
 *
 * @param {string} attemptId
 * @param {string} evidenceId
 * @param {object} user - Authenticated candidate user
 * @param {object} [payload={}]
 * @returns {Promise<object>} Confirmed evidence data
 */
export async function confirmUpload(attemptId, evidenceId, user, payload = {}) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (!roles.includes('STUDENT')) {
    throw new ForbiddenError('Forbidden: Only students can confirm evidence uploads');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const evidence = await evidenceRepo.findEvidenceByIdForUpdate(evidenceId, attemptId, client);
    if (!evidence) {
      throw new NotFoundError(`Evidence record '${evidenceId}' not found for attempt '${attemptId}'`);
    }

    if (evidence.student_id !== user.userId) {
      throw new ForbiddenError('Forbidden: You can only confirm evidence for your own attempt');
    }

    // Idempotent confirmation handling
    if (evidence.status === 'AVAILABLE') {
      await client.query('COMMIT');
      return {
        evidenceId: evidence.evidence_id,
        attemptId: evidence.attempt_id,
        evidenceType: evidence.evidence_type,
        status: evidence.status,
        s3VersionId: evidence.s3_version_id,
        actualByteSize: evidence.actual_byte_size,
        confirmedAt: evidence.confirmed_at
      };
    }

    if (evidence.status !== 'INITIATED') {
      throw new ConflictError(
        `Evidence record cannot be confirmed in status '${evidence.status}'`,
        'EVIDENCE_FINALIZED'
      );
    }

    // Verify binary object in S3 via HeadObjectCommand
    let headResult;
    try {
      headResult = await headEvidenceObject({
        bucket: evidence.bucket_name,
        key: evidence.object_key
      });
    } catch (err) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        await evidenceRepo.updateEvidenceStatus(evidenceId, 'FAILED', {}, client);
        await client.query('COMMIT');
        evidenceUploadsConfirmedTotal.inc({ evidence_type: evidence.evidence_type, status: 'failed' });
        throw new BadRequestError('Evidence object not found in storage. Upload may have failed or timed out.');
      }
      throw err;
    }

    // Exact byte equality check (no tolerance window)
    if (headResult.contentLength !== evidence.declared_byte_size) {
      await evidenceRepo.updateEvidenceStatus(
        evidenceId,
        'FAILED',
        { actualByteSize: headResult.contentLength },
        client
      );
      await client.query('COMMIT');
      evidenceUploadsConfirmedTotal.inc({ evidence_type: evidence.evidence_type, status: 'failed' });
      throw new BadRequestError(
        `Evidence size mismatch. Declared ${evidence.declared_byte_size} bytes, actual storage size ${headResult.contentLength} bytes.`
      );
    }

    // ContentType verification check
    if (headResult.contentType !== evidence.content_type) {
      await evidenceRepo.updateEvidenceStatus(
        evidenceId,
        'FAILED',
        { actualByteSize: headResult.contentLength },
        client
      );
      await client.query('COMMIT');
      evidenceUploadsConfirmedTotal.inc({ evidence_type: evidence.evidence_type, status: 'failed' });
      throw new BadRequestError(
        `Evidence content type mismatch. Declared '${evidence.content_type}', storage reported '${headResult.contentType}'.`
      );
    }

    // Binary file signature (magic bytes) verification
    if (config.SECURITY_MAGIC_BYTES_VERIFICATION) {
      let headerBuffer;
      try {
        headerBuffer = await getEvidenceObjectHeader({
          bucket: evidence.bucket_name,
          key: evidence.object_key,
          byteCount: 16
        });
      } catch (err) {
        logger.error({ err, evidenceId, objectKey: evidence.object_key }, 'Failed to fetch object header for magic byte verification');
        await evidenceRepo.updateEvidenceStatus(evidenceId, 'FAILED', { actualByteSize: headResult.contentLength }, client);
        await client.query('COMMIT');
        evidenceUploadsConfirmedTotal.inc({ evidence_type: evidence.evidence_type, status: 'failed' });
        throw new BadRequestError('Failed to inspect evidence object header for file signature verification.');
      }

      const isValidMagic = validateMagicBytes(headerBuffer, evidence.content_type);
      if (!isValidMagic) {
        securityMagicByteMismatchesTotal.inc({ mime_type: evidence.content_type });
        await evidenceRepo.updateEvidenceStatus(evidenceId, 'FAILED', { actualByteSize: headResult.contentLength }, client);
        await recordAuditEvent(
          {
            actorUserId: user.userId,
            action: 'SECURITY_MALFORMED_EVIDENCE',
            resourceType: 'evidence',
            resourceId: evidenceId,
            attemptId,
            metadata: {
              declaredContentType: evidence.content_type,
              evidenceType: evidence.evidence_type,
              objectKey: evidence.object_key,
              actualHeaderHex: headerBuffer.slice(0, 16).toString('hex')
            }
          },
          client
        );
        await client.query('COMMIT');
        evidenceUploadsConfirmedTotal.inc({ evidence_type: evidence.evidence_type, status: 'failed' });
        throw new BadRequestError(
          `Uploaded file magic bytes do not match declared MIME type '${evidence.content_type}'.`
        );
      }
    }

    const s3VersionId = headResult.versionId || null;
    const confirmedAt = new Date();
    const retentionExpiresAt = new Date(
      confirmedAt.getTime() + (config.EVIDENCE_RETENTION_DAYS || 90) * 86400 * 1000
    );

    const updated = await evidenceRepo.updateEvidenceConfirmed(
      evidenceId,
      {
        s3VersionId,
        actualByteSize: headResult.contentLength,
        confirmedAt,
        retentionExpiresAt
      },
      client
    );

    // Optional violation event linkage
    if (evidence.violation_id) {
      await evidenceRepo.linkViolationEvidenceKey(evidence.violation_id, evidence.object_key, client);
    }

    await recordAuditEvent(
      {
        actorUserId: user.userId,
        action: 'EVIDENCE_UPLOAD_CONFIRMED',
        resourceType: 'evidence',
        resourceId: evidenceId,
        attemptId,
        metadata: {
          evidenceType: evidence.evidence_type,
          s3VersionId,
          actualByteSize: headResult.contentLength,
          objectKey: evidence.object_key
        }
      },
      client
    );

    await client.query('COMMIT');

    evidenceUploadsConfirmedTotal.inc({ evidence_type: evidence.evidence_type, status: 'success' });
    evidenceBytesTotal.inc({ evidence_type: evidence.evidence_type }, headResult.contentLength);

    return {
      evidenceId: updated.evidence_id,
      attemptId: updated.attempt_id,
      evidenceType: updated.evidence_type,
      status: updated.status,
      s3VersionId: updated.s3_version_id,
      actualByteSize: updated.actual_byte_size,
      confirmedAt: updated.confirmed_at
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists evidence records for an attempt. Accessible only to authorized staff.
 *
 * @param {string} attemptId
 * @param {object} user - Authenticated staff user
 * @param {object} query - Parsed query params
 * @returns {Promise<object>} Paginated evidence records
 */
export async function listEvidence(attemptId, user, query) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('STUDENT') && !roles.some((r) => ['INVIGILATOR', 'FACULTY', 'ADMIN'].includes(r))) {
    throw new ForbiddenError('Forbidden: Candidates are not permitted to list evidence records');
  }

  const attempt = await evidenceRepo.findAttemptWithSession(attemptId);
  if (!attempt) {
    throw new NotFoundError(`Exam attempt '${attemptId}' not found`);
  }

  const authorized = await authorizeStaffAccess(attempt, user);
  if (!authorized) {
    throw new ForbiddenError('Forbidden: Not authorized to view evidence for this session');
  }

  const page = query.page || 1;
  const limit = query.limit || 50;
  const offset = (page - 1) * limit;

  const result = await evidenceRepo.listEvidenceByAttempt(attemptId, {
    evidenceType: query.evidenceType,
    status: query.status,
    limit,
    offset
  });

  const formatted = result.rows.map((row) => ({
    evidenceId: row.evidence_id,
    evidenceType: row.evidence_type,
    contentType: row.content_type,
    byteSize: row.actual_byte_size || row.declared_byte_size,
    status: row.status,
    s3VersionId: row.s3_version_id,
    violationId: row.violation_id,
    flagId: row.flag_id,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at
  }));

  const totalPages = Math.ceil(result.total / limit) || 1;

  return {
    attemptId,
    evidence: formatted,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages
    }
  };
}

/**
 * Generates an authorized presigned GET URL for evidence playback pinned to the confirmed VersionId.
 * Candidate access is strictly forbidden.
 *
 * @param {string} attemptId
 * @param {string} evidenceId
 * @param {object} user - Authenticated staff user
 * @returns {Promise<{evidenceId: string, downloadUrl: string, contentType: string, expiresIn: number}>}
 */
export async function getPlaybackUrl(attemptId, evidenceId, user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('STUDENT') && !roles.some((r) => ['INVIGILATOR', 'FACULTY', 'ADMIN'].includes(r))) {
    throw new ForbiddenError('Forbidden: Candidates are not permitted to access evidence playback URLs');
  }

  const attempt = await evidenceRepo.findAttemptWithSession(attemptId);
  if (!attempt) {
    throw new NotFoundError(`Exam attempt '${attemptId}' not found`);
  }

  const authorized = await authorizeStaffAccess(attempt, user);
  if (!authorized) {
    throw new ForbiddenError('Forbidden: Not authorized to access evidence for this session');
  }

  const evidence = await evidenceRepo.findEvidenceById(evidenceId);
  if (!evidence || evidence.attempt_id !== attemptId) {
    throw new NotFoundError(`Evidence record '${evidenceId}' not found for attempt '${attemptId}'`);
  }

  if (evidence.status !== 'AVAILABLE') {
    throw new BadRequestError(
      `Evidence is not available for playback (current status: '${evidence.status}')`
    );
  }

  // Case C check: Authoritatively verify object presence in S3
  try {
    await headEvidenceObject({
      bucket: evidence.bucket_name,
      key: evidence.object_key
    });
  } catch (err) {
    if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      await evidenceRepo.updateEvidenceStatus(evidenceId, 'FAILED');
      logger.error(
        { evidenceId, attemptId, objectKey: evidence.object_key },
        'Case C: Evidence object missing in S3 despite AVAILABLE database status'
      );
      throw new NotFoundError('Evidence object not found in storage', 'EVIDENCE_OBJECT_NOT_FOUND');
    }
    throw err;
  }

  const downloadUrl = await generatePresignedDownloadUrl({
    bucket: evidence.bucket_name,
    key: evidence.object_key,
    contentType: evidence.content_type,
    versionId: evidence.s3_version_id || undefined,
    expiresInSeconds: config.EVIDENCE_PLAYBACK_TTL_SECONDS
  });

  await recordAuditEvent({
    actorUserId: user.userId,
    action: 'EVIDENCE_ACCESSED',
    resourceType: 'evidence',
    resourceId: evidenceId,
    attemptId,
    metadata: {
      evidenceType: evidence.evidence_type,
      s3VersionId: evidence.s3_version_id,
      objectKey: evidence.object_key
    }
  });

  evidenceDownloadsTotal.inc({ evidence_type: evidence.evidence_type });

  return {
    evidenceId: evidence.evidence_id,
    downloadUrl,
    contentType: evidence.content_type,
    expiresIn: config.EVIDENCE_PLAYBACK_TTL_SECONDS
  };
}

/**
 * Purges an evidence artifact. Permanently deletes all S3 versions and delete markers,
 * then marks the record as PURGED.
 * Accessible only to owning FACULTY or ADMIN.
 *
 * @param {string} attemptId
 * @param {string} evidenceId
 * @param {object} user - Authenticated user
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function deleteEvidence(attemptId, evidenceId, user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('STUDENT') || roles.includes('INVIGILATOR')) {
    throw new ForbiddenError('Forbidden: Only faculty exam owners and administrators can purge evidence');
  }

  const attempt = await evidenceRepo.findAttemptWithSession(attemptId);
  if (!attempt) {
    throw new NotFoundError(`Exam attempt '${attemptId}' not found`);
  }

  if (roles.includes('FACULTY') && !roles.includes('ADMIN')) {
    if (attempt.exam_created_by !== user.userId) {
      throw new ForbiddenError('Forbidden: Faculty can only purge evidence for their own exams');
    }
  }

  const evidence = await evidenceRepo.findEvidenceById(evidenceId);
  if (!evidence || evidence.attempt_id !== attemptId) {
    throw new NotFoundError(`Evidence record '${evidenceId}' not found for attempt '${attemptId}'`);
  }

  // Delete all versions and delete markers from S3 outside any DB transaction
  await deleteEvidenceObjectVersions({
    bucket: evidence.bucket_name,
    key: evidence.object_key
  });

  // Once confirmed deleted from S3, mark record as PURGED in DB
  await evidenceRepo.updateEvidenceStatus(evidenceId, 'PURGED');

  await recordAuditEvent({
    actorUserId: user.userId,
    action: 'EVIDENCE_PURGED',
    resourceType: 'evidence',
    resourceId: evidenceId,
    attemptId,
    metadata: {
      evidenceType: evidence.evidence_type,
      objectKey: evidence.object_key,
      purgedBy: user.userId
    }
  });

  return {
    success: true,
    message: 'Evidence artifact successfully purged'
  };
}

/**
 * Background worker task: Sweeps expired unconfirmed INITIATED uploads.
 * Uses bounded lease claim (claim_expires_at) and deletes S3 versions outside DB transaction.
 *
 * @param {object} [options={}]
 * @param {number} [options.batchSize=50]
 * @returns {Promise<{processedCount: number}>}
 */
export async function runOrphanedUploadSweeper({ batchSize = 50 } = {}) {
  // Step 1: Claim batch using short DB query with SKIP LOCKED
  const claimed = await evidenceRepo.claimOrphanedUploads(batchSize, 2);
  if (!claimed || claimed.length === 0) {
    return { processedCount: 0 };
  }

  let processedCount = 0;

  for (const item of claimed) {
    try {
      // Step 2: Delete any partial S3 versions outside DB transaction
      try {
        await deleteEvidenceObjectVersions({
          bucket: item.bucket_name,
          key: item.object_key
        });
      } catch (s3Err) {
        // If 404/NoSuchKey or already empty, proceed idempotently
        logger.debug({ s3Err, key: item.object_key }, 'S3 deletion in orphaned upload sweeper');
      }

      // Step 3: Finalize status in short DB query
      await evidenceRepo.finalizeAbandonedEvidence(item.evidence_id);
      processedCount++;
    } catch (err) {
      logger.error({ err, evidenceId: item.evidence_id }, 'Error processing orphaned upload');
      await evidenceRepo.releaseEvidenceClaim(item.evidence_id).catch(() => {});
    }
  }

  return { processedCount };
}

/**
 * Background worker task: Sweeps expired AVAILABLE records past retention.
 * Uses bounded lease claim (claim_expires_at) and deletes S3 versions outside DB transaction.
 * If S3 deletion fails, leaves record in AVAILABLE for retry on later sweep.
 *
 * @param {object} [options={}]
 * @param {number} [options.batchSize=50]
 * @returns {Promise<{purgedCount: number, failedCount: number}>}
 */
export async function runRetentionPurgeSweeper({ batchSize = 50 } = {}) {
  // Step 1: Claim batch with short DB query with SKIP LOCKED
  const claimed = await evidenceRepo.claimExpiredRetentionEvidence(batchSize, 2);
  if (!claimed || claimed.length === 0) {
    return { purgedCount: 0, failedCount: 0 };
  }

  let purgedCount = 0;
  let failedCount = 0;

  for (const item of claimed) {
    try {
      // Step 2: Permanently destroy all versions and markers in S3 outside DB transaction
      await deleteEvidenceObjectVersions({
        bucket: item.bucket_name,
        key: item.object_key
      });

      // Step 3: Finalize record in DB as PURGED
      await evidenceRepo.finalizePurgedEvidence(item.evidence_id);

      await recordAuditEvent({
        actorUserId: null, // System-initiated maintenance purge
        action: 'EVIDENCE_PURGED',
        resourceType: 'evidence',
        resourceId: item.evidence_id,
        attemptId: item.attempt_id,
        metadata: {
          reason: 'RETENTION_EXPIRED',
          objectKey: item.object_key
        }
      });

      purgedCount++;
    } catch (err) {
      failedCount++;
      logger.warn(
        { err, evidenceId: item.evidence_id },
        'Retention sweeper S3 deletion failed; record remains AVAILABLE for retry'
      );
      // Release claim so next cycle can retry
      await evidenceRepo.releaseEvidenceClaim(item.evidence_id).catch(() => {});
    }
  }

  return { purgedCount, failedCount };
}
