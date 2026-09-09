/**
 * @file proctoring.repository.js
 * @description PostgreSQL persistence layer for proctoring events, violation flags, and attempt risk scores.
 * Conforms strictly to Phase 14 specifications.
 */

import { query } from '../../infrastructure/postgres/pool.js';

/**
 * Locks an exam attempt row for update during event ingestion.
 *
 * @param {string} attemptId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function lockAttemptForIngestion(attemptId, client) {
  const sql = `
    SELECT 
      attempt_id,
      session_id,
      student_id,
      status,
      COALESCE(risk_score, 0) AS risk_score
    FROM exam_attempts
    WHERE attempt_id = $1
    FOR UPDATE;
  `;
  const result = await client.query(sql, [attemptId]);
  return result.rows[0] || null;
}

/**
 * Finds an exam attempt by ID without row locking.
 *
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findAttemptById(attemptId, client = null) {
  const sql = `
    SELECT 
      attempt_id,
      session_id,
      student_id,
      status,
      COALESCE(risk_score, 0) AS risk_score
    FROM exam_attempts
    WHERE attempt_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);
  return result.rows[0] || null;
}

/**
 * Batch inserts candidate violation events with idempotent deduplication.
 * Returns only genuinely inserted new rows.
 *
 * @param {string} attemptId
 * @param {Array<{ eventId: string, eventType: string, severity: string, clientTimestamp: string, metadata: object }>} events
 * @param {import('pg').PoolClient} client
 * @returns {Promise<Array<object>>}
 */
export async function insertViolationEventsBatch(attemptId, events, client) {
  if (!events || events.length === 0) {
    return [];
  }

  // Construct parameter placeholders ($1, $2, $3, $4, $5, $6), ($7, ...), etc.
  const values = [];
  const valueClauses = [];

  events.forEach((event, idx) => {
    const offset = idx * 6;
    valueClauses.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
    );
    values.push(
      attemptId,
      event.eventId,
      event.eventType,
      event.severity,
      new Date(event.clientTimestamp),
      JSON.stringify(event.metadata || {})
    );
  });

  const sql = `
    INSERT INTO violation_events (
      attempt_id,
      client_event_id,
      event_type,
      severity,
      client_timestamp,
      metadata
    )
    VALUES ${valueClauses.join(', ')}
    ON CONFLICT (attempt_id, client_event_id) DO NOTHING
    RETURNING violation_id, client_event_id, event_type, severity, server_timestamp, metadata;
  `;

  const result = await client.query(sql, values);
  return result.rows;
}

/**
 * Updates the authoritative risk score on an exam attempt.
 *
 * @param {string} attemptId
 * @param {number} newScore
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function updateAttemptRiskScore(attemptId, newScore, client) {
  const sql = `
    UPDATE exam_attempts
    SET 
      risk_score = $2,
      updated_at = CURRENT_TIMESTAMP
    WHERE attempt_id = $1
    RETURNING attempt_id, risk_score, updated_at;
  `;
  const result = await client.query(sql, [attemptId, newScore]);
  return result.rows[0];
}

/**
 * Inserts a violation flag into violation_flags.
 * For system-generated flags, utilizes unique index to prevent duplicate flags per attempt.
 *
 * @param {object} flagData
 * @param {string} flagData.attemptId
 * @param {string} flagData.sessionId
 * @param {string} flagData.studentId
 * @param {string} flagData.flagType
 * @param {string} flagData.severity
 * @param {string} [flagData.status='ACTIVE']
 * @param {number} [flagData.scoreDelta=0]
 * @param {string} [flagData.raisedBy='SYSTEM']
 * @param {string} [flagData.reviewerUserId=null]
 * @param {object} [flagData.details={}]
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function insertViolationFlag(flagData, client) {
  const {
    attemptId,
    sessionId,
    studentId,
    flagType,
    severity = 'MEDIUM',
    status = 'ACTIVE',
    scoreDelta = 0,
    raisedBy = 'SYSTEM',
    reviewerUserId = null,
    details = {}
  } = flagData;

  const sql = `
    INSERT INTO violation_flags (
      attempt_id,
      session_id,
      student_id,
      flag_type,
      severity,
      status,
      score_delta,
      raised_by,
      reviewer_user_id,
      details
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ${raisedBy === 'SYSTEM' ? 'ON CONFLICT (attempt_id, flag_type) WHERE raised_by = \'SYSTEM\' DO NOTHING' : ''}
    RETURNING *;
  `;

  const params = [
    attemptId,
    sessionId,
    studentId,
    flagType,
    severity,
    status,
    scoreDelta,
    raisedBy,
    reviewerUserId,
    JSON.stringify(details)
  ];

  const result = await client.query(sql, params);
  return result.rows[0] || null;
}

/**
 * Queries violation events for an attempt with deterministic ordering and pagination.
 *
 * @param {string} attemptId
 * @param {object} filters
 * @param {string} [filters.severity]
 * @param {string} [filters.eventType]
 * @param {object} pagination
 * @param {number} pagination.limit
 * @param {number} pagination.offset
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function findViolationEventsByAttempt(attemptId, filters = {}, pagination = {}, client = null) {
  const conditions = ['attempt_id = $1'];
  const params = [attemptId];
  let paramIdx = 2;

  if (filters.severity) {
    conditions.push(`severity = $${paramIdx}`);
    params.push(filters.severity);
    paramIdx++;
  }

  if (filters.eventType) {
    conditions.push(`event_type = $${paramIdx}`);
    params.push(filters.eventType);
    paramIdx++;
  }

  const limit = pagination.limit || 50;
  const offset = pagination.offset || 0;

  const sql = `
    SELECT 
      violation_id,
      attempt_id,
      event_type,
      severity,
      client_event_id,
      client_timestamp,
      server_timestamp,
      metadata,
      created_at
    FROM violation_events
    WHERE ${conditions.join(' AND ')}
    ORDER BY server_timestamp DESC, violation_id DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1};
  `;
  params.push(limit, offset);

  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, params);
  return result.rows;
}

/**
 * Counts violation events matching filters for pagination.
 *
 * @param {string} attemptId
 * @param {object} filters
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<number>}
 */
