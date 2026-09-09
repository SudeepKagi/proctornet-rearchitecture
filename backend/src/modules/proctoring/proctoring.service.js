/**
 * @file proctoring.service.js
 * @description Core business logic for Candidate Proctoring Telemetry Ingestion,
 * Server-Authoritative Anomaly Scoring, Outbox Event Creation, and Flag Lifecycle Management.
 * Strictly adheres to Phase 14 specifications.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';
import * as proctoringRepo from './proctoring.repository.js';
import { EVENT_TAXONOMY, calculateNewRiskScore, evaluateFlagsToRaise, getEventWeight } from './anomalyScorer.js';
import { insertOutboxEvent } from '../outbox/outbox.repository.js';
import { triggerOutboxDispatch } from '../outbox/outbox.service.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import {
  proctoringEventsTotal,
  proctoringIngestDuration,
  proctoringFlagsTotal,
  wsBroadcastErrorsTotal
} from '../../infrastructure/metrics/registry.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError
} from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { defaultBroadcaster } from '../../infrastructure/realtime/index.js';

/**
 * Checks if a user has staff authority over an exam session.
 *
 * @param {string} sessionId
 * @param {object} user - Authenticated user { userId, roles }
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<boolean>}
 */
async function authorizeStaffForSession(sessionId, user, client = null) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('ADMIN') || roles.includes('FACULTY')) {
    return true;
  }
  if (roles.includes('INVIGILATOR')) {
    const isAssigned = await proctoringRepo.isInvigilatorAssignedToSession(sessionId, user.userId, client);
    if (isAssigned) {
      return true;
    }
  }
  return false;
}

/**
 * Ingests a batch of candidate violation and telemetry events.
 * Executes atomically in a single PostgreSQL transaction with row-level locking on exam_attempts.
 *
 * @param {string} attemptId
 * @param {object} user - Authenticated student user
 * @param {Array<object>} events - Validated client event items
 * @returns {Promise<{ accepted: number, deduplicated: number, riskScore: number, activeFlagsCount: number }>}
 */
