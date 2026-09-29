/**
 * @file examEntryClearance.test.js
 * @description Unit and integration tests for Phase 3 Exam Entry Clearance Gate:
 * - Server-authoritative clearance recording for screen sharing
 * - Biometric face verification clearance integration
 * - Atomic FOR UPDATE clearance check and consumption on attempt start
 * - Rejection with 403 ENTRY_CLEARANCE_REQUIRED on missing/expired/unverified clearance
 * - Resume attempt requiring screen share clearance (SCREEN_SHARE_REQUIRED)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clearanceRepo from '../../src/modules/sessions/examClearance.repository.js';
import * as clearanceService from '../../src/modules/sessions/examClearance.service.js';
import * as sessionsRepo from '../../src/modules/sessions/sessions.repository.js';
import * as attemptsRepo from '../../src/modules/attempts/attempts.repository.js';
import * as attemptsService from '../../src/modules/attempts/attempts.service.js';
import * as auditService from '../../src/modules/audit/audit.service.js';
import { getPool } from '../../src/infrastructure/postgres/pool.js';
import { ForbiddenError, BadRequestError } from '../../src/utils/errors.js';

describe('Phase 3: Exam Entry Clearance Gate', () => {
  const dummySessionId = '22222222-2222-2222-2222-222222222222';
  const dummyStudentId = '11111111-1111-1111-1111-111111111111';
  const dummyClearanceId = '33333333-3333-3333-3333-333333333333';
  const dummyExamId = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditService, 'recordAuditEvent').mockResolvedValue({ audit_id: 'mock-audit' });
  });

  describe('1. Clearance Service: Screen Share & Status', () => {
    it('records screen share timestamp and sets expiration TTL', async () => {
      vi.spyOn(sessionsRepo, 'findSessionById').mockResolvedValue({
        session_id: dummySessionId,
        status: 'ACTIVE'
      });
      vi.spyOn(clearanceRepo, 'upsertScreenShareClearance').mockResolvedValue({
        clearance_id: dummyClearanceId,
        session_id: dummySessionId,
        student_id: dummyStudentId,
        screen_share_at: new Date().toISOString(),
        liveness_passed: false,
        face_verified_at: null,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      });

      const res = await clearanceService.recordScreenShare({
        sessionId: dummySessionId,
        studentId: dummyStudentId
      });

      expect(res.clearanceId).toBe(dummyClearanceId);
      expect(res.screenShareAt).toBeDefined();
      expect(res.isReady).toBe(false); // Face not verified yet
      expect(auditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EXAM_SCREEN_SHARE_RECORDED',
          resourceType: 'SESSION',
          actorUserId: dummyStudentId
        })
      );
    });

    it('rejects screen share recording if session is cancelled or not found', async () => {
      vi.spyOn(sessionsRepo, 'findSessionById').mockResolvedValue(null);

      await expect(
        clearanceService.recordScreenShare({
          sessionId: dummySessionId,
          studentId: dummyStudentId
        })
      ).rejects.toThrow(/not found/i);
    });

    it('returns clearance status indicating ready when both screen share and face verification exist', async () => {
      vi.spyOn(clearanceRepo, 'findActiveClearance').mockResolvedValue({
        clearance_id: dummyClearanceId,
        session_id: dummySessionId,
        student_id: dummyStudentId,
        screen_share_at: new Date().toISOString(),
        liveness_passed: true,
        face_verified_at: new Date().toISOString(),
        face_score: 0.94,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        consumed_at: null
      });

      const status = await clearanceService.getClearanceStatus({
        sessionId: dummySessionId,
        studentId: dummyStudentId
      });

      expect(status.hasClearance).toBe(true);
      expect(status.isReady).toBe(true);
      expect(status.isExpired).toBe(false);
      expect(status.faceScore).toBe(0.94);
    });
  });

  describe('2. Attempt Gating (startAttempt): Server-Authoritative Verification', () => {
    let mockClient;

    beforeEach(() => {
      mockClient = {
        query: vi.fn(),
        release: vi.fn()
      };
      vi.spyOn(getPool(), 'connect').mockResolvedValue(mockClient);

      // Default session mocks
      vi.spyOn(attemptsRepo, 'findSessionById').mockResolvedValue({
        session_id: dummySessionId,
        exam_id: dummyExamId,
        status: 'ACTIVE',
        scheduled_start_time: new Date(Date.now() - 3600000).toISOString(),
        scheduled_end_time: new Date(Date.now() + 3600000).toISOString(),
        server_now: new Date().toISOString()
      });

      vi.spyOn(attemptsRepo, 'findExamById').mockResolvedValue({
        exam_id: dummyExamId,
        status: 'PUBLISHED',
        duration_minutes: 60,
        total_marks: 100
      });

      vi.spyOn(attemptsRepo, 'findSessionStudentForUpdate').mockResolvedValue({
        session_id: dummySessionId,
        student_id: dummyStudentId,
        status: 'ASSIGNED'
      });
    });

    it('rejects attempt start with 403 ENTRY_CLEARANCE_REQUIRED when no clearance exists', async () => {
      vi.spyOn(attemptsRepo, 'findAttemptBySessionAndStudentForUpdate').mockResolvedValue(null);

      mockClient.query.mockImplementation(async (sql) => {
        if (typeof sql === 'string' && sql.includes('FROM student_configurations')) {
          return { rows: [{ proctoring_strictness: 'STANDARD' }] };
        }
        if (typeof sql === 'string' && sql.includes('FROM exam_entry_clearances')) {
          return { rows: [] }; // No clearance found
        }
        return { rows: [] };
      });

      await expect(
        attemptsService.startAttempt(dummySessionId, {
          userId: dummyStudentId,
          roles: ['STUDENT']
        })
      ).rejects.toThrow(ForbiddenError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rejects attempt start when screen share is missing or face is unverified', async () => {
      vi.spyOn(attemptsRepo, 'findAttemptBySessionAndStudentForUpdate').mockResolvedValue(null);

      mockClient.query.mockImplementation(async (sql) => {
        if (typeof sql === 'string' && sql.includes('FROM student_configurations')) {
          return { rows: [{ proctoring_strictness: 'STANDARD' }] };
        }
        if (typeof sql === 'string' && sql.includes('FROM exam_entry_clearances')) {
          // Clearance exists but only has screen share; face is unverified
          return {
            rows: [
              {
                clearance_id: dummyClearanceId,
                session_id: dummySessionId,
                student_id: dummyStudentId,
                screen_share_at: new Date().toISOString(),
                liveness_passed: false,
                face_verified_at: null,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
              }
            ]
          };
        }
        return { rows: [] };
      });

      await expect(
        attemptsService.startAttempt(dummySessionId, {
          userId: dummyStudentId,
          roles: ['STUDENT']
        })
      ).rejects.toThrow(ForbiddenError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rejects attempt start when clearance has expired', async () => {
      vi.spyOn(attemptsRepo, 'findAttemptBySessionAndStudentForUpdate').mockResolvedValue(null);

      mockClient.query.mockImplementation(async (sql) => {
        if (typeof sql === 'string' && sql.includes('FROM student_configurations')) {
          return { rows: [{ proctoring_strictness: 'STANDARD' }] };
        }
        if (typeof sql === 'string' && sql.includes('FROM exam_entry_clearances')) {
          // Clearance expired 5 minutes ago
          return {
            rows: [
              {
                clearance_id: dummyClearanceId,
                session_id: dummySessionId,
                student_id: dummyStudentId,
                screen_share_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
                liveness_passed: true,
                face_verified_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
                expires_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
              }
            ]
          };
        }
        return { rows: [] };
      });

      await expect(
        attemptsService.startAttempt(dummySessionId, {
          userId: dummyStudentId,
          roles: ['STUDENT']
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('successfully consumes clearance and creates attempt when valid unconsumed clearance exists', async () => {
      vi.spyOn(attemptsRepo, 'findAttemptBySessionAndStudentForUpdate').mockResolvedValue(null);
      vi.spyOn(attemptsRepo, 'getQuestionsForExam').mockResolvedValue([
        { question_id: 'q1', marks: 10 }
      ]);
      vi.spyOn(attemptsRepo, 'insertAttempt').mockResolvedValue({
        attempt_id: 'new-attempt-123',
        session_id: dummySessionId,
        student_id: dummyStudentId,
        status: 'ACTIVE',
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString()
      });
      vi.spyOn(attemptsRepo, 'batchInsertAttemptQuestions').mockResolvedValue([]);
      vi.spyOn(attemptsRepo, 'updateSessionStudentStatus').mockResolvedValue({});
      vi.spyOn(attemptsRepo, 'createAuditLog').mockResolvedValue({});

      let consumedClearanceId = null;

      mockClient.query.mockImplementation(async (sql, params) => {
        if (typeof sql === 'string' && sql.includes('FROM student_configurations')) {
          return { rows: [{ proctoring_strictness: 'STANDARD' }] };
        }
        if (typeof sql === 'string' && sql.includes('FROM exam_entry_clearances') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                clearance_id: dummyClearanceId,
                session_id: dummySessionId,
                student_id: dummyStudentId,
                screen_share_at: new Date().toISOString(),
                liveness_passed: true,
                face_verified_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
              }
            ]
          };
        }
        if (typeof sql === 'string' && sql.includes('UPDATE exam_entry_clearances') && sql.includes('consumed_at')) {
          consumedClearanceId = params[0];
          return { rows: [{ clearance_id: dummyClearanceId, consumed_at: new Date() }] };
        }
        return { rows: [] };
      });

      const attemptResult = await attemptsService.startAttempt(dummySessionId, {
        userId: dummyStudentId,
        roles: ['STUDENT']
      });

      expect(attemptResult.attemptId).toBe('new-attempt-123');
      expect(consumedClearanceId).toBe(dummyClearanceId);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('requires screen share clearance on crash resumption (SCREEN_SHARE_REQUIRED)', async () => {
      // Existing active attempt exists
      vi.spyOn(attemptsRepo, 'findAttemptBySessionAndStudentForUpdate').mockResolvedValue({
        attempt_id: 'resumed-attempt-456',
        session_id: dummySessionId,
        student_id: dummyStudentId,
        status: 'ACTIVE',
        started_at: new Date(Date.now() - 600000).toISOString(),
        expires_at: new Date(Date.now() + 3000000).toISOString()
      });

      mockClient.query.mockImplementation(async (sql) => {
        if (typeof sql === 'string' && sql.includes('SELECT screen_share_at FROM exam_entry_clearances')) {
          return { rows: [] }; // No screen share recorded for resumption
        }
        return { rows: [] };
      });

      await expect(
        attemptsService.startAttempt(dummySessionId, {
          userId: dummyStudentId,
          roles: ['STUDENT']
        })
      ).rejects.toThrow(/screen sharing required/i);
    });
  });
});
