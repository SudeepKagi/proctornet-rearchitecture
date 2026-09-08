/**
 * @file evidenceConsistency.test.js
 * @description Consistency, sweeper concurrency lease, and version-aware purge tests.
 * Validates Consistency Cases A through F, S3 pagination/batching, partial error handling,
 * and orphaned/retention background sweeper tasks.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';
import { setupProctoringFixture, setupMockS3, resetMockS3 } from './evidenceTestHelper.js';
import * as evidenceService from '../../src/modules/evidence/evidence.service.js';
import * as evidenceRepo from '../../src/modules/evidence/evidence.repository.js';
import { deleteEvidenceObjectVersions } from '../../src/infrastructure/storage/s3Storage.js';

describe('Phase 15 Evidence Storage — Consistency & Sweeper Tests', () => {
  let fixture;

  before(async () => {
    fixture = await setupProctoringFixture();
    setupMockS3();
  });

  after(async () => {
    resetMockS3();
    await new Promise((r) => setTimeout(r, 200));
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  it('Case A & D: Orphaned upload sweeper marks expired INITIATED records as ABANDONED and prunes S3', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    // Create an INITIATED upload record
    const initRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });
    const evidenceId = initRes.body.data.evidenceId;

    // Artificially age the upload_expires_at to 20 minutes ago (past TTL + 15m threshold)
    await query(
      `UPDATE evidence_records
       SET upload_expires_at = NOW() - INTERVAL '20 minutes'
       WHERE evidence_id = $1;`,
      [evidenceId]
    );

    let s3DeleteCalled = false;
    setupMockS3({
      ListObjectVersionsCommand: async (input) => {
        return {
          IsTruncated: false,
          Versions: [{ Key: input.Prefix, VersionId: 'v-abandoned-target' }],
          DeleteMarkers: []
        };
      },
      DeleteObjectsCommand: async () => {
        s3DeleteCalled = true;
        return { Deleted: [{ Key: 'test', VersionId: 'v-abandoned-target' }], Errors: [] };
      }
    });

    // Run orphaned upload sweeper
    const sweepResult = await evidenceService.runOrphanedUploadSweeper({ batchSize: 50 });
    assert.ok(sweepResult.processedCount >= 1);
    assert.equal(s3DeleteCalled, true);

    // Verify row transitioned to ABANDONED and lease is cleared
    const checkRow = await query(
      `SELECT status, claim_expires_at FROM evidence_records WHERE evidence_id = $1;`,
      [evidenceId]
    );
    assert.equal(checkRow.rows[0].status, 'ABANDONED');
    assert.equal(checkRow.rows[0].claim_expires_at, null);

    setupMockS3();
  });

  it('Case C: AVAILABLE row whose S3 object is missing returns 404 and transitions row to FAILED', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const initRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });
    const evidenceId = initRes.body.data.evidenceId;

    await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Mock S3 HeadObject throwing NoSuchKey / 404
    setupMockS3({
      HeadObjectCommand: async () => {
        const err = new Error('NoSuchKey');
        err.name = 'NoSuchKey';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
    });

    // Request playback URL
    const getRes = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/url`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`);

    assert.equal(getRes.status, 404);
    assert.equal(getRes.body.error?.code, 'EVIDENCE_OBJECT_NOT_FOUND');

    // Verify row transitioned to FAILED in PostgreSQL
    const checkRow = await query(`SELECT status FROM evidence_records WHERE evidence_id = $1;`, [
      evidenceId
    ]);
    assert.equal(checkRow.rows[0].status, 'FAILED');

    setupMockS3();
  });

  it('Case E: Retention sweeper leaves status AVAILABLE for retry if S3 deletion fails', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const initRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });
    const evidenceId = initRes.body.data.evidenceId;

    await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Age retention_expires_at to the past
    await query(
      `UPDATE evidence_records
       SET retention_expires_at = NOW() - INTERVAL '1 hour'
       WHERE evidence_id = $1;`,
      [evidenceId]
    );

    // Mock S3 Delete throwing network or authorization error
    setupMockS3({
      ListObjectVersionsCommand: async (input) => ({
        IsTruncated: false,
        Versions: [{ Key: input.Prefix, VersionId: 'v1' }],
        DeleteMarkers: []
      }),
      DeleteObjectsCommand: async () => {
        const err = new Error('S3 Service Unavailable');
        err.name = 'ServiceUnavailable';
        throw err;
      }
    });

    // Run retention sweeper
    const sweepResult = await evidenceService.runRetentionPurgeSweeper({ batchSize: 50 });
    assert.ok(sweepResult.failedCount >= 1);

    // CRITICAL: Record must NOT be marked PURGED, must remain AVAILABLE
    const checkRow = await query(
      `SELECT status, claim_expires_at FROM evidence_records WHERE evidence_id = $1;`,
      [evidenceId]
    );
    assert.equal(checkRow.rows[0].status, 'AVAILABLE');
    assert.equal(checkRow.rows[0].claim_expires_at, null);

    setupMockS3();
  });

  it('Retention Sweeper: Successful S3 deletion transitions row to PURGED and creates EVIDENCE_PURGED audit log', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const initRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'SCREEN_CAPTURE',
        contentType: 'image/png',
        byteSize: 102400
      });
    const evidenceId = initRes.body.data.evidenceId;

    await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    await query(
      `UPDATE evidence_records
       SET retention_expires_at = NOW() - INTERVAL '1 hour'
       WHERE evidence_id = $1;`,
      [evidenceId]
    );

    let deletedVersions = [];
    setupMockS3({
      ListObjectVersionsCommand: async (input) => ({
        IsTruncated: false,
        Versions: [{ Key: input.Prefix, VersionId: 'v-retention-purged' }],
        DeleteMarkers: []
      }),
      DeleteObjectsCommand: async (input) => {
        deletedVersions = input.Delete?.Objects || [];
        return { Deleted: deletedVersions, Errors: [] };
      }
    });

    const sweepResult = await evidenceService.runRetentionPurgeSweeper({ batchSize: 50 });
    assert.ok(sweepResult.purgedCount >= 1);
    assert.equal(deletedVersions.length, 1);

    const checkRow = await query(
      `SELECT status, claim_expires_at FROM evidence_records WHERE evidence_id = $1;`,
      [evidenceId]
    );
    assert.equal(checkRow.rows[0].status, 'PURGED');
    assert.equal(checkRow.rows[0].claim_expires_at, null);

    // Verify system-level EVIDENCE_PURGED audit event
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE action = 'EVIDENCE_PURGED' AND resource_id = $1;`,
      [evidenceId]
    );
    assert.ok(auditRes.rowCount >= 1);
    assert.equal(auditRes.rows[0].actor_user_id, null);

    setupMockS3();
  });

  it('S3 Version Deletion Helper: Handles pagination across multiple truncated pages', async () => {
    let callCount = 0;
    const testKey = 'evidence/test-session/test-attempt/WEBCAM_SNAPSHOT/page-test.jpg';

    setupMockS3({
      ListObjectVersionsCommand: async (input) => {
        callCount++;
        if (callCount === 1) {
          return {
            IsTruncated: true,
            NextKeyMarker: testKey,
            NextVersionIdMarker: 'ver-page-1',
            Versions: [
              { Key: testKey, VersionId: 'ver-1' },
              { Key: testKey, VersionId: 'ver-2' }
            ],
            DeleteMarkers: []
          };
        }
        return {
          IsTruncated: false,
          Versions: [{ Key: testKey, VersionId: 'ver-3' }],
          DeleteMarkers: [{ Key: testKey, VersionId: 'del-marker-1' }]
        };
      },
      DeleteObjectsCommand: async (input) => ({
        Deleted: (input.Delete?.Objects || []).map((o) => ({ Key: o.Key, VersionId: o.VersionId })),
        Errors: []
      })
    });

    const result = await deleteEvidenceObjectVersions({
      bucket: 'proctornet-evidence-dev-01',
      key: testKey
    });

    assert.equal(callCount, 2);
    assert.equal(result.deletedCount, 4); // 3 versions + 1 delete marker

    setupMockS3();
  });

  it('S3 Version Deletion Helper: Throws error on partial DeleteObjects failure', async () => {
    const testKey = 'evidence/test-session/test-attempt/WEBCAM_SNAPSHOT/fail-test.jpg';

    setupMockS3({
      ListObjectVersionsCommand: async (input) => ({
        IsTruncated: false,
        Versions: [{ Key: testKey, VersionId: 'v-failed-ver' }],
        DeleteMarkers: []
      }),
      DeleteObjectsCommand: async () => ({
        Deleted: [],
        Errors: [
          { Key: testKey, VersionId: 'v-failed-ver', Code: 'AccessDenied', Message: 'Access Denied' }
        ]
      })
    });

    await assert.rejects(
      () =>
        deleteEvidenceObjectVersions({
          bucket: 'proctornet-evidence-dev-01',
          key: testKey
        }),
      /S3 DeleteObjects partial failure/
    );

    setupMockS3();
  });

  it('Decoupled Lease Concurrency: claim_expires_at prevents simultaneous worker collision', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const initRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });
    const evidenceId = initRes.body.data.evidenceId;

    await query(
      `UPDATE evidence_records
       SET upload_expires_at = NOW() - INTERVAL '20 minutes'
       WHERE evidence_id = $1;`,
      [evidenceId]
    );

    // Worker 1 claims
    const claim1 = await evidenceRepo.claimOrphanedUploads(50, 2);
    const claimedIds1 = claim1.map((c) => c.evidence_id);
    assert.ok(claimedIds1.includes(evidenceId));

    // Worker 2 attempts to claim immediately while Worker 1 lease is active
    const claim2 = await evidenceRepo.claimOrphanedUploads(50, 2);
    const claimedIds2 = claim2.map((c) => c.evidence_id);
    assert.ok(!claimedIds2.includes(evidenceId), 'Worker 2 must SKIP LOCKED row claimed by Worker 1');

    // Clean up
    await evidenceRepo.finalizeAbandonedEvidence(evidenceId);
  });
});
