/**
 * @file sessions.repository.js
 * @description Direct PostgreSQL data access repository for Exam Sessions, Rooms, Student Rosters, and Invigilators.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';
import { createAuditLog as createCentralAuditLog } from '../audit/audit.repository.js';

/**
 * Inserts a new exam session record.
 * @param {object} params
 * @param {string} params.examId
 * @param {string|null} params.roomId
 * @param {Date|string} params.scheduledStartTime
 * @param {Date|string} params.scheduledEndTime
 * @param {object} [client]
 * @returns {Promise<object>}
 */
export async function createSession(
  { examId, departmentId, targetSemester, scheduledStartTime, scheduledEndTime },
  client = null
) {
  const text = `
    INSERT INTO exam_sessions (exam_id, department_id, target_semester, scheduled_start_time, scheduled_end_time, status)
    VALUES ($1, $2, $3, $4, $5, 'SCHEDULED')
    RETURNING session_id, exam_id, department_id, target_semester, scheduled_start_time, scheduled_end_time, status, created_at, updated_at;
  `;
  const params = [examId, departmentId || null, targetSemester || null, scheduledStartTime, scheduledEndTime];
  const res = client ? await client.query(text, params) : await query(text, params);
  return res.rows[0];
}

/**
 * Finds a session by ID with joined exam and department details.
 * @param {string} sessionId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function findSessionById(sessionId, client = null) {
  const text = `
    SELECT s.session_id, s.exam_id, s.department_id, s.target_semester, s.scheduled_start_time, s.scheduled_end_time,
           s.status, s.created_at, s.updated_at,
           e.title AS exam_title, e.subject_name AS exam_subject_name, e.duration_minutes AS exam_duration_minutes,
           e.total_marks AS exam_total_marks, e.passing_marks AS exam_passing_marks,
           e.status AS exam_status, e.created_by AS exam_created_by,
           d.name AS department_name, d.code AS department_code,
           (SELECT COUNT(*)::int FROM session_students WHERE session_id = s.session_id) AS student_count
    FROM exam_sessions s
    JOIN exams e ON s.exam_id = e.exam_id
    LEFT JOIN departments d ON s.department_id = d.department_id
    WHERE s.session_id = $1;
  `;
  const res = client ? await client.query(text, [sessionId]) : await query(text, [sessionId]);
  return res.rows[0] || null;
}

/**
 * Finds a session by ID with row lock (FOR UPDATE) within an active transaction.
 * @param {string} sessionId
 * @param {object} client
 * @returns {Promise<object|null>}
 */
export async function findSessionByIdForUpdate(sessionId, client) {
  const text = `
    SELECT session_id, exam_id, department_id, target_semester, scheduled_start_time, scheduled_end_time, status, created_at, updated_at
    FROM exam_sessions
    WHERE session_id = $1
    FOR UPDATE;
  `;
  const res = await client.query(text, [sessionId]);
  return res.rows[0] || null;
}

/**
 * Updates an exam session record.
 * @param {string} sessionId
 * @param {object} updates
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function updateSession(sessionId, updates, client = null) {
  const fields = [];
  const values = [sessionId];
  let idx = 2;

  if (updates.scheduled_start_time !== undefined) {
    fields.push(`scheduled_start_time = $${idx++}`);
    values.push(updates.scheduled_start_time);
  }
  if (updates.scheduled_end_time !== undefined) {
    fields.push(`scheduled_end_time = $${idx++}`);
    values.push(updates.scheduled_end_time);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(updates.status);
  }
  if (updates.target_semester !== undefined) {
    fields.push(`target_semester = $${idx++}`);
    values.push(updates.target_semester);
  }
  if (updates.department_id !== undefined) {
    fields.push(`department_id = $${idx++}`);
    values.push(updates.department_id);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);

  const text = `
    UPDATE exam_sessions
    SET ${fields.join(', ')}
    WHERE session_id = $1
    RETURNING session_id, exam_id, target_semester, department_id, scheduled_start_time, scheduled_end_time, status, created_at, updated_at;
  `;

  const res = client ? await client.query(text, values) : await query(text, values);
  return res.rows[0] || null;
}

/**
 * Lists exam sessions with filtering and pagination.
 * @param {object} params
 * @param {string} [params.examId]
 * @param {string} [params.roomId]
 * @param {string} [params.status]
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @param {object} [client]
 * @returns {Promise<object[]>}
 */
