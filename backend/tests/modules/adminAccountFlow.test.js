/**
 * @file adminAccountFlow.test.js
 * @description Unit and integration tests for Admin Account Provisioning Flow:
 * - Admin creates Student account with ONLY USN + email (no name or phone required)
 * - Admin creates Teacher account with ONLY Employee ID + email
 * - Temporary password complexity and generation
 * - Role restrictions on admin user creation endpoint (Student / Teacher only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUserSchema } from '../../src/modules/users/user.schemas.js';
import * as userService from '../../src/modules/users/user.service.js';
import * as userRepo from '../../src/modules/users/user.repository.js';
import * as authRepo from '../../src/modules/auth/auth.repository.js';
import * as auditService from '../../src/modules/audit/audit.service.js';
import { BadRequestError, ConflictError } from '../../src/utils/errors.js';

describe('Admin Account Provisioning Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditService, 'recordAuditEvent').mockResolvedValue({ audit_id: 'mock-audit' });
  });

  describe('1. Validation Schema: createUserSchema', () => {
    it('validates a Student account with ONLY USN + email (no name or phone provided)', () => {
      const payload = {
        email: 'student.test@proctornet.edu',
        role: 'STUDENT',
        identifier: '1MS21CS042'
      };

      const result = createUserSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.email).toBe('student.test@proctornet.edu');
      expect(result.data.role).toBe('STUDENT');
      expect(result.data.identifier).toBe('1MS21CS042');
      expect(result.data.name).toBeUndefined();
      expect(result.data.phone).toBeUndefined();
    });

    it('validates a Teacher account with ONLY Employee ID + email', () => {
      const payload = {
        email: 'teacher.cs@proctornet.edu',
        role: 'FACULTY',
        identifier: 'EMP-CS-101'
      };

      const result = createUserSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.email).toBe('teacher.cs@proctornet.edu');
      expect(result.data.role).toBe('FACULTY');
      expect(result.data.identifier).toBe('EMP-CS-101');
    });

    it('rejects creation if USN is missing for a Student', () => {
      const payload = {
        email: 'student.test@proctornet.edu',
        role: 'STUDENT',
        identifier: '   '
      };

      const result = createUserSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.errors.some((e) => e.message.includes('USN'))).toBe(true);
    });

    it('rejects creation if Employee ID is missing for a Teacher', () => {
      const payload = {
        email: 'teacher.cs@proctornet.edu',
        role: 'FACULTY',
        identifier: ' '
      };

      const result = createUserSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.errors.some((e) => e.message.includes('Employee / Faculty ID'))).toBe(true);
    });

    it('rejects roles other than STUDENT and FACULTY in the everyday admin creation flow', () => {
      const payload = {
        email: 'admin.new@proctornet.edu',
        role: 'ADMIN',
        identifier: 'ADM-01'
      };

      const result = createUserSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('2. Temporary Password Generation', () => {
    it('generates a 16-character complex password', () => {
      const pass = userService.generateTemporaryPassword();
      expect(typeof pass).toBe('string');
      expect(pass.length).toBe(16);
      expect(/[A-Z]/.test(pass)).toBe(true);
      expect(/[a-z]/.test(pass)).toBe(true);
      expect(/[0-9]/.test(pass)).toBe(true);
      expect(/[!@#$%^&*]/.test(pass)).toBe(true);
    });
  });

  describe('3. Service: createSingleUser without name or phone', () => {
    it('creates student record and returns temporary password', async () => {
      vi.spyOn(authRepo, 'findUserByEmail').mockResolvedValue(null);
      vi.spyOn(userRepo, 'createMinimalUser').mockResolvedValue({
        userId: 'student-uuid-1',
        name: '',
        email: 'student.minimal@proctornet.edu',
        phone: null,
        status: 'ACTIVE',
        verificationStatus: 'UNVERIFIED',
        mustChangePassword: true,
        createdAt: new Date().toISOString()
      });

      const res = await userService.createSingleUser({
        email: 'student.minimal@proctornet.edu',
        role: 'STUDENT',
        identifier: '1MS21CS099',
        actorUserId: 'admin-uuid-1'
      });

      expect(res.user).toBeDefined();
      expect(res.user.email).toBe('student.minimal@proctornet.edu');
      expect(res.user.mustChangePassword).toBe(true);
      expect(typeof res.temporaryPassword).toBe('string');
      expect(res.temporaryPassword.length).toBe(16);
      expect(userRepo.createMinimalUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'student.minimal@proctornet.edu',
          role: 'STUDENT',
          identifier: '1MS21CS099'
        })
      );
    });

    it('rejects duplicate email with ConflictError', async () => {
      vi.spyOn(authRepo, 'findUserByEmail').mockResolvedValue({
        user_id: 'existing-id',
        email: 'duplicate@proctornet.edu'
      });

      await expect(
        userService.createSingleUser({
          email: 'duplicate@proctornet.edu',
          role: 'STUDENT',
          identifier: '1MS21CS100',
          actorUserId: 'admin-uuid-1'
        })
      ).rejects.toThrow(ConflictError);
    });
  });
});
