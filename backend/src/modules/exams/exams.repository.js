/**
 * @file exams.repository.js
 * @description Direct PostgreSQL data access repository for Exams, Exam Topic Rules, and audit tracking.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

/**
 * Creates a new exam in DRAFT status.
 * @param {object} params
 * @param {string} params.title
 * @param {string} [params.description]
 * @param {string} params.subjectId
 * @param {number} params.durationMinutes
 * @param {number} params.totalMarks
 * @param {number} params.passingMarks
 * @param {string} params.createdBy
 * @param {object} [client] - Optional db client for transactions
 * @returns {Promise<object>}
 */
export async function createExam(
  { title, description, subjectId, durationMinutes, totalMarks, passingMarks, createdBy },
  client = null
) {
  const text = `
    INSERT INTO exams (title, description, subject_id, duration_minutes, total_marks, passing_marks, status, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7)
    RETURNING exam_id, title, description, subject_id, duration_minutes, total_marks, passing_marks, status, created_by, created_at, updated_at;
  `;
  const params = [
    title.trim(),
    description ? description.trim() : null,
    subjectId,
    durationMinutes,
    totalMarks,
    passingMarks,
    createdBy
  ];

  const res = client ? await client.query(text, params) : await query(text, params);
  return res.rows[0];
}

/**
 * Finds an exam by ID with creator and subject metadata.
 * @param {string} examId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function findExamById(examId, client = null) {
  const text = `
    SELECT e.exam_id, e.title, e.description, e.subject_id, e.duration_minutes, e.total_marks, e.passing_marks,
           e.status, e.created_by, e.created_at, e.updated_at,
           s.name AS subject_name, s.code AS subject_code,
           u.name AS creator_name, u.email AS creator_email
    FROM exams e
    LEFT JOIN subjects s ON e.subject_id = s.subject_id
    LEFT JOIN users u ON e.created_by = u.user_id
    WHERE e.exam_id = $1;
  `;
  const res = client ? await client.query(text, [examId]) : await query(text, [examId]);
  return res.rows[0] || null;
}

/**
 * Finds an exam by ID with row lock (FOR UPDATE) within a transaction.
 * @param {string} examId
 * @param {object} client
 * @returns {Promise<object|null>}
 */
export async function findExamByIdForUpdate(examId, client) {
  const text = `
    SELECT exam_id, title, description, subject_id, duration_minutes, total_marks, passing_marks,
           status, created_by, created_at, updated_at
    FROM exams
    WHERE exam_id = $1
    FOR UPDATE;
  `;
  const res = await client.query(text, [examId]);
  return res.rows[0] || null;
}

/**
 * Updates a draft exam record.
 * @param {string} examId
 * @param {object} updates
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function updateExam(examId, updates, client = null) {
  const fields = [];
  const values = [examId];
  let idx = 2;

  if (updates.title !== undefined) {
    fields.push(`title = $${idx++}`);
    values.push(updates.title.trim());
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${idx++}`);
    values.push(updates.description ? updates.description.trim() : null);
  }
  if (updates.duration_minutes !== undefined) {
    fields.push(`duration_minutes = $${idx++}`);
    values.push(updates.duration_minutes);
  }
  if (updates.total_marks !== undefined) {
    fields.push(`total_marks = $${idx++}`);
    values.push(updates.total_marks);
  }
  if (updates.passing_marks !== undefined) {
    fields.push(`passing_marks = $${idx++}`);
    values.push(updates.passing_marks);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(updates.status);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);

  const text = `
    UPDATE exams
    SET ${fields.join(', ')}
    WHERE exam_id = $1
    RETURNING exam_id, title, description, subject_id, duration_minutes, total_marks, passing_marks, status, created_by, created_at, updated_at;
  `;

  const res = client ? await client.query(text, values) : await query(text, values);
  return res.rows[0] || null;
}

/**
 * Deletes an exam by ID (only when in DRAFT).
 * @param {string} examId
 * @param {object} [client]
 * @returns {Promise<boolean>}
 */
export async function deleteExam(examId, client = null) {
  const text = `DELETE FROM exams WHERE exam_id = $1;`;
  const res = client ? await client.query(text, [examId]) : await query(text, [examId]);
  return res.rowCount > 0;
}

/**
 * Lists exams with pagination and optional filters.
 * @param {object} params
 * @param {string} [params.createdBy]
 * @param {string} [params.status]
 * @param {string} [params.subjectId]
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @returns {Promise<object[]>}
 */
