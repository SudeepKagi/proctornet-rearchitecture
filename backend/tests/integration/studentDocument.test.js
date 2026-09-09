/**
 * @file studentDocument.test.js
 * @description Integration tests for Candidate Document Onboarding, S3 Presigned Upload/Confirm,
 * Magic Bytes Validation, Document Superseding, and Admin Verification Review.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { setupMockS3, resetMockS3 } from '../evidence/evidenceTestHelper.js';

describe('Candidate Identity & Document Verification Integration (Level 2)', () => {
  const testRunId = Date.now();
  let adminToken;
  let adminUser;
  let studentToken;
  let studentUser;
  let secondStudentToken;
  let secondStudentUser;

  async function loginAndGetToken(email, password) {
    const res = await authService.login({
      email,
      password,
      userAgent: 'document-test-agent',
      ipAddress: '127.0.0.1'
    });
    return res.accessToken;
  }

  before(async () => {
    setupMockS3();

    // Create Admin
    adminUser = await authService.register({
      name: `Doc Admin ${testRunId}`,
      email: `doc_admin_${testRunId}@university.edu`,
      password: 'AdminPassword123!'
    });
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      adminUser.userId,
      'ADMIN'
    ]);
    adminToken = await loginAndGetToken(adminUser.email, 'AdminPassword123!');

    // Create Student 1
    studentUser = await authService.register({
      name: `Doc Student 1 ${testRunId}`,
      email: `doc_student_1_${testRunId}@university.edu`,
      password: 'StudentPassword123!'
    });
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      studentUser.userId,
      'STUDENT'
    ]);
    studentToken = await loginAndGetToken(studentUser.email, 'StudentPassword123!');

    // Create Student 2
    secondStudentUser = await authService.register({
      name: `Doc Student 2 ${testRunId}`,
      email: `doc_student_2_${testRunId}@university.edu`,
      password: 'StudentPassword123!'
    });
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      secondStudentUser.userId,
      'STUDENT'
    ]);
    secondStudentToken = await loginAndGetToken(secondStudentUser.email, 'StudentPassword123!');
  });

  after(async () => {
    resetMockS3();
    await closeRedis();
    await closePool();
  });

  describe('1. Presigned Upload URL Request', () => {
    it('generates a 300s presigned PUT URL and creates PENDING_UPLOAD document', async () => {
      const res = await request(app)
        .post('/api/v1/candidate/identity/document-url')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          documentType: 'PASSPORT',
          documentNumber: 'PASS-12345678',
          fullNameOnDocument: 'Doc Student 1',
          fileName: 'passport_scan.jpg',
          mimeType: 'image/jpeg',
          byteSize: 204800
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.documentId);
      assert.ok(res.body.uploadUrl);
      assert.equal(res.body.expiresInSeconds, 300);

      // Verify PostgreSQL record state & opaque S3 key
      const dbRow = await query('SELECT * FROM student_identity_documents WHERE document_id = $1', [
        res.body.documentId
      ]);
      assert.equal(dbRow.rows.length, 1);
      assert.equal(dbRow.rows[0].verification_status, 'PENDING_UPLOAD');
      assert.equal(dbRow.rows[0].document_type, 'PASSPORT');
      assert.ok(!dbRow.rows[0].s3_key.includes(studentUser.userId), 'S3 Key must be opaque without userId');
      assert.ok(dbRow.rows[0].s3_key.startsWith(`identity-documents/${res.body.documentId}/`));
    });

    it('rejects invalid document types', async () => {
      const res = await request(app)
        .post('/api/v1/candidate/identity/document-url')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          documentType: 'LIBRARY_CARD',
          documentNumber: 'CARD-123',
          fullNameOnDocument: 'Doc Student 1',
          fileName: 'card.jpg',
          mimeType: 'image/jpeg',
          byteSize: 102400
        });

      assert.equal(res.status, 400);
    });

    it('rejects unsupported MIME types or files exceeding 10MB', async () => {
      const mimeRes = await request(app)
        .post('/api/v1/candidate/identity/document-url')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          documentType: 'NATIONAL_ID',
          documentNumber: 'NAT-123',
          fullNameOnDocument: 'Doc Student 1',
          fileName: 'script.sh',
          mimeType: 'text/x-sh',
          byteSize: 1024
        });
      assert.equal(mimeRes.status, 400);

      const sizeRes = await request(app)
        .post('/api/v1/candidate/identity/document-url')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          documentType: 'NATIONAL_ID',
          documentNumber: 'NAT-123',
          fullNameOnDocument: 'Doc Student 1',
          fileName: 'large.pdf',
          mimeType: 'application/pdf',
          byteSize: 11 * 1024 * 1024
        });
      assert.equal(sizeRes.status, 400);
    });
  });

  describe('2. Confirm Upload and Magic Byte Verification', () => {
    it('successfully confirms uploaded JPEG document and updates user verification_status to PENDING', async () => {
      // 1. Request upload URL for Student 1
      const uploadRes = await request(app)
        .post('/api/v1/candidate/identity/document-url')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          documentType: 'DRIVING_LICENSE',
          documentNumber: 'DL-9876543210',
          fullNameOnDocument: 'Doc Student 1',
          fileName: 'license.jpg',
          mimeType: 'image/jpeg',
          byteSize: 102400
        });

      assert.equal(uploadRes.status, 201);
      const documentId = uploadRes.body.documentId;
      assert.ok(documentId);

      // 2. Confirm upload
      const confirmRes = await request(app)
        .post('/api/v1/candidate/identity/confirm-document')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          documentId
        });

      assert.equal(confirmRes.status, 200);
      assert.equal(confirmRes.body.verificationStatus, 'PENDING');

      // Verify user verification_status updated to PENDING
      const userRow = await query('SELECT verification_status FROM users WHERE user_id = $1', [studentUser.userId]);
      assert.equal(userRow.rows[0].verification_status, 'PENDING');

      // Verify document row in database
      const docRow = await query('SELECT * FROM student_identity_documents WHERE document_id = $1', [documentId]);
      assert.equal(docRow.rows[0].verification_status, 'PENDING');
      assert.equal(docRow.rows[0].document_number_last4, '3210');
      assert.ok(docRow.rows[0].document_number_hash);
      assert.notEqual(docRow.rows[0].document_number_hash, 'DL-9876543210', 'Plaintext document number must not be stored');
    });

    it('cleans up S3 and rejects confirmation if magic bytes do not match declared MIME type', async () => {
      // Setup mock S3 to return invalid magic bytes
      let deleteCalled = false;
      setupMockS3({
        GetObjectCommand: async () => {
          async function* generateBadStream() {
            yield Buffer.from('NOT_A_JPEG_PLAIN_TEXT_CONTENT');
          }
          return {
            Body: generateBadStream(),
            ContentLength: 30,
            ContentType: 'image/jpeg'
          };
        },
        DeleteObjectsCommand: async () => {
          deleteCalled = true;
          return { Deleted: [{ Key: 'test' }], Errors: [] };
        }
      });

      const uploadRes = await request(app)
        .post('/api/v1/candidate/identity/document-url')
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .send({
          documentType: 'STUDENT_ID',
          documentNumber: 'STU-123456',
          fullNameOnDocument: 'Doc Student 2',
          fileName: 'spoofed.jpg',
          mimeType: 'image/jpeg',
          byteSize: 102400
        });

      assert.equal(uploadRes.status, 201);
      const documentId = uploadRes.body.documentId;

      const confirmRes = await request(app)
        .post('/api/v1/candidate/identity/confirm-document')
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .send({
          documentId
        });

      assert.equal(confirmRes.status, 400);
      assert.ok(confirmRes.body.error?.message?.includes('File signature'));
      assert.equal(deleteCalled, true, 'Immediate S3 cleanup must be triggered on validation failure');

      // Reset mock S3 to standard
      setupMockS3();
    });
  });

  describe('3. Admin Verification Review & Preview', () => {
    it('allows Admin to fetch student verification dossier', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/students/${studentUser.userId}/verification`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.user);
      assert.ok(res.body.activeDocument);
      assert.ok(Array.isArray(res.body.documentHistory));
    });

    it('generates a 300s presigned preview URL for Admin previewing student document', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/students/${studentUser.userId}/document-preview`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.previewUrl);
      assert.equal(res.body.expiresInSeconds, 300);
    });

    it('rejects REJECTED decision without mandatory rejection notes', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/students/${studentUser.userId}/verification`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          decision: 'REJECTED'
          // reviewNotes missing
        });

      assert.equal(res.status, 400);
    });

    it('allows Admin to reject candidate verification with notes and updates status to REJECTED', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/students/${studentUser.userId}/verification`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          decision: 'REJECTED',
          reviewNotes: 'Image is too blurry to read full name and expiration date.'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.documentStatus, 'REJECTED');
      assert.equal(res.body.verificationStatus, 'REJECTED');

      // Verify PostgreSQL user verification_status is REJECTED
      const userRow = await query('SELECT verification_status FROM users WHERE user_id = $1', [studentUser.userId]);
      assert.equal(userRow.rows[0].verification_status, 'REJECTED');
    });
  });

  describe('4. Document Resubmission and Superseding', () => {
    it('supersedes previous rejected document when candidate uploads a new one', async () => {
      // 1. Student 1 currently has a REJECTED document from previous test
      const prevDoc = await query(
        'SELECT document_id, verification_status FROM student_identity_documents WHERE user_id = $1 AND verification_status = $2',
        [studentUser.userId, 'REJECTED']
      );
      assert.ok(prevDoc.rows.length >= 1);
      const rejectedDocId = prevDoc.rows[0].document_id;

      // 2. Request and confirm new document
      const newUpload = await request(app)
        .post('/api/v1/candidate/identity/document-url')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          documentType: 'PASSPORT',
          documentNumber: 'PASS-55556666',
          fullNameOnDocument: 'Doc Student 1',
          fileName: 'passport_new.png',
          mimeType: 'image/png',
          byteSize: 102400
        });

      assert.equal(newUpload.status, 201);
      const newDocId = newUpload.body.documentId;

      const newConfirm = await request(app)
        .post('/api/v1/candidate/identity/confirm-document')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          documentId: newDocId
        });
      assert.equal(newConfirm.status, 200);

      // 3. Verify previous rejected document is now SUPERSEDED
      const oldDocRow = await query('SELECT verification_status FROM student_identity_documents WHERE document_id = $1', [
        rejectedDocId
      ]);
      assert.equal(oldDocRow.rows[0].verification_status, 'SUPERSEDED');

      // 4. Verify new document is PENDING
      const newDocRow = await query('SELECT verification_status FROM student_identity_documents WHERE document_id = $1', [
        newDocId
      ]);
      assert.equal(newDocRow.rows[0].verification_status, 'PENDING');

      // 5. Admin approves the resubmitted document
      const approveRes = await request(app)
        .patch(`/api/v1/admin/students/${studentUser.userId}/verification`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          decision: 'APPROVED',
          reviewNotes: 'Resubmitted scan is sharp and fully legible.'
        });

      assert.equal(approveRes.status, 200);
      assert.equal(approveRes.body.documentStatus, 'APPROVED');
      assert.equal(approveRes.body.verificationStatus, 'VERIFIED');

      // Verify PostgreSQL user verification_status is VERIFIED
      const userRow = await query('SELECT verification_status FROM users WHERE user_id = $1', [studentUser.userId]);
      assert.equal(userRow.rows[0].verification_status, 'VERIFIED');
    });
  });
});
