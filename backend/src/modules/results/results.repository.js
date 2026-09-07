/**
 * @file results.repository.js
 * @description PostgreSQL persistence layer for Phase 9 Results visibility, listing, summary stats, publication, and release policy.
 * Conforms to Step 13.5, Step 13.7, and Phase 9 Architecture specifications.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

/**
 * Retrieves candidate result record with authoritative PostgreSQL visibility evaluation.
 * Note: Does not scope by candidateUserId in WHERE clause so service layer can distinguish
 * between 404 (Attempt Not Found) and 403 (BOLA Forbidden).
 *
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
export async function getCandidateResultByAttemptId(attemptId, client = null) {
  const sql = `
    SELECT
      a.attempt_id,
      a.student_id,
      a.session_id,
      a.status AS attempt_status,
      e.exam_id,
      e.title AS exam_title,
      e.status AS exam_status,
      e.total_marks,
      e.passing_marks,
      e.results_release_policy,
      e.results_release_at,
      e.results_published_at,
      r.result_id,
      r.score,
      r.correct_count,
      r.wrong_count,
      r.unanswered_count,
      r.evaluated_at,
      CASE
        WHEN e.status = 'RESULT_PUBLISHED' OR e.results_published_at IS NOT NULL THEN TRUE
        WHEN e.status IN ('ENDED', 'EVALUATED') AND e.results_release_policy = 'IMMEDIATE' THEN TRUE
        WHEN e.status IN ('ENDED', 'EVALUATED') AND e.results_release_policy = 'SCHEDULED'
             AND e.results_release_at IS NOT NULL AND transaction_timestamp() >= e.results_release_at THEN TRUE
        ELSE FALSE
      END AS is_candidate_visible
    FROM exam_attempts a
    JOIN exam_sessions s ON a.session_id = s.session_id
    JOIN exams e ON s.exam_id = e.exam_id
    LEFT JOIN results r ON a.attempt_id = r.attempt_id
    WHERE a.attempt_id = $1;
  `;

  const res = client ? await client.query(sql, [attemptId]) : await query(sql, [attemptId]);
  return res.rows[0] || null;
}

/**
 * Lists evaluated results for an exam with pagination, filtering, and role scoping.
 *
 * @param {string} examId
 * @param {Object} options
 * @param {string} [options.sessionId]
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @param {string} [options.invigilatorUserId]
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<{ rows: Array<object>, totalCount: number }>}
 */
export async function listExamResults(
  examId,
  { sessionId = null, limit = 50, offset = 0, invigilatorUserId = null } = {},
  client = null
) {
  const values = [examId];
  let paramIdx = 2;

  let invigilatorJoin = '';
  if (invigilatorUserId) {
    invigilatorJoin = `JOIN session_invigilators si ON s.session_id = si.session_id AND si.user_id = $${paramIdx}`;
    values.push(invigilatorUserId);
    paramIdx++;
  }

  let sessionFilter = '';
  if (sessionId) {
    sessionFilter = `AND a.session_id = $${paramIdx}`;
    values.push(sessionId);
    paramIdx++;
  }

  const limitParam = paramIdx;
  values.push(limit);
  paramIdx++;

  const offsetParam = paramIdx;
  values.push(offset);

  const sql = `
    SELECT
      r.result_id,
      a.attempt_id,
      a.student_id,
      u.name AS student_name,
      u.email AS student_email,
      a.session_id,
      r.score,
      r.correct_count,
      r.wrong_count,
      r.unanswered_count,
      r.evaluated_at,
      e.total_marks,
      e.passing_marks,
      COUNT(*) OVER() AS total_count
    FROM exam_attempts a
    JOIN users u ON a.student_id = u.user_id
    JOIN exam_sessions s ON a.session_id = s.session_id
    JOIN exams e ON s.exam_id = e.exam_id
    JOIN results r ON a.attempt_id = r.attempt_id
    ${invigilatorJoin}
    WHERE e.exam_id = $1
    ${sessionFilter}
    ORDER BY r.score DESC, a.created_at ASC
    LIMIT $${limitParam} OFFSET $${offsetParam};
  `;

  const result = client ? await client.query(sql, values) : await query(sql, values);

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
  return {
    rows: result.rows,
    totalCount
  };
}

/**
 * Calculates aggregated summary statistics for an exam's attempts and results.
 *
 * @param {string} examId
 * @param {Object} [filter]
 * @param {string} [filter.sessionId]
 * @param {string} [filter.invigilatorUserId]
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object>}
 */
export async function getExamResultsSummary(
  examId,
  { sessionId = null, invigilatorUserId = null } = {},
  client = null
) {
  const values = [examId];
  let paramIdx = 2;

  let invigilatorJoin = '';
  if (invigilatorUserId) {
    invigilatorJoin = `JOIN session_invigilators si ON s.session_id = si.session_id AND si.user_id = $${paramIdx}`;
    values.push(invigilatorUserId);
    paramIdx++;
  }

  let sessionFilter = '';
  if (sessionId) {
    sessionFilter = `AND a.session_id = $${paramIdx}`;
    values.push(sessionId);
    paramIdx++;
  }

  const sql = `
    SELECT
      COUNT(a.attempt_id)::int AS total_attempts,
      COUNT(r.result_id)::int AS evaluated_count,
      COUNT(CASE WHEN r.result_id IS NOT NULL AND r.score >= e.passing_marks THEN 1 END)::int AS pass_count,
      COUNT(CASE WHEN r.result_id IS NOT NULL AND r.score < e.passing_marks THEN 1 END)::int AS fail_count,
      ROUND(AVG(r.score)::numeric, 2)::float AS average_score,
      MAX(r.score)::float AS highest_score,
      MIN(r.score)::float AS lowest_score
    FROM exam_attempts a
    JOIN exam_sessions s ON a.session_id = s.session_id
    JOIN exams e ON s.exam_id = e.exam_id
    LEFT JOIN results r ON a.attempt_id = r.attempt_id
    ${invigilatorJoin}
    WHERE e.exam_id = $1
    ${sessionFilter}
    GROUP BY e.exam_id, e.passing_marks;
  `;

  const result = client ? await client.query(sql, values) : await query(sql, values);

  if (!result.rows[0]) {
    return {
      total_attempts: 0,
      evaluated_count: 0,
      pass_count: 0,
      fail_count: 0,
      average_score: null,
      highest_score: null,
      lowest_score: null
    };
  }

  return result.rows[0];
}