export async function ingestCandidateEvents(attemptId, user, events) {
  const startTime = process.hrtime.bigint();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock the attempt row FOR UPDATE to serialize scoring and prevent race conditions
    const attempt = await proctoringRepo.lockAttemptForIngestion(attemptId, client);
    if (!attempt) {
      throw new NotFoundError(`Exam attempt '${attemptId}' not found`);
    }

    // 2. Authorize attempt ownership
    if (attempt.student_id !== user?.userId) {
      throw new ForbiddenError('Forbidden: You can only submit proctoring telemetry for your own attempt');
    }

    // 3. Verify attempt is ACTIVE
    if (attempt.status !== 'ACTIVE') {
      throw new ConflictError(
        `Attempt is in status '${attempt.status}'. Telemetry is only accepted for ACTIVE attempts.`,
        'ATTEMPT_NOT_ACTIVE'
      );
    }

    // 4. Map each event to server-assigned authoritative severity from EVENT_TAXONOMY
    const mappedEvents = events.map((event) => {
      const taxonomy = EVENT_TAXONOMY[event.eventType];
      if (!taxonomy) {
        throw new BadRequestError(`Invalid event type '${event.eventType}'`);
      }
      const { effectiveSeverity } = getEventWeight(event);
      return {
        eventId: event.eventId,
        eventType: event.eventType,
        severity: effectiveSeverity || taxonomy.severity,
        clientTimestamp: event.clientTimestamp,
        metadata: event.metadata || {}
      };
    });

    // Fetch contextual telemetry for sliding-window escalation and correlation
    const recentEvents = await proctoringRepo.getRecentEventsForAttempt(attemptId, 300, client);
    const currentTechnicalPoints = await proctoringRepo.getTechnicalRiskPointsForAttempt(attemptId, client);
    const recentFullscreenCount = recentEvents.filter((e) => e.event_type === 'FULLSCREEN_EXIT').length;

    // STAGE 3: Server-side Correlation for REPEATED_CONTEXT_SWITCHING
    // Check if client events or recent window show focus/visibility loss coinciding with non-exam context
    const hasFocusLoss = mappedEvents.some((e) =>
      ['BROWSER_FOCUS_LOST', 'EXAM_VISIBILITY_LOST', 'WINDOW_BLUR', 'TAB_HIDDEN'].includes(e.eventType)
    );
    const hasNonExamContext = mappedEvents.some(
      (e) => e.eventType === 'SCREEN_CONTEXT_CLASSIFICATION' && e.metadata?.contextState === 'NON_EXAM_CONTEXT'
    );
    const recentFocusLoss = recentEvents.some(
      (e) => ['BROWSER_FOCUS_LOST', 'EXAM_VISIBILITY_LOST', 'WINDOW_BLUR', 'TAB_HIDDEN'].includes(e.event_type) &&
             (Date.now() - new Date(e.server_timestamp).getTime()) <= 3000
    );
    const recentNonExam = recentEvents.some(
      (e) => e.event_type === 'SCREEN_CONTEXT_CLASSIFICATION' && e.metadata?.contextState === 'NON_EXAM_CONTEXT' &&
             (Date.now() - new Date(e.server_timestamp).getTime()) <= 3000
    );

    const isCorrelated = (hasFocusLoss && (hasNonExamContext || recentNonExam)) || (hasNonExamContext && recentFocusLoss);
    const alreadyDerivedRecently = recentEvents.some(
      (e) => e.event_type === 'REPEATED_CONTEXT_SWITCHING' &&
             (Date.now() - new Date(e.server_timestamp).getTime()) <= 10000
    );

    if (isCorrelated && !alreadyDerivedRecently) {
      mappedEvents.push({
        eventId: crypto.randomUUID(),
        eventType: 'REPEATED_CONTEXT_SWITCHING',
        severity: 'HIGH',
        clientTimestamp: new Date().toISOString(),
        metadata: {
          reason: 'Server-correlated focus loss coinciding with non-exam visual context',
          autoDerived: true,
          source: 'BROWSER'
        }
      });
    }

    // 5. Batch insert into violation_events with ON CONFLICT DO NOTHING
    const insertedRows = await proctoringRepo.insertViolationEventsBatch(attemptId, mappedEvents, client);
    const accepted = insertedRows.length;
    const deduplicated = events.length - accepted;

    const currentScore = Number(attempt.risk_score) || 0;
    let newScore = currentScore;
    let flagsCreated = 0;

    // 6. If new genuine events were accepted, update risk score and evaluate flags
    if (accepted > 0) {
      const allEventsOnAttempt = await proctoringRepo.getAllEventTypesForAttempt(attemptId, client);
      const hasOnlyTechnicalEvents = allEventsOnAttempt.length > 0 &&
        allEventsOnAttempt.every((type) => type === 'SCREEN_CAPTURE_INTERRUPTED' || type === 'SCREEN_STREAM_DEGRADED');

      newScore = calculateNewRiskScore(currentScore, insertedRows, {
        currentTechnicalPoints,
        recentFullscreenCount,
        hasOnlyTechnicalEvents
      });

      if (newScore !== currentScore) {
        await proctoringRepo.updateAttemptRiskScore(attemptId, newScore, client);
      }

      // Evaluate flag threshold crossings and immediate event overrides
      const flagsToRaise = evaluateFlagsToRaise(currentScore, newScore, insertedRows, {
        hasOnlyTechnicalEvents,
        recentFullscreenCount
      });
      const createdFlagsList = [];

      for (const flag of flagsToRaise) {
        const createdFlag = await proctoringRepo.insertViolationFlag(
          {
            attemptId,
            sessionId: attempt.session_id,
            studentId: attempt.student_id,
            flagType: flag.flagType,
            severity: flag.severity,
            status: 'ACTIVE',
            scoreDelta: flag.scoreDelta,
            raisedBy: 'SYSTEM',
            details: flag.details
          },
          client
        );

        if (createdFlag) {
          flagsCreated++;
          createdFlagsList.push({
            flagId: createdFlag.flag_id,
            attemptId,
            sessionId: attempt.session_id,
            studentId: attempt.student_id,
            flagType: flag.flagType,
            severity: flag.severity,
            scoreDelta: flag.scoreDelta,
            details: flag.details,
            createdAt: createdFlag.created_at
          });

          // Atomically insert PROCTORING_FLAG_RAISED into outbox_events
          await insertOutboxEvent(
            {
              aggregateType: 'ATTEMPT',
              aggregateId: attemptId,
              eventType: 'PROCTORING_FLAG_RAISED',
              payload: {
                flagId: createdFlag.flag_id,
                attemptId,
                sessionId: attempt.session_id,
                studentId: attempt.student_id,
                flagType: flag.flagType,
                severity: flag.severity,
                details: flag.details,
                createdAt: createdFlag.created_at
              }
            },
            client
          );

          proctoringFlagsTotal.inc({ flag_type: flag.flagType, severity: flag.severity });
        }
      }

      // 7. Commit database transaction
      await client.query('COMMIT');

      // Post-commit realtime broadcast (strictly isolated with try/catch)
      if (newScore !== currentScore) {
        try {
          defaultBroadcaster.broadcastToSession(attempt.session_id, 'proctoring:risk_score_updated', {
            studentId: attempt.student_id,
            attemptId,
            riskScore: newScore,
            scoreDelta: newScore - currentScore
          }).catch((err) => {
            wsBroadcastErrorsTotal.inc();
            logger.warn({ err, attemptId }, 'Failed to broadcast proctoring:risk_score_updated');
          });
        } catch (broadcastErr) {
          wsBroadcastErrorsTotal.inc();
          logger.warn({ err: broadcastErr, attemptId }, 'Realtime broadcast error on risk score update');
        }
      }

      for (const cf of createdFlagsList) {
        try {
          defaultBroadcaster.broadcastToSession(attempt.session_id, 'proctoring:flag_raised', cf).catch((err) => {
            wsBroadcastErrorsTotal.inc();
            logger.warn({ err, flagId: cf.flagId }, 'Failed to broadcast proctoring:flag_raised');
          });
        } catch (broadcastErr) {
          wsBroadcastErrorsTotal.inc();
          logger.warn({ err: broadcastErr, flagId: cf.flagId }, 'Realtime broadcast error on flag raised');
        }
      }
    } else {
      // 7. Commit database transaction even when no new events inserted
      await client.query('COMMIT');
    }

    // 8. Track Prometheus metrics
    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1e9;
    proctoringIngestDuration.observe({ status: 'success' }, durationSeconds);

    for (const row of insertedRows) {
      proctoringEventsTotal.inc({ event_type: row.event_type, severity: row.severity });
    }

    // 9. Asynchronously trigger outbox poller if new flags were raised
    if (flagsCreated > 0) {
      setImmediate(() => {
        triggerOutboxDispatch().catch((err) => {
          logger.error({ err, attemptId }, 'Background outbox dispatch error after proctoring flag raised');
        });
      });
    }

    // Count active flags for response
    const currentFlags = await proctoringRepo.findViolationFlagsByAttempt(attemptId);
    const activeFlagsCount = currentFlags.filter((f) => f.status === 'ACTIVE').length;

    return {
      accepted,
      deduplicated,
      riskScore: newScore,
      activeFlagsCount
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1e9;
    proctoringIngestDuration.observe({ status: 'error' }, durationSeconds);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves the paginated violation timeline and active flags for an attempt.
 * Restricted to assigned invigilators, faculty, and administrators. Candidates forbidden (403).
 *
 * @param {string} attemptId
 * @param {object} user - Authenticated user
 * @param {object} queryParams
 * @returns {Promise<object>}
 */
export async function getAttemptTimeline(attemptId, user, queryParams = {}) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('STUDENT') && !roles.includes('ADMIN') && !roles.includes('FACULTY') && !roles.includes('INVIGILATOR')) {
    throw new ForbiddenError('Students are not permitted to inspect proctoring event timelines');
  }

  const attempt = await proctoringRepo.findAttemptById(attemptId);
  if (!attempt) {
    throw new NotFoundError(`Exam attempt '${attemptId}' not found`);
  }

  const isAuthorized = await authorizeStaffForSession(attempt.session_id, user);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied: You are not assigned to this proctoring session');
  }

  const page = queryParams.page || 1;
  const limit = queryParams.limit || 50;
  const offset = (page - 1) * limit;

  const filters = {};
  if (queryParams.severity) filters.severity = queryParams.severity;
  if (queryParams.eventType) filters.eventType = queryParams.eventType;

  const [events, totalEvents, flags] = await Promise.all([
    proctoringRepo.findViolationEventsByAttempt(attemptId, filters, { limit, offset }),
    proctoringRepo.countViolationEventsByAttempt(attemptId, filters),
    proctoringRepo.findViolationFlagsByAttempt(attemptId)
  ]);

  return {
    attemptId,
    riskScore: Number(attempt.risk_score) || 0,
    events: events.map((e) => ({
      violationId: e.violation_id,
      eventType: e.event_type,
      severity: e.severity,
      clientEventId: e.client_event_id,
      clientTimestamp: e.client_timestamp,
      serverTimestamp: e.server_timestamp,
      metadata: e.metadata
    })),
    flags: flags.map((f) => ({
      flagId: f.flag_id,
      flagType: f.flag_type,
      severity: f.severity,
      status: f.status,
      scoreDelta: f.score_delta,
      raisedBy: f.raised_by,
      reviewerUserId: f.reviewer_user_id,
      details: f.details,
      createdAt: f.created_at,
      updatedAt: f.updated_at
    })),
    pagination: {
      page,
      limit,
      total: totalEvents,
      totalPages: Math.ceil(totalEvents / limit) || 1
    }
  };
}

