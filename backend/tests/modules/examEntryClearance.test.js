/**
 * @file examEntryClearance.test.js
 * @description Unit tests for Exam Entry Clearance Gate:
 * - Screen sharing clearance recording
 * - Biometric face verification clearance recording
 * - Clearance status inquiry and readiness verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as clearanceService from '../../src/modules/sessions/examClearance.service.js';

describe('Exam Entry Clearance Gate', () => {
  const dummySessionId = '22222222-2222-2222-2222-222222222222';
  const dummyStudentId = '11111111-1111-1111-1111-111111111111';

  it('records screen sharing clearance and marks session ready', async () => {
    const clearance = await clearanceService.recordScreenShare({
      sessionId: dummySessionId,
      studentId: dummyStudentId
    });

    expect(clearance).toBeDefined();
    expect(clearance.sessionId).toBe(dummySessionId);
    expect(clearance.studentId).toBe(dummyStudentId);
    expect(clearance.livenessPassed).toBe(true);
    expect(clearance.isReady).toBe(true);
  });

  it('records biometric verification clearance with face score and liveness', async () => {
    const clearance = await clearanceService.recordBiometricVerification({
      sessionId: dummySessionId,
      studentId: dummyStudentId,
      faceScore: 0.98,
      livenessPassed: true
    });

    expect(clearance).toBeDefined();
    expect(clearance.faceScore).toBe(0.98);
    expect(clearance.livenessPassed).toBe(true);
    expect(clearance.isReady).toBe(true);
  });

  it('retrieves clearance status confirming candidate clearance readiness', async () => {
    const status = await clearanceService.getClearanceStatus({
      sessionId: dummySessionId,
      studentId: dummyStudentId
    });

    expect(status).toBeDefined();
    expect(status.hasClearance).toBe(true);
    expect(status.isReady).toBe(true);
    expect(status.isExpired).toBe(false);
  });
});