export async function countViolationEventsByAttempt(attemptId, filters = {}, client = null) {
  const conditions = ['attempt_id = $1'];
  const params = [attemptId];
  let paramIdx = 2;

  if (filters.severity) {
    conditions.push(`severity = $${paramIdx}`);
    params.push(filters.severity);
    paramIdx++;
  }

  if (filters.eventType) {
    conditions.push(`event_type = $${paramIdx}`);
    params.push(filters.eventType);
    paramIdx++;
  }

  const sql = `
    SELECT COUNT(*)::int AS count
    FROM violation_events
    WHERE ${conditions.join(' AND ')};
  `;

  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, params);
  return result.rows[0]?.count || 0;
}

/**
 * Finds all violation flags for an attempt.
 *
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function findViolationFlagsByAttempt(attemptId, client = null) {
  const sql = `
    SELECT 
      flag_id,
      attempt_id,
      session_id,
      student_id,
      flag_type,
      severity,
      status,
      score_delta,
      raised_by,
      reviewer_user_id,
      details,
      created_at,
      updated_at
    FROM violation_flags
    WHERE attempt_id = $1
    ORDER BY created_at DESC;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);
  return result.rows;
}

/**
 * Locks a violation flag row FOR UPDATE to safely execute status transition.
 *
 * @param {string} flagId
 * @param {string} attemptId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function findFlagByIdForUpdate(flagId, attemptId, client) {
  const sql = `
    SELECT 
      flag_id,
      attempt_id,
      session_id,
      student_id,
      flag_type,
      severity,
      status,
      score_delta,
      raised_by,
      reviewer_user_id,
      details,
      created_at,
      updated_at
    FROM violation_flags
    WHERE flag_id = $1 AND attempt_id = $2
    FOR UPDATE;
  `;
  const result = await client.query(sql, [flagId, attemptId]);
  return result.rows[0] || null;
}

/**
 * Updates status and review annotations for a violation flag.
 *
 * @param {string} flagId
 * @param {object} updateData
 * @param {string} updateData.status
 * @param {string} updateData.reviewerUserId
 * @param {string} [updateData.notes]
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function updateFlagStatus(flagId, updateData, client) {
  const { status, reviewerUserId, notes = '' } = updateData;
  const sql = `
    UPDATE violation_flags
    SET 
      status = $2,
      reviewer_user_id = $3,
      details = details || jsonb_build_object('review_notes', $4::text, 'reviewed_at', CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
    WHERE flag_id = $1
    RETURNING *;
  `;
  const result = await client.query(sql, [flagId, status, reviewerUserId, notes]);
  return result.rows[0];
}

/**
 * Checks whether a user is assigned as an invigilator for a given session.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<boolean>}
 */
