/**
 * @file sessions.repository.js
 * @description Direct PostgreSQL data access repository for Exam Sessions, Rooms, Student Rosters, and Invigilators.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

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
  { examId, roomId, scheduledStartTime, scheduledEndTime },
  client = null
) {
  const text = `
    INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
    VALUES ($1, $2, $3, $4, 'SCHEDULED')
    RETURNING session_id, exam_id, room_id, scheduled_start_time, scheduled_end_time, status, created_at, updated_at;
  `;
  const params = [examId, roomId || null, scheduledStartTime, scheduledEndTime];
  const res = client ? await client.query(text, params) : await query(text, params);
  return res.rows[0];
}

/**
 * Finds a session by ID with joined exam and room details.
 * @param {string} sessionId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function findSessionById(sessionId, client = null) {
  const text = `
    SELECT s.session_id, s.exam_id, s.room_id, s.scheduled_start_time, s.scheduled_end_time,
           s.status, s.created_at, s.updated_at,
           e.title AS exam_title, e.duration_minutes AS exam_duration_minutes,
           e.total_marks AS exam_total_marks, e.passing_marks AS exam_passing_marks,
           e.status AS exam_status, e.created_by AS exam_created_by,
           r.name AS room_name, r.capacity AS room_capacity, r.building AS room_building,
           (SELECT COUNT(*)::int FROM session_students WHERE session_id = s.session_id) AS student_count,
           (SELECT COUNT(*)::int FROM session_invigilators WHERE session_id = s.session_id) AS invigilator_count
    FROM exam_sessions s
    JOIN exams e ON s.exam_id = e.exam_id
    LEFT JOIN rooms r ON s.room_id = r.room_id
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
    SELECT session_id, exam_id, room_id, scheduled_start_time, scheduled_end_time, status, created_at, updated_at
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

  if (updates.room_id !== undefined) {
    fields.push(`room_id = $${idx++}`);
    values.push(updates.room_id);
  }
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

  fields.push(`updated_at = CURRENT_TIMESTAMP`);

  const text = `
    UPDATE exam_sessions
    SET ${fields.join(', ')}
    WHERE session_id = $1
    RETURNING session_id, exam_id, room_id, scheduled_start_time, scheduled_end_time, status, created_at, updated_at;
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
  { examId, roomId, status, limit = 20, offset = 0 },
  client = null
) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (examId) {
    conditions.push(`s.exam_id = $${idx++}`);
    values.push(examId);
  }
  if (roomId) {
    conditions.push(`s.room_id = $${idx++}`);
    values.push(roomId);
  }
  if (status) {
    conditions.push(`s.status = $${idx++}`);
    values.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const text = `
    SELECT s.session_id, s.exam_id, s.room_id, s.scheduled_start_time, s.scheduled_end_time,
           s.status, s.created_at, s.updated_at,
           e.title AS exam_title, e.duration_minutes AS exam_duration_minutes,
           r.name AS room_name, r.capacity AS room_capacity, r.building AS room_building,
           (SELECT COUNT(*)::int FROM session_students WHERE session_id = s.session_id) AS student_count,
           (SELECT COUNT(*)::int FROM session_invigilators WHERE session_id = s.session_id) AS invigilator_count
    FROM exam_sessions s
    JOIN exams e ON s.exam_id = e.exam_id
    LEFT JOIN rooms r ON s.room_id = r.room_id
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
export async function countSessions({ examId, roomId, status }, client = null) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (examId) {
    conditions.push(`exam_id = $${idx++}`);
    values.push(examId);
  }
  if (roomId) {
    conditions.push(`room_id = $${idx++}`);
    values.push(roomId);
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    values.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const text = `SELECT COUNT(*)::int AS total FROM exam_sessions ${whereClause};`;
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
    SELECT si.session_id, si.user_id, si.role, si.created_at,
           u.name AS invigilator_name, u.email AS invigilator_email
    FROM session_invigilators si
    JOIN users u ON si.user_id = u.user_id
    WHERE si.session_id = $1
    ORDER BY si.created_at ASC;
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
  const text = `
    INSERT INTO session_invigilators (session_id, user_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (session_id, user_id)
    DO UPDATE SET role = EXCLUDED.role
    RETURNING session_id, user_id, role, created_at;
  `;
  const res = client
    ? await client.query(text, [sessionId, userId, role])
    : await query(text, [sessionId, userId, role]);
  return res.rows[0];
}

/**
 * Removes an invigilator from a session.
 * @param {string} sessionId
 * @param {string} userId
 * @param {object} [client]
 * @returns {Promise<boolean>}
 */
export async function removeInvigilatorFromSession(sessionId, userId, client = null) {
  const text = `DELETE FROM session_invigilators WHERE session_id = $1 AND user_id = $2;`;
  const res = client ? await client.query(text, [sessionId, userId]) : await query(text, [sessionId, userId]);
  return res.rowCount > 0;
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
  const text = `
    INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, request_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING audit_id, actor_user_id, action, resource_type, resource_id, timestamp;
  `;
  const params = [actorUserId, action, resourceType, resourceId, requestId, JSON.stringify(metadata)];
  const res = client ? await client.query(text, params) : await query(text, params);
  return res.rows[0];
}
