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
      department_id,
      target_semester,
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
      subject_name,
      duration_minutes, 
      total_marks, 
      passing_marks, 
      department_id,
      target_semester,
      status, 
      created_by
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
/**
 * Retrieves the statically configured questions for an exam in stable display order.
 * If exam_questions has assigned questions, those are returned.
 * If none are configured, falls back to all published questions from the exam's pool_id.
 * @param {string} examId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function getQuestionsForExam(examId, client = null) {
  const sql = `
    SELECT 
      q.question_id,
      COALESCE(eq.display_order, 1) AS display_order,
      COALESCE(eq.points, q.default_points, 1.0) AS points,
      q.question_type,
      q.prompt_text,
      q.default_points
    FROM questions q
    LEFT JOIN exam_questions eq ON q.question_id = eq.question_id AND eq.exam_id = q.exam_id
    WHERE q.exam_id = $1
    ORDER BY COALESCE(eq.display_order, 1), q.created_at;
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
        id: row.attempt_question_id,
        display_order: Number(row.display_order),
        question_id: row.question_id,
        question_type: row.question_type,
        type: row.question_type,
        prompt_text: row.prompt_text,
        prompt: row.prompt_text,
        default_points: Number(row.default_points),
        points: Number(row.default_points),
        options: []
      });
    }

    if (row.option_id) {
      const q = questionMap.get(row.attempt_question_id);
      q.options.push({
        option_id: row.option_id,
        id: row.option_id,
        option_text: row.option_text,
        text: row.option_text,
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
 * Checks if a user is an invigilator/faculty for a session.
 * Any faculty or admin can invigilate exam sessions.
 * @param {string} sessionId
 * @param {string} userId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<boolean>}
 */
export async function isUserInvigilatorForSession(sessionId, userId, client = null) {
  const sql = `
    SELECT 1 FROM user_roles
    WHERE user_id = $2 AND role IN ('FACULTY', 'ADMIN', 'DEVELOPER')
    LIMIT 1;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [sessionId, userId]);
  return (result.rowCount || 0) > 0;
}

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
      q.default_points
    FROM attempt_questions aq
    JOIN questions q ON aq.question_id = q.question_id
    WHERE aq.attempt_id = $1 AND aq.attempt_question_id = $2;
  `;
  const result = await client.query(sql, [attemptId, attemptQuestionId]);
  return result.rows[0] || null;
}

/**
 * Gets question options for validation.
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
