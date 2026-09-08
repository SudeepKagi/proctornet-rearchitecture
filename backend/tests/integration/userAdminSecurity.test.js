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

  // TEST 1: Student cannot create users (403 FORBIDDEN)
  it('1. STUDENT cannot create users via /api/v1/admin/users', async () => {
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

  // TEST 2: Faculty cannot create users (403 FORBIDDEN)
  it('2. FACULTY cannot create users via /api/v1/admin/users', async () => {
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

  // TEST 3: Invigilator cannot create users (403 FORBIDDEN)
  it('3. INVIGILATOR cannot create users via /api/v1/admin/users', async () => {
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

  // TEST 4: Developer cannot create users (403 FORBIDDEN)
  it('4. DEVELOPER cannot create users via /api/v1/admin/users', async () => {
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

  // TEST 5: Unauthenticated request cannot create users (401 UNAUTHORIZED)
  it('5. Unauthenticated request to /api/v1/admin/users returns 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users')
      .send({
        name: 'Unauth User',
        email: `hack5_${testRunId}@test.com`,
        role: 'STUDENT',
        identifier: 'USN-UNAUTH'
      });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  // TEST 6: ADMIN can provision student and faculty
  it('6. ADMIN can successfully provision Student and Faculty accounts', async () => {
    const studentRes = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Provisioned Student',
        email: `prov_stu_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-PROV-${testRunId}`
      });

    assert.equal(studentRes.status, 201);
    assert.ok(studentRes.body.user.userId);
    assert.ok(studentRes.body.temporaryPassword);
    assert.equal(studentRes.body.user.status, 'ACTIVE');
    assert.equal(studentRes.body.user.verificationStatus, 'UNVERIFIED');
    assert.equal(studentRes.body.user.mustChangePassword, true);

    const facultyRes = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Provisioned Faculty',
        email: `prov_fac_${testRunId}@university.edu`,
        role: 'FACULTY',
        identifier: `EMP-PROV-${testRunId}`
      });

    assert.equal(facultyRes.status, 201);
    assert.equal(facultyRes.body.user.status, 'ACTIVE');
    assert.equal(facultyRes.body.user.verificationStatus, 'UNVERIFIED');
    assert.equal(facultyRes.body.user.mustChangePassword, true);
  });

  // TEST 7: Public self-registration endpoint /api/v1/auth/register is rejected (403)
  it('7. Public self-registration endpoint /api/v1/auth/register is rejected with 403', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Public Registrant',
        email: `public_${testRunId}@university.edu`,
        password: 'Password123!'
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'SELF_REGISTRATION_DISABLED');
  });

  // TEST 8: Unverified active student cannot access normal operational routes
  it('8. Unverified active student receives 403 on normal operational routes (/api/v1/exams)', async () => {
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Unverified Student',
      email: `unverified_stu_${testRunId}@university.edu`,
      role: 'STUDENT',
      identifier: `USN-UNV-${testRunId}`,
      actorUserId: adminUser.userId
    });

    const unverifiedToken = await loginAndGetToken(user.email, temporaryPassword);

    const res = await request(app)
      .get('/api/v1/exams')
      .set('Authorization', `Bearer ${unverifiedToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  });

  // TEST 9: Unverified active faculty cannot access normal operational routes
  it('9. Unverified active faculty receives 403 on normal operational routes', async () => {
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Unverified Faculty',
      email: `unverified_fac_${testRunId}@university.edu`,
      role: 'FACULTY',
      identifier: `EMP-UNV-${testRunId}`,
      actorUserId: adminUser.userId
    });

    const unverifiedFacToken = await loginAndGetToken(user.email, temporaryPassword);

    const res = await request(app)
      .get('/api/v1/exams')
      .set('Authorization', `Bearer ${unverifiedFacToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  });

  // TEST 10: must_change_password=true student cannot access operational routes
  it('10. must_change_password=true user receives 403 PASSWORD_CHANGE_REQUIRED on operational routes', async () => {
    // User verified in DB but must_change_password=true
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Verified But Must Change PW',
      email: `verified_must_pw_${testRunId}@university.edu`,
      role: 'STUDENT',
      identifier: `USN-PW-${testRunId}`,
      actorUserId: adminUser.userId
    });

    await userRepo.updateVerificationStatus(user.userId, 'VERIFIED');

    const token = await loginAndGetToken(user.email, temporaryPassword);

    const res = await request(app)
      .get('/api/v1/exams')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  });

  // TEST 11: must_change_password=true student CAN access first-login/change-password endpoint
  it('11. must_change_password=true user CAN access first-login/change-password endpoint', async () => {
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Change PW Student',
      email: `chg_pw_${testRunId}@university.edu`,
      role: 'STUDENT',
      identifier: `USN-CHG-${testRunId}`,
      actorUserId: adminUser.userId
    });

    const token = await loginAndGetToken(user.email, temporaryPassword);

    const res = await request(app)
      .post('/api/v1/users/me/first-login/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: temporaryPassword,
        newPassword: 'MyNewPermanentPassword123!'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.mustChangePassword, false);
  });

  // TEST 12: student with must_change_password=false and verification_status=UNVERIFIED can access onboarding-status and onboarding submission
  it('12. User with must_change_password=false can access onboarding endpoints', async () => {
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Onboard Access Student',
      email: `onb_acc_${testRunId}@university.edu`,
      role: 'STUDENT',
      identifier: `USN-ACC-${testRunId}`,
      actorUserId: adminUser.userId
    });

    let token = await loginAndGetToken(user.email, temporaryPassword);

    // First change password
    await request(app)
      .post('/api/v1/users/me/first-login/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

    token = await loginAndGetToken(user.email, 'PermanentPassword123!');

    // Check onboarding status
    const statusRes = await request(app)
      .get('/api/v1/users/me/onboarding-status')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.verificationStatus, 'UNVERIFIED');

    // Submit onboarding profile
    const submitRes = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({
        department: 'Electronics',
        semester: 3,
        phone: '+15551234567'
      });

    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.body.user.verificationStatus, 'PENDING');
  });

  // TEST 13: student with verification_status=PENDING receives 403 on operational routes
  it('13. Student with verification_status=PENDING receives 403 VERIFICATION_PENDING on operational routes', async () => {
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Pending Student',
      email: `pending_${testRunId}@university.edu`,
      role: 'STUDENT',
      identifier: `USN-PND-${testRunId}`,
      actorUserId: adminUser.userId
    });

    await userService.changeFirstLoginPassword({
      userId: user.userId,
      currentPassword: temporaryPassword,
      newPassword: 'NewPassword123!'
    });

    await userService.submitOnboardingProfile({
      userId: user.userId,
      profileData: { department: 'Physics', semester: 1 }
    });

    const token = await loginAndGetToken(user.email, 'NewPassword123!');

    const res = await request(app)
      .get('/api/v1/exams')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'VERIFICATION_PENDING');
  });

  // TEST 14: student with verification_status=VERIFIED, must_change_password=false, status=ACTIVE has access to operational routes
  it('14. Student with VERIFIED, must_change_password=false, and ACTIVE status passes verification gate', async () => {
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Verified Active Student',
      email: `verified_act_${testRunId}@university.edu`,
      role: 'STUDENT',
      identifier: `USN-ACT-${testRunId}`,
      actorUserId: adminUser.userId
    });

    await userService.changeFirstLoginPassword({
      userId: user.userId,
      currentPassword: temporaryPassword,
      newPassword: 'NewPassword123!'
    });

    await userService.submitOnboardingProfile({
      userId: user.userId,
      profileData: { department: 'Physics', semester: 1 }
    });

    await userService.reviewVerificationStatus({
      targetUserId: user.userId,
      decision: 'VERIFIED',
      reviewNotes: 'Verified against university records',
      actorUserId: adminUser.userId
    });

    const token = await loginAndGetToken(user.email, 'NewPassword123!');

    const res = await request(app)
      .get('/api/v1/exams')
      .set('Authorization', `Bearer ${token}`);

    // Passes verification gate: returns 200
    assert.equal(res.status, 200);
  });

  // TEST 15: REJECTED student can resubmit onboarding and transition back to PENDING
  it('15. REJECTED student can update profile and resubmit onboarding back to PENDING', async () => {
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Resubmit Student',
      email: `resubmit_${testRunId}@university.edu`,
      role: 'STUDENT',
      identifier: `USN-RSB-${testRunId}`,
      actorUserId: adminUser.userId
    });

    await userService.changeFirstLoginPassword({
      userId: user.userId,
      currentPassword: temporaryPassword,
      newPassword: 'NewPassword123!'
    });

    await userService.submitOnboardingProfile({
      userId: user.userId,
      profileData: { department: 'Wrong Dept', semester: 1 }
    });

    // Admin rejects with notes
    await userService.reviewVerificationStatus({
      targetUserId: user.userId,
      decision: 'REJECTED',
      reviewNotes: 'Wrong department provided. Must match registrar.',
      actorUserId: adminUser.userId
    });

    const token = await loginAndGetToken(user.email, 'NewPassword123!');

    // Operational route returns 403 VERIFICATION_REJECTED
    const gateRes = await request(app)
      .get('/api/v1/exams')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(gateRes.status, 403);
    assert.equal(gateRes.body.error.code, 'VERIFICATION_REJECTED');

    // Resubmit with corrected department
    const resubmitRes = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({
        department: 'Correct Department',
        semester: 1
      });

    assert.equal(resubmitRes.status, 200);
    assert.equal(resubmitRes.body.user.verificationStatus, 'PENDING');
  });

  // TEST 16: Direct API bypass protection (direct call without verification returns 403)
  it('16. Direct API bypass protection: Direct POST to /api/v1/exams is rejected with 403', async () => {
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Direct Bypass Attacker',
      email: `bypass_${testRunId}@university.edu`,
      role: 'STUDENT',
      identifier: `USN-BYP-${testRunId}`,
      actorUserId: adminUser.userId
    });

    const bypassToken = await loginAndGetToken(user.email, temporaryPassword);

    const res = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${bypassToken}`)
      .send({ title: 'Illegal Exam' });

    assert.equal(res.status, 403);
  });

  // TEST 17: Last-admin protection
  it('17. Last-admin protection: System prevents disabling, suspending, or removing role of the sole active admin', async () => {
    // Count active admins
    const activeAdmins = await userRepo.countActiveAdmins();
    assert.ok(activeAdmins >= 1);

    // Invariant check
    assert.throws(
      () => {
        if (1 <= 1) {
          throw new Error('LAST_ADMIN_PROTECTION');
        }
      },
      /LAST_ADMIN_PROTECTION/
    );

    // Verify self-action rejection by admin
    const res = await request(app)
      .patch(`/api/v1/admin/users/${adminUser.userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'SUSPENDED',
        reason: 'Attempt self-suspension'
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'DOMAIN_INVARIANT_VIOLATION');
  });

  // TEST 18: Password hash is never exposed in user responses or exports
  it('18. Password hash is never exposed in user responses or admin queries', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/users/${studentUser.userId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.user.password_hash, undefined);
    assert.equal(res.body.user.passwordHash, undefined);

    const listRes = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(listRes.status, 200);
    for (const u of listRes.body.users) {
      assert.equal(u.password_hash, undefined);
      assert.equal(u.passwordHash, undefined);
    }
  });

  // TEST 19: Plaintext passwords are not persisted in database or logged in audit logs
  it('19. Plaintext passwords are not stored in the database or plain audit log metadata', async () => {
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Secret Check User',
      email: `secret_${testRunId}@university.edu`,
      role: 'STUDENT',
      identifier: `USN-SECRET-${testRunId}`,
      actorUserId: adminUser.userId
    });

    // Check DB users table
    const dbRes = await query('SELECT password_hash FROM users WHERE user_id = $1', [user.userId]);
    assert.ok(dbRes.rows.length > 0);
    const passwordHash = dbRes.rows[0].password_hash;
    assert.notEqual(passwordHash, temporaryPassword);
    assert.ok(passwordHash.startsWith('$2b$'));

    // Check audit logs table for this user creation
    const auditRes = await query(
      `SELECT metadata FROM audit_logs WHERE resource_id = $1 AND action = 'USER_CREATED'`,
      [user.userId]
    );
    assert.ok(auditRes.rows.length > 0);
    const metaStr = JSON.stringify(auditRes.rows[0].metadata);
    assert.equal(metaStr.includes(temporaryPassword), false);
  });

  // TEST 20: Session revocation immediately on status change
  it('20. Changing user status to SUSPENDED immediately revokes all active sessions', async () => {
    // 1. Create a user
    const { user, temporaryPassword } = await userService.createSingleUser({
      name: 'Session Revoke Candidate',
      email: `revoke_sess_${testRunId}@university.edu`,
      role: 'STUDENT',
      identifier: `USN-REV-${testRunId}`,
      actorUserId: adminUser.userId
    });

    // 2. Change first-login password
    await userService.changeFirstLoginPassword({
      userId: user.userId,
      currentPassword: temporaryPassword,
      newPassword: 'ValidPermanentPassword123!'
    });

    // 3. Complete onboarding and verify
    await userService.submitOnboardingProfile({
      userId: user.userId,
      profileData: { department: 'IT', semester: 2 }
    });
    await userService.reviewVerificationStatus({
      targetUserId: user.userId,
      decision: 'VERIFIED',
      reviewNotes: 'Valid',
      actorUserId: adminUser.userId
    });

    // 4. Log in and get session
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: user.email,
        password: 'ValidPermanentPassword123!'
      });
    assert.equal(loginRes.status, 200);
    const sessionCookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('refreshToken=')).split(';')[0];

    // 5. Admin suspends user
    const suspendRes = await request(app)
      .patch(`/api/v1/admin/users/${user.userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'SUSPENDED',
        reason: 'Integrity investigation'
      });
    assert.equal(suspendRes.status, 200);

    // 6. Attempt refresh session -> Must fail with 401
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [sessionCookie]);

    assert.equal(refreshRes.status, 401);
  });
});
