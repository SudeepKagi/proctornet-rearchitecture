/**
 * @file attempts.repository.js
 * @description Authoritative PostgreSQL persistence layer for Exam Attempts, Question Mapping, and Attempt Queries.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';
import { createAuditLog as createCentralAuditLog } from '../audit/audit.repository.js';

/**
 * Finds an exam session by ID with optional row locking (FOR SHARE).
 * @param {string} sessionId
 * @param {import('pg').PoolClient} [client=null]
 * @param {boolean} [forShare=false]
 * @returns {Promise<object|null>}
 */
export async function findSessionById(sessionId, client = null, forShare = false) {
  const sql = `
    SELECT 
      session_id, 
      exam_id, 
      room_id, 
      scheduled_start_time, 
      scheduled_end_time, 
      status,
      CURRENT_TIMESTAMP AS server_now
    FROM exam_sessions
    WHERE session_id = $1
    ${forShare ? 'FOR SHARE' : ''};
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [sessionId]);
  return result.rows[0] || null;
}

/**
 * Finds an exam by ID with optional row locking (FOR SHARE).
 * @param {string} examId
 * @param {import('pg').PoolClient} [client=null]
 * @param {boolean} [forShare=false]
 * @returns {Promise<object|null>}
 */
export async function findExamById(examId, client = null, forShare = false) {
  const sql = `
    SELECT 
      exam_id, 
      title, 
      description,
      duration_minutes, 
      total_marks, 
      passing_marks, 
      status, 
      created_by, 
      subject_id
    FROM exams
    WHERE exam_id = $1
    ${forShare ? 'FOR SHARE' : ''};
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [examId]);
  return result.rows[0] || null;
}

/**
 * Finds a student roster entry for a session with row locking (FOR UPDATE).
 * @param {string} sessionId
 * @param {string} studentId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function findSessionStudentForUpdate(sessionId, studentId, client) {
  const sql = `
    SELECT session_id, student_id, status
    FROM session_students
    WHERE session_id = $1 AND student_id = $2
    FOR UPDATE;
  `;
  const result = await client.query(sql, [sessionId, studentId]);
  return result.rows[0] || null;
}

/**
 * Finds an exam attempt for a student in a session with row locking (FOR UPDATE).
 * @param {string} sessionId
 * @param {string} studentId
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object|null>}
 */
export async function findAttemptBySessionAndStudentForUpdate(sessionId, studentId, client) {
  const sql = `
    SELECT 
      attempt_id, 
      session_id, 
      student_id, 
      status, 
      started_at, 
      expires_at, 
      submitted_at, 
      created_at, 
      updated_at,
      CURRENT_TIMESTAMP AS server_now
    FROM exam_attempts
    WHERE session_id = $1 AND student_id = $2
    FOR UPDATE;
  `;
  const result = await client.query(sql, [sessionId, studentId]);
  return result.rows[0] || null;
}

/**
 * Finds an exam attempt for a student in a session without row locking.
 * @param {string} sessionId
 * @param {string} studentId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findAttemptBySessionAndStudent(sessionId, studentId, client = null) {
  const sql = `
    SELECT 
      ea.attempt_id, 
      ea.session_id, 
      ea.student_id, 
      ea.status, 
      ea.started_at, 
      ea.expires_at, 
      ea.submitted_at, 
      ea.created_at, 
      ea.updated_at,
      CURRENT_TIMESTAMP AS server_now
    FROM exam_attempts ea
    WHERE ea.session_id = $1 AND ea.student_id = $2;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [sessionId, studentId]);
  return result.rows[0] || null;
}

/**
 * Finds an attempt by its attempt_id, joining session and exam metadata.
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
      ea.created_at, 
      ea.updated_at,
      es.exam_id,
      es.scheduled_start_time,
      es.scheduled_end_time,
      es.status AS session_status,
      e.title AS exam_title,
      e.duration_minutes,
      e.total_marks,
      e.passing_marks,
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
 * Retrieves topic rules configured for an exam ordered stably.
 * @param {string} examId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function getTopicRulesForExam(examId, client = null) {
  const sql = `
    SELECT 
      rule_id, 
      exam_id, 
      topic_id, 
      question_count, 
      points_per_question
    FROM exam_topic_rules
    WHERE exam_id = $1
    ORDER BY created_at ASC, rule_id ASC;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [examId]);
  return result.rows;
}

/**
 * Retrieves all eligible questions for a topic in stable order.
 * @param {string} topicId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function getEligibleQuestionsForTopic(topicId, client = null) {
  const sql = `
    SELECT 
      question_id, 
      topic_id, 
      question_type, 
      prompt_text, 
      default_points
    FROM questions
    WHERE topic_id = $1
    ORDER BY created_at ASC, question_id ASC;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [topicId]);
  return result.rows;
}

/**
 * Inserts a new exam attempt in ACTIVE status.
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.studentId
 * @param {Date|string} params.expiresAt
 * @param {import('pg').PoolClient} client
 * @returns {Promise<object>}
 */