export async function listExams({ createdBy, status, subjectId, limit = 20, offset = 0 }) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (createdBy) {
    conditions.push(`e.created_by = $${idx++}`);
    values.push(createdBy);
  }
  if (status) {
    conditions.push(`e.status = $${idx++}`);
    values.push(status);
  }
  if (subjectId) {
    conditions.push(`e.subject_id = $${idx++}`);
    values.push(subjectId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const text = `
    SELECT e.exam_id, e.title, e.description, e.subject_id, e.duration_minutes, e.total_marks, e.passing_marks,
           e.status, e.created_by, e.created_at, e.updated_at,
           s.name AS subject_name, s.code AS subject_code,
           u.name AS creator_name,
           (SELECT COUNT(*)::int FROM exam_topic_rules WHERE exam_id = e.exam_id) AS topic_rules_count
    FROM exams e
    LEFT JOIN subjects s ON e.subject_id = s.subject_id
    LEFT JOIN users u ON e.created_by = u.user_id
    ${whereClause}
    ORDER BY e.created_at DESC
    LIMIT $${idx++} OFFSET $${idx++};
  `;

  values.push(limit, offset);
  const res = await query(text, values);
  return res.rows;
}

/**
 * Counts total matching exams for pagination.
 * @param {object} params
 * @returns {Promise<number>}
 */
export async function countExams({ createdBy, status, subjectId }) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (createdBy) {
    conditions.push(`created_by = $${idx++}`);
    values.push(createdBy);
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    values.push(status);
  }
  if (subjectId) {
    conditions.push(`subject_id = $${idx++}`);
    values.push(subjectId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const text = `SELECT COUNT(*)::int AS total FROM exams ${whereClause};`;
  const res = await query(text, values);
  return res.rows[0].total;
}

/**
 * Retrieves all topic rules configured for an exam.
 * @param {string} examId
 * @param {object} [client]
 * @returns {Promise<object[]>}
 */
export async function getTopicRules(examId, client = null) {
  const text = `
    SELECT r.rule_id, r.exam_id, r.topic_id, r.question_count, r.points_per_question,
           r.created_at, t.name AS topic_name, t.subject_id
    FROM exam_topic_rules r
    JOIN topics t ON r.topic_id = t.topic_id
    WHERE r.exam_id = $1
    ORDER BY r.created_at ASC;
  `;
  const res = client ? await client.query(text, [examId]) : await query(text, [examId]);
  return res.rows;
}

/**
 * Upserts a topic question rule for an exam.
 * @param {string} examId
 * @param {object} rule
 * @param {string} rule.topicId
 * @param {number} rule.questionCount
 * @param {number} rule.pointsPerQuestion
 * @param {object} [client]
 * @returns {Promise<object>}
 */
export async function addOrUpdateTopicRule(examId, { topicId, questionCount, pointsPerQuestion }, client = null) {
  const text = `
    INSERT INTO exam_topic_rules (exam_id, topic_id, question_count, points_per_question)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (exam_id, topic_id)
    DO UPDATE SET
      question_count = EXCLUDED.question_count,
      points_per_question = EXCLUDED.points_per_question
    RETURNING rule_id, exam_id, topic_id, question_count, points_per_question, created_at;
  `;
  const res = client
    ? await client.query(text, [examId, topicId, questionCount, pointsPerQuestion])
    : await query(text, [examId, topicId, questionCount, pointsPerQuestion]);
  return res.rows[0];
}

/**
 * Deletes a topic rule from an exam.
 * @param {string} examId
 * @param {string} ruleId
 * @param {object} [client]
 * @returns {Promise<boolean>}
 */
export async function deleteTopicRule(examId, ruleId, client = null) {
  const text = `DELETE FROM exam_topic_rules WHERE exam_id = $1 AND rule_id = $2;`;
  const res = client ? await client.query(text, [examId, ruleId]) : await query(text, [examId, ruleId]);
  return res.rowCount > 0;
}

/**
 * Counts available questions in the question bank for a specific topic.
 * @param {string} topicId
 * @param {object} [client]
 * @returns {Promise<number>}
 */
export async function countAvailableQuestionsForTopic(topicId, client = null) {
  const text = `SELECT COUNT(*)::int AS count FROM questions WHERE topic_id = $1;`;
  const res = client ? await client.query(text, [topicId]) : await query(text, [topicId]);
  return res.rows[0].count;
}

/**
 * Finds a subject by ID.
 * @param {string} subjectId
 * @returns {Promise<object|null>}
 */
export async function findSubjectById(subjectId) {
  const text = `SELECT subject_id, code, name, description FROM subjects WHERE subject_id = $1;`;
  const res = await query(text, [subjectId]);
  return res.rows[0] || null;
}

/**
 * Finds a topic by ID.
 * @param {string} topicId
 * @returns {Promise<object|null>}
 */
export async function findTopicById(topicId) {
  const text = `SELECT topic_id, subject_id, name, description FROM topics WHERE topic_id = $1;`;
  const res = await query(text, [topicId]);
  return res.rows[0] || null;
}

/**
 * Inserts an immutable audit log entry.
 * @param {object} params
 * @param {string} params.actorUserId
 * @param {string} params.action
 * @param {string} params.resourceType
 * @param {string} params.resourceId
 * @param {string} [params.requestId]
 * @param {object} [params.metadata]
 * @param {object} [client]
 * @returns {Promise<object>}
 */
export async function createAuditLog(
  { actorUserId, action, resourceType, resourceId, requestId = null, metadata = {} },
  client = null
) {
  const text = `
    INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, request_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING audit_id, actor_user_id, action, resource_type, resource_id, timestamp;
  `;
  const params = [actorUserId, action, resourceType, resourceId, requestId, JSON.stringify(metadata)];
  const res = client ? await client.query(text, params) : await query(text, params);
  return res.rows[0];
}