/**
 * Retrieves the aggregated proctoring summary across all candidates in a session.
 * Restricted to assigned invigilators, faculty, and administrators.
 *
 * @param {string} sessionId
 * @param {object} user - Authenticated user
 * @returns {Promise<object>}
 */
export async function getSessionProctoringSummary(sessionId, user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('STUDENT') && !roles.includes('ADMIN') && !roles.includes('FACULTY') && !roles.includes('INVIGILATOR')) {
    throw new ForbiddenError('Students are not permitted to inspect session proctoring summaries');
  }

  const isAuthorized = await authorizeStaffForSession(sessionId, user);
  if (!isAuthorized) {
    throw new ForbiddenError('Access denied: You are not assigned to this proctoring session');
  }

  const candidateSummaries = await proctoringRepo.findSessionProctoringSummary(sessionId);

  const totalStudents = candidateSummaries.length;
  const activeAttempts = candidateSummaries.filter((c) => c.attempt_status === 'ACTIVE').length;
  const highRiskAttemptsCount = candidateSummaries.filter((c) => (Number(c.risk_score) || 0) >= 50).length;

  return {
    sessionId,
    totalStudents,
    activeAttempts,
    highRiskAttemptsCount,
    candidates: candidateSummaries.map((c) => ({
      studentId: c.student_id,
      name: c.student_name,
      email: c.student_email,
      attemptId: c.attempt_id,
      status: c.attempt_status,
      riskScore: Number(c.risk_score) || 0,
      violationCount: Number(c.violation_count) || 0,
      activeFlagsCount: Number(c.active_flags_count) || 0,
      latestViolation: c.latest_violation
    }))
  };
}