/**
 * Finds exam by ID without locking.
 *
 * @param {string} examId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
export async function getExamById(examId, client = null) {
  const sql = `
    SELECT *
    FROM exams
    WHERE exam_id = $1;
  `;
  const result = client ? await client.query(sql, [examId]) : await query(sql, [examId]);
  return result.rows[0] || null;
}

/**
 * Finds exam by ID and acquires row lock (FOR UPDATE).
 *
 * @param {string} examId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function getExamByIdWithLock(examId, client) {
  const sql = `
    SELECT *
    FROM exams
    WHERE exam_id = $1
    FOR UPDATE;
  `;
  const result = await client.query(sql, [examId]);
  return result.rows[0] || null;
}

/**
 * Updates exam status to RESULT_PUBLISHED and records published_at timestamp.
 *
 * @param {string} examId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function publishExamResults(examId, client) {
  const sql = `
    UPDATE exams
    SET
      status = 'RESULT_PUBLISHED',
      results_published_at = COALESCE(results_published_at, transaction_timestamp()),
      updated_at = transaction_timestamp()
    WHERE exam_id = $1
    RETURNING *;
  `;
  const result = await client.query(sql, [examId]);
  return result.rows[0];
}

/**
 * Updates exam release policy and release time.
 *
 * @param {string} examId
 * @param {Object} params
 * @param {string} params.policy
 * @param {Date|string|null} params.releaseAt
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function updateExamReleasePolicy(examId, { policy, releaseAt }, client) {
  const sql = `
    UPDATE exams
    SET
      results_release_policy = $2,
      results_release_at = $3,
      updated_at = transaction_timestamp()
    WHERE exam_id = $1
    RETURNING *;
  `;
  const result = await client.query(sql, [examId, policy, releaseAt]);
  return result.rows[0];
}

/**
 * Checks whether any result for this exam has already become visible to candidates.
 * Note: Distinguishes whether results have merely been evaluated from whether they are
 * actually candidate-visible (e.g. LIVE + IMMEDIATE is NOT candidate-visible).
 *
 * @param {string} examId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<boolean>}
 */
export async function hasCandidateVisibleResults(examId, client = null) {
  const sql = `
    SELECT EXISTS (
      SELECT 1
      FROM exam_attempts a
      JOIN exam_sessions s ON a.session_id = s.session_id
      JOIN exams e ON s.exam_id = e.exam_id
      JOIN results r ON a.attempt_id = r.attempt_id
      WHERE e.exam_id = $1
        AND (
          e.status = 'RESULT_PUBLISHED'
          OR e.results_published_at IS NOT NULL
          OR (e.status IN ('ENDED', 'EVALUATED') AND e.results_release_policy = 'IMMEDIATE')
          OR (e.status IN ('ENDED', 'EVALUATED') AND e.results_release_policy = 'SCHEDULED'
              AND e.results_release_at IS NOT NULL AND transaction_timestamp() >= e.results_release_at)
        )
    ) AS has_visible_results;
  `;
  const result = client ? await client.query(sql, [examId]) : await query(sql, [examId]);
  return Boolean(result.rows[0]?.has_visible_results);
}

/**
 * Checks if an invigilator is assigned to a specific session.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<boolean>}
 */
export async function isInvigilatorAssignedToSession(sessionId, userId, client = null) {
  const sql = `
    SELECT EXISTS (
      SELECT 1 FROM session_invigilators
      WHERE session_id = $1 AND user_id = $2
    ) AS is_assigned;
  `;
  const result = client ? await client.query(sql, [sessionId, userId]) : await query(sql, [sessionId, userId]);
  return Boolean(result.rows[0]?.is_assigned);
}

/**
 * Fetches an exam session by ID.
 *
 * @param {string} sessionId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
export async function getExamSessionById(sessionId, client = null) {
  const sql = `
    SELECT session_id, exam_id, scheduled_start_time, scheduled_end_time, status
    FROM exam_sessions
    WHERE session_id = $1;
  `;
  const result = client ? await client.query(sql, [sessionId]) : await query(sql, [sessionId]);
  return result.rows[0] || null;
}

/**
 * Inserts an audit log entry.
 *
 * @param {Object} auditEntry
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<void>}
 */
export async function insertAuditLog({
  actorUserId,
  action,
  resourceType,
  resourceId,
  attemptId = null,
  requestId = null,
  metadata = {}
}, client = null) {
  const sql = `
    INSERT INTO audit_logs (
      actor_user_id, action, resource_type, resource_id, attempt_id, request_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7);
  `;
  const params = [
    actorUserId,
    action,
    resourceType,
    resourceId,
    attemptId,
    requestId,
    JSON.stringify(metadata)
  ];
  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}
