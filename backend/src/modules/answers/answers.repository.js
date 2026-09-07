/**
 * @file answers.repository.js
 * @description Authoritative PostgreSQL persistence layer for Exam Answers, OCC Revisions, Single/Batch Autosave, and Clear operations.
 */

import { query } from '../../infrastructure/postgres/pool.js';

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
 * Finds an attempt by its attempt_id without row locking (for read-only queries).
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findAttemptById(attemptId, client = null) {
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
    WHERE ea.attempt_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);
  return result.rows[0] || null;
}

/**
 * Checks if a user is an assigned invigilator for a session.
 * @param {string} sessionId
 * @param {string} userId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<boolean>}
 */
export async function isUserInvigilatorForSession(sessionId, userId, client = null) {
  const sql = `
    SELECT 1 FROM session_invigilators
    WHERE session_id = $1 AND user_id = $2
    LIMIT 1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [sessionId, userId]);
  return (result.rowCount || 0) > 0;
}

/**
 * Updates attempt status (e.g. lazy transition to EXPIRED) inside a transaction or pool.
 * @param {string} attemptId
 * @param {string} status
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function updateAttemptStatus(attemptId, status, client = null) {
  const sql = `
    UPDATE exam_attempts
    SET status = $2, updated_at = CURRENT_TIMESTAMP
    WHERE attempt_id = $1
    RETURNING 
      attempt_id, 
      session_id, 
      student_id, 
      status, 
      expires_at, 
      updated_at, 
      CURRENT_TIMESTAMP AS server_now;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId, status]);
  return result.rows[0] || null;
}

/**
 * Finds an attempt_question row ensuring it belongs to the given attempt_id.
 * @param {string} attemptId
 * @param {string} attemptQuestionId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findAttemptQuestion(attemptId, attemptQuestionId, client = null) {
  const sql = `
    SELECT 
      aq.attempt_question_id, 
      aq.attempt_id, 
      aq.question_id, 
      aq.display_order,
      q.question_type, 
      q.prompt_text, 
      q.default_points
    FROM attempt_questions aq
    JOIN questions q ON aq.question_id = q.question_id
    WHERE aq.attempt_id = $1 AND aq.attempt_question_id = $2;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId, attemptQuestionId]);
  return result.rows[0] || null;
}

/**
 * Finds multiple attempt_question rows for a given attempt.
 * @param {string} attemptId
 * @param {Array<string>} attemptQuestionIds
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function findAttemptQuestionsByIds(attemptId, attemptQuestionIds, client = null) {
  if (!attemptQuestionIds || attemptQuestionIds.length === 0) {
    return [];
  }
  const sql = `
    SELECT 
      aq.attempt_question_id, 
      aq.attempt_id, 
      aq.question_id, 
      aq.display_order,
      q.question_type, 
      q.prompt_text, 
      q.default_points
    FROM attempt_questions aq
    JOIN questions q ON aq.question_id = q.question_id
    WHERE aq.attempt_id = $1 AND aq.attempt_question_id = ANY($2::uuid[]);
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId, attemptQuestionIds]);
  return result.rows;
}

/**
 * Retrieves valid option IDs for a given question.
 * @param {string} questionId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<{ option_id: string }>>}
 */
export async function getQuestionOptions(questionId, client = null) {
  const sql = `
    SELECT option_id 
    FROM question_options 
    WHERE question_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [questionId]);
  return result.rows;
}

/**
 * Retrieves valid option IDs for multiple questions.
 * @param {Array<string>} questionIds
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<{ question_id: string, option_id: string }>>}
 */
export async function getQuestionOptionsForQuestions(questionIds, client = null) {
  if (!questionIds || questionIds.length === 0) {
    return [];
  }
  const sql = `
    SELECT question_id, option_id 
    FROM question_options 
    WHERE question_id = ANY($1::uuid[]);
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [questionIds]);
  return result.rows;
}

