/**
 * @file evidenceIntegration.test.js
 * @description Integration tests for Phase 15 Evidence Storage.
 * Covers upload initiation, S3 confirmation with VersionId pinning, idempotent confirmation,
 * VersionId-pinned playback URLs, physical vs. logical immutability, violation linking,
 * evidence listing, and deletion.
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

describe('Phase 15 Evidence Storage — Integration Tests', () => {
  let fixture;
  let mockS3;

  before(async () => {
    fixture = await setupProctoringFixture();
    mockS3 = setupMockS3({
      HeadObjectCommand: async (input) => ({
        ContentLength: 102400,
        ContentType: input?.Key?.endsWith('.png') ? 'image/png' : 'image/jpeg',
        VersionId: 'v-pinned-version-alpha-99',
        ETag: '"etag-test-123"'
      }),
      ListObjectVersionsCommand: async (input) => ({
        IsTruncated: false,
        Versions: [{ Key: input.Prefix, VersionId: 'v-pinned-version-alpha-99' }],
        DeleteMarkers: []
      }),
      DeleteObjectsCommand: async (input) => ({
        Deleted: (input.Delete?.Objects || []).map((o) => ({ Key: o.Key, VersionId: o.VersionId })),
        Errors: []
      })
    });
  });

  after(async () => {
    resetMockS3();
    await new Promise((r) => setTimeout(r, 200));
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  it('1. should initiate upload URL, insert INITIATED record, and return SigV4 presigned PUT URL', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');
    const checksum = 'a'.repeat(64);

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400,
        sha256Checksum: checksum,
        metadata: { trigger: 'routine_interval' }
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.evidenceId);
    assert.ok(res.body.data.uploadUrl);
    assert.ok(res.body.data.objectKey);
    assert.equal(res.body.data.expiresIn, 300);

    // Verify URL contains SigV4 components
    assert.ok(res.body.data.uploadUrl.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
    assert.ok(res.body.data.uploadUrl.includes('X-Amz-Signature='));

    // Verify PostgreSQL record status is INITIATED
    const dbRes = await query(`SELECT * FROM evidence_records WHERE evidence_id = $1`, [
      res.body.data.evidenceId
    ]);
    assert.equal(dbRes.rowCount, 1);
    const row = dbRes.rows[0];
    assert.equal(row.status, 'INITIATED');
    assert.equal(row.declared_byte_size, 102400);
    assert.equal(row.sha256_checksum, checksum);
    assert.equal(row.s3_version_id, null);
    assert.equal(row.actual_byte_size, null);
  });

  it('2. should confirm evidence, pin authoritative S3 VersionId, set actual size, and transition to AVAILABLE', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    // Step A: Initiate upload
    const initRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });
    assert.equal(initRes.status, 201);
    const evidenceId = initRes.body.data.evidenceId;

    // Step B: Confirm upload
    const confirmRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.status, 'success');
    assert.equal(confirmRes.body.data.status, 'AVAILABLE');
    assert.equal(confirmRes.body.data.s3VersionId, 'v-pinned-version-alpha-99');
    assert.equal(confirmRes.body.data.actualByteSize, 102400);
    assert.ok(confirmRes.body.data.confirmedAt);

    // Verify DB row
    const dbRes = await query(`SELECT * FROM evidence_records WHERE evidence_id = $1`, [evidenceId]);
    const row = dbRes.rows[0];
    assert.equal(row.status, 'AVAILABLE');
    assert.equal(row.s3_version_id, 'v-pinned-version-alpha-99');
    assert.equal(row.actual_byte_size, 102400);
    assert.ok(row.confirmed_at);
    assert.ok(row.retention_expires_at);
  });

  it('3. should handle duplicate confirm requests idempotently without mutating pinned VersionId', async () => {
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

    // First confirmation
    const firstConfirm = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    assert.equal(firstConfirm.status, 200);

    // Duplicate confirmation
    const secondConfirm = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    assert.equal(secondConfirm.status, 200);
    assert.equal(secondConfirm.body.data.status, 'AVAILABLE');
    assert.equal(secondConfirm.body.data.s3VersionId, 'v-pinned-version-alpha-99');
    assert.equal(secondConfirm.body.data.confirmedAt, firstConfirm.body.data.confirmedAt);
  });

  it('4. should generate presigned playback GET URL pinning VersionId for authorized invigilator', async () => {
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

    // Invigilator retrieves playback URL
    const getRes = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/url`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`);

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.status, 'success');
    assert.ok(getRes.body.data.downloadUrl);
    assert.equal(getRes.body.data.contentType, 'image/jpeg');
    assert.equal(getRes.body.data.expiresIn, 900);

    // Crucial check: VersionId MUST be present in the presigned GET URL query string
    assert.ok(
      getRes.body.data.downloadUrl.includes('versionId=v-pinned-version-alpha-99'),
      'Playback URL must explicitly pin the confirmed VersionId'
    );

    // Verify EVIDENCE_ACCESSED audit record was created
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE action = 'EVIDENCE_ACCESSED' AND resource_id = $1`,
      [evidenceId]
    );
    assert.ok(auditRes.rowCount >= 1);
  });

  it('5. should enforce physical vs logical immutability: late S3 PUT does not alter playback VersionId', async () => {
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

    // Confirm initial upload (VersionId alpha)
    await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Simulate attacker performing a subsequent S3 PUT that creates a newer VersionId in S3
    setupMockS3({
      HeadObjectCommand: async () => ({
        ContentLength: 102400,
        ContentType: 'image/jpeg',
        VersionId: 'v-unauthorized-late-put-beta-100', // Newer version in S3
        ETag: '"etag-late-put"'
      })
    });

    // Staff requests playback URL
    const getRes = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/url`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`);

    assert.equal(getRes.status, 200);
    // Playback URL MUST still pin original confirmed VersionId alpha, NOT the unvalidated late PUT beta!
    assert.ok(
      getRes.body.data.downloadUrl.includes('versionId=v-pinned-version-alpha-99'),
      'Playback URL must remain pinned to database verified VersionId alpha'
    );
    assert.ok(
      !getRes.body.data.downloadUrl.includes('v-unauthorized-late-put-beta-100'),
      'Playback URL must not resolve to unvalidated newer version'
    );

    // Restore standard mock
    setupMockS3();
  });

  it('6. should link violation_events evidence_object_key upon confirmation', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    // Create a violation event in DB first
    const violRes = await query(
      `INSERT INTO violation_events (attempt_id, event_type, severity, client_timestamp)
       VALUES ($1, 'WINDOW_BLUR', 'LOW', NOW()) RETURNING violation_id;`,
      [attempt.attempt_id]
    );
    const violationId = violRes.rows[0].violation_id;

    // Upload evidence linked to violation
    const initRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'SCREEN_CAPTURE',
        contentType: 'image/png',
        byteSize: 102400,
        violationId
      });
    const evidenceId = initRes.body.data.evidenceId;
    const objectKey = initRes.body.data.objectKey;

    setupMockS3({
      HeadObjectCommand: async () => ({
        ContentLength: 102400,
        ContentType: 'image/png',
        VersionId: 'v-viol-link-01'
      })
    });

    await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Verify violation_events row has been updated with evidence_object_key
    const checkViol = await query(
      `SELECT evidence_object_key FROM violation_events WHERE violation_id = $1;`,
      [violationId]
    );
    assert.equal(checkViol.rows[0].evidence_object_key, objectKey);

    setupMockS3();
  });

  it('7. should list attempt evidence for authorized staff with pagination', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    // Create 2 evidence items
    for (let i = 0; i < 2; i++) {
      const initRes = await request(app)
        .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          evidenceType: 'WEBCAM_SNAPSHOT',
          contentType: 'image/jpeg',
          byteSize: 102400
        });
      await request(app)
        .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${initRes.body.data.evidenceId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
    }

    const listRes = await request(app)
      .get(`/api/v1/attempts/${attempt.attempt_id}/evidence?page=1&limit=10`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.status, 'success');
    assert.equal(listRes.body.data.attemptId, attempt.attempt_id);
    assert.ok(listRes.body.data.evidence.length >= 2);
    assert.ok(listRes.body.data.pagination);
    assert.equal(listRes.body.data.pagination.page, 1);
  });

  it('8. should allow owning faculty to delete evidence, destroying S3 versions and marking PURGED', async () => {
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

    let deleteCalled = false;
    setupMockS3({
      ListObjectVersionsCommand: async (input) => ({
        IsTruncated: false,
        Versions: [{ Key: input.Prefix, VersionId: 'v-delete-target' }],
        DeleteMarkers: []
      }),
      DeleteObjectsCommand: async () => {
        deleteCalled = true;
        return { Deleted: [{ Key: 'test', VersionId: 'v-delete-target' }], Errors: [] };
      }
    });

    const delRes = await request(app)
      .delete(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}`)
      .set('Authorization', `Bearer ${fixture.faculty.token}`);

    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.status, 'success');
    assert.equal(deleteCalled, true);

    // Verify row status is PURGED
    const dbRes = await query(`SELECT status FROM evidence_records WHERE evidence_id = $1;`, [
      evidenceId
    ]);
    assert.equal(dbRes.rows[0].status, 'PURGED');

    // Verify EVIDENCE_PURGED in audit_logs
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE action = 'EVIDENCE_PURGED' AND resource_id = $1;`,
      [evidenceId]
    );
    assert.ok(auditRes.rowCount >= 1);
  });
});
