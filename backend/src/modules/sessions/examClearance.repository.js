/**
 * @file examClearance.repository.js
 * @description Repository for server-authoritative exam entry clearance records.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';

/**
 * Upsert screen share clearance timestamp for candidate.
 * If unconsumed clearance exists, updates screen_share_at and refreshes TTL.
 * Otherwise creates new unconsumed clearance.
 */
export async function upsertScreenShareClearance({ sessionId, studentId, ttlMinutes = 15 }, dbClient = null) {
  const runner = dbClient || getPool();
  const res = await runner.query(
    `INSERT INTO exam_entry_clearances (
       session_id,
       student_id,
       screen_share_at,
       expires_at
     )
     VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($3 || ' minutes')::interval)
     ON CONFLICT (session_id, student_id) WHERE consumed_at IS NULL
     DO UPDATE SET
       screen_share_at = CURRENT_TIMESTAMP,
       expires_at = CURRENT_TIMESTAMP + ($3 || ' minutes')::interval
     RETURNING *;`,
    [sessionId, studentId, ttlMinutes.toString()]
  );
  return res.rows[0];
}

/**
 * Upsert face verification clearance for candidate.
 * If unconsumed clearance exists, updates liveness_passed, face_verified_at, face_score.
 * Otherwise creates new unconsumed clearance.
 */
export async function upsertFaceVerificationClearance({
  sessionId,
  studentId,
  faceScore,
  livenessPassed = true,
  ttlMinutes = 15
}, dbClient = null) {
  const runner = dbClient || getPool();
  const res = await runner.query(
    `INSERT INTO exam_entry_clearances (
       session_id,
       student_id,
       liveness_passed,
       face_verified_at,
       face_score,
       expires_at
     )
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, CURRENT_TIMESTAMP + ($5 || ' minutes')::interval)
     ON CONFLICT (session_id, student_id) WHERE consumed_at IS NULL
     DO UPDATE SET
       liveness_passed = $3,
       face_verified_at = CURRENT_TIMESTAMP,
       face_score = $4,
       expires_at = CURRENT_TIMESTAMP + ($5 || ' minutes')::interval
     RETURNING *;`,
    [sessionId, studentId, livenessPassed, faceScore, ttlMinutes.toString()]
  );
  return res.rows[0];
}

/**
 * Finds the active unconsumed clearance for a student in a session.
 */
export async function findActiveClearance({ sessionId, studentId }, dbClient = null) {
  const runner = dbClient || getPool();
  const res = await runner.query(
    `SELECT * FROM exam_entry_clearances
     WHERE session_id = $1 AND student_id = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;`,
    [sessionId, studentId]
  );
  return res.rows[0] || null;
}

/**
 * Locks the active unconsumed clearance for update inside an attempt creation transaction.
 */
export async function findActiveClearanceForUpdate({ sessionId, studentId }, client) {
  const res = await client.query(
    `SELECT * FROM exam_entry_clearances
     WHERE session_id = $1 AND student_id = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;`,
    [sessionId, studentId]
  );
  return res.rows[0] || null;
}

/**
 * Atomically marks the clearance as consumed upon successful attempt creation.
 */
export async function consumeClearance(clearanceId, client) {
  const res = await client.query(
    `UPDATE exam_entry_clearances
     SET consumed_at = CURRENT_TIMESTAMP
     WHERE clearance_id = $1
     RETURNING *;`,
    [clearanceId]
  );
  return res.rows[0] || null;
}
