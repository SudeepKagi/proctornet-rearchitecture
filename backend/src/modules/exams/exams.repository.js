/**
 * @file exams.repository.js
 * @description Direct PostgreSQL data access repository for Exams, Question assignments, and audit tracking.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';
import { createAuditLog as createCentralAuditLog } from '../audit/audit.repository.js';

/**
 * Creates a new exam in DRAFT status.
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function createExam(
  { title, description, subjectName, subject_name, durationMinutes, totalMarks, passingMarks, targetSemester, departmentId, createdBy },
  client = null
) {
  const text = `
    INSERT INTO exams (
      title, description, subject_name, duration_minutes, total_marks, passing_marks,
      target_semester, department_id, status, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', $9)
    RETURNING exam_id, title, description, subject_name, duration_minutes, total_marks, passing_marks,
              target_semester, department_id, status, created_by, created_at, updated_at;
  `;
  const params = [
    title.trim(),
    description ? description.trim() : null,
    (subjectName || subject_name || title).trim(),
    durationMinutes || 60,
    totalMarks || 100,
    passingMarks || 40,
    targetSemester || null,
    departmentId || null,
    createdBy
  ];

  const res = client ? await client.query(text, params) : await query(text, params);
  return res.rows[0];
}

/**
 * Finds an exam by ID with creator and department metadata.
 * @param {string} examId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function findExamById(examId, client = null) {
  const text = `
    SELECT e.exam_id, e.title, e.description, e.subject_name, e.duration_minutes, e.total_marks, e.passing_marks,
           e.target_semester, e.department_id, d.name AS department_name, d.code AS department_code,
           e.scheduled_start_time, e.scheduled_end_time,
           e.status, e.created_by, e.created_at, e.updated_at,
           u.name AS creator_name, u.email AS creator_email
    FROM exams e
    LEFT JOIN departments d ON e.department_id = d.department_id
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
    SELECT exam_id, title, description, subject_name, duration_minutes, total_marks, passing_marks,
           target_semester, department_id, scheduled_start_time, scheduled_end_time,
           status, created_by, created_at, updated_at
    FROM exams
    WHERE exam_id = $1
    FOR UPDATE;
  `;
  const res = await client.query(text, [examId]);
  return res.rows[0] || null;
}

/**
 * Updates an exam record.
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
  if (updates.subject_name !== undefined || updates.subjectName !== undefined) {
    fields.push(`subject_name = $${idx++}`);
    values.push((updates.subject_name || updates.subjectName).trim());
  }
  if (updates.duration_minutes !== undefined || updates.durationMinutes !== undefined) {
    fields.push(`duration_minutes = $${idx++}`);
    values.push(Number(updates.duration_minutes || updates.durationMinutes));
  }
  if (updates.total_marks !== undefined || updates.totalMarks !== undefined) {
    fields.push(`total_marks = $${idx++}`);
    values.push(Number(updates.total_marks || updates.totalMarks));
  }
  if (updates.passing_marks !== undefined || updates.passingMarks !== undefined) {
    fields.push(`passing_marks = $${idx++}`);
    values.push(Number(updates.passing_marks || updates.passingMarks));
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(updates.status);
  }
  if (updates.target_semester !== undefined || updates.targetSemester !== undefined) {
    fields.push(`target_semester = $${idx++}`);
    values.push(Number(updates.target_semester || updates.targetSemester));
  }
  if (updates.department_id !== undefined || updates.departmentId !== undefined) {
    fields.push(`department_id = $${idx++}`);
    values.push(updates.department_id || updates.departmentId);
  }
  if (updates.scheduled_start_time !== undefined || updates.scheduledStartTime !== undefined) {
    fields.push(`scheduled_start_time = $${idx++}`);
    values.push(updates.scheduled_start_time || updates.scheduledStartTime);
  }
  if (updates.scheduled_end_time !== undefined || updates.scheduledEndTime !== undefined) {
    fields.push(`scheduled_end_time = $${idx++}`);
    values.push(updates.scheduled_end_time || updates.scheduledEndTime);
  }

  fields.push(`updated_at = NOW()`);

  const text = `
    UPDATE exams
    SET ${fields.join(', ')}
    WHERE exam_id = $1
    RETURNING exam_id, title, description, subject_name, duration_minutes, total_marks, passing_marks,
              target_semester, department_id, scheduled_start_time, scheduled_end_time,
              status, created_by, created_at, updated_at;
  `;

  const res = client ? await client.query(text, values) : await query(text, values);
  return res.rows[0] || null;
}

/**
 * Transitions exam status atomically.
 */
