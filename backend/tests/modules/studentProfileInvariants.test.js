/**
 * @file studentProfileInvariants.test.js
 * @description Unit and invariant tests for Student Profile Read-Only Constraints and Photo Re-Verification:
 * - Branch and Semester are read-only for students after enrollment (strictly rejected on profile update)
 * - Photo update requests do NOT overwrite active face photo; saved to pending_face_photo_url
 * - photo_review_status transitions to PENDING
 * - Admin approval promotes pending photo to active reference photo
 * - Admin rejection clears pending photo without mutating active reference photo
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateStudentProfileSchema } from '../../src/modules/student/student.schemas.js';
import * as studentService from '../../src/modules/student/student.service.js';
import * as studentRepo from '../../src/modules/student/student.repository.js';
import * as userRepo from '../../src/modules/users/user.repository.js';
import * as userService from '../../src/modules/users/user.service.js';
import * as auditService from '../../src/modules/audit/audit.service.js';
import { BadRequestError } from '../../src/utils/errors.js';

describe('Student Profile Invariants and Photo Re-Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditService, 'recordAuditEvent').mockResolvedValue({ audit_id: 'mock-audit' });
  });

  describe('1. Schema Validation: updateStudentProfileSchema', () => {
    it('accepts name and phone updates', () => {
      const payload = {
        name: 'Jane Doe',
        phone: '+91 98765 43210'
      };
      const result = updateStudentProfileSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Jane Doe');
      expect(result.data.phone).toBe('+91 98765 43210');
    });

    it('strictly rejects any attempt to mutate departmentId', () => {
      const payload = {
        name: 'Jane Doe',
        departmentId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
      };
      const result = updateStudentProfileSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('read-only facts managed exclusively by institutional administrators');
    });

    it('strictly rejects any attempt to mutate semester', () => {
      const payload = {
        name: 'Jane Doe',
        semester: 6
      };
      const result = updateStudentProfileSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('read-only facts managed exclusively by institutional administrators');
    });
  });

  describe('2. Service Layer Invariants: updateProfile', () => {
    it('throws BadRequestError if student passes department or semester to service', async () => {
      await expect(
        studentService.updateProfile('student-1', {
          name: 'Jane Doe',
          semester: 4
        })
      ).rejects.toThrow('Academic branch and semester are read-only facts managed exclusively by institutional administrators.');
    });

    it('successfully calls repository with only permitted fields', async () => {
      const updateRepoSpy = vi.spyOn(studentRepo, 'updateStudentProfile').mockResolvedValue({
        user_id: 'student-1',
        name: 'Jane Doe',
        phone: '+91 99999 88888'
      });

      const res = await studentService.updateProfile('student-1', {
        name: 'Jane Doe',
        phone: '+91 99999 88888'
      });

      expect(updateRepoSpy).toHaveBeenCalledWith('student-1', {
        name: 'Jane Doe',
        phone: '+91 99999 88888'
      });
      expect(res.name).toBe('Jane Doe');
    });
  });

  describe('3. Photo Update Re-Verification Lifecycle', () => {
    it('submits new photo as pending without mutating active reference photo', async () => {
      vi.spyOn(studentRepo, 'getStudentProfile').mockResolvedValue({
        user_id: 'student-1',
        face_photo_url: 'https://cdn.example.com/initial_face.jpg',
        photo_review_status: 'NONE'
      });

      const submitPendingSpy = vi.spyOn(studentRepo, 'submitPendingPhotoUpdate').mockResolvedValue({
        user_id: 'student-1',
        face_photo_url: 'https://cdn.example.com/initial_face.jpg',
        pending_face_photo_url: 'data:image/jpeg;base64,newphotodata',
        photo_review_status: 'PENDING'
      });

      const res = await studentService.requestPhotoUpdate('student-1', 'data:image/jpeg;base64,newphotodata');

      expect(submitPendingSpy).toHaveBeenCalledWith('student-1', 'data:image/jpeg;base64,newphotodata');
      expect(res.photoReviewStatus).toBe('PENDING');
      expect(res.message).toContain('awaiting administrator verification');
    });

    it('promotes pending photo to active reference upon admin approval', async () => {
      vi.spyOn(userRepo, 'findUserDetailById').mockResolvedValue({
        userId: 'student-1',
        verificationStatus: 'VERIFIED',
        photoReviewStatus: 'PENDING',
        pendingFacePhotoUrl: 'data:image/jpeg;base64,newphotodata',
        facePhotoUrl: 'https://cdn.example.com/initial_face.jpg'
      });

      vi.spyOn(userRepo, 'updateVerificationStatus').mockResolvedValue({
        verification_status: 'VERIFIED'
      });

      const photoReviewSpy = vi.spyOn(userRepo, 'updateStudentPhotoReview').mockResolvedValue();

      await userService.reviewVerificationStatus({
        targetUserId: 'student-1',
        decision: 'VERIFIED',
        actorUserId: 'admin-1'
      });

      expect(photoReviewSpy).toHaveBeenCalledWith('student-1', 'VERIFIED');
    });

    it('discards pending photo upon admin rejection without altering active reference photo', async () => {
      vi.spyOn(userRepo, 'findUserDetailById').mockResolvedValue({
        userId: 'student-1',
        verificationStatus: 'VERIFIED',
        photoReviewStatus: 'PENDING',
        pendingFacePhotoUrl: 'data:image/jpeg;base64,blurryphoto',
        facePhotoUrl: 'https://cdn.example.com/initial_face.jpg'
      });

      vi.spyOn(userRepo, 'updateVerificationStatus').mockResolvedValue({
        verification_status: 'VERIFIED'
      });

      const photoReviewSpy = vi.spyOn(userRepo, 'updateStudentPhotoReview').mockResolvedValue();

      await userService.reviewVerificationStatus({
        targetUserId: 'student-1',
        decision: 'REJECTED',
        reviewNotes: 'Photo is blurry; please submit a clear face photograph.',
        actorUserId: 'admin-1'
      });

      expect(photoReviewSpy).toHaveBeenCalledWith('student-1', 'REJECTED');
    });
  });
});