/**
 * Creates a manual violation flag for an attempt.
 * Derives session_id and student_id server-side from exam_attempts.
 *
 * @param {string} attemptId
 * @param {object} user - Authenticated staff user
 * @param {object} flagData
 * @param {string} flagData.flagType
 * @param {string} [flagData.severity='MEDIUM']
 * @param {string} [flagData.notes]
 * @returns {Promise<object>}
 */
export async function createManualProctorFlag(attemptId, user, flagData) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const attempt = await proctoringRepo.lockAttemptForIngestion(attemptId, client);
    if (!attempt) {
      throw new NotFoundError(`Exam attempt '${attemptId}' not found`);
    }

    const isAuthorized = await authorizeStaffForSession(attempt.session_id, user, client);
    if (!isAuthorized) {
      throw new ForbiddenError('Access denied: You are not assigned to this proctoring session');
    }

    const createdFlag = await proctoringRepo.insertViolationFlag(
      {
        attemptId,
        sessionId: attempt.session_id,
        studentId: attempt.student_id,
        flagType: flagData.flagType,
        severity: flagData.severity || 'MEDIUM',
        status: 'ACTIVE',
        scoreDelta: 0,
        raisedBy: 'PROCTOR',
        reviewerUserId: user.userId,
        details: {
          manualNotes: flagData.notes || '',
          createdByUserId: user.userId
        }
      },
      client
    );

    // Atomically emit PROCTOR_FLAG_CREATED in audit_logs
    await recordAuditEvent(
      {
        actorUserId: user.userId,
        action: 'PROCTOR_FLAG_CREATED',
        resourceType: 'PROCTORING_FLAG',
        resourceId: createdFlag.flag_id,
        attemptId,
        metadata: {
          sessionId: attempt.session_id,
          studentId: attempt.student_id,
          flagType: createdFlag.flag_type,
          severity: createdFlag.severity,
          notes: flagData.notes || ''
        }
      },
      client
    );

    await client.query('COMMIT');

    // Post-commit realtime broadcast (strictly isolated with try/catch)
    try {
      defaultBroadcaster.broadcastToSession(attempt.session_id, 'proctoring:flag_raised', {
        flagId: createdFlag.flag_id,
        attemptId,
        sessionId: attempt.session_id,
        studentId: attempt.student_id,
        flagType: createdFlag.flag_type,
        severity: createdFlag.severity,
        scoreDelta: 0,
        raisedBy: 'PROCTOR',
        details: createdFlag.details,
        createdAt: createdFlag.created_at
      }).catch((err) => {
        wsBroadcastErrorsTotal.inc();
        logger.warn({ err, flagId: createdFlag.flag_id }, 'Failed to broadcast proctoring:flag_raised (manual)');
      });
    } catch (broadcastErr) {
      wsBroadcastErrorsTotal.inc();
      logger.warn({ err: broadcastErr, flagId: createdFlag.flag_id }, 'Realtime broadcast error on manual flag raised');
    }

    proctoringFlagsTotal.inc({ flag_type: createdFlag.flag_type, severity: createdFlag.severity });

    return createdFlag;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Updates the review status of a violation flag (ACTIVE -> REVIEWED or ACTIVE -> DISMISSED).
 * Sets reviewer_user_id and records PROCTOR_FLAG_REVIEWED in audit_logs atomically.
 *
 * @param {string} attemptId
 * @param {string} flagId
 * @param {object} user - Authenticated staff user
 * @param {object} updateData
 * @param {string} updateData.status
 * @param {string} [updateData.notes]
 * @returns {Promise<object>}
 */
