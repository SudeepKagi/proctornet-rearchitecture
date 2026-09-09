/**
 * @file interventions.repository.js
 * @description Database operations for invigilator realtime interventions, state transitions, and audit logs.
 * Conforms to Phase 26 Track 2 Workstream F.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

/**
 * Validates invigilator authorization for a session.
 * Admins are universally authorized; invigilators must be mapped in session_invigilators.
 */
export async function checkInvigilatorSessionAccess(sessionId, userId, isAdmin = false) {
  if (isAdmin) return true;

  const sql = `
    SELECT 1 FROM session_invigilators
    WHERE session_id = $1 AND user_id = $2;
  `;
  const res = await query(sql, [sessionId, userId]);
  return res.rowCount > 0;
}

/**
 * Retrieves attempt details required for intervention commands.
 */
export async function getAttemptDetails(attemptId, client = null) {
  const sql = `
    SELECT ea.attempt_id, ea.session_id, ea.student_id, ea.status,
           ea.started_at, ea.submitted_at, ea.expires_at, ea.paused_at,
           ea.total_paused_ms, ea.pause_reason, ea.termination_reason,
           u.name as student_name, u.email as student_email,
           es.exam_id
    FROM exam_attempts ea
    JOIN users u ON ea.student_id = u.user_id
    JOIN exam_sessions es ON ea.session_id = es.session_id
    WHERE ea.attempt_id = $1;
  `;
  const res = client ? await client.query(sql, [attemptId]) : await query(sql, [attemptId]);
  return res.rows[0] || null;
}

/**
 * Checks for an existing intervention with the given idempotency key.
 */
export async function findInterventionByIdempotencyKey(idempotencyKey, sessionId, attemptId = null) {
  if (!idempotencyKey) return null;

  const sql = `
    SELECT intervention_id, session_id, attempt_id, invigilator_user_id,
           type, message, reason, metadata, created_at
    FROM proctor_interventions
    WHERE session_id = $1
      AND ($2::uuid IS NULL OR attempt_id = $2)
      AND metadata->>'idempotencyKey' = $3;
  `;
  const res = await query(sql, [sessionId, attemptId, idempotencyKey]);
  return res.rows[0] || null;
}

/**
 * Records an intervention entry into proctor_interventions.
 */
