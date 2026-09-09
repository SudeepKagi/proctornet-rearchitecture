/**
 * @file run-retention-sweepers.js
 * @description Operationalized data retention sweepers for ProctorNet.
 * Implements bounded, auditable, repeat-safe retention sweeps adhering to FERPA & GDPR policies:
 * 1. Raw Facial Biometric Images: 7 days retention
 * 2. Liveness Challenge Artifacts: Ephemeral session cleanup
 * 3. Exam Evidence Snapshots: 90 days retention (EVIDENCE_RETENTION_DAYS)
 * 4. Student Identity Documents: 180 days retention
 * 5. Academic Audit Logs: NEVER deleted (protected by SQLSTATE 20000 trigger)
 */

import { getPool } from '../../backend/src/infrastructure/postgres/pool.js';
import { runRetentionPurgeSweeper } from '../../backend/src/modules/evidence/evidence.service.js';
import { deleteEvidenceObjectVersions } from '../../backend/src/infrastructure/storage/s3Storage.js';
import { logger } from '../../backend/src/utils/logger.js';

export async function sweepBiometricRawImages({ retentionDays = 7, batchSize = 100, dryRun = false } = {}) {
  const result = { category: 'FACE_BIOMETRIC_RAW_IMAGES', evaluated: 0, purged: 0, errors: 0 };
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `SELECT biometric_id, s3_bucket, s3_key, created_at
       FROM face_biometrics
       WHERE raw_image_purged_at IS NULL
         AND created_at < NOW() - ($1 || ' days')::INTERVAL
       ORDER BY created_at ASC
       LIMIT $2`,
      [retentionDays, batchSize]
    );

    result.evaluated = rows.length;

    for (const row of rows) {
      try {
        if (!dryRun) {
          if (row.s3_bucket && row.s3_key) {
            await deleteEvidenceObjectVersions({ bucket: row.s3_bucket, key: row.s3_key });
          }
          await client.query(
            `UPDATE face_biometrics
             SET raw_image_purged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE biometric_id = $1`,
            [row.biometric_id]
          );
        }
        result.purged++;
      } catch (err) {
        logger.error({ err, biometricId: row.biometric_id }, 'Failed to sweep biometric raw image');
        result.errors++;
      }
    }
  } finally {
    client.release();
  }

  return result;
}

export async function sweepLivenessChallengeArtifacts({ batchSize = 100, dryRun = false } = {}) {
  const result = { category: 'LIVENESS_CHALLENGE_ARTIFACTS', evaluated: 0, purged: 0, errors: 0 };
  const client = await getPool().connect();

  try {
    const { rows } = await client.query(
      `SELECT challenge_id, live_media_s3_bucket, live_media_s3_key, status
       FROM liveness_challenges
       WHERE frames_purged_at IS NULL
         AND live_media_s3_key IS NOT NULL
         AND (status IN ('PASSED', 'FAILED', 'EXPIRED') OR expires_at < NOW())
       ORDER BY created_at ASC
       LIMIT $1`,
      [batchSize]
    );

    result.evaluated = rows.length;

    for (const row of rows) {
      try {
        if (!dryRun) {
          if (row.live_media_s3_bucket && row.live_media_s3_key) {
            await deleteEvidenceObjectVersions({ bucket: row.live_media_s3_bucket, key: row.live_media_s3_key });
          }
          await client.query(
            `UPDATE liveness_challenges
             SET frames_purged_at = CURRENT_TIMESTAMP
             WHERE challenge_id = $1`,
            [row.challenge_id]
          );
        }
        result.purged++;
      } catch (err) {
        logger.error({ err, challengeId: row.challenge_id }, 'Failed to sweep liveness media artifact');
        result.errors++;
      }
    }
  } finally {
    client.release();
  }

  return result;
}

export async function sweepStudentIdentityDocuments({ retentionDays = 180, batchSize = 100, dryRun = false } = {}) {
  const result = { category: 'STUDENT_IDENTITY_DOCUMENTS', evaluated: 0, purged: 0, errors: 0 };
  const client = await getPool().connect();

  try {
    const { rows } = await client.query(
      `SELECT document_id, s3_bucket, s3_key, verification_status
       FROM student_identity_documents
       WHERE reviewed_at IS NOT NULL
         AND reviewed_at < NOW() - ($1 || ' days')::INTERVAL
         AND verification_status IN ('APPROVED', 'REJECTED', 'SUPERSEDED')
       ORDER BY reviewed_at ASC
       LIMIT $2`,
      [retentionDays, batchSize]
    );

    result.evaluated = rows.length;

    for (const row of rows) {
      try {
        if (!dryRun) {
          if (row.s3_bucket && row.s3_key) {
            await deleteEvidenceObjectVersions({ bucket: row.s3_bucket, key: row.s3_key });
          }
          await client.query(
            `UPDATE student_identity_documents
             SET verification_status = 'SUPERSEDED', updated_at = CURRENT_TIMESTAMP
             WHERE document_id = $1`,
            [row.document_id]
          );
        }
        result.purged++;
      } catch (err) {
        logger.error({ err, documentId: row.document_id }, 'Failed to sweep student identity document');
        result.errors++;
      }
    }
  } finally {
    client.release();
  }

  return result;
}

export async function sweepExamEvidenceSnapshots({ batchSize = 100 } = {}) {
  const sweepResult = await runRetentionPurgeSweeper({ batchSize });
  return {
    category: 'EXAM_EVIDENCE_SNAPSHOTS',
    evaluated: sweepResult.claimedCount,
    purged: sweepResult.purgedCount,
    failed: sweepResult.failedCount
  };
}

export async function verifyAuditLogImmutability() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    let triggerBlocked = false;
    try {
      await client.query('TRUNCATE audit_logs');
    } catch (err) {
      if (err.code === '20000') {
        triggerBlocked = true;
      }
    }
    await client.query('ROLLBACK');
    return {
      category: 'AUDIT_LOG_IMMUTABILITY',
      enforced: triggerBlocked,
      verifiedAt: new Date().toISOString()
    };
  } finally {
    client.release();
  }
}

export async function runAllRetentionSweepers({ dryRun = false } = {}) {
  console.log(`Starting Data Retention Sweepers (DryRun: ${dryRun})...`);

  const summary = {
    startedAt: new Date().toISOString(),
    dryRun,
    results: []
  };

  const auditCheck = await verifyAuditLogImmutability();
  summary.results.push(auditCheck);
  if (!auditCheck.enforced) {
    throw new Error('CRITICAL SECURITY INVARIANT VIOLATION: Audit log immutability trigger SQLSTATE 20000 not active!');
  }

  const evidenceResult = await sweepExamEvidenceSnapshots();
  summary.results.push(evidenceResult);

  const biometricResult = await sweepBiometricRawImages({ dryRun });
  summary.results.push(biometricResult);

  const livenessResult = await sweepLivenessChallengeArtifacts({ dryRun });
  summary.results.push(livenessResult);

  const docResult = await sweepStudentIdentityDocuments({ dryRun });
  summary.results.push(docResult);

  summary.completedAt = new Date().toISOString();
  console.log('Data Retention Sweeper Execution Summary:', JSON.stringify(summary, null, 2));

  return summary;
}

if (process.argv[1]?.endsWith('run-retention-sweepers.js')) {
  const isDryRun = process.argv.includes('--dry-run');
  runAllRetentionSweepers({ dryRun: isDryRun })
    .then(() => {
      console.log('Retention sweeps completed cleanly.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Retention sweeper failed:', err);
      process.exit(1);
    });
}
