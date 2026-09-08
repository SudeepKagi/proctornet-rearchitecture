/**
 * @file adminApiContract.test.js
 * @description Real API Contract Integration Tests: Proves that the exact backend routes
 * match the frontend API client expectations and that multipart 'file' upload works end-to-end.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as userService from '../../src/modules/users/user.service.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';

describe('Admin API Route Contract Tests (Real Express Integration)', () => {
  const testRunId = Date.now();
  let adminUser;
  let adminToken;

  async function loginAndGetToken(email, password) {
    const res = await authService.login({
      email,
      password,
      userAgent: 'contract-test-agent',
      ipAddress: '127.0.0.1'
    });
    return res.accessToken;
  }

  before(async () => {
    adminUser = await authService.register({
      name: `Contract Admin ${testRunId}`,
      email: `contract_admin_${testRunId}@university.edu`,
      password: 'AdminPassword123!'
    });
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      adminUser.userId,
      'ADMIN'
    ]);
    adminToken = await loginAndGetToken(adminUser.email, 'AdminPassword123!');
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });

  // 1. POST /api/v1/admin/users/bulk-import/preview
  describe('1. POST /api/v1/admin/users/bulk-import/preview', () => {
    it('succeeds with multipart "file" field and returns parse analysis', async () => {
      const csvContent = 'name,email,identifier\nAlice Contract,alice_contract@uni.edu,USN-C101\n';

      const res = await request(app)
        .post('/api/v1/admin/users/bulk-import/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from(csvContent), 'roster.csv')
        .field('defaultRole', 'STUDENT');

      assert.equal(res.status, 200);
      assert.equal(res.body.totalRows, 1);
      assert.equal(res.body.validRows.length, 1);
      assert.equal(res.body.validRows[0].email, 'alice_contract@uni.edu');
    });

    it('rejects upload when using incorrect field name (e.g., "roster")', async () => {
      const csvContent = 'name,email,identifier\nAlice Contract,alice_contract@uni.edu,USN-C101\n';

      const res = await request(app)
        .post('/api/v1/admin/users/bulk-import/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('roster', Buffer.from(csvContent), 'roster.csv')
        .field('defaultRole', 'STUDENT');

      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /Unexpected field/i);
    });
  });

  // 2. POST /api/v1/admin/users/bulk-import
  describe('2. POST /api/v1/admin/users/bulk-import', () => {
    it('succeeds with multipart "file" field and commits accounts', async () => {
      const uniqueEmail = `bulk_commit_${testRunId}@university.edu`;
      const uniqueUsn = `USN-C102-${testRunId}`;
      const csvContent = `name,email,identifier\nBob Committed,${uniqueEmail},${uniqueUsn}\n`;

      const res = await request(app)
        .post('/api/v1/admin/users/bulk-import')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from(csvContent), 'roster.csv')
        .field('defaultRole', 'STUDENT')
        .field('atomic', 'false');

      assert.equal(res.status, 200);
      assert.equal(res.body.summary.created, 1);
      assert.equal(res.body.credentials.length, 1);
      assert.equal(res.body.credentials[0].email, uniqueEmail);
      assert.equal(res.body.credentials[0].temporaryPassword.length, 16);
    });

    it('rejects commit when using incorrect field name "roster"', async () => {
      const csvContent = 'name,email,identifier\nBob Committed,bob@uni.edu,USN-C102\n';

      const res = await request(app)
        .post('/api/v1/admin/users/bulk-import')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('roster', Buffer.from(csvContent), 'roster.csv')
        .field('defaultRole', 'STUDENT');

      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /Unexpected field/i);
    });
  });

  // 3. PATCH /api/v1/admin/users/:id/verification
  describe('3. PATCH /api/v1/admin/users/:id/verification', () => {
    it('succeeds when reviewing a pending candidate verification', async () => {
      // Create student and submit onboarding to transition to PENDING
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Verification Candidate',
        email: `ver_cand_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-VER-CAND-${testRunId}`,
        actorUserId: adminUser.userId
      });

      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: { department: 'Computer Science', semester: 4 }
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user.userId}/verification`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          verificationStatus: 'VERIFIED',
          reviewNotes: 'Official academic transcript verified'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.verificationStatus, 'VERIFIED');
      assert.equal(res.body.verificationNotes, 'Official academic transcript verified');
    });

    it('requires mandatory review notes on rejection', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Reject Candidate',
        email: `rej_cand_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-REJ-CAND-${testRunId}`,
        actorUserId: adminUser.userId
      });

      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: { department: 'Computer Science', semester: 4 }
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user.userId}/verification`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          verificationStatus: 'REJECTED',
          reviewNotes: '   '
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /Mandatory review notes are required/i);
    });
  });

  // 4. GET /api/v1/admin/organization
  describe('4. GET /api/v1/admin/organization', () => {
    it('returns 200 with authoritative organization settings', async () => {
      const res = await request(app)
        .get('/api/v1/admin/organization')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.settings);
      assert.ok(res.body.settings.institutionName);
      assert.ok(res.body.settings.supportEmail);
      assert.ok(Array.isArray(res.body.settings.allowedDomains));
      assert.ok(res.body.settings.passwordPolicy);
      assert.ok(res.body.settings.sessionPolicy);
      assert.ok(res.body.settings.featureFlags);
      assert.equal(res.body.settings.featureFlags.allowSelfRegistration, false);
    });
  });

  // 5. PUT /api/v1/admin/organization
  describe('5. PUT /api/v1/admin/organization', () => {
    it('updates institutional configuration and strictly enforces allowSelfRegistration=false', async () => {
      const payload = {
        institutionName: 'Updated State University',
        supportEmail: 'support@state.edu',
        allowedDomains: ['state.edu', 'alumni.state.edu'],
        passwordPolicy: {
          minLength: 10,
          maxFailedAttempts: 4,
          lockoutDurationMinutes: 20
        },
        sessionPolicy: {
          accessTokenTtlMinutes: 20,
          refreshTokenTtlDays: 14
        },
        featureFlags: {
          allowSelfRegistration: true, // Attempt to illegally enable self-registration
          requireVerificationBeforeExam: true
        }
      };

      const res = await request(app)
        .put('/api/v1/admin/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      assert.equal(res.status, 200);
      assert.ok(res.body.settings);
      assert.equal(res.body.settings.institutionName, 'Updated State University');
      assert.equal(res.body.settings.supportEmail, 'support@state.edu');
      assert.deepEqual(res.body.settings.allowedDomains, ['state.edu', 'alumni.state.edu']);
      assert.equal(res.body.settings.passwordPolicy.minLength, 10);
      assert.equal(res.body.settings.passwordPolicy.maxFailedAttempts, 4);
      assert.equal(res.body.settings.passwordPolicy.lockoutDurationMinutes, 20);
      assert.equal(res.body.settings.sessionPolicy.accessTokenTtlMinutes, 20);
      assert.equal(res.body.settings.sessionPolicy.refreshTokenTtlDays, 14);

      // INVARIANT: allowSelfRegistration MUST remain false despite client request
      assert.equal(res.body.settings.featureFlags.allowSelfRegistration, false);
    });
  });

  // 6. GET /api/v1/admin/audit
  describe('6. GET /api/v1/admin/audit', () => {
    it('returns 200 with centralized audit logs and pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit?limit=10&page=1')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      const data = res.body.data || res.body;
      assert.ok(Array.isArray(data.audit_logs));
      assert.ok(data.pagination);
      assert.equal(data.pagination.page, 1);
      assert.ok(data.pagination.limit >= 1);
      assert.ok(typeof data.pagination.total === 'number');
    });
  });
});