export async function updateProctorFlagStatus(attemptId, flagId, user, updateData) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const flag = await proctoringRepo.findFlagByIdForUpdate(flagId, attemptId, client);
    if (!flag) {
      throw new NotFoundError(`Violation flag '${flagId}' not found for attempt '${attemptId}'`);
    }

    const isAuthorized = await authorizeStaffForSession(flag.session_id, user, client);
    if (!isAuthorized) {
      throw new ForbiddenError('Access denied: You are not assigned to this proctoring session');
    }

    if (flag.status !== 'ACTIVE') {
      throw new ConflictError(
        `Flag is already in terminal status '${flag.status}' and cannot be reviewed again`,
        'FLAG_ALREADY_REVIEWED'
      );
    }

    const updatedFlag = await proctoringRepo.updateFlagStatus(
      flagId,
      {
        status: updateData.status,
        reviewerUserId: user.userId,
        notes: updateData.notes || ''
      },
      client
    );

    // Atomically emit PROCTOR_FLAG_REVIEWED in audit_logs
    await recordAuditEvent(
      {
        actorUserId: user.userId,
        action: 'PROCTOR_FLAG_REVIEWED',
        resourceType: 'PROCTORING_FLAG',
        resourceId: flagId,
        attemptId,
        metadata: {
          previousStatus: flag.status,
          newStatus: updateData.status,
          flagType: flag.flag_type,
          severity: flag.severity,
          notes: updateData.notes || ''
        }
      },
      client
    );

    await client.query('COMMIT');

    // Post-commit realtime broadcast (strictly isolated with try/catch)
    try {
      defaultBroadcaster.broadcastToSession(flag.session_id, 'proctoring:flag_reviewed', {
        flagId,
        attemptId,
        sessionId: flag.session_id,
        studentId: flag.student_id,
        previousStatus: flag.status,
        newStatus: updateData.status,
        reviewerUserId: user.userId,
        reviewedAt: new Date().toISOString()
      }).catch((err) => {
        wsBroadcastErrorsTotal.inc();
        logger.warn({ err, flagId }, 'Failed to broadcast proctoring:flag_reviewed');
      });
    } catch (broadcastErr) {
      wsBroadcastErrorsTotal.inc();
      logger.warn({ err: broadcastErr, flagId }, 'Realtime broadcast error on flag review');
    }

    return updatedFlag;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