export async function updateExamStatus(examId, nextStatus, client = null) {
  const text = `
    UPDATE exams
    SET status = $2, updated_at = NOW()
    WHERE exam_id = $1
    RETURNING exam_id, title, status, updated_at;
  `;
  const res = client ? await client.query(text, [examId, nextStatus]) : await query(text, [examId, nextStatus]);
  return res.rows[0] || null;
}

/**
 * Lists exams with pagination and optional filters.
 */
export async function listExams({ createdBy, status, limit = 20, offset = 0 } = {}) {
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const text = `
    SELECT e.exam_id, e.title, e.description, e.subject_name, e.duration_minutes, e.total_marks, e.passing_marks,
           e.target_semester, e.department_id, d.name AS department_name,
           e.scheduled_start_time, e.scheduled_end_time,
           e.status, e.created_by, e.created_at, e.updated_at,
           u.name AS creator_name,
           (SELECT COUNT(*)::int FROM questions WHERE exam_id = e.exam_id) AS questions_count
    FROM exams e
    LEFT JOIN departments d ON e.department_id = d.department_id
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
 */
export async function countExams({ createdBy, status } = {}) {
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const text = `SELECT COUNT(*)::int AS total FROM exams ${whereClause};`;
  const res = await query(text, values);
  return res.rows[0].total;
}

/**
 * Retrieves all assigned exam questions formatted as blueprint rows.
 */
export async function getExamQuestionsAsBlueprintRows(examId, client = null) {
  const text = `
    SELECT 
      q.question_id AS rule_id,
      q.exam_id,
      q.question_id,
      1 AS question_count,
      q.default_points AS points_per_question,
      'ANY' AS difficulty,
      'ANY' AS bloom_level,
      q.created_at,
      'MCQ' AS topic_name
    FROM questions q
    WHERE q.exam_id = $1
    ORDER BY q.created_at ASC;
  `;
  const res = client ? await client.query(text, [examId]) : await query(text, [examId]);
  return res.rows;
}

export const getTopicRules = getExamQuestionsAsBlueprintRows;

/**
 * Compatibility shims
 */
export async function addOrUpdateTopicRule(examId, rule, client = null) {
  return { exam_id: examId, question_count: 0 };
}

export async function deleteTopicRule(examId, ruleId, client = null) {
  return true;
}

export async function countAvailableQuestionsForTopic(topicId, client = null) {
  return 0;
}

export async function listAllSubjects() {
  const text = `SELECT department_id AS subject_id, code, name, '' AS description FROM departments ORDER BY name ASC;`;
  const res = await query(text);
  return res.rows;
}

export async function findSubjectById(subjectId) {
  const text = `SELECT department_id AS subject_id, code, name, '' AS description FROM departments WHERE department_id = $1;`;
  const res = await query(text, [subjectId]);
  return res.rows[0] || null;
}

export async function findTopicById(topicId) {
  return { topic_id: topicId, name: 'General' };
}

export async function createAuditLog(
  { actorUserId, action, resourceType, resourceId, requestId = null, metadata = {} },
  client = null
) {
  return createCentralAuditLog(
    { actorUserId, action, resourceType, resourceId, requestId, metadata },
    client
  );
}
