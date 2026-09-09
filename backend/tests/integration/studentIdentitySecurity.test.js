/**
 * @file studentIdentitySecurity.test.js
 * @description Level 3 Security & Role Boundary Tests:
 * - IDOR prevention (students cannot access/confirm others' documents)
 * - Strict Role Boundaries: FACULTY, INVIGILATOR, DEVELOPER denied raw document access
 * - Accommodation Configuration Authorization (Admin only, bounds 1.00 - 3.00)
 * - Sensitive Data Leakage Prevention (plaintext document numbers never persisted)
 * - Server-authoritative attempt duration scaling
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { setupMockS3, resetMockS3 } from '../evidence/evidenceTestHelper.js';
import * as studentConfigRepo from '../../src/modules/candidate/studentConfig.repository.js';

describe('Student Identity Security & Role Boundary Tests (Level 3)', () => {
  const testRunId = Date.now();
  let adminToken;
  let student1User;
  let student1Token;
  let student2User;
  let student2Token;
  let facultyUser;
  let facultyToken;
  let invigilatorUser;
  let invigilatorToken;
  let developerUser;
  let developerToken;
  let student1DocId;

  async function loginAndGetToken(email, password) {
    const res = await authService.login({
      email,
      password,
      userAgent: 'security-test-agent',
      ipAddress: '127.0.0.1'
    });
    return res.accessToken;
  }

  async function createUserWithRole(name, email, role) {
    const user = await authService.register({
      name,
      email,
      password: 'SecurePassword123!'
    });
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      user.userId,
      role
    ]);
    if (role === 'STUDENT') {
      await query(
        `INSERT INTO student_profiles (user_id, enrollment_number, department, semester)
         VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO NOTHING`,
        [user.userId, `USN-${Date.now()}-${Math.floor(Math.random() * 10000)}`, 'General', 1]
      );
    }
    const token = await loginAndGetToken(email, 'SecurePassword123!');
    return { user, token };
  }

  before(async () => {
    setupMockS3();

    const admin = await createUserWithRole(`Sec Admin ${testRunId}`, `sec_admin_${testRunId}@uni.edu`, 'ADMIN');
    adminToken = admin.token;

    const s1 = await createUserWithRole(`Sec Student 1 ${testRunId}`, `sec_s1_${testRunId}@uni.edu`, 'STUDENT');
    student1User = s1.user;
    student1Token = s1.token;

    const s2 = await createUserWithRole(`Sec Student 2 ${testRunId}`, `sec_s2_${testRunId}@uni.edu`, 'STUDENT');
    student2User = s2.user;
    student2Token = s2.token;

    const fac = await createUserWithRole(`Sec Faculty ${testRunId}`, `sec_fac_${testRunId}@uni.edu`, 'FACULTY');
    facultyUser = fac.user;
    facultyToken = fac.token;

    const inv = await createUserWithRole(`Sec Invigilator ${testRunId}`, `sec_inv_${testRunId}@uni.edu`, 'INVIGILATOR');
    invigilatorUser = inv.user;
    invigilatorToken = inv.token;

    const dev = await createUserWithRole(`Sec Developer ${testRunId}`, `sec_dev_${testRunId}@uni.edu`, 'DEVELOPER');
    developerUser = dev.user;
    developerToken = dev.token;

    // Upload and confirm document for Student 1
    const uploadRes = await request(app)
      .post('/api/v1/candidate/identity/document-url')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        documentType: 'PASSPORT',
        documentNumber: 'SECRET-PASS-7890',
        fullNameOnDocument: 'Sec Student 1',
        fileName: 'pass.jpg',
        mimeType: 'image/jpeg',
        byteSize: 102400
      });
    student1DocId = uploadRes.body.documentId;

    await request(app)
      .post('/api/v1/candidate/identity/confirm-document')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ documentId: student1DocId });
  });

  after(async () => {
    resetMockS3();
    await closeRedis();
    await closePool();
  });

  describe('1. IDOR Defense (Cross-Student Document Isolation)', () => {
    it('prevents Student 2 from confirming Student 1 document upload', async () => {
      // Student 2 attempts to confirm Student 1's documentId
      const res = await request(app)
        .post('/api/v1/candidate/identity/confirm-document')
        .set('Authorization', `Bearer ${student2Token}`)
        .send({ documentId: student1DocId });

      // Must be rejected with 403 Forbidden or 404 NotFound
      assert.ok([403, 404].includes(res.status), `Expected 403 or 404 on IDOR confirm attempt, got ${res.status}`);
    });

    it('prevents Student 1 from accessing admin document preview of any student', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/students/${student1User.userId}/document-preview`)
        .set('Authorization', `Bearer ${student1Token}`);

      assert.equal(res.status, 403, 'Students must not access administrative document previews');
    });

    it('prevents Student 1 from reviewing or approving their own verification', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/students/${student1User.userId}/verification`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ decision: 'APPROVED' });

      assert.equal(res.status, 403, 'Students must never approve their own verification');
    });
  });

  describe('2. Strict Role Boundaries on Sensitive Government ID', () => {
    it('denies FACULTY from previewing student identity documents', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/students/${student1User.userId}/document-preview`)
        .set('Authorization', `Bearer ${facultyToken}`);

      assert.equal(res.status, 403, 'FACULTY role must not access raw candidate government IDs');
    });

    it('denies INVIGILATOR from previewing student identity documents', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/students/${student1User.userId}/document-preview`)
        .set('Authorization', `Bearer ${invigilatorToken}`);

      assert.equal(res.status, 403, 'INVIGILATOR role must not access raw candidate government IDs');
    });

    it('denies DEVELOPER from previewing student identity documents', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/students/${student1User.userId}/document-preview`)
        .set('Authorization', `Bearer ${developerToken}`);

      assert.equal(res.status, 403, 'DEVELOPER role must not access raw candidate government IDs');
    });
  });

  describe('3. Sensitive Data Protection (Zero Plaintext Document Numbers)', () => {
    it('confirms plaintext document number is never stored anywhere in database', async () => {
      const docRow = await query('SELECT * FROM student_identity_documents WHERE document_id = $1', [student1DocId]);
      assert.equal(docRow.rows.length, 1);
      const row = docRow.rows[0];

      // String representation of entire row must not contain 'SECRET-PASS-7890'
      const serialized = JSON.stringify(row);
      assert.ok(!serialized.includes('SECRET-PASS-7890'), 'Plaintext document number must not appear in database row');
      assert.equal(row.document_number_last4, '7890');
      assert.ok(row.document_number_hash);
    });
  });

  describe('4. Per-Student Accommodations Authorization and Bounds', () => {
    it('denies STUDENT from configuring accommodations for self or others', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/students/${student1User.userId}/configuration`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ extraTimeMultiplier: 1.5 });

      assert.equal(res.status, 403);
    });

    it('denies FACULTY from modifying student configurations', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/students/${student1User.userId}/configuration`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ extraTimeMultiplier: 1.5 });

      assert.equal(res.status, 403);
    });

    it('rejects out-of-bounds extraTimeMultiplier (< 1.00 or > 3.00)', async () => {
      const lowRes = await request(app)
        .put(`/api/v1/admin/students/${student1User.userId}/configuration`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ extraTimeMultiplier: 0.8 });
      assert.equal(lowRes.status, 400);

      const highRes = await request(app)
        .put(`/api/v1/admin/students/${student1User.userId}/configuration`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ extraTimeMultiplier: 3.5 });
      assert.equal(highRes.status, 400);
    });

    it('allows Admin to update student accommodations and returns updated config', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/students/${student1User.userId}/configuration`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          extraTimeMultiplier: 1.50,
          breakAllowanceMinutes: 15,
          maxBreaksAllowed: 2,
          assistiveTechnology: { screenReader: true, speechToText: false, keyboardOnly: false },
          proctoringStrictness: 'RELAXED'
        });

      assert.equal(res.status, 200);
      assert.equal(Number(res.body.extraTimeMultiplier), 1.50);
      assert.equal(res.body.breakAllowanceMinutes, 15);
      assert.equal(res.body.maxBreaksAllowed, 2);
      assert.equal(res.body.proctoringStrictness, 'RELAXED');
      assert.equal(res.body.assistiveTechnology.screenReader, true);

      // Student can view their own approved accommodations via candidate profile
      const profRes = await request(app)
        .get('/api/v1/candidate/profile')
        .set('Authorization', `Bearer ${student1Token}`);

      assert.equal(profRes.status, 200);
      assert.equal(Number(profRes.body.accommodations.extraTimeMultiplier), 1.50);
    });
  });

  describe('5. Authoritative Attempt Duration Scaling Verification', () => {
    it('verifies that configured extraTimeMultiplier is server-authoritative and cannot be tampered with by candidate', async () => {
      const config = await studentConfigRepo.findConfigurationByStudentId(student1User.userId);
      assert.ok(config);
      assert.equal(Number(config.extra_time_multiplier), 1.50);

      // Verify that student cannot inject a duration multiplier in candidate endpoints
      const profileRes = await request(app)
        .patch('/api/v1/candidate/profile')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          extraTimeMultiplier: 2.50,
          department: 'Computer Science'
        });

      assert.equal(profileRes.status, 200);
      assert.equal(profileRes.body.department, 'Computer Science');

      // Configuration remains strictly 1.50
      const afterConfig = await studentConfigRepo.findConfigurationByStudentId(student1User.userId);
      assert.equal(Number(afterConfig.extra_time_multiplier), 1.50);
    });
  });
});
