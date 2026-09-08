/**
 * @file evidenceSecurity.test.js
 * @description Security and boundary tests for Phase 15 Evidence Storage.
 * Covers S3 HeadObject 404, ContentLength mismatch, ContentType mismatch,
 * MIME allowlist injection, oversized payloads, malformed checksums, and attempt state conflicts.
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

describe('Phase 15 Evidence Storage — Security & Boundary Tests', () => {
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

  it('1. Rejects confirmation when S3 HeadObject returns 404 and transitions row to FAILED', async () => {
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

    setupMockS3({
      HeadObjectCommand: async () => {
        const err = new Error('NoSuchKey');
        err.name = 'NoSuchKey';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
    });

    const confirmRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    assert.equal(confirmRes.status, 400);
    assert.match(confirmRes.body.error?.message, /not found in storage/i);

    // Verify row transitioned to FAILED
    const dbRes = await query(`SELECT status FROM evidence_records WHERE evidence_id = $1`, [
      evidenceId
    ]);
    assert.equal(dbRes.rows[0].status, 'FAILED');

    setupMockS3();
  });

  it('2. Rejects confirmation on exact ContentLength mismatch and transitions row to FAILED', async () => {
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

    // S3 reports 102401 bytes (1 byte difference)
    setupMockS3({
      HeadObjectCommand: async () => ({
        ContentLength: 102401,
        ContentType: 'image/jpeg',
        VersionId: 'v-mismatch'
      })
    });

    const confirmRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    assert.equal(confirmRes.status, 400);
    assert.match(confirmRes.body.error?.message, /size mismatch/i);

    const dbRes = await query(`SELECT status FROM evidence_records WHERE evidence_id = $1`, [
      evidenceId
    ]);
    assert.equal(dbRes.rows[0].status, 'FAILED');

    setupMockS3();
  });

  it('3. Rejects confirmation on ContentType mismatch and transitions row to FAILED', async () => {
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

    // S3 reports image/png instead of image/jpeg
    setupMockS3({
      HeadObjectCommand: async () => ({
        ContentLength: 102400,
        ContentType: 'image/png',
        VersionId: 'v-type-mismatch'
      })
    });

    const confirmRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    assert.equal(confirmRes.status, 400);
    assert.match(confirmRes.body.error?.message, /content type mismatch/i);

    const dbRes = await query(`SELECT status FROM evidence_records WHERE evidence_id = $1`, [
      evidenceId
    ]);
    assert.equal(dbRes.rows[0].status, 'FAILED');

    setupMockS3();
  });

  it('4. Rejects disallowed or malicious MIME types with 400 Bad Request', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const maliciousMimes = [
      'application/x-executable',
      'application/pdf',
      'text/html',
      'image/svg+xml',
      'application/zip'
    ];

    for (const badMime of maliciousMimes) {
      const res = await request(app)
        .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          evidenceType: 'WEBCAM_SNAPSHOT',
          contentType: badMime,
          byteSize: 102400
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error?.message, /contentType must be one of/i);
    }
  });

  it('5. Rejects oversized payloads exceeding maximum category limit with 400 Bad Request', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    // WEBCAM_SNAPSHOT limit is 5 MB
    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 6 * 1024 * 1024 // 6 MB
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error?.message, /exceeds maximum limit/i);
  });

  it('6. Rejects malformed SHA-256 checksum strings with 400 Bad Request', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400,
        sha256Checksum: 'invalid-not-64-hex'
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error?.message, /64-character hexadecimal/i);
  });

  it('7. Rejects upload initiation for non-ACTIVE attempt with 409 Conflict', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('SUBMITTED');

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, 'ATTEMPT_NOT_ACTIVE');
  });
});
