/**
 * @file userService.test.js
 * @description Level 2 integration tests for user administration business service.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as userService from '../../src/modules/users/user.service.js';
import * as userRepo from '../../src/modules/users/user.repository.js';
import * as authRepo from '../../src/modules/auth/auth.repository.js';
import { closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { DomainInvariantError } from '../../src/domain/shared/domainErrors.js';
import { BadRequestError, ConflictError } from '../../src/utils/errors.js';

describe('User Service (Level 2 Integration Tests)', () => {
  const testRunId = Date.now();
  let adminUserId;

  before(async () => {
    // Seed an admin user for audit and authorization
    const adminUser = await userService.createSingleUser({
      name: `Admin Tester ${testRunId}`,
      email: `admin_${testRunId}@university.edu`,
      role: 'ADMIN',
      actorUserId: null
    });
    adminUserId = adminUser.user.userId;
  });

  describe('Single User Provisioning', () => {
    it('creates a student account with temporary password and initial unverified state', async () => {
      const email = `stu_prov_${testRunId}@university.edu`;
      const result = await userService.createSingleUser({
        name: 'New Candidate',
        email,
        role: 'STUDENT',
        identifier: `USN-PROV-${testRunId}`,
        actorUserId: adminUserId
      });

      assert.ok(result.user.userId);
      assert.equal(result.user.status, 'ACTIVE');
      assert.equal(result.user.verificationStatus, 'UNVERIFIED');
      assert.equal(result.user.mustChangePassword, true);
      assert.ok(result.temporaryPassword);
      assert.equal(result.temporaryPassword.length, 16);

      // Verify plaintext password is NOT in database
      const rawUser = await authRepo.findUserByEmail(email);
      assert.notEqual(rawUser.password_hash, result.temporaryPassword);
      assert.ok(rawUser.password_hash.startsWith('$2b$'));
    });

    it('rejects duplicate email creation', async () => {
      const email = `dup_${testRunId}@university.edu`;
      await userService.createSingleUser({
        name: 'First User',
        email,
        role: 'STUDENT',
        identifier: `USN-DUP1-${testRunId}`,
        actorUserId: adminUserId
      });

      await assert.rejects(
        () =>
          userService.createSingleUser({
            name: 'Second User',
            email,
            role: 'STUDENT',
            identifier: `USN-DUP2-${testRunId}`,
            actorUserId: adminUserId
          }),
        (err) => err instanceof ConflictError
      );
    });
  });

  describe('Account Status Governance & Session Revocation', () => {
    it('suspends an active user and revokes their active sessions', async () => {
      const { user } = await userService.createSingleUser({
        name: 'Suspended Candidate',
        email: `suspend_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-SUS-${testRunId}`,
        actorUserId: adminUserId
      });

      // Create dummy session
      await authRepo.createSession({
        userId: user.userId,
        refreshTokenHash: `dummy-hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000)
      });

      const result = await userService.changeAccountStatus({
        targetUserId: user.userId,
        newStatus: 'SUSPENDED',
        reason: 'Violation of examination policies',
        actorUserId: adminUserId
      });

      assert.equal(result.status, 'SUSPENDED');
      assert.equal(result.statusReason, 'Violation of examination policies');

      // Verify sessions revoked in DB
      const detail = await userRepo.findUserDetailById(user.userId);
      assert.equal(detail.activeSessionsCount, 0);
    });

    it('prevents self-suspension by administrator', async () => {
      await assert.rejects(
        () =>
          userService.changeAccountStatus({
            targetUserId: adminUserId,
            newStatus: 'SUSPENDED',
            reason: 'Accidental self-suspension',
            actorUserId: adminUserId
          }),
        (err) => err instanceof DomainInvariantError
      );
    });
  });

  describe('First-Login Onboarding Lifecycle', () => {
    it('executes password change, profile onboarding, and transitions to PENDING', async () => {
      // 1. Admin provisions user
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Onboard Student',
        email: `onboard_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-ONB-${testRunId}`,
        actorUserId: adminUserId
      });

      // 2. Student attempts onboarding BEFORE password change -> Rejected!
      await assert.rejects(
        () =>
          userService.submitOnboardingProfile({
            userId: user.userId,
            profileData: { department: 'CS', semester: 3 }
          }),
        (err) => err instanceof DomainInvariantError
      );

      // 3. Student changes temporary password
      const pwResult = await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'MyNewPermanentPassword123!'
      });
      assert.equal(pwResult.success, true);
      assert.equal(pwResult.mustChangePassword, false);

      // 4. Student submits academic onboarding
      const onboardedUser = await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: {
          department: 'Computer Science',
          semester: 5,
          phone: '+919876543210'
        }
      });
      assert.equal(onboardedUser.verificationStatus, 'PENDING');
      assert.equal(onboardedUser.studentProfile.department, 'Computer Science');
      assert.equal(onboardedUser.studentProfile.semester, 5);

      // 5. Admin reviews and approves onboarding
      const approved = await userService.reviewVerificationStatus({
        targetUserId: user.userId,
        decision: 'VERIFIED',
        reviewNotes: 'Identity confirmed against university registrar',
        actorUserId: adminUserId
      });
      assert.equal(approved.verificationStatus, 'VERIFIED');
      assert.equal(approved.verificationNotes, 'Identity confirmed against university registrar');
    });

    it('requires mandatory review notes when rejecting onboarding', async () => {
      const { user, temporaryPassword } = await userService.createSingleUser({
        name: 'Reject Student',
        email: `reject_${testRunId}@university.edu`,
        role: 'STUDENT',
        identifier: `USN-REJ-${testRunId}`,
        actorUserId: adminUserId
      });

      await userService.changeFirstLoginPassword({
        userId: user.userId,
        currentPassword: temporaryPassword,
        newPassword: 'PermanentPassword123!'
      });

      await userService.submitOnboardingProfile({
        userId: user.userId,
        profileData: { department: 'Mechanical', semester: 2 }
      });

      // Attempt reject without review notes -> Fails
      await assert.rejects(
        () =>
          userService.reviewVerificationStatus({
            targetUserId: user.userId,
            decision: 'REJECTED',
            reviewNotes: '',
            actorUserId: adminUserId
          }),
        (err) => err instanceof BadRequestError
      );

      // Reject with review notes -> Succeeds
      const rejected = await userService.reviewVerificationStatus({
        targetUserId: user.userId,
        decision: 'REJECTED',
        reviewNotes: 'USN does not match the department roster. Please correct your department.',
        actorUserId: adminUserId
      });
      assert.equal(rejected.verificationStatus, 'REJECTED');
      assert.ok(rejected.verificationNotes.includes('USN does not match'));
    });
  });

  describe('Bulk User Spreadsheet Ingestion', () => {
    it('imports student roster in resilient mode, reporting errors and returning credentials only for committed rows', async () => {
      const csvContent = [
        'USN,Name,Email,Phone',
        `USN-BK1-${testRunId},Bulk Candidate 1,bulk1_${testRunId}@university.edu,+1234567890`,
        `USN-BK2-${testRunId},Bulk Candidate 2,invalid-email-address,+1234567891`,
        `USN-BK3-${testRunId},Bulk Candidate 3,bulk3_${testRunId}@university.edu,+1234567892`
      ].join('\n');
      const buffer = Buffer.from(csvContent, 'utf-8');

      const result = await userService.bulkImportUsers({
        fileBuffer: buffer,
        defaultRole: 'STUDENT',
        atomic: false,
        actorUserId: adminUserId
      });

      assert.equal(result.summary.total, 3);
      assert.equal(result.summary.created, 2);
      assert.equal(result.summary.failed, 1);
      assert.equal(result.credentials.length, 2);
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0].error, /Invalid email address/);

      // Verify credentials match committed accounts
      assert.equal(result.credentials[0].email, `bulk1_${testRunId}@university.edu`);
      assert.equal(result.credentials[1].email, `bulk3_${testRunId}@university.edu`);
    });

    it('rolls back entire batch in atomic mode if any row is invalid', async () => {
      const csvContent = [
        'USN,Name,Email',
        `USN-AT1-${testRunId},Atomic User 1,at1_${testRunId}@university.edu`,
        `USN-AT2-${testRunId},Atomic User 2,invalid-email`
      ].join('\n');
      const buffer = Buffer.from(csvContent, 'utf-8');

      const result = await userService.bulkImportUsers({
        fileBuffer: buffer,
        defaultRole: 'STUDENT',
        atomic: true,
        actorUserId: adminUserId
      });

      assert.equal(result.summary.created, 0);
      assert.equal(result.credentials.length, 0); // Zero credentials issued for rolled back rows!
      assert.ok(result.errors.length > 0);

      // Verify row 1 was NOT inserted into DB
      const user = await authRepo.findUserByEmail(`at1_${testRunId}@university.edu`);
      assert.equal(user, null);
    });
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });
});
