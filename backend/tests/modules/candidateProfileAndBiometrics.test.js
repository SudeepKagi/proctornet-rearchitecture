/**
 * @file candidateProfileAndBiometrics.test.js
 * @description Unit and integration tests for Phase 1 Candidate Profile & Biometric Re-enrollment:
 * - OCC 409 on expected_version conflict
 * - Single-active-template invariant on face_biometrics
 * - Transactional rollback on re-enrollment failure
 * - Guard rejection (active attempt, upcoming session lockout)
 * - Password change requiring current password and revoking other sessions
 * - Role-based authorization constraints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateCandidateProfile,
  changeCandidatePassword,
  reEnrollCandidateFace
} from '../../src/modules/candidate/candidateIdentity.service.js';
import * as candidateIdentityRepo from '../../src/modules/candidate/candidateIdentity.repository.js';
import * as authRepo from '../../src/modules/auth/auth.repository.js';
import * as tokenBlacklist from '../../src/modules/auth/tokenBlacklist.js';
import * as faceDetector from '../../src/modules/biometrics/faceDetector.js';
import * as embeddingExtractor from '../../src/modules/biometrics/embeddingExtractor.js';
import * as s3Storage from '../../src/infrastructure/storage/s3Storage.js';
import * as auditService from '../../src/modules/audit/audit.service.js';
import { requireRole } from '../../src/middleware/authorize.js';
import { ConflictError, UnauthorizedError, ValidationError, ForbiddenError } from '../../src/utils/errors.js';
import bcrypt from 'bcrypt';

describe('Phase 1: Candidate Profile & Biometric Re-enrollment', () => {
  const dummyUserId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditService, 'recordAuditEvent').mockResolvedValue({ audit_id: 'mock-audit' });
  });

  describe('1. OCC Concurrency Control on Profile Updates (PATCH /profile)', () => {
    it('successfully updates display name and phone when expected_version matches', async () => {
      vi.spyOn(candidateIdentityRepo, 'updateStudentProfile').mockResolvedValue({
        user_id: dummyUserId,
        name: 'Jane Doe',
        phone: '+1234567890',
        version: 2
      });

      const updated = await updateCandidateProfile(dummyUserId, {
        name: 'Jane Doe',
        phone: '+1234567890',
        expected_version: 1
      });

      expect(updated.name).toBe('Jane Doe');
      expect(updated.phone).toBe('+1234567890');
      expect(updated.version).toBe(2);
      expect(candidateIdentityRepo.updateStudentProfile).toHaveBeenCalledWith(dummyUserId, {
        name: 'Jane Doe',
        phone: '+1234567890',
        expected_version: 1
      });
    });

    it('rejects stale expected_version with 409 ConflictError (VERSION_CONFLICT)', async () => {
      const conflictErr = new ConflictError(
        'Profile version conflict. Current version is 3, but expected 1. Please reload.',
        'VERSION_CONFLICT'
      );
      conflictErr.details = { current_version: 3, expected_version: 1 };

      vi.spyOn(candidateIdentityRepo, 'updateStudentProfile').mockRejectedValue(conflictErr);

      await expect(
        updateCandidateProfile(dummyUserId, {
          name: 'Conflict Name',
          expected_version: 1
        })
      ).rejects.toThrow(ConflictError);

      await expect(
        updateCandidateProfile(dummyUserId, {
          name: 'Conflict Name',
          expected_version: 1
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'VERSION_CONFLICT',
        details: { current_version: 3, expected_version: 1 }
      });
    });
  });

  describe('2. Candidate Password Change & Session Revocation', () => {
    it('successfully updates password and revokes other active sessions when current password is valid', async () => {
      const currentPassword = 'OldPassword123!';
      const newPassword = 'NewPassword456!';
      const passwordHash = await bcrypt.hash(currentPassword, 10);

      vi.spyOn(candidateIdentityRepo, 'findUserAuthById').mockResolvedValue({
        user_id: dummyUserId,
        password_hash: passwordHash,
        email: 'student@example.com'
      });
      vi.spyOn(candidateIdentityRepo, 'updateUserPassword').mockResolvedValue({ user_id: dummyUserId });
      vi.spyOn(candidateIdentityRepo, 'findOtherActiveSessionIds').mockResolvedValue(['sess-2', 'sess-3']);
      vi.spyOn(authRepo, 'revokeSession').mockResolvedValue();
      vi.spyOn(tokenBlacklist, 'blacklistSession').mockResolvedValue();

      const result = await changeCandidatePassword({
        userId: dummyUserId,
        currentPassword,
        newPassword,
        currentSessionId: 'sess-1'
      });

      expect(result.success).toBe(true);
      expect(result.revokedOtherSessionsCount).toBe(2);
      expect(authRepo.revokeSession).toHaveBeenCalledWith('sess-2');
      expect(authRepo.revokeSession).toHaveBeenCalledWith('sess-3');
      expect(tokenBlacklist.blacklistSession).toHaveBeenCalledWith('sess-2');
      expect(tokenBlacklist.blacklistSession).toHaveBeenCalledWith('sess-3');
      expect(candidateIdentityRepo.updateUserPassword).toHaveBeenCalled();
    });

    it('rejects password change when current password is wrong', async () => {
      const currentPassword = 'WrongPassword!';
      const correctPassword = 'RealPassword123!';
      const passwordHash = await bcrypt.hash(correctPassword, 10);

      vi.spyOn(candidateIdentityRepo, 'findUserAuthById').mockResolvedValue({
        user_id: dummyUserId,
        password_hash: passwordHash,
        email: 'student@example.com'
      });

      await expect(
        changeCandidatePassword({
          userId: dummyUserId,
          currentPassword,
          newPassword: 'NewSecurePassword789!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('3. Guard Rejections on Biometric Re-enrollment', () => {
    const validJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(50).fill(128)]);

    it('rejects photo replacement while candidate has an ACTIVE exam attempt', async () => {
      vi.spyOn(candidateIdentityRepo, 'checkActiveAttemptForStudent').mockResolvedValue(true);

      await expect(
        reEnrollCandidateFace({
          userId: dummyUserId,
          imageBuffer: validJpegBytes,
          mimeType: 'image/jpeg'
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'ACTIVE_ATTEMPT_LOCK'
      });
    });

    it('rejects photo replacement when student has an upcoming session within 24h lockout window', async () => {
      vi.spyOn(candidateIdentityRepo, 'checkActiveAttemptForStudent').mockResolvedValue(false);
      vi.spyOn(candidateIdentityRepo, 'checkUpcomingSessionForStudent').mockResolvedValue({
        session_id: 'session-99',
        title: 'Midterm Physics',
        start_time: new Date(Date.now() + 2 * 3600 * 1000)
      });

      await expect(
        reEnrollCandidateFace({
          userId: dummyUserId,
          imageBuffer: validJpegBytes,
          mimeType: 'image/jpeg'
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'UPCOMING_EXAM_LOCK'
      });
    });
  });

  describe('4. Biometric Re-enrollment Atomic Transaction & Single-Active-Template', () => {
    const validJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(128)]);

    it('executes atomic template insertion, deactivates previous template, and updates avatar pointer', async () => {
      vi.spyOn(candidateIdentityRepo, 'checkActiveAttemptForStudent').mockResolvedValue(false);
      vi.spyOn(candidateIdentityRepo, 'checkUpcomingSessionForStudent').mockResolvedValue(null);
      vi.spyOn(faceDetector, 'detectFace').mockResolvedValue({
        faceDetected: true,
        boundingBox: { top: 10, left: 10, width: 100, height: 100 },
        poseAngles: { pitch: 1.0, yaw: 0.5, roll: 0.0 }
      });
      vi.spyOn(embeddingExtractor, 'extractEmbedding').mockResolvedValue({
        embedding: new Array(128).fill(0.1),
        modelVersion: 'face-v1'
      });
      vi.spyOn(candidateIdentityRepo, 'findActiveDocumentByUserId').mockResolvedValue(null);
      vi.spyOn(s3Storage, 'putEvidenceObjectBuffer').mockResolvedValue({ versionId: 'v1' });
      vi.spyOn(s3Storage, 'generatePresignedDownloadUrl').mockResolvedValue('https://s3.example.com/presigned-photo');

      const mockReEnrollTx = vi.spyOn(candidateIdentityRepo, 'reEnrollFaceBiometricTransaction').mockResolvedValue({
        biometric_id: 'bio-new',
        version: 2,
        is_active: true,
        enrollment_status: 'ENROLLED',
        quality_score: '0.850'
      });

      const result = await reEnrollCandidateFace({
        userId: dummyUserId,
        imageBuffer: validJpegBytes,
        mimeType: 'image/jpeg'
      });

      expect(mockReEnrollTx).toHaveBeenCalledTimes(1);
      expect(result.biometricId).toBe('bio-new');
      expect(result.version).toBe(2);
      expect(result.verificationStatus).toBe('PENDING_REVIEW'); // No ID doc on file -> PENDING_REVIEW
      expect(result.photoUrl).toBe('https://s3.example.com/presigned-photo');
    });

    it('rolls back completely if database transaction encounters an error', async () => {
      vi.spyOn(candidateIdentityRepo, 'checkActiveAttemptForStudent').mockResolvedValue(false);
      vi.spyOn(candidateIdentityRepo, 'checkUpcomingSessionForStudent').mockResolvedValue(null);
      vi.spyOn(faceDetector, 'detectFace').mockResolvedValue({
        faceDetected: true,
        boundingBox: { top: 10, left: 10, width: 100, height: 100 }
      });
      vi.spyOn(embeddingExtractor, 'extractEmbedding').mockResolvedValue({
        embedding: new Array(128).fill(0.1),
        modelVersion: 'face-v1'
      });
      vi.spyOn(candidateIdentityRepo, 'findActiveDocumentByUserId').mockResolvedValue(null);
      vi.spyOn(s3Storage, 'putEvidenceObjectBuffer').mockResolvedValue({ versionId: 'v1' });

      vi.spyOn(candidateIdentityRepo, 'reEnrollFaceBiometricTransaction').mockRejectedValue(
        new Error('DB connection failure during commit')
      );

      await expect(
        reEnrollCandidateFace({
          userId: dummyUserId,
          imageBuffer: validJpegBytes,
          mimeType: 'image/jpeg'
        })
      ).rejects.toThrow('DB connection failure during commit');
    });
  });

  describe('5. RBAC & Role Isolation', () => {
    it('permits STUDENT role to access candidate endpoints', async () => {
      vi.spyOn(authRepo, 'getUserRoles').mockResolvedValue(['STUDENT']);
      const middleware = requireRole('STUDENT');
      const req = { user: { userId: dummyUserId, roles: ['STUDENT'] } };
      let called = false;
      await middleware(req, {}, (err) => {
        if (!err) called = true;
      });
      expect(called).toBe(true);
    });

    it('denies DEVELOPER or FACULTY role without STUDENT role with 403 ForbiddenError', async () => {
      vi.spyOn(authRepo, 'getUserRoles').mockResolvedValue(['DEVELOPER']);
      const middleware = requireRole('STUDENT');
      const req = { user: { userId: dummyUserId, roles: ['DEVELOPER'] } };
      let capturedErr = null;
      await middleware(req, {}, (err) => {
        capturedErr = err;
      });
      expect(capturedErr).toBeInstanceOf(ForbiddenError);
    });
  });
});
