/**
 * @file submissions.repository.js
 * @description PostgreSQL persistence layer for Exam Submissions, Idempotency Records, Final Dirty Answers, and Finalization.
 * Conforms to Step 13.5, 13.7, and Phase 8 specification.
 */

import { query } from '../../infrastructure/postgres/pool.js';
import { createAuditLog as createCentralAuditLog } from '../audit/audit.repository.js';

/**
 * Finds an exam attempt by ID with row locking (FOR UPDATE) inside a transaction.
 * @param {string} attemptId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function findAttemptForUpdate(attemptId, client) {
  const sql = `
    SELECT 
      ea.attempt_id, 
      ea.session_id, 
      ea.student_id, 
      ea.status, 
      ea.started_at, 
      ea.expires_at, 
      ea.submitted_at,
      e.created_by AS exam_created_by,
      CURRENT_TIMESTAMP AS server_now
    FROM exam_attempts ea
    JOIN exam_sessions es ON ea.session_id = es.session_id
    JOIN exams e ON es.exam_id = e.exam_id
    WHERE ea.attempt_id = $1
    FOR UPDATE OF ea;
  `;
  const result = await client.query(sql, [attemptId]);
  return result.rows[0] || null;
}

/**
 * Finds existing submission idempotency record by attemptId.
 * @param {string} attemptId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function findSubmissionIdempotency(attemptId, client) {
  const sql = `
    SELECT 
      attempt_id,
      idempotency_key,
      user_id,
      request_fingerprint,
      response_status,
      response_payload,
      created_at
    FROM submission_idempotency
    WHERE attempt_id = $1;
  `;
  const result = await client.query(sql, [attemptId]);
  return result.rows[0] || null;
}

/**
 * Inserts a durable submission idempotency record.
 * @param {object} data
 * @param {string} data.attemptId
 * @param {string} data.idempotencyKey
 * @param {string} data.userId
 * @param {string} data.requestFingerprint
 * @param {number} data.responseStatus
 * @param {object} data.responsePayload
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function insertSubmissionIdempotency(data, client) {
  const sql = `
    INSERT INTO submission_idempotency (
      attempt_id,
      idempotency_key,
      user_id,
      request_fingerprint,
      response_status,
      response_payload,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const params = [
    data.attemptId,
    data.idempotencyKey,
    data.userId,
    data.requestFingerprint,
    data.responseStatus || 200,
    JSON.stringify(data.responsePayload)
  ];
  const result = await client.query(sql, params);
  return result.rows[0];
}

/**
 * Updates attempt status to SUBMITTED and sets submitted_at to current server time.
 * @param {string} attemptId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function updateAttemptToSubmitted(attemptId, client) {
  const sql = `
    UPDATE exam_attempts
    SET 
      status = 'SUBMITTED',
      submitted_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE attempt_id = $1
    RETURNING attempt_id, session_id, student_id, status, started_at, expires_at, submitted_at, updated_at;
  `;
  const result = await client.query(sql, [attemptId]);
  return result.rows[0];
}

/**
 * Updates attempt status to EXPIRED.
 * @param {string} attemptId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function updateAttemptToExpired(attemptId, client) {
  const sql = `
    UPDATE exam_attempts
    SET 
      status = 'EXPIRED',
      updated_at = CURRENT_TIMESTAMP
    WHERE attempt_id = $1
    RETURNING attempt_id, session_id, student_id, status, started_at, expires_at, submitted_at, updated_at;
  `;
  const result = await client.query(sql, [attemptId]);
  return result.rows[0];
}

/**
 * Inserts a transactional outbox event.
 * @param {object} event
 * @param {string} event.aggregateType
 * @param {string} event.aggregateId
 * @param {string} event.eventType
 * @param {object} event.payload
 * @param {number} [event.maxRetries=5]
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function insertOutboxEvent(event, client) {
  const sql = `
    INSERT INTO outbox_events (
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      status,
      retry_count,
      max_retries,
      next_retry_at,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, 'PENDING', 0, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const params = [
    event.aggregateType,
    event.aggregateId,
    event.eventType,
    JSON.stringify(event.payload),
    event.maxRetries ?? 5
  ];
  const result = await client.query(sql, params);
  return result.rows[0];
}

/**
 * Creates an immutable audit log record.
 * @param {object} auditData
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function createAuditLog(auditData, client) {
  return createCentralAuditLog(auditData, client);
}

/**
 * Finds attempt question mapping for dirty answer validation.
 * @param {string} attemptId
 * @param {string} attemptQuestionId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function findAttemptQuestion(attemptId, attemptQuestionId, client) {
  const sql = `
    SELECT 
      aq.attempt_question_id,
      aq.attempt_id,
      aq.question_id,
      aq.display_order,
      q.question_type,
      q.default_points,
      q.correct_numeric_value
    FROM attempt_questions aq
    JOIN questions q ON aq.question_id = q.question_id
    WHERE aq.attempt_id = $1 AND aq.attempt_question_id = $2;
  `;
  const result = await client.query(sql, [attemptId, attemptQuestionId]);
  return result.rows[0] || null;
}

/**
 * Gets question options for MCQ/TRUE_FALSE validation (strips is_correct).
 * @param {string} questionId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<Array<{ option_id: string }>>}
 */
export async function getQuestionOptions(questionId, client) {
  const sql = `
    SELECT option_id
    FROM question_options
    WHERE question_id = $1;
  `;
  const result = await client.query(sql, [questionId]);
  return result.rows;
}

/**
 * Finds answer by attempt_question_id.
 * @param {string} attemptQuestionId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function findAnswerByAttemptQuestionId(attemptQuestionId, client) {
  const sql = `
    SELECT answer_id, attempt_question_id, answer_value, revision, saved_at
    FROM answers
    WHERE attempt_question_id = $1;
  `;
  const result = await client.query(sql, [attemptQuestionId]);
  return result.rows[0] || null;
}

/**
 * Inserts a new answer at revision 1.
 * @param {string} attemptQuestionId
 * @param {object} answerValue
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function insertAnswer(attemptQuestionId, answerValue, client) {
  const sql = `
    INSERT INTO answers (
      attempt_question_id,
      answer_value,
      revision,
      saved_at,
      created_at,
      updated_at
    ) VALUES ($1, $2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING answer_id, attempt_question_id, answer_value, revision, saved_at;
  `;
  const result = await client.query(sql, [attemptQuestionId, JSON.stringify(answerValue)]);
  return result.rows[0];
}

/**
 * Updates an existing answer and increments revision with OCC check.
 * @param {string} attemptQuestionId
 * @param {object} answerValue
 * @param {number} expectedRevision
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function updateAnswer(attemptQuestionId, answerValue, expectedRevision, client) {
  const sql = `
    UPDATE answers
    SET 
      answer_value = $2,
      revision = revision + 1,
      saved_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE attempt_question_id = $1 AND revision = $3
    RETURNING answer_id, attempt_question_id, answer_value, revision, saved_at;
  `;
  const result = await client.query(sql, [attemptQuestionId, JSON.stringify(answerValue), expectedRevision]);
  return result.rows[0] || null;
}