/**
 * Finds the committed answer record for a given attempt_question_id.
 * @param {string} attemptQuestionId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findAnswerByAttemptQuestionId(attemptQuestionId, client = null) {
  const sql = `
    SELECT 
      answer_id, 
      attempt_question_id, 
      answer_value, 
      revision, 
      saved_at, 
      created_at, 
      updated_at,
      CURRENT_TIMESTAMP AS server_now
    FROM answers
    WHERE attempt_question_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptQuestionId]);
  return result.rows[0] || null;
}

/**
 * Finds committed answer records for multiple attempt_question_ids.
 * @param {Array<string>} attemptQuestionIds
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function findAnswersByAttemptQuestionIds(attemptQuestionIds, client = null) {
  if (!attemptQuestionIds || attemptQuestionIds.length === 0) {
    return [];
  }
  const sql = `
    SELECT 
      answer_id, 
      attempt_question_id, 
      answer_value, 
      revision, 
      saved_at, 
      created_at, 
      updated_at,
      CURRENT_TIMESTAMP AS server_now
    FROM answers
    WHERE attempt_question_id = ANY($1::uuid[]);
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptQuestionIds]);
  return result.rows;
}

/**
 * Inserts the first answer row for an unanswered question with revision = 1.
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
    )
    VALUES ($1, $2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING 
      answer_id, 
      attempt_question_id, 
      answer_value, 
      revision, 
      saved_at, 
      CURRENT_TIMESTAMP AS server_now;
  `;
  const result = await client.query(sql, [attemptQuestionId, JSON.stringify(answerValue)]);
  return result.rows[0];
}

/**
 * Atomically updates an existing answer row if revision matches expectedRevision, incrementing revision to K + 1.
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
    RETURNING 
      answer_id, 
      attempt_question_id, 
      answer_value, 
      revision, 
      saved_at, 
      CURRENT_TIMESTAMP AS server_now;
  `;
  const result = await client.query(sql, [attemptQuestionId, JSON.stringify(answerValue), expectedRevision]);
  return result.rows[0] || null;
}

/**
 * Atomically deletes an existing answer row if revision matches expectedRevision.
 * @param {string} attemptQuestionId
 * @param {number} expectedRevision
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function deleteAnswer(attemptQuestionId, expectedRevision, client) {
  const sql = `
    DELETE FROM answers
    WHERE attempt_question_id = $1 AND revision = $2
    RETURNING 
      answer_id, 
      attempt_question_id, 
      revision, 
      CURRENT_TIMESTAMP AS server_now;
  `;
  const result = await client.query(sql, [attemptQuestionId, expectedRevision]);
  return result.rows[0] || null;
}

/**
 * Retrieves all answers for an attempt ordered by question display_order.
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function getAnswersForAttempt(attemptId, client = null) {
  const sql = `
    SELECT 
      ans.answer_id, 
      ans.attempt_question_id, 
      ans.answer_value, 
      ans.revision, 
      ans.saved_at,
      aq.display_order,
      CURRENT_TIMESTAMP AS server_now
    FROM answers ans
    JOIN attempt_questions aq ON ans.attempt_question_id = aq.attempt_question_id
    WHERE aq.attempt_id = $1
    ORDER BY aq.display_order ASC;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);
  return result.rows;
}

/**
 * Creates an audit log entry in the active transaction or default pool.
 * @param {object} logData
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function createAuditLog(
  { actorUserId, action, resourceType, resourceId, attemptId = null, requestId = null, metadata = {} },
  client = null
) {
  const sql = `
    INSERT INTO audit_logs (
      actor_user_id,
      action,
      resource_type,
      resource_id,
      attempt_id,
      request_id,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING audit_id, action, timestamp;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [
    actorUserId || null,
    action,
    resourceType,
    resourceId,
    attemptId,
    requestId,
    JSON.stringify(metadata)
  ]);
  return result.rows[0];
}
