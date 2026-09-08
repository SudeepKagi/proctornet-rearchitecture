/**
 * @file userRepository.test.js
 * @description Level 2 integration tests for user administration repository queries.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import * as userRepo from '../../src/modules/users/user.repository.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';

describe('User Repository (Level 2 Integration Tests)', () => {
  const testRunId = Date.now();
  let studentUser;
  let facultyUser;

  before(async () => {
    const passwordHash = await bcrypt.hash('TempPassword123!', 10);

    // 1. Create minimal student
    studentUser = await userRepo.createMinimalUser({
      name: `Student Tester ${testRunId}`,
      email: `student_${testRunId}@university.edu`,
      phone: '+1234567890',
      passwordHash,
      role: 'STUDENT',
      identifier: `USN-${testRunId}`
    });

    // 2. Create minimal faculty
    facultyUser = await userRepo.createMinimalUser({
      name: `Faculty Tester ${testRunId}`,
      email: `faculty_${testRunId}@university.edu`,
      phone: '+1987654321',
      passwordHash,
      role: 'FACULTY',
      identifier: `EMP-${testRunId}`
    });
  });

  it('creates minimal user with ACTIVE status, UNVERIFIED verification, and must_change_password=TRUE', () => {
    assert.ok(studentUser.userId);
    assert.equal(studentUser.status, 'ACTIVE');
    assert.equal(studentUser.verificationStatus, 'UNVERIFIED');
    assert.equal(studentUser.mustChangePassword, true);
    assert.deepEqual(studentUser.roles, ['STUDENT']);
    assert.equal(studentUser.identifier, `USN-${testRunId}`);
  });

  it('finds detailed user by user_id with profile', async () => {
    const detail = await userRepo.findUserDetailById(studentUser.userId);
    assert.ok(detail);
    assert.equal(detail.userId, studentUser.userId);
    assert.equal(detail.email, studentUser.email);
    assert.equal(detail.studentProfile?.enrollmentNumber, `USN-${testRunId}`);
    assert.equal(detail.studentProfile?.department, null); // Initially null
    assert.equal(detail.studentProfile?.semester, null); // Initially null
  });

  it('updates student profile during onboarding', async () => {
    await userRepo.updateStudentOnboardingProfile(studentUser.userId, {
      department: 'Computer Science',
      semester: 4,
      phone: '+1122334455',
      metadata: { onboardingComplete: true }
    });

    const detail = await userRepo.findUserDetailById(studentUser.userId);
    assert.equal(detail.studentProfile.department, 'Computer Science');
    assert.equal(detail.studentProfile.semester, 4);
    assert.equal(detail.phone, '+1122334455');
  });

  it('updates verification status and review notes', async () => {
    await userRepo.updateVerificationStatus(
      studentUser.userId,
      'PENDING',
      null
    );
    let detail = await userRepo.findUserDetailById(studentUser.userId);
    assert.equal(detail.verificationStatus, 'PENDING');

    await userRepo.updateVerificationStatus(
      studentUser.userId,
      'VERIFIED',
      'Approved after enrollment verification'
    );
    detail = await userRepo.findUserDetailById(studentUser.userId);
    assert.equal(detail.verificationStatus, 'VERIFIED');
    assert.equal(detail.verificationNotes, 'Approved after enrollment verification');
  });

  it('updates user status to SUSPENDED with reason', async () => {
    const updated = await userRepo.updateUserStatus(
      facultyUser.userId,
      'SUSPENDED',
      'Academic integrity review'
    );
    assert.equal(updated.status, 'SUSPENDED');
    assert.equal(updated.status_reason, 'Academic integrity review');

    const detail = await userRepo.findUserDetailById(facultyUser.userId);
    assert.equal(detail.status, 'SUSPENDED');
  });

  it('searches users by email or name with pagination', async () => {
    const result = await userRepo.findUsers(
      { search: `student_${testRunId}` },
      { limit: 10, offset: 0 },
      { sort_by: 'created_at', sort_order: 'desc' }
    );
    assert.ok(result.length >= 1);
    assert.equal(result[0].userId, studentUser.userId);
  });

  it('counts active administrators accurately', async () => {
    const adminCount = await userRepo.countActiveAdmins();
    assert.ok(typeof adminCount === 'number');
    assert.ok(adminCount >= 0);
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });
});