export async function insertAttempt({ sessionId, studentId, expiresAt }, client) {
  const sql = `
    INSERT INTO exam_attempts (
      session_id, 
      student_id, 
      status, 
      started_at, 
      expires_at
    )
    VALUES ($1, $2, 'ACTIVE', CURRENT_TIMESTAMP, $3)
    RETURNING 
      attempt_id, 
      session_id, 
      student_id, 
      status, 
      started_at, 
      expires_at, 
      created_at, 
      updated_at,
      CURRENT_TIMESTAMP AS server_now;
  `;
  const result = await client.query(sql, [sessionId, studentId, expiresAt]);
  return result.rows[0];
}

/**
 * Batch inserts mapped attempt questions with contiguous display orders.
 * @param {string} attemptId
 * @param {Array<{ questionId: string, displayOrder: number }>} questionMappings
 * @param {import('pg').PoolClient} client
 * @returns {Promise<Array<object>>}
 */
export async function batchInsertAttemptQuestions(attemptId, questionMappings, client) {
  if (!questionMappings || questionMappings.length === 0) {
    return [];
  }

  const values = [];
  const valuePlaceholders = [];

  questionMappings.forEach((mapping, index) => {
    const offset = index * 3;
    valuePlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
    values.push(attemptId, mapping.questionId, mapping.displayOrder);
  });

  const sql = `
    INSERT INTO attempt_questions (attempt_id, question_id, display_order)
    VALUES ${valuePlaceholders.join(', ')}
    RETURNING attempt_question_id, attempt_id, question_id, display_order;
  `;

  const result = await client.query(sql, values);
  return result.rows;
}

/**
 * Updates a student's session roster status (e.g. to 'PRESENT').
 * @param {string} sessionId
 * @param {string} studentId
 * @param {string} status
 * @param {import('pg').PoolClient} client
 * @returns {Promise<void>}
 */
export async function updateSessionStudentStatus(sessionId, studentId, status, client) {
  const sql = `
    UPDATE session_students
    SET status = $3
    WHERE session_id = $1 AND student_id = $2;
  `;
  await client.query(sql, [sessionId, studentId, status]);
}

/**
 * Durably transitions an attempt's status in PostgreSQL (e.g. lazy ACTIVE -> EXPIRED).
 * @param {string} attemptId
 * @param {string} newStatus
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function updateAttemptStatus(attemptId, newStatus, client = null) {
  const sql = `
    UPDATE exam_attempts
    SET status = $2, updated_at = CURRENT_TIMESTAMP
    WHERE attempt_id = $1
    RETURNING 
      attempt_id, 
      session_id, 
      student_id, 
      status, 
      started_at, 
      expires_at, 
      submitted_at, 
      updated_at,
      CURRENT_TIMESTAMP AS server_now;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId, newStatus]);
  return result.rows[0] || null;
}

/**
 * Retrieves the persisted question mappings for an attempt in sanitized format.
 * Strips all solution and grading answers (is_correct, correct_numeric_value).
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function getAttemptQuestionsSanitized(attemptId, client = null) {
  const sql = `
    SELECT 
      aq.attempt_question_id,
      aq.display_order,
      q.question_id,
      q.topic_id,
      q.question_type,
      q.prompt_text,
      q.default_points,
      qo.option_id,
      qo.option_text,
      qo.display_order AS option_display_order
    FROM attempt_questions aq
    JOIN questions q ON aq.question_id = q.question_id
    LEFT JOIN question_options qo ON q.question_id = qo.question_id
    WHERE aq.attempt_id = $1
    ORDER BY aq.display_order ASC, qo.display_order ASC;
  `;

  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);

  // Aggregate options under their respective questions
  const questionMap = new Map();

  for (const row of result.rows) {
    if (!questionMap.has(row.attempt_question_id)) {
      questionMap.set(row.attempt_question_id, {
        attempt_question_id: row.attempt_question_id,
        display_order: Number(row.display_order),
        question_id: row.question_id,
        topic_id: row.topic_id,
        question_type: row.question_type,
        prompt_text: row.prompt_text,
        default_points: Number(row.default_points),
        options: []
      });
    }

    if (row.option_id) {
      const q = questionMap.get(row.attempt_question_id);
      q.options.push({
        option_id: row.option_id,
        option_text: row.option_text,
        display_order: Number(row.option_display_order)
      });
    }
  }

  return Array.from(questionMap.values());
}

/**
 * Counts total questions mapped to an attempt.
 * @param {string} attemptId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<number>}
 */
export async function countAttemptQuestions(attemptId, client = null) {
  const sql = `
    SELECT COUNT(*)::int AS count
    FROM attempt_questions
    WHERE attempt_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [attemptId]);
  return result.rows[0]?.count || 0;
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
 * Creates an audit log entry in the active transaction or default pool.
 * @param {object} logData
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function createAuditLog(
  { actorUserId, action, resourceType, resourceId, attemptId = null, requestId = null, metadata = {} },
  client = null
) {
  return createCentralAuditLog(
    { actorUserId, action, resourceType, resourceId, attemptId, requestId, metadata },
    client
  );
}