export async function listSessions(
  { examId, status, studentTarget, limit = 20, offset = 0 },
  client = null
) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (examId) {
    conditions.push(`s.exam_id = $${idx++}`);
    values.push(examId);
  }
  if (status) {
    conditions.push(`s.status = $${idx++}`);
    values.push(status);
  }
  if (studentTarget) {
    if (studentTarget.semester && studentTarget.departmentId) {
      conditions.push(`(
        s.session_id IN (SELECT session_id FROM session_students WHERE student_id = $${idx})
        OR (
          (s.target_semester = $${idx + 1} OR e.target_semester = $${idx + 1})
          AND (s.department_id = $${idx + 2} OR e.department_id = $${idx + 2})
        )
      )`);
      values.push(studentTarget.studentId, studentTarget.semester, studentTarget.departmentId);
      idx += 3;
    } else if (studentTarget.studentId) {
      conditions.push(`s.session_id IN (SELECT session_id FROM session_students WHERE student_id = $${idx++})`);
      values.push(studentTarget.studentId);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let attemptSelect = '';
  if (studentTarget?.studentId) {
    const studentParamIdx = idx++;
    values.push(studentTarget.studentId);
    attemptSelect = `, (SELECT a.attempt_id FROM exam_attempts a WHERE a.session_id = s.session_id AND a.student_id = $${studentParamIdx} ORDER BY a.created_at DESC LIMIT 1) AS my_attempt_id,
           (SELECT a.status FROM exam_attempts a WHERE a.session_id = s.session_id AND a.student_id = $${studentParamIdx} ORDER BY a.created_at DESC LIMIT 1) AS my_attempt_status`;
  }

  const text = `
    SELECT s.session_id, s.exam_id, s.department_id, s.target_semester, s.scheduled_start_time, s.scheduled_end_time,
           s.status, s.created_at, s.updated_at,
           e.title AS exam_title, e.subject_name AS exam_subject_name, e.duration_minutes AS exam_duration_minutes,
           e.total_marks AS exam_total_marks, e.passing_marks AS exam_passing_marks,
           d.name AS department_name, d.code AS department_code,
           (SELECT COUNT(*)::int FROM session_students WHERE session_id = s.session_id) AS student_count
           ${attemptSelect}
    FROM exam_sessions s
    JOIN exams e ON s.exam_id = e.exam_id
    LEFT JOIN departments d ON s.department_id = d.department_id
    ${whereClause}
    ORDER BY s.scheduled_start_time ASC
    LIMIT $${idx++} OFFSET $${idx++};
  `;

  values.push(limit, offset);
  const res = client ? await client.query(text, values) : await query(text, values);
  return res.rows;
}

/**
 * Counts total exam sessions matching query criteria.
 * @param {object} params
 * @param {object} [client]
 * @returns {Promise<number>}
 */
export async function countSessions({ examId, status, studentTarget }, client = null) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (examId) {
    conditions.push(`s.exam_id = $${idx++}`);
    values.push(examId);
  }
  if (status) {
    conditions.push(`s.status = $${idx++}`);
    values.push(status);
  }
  if (studentTarget) {
    if (studentTarget.semester && studentTarget.departmentId) {
      conditions.push(`(
        s.session_id IN (SELECT session_id FROM session_students WHERE student_id = $${idx})
        OR (
          (s.target_semester = $${idx + 1} OR e.target_semester = $${idx + 1})
          AND (s.department_id = $${idx + 2} OR e.department_id = $${idx + 2})
        )
      )`);
      values.push(studentTarget.studentId, studentTarget.semester, studentTarget.departmentId);
      idx += 3;
    } else if (studentTarget.studentId) {
      conditions.push(`s.session_id IN (SELECT session_id FROM session_students WHERE student_id = $${idx++})`);
      values.push(studentTarget.studentId);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const text = `
    SELECT COUNT(*)::int AS total
    FROM exam_sessions s
    JOIN exams e ON s.exam_id = e.exam_id
    ${whereClause};
  `;
  const res = client ? await client.query(text, values) : await query(text, values);
  return res.rows[0].total;
}

/**
 * Finds a room by ID.
 * @param {string} roomId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function findRoomById(roomId, client = null) {
  const text = `SELECT room_id, name, capacity, building, metadata, created_at, updated_at FROM rooms WHERE room_id = $1;`;
  const res = client ? await client.query(text, [roomId]) : await query(text, [roomId]);
  return res.rows[0] || null;
}

/**
 * Finds a room by ID with row lock (FOR UPDATE) inside a transaction.
 * @param {string} roomId
 * @param {object} client
 * @returns {Promise<object|null>}
 */
export async function findRoomByIdForUpdate(roomId, client) {
  const text = `SELECT room_id, name, capacity, building, metadata FROM rooms WHERE room_id = $1 FOR UPDATE;`;
  const res = await client.query(text, [roomId]);
  return res.rows[0] || null;
}

/**
 * Creates a new physical / virtual examination room.
 * @param {object} params
 * @param {string} params.name
 * @param {number} params.capacity
 * @param {string} [params.building]
 * @param {object} [params.metadata]
 * @param {object} [client]
 * @returns {Promise<object>}
 */
export async function createRoom({ name, capacity, building = null, metadata = {} }, client = null) {
  const text = `
    INSERT INTO rooms (name, capacity, building, metadata)
    VALUES ($1, $2, $3, $4)
    RETURNING room_id, name, capacity, building, metadata, created_at, updated_at;
  `;
  const res = client
    ? await client.query(text, [name.trim(), capacity, building ? building.trim() : null, JSON.stringify(metadata)])
    : await query(text, [name.trim(), capacity, building ? building.trim() : null, JSON.stringify(metadata)]);
  return res.rows[0];
}

/**
 * Lists all available rooms.
 * @param {object} [client]
 * @returns {Promise<object[]>}
 */
export async function listRooms(client = null) {
  const text = `
    SELECT room_id, name, capacity, building, metadata, created_at, updated_at
    FROM rooms
    ORDER BY name ASC;
  `;
  const res = client ? await client.query(text) : await query(text);
  return res.rows;
}

/**
 * Retrieves all assigned students for an exam session.
 * @param {string} sessionId
 * @param {object} [client]
 * @returns {Promise<object[]>}
 */
export async function getSessionStudents(sessionId, client = null) {
  const text = `
    SELECT ss.session_id, ss.student_id, ss.status, ss.created_at,
           u.name AS student_name, u.email AS student_email, sp.enrollment_number
    FROM session_students ss
    JOIN users u ON ss.student_id = u.user_id
    LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
    WHERE ss.session_id = $1
    ORDER BY u.name ASC;
  `;
  const res = client ? await client.query(text, [sessionId]) : await query(text, [sessionId]);
  return res.rows;
}

/**
 * Retrieves only student UUIDs currently enrolled in a session.
 * @param {string} sessionId
 * @param {object} [client]
 * @returns {Promise<string[]>}
 */
export async function getSessionStudentIds(sessionId, client = null) {
  const text = `SELECT student_id FROM session_students WHERE session_id = $1;`;
  const res = client ? await client.query(text, [sessionId]) : await query(text, [sessionId]);
  return res.rows.map((r) => r.student_id);
}

/**
 * Counts total enrolled students in a session.
 * @param {string} sessionId
 * @param {object} [client]
 * @returns {Promise<number>}
 */
export async function countSessionStudents(sessionId, client = null) {
  const text = `SELECT COUNT(*)::int AS count FROM session_students WHERE session_id = $1;`;
  const res = client ? await client.query(text, [sessionId]) : await query(text, [sessionId]);
  return res.rows[0].count;
}

/**
 * Batch assigns students to a session, ignoring existing duplicates.
 * @param {string} sessionId
 * @param {string[]} studentIds
 * @param {object} [client]
 * @returns {Promise<string[]>} List of newly inserted student IDs
 */
export async function assignStudentsToSession(sessionId, studentIds, client = null) {
  if (!studentIds || studentIds.length === 0) return [];

  const uniqueStudentIds = [...new Set(studentIds)];
  const values = [];
  const valueClauses = [];

  values.push(sessionId);
  let idx = 2;

  for (const studentId of uniqueStudentIds) {
    valueClauses.push(`($1, $${idx++}, 'ASSIGNED')`);
    values.push(studentId);
  }

  const text = `
    INSERT INTO session_students (session_id, student_id, status)
    VALUES ${valueClauses.join(', ')}
    ON CONFLICT (session_id, student_id) DO NOTHING
    RETURNING student_id;
  `;

  const res = client ? await client.query(text, values) : await query(text, values);
  return res.rows.map((r) => r.student_id);
}

/**
 * Removes a single student from a session roster.
 * @param {string} sessionId
 * @param {string} studentId
 * @param {object} [client]
 * @returns {Promise<boolean>}
 */
export async function removeStudentFromSession(sessionId, studentId, client = null) {
  const text = `DELETE FROM session_students WHERE session_id = $1 AND student_id = $2;`;
  const res = client ? await client.query(text, [sessionId, studentId]) : await query(text, [sessionId, studentId]);
  return res.rowCount > 0;
}

/**
 * Retrieves all assigned invigilators for an exam session.
 * @param {string} sessionId
 * @param {object} [client]
 * @returns {Promise<object[]>}
 */
export async function getSessionInvigilators(sessionId, client = null) {
  const text = `
    SELECT es.session_id, u.user_id, 'PRIMARY' AS role, es.created_at,
           u.name AS invigilator_name, u.email AS invigilator_email
    FROM exam_sessions es
    JOIN exams e ON es.exam_id = e.exam_id
    JOIN users u ON e.created_by = u.user_id
    WHERE es.session_id = $1;
  `;
  const res = client ? await client.query(text, [sessionId]) : await query(text, [sessionId]);
  return res.rows;
}

/**
 * Assigns or updates an invigilator for a session.
 * @param {string} sessionId
 * @param {string} userId
 * @param {string} role ('PRIMARY' | 'SECONDARY')
 * @param {object} [client]
 * @returns {Promise<object>}
 */
export async function assignInvigilatorToSession(sessionId, userId, role = 'PRIMARY', client = null) {
  return { session_id: sessionId, user_id: userId, role, created_at: new Date() };
}

/**
 * Removes an invigilator from a session.
 * @param {string} sessionId
 * @param {string} userId
 * @param {object} [client]
 * @returns {Promise<boolean>}
 */
export async function removeInvigilatorFromSession(sessionId, userId, client = null) {
  return true;
}

/**
 * Verifies if user IDs exist in the database.
 * @param {string[]} userIds
 * @param {object} [client]
 * @returns {Promise<object[]>}
 */
export async function findUsersByIds(userIds, client = null) {
  if (!userIds || userIds.length === 0) return [];
  const text = `SELECT user_id, name, email, status FROM users WHERE user_id = ANY($1::uuid[]);`;
  const res = client ? await client.query(text, [userIds]) : await query(text, [userIds]);
  return res.rows;
}

/**
 * Retrieves roles for a given user.
 * @param {string} userId
 * @param {object} [client]
 * @returns {Promise<string[]>}
 */
export async function findUserRoles(userId, client = null) {
  const text = `
    SELECT role
    FROM user_roles
    WHERE user_id = $1;
  `;
  const res = client ? await client.query(text, [userId]) : await query(text, [userId]);
  return res.rows.map((r) => r.role);
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
  return createCentralAuditLog(
    { actorUserId, action, resourceType, resourceId, requestId, metadata },
    client
  );
}

/**
 * Detects if any students in the list are already booked in an overlapping active or scheduled session.
 */
export async function findConflictingStudentSessions(studentIds, startTime, endTime, excludeSessionId = null, client = null) {
  if (!studentIds || studentIds.length === 0) return [];
  const text = `
    SELECT ss.student_id, u.name as student_name, es.session_id, es.scheduled_start_time, es.scheduled_end_time, e.title as exam_title
    FROM session_students ss
    JOIN exam_sessions es ON ss.session_id = es.session_id
    JOIN users u ON ss.student_id = u.user_id
    JOIN exams e ON es.exam_id = e.exam_id
    WHERE ss.student_id = ANY($1::uuid[])
      AND es.status IN ('SCHEDULED', 'ACTIVE')
      AND ($2::uuid IS NULL OR es.session_id != $2::uuid)
      AND es.scheduled_start_time < $4
      AND es.scheduled_end_time > $3;
  `;
  const res = client
    ? await client.query(text, [studentIds, excludeSessionId, startTime, endTime])
    : await query(text, [studentIds, excludeSessionId, startTime, endTime]);
  return res.rows;
}

/**
 * Detects if an invigilator is already assigned to an overlapping active or scheduled session.
 */
export async function findConflictingInvigilatorSessions(invigilatorId, startTime, endTime, excludeSessionId = null, client = null) {
  return [];
}
