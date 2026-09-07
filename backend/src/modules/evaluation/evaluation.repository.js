/**
 * @file evaluation.repository.js
 * @description PostgreSQL persistence layer for reading authoritative exam data and persisting evaluated results.
 * Conforms to Step 13.5 and Phase 8 specifications.
 */

import { query } from '../../infrastructure/postgres/pool.js';

/**
 * Finds an existing evaluated result for an attempt.
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findResultByAttemptId(attemptId, client = null) {
  const sql = `
    SELECT 
      result_id,
      attempt_id,
      score,
      correct_count,
      wrong_count,
      unanswered_count,
      evaluated_at,
      created_at
    FROM results
    WHERE attempt_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);
  return result.rows[0] || null;
}

/**
 * Loads authoritative attempt metadata for evaluation without locking.
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function loadAttemptForEvaluation(attemptId, client = null) {
  const sql = `
    SELECT 
      attempt_id,
      session_id,
      student_id,
      status,
      started_at,
      expires_at,
      submitted_at
    FROM exam_attempts
    WHERE attempt_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);
  return result.rows[0] || null;
}

/**
 * Loads attempt questions and any submitted answers ordered by display_order.
 * Non-locking read.
 *
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function loadAttemptQuestionsWithAnswers(attemptId, client = null) {
  const sql = `
    SELECT 
      aq.attempt_question_id,
      aq.display_order,
      q.question_id,
      q.question_type,
      q.default_points,
      q.correct_numeric_value,
      a.answer_id,
      a.answer_value,
      a.revision
    FROM attempt_questions aq
    JOIN questions q ON aq.question_id = q.question_id
    LEFT JOIN answers a ON aq.attempt_question_id = a.attempt_question_id
    WHERE aq.attempt_id = $1
    ORDER BY aq.display_order ASC;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);
  return result.rows;
}

/**
 * Loads options for a list of question IDs.
 * @param {string[]} questionIds
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function loadOptionsForQuestions(questionIds, client = null) {
  if (!questionIds || questionIds.length === 0) return [];
  const sql = `
    SELECT 
      option_id,
      question_id,
      is_correct,
      option_text,
      display_order
    FROM question_options
    WHERE question_id = ANY($1)
    ORDER BY display_order ASC;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [questionIds]);
  return result.rows;
}

/**
 * Inserts the calculated result record into PostgreSQL.
 * Uses ON CONFLICT (attempt_id) DO NOTHING to protect against duplicate inserts.
 *
 * @param {object} data
 * @param {string} data.attemptId
 * @param {number} data.score
 * @param {number} data.correctCount
 * @param {number} data.wrongCount
 * @param {number} data.unansweredCount
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function insertResult(data, client) {
  const sql = `
    INSERT INTO results (
      result_id,
      attempt_id,
      score,
      correct_count,
      wrong_count,
      unanswered_count,
      evaluated_at,
      created_at
    ) VALUES (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      $4,
      $5,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (attempt_id) DO NOTHING
    RETURNING result_id, attempt_id, score, correct_count, wrong_count, unanswered_count, evaluated_at, created_at;
  `;
  const params = [
    data.attemptId,
    data.score,
    data.correctCount,
    data.wrongCount,
    data.unansweredCount
  ];
  const result = await client.query(sql, params);
  return result.rows[0] || null;
}
