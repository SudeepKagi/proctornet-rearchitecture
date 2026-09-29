/**
 * @file examClearance.service.js
 * @description Service for managing exam entry clearances (screen share, biometric gate, and attempt authorization).
 */

import * as clearanceRepo from './examClearance.repository.js';
import * as sessionsRepo from './sessions.repository.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';

/**
 * Authoritatively records that candidate has activated screen sharing for an exam session.
 */
export async function recordScreenShare({ sessionId, studentId, requestId = null }) {
  const session = await sessionsRepo.findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError(`Exam session with ID '${sessionId}' not found`);
  }

  if (!['SCHEDULED', 'ACTIVE'].includes(session.status)) {
    throw new BadRequestError(`Cannot record screen share: Session is in '${session.status}' state`);
  }

  const clearance = await clearanceRepo.upsertScreenShareClearance({
    sessionId,
    studentId,
    ttlMinutes: 15
  });

  await recordAuditEvent({
    action: 'EXAM_SCREEN_SHARE_RECORDED',
    resourceType: 'SESSION',
    resourceId: sessionId,
    actorUserId: studentId,
    requestId,
    metadata: {
      clearanceId: clearance.clearance_id,
      screenShareAt: clearance.screen_share_at,
      expiresAt: clearance.expires_at
    }
  });

  return {
    clearanceId: clearance.clearance_id,
    sessionId: clearance.session_id,
    studentId: clearance.student_id,
    screenShareAt: clearance.screen_share_at,
    livenessPassed: clearance.liveness_passed,
    faceVerifiedAt: clearance.face_verified_at,
    expiresAt: clearance.expires_at,
    isReady: Boolean(clearance.screen_share_at && clearance.liveness_passed && clearance.face_verified_at)
  };
}

/**
 * Authoritatively records that candidate has passed biometric face & liveness verification for a session.
 */
export async function recordBiometricVerification({
  sessionId,
  studentId,
  faceScore,
  livenessPassed = true,
  requestId = null
}) {
  const clearance = await clearanceRepo.upsertFaceVerificationClearance({
    sessionId,
    studentId,
    faceScore,
    livenessPassed,
    ttlMinutes: 15
  });

  await recordAuditEvent({
    action: 'EXAM_BIOMETRIC_CLEARANCE_RECORDED',
    resourceType: 'SESSION',
    resourceId: sessionId,
    actorUserId: studentId,
    requestId,
    metadata: {
      clearanceId: clearance.clearance_id,
      faceScore,
      faceVerifiedAt: clearance.face_verified_at,
      livenessPassed: clearance.liveness_passed,
      expiresAt: clearance.expires_at
    }
  });

  return {
    clearanceId: clearance.clearance_id,
    sessionId: clearance.session_id,
    studentId: clearance.student_id,
    screenShareAt: clearance.screen_share_at,
    livenessPassed: clearance.liveness_passed,
    faceVerifiedAt: clearance.face_verified_at,
    faceScore: clearance.face_score,
    expiresAt: clearance.expires_at,
    isReady: Boolean(clearance.screen_share_at && clearance.liveness_passed && clearance.face_verified_at)
  };
}

/**
 * Gets the current entry clearance status for candidate in a session.
 */
export async function getClearanceStatus({ sessionId, studentId }) {
  const clearance = await clearanceRepo.findActiveClearance({ sessionId, studentId });
  if (!clearance) {
    return {
      hasClearance: false,
      screenShareAt: null,
      livenessPassed: false,
      faceVerifiedAt: null,
      isExpired: false,
      isReady: false
    };
  }

  const isExpired = new Date(clearance.expires_at) <= new Date();

  return {
    hasClearance: true,
    clearanceId: clearance.clearance_id,
    screenShareAt: clearance.screen_share_at,
    livenessPassed: clearance.liveness_passed,
    faceVerifiedAt: clearance.face_verified_at,
    faceScore: clearance.face_score,
    expiresAt: clearance.expires_at,
    isExpired,
    isReady: Boolean(clearance.screen_share_at && clearance.liveness_passed && clearance.face_verified_at && !isExpired)
  };
}