export async function recordIntervention({
  sessionId,
  attemptId = null,
  invigilatorUserId,
  type,
  message = null,
  reason = null,
  metadata = {}
}, client = null) {
  const sql = `
    INSERT INTO proctor_interventions (
      session_id, attempt_id, invigilator_user_id, type, message, reason, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
  const res = client
    ? await client.query(sql, [sessionId, attemptId, invigilatorUserId, type, message, reason, JSON.stringify(metadata)])
    : await query(sql, [sessionId, attemptId, invigilatorUserId, type, message, reason, JSON.stringify(metadata)]);

  return res.rows[0];
}

/**
 * Atomically transitions an ACTIVE attempt to PAUSED.
 * Guarantees race-safety against concurrent SUBMIT or TERMINATE.
 */
export async function pauseAttemptAtomic({ attemptId, invigilatorUserId, reason }, client) {
  const sql = `
    UPDATE exam_attempts
    SET status = 'PAUSED',
        paused_at = CURRENT_TIMESTAMP,
        paused_by_user_id = $2,
        pause_reason = $3
    WHERE attempt_id = $1 AND status = 'ACTIVE'
    RETURNING *;
  `;
  const res = await client.query(sql, [attemptId, invigilatorUserId, reason]);
  return res.rows[0] || null;
}

/**
 * Atomically transitions a PAUSED attempt to ACTIVE, adjusting expires_at and total_paused_ms.
 */
export async function resumeAttemptAtomic({ attemptId, extensionSeconds = 0 }, client) {
  const sql = `
    UPDATE exam_attempts
    SET status = 'ACTIVE',
        expires_at = expires_at + (CURRENT_TIMESTAMP - paused_at) + ($2 || ' seconds')::interval,
        total_paused_ms = total_paused_ms + ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - paused_at)) * 1000),
        paused_at = NULL,
        paused_by_user_id = NULL,
        pause_reason = NULL
    WHERE attempt_id = $1 AND status = 'PAUSED'
    RETURNING *;
  `;
  const res = await client.query(sql, [attemptId, extensionSeconds]);
  return res.rows[0] || null;
}

/**
 * Atomically transitions an ACTIVE or PAUSED attempt to TERMINATED.
 */
export async function terminateAttemptAtomic({ attemptId, invigilatorUserId, reason }, client) {
  const sql = `
    UPDATE exam_attempts
    SET status = 'TERMINATED',
        submitted_at = CURRENT_TIMESTAMP,
        terminated_by_user_id = $2,
        termination_reason = $3
    WHERE attempt_id = $1 AND status IN ('ACTIVE', 'PAUSED')
    RETURNING *;
  `;
  const res = await client.query(sql, [attemptId, invigilatorUserId, reason]);
  return res.rows[0] || null;
}

/**
 * Lists interventions for a session with pagination.
 */
export async function listSessionInterventions(sessionId, limit = 50, offset = 0) {
  const sql = `
    SELECT pi.intervention_id, pi.session_id, pi.attempt_id, pi.type,
           pi.message, pi.reason, pi.metadata, pi.created_at,
           u.name as invigilator_name, u.email as invigilator_email,
           stu.name as candidate_name, stu.email as candidate_email
    FROM proctor_interventions pi
    JOIN users u ON pi.invigilator_user_id = u.user_id
    LEFT JOIN exam_attempts ea ON pi.attempt_id = ea.attempt_id
    LEFT JOIN users stu ON ea.student_id = stu.user_id
    WHERE pi.session_id = $1
    ORDER BY pi.created_at DESC
    LIMIT $2 OFFSET $3;
  `;
  const res = await query(sql, [sessionId, limit, offset]);
  return res.rows;
}

/**
 * Lists interventions for a specific attempt.
 */
export async function listAttemptInterventions(attemptId) {
  const sql = `
    SELECT pi.intervention_id, pi.session_id, pi.attempt_id, pi.type,
           pi.message, pi.reason, pi.metadata, pi.created_at,
           u.name as invigilator_name, u.email as invigilator_email
    FROM proctor_interventions pi
    JOIN users u ON pi.invigilator_user_id = u.user_id
    WHERE pi.attempt_id = $1
    ORDER BY pi.created_at ASC;
  `;
  const res = await query(sql, [attemptId]);
  return res.rows;
}

/**
 * Creates a formal incident report / proctor violation flag.
 */
export async function createIncidentFlag({
  sessionId,
  attemptId = null,
  studentId = null,
  flagType,
  severity = 'MEDIUM',
  details = {},
  reviewerUserId
}, client = null) {
  // If studentId not passed but attemptId provided, resolve student_id
  let resolvedStudentId = studentId;
  if (!resolvedStudentId && attemptId) {
    const attSql = `SELECT student_id FROM exam_attempts WHERE attempt_id = $1;`;
    const attRes = client ? await client.query(attSql, [attemptId]) : await query(attSql, [attemptId]);
    resolvedStudentId = attRes.rows[0]?.student_id || null;
  }

  // If still no studentId (room-level incident), use reviewerUserId as placeholder or handle null
  // In violation_flags, student_id NOT NULL REFERENCES users(user_id)
  const effectiveStudentId = resolvedStudentId || reviewerUserId;

  const sql = `
    INSERT INTO violation_flags (
      session_id, attempt_id, student_id, flag_type, severity,
      status, raised_by, reviewer_user_id, details
    )
    VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'PROCTOR', $6, $7)
    RETURNING *;
  `;
  const res = client
    ? await client.query(sql, [sessionId, attemptId, effectiveStudentId, flagType, severity, reviewerUserId, JSON.stringify(details)])
    : await query(sql, [sessionId, attemptId, effectiveStudentId, flagType, severity, reviewerUserId, JSON.stringify(details)]);

  return res.rows[0];
}

/**
 * Lists proctor-filed incident reports for a session.
 */
export async function listSessionIncidents(sessionId) {
  const sql = `
    SELECT vf.flag_id, vf.session_id, vf.attempt_id, vf.student_id,
           vf.flag_type, vf.severity, vf.status, vf.details, vf.created_at,
           u.name as candidate_name, u.email as candidate_email,
           rev.name as reporter_name, rev.email as reporter_email
    FROM violation_flags vf
    LEFT JOIN users u ON vf.student_id = u.user_id
    LEFT JOIN users rev ON vf.reviewer_user_id = rev.user_id
    WHERE vf.session_id = $1 AND vf.raised_by = 'PROCTOR'
    ORDER BY vf.created_at DESC;
  `;
  const res = await query(sql, [sessionId]);
  return res.rows;
}

/**
 * Concludes a session and marks status CONCLUDED.
 */
export async function concludeSession(sessionId, client = null) {
  const sql = `
    UPDATE exam_sessions
    SET status = 'CONCLUDED',
        updated_at = CURRENT_TIMESTAMP
    WHERE session_id = $1
    RETURNING *;
  `;
  const res = client ? await client.query(sql, [sessionId]) : await query(sql, [sessionId]);
  return res.rows[0] || null;
}

/**
 * Retrieves aggregate session summary statistics for sign-off.
 */
export async function getSessionSummary(sessionId) {
  const enrolledRes = await query(`
    SELECT COUNT(DISTINCT student_id)::int as enrolled_count
    FROM session_students WHERE session_id = $1;
  `, [sessionId]);

  const attemptsRes = await query(`
    SELECT
      COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END)::int as submitted_count,
      COUNT(CASE WHEN status = 'TERMINATED' THEN 1 END)::int as terminated_count,
      COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int as active_count,
      COUNT(CASE WHEN status = 'PAUSED' THEN 1 END)::int as paused_count
    FROM exam_attempts WHERE session_id = $1;
  `, [sessionId]);

  const incidentsRes = await query(`
    SELECT COUNT(*)::int as incident_count
    FROM violation_flags WHERE session_id = $1 AND raised_by = 'PROCTOR';
  `, [sessionId]);

  return {
    enrolledCount: enrolledRes.rows[0]?.enrolled_count || 0,
    submittedCount: attemptsRes.rows[0]?.submitted_count || 0,
    terminatedCount: attemptsRes.rows[0]?.terminated_count || 0,
    activeCount: attemptsRes.rows[0]?.active_count || 0,
    pausedCount: attemptsRes.rows[0]?.paused_count || 0,
    incidentCount: incidentsRes.rows[0]?.incident_count || 0
  };
}

/**
 * Retrieves sign-off record from audit_logs for a session.
 */
export async function getSessionSignOff(sessionId) {
  const sql = `
    SELECT al.audit_id, al.actor_user_id, al.action, al.created_at, al.metadata,
           u.name as invigilator_name, u.email as invigilator_email
    FROM audit_logs al
    JOIN users u ON al.actor_user_id = u.user_id
    WHERE al.resource_type = 'SESSION'
      AND al.resource_id = $1
      AND al.action = 'SESSION_SIGN_OFF'
    ORDER BY al.created_at DESC
    LIMIT 1;
  `;
  const res = await query(sql, [sessionId]);
  return res.rows[0] || null;
}

