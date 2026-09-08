/**
 * @file userAdminSecurity.test.js
 * @description Level 3 Security Tests: Comprehensive enforcement of RBAC, administrative provisioning,
 * verification gate, credential safety, last-admin protection, and direct API bypass defense.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';

import { app } from '../../src/app.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as authRepo from '../../src/modules/auth/auth.repository.js';
import * as userRepo from '../../src/modules/users/user.repository.js';
import * as userService from '../../src/modules/users/user.service.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { DomainInvariantError } from '../../src/domain/shared/domainErrors.js';

describe('Level 3 Security Tests (Phase 23 User Administration)', () => {
  const testRunId = Date.now();

  let adminUser;
  let adminToken;

  let studentUser;
  let studentToken;

  let facultyUser;
  let facultyToken;

  let invigilatorUser;
  let invigilatorToken;

  let developerUser;
  let developerToken;

  async function loginAndGetToken(email, password) {
    const res = await authService.login({
      email,
      password,
      userAgent: 'test-agent',
      ipAddress: '127.0.0.1'
    });
    return res.accessToken;
  }

  before(async () => {
    // 1. Create Admin
    adminUser = await authService.register({
      name: `Admin Sec ${testRunId}`,
      email: `admin_sec_${testRunId}@university.edu`,
      password: 'AdminPassword123!'
    });
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [adminUser.userId, 'ADMIN']);
    adminToken = await loginAndGetToken(adminUser.email, 'AdminPassword123!');

    // 2. Create Student
    studentUser = await authService.register({
      name: `Student Sec ${testRunId}`,
      email: `student_sec_${testRunId}@university.edu`,
      password: 'StudentPassword123!',
      student_profile: {
        enrollment_number: `USN-SEC-${testRunId}`,
        department: 'CS',
        semester: 4
      }
    });
    studentToken = await loginAndGetToken(studentUser.email, 'StudentPassword123!');

    // 3. Create Faculty
    facultyUser = await authService.register({
      name: `Faculty Sec ${testRunId}`,
      email: `faculty_sec_${testRunId}@university.edu`,
      password: 'FacultyPassword123!'
    });
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [facultyUser.userId, 'FACULTY']);
    facultyToken = await loginAndGetToken(facultyUser.email, 'FacultyPassword123!');

    // 4. Create Invigilator
    invigilatorUser = await authService.register({
      name: `Invigilator Sec ${testRunId}`,
      email: `invigilator_sec_${testRunId}@university.edu`,
      password: 'InvigilatorPassword123!'
    });
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [invigilatorUser.userId, 'INVIGILATOR']);
    invigilatorToken = await loginAndGetToken(invigilatorUser.email, 'InvigilatorPassword123!');

    // 5. Create Developer
    developerUser = await authService.register({
      name: `Developer Sec ${testRunId}`,
      email: `developer_sec_${testRunId}@university.edu`,
      password: 'DeveloperPassword123!'
    });
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [developerUser.userId, 'DEVELOPER']);
    developerToken = await loginAndGetToken(developerUser.email, 'DeveloperPassword123!');
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });

  // =========================================================================
  // REQUIRED 20-TEST SECURITY MATRIX
  // =========================================================================

  describe('Security Matrix (20 Authoritative Cases)', () => {
    // 1. Student cannot create accounts
    it('1. Student cannot create accounts', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          name: 'Hacker Student',
          email: `hack1_${testRunId}@test.com`,
          role: 'STUDENT',
          identifier: 'USN-HACK'
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    // 2. Faculty cannot create accounts
    it('2. Faculty cannot create accounts', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          name: 'Faculty Created',
          email: `hack2_${testRunId}@test.com`,
          role: 'STUDENT',
          identifier: 'USN-FAC-HACK'
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    // 3. Invigilator cannot create accounts
    it('3. Invigilator cannot create accounts', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${invigilatorToken}`)
        .send({
          name: 'Invigilator Created',
          email: `hack3_${testRunId}@test.com`,
          role: 'STUDENT',
          identifier: 'USN-INV-HACK'
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    // 4. Developer cannot create accounts
    it('4. Developer cannot create accounts', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          name: 'Developer Created',
          email: `hack4_${testRunId}@test.com`,
          role: 'STUDENT',
          identifier: 'USN-DEV-HACK'
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    // 5. Only Admin can create accounts
    it('5. Only Admin can create accounts', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Admin Created Candidate',
          email: `admin_created_${testRunId}@university.edu`,
          role: 'STUDENT',
          identifier: `USN-ADM-${testRunId}`
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.user.userId);
      assert.ok(res.body.temporaryPassword);
      assert.equal(res.body.user.status, 'ACTIVE');
      assert.equal(res.body.user.verificationStatus, 'UNVERIFIED');
      assert.equal(res.body.user.mustChangePassword, true);
    });

    // 6. Unverified Student blocked from operational access
    it('6. Unverified Student blocked from operational access', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Unverified Student 6',
        email: `unv_stu_6_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-UNV6-${testRunId}`,
        actorUserId: adminUser.userId
      });

      // Change password so must_change_password=false, but verification remains UNVERIFIED
      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      const token = await loginAndGetToken(user.email, 'PermanentPassword123!');
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ONBOARDING_REQUIRED');
    });

    // 7. Unverified Faculty blocked from operational access
    it('7. Unverified Faculty blocked from operational access', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Unverified Faculty 7',
        email: `unv_fac_7_${testRunId}@university.edu`,
        role: 'FACULTY',
        identifier: `EMP-UNV7-${testRunId}`,
        actorUserId: adminUser.userId
      });

      // Change password so must_change_password=false, but verification remains UNVERIFIED
      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      const token = await loginAndGetToken(user.email, 'PermanentPassword123!');
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ONBOARDING_REQUIRED');
    });

    // 8. Pending Student blocked
    it('8. Pending Student blocked', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Pending Student 8',
        email: `pnd_stu_8_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-PND8-${testRunId}`,
        actorUserId: adminUser.userId
      });

      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: { department: 'Computer Science', semester: 2 }
      });

      const token = await loginAndGetToken(user.email, 'PermanentPassword123!');
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'VERIFICATION_PENDING');
    });

    // 9. Pending Faculty blocked
    it('9. Pending Faculty blocked', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Pending Faculty 9',
        email: `pnd_fac_9_${testRunId}@university.edu`,
        role: 'FACULTY',
        identifier: `EMP-PND9-${testRunId}`,
        actorUserId: adminUser.userId
      });

      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: { department: 'Computer Science', designation: 'Assistant Professor' }
      });

      const token = await loginAndGetToken(user.email, 'PermanentPassword123!');
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'VERIFICATION_PENDING');
    });

    // 10. Rejected Student blocked
    it('10. Rejected Student blocked', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Rejected Student 10',
        email: `rej_stu_10_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-REJ10-${testRunId}`,
        actorUserId: adminUser.userId
      });

      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: { department: 'CS', semester: 1 }
      });

      await userService.reviewVerificationStatus({
        targetUserId: user.userId,
        decision: 'REJECTED',
        reviewNotes: 'Department does not match registration records',
        actorUserId: adminUser.userId
      });

      const token = await loginAndGetToken(user.email, 'PermanentPassword123!');
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'VERIFICATION_REJECTED');
    });

    // 11. Rejected Faculty blocked
    it('11. Rejected Faculty blocked', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Rejected Faculty 11',
        email: `rej_fac_11_${testRunId}@university.edu`,
        role: 'FACULTY',
        identifier: `EMP-REJ11-${testRunId}`,
        actorUserId: adminUser.userId
      });

      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: { department: 'CS', designation: 'Instructor' }
      });

      await userService.reviewVerificationStatus({
        targetUserId: user.userId,
        decision: 'REJECTED',
        reviewNotes: 'Invalid Employee ID provided',
        actorUserId: adminUser.userId
      });

      const token = await loginAndGetToken(user.email, 'PermanentPassword123!');
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'VERIFICATION_REJECTED');
    });

    // 12. Verified Student can access operational route
    it('12. Verified Student can access operational route', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Verified Student 12',
        email: `ver_stu_12_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-VER12-${testRunId}`,
        actorUserId: adminUser.userId
      });

      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: { department: 'CS', semester: 2 }
      });

      await userService.reviewVerificationStatus({
        targetUserId: user.userId,
        decision: 'VERIFIED',
        reviewNotes: 'All academic credentials confirmed',
        actorUserId: adminUser.userId
      });

      const token = await loginAndGetToken(user.email, 'PermanentPassword123!');
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 200);
    });

    // 13. Verified Faculty can access operational route
    it('13. Verified Faculty can access operational route', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Verified Faculty 13',
        email: `ver_fac_13_${testRunId}@university.edu`,
        role: 'FACULTY',
        identifier: `EMP-VER13-${testRunId}`,
        actorUserId: adminUser.userId
      });

      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: { department: 'Computer Science', designation: 'Professor' }
      });

      await userService.reviewVerificationStatus({
        targetUserId: user.userId,
        decision: 'VERIFIED',
        reviewNotes: 'Faculty credentials verified',
        actorUserId: adminUser.userId
      });

      const token = await loginAndGetToken(user.email, 'PermanentPassword123!');
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 200);
    });

    // 14. Temporary password forces password change
    it('14. Temporary password forces password change', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Forced PW Candidate 14',
        email: `force_pw_14_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-FORCE14-${testRunId}`,
        actorUserId: adminUser.userId
      });

      const tempToken = await loginAndGetToken(user.email, temporaryPassword);

      // Operational route blocked
      const blockedRes = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${tempToken}`);

      assert.equal(blockedRes.status, 403);
      assert.equal(blockedRes.body.error.code, 'PASSWORD_CHANGE_REQUIRED');

      // Password change succeeds
      const changeRes = await request(app)
        .post('/api/v1/users/me/first-login/change-password')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({
          currentPassword: temporaryPassword,
          newPassword: 'NewSecurePassword123!'
        });

      assert.equal(changeRes.status, 200);
      assert.equal(changeRes.body.mustChangePassword, false);
    });

    // 15. Temporary password is invalid after successful password change
    it('15. Temporary password is invalid after successful password change', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Invalid Temp Candidate 15',
        email: `inv_temp_15_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-INV15-${testRunId}`,
        actorUserId: adminUser.userId
      });

      const tempToken = await loginAndGetToken(user.email, temporaryPassword);

      await request(app)
        .post('/api/v1/users/me/first-login/change-password')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({
          currentPassword: temporaryPassword,
          newPassword: 'NewPermanentPassword123!'
        });

      // Login with old temporary password MUST fail
      const failedLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: temporaryPassword
        });

      assert.equal(failedLogin.status, 401);
      assert.equal(failedLogin.body.error.code, 'UNAUTHORIZED');

      // Login with new permanent password MUST succeed
      const successfulLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'NewPermanentPassword123!'
        });

      assert.equal(successfulLogin.status, 200);
      assert.ok(successfulLogin.body.data?.accessToken || successfulLogin.body.accessToken);
    });

    // 16. Password hash is never exposed
    it('16. Password hash is never exposed', async () => {
      const resDetail = await request(app)
        .get(`/api/v1/admin/users/${studentUser.userId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(resDetail.status, 200);
      assert.equal(resDetail.body.user.password_hash, undefined);
      assert.equal(resDetail.body.user.passwordHash, undefined);

      const resList = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(resList.status, 200);
      for (const u of resList.body.users) {
        assert.equal(u.password_hash, undefined);
        assert.equal(u.passwordHash, undefined);
      }
    });

    // 17. Plaintext password is never persisted
    it('17. Plaintext password is never persisted', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Plaintext Check User 17',
        email: `plain_chk_17_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-PLAIN17-${testRunId}`,
        actorUserId: adminUser.userId
      });

      // Verify PostgreSQL stores only bcrypt hash
      const dbRes = await query('SELECT password_hash FROM users WHERE user_id = $1', [user.userId]);
      assert.ok(dbRes.rows.length > 0);
      const storedHash = dbRes.rows[0].password_hash;
      assert.notEqual(storedHash, temporaryPassword);
      assert.ok(storedHash.startsWith('$2b$'));

      // Verify audit logs table does not contain temporary password
      const auditRes = await query(
        `SELECT metadata FROM audit_logs WHERE resource_id = $1 AND action = 'USER_CREATED'`,
        [user.userId]
      );
      assert.ok(auditRes.rows.length > 0);
      const metadataStr = JSON.stringify(auditRes.rows[0].metadata);
      assert.equal(metadataStr.includes(temporaryPassword), false);
    });

    // 18. Identity/profile data is correctly scoped and does not expose unrelated sensitive data
    it('18. Identity/profile data is correctly scoped and does not expose unrelated sensitive data', async () => {
      const res = await request(app)
        .get('/api/v1/users/me/onboarding-status')
        .set('Authorization', `Bearer ${studentToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.userId);
      assert.ok(res.body.email);
      assert.ok(res.body.roles);
      assert.equal(res.body.password_hash, undefined);
      assert.equal(res.body.passwordHash, undefined);
      assert.equal(res.body.refreshTokenHash, undefined);
      assert.equal(res.body.refresh_token_hash, undefined);
    });

    // 19. Admin verification action is audited
    it('19. Admin verification action is audited', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Audit Verification User 19',
        email: `aud_ver_19_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-AUD19-${testRunId}`,
        actorUserId: adminUser.userId
      });

      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: { department: 'Math', semester: 4 }
      });

      // Admin executes verification review
      await userService.reviewVerificationStatus({
        targetUserId: user.userId,
        decision: 'VERIFIED',
        reviewNotes: 'Transcript verified by registrar',
        actorUserId: adminUser.userId
      });

      // Query audit logs table directly
      const auditRes = await query(
        `SELECT * FROM audit_logs WHERE resource_id = $1 AND action = 'ADMIN_VERIFICATION_VERIFIED'`,
        [user.userId]
      );

      assert.ok(auditRes.rows.length > 0);
      assert.equal(auditRes.rows[0].actor_user_id, adminUser.userId);
      assert.equal(auditRes.rows[0].metadata?.reviewNotes, 'Transcript verified by registrar');
    });

    // 20. Direct API calls cannot bypass onboarding/verification gating
    it('20. Direct API calls cannot bypass onboarding/verification gating', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Direct Bypass Attacker 20',
        email: `bypass_20_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-BYP20-${testRunId}`,
        actorUserId: adminUser.userId
      });

      const bypassToken = await loginAndGetToken(user.email, temporaryPassword);

      // Attempting direct POST to /api/v1/exams must be rejected with 403
      const examRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${bypassToken}`)
        .send({ title: 'Illegal Unauthorized Exam' });

      assert.equal(examRes.status, 403);
      assert.equal(examRes.body.error.code, 'PASSWORD_CHANGE_REQUIRED');

      // Attempting direct GET to /api/v1/sessions must be rejected with 403
      const sessionRes = await request(app)
        .get('/api/v1/sessions')
        .set('Authorization', `Bearer ${bypassToken}`);

      assert.equal(sessionRes.status, 403);
      assert.equal(sessionRes.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
    });
  });

  // =========================================================================
  // SUITE B: SERVER-SIDE IDENTIFIER VALIDATION REGRESSION TESTS (FIX 1)
  // =========================================================================

  describe('Server-Side Required Identifiers Regression (Fix 1)', () => {
    it('1. ADMIN creating STUDENT without identifier -> rejected', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Student Without Identifier',
          email: `no_id_stu_${testRunId}@university.edu`,
          role: 'STUDENT'
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error.message, /USN \/ Enrollment Number is required/i);
    });

    it('2. ADMIN creating FACULTY without identifier -> rejected', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Faculty Without Identifier',
          email: `no_id_fac_${testRunId}@university.edu`,
          role: 'FACULTY'
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error.message, /Employee \/ Faculty ID is required/i);
    });

    it('3. Whitespace-only identifier -> rejected', async () => {
      const stuRes = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Whitespace Identifier Student',
          email: `ws_stu_${testRunId}@university.edu`,
          role: 'STUDENT',
          identifier: '    '
        });

      assert.equal(stuRes.status, 400);
      assert.equal(stuRes.body.success, false);
      assert.match(stuRes.body.error.message, /USN \/ Enrollment Number is required/i);

      const facRes = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Whitespace Identifier Faculty',
          email: `ws_fac_${testRunId}@university.edu`,
          role: 'FACULTY',
          identifier: '    '
        });

      assert.equal(facRes.status, 400);
      assert.equal(facRes.body.success, false);
      assert.match(facRes.body.error.message, /Employee \/ Faculty ID is required/i);
    });

    it('4. Valid STUDENT identifier -> succeeds', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Valid Identifier Student',
          email: `valid_stu_${testRunId}@university.edu`,
          role: 'STUDENT',
          identifier: `USN-VAL-${testRunId}`
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.user.userId);
      assert.equal(res.body.user.identifier, `USN-VAL-${testRunId}`);
    });

    it('5. Valid FACULTY identifier -> succeeds', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Valid Identifier Faculty',
          email: `valid_fac_${testRunId}@university.edu`,
          role: 'FACULTY',
          identifier: `EMP-VAL-${testRunId}`
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.user.userId);
      assert.equal(res.body.user.identifier, `EMP-VAL-${testRunId}`);
    });
  });

  // =========================================================================
  // SUITE C: ADMIN SELF-DEMOTION & LAST-ADMIN PROTECTION (FIX 2)
  // =========================================================================

  describe('Admin Self-Demotion & Last-Admin Protection Regression (Fix 2)', () => {
    it('1. Sole ADMIN cannot revoke own ADMIN role', async () => {
      // In a scenario where adminUser is the actor and target
      await assert.rejects(
        () =>
          userService.revokeRoleFromUser({
            targetUserId: adminUser.userId,
            role: 'ADMIN',
            actorUserId: adminUser.userId
          }),
        (err) => err instanceof DomainInvariantError && /cannot revoke their own ADMIN role/i.test(err.message)
      );
    });

    it('2. ADMIN with another active ADMIN still cannot revoke own ADMIN role', async () => {
      // Create a second active admin
      const secondAdmin = await authService.register({
        name: `Second Admin ${testRunId}`,
        email: `admin2_${testRunId}@university.edu`,
        password: 'AdminPassword123!'
      });
      await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [secondAdmin.userId, 'ADMIN']);

      const adminCount = await userRepo.countActiveAdmins();
      assert.ok(adminCount >= 2);

      // Even with 2 active admins, adminUser STILL cannot revoke their own ADMIN role
      await assert.rejects(
        () =>
          userService.revokeRoleFromUser({
            targetUserId: adminUser.userId,
            role: 'ADMIN',
            actorUserId: adminUser.userId
          }),
        (err) => err instanceof DomainInvariantError && /cannot revoke their own ADMIN role/i.test(err.message)
      );
    });

    it('3. ADMIN can revoke ADMIN role from another user when doing so does not violate last-admin protection', async () => {
      // Create a third admin that will have their ADMIN role revoked by adminUser
      const thirdAdmin = await authService.register({
        name: `Third Admin ${testRunId}`,
        email: `admin3_${testRunId}@university.edu`,
        password: 'AdminPassword123!'
      });
      await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [thirdAdmin.userId, 'ADMIN']);

      const beforeCount = await userRepo.countActiveAdmins();
      assert.ok(beforeCount >= 2);

      // adminUser revokes ADMIN role from thirdAdmin (non-self)
      const updated = await userService.revokeRoleFromUser({
        targetUserId: thirdAdmin.userId,
        role: 'ADMIN',
        actorUserId: adminUser.userId
      });

      assert.equal(updated.roles.includes('ADMIN'), false);

      const afterCount = await userRepo.countActiveAdmins();
      assert.equal(afterCount, beforeCount - 1);
    });

    it('4. ADMIN can still modify non-self users normally', async () => {
      // Admin modifies non-self user status
      const res = await userService.changeAccountStatus({
        targetUserId: studentUser.userId,
        newStatus: 'ACTIVE',
        reason: 'Administrative maintenance',
        actorUserId: adminUser.userId
      });

      assert.equal(res.status, 'ACTIVE');
    });

    it('5. API path returns the expected domain/security error on self-demotion', async () => {
      // Executing DELETE /api/v1/admin/users/:adminId/roles/ADMIN using admin's own token
      const res = await request(app)
        .delete(`/api/v1/admin/users/${adminUser.userId}/roles/ADMIN`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'DOMAIN_INVARIANT_VIOLATION');
      assert.match(res.body.error.message, /cannot revoke their own ADMIN role/i);
    });
  });
});
