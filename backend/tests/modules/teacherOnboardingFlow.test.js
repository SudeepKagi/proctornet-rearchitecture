/**
 * @file teacherOnboardingFlow.test.js
 * @description Unit and integration tests for Teacher First-Login and Onboarding Flow:
 * - Teacher must change temporary password before submitting profile
 * - Teacher selects canonical branch (departmentId) and designation dropdown
 * - Profile validation rejects missing branch or missing designation
 * - Onboarding updates faculty profile with canonical department and designation
 * - Transition verification state to PENDING for admin review
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onboardingProfileSchema } from '../../src/modules/users/user.schemas.js';
import * as userService from '../../src/modules/users/user.service.js';
import * as userRepo from '../../src/modules/users/user.repository.js';
import * as auditService from '../../src/modules/audit/audit.service.js';
import { BadRequestError } from '../../src/utils/errors.js';

describe('Teacher First-Login and Onboarding Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditService, 'recordAuditEvent').mockResolvedValue({ audit_id: 'mock-audit' });
  });

  describe('1. Validation Schema: onboardingProfileSchema', () => {
    it('validates teacher profile with departmentId and designation', () => {
      const payload = {
        departmentId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        designation: 'Associate Professor',
        phone: '+91 98765 43210'
      };

      const result = onboardingProfileSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.departmentId).toBe('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d');
      expect(result.data.designation).toBe('Associate Professor');
    });

    it('allows valid department name as fallback string', () => {
      const payload = {
        department: 'Computer Science and Engineering',
        designation: 'Assistant Professor'
      };

      const result = onboardingProfileSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.department).toBe('Computer Science and Engineering');
      expect(result.data.designation).toBe('Assistant Professor');
    });
  });

  describe('2. Teacher Onboarding Service Execution', () => {
    it('blocks teacher onboarding submission if temporary password has not been changed', async () => {
      vi.spyOn(userRepo, 'findUserDetailById').mockResolvedValue({
        userId: 'teacher-1',
        mustChangePassword: true,
        verificationStatus: 'UNVERIFIED',
        roles: ['FACULTY']
      });

      await expect(
        userService.submitOnboardingProfile({
          userId: 'teacher-1',
          profileData: {
            departmentId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
            designation: 'Professor'
          }
        })
      ).rejects.toThrow('Must complete temporary password change before submitting onboarding profile');
    });

    it('rejects teacher onboarding if branch/department is missing', async () => {
      vi.spyOn(userRepo, 'findUserDetailById').mockResolvedValue({
        userId: 'teacher-1',
        mustChangePassword: false,
        verificationStatus: 'UNVERIFIED',
        roles: ['FACULTY']
      });

      await expect(
        userService.submitOnboardingProfile({
          userId: 'teacher-1',
          profileData: {
            designation: 'Professor'
          }
        })
      ).rejects.toThrow('Branch / Academic Department is required for teacher onboarding');
    });

    it('rejects teacher onboarding if designation is missing', async () => {
      vi.spyOn(userRepo, 'findUserDetailById').mockResolvedValue({
        userId: 'teacher-1',
        mustChangePassword: false,
        verificationStatus: 'UNVERIFIED',
        roles: ['FACULTY']
      });

      await expect(
        userService.submitOnboardingProfile({
          userId: 'teacher-1',
          profileData: {
            departmentId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
          }
        })
      ).rejects.toThrow('Designation is required for teacher onboarding');
    });

    it('successfully processes teacher onboarding and updates verificationStatus to PENDING', async () => {
      vi.spyOn(userRepo, 'findUserDetailById')
        .mockResolvedValueOnce({
          userId: 'teacher-1',
          mustChangePassword: false,
          verificationStatus: 'UNVERIFIED',
          roles: ['FACULTY']
        })
        .mockResolvedValueOnce({
          userId: 'teacher-1',
          verificationStatus: 'PENDING',
          roles: ['FACULTY']
        });

      const updateProfileSpy = vi.spyOn(userRepo, 'updateFacultyOnboardingProfile').mockResolvedValue();
      const updateStatusSpy = vi.spyOn(userRepo, 'updateVerificationStatus').mockResolvedValue();

      const result = await userService.submitOnboardingProfile({
        userId: 'teacher-1',
        profileData: {
          departmentId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          designation: 'Associate Professor',
          phone: '+91 9988776655'
        }
      });

      expect(updateProfileSpy).toHaveBeenCalledWith('teacher-1', {
        departmentId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        department: undefined,
        designation: 'Associate Professor',
        phone: '+91 9988776655'
      });

      expect(updateStatusSpy).toHaveBeenCalledWith('teacher-1', 'PENDING', null);
      expect(result.verificationStatus).toBe('PENDING');
    });
  });
});
