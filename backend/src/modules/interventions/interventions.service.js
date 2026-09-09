/**
 * @file interventions.service.js
 * @description Business workflow service for Invigilator Realtime Interventions.
 * Enforces PostgreSQL authoritative state transitions, race condition safety, idempotency, BOLA authorization, and WebSocket event dispatching.
 * Conforms to Phase 26 Track 2 Workstream F.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';
import { AppError, ForbiddenError, NotFoundError, ConflictError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { defaultBroadcaster } from '../../infrastructure/realtime/index.js';
import * as interventionsRepo from './interventions.repository.js';
import * as auditService from '../audit/audit.service.js';

function isUserAdmin(user) {
  const roles = user.roles || (user.role ? [user.role] : []);
  return roles.includes('ADMIN');
}

/**
 * Broadcasts a room-wide announcement to all candidates in a session.
 */
export async function broadcastAnnouncement({
  sessionId,
  message,
  user,
  idempotencyKey = null,
  metadata = {}
}) {
  const isAdmin = isUserAdmin(user);
  const isAuthorized = await interventionsRepo.checkInvigilatorSessionAccess(sessionId, user.userId, isAdmin);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied: You are not assigned to invigilate this session');
  }

  // Idempotency check
  if (idempotencyKey) {
    const existing = await interventionsRepo.findInterventionByIdempotencyKey(idempotencyKey, sessionId);
    if (existing) {
      return { ...existing, idempotentReplay: true };
    }
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const intervention = await interventionsRepo.recordIntervention({
      sessionId,
      invigilatorUserId: user.userId,
      type: 'ANNOUNCEMENT',
      message,
      metadata: { ...metadata, idempotencyKey }
    }, client);

    await client.query('COMMIT');

    // Realtime Broadcasts:
    // 1. To candidates subscribed to room session:<id>:candidate
    const candidateRoom = `session:${sessionId}:candidate`;
    await defaultBroadcaster.broadcastToRoom(candidateRoom, 'session:announcement', {
      announcementId: intervention.intervention_id,
      sessionId,
      message,
      senderName: user.name || 'Invigilator',
      timestamp: intervention.created_at
    });

    // 2. To invigilators in session:<id>
    const invigilatorRoom = `session:${sessionId}`;
    await defaultBroadcaster.broadcastToRoom(invigilatorRoom, 'invigilator:intervention_logged', {
      interventionId: intervention.intervention_id,
      sessionId,
      type: 'ANNOUNCEMENT',
      message,
      invigilatorUserId: user.userId,
      timestamp: intervention.created_at
    });

    // Audit trail
    await auditService.recordAuditEvent({
      actorUserId: user.userId,
      action: 'INVIGILATOR_ANNOUNCEMENT_BROADCAST',
      resourceType: 'SESSION',
      resourceId: sessionId,
      metadata: { interventionId: intervention.intervention_id, messageLength: message.length }
    }).catch(err => logger.warn({ err: err.message }, 'Non-blocking intervention audit log failed'));

    return intervention;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Sends a 1:1 direct message or formal warning to an individual candidate.
 */
export async function sendCandidateMessage({
  attemptId,
  message,
  reason = null,
  isWarning = false,
  user,
  idempotencyKey = null,
  metadata = {}
}) {
  const attempt = await interventionsRepo.getAttemptDetails(attemptId);
  if (!attempt) {
    throw new NotFoundError('Exam attempt not found');
  }

  const isAdmin = isUserAdmin(user);
  const isAuthorized = await interventionsRepo.checkInvigilatorSessionAccess(attempt.session_id, user.userId, isAdmin);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied: You are not assigned to invigilate this session');
  }

  // Idempotency check
  if (idempotencyKey) {
    const existing = await interventionsRepo.findInterventionByIdempotencyKey(idempotencyKey, attempt.session_id, attemptId);
    if (existing) {
      return { ...existing, idempotentReplay: true };
    }
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const intervention = await interventionsRepo.recordIntervention({
      sessionId: attempt.session_id,
      attemptId,
      invigilatorUserId: user.userId,
      type: 'WARNING_MESSAGE',
      message,
      reason,
      metadata: { ...metadata, isWarning, idempotencyKey }
    }, client);

    await client.query('COMMIT');

    // Realtime Broadcasts:
    // 1. To the candidate's attempt room attempt:<attemptId>
    const attemptRoom = `attempt:${attemptId}`;
    await defaultBroadcaster.broadcastToRoom(attemptRoom, 'candidate:message', {
      interventionId: intervention.intervention_id,
      attemptId,
      sessionId: attempt.session_id,
      message,
      reason,
      isWarning,
      timestamp: intervention.created_at
    });

    // 2. To invigilators in session:<id>
    const invigilatorRoom = `session:${attempt.session_id}`;
    await defaultBroadcaster.broadcastToRoom(invigilatorRoom, 'invigilator:intervention_logged', {
      interventionId: intervention.intervention_id,
      attemptId,
      sessionId: attempt.session_id,
      type: 'WARNING_MESSAGE',
      message,
      reason,
      isWarning,
      candidateName: attempt.student_name,
      timestamp: intervention.created_at
    });

    await auditService.recordAuditEvent({
      actorUserId: user.userId,
      action: isWarning ? 'INVIGILATOR_WARNING_SENT' : 'INVIGILATOR_MESSAGE_SENT',
      resourceType: 'ATTEMPT',
      resourceId: attemptId,
      metadata: { interventionId: intervention.intervention_id, sessionId: attempt.session_id }
    }).catch(err => logger.warn({ err: err.message }, 'Non-blocking intervention audit log failed'));

    return intervention;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Remotely pauses a candidate's active exam attempt.
 * Server authoritative: Freezes timer and locks student input.
 */
export async function pauseCandidateAttempt({
  attemptId,
  reason,
  user,
  idempotencyKey = null,
  metadata = {}
}) {
  const attempt = await interventionsRepo.getAttemptDetails(attemptId);
  if (!attempt) {
    throw new NotFoundError('Exam attempt not found');
  }

  const isAdmin = isUserAdmin(user);
  const isAuthorized = await interventionsRepo.checkInvigilatorSessionAccess(attempt.session_id, user.userId, isAdmin);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied: You are not assigned to invigilate this session');
  }

  // Idempotency check
  if (idempotencyKey) {
    const existing = await interventionsRepo.findInterventionByIdempotencyKey(idempotencyKey, attempt.session_id, attemptId);
    if (existing) {
      return { ...existing, idempotentReplay: true };
    }
  }

  // If already paused, duplicate pause is an idempotent operation
  if (attempt.status === 'PAUSED') {
    return {
      attemptId,
      status: 'PAUSED',
      pausedAt: attempt.paused_at,
      pauseReason: attempt.pause_reason,
      alreadyPaused: true
    };
  }

  // Reject terminal states
  if (['SUBMITTED', 'TERMINATED', 'EXPIRED'].includes(attempt.status)) {
    throw new ConflictError(`Cannot pause attempt: Current attempt status is ${attempt.status}`);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updatedAttempt = await interventionsRepo.pauseAttemptAtomic({
      attemptId,
      invigilatorUserId: user.userId,
      reason
    }, client);

    if (!updatedAttempt) {
      // Race condition: another command altered status between check and atomic update
      const current = await interventionsRepo.getAttemptDetails(attemptId, client);
      await client.query('ROLLBACK');
      throw new ConflictError(`Pause race condition detected: Current status is ${current?.status}`);
    }

    const intervention = await interventionsRepo.recordIntervention({
      sessionId: attempt.session_id,
      attemptId,
      invigilatorUserId: user.userId,
      type: 'PAUSE',
      reason,
      metadata: { ...metadata, idempotencyKey }
    }, client);

    await client.query('COMMIT');

    // Realtime Broadcasts:
    // 1. To candidate attempt room
    const attemptRoom = `attempt:${attemptId}`;
    await defaultBroadcaster.broadcastToRoom(attemptRoom, 'candidate:paused', {
      interventionId: intervention.intervention_id,
      attemptId,
      sessionId: attempt.session_id,
      pausedAt: updatedAttempt.paused_at,
      reason
    });

    // 2. To invigilators
    const invigilatorRoom = `session:${attempt.session_id}`;
    await defaultBroadcaster.broadcastToRoom(invigilatorRoom, 'invigilator:intervention_logged', {
      interventionId: intervention.intervention_id,
      attemptId,
      sessionId: attempt.session_id,
      type: 'PAUSE',
      reason,
      candidateName: attempt.student_name,
      timestamp: intervention.created_at
    });

    await auditService.recordAuditEvent({
      actorUserId: user.userId,
      action: 'INVIGILATOR_ATTEMPT_PAUSED',
      resourceType: 'ATTEMPT',
      resourceId: attemptId,
      metadata: { interventionId: intervention.intervention_id, reason }
    }).catch(err => logger.warn({ err: err.message }, 'Non-blocking intervention audit log failed'));

    return {
      interventionId: intervention.intervention_id,
      attemptId,
      status: updatedAttempt.status,
      pausedAt: updatedAttempt.paused_at,
      reason
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Remotely resumes a candidate's paused exam attempt.
 * Server authoritative: Calculates elapsed paused time, extends expires_at, and restores ACTIVE status.
 */
export async function resumeCandidateAttempt({
  attemptId,
  reason,
  extensionSeconds = 0,
  user,
  idempotencyKey = null,
  metadata = {}
}) {
  const attempt = await interventionsRepo.getAttemptDetails(attemptId);
  if (!attempt) {
    throw new NotFoundError('Exam attempt not found');
  }

  const isAdmin = isUserAdmin(user);
  const isAuthorized = await interventionsRepo.checkInvigilatorSessionAccess(attempt.session_id, user.userId, isAdmin);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied: You are not assigned to invigilate this session');
  }

  // Idempotency check
  if (idempotencyKey) {
    const existing = await interventionsRepo.findInterventionByIdempotencyKey(idempotencyKey, attempt.session_id, attemptId);
    if (existing) {
      return { ...existing, idempotentReplay: true };
    }
  }

  // If already active, duplicate resume is idempotent
  if (attempt.status === 'ACTIVE') {
    return {
      attemptId,
      status: 'ACTIVE',
      expiresAt: attempt.expires_at,
      alreadyActive: true
    };
  }

  if (attempt.status !== 'PAUSED') {
    throw new ConflictError(`Cannot resume attempt: Current status is ${attempt.status}, expected PAUSED`);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updatedAttempt = await interventionsRepo.resumeAttemptAtomic({
      attemptId,
      extensionSeconds
    }, client);

    if (!updatedAttempt) {
      const current = await interventionsRepo.getAttemptDetails(attemptId, client);
      await client.query('ROLLBACK');
      throw new ConflictError(`Resume race condition detected: Current status is ${current?.status}`);
    }

    const intervention = await interventionsRepo.recordIntervention({
      sessionId: attempt.session_id,
      attemptId,
      invigilatorUserId: user.userId,
      type: 'RESUME',
      reason,
      metadata: { ...metadata, extensionSeconds, idempotencyKey }
    }, client);

    await client.query('COMMIT');

    // Realtime Broadcasts:
    // 1. To candidate attempt room
    const attemptRoom = `attempt:${attemptId}`;
    await defaultBroadcaster.broadcastToRoom(attemptRoom, 'candidate:resumed', {
      interventionId: intervention.intervention_id,
      attemptId,
      sessionId: attempt.session_id,
      resumedAt: new Date().toISOString(),
      expiresAt: updatedAttempt.expires_at,
      reason
    });

    // 2. To invigilators
    const invigilatorRoom = `session:${attempt.session_id}`;
    await defaultBroadcaster.broadcastToRoom(invigilatorRoom, 'invigilator:intervention_logged', {
      interventionId: intervention.intervention_id,
      attemptId,
      sessionId: attempt.session_id,
      type: 'RESUME',
      reason,
      expiresAt: updatedAttempt.expires_at,
      candidateName: attempt.student_name,
      timestamp: intervention.created_at
    });

    await auditService.recordAuditEvent({
      actorUserId: user.userId,
      action: 'INVIGILATOR_ATTEMPT_RESUMED',
      resourceType: 'ATTEMPT',
      resourceId: attemptId,
      metadata: { interventionId: intervention.intervention_id, reason, extensionSeconds }
    }).catch(err => logger.warn({ err: err.message }, 'Non-blocking intervention audit log failed'));

    return {
      interventionId: intervention.intervention_id,
      attemptId,
      status: updatedAttempt.status,
      expiresAt: updatedAttempt.expires_at,
      totalPausedMs: updatedAttempt.total_paused_ms
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Remotely terminates a candidate's attempt immediately for severe integrity violation.
 * Terminal state: Cannot be resumed or submitted.
 */
export async function terminateCandidateAttempt({
  attemptId,
  reason,
  user,
  idempotencyKey = null,
  metadata = {}
}) {
  const attempt = await interventionsRepo.getAttemptDetails(attemptId);
  if (!attempt) {
    throw new NotFoundError('Exam attempt not found');
  }

  const isAdmin = isUserAdmin(user);
  const isAuthorized = await interventionsRepo.checkInvigilatorSessionAccess(attempt.session_id, user.userId, isAdmin);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied: You are not assigned to invigilate this session');
  }

  // Idempotency check
  if (idempotencyKey) {
    const existing = await interventionsRepo.findInterventionByIdempotencyKey(idempotencyKey, attempt.session_id, attemptId);
    if (existing) {
      return { ...existing, idempotentReplay: true };
    }
  }

  // If already terminated, return idempotently
  if (attempt.status === 'TERMINATED') {
    return {
      attemptId,
      status: 'TERMINATED',
      terminatedAt: attempt.submitted_at,
      reason: attempt.termination_reason,
      alreadyTerminated: true
    };
  }

  // If already submitted or expired
  if (['SUBMITTED', 'EXPIRED'].includes(attempt.status)) {
    throw new ConflictError(`Cannot terminate attempt: Attempt is already ${attempt.status}`);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updatedAttempt = await interventionsRepo.terminateAttemptAtomic({
      attemptId,
      invigilatorUserId: user.userId,
      reason
    }, client);

    if (!updatedAttempt) {
      const current = await interventionsRepo.getAttemptDetails(attemptId, client);
      await client.query('ROLLBACK');
      throw new ConflictError(`Terminate race condition detected: Current status is ${current?.status}`);
    }

    const intervention = await interventionsRepo.recordIntervention({
      sessionId: attempt.session_id,
      attemptId,
      invigilatorUserId: user.userId,
      type: 'TERMINATE',
      reason,
      metadata: { ...metadata, idempotencyKey }
    }, client);

    await client.query('COMMIT');

    // Realtime Broadcasts:
    // 1. To candidate attempt room
    const attemptRoom = `attempt:${attemptId}`;
    await defaultBroadcaster.broadcastToRoom(attemptRoom, 'candidate:terminated', {
      interventionId: intervention.intervention_id,
      attemptId,
      sessionId: attempt.session_id,
      terminatedAt: updatedAttempt.submitted_at,
      reason
    });

    // 2. To invigilators
    const invigilatorRoom = `session:${attempt.session_id}`;
    await defaultBroadcaster.broadcastToRoom(invigilatorRoom, 'invigilator:intervention_logged', {
      interventionId: intervention.intervention_id,
      attemptId,
      sessionId: attempt.session_id,
      type: 'TERMINATE',
      reason,
      candidateName: attempt.student_name,
      timestamp: intervention.created_at
    });

    await auditService.recordAuditEvent({
      actorUserId: user.userId,
      action: 'INVIGILATOR_ATTEMPT_TERMINATED',
      resourceType: 'ATTEMPT',
      resourceId: attemptId,
      metadata: { interventionId: intervention.intervention_id, reason }
    }).catch(err => logger.warn({ err: err.message }, 'Non-blocking intervention audit log failed'));

    return {
      interventionId: intervention.intervention_id,
      attemptId,
      status: updatedAttempt.status,
      terminatedAt: updatedAttempt.submitted_at,
      reason
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists history of interventions for a session.
 */
export async function getSessionInterventions(sessionId, user, limit = 50, offset = 0) {
  const isAdmin = isUserAdmin(user);
  const isAuthorized = await interventionsRepo.checkInvigilatorSessionAccess(sessionId, user.userId, isAdmin);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied to session interventions');
  }

  return interventionsRepo.listSessionInterventions(sessionId, limit, offset);
}

/**
 * Lists history of interventions for an individual attempt.
 */
export async function getAttemptInterventions(attemptId, user) {
  const attempt = await interventionsRepo.getAttemptDetails(attemptId);
  if (!attempt) {
    throw new NotFoundError('Exam attempt not found');
  }

  const isAdmin = isUserAdmin(user);
  const isStudent = user.userId === attempt.student_id;
  const isInvigilator = await interventionsRepo.checkInvigilatorSessionAccess(attempt.session_id, user.userId, false);

  if (!isAdmin && !isInvigilator && !isStudent) {
    throw new ForbiddenError('Access denied to attempt interventions');
  }

  return interventionsRepo.listAttemptInterventions(attemptId);
}

/**
 * Files a formal post-session / live incident report.
 */
export async function reportSessionIncident({
  sessionId,
  attemptId = null,
  incidentType,
  severity,
  description,
  evidenceIds = [],
  actionTaken,
  user,
  metadata = {}
}) {
  const isAdmin = isUserAdmin(user);
  const isAuthorized = await interventionsRepo.checkInvigilatorSessionAccess(sessionId, user.userId, isAdmin);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied: You are not assigned to invigilate this session');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const flag = await interventionsRepo.createIncidentFlag({
      sessionId,
      attemptId,
      flagType: incidentType,
      severity,
      details: {
        description,
        evidenceIds,
        actionTaken,
        reporterName: user.name || 'Invigilator',
        ...metadata
      },
      reviewerUserId: user.userId
    }, client);

    await client.query('COMMIT');

    // Broadcast notice to session invigilators
    const invigilatorRoom = `session:${sessionId}`;
    await defaultBroadcaster.broadcastToRoom(invigilatorRoom, 'invigilator:intervention_logged', {
      flagId: flag.flag_id,
      sessionId,
      attemptId,
      type: 'INCIDENT_REPORT',
      incidentType,
      severity,
      actionTaken,
      reporterUserId: user.userId,
      timestamp: flag.created_at
    });

    await auditService.recordAuditEvent({
      actorUserId: user.userId,
      action: 'INVIGILATOR_INCIDENT_REPORTED',
      resourceType: 'SESSION',
      resourceId: sessionId,
      attemptId: attemptId || undefined,
      metadata: { flagId: flag.flag_id, incidentType, severity, actionTaken }
    }).catch(err => logger.warn({ err: err.message }, 'Non-blocking incident audit log failed'));

    return flag;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists all incident reports filed for a session.
 */
export async function getSessionIncidents(sessionId, user) {
  const isAdmin = isUserAdmin(user);
  const isAuthorized = await interventionsRepo.checkInvigilatorSessionAccess(sessionId, user.userId, isAdmin);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied to session incidents');
  }

  return interventionsRepo.listSessionIncidents(sessionId);
}

/**
 * Invigilator session sign-off and closure.
 */
export async function signOffSession({
  sessionId,
  checklist = {},
  notes = '',
  signature,
  user
}) {
  const isAdmin = isUserAdmin(user);
  const isAuthorized = await interventionsRepo.checkInvigilatorSessionAccess(sessionId, user.userId, isAdmin);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied: You are not assigned to invigilate this session');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Conclude session status
    const session = await interventionsRepo.concludeSession(sessionId, client);
    if (!session) {
      throw new NotFoundError('Exam session not found');
    }

    // Get aggregated statistics
    const summary = await interventionsRepo.getSessionSummary(sessionId);

    const signOffPayload = {
      sessionId,
      status: 'CONCLUDED',
      signedOffBy: user.userId,
      invigilatorName: user.name || signature,
      signedOffAt: new Date().toISOString(),
      checklist,
      notes,
      signature,
      summary
    };

    await client.query('COMMIT');

    // Realtime notification: session concluded
    await defaultBroadcaster.broadcastToRoom(`session:${sessionId}`, 'session:concluded', {
      sessionId,
      concludedAt: signOffPayload.signedOffAt,
      signedOffBy: user.userId
    });

    await defaultBroadcaster.broadcastToRoom(`session:${sessionId}:candidate`, 'session:announcement', {
      sessionId,
      message: 'The examination session has concluded and is now signed off by the invigilator.',
      senderName: 'System',
      timestamp: signOffPayload.signedOffAt
    });

    // Record immutable audit event
    await auditService.recordAuditEvent({
      actorUserId: user.userId,
      action: 'SESSION_SIGN_OFF',
      resourceType: 'SESSION',
      resourceId: sessionId,
      metadata: signOffPayload
    }).catch(err => logger.warn({ err: err.message }, 'Non-blocking session sign-off audit log failed'));

    return signOffPayload;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves session sign-off status and history.
 */
export async function getSessionSignOffStatus(sessionId, user) {
  const isAdmin = isUserAdmin(user);
  const isAuthorized = await interventionsRepo.checkInvigilatorSessionAccess(sessionId, user.userId, isAdmin);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied to session sign-off details');
  }

  const signOffRecord = await interventionsRepo.getSessionSignOff(sessionId);
  const summary = await interventionsRepo.getSessionSummary(sessionId);

  return {
    sessionId,
    isSignedOff: Boolean(signOffRecord),
    signOff: signOffRecord ? {
      auditId: signOffRecord.audit_id,
      invigilatorName: signOffRecord.invigilator_name,
      signedOffAt: signOffRecord.created_at,
      ...signOffRecord.metadata
    } : null,
    summary
  };
}