export async function isInvigilatorAssignedToSession(sessionId, userId, client = null) {
  const sql = `
    SELECT 1 FROM session_invigilators
    WHERE session_id = $1 AND user_id = $2
    LIMIT 1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [sessionId, userId]);
  return result.rows.length > 0;
}

/**
 * Aggregates candidate proctoring data across all roster candidates in an exam session.
 *
 * @param {string} sessionId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function findSessionProctoringSummary(sessionId, client = null) {
  const sql = `
    WITH candidate_roster AS (
      SELECT 
        ss.session_id,
        ss.student_id,
        u.name AS student_name,
        u.email AS student_email,
        ea.attempt_id,
        ea.status AS attempt_status,
        COALESCE(ea.risk_score, 0) AS risk_score
      FROM session_students ss
      JOIN users u ON ss.student_id = u.user_id
      LEFT JOIN exam_attempts ea ON ss.session_id = ea.session_id AND ss.student_id = ea.student_id
      WHERE ss.session_id = $1
    ),
    violation_stats AS (
      SELECT 
        attempt_id,
        COUNT(*)::int AS violation_count,
        MAX(server_timestamp) AS latest_violation_time
      FROM violation_events
      WHERE attempt_id IN (SELECT attempt_id FROM candidate_roster WHERE attempt_id IS NOT NULL)
      GROUP BY attempt_id
    ),
    active_flag_stats AS (
      SELECT 
        attempt_id,
        COUNT(*)::int AS active_flags_count
      FROM violation_flags
      WHERE status = 'ACTIVE'
        AND attempt_id IN (SELECT attempt_id FROM candidate_roster WHERE attempt_id IS NOT NULL)
      GROUP BY attempt_id
    ),
    latest_violations AS (
      SELECT DISTINCT ON (ve.attempt_id)
        ve.attempt_id,
        ve.event_type,
        ve.severity,
        ve.server_timestamp
      FROM violation_events ve
      WHERE ve.attempt_id IN (SELECT attempt_id FROM candidate_roster WHERE attempt_id IS NOT NULL)
      ORDER BY ve.attempt_id, ve.server_timestamp DESC, ve.violation_id DESC
    )
    SELECT 
      cr.student_id,
      cr.student_name,
      cr.student_email,
      cr.attempt_id,
      cr.attempt_status,
      cr.risk_score,
      COALESCE(vs.violation_count, 0) AS violation_count,
      COALESCE(afs.active_flags_count, 0) AS active_flags_count,
      CASE 
        WHEN lv.event_type IS NOT NULL THEN jsonb_build_object(
          'eventType', lv.event_type,
          'severity', lv.severity,
          'serverTimestamp', lv.server_timestamp
        )
        ELSE NULL
      END AS latest_violation
    FROM candidate_roster cr
    LEFT JOIN violation_stats vs ON cr.attempt_id = vs.attempt_id
    LEFT JOIN active_flag_stats afs ON cr.attempt_id = afs.attempt_id
    LEFT JOIN latest_violations lv ON cr.attempt_id = lv.attempt_id
    ORDER BY cr.risk_score DESC, cr.student_name ASC;
  `;

  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [sessionId]);
  return result.rows;
}

/**
 * Retrieves recent violation events for an attempt within a sliding window (in seconds).
 *
 * @param {string} attemptId
 * @param {number} [windowSeconds=300]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function getRecentEventsForAttempt(attemptId, windowSeconds = 300, client = null) {
  const sql = `
    SELECT violation_id, client_event_id, event_type, severity, server_timestamp, metadata
    FROM violation_events
    WHERE attempt_id = $1
      AND server_timestamp >= NOW() - ($2 || ' seconds')::INTERVAL
    ORDER BY server_timestamp DESC;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId, windowSeconds]);
  return result.rows;
}

/**
 * Computes the cumulative technical risk points already accrued by an attempt.
 *
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<number>}
 */
export async function getTechnicalRiskPointsForAttempt(attemptId, client = null) {
  const sql = `
    SELECT event_type, metadata
    FROM violation_events
    WHERE attempt_id = $1
      AND event_type IN ('SCREEN_CAPTURE_INTERRUPTED', 'SCREEN_STREAM_DEGRADED');
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);
  let points = 0;
  for (const row of result.rows) {
    if (row.event_type === 'SCREEN_CAPTURE_INTERRUPTED') points += 10;
    if (row.event_type === 'SCREEN_STREAM_DEGRADED') points += 2;
  }
  return points;
}

/**
 * Retrieves all distinct event types recorded for an attempt.
 *
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<string>>}
 */
export async function getAllEventTypesForAttempt(attemptId, client = null) {
  const sql = `
    SELECT DISTINCT event_type
    FROM violation_events
    WHERE attempt_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);
  return result.rows.map((r) => r.event_type);
}
