/**
 * @file user.repository.js
 * @description PostgreSQL data access repository for user administration, profiles, roles, and verification.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

/**
 * Searches and paginates user records with profile and role joins.
 * @param {object} filters
 * @param {string} [filters.search]
 * @param {string} [filters.role]
 * @param {string} [filters.status]
 * @param {string} [filters.verification_status]
 * @param {object} pagination
 * @param {number} [pagination.limit=20]
 * @param {number} [pagination.offset=0]
 * @param {object} sorting
 * @param {string} [sorting.sort_by='created_at']
 * @param {'asc' | 'desc'} [sorting.sort_order='desc']
 * @returns {Promise<Array<object>>}
 */
export async function findUsers(filters = {}, pagination = {}, sorting = {}) {
  const params = [];
  const conditions = [];

  if (filters.search && typeof filters.search === 'string' && filters.search.trim() !== '') {
    params.push(`%${filters.search.trim()}%`);
    const idx = params.length;
    conditions.push(`(
      u.name ILIKE $${idx} OR 
      u.email ILIKE $${idx} OR 
      sp.enrollment_number ILIKE $${idx} OR 
      fp.employee_id ILIKE $${idx}
    )`);
  }

  if (filters.status && typeof filters.status === 'string') {
    params.push(filters.status);
    conditions.push(`u.status = $${params.length}`);
  }

  if (filters.verification_status && typeof filters.verification_status === 'string') {
    params.push(filters.verification_status);
    conditions.push(`u.verification_status = $${params.length}`);
  }

  if (filters.role && typeof filters.role === 'string') {
    params.push(filters.role);
    conditions.push(`EXISTS (
      SELECT 1 FROM user_roles ur_sub 
      WHERE ur_sub.user_id = u.user_id AND ur_sub.role = $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Safe sorting whitelist
  const allowedSortCols = {
    name: 'u.name',
    email: 'u.email',
    created_at: 'u.created_at',
    status: 'u.status',
    verification_status: 'u.verification_status'
  };
  const sortCol = allowedSortCols[sorting.sort_by] || 'u.created_at';
  const sortOrder = sorting.sort_order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const limit = Math.max(1, Math.min(pagination.limit || 20, 100));
  const offset = Math.max(0, pagination.offset || 0);

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const sql = `
    SELECT 
      u.user_id,
      u.name,
      u.email,
      u.phone,
      u.status,
      u.must_change_password,
      u.status_reason,
      u.status_updated_at,
      u.verification_status,
      u.verification_notes,
      u.verification_updated_at,
      u.failed_login_attempts,
      u.locked_until,
      u.created_at,
      u.updated_at,
      COALESCE(
        (
          SELECT json_agg(ur.role ORDER BY ur.role)
          FROM user_roles ur
          WHERE ur.user_id = u.user_id
        ),
        '[]'::json
      ) AS roles,
      sp.enrollment_number,
      sp.department AS student_department,
      sp.semester AS student_semester,
      fp.employee_id,
      fp.department AS faculty_department,
      fp.designation AS faculty_designation
    FROM users u
    LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
    LEFT JOIN faculty_profiles fp ON u.user_id = fp.user_id
    ${whereClause}
    ORDER BY ${sortCol} ${sortOrder}
    LIMIT $${limitIdx} OFFSET $${offsetIdx};
  `;

  const res = await query(sql, params);
  return res.rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    mustChangePassword: row.must_change_password,
    statusReason: row.status_reason,
    statusUpdatedAt: row.status_updated_at,
    verificationStatus: row.verification_status,
    verificationNotes: row.verification_notes,
    verificationUpdatedAt: row.verification_updated_at,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    roles: row.roles,
    identifier: row.enrollment_number || row.employee_id || null,
    department: row.student_department || row.faculty_department || null,
    semester: row.student_semester || null,
    designation: row.faculty_designation || null
  }));
}

/**
 * Counts users matching the specified filters.
 * @param {object} filters
 * @returns {Promise<number>}
 */
export async function countUsers(filters = {}) {
  const params = [];
  const conditions = [];

  if (filters.search && typeof filters.search === 'string' && filters.search.trim() !== '') {
    params.push(`%${filters.search.trim()}%`);
    const idx = params.length;
    conditions.push(`(
      u.name ILIKE $${idx} OR 
      u.email ILIKE $${idx} OR 
      sp.enrollment_number ILIKE $${idx} OR 
      fp.employee_id ILIKE $${idx}
    )`);
  }

  if (filters.status && typeof filters.status === 'string') {
    params.push(filters.status);
    conditions.push(`u.status = $${params.length}`);
  }

  if (filters.verification_status && typeof filters.verification_status === 'string') {
    params.push(filters.verification_status);
    conditions.push(`u.verification_status = $${params.length}`);
  }

  if (filters.role && typeof filters.role === 'string') {
    params.push(filters.role);
    conditions.push(`EXISTS (
      SELECT 1 FROM user_roles ur_sub 
      WHERE ur_sub.user_id = u.user_id AND ur_sub.role = $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT COUNT(u.user_id) AS total
    FROM users u
    LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
    LEFT JOIN faculty_profiles fp ON u.user_id = fp.user_id
    ${whereClause};
  `;

  const res = await query(sql, params);
  return parseInt(res.rows[0]?.total || 0, 10);
}

/**
 * Retrieves a detailed user record by ID.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function findUserDetailById(userId) {
  const sql = `
    SELECT 
      u.user_id,
      u.name,
      u.email,
      u.phone,
      u.status,
      u.must_change_password,
      u.status_reason,
      u.status_updated_at,
      u.verification_status,
      u.verification_notes,
      u.verification_updated_at,
      u.failed_login_attempts,
      u.locked_until,
      u.created_at,
      u.updated_at,
      COALESCE(
        (
          SELECT json_agg(ur.role ORDER BY ur.role)
          FROM user_roles ur
          WHERE ur.user_id = u.user_id
        ),
        '[]'::json
      ) AS roles,
      sp.enrollment_number,
      sp.department AS student_department,
      sp.semester AS student_semester,
      sp.metadata AS student_metadata,
      fp.employee_id,
      fp.department AS faculty_department,
      fp.designation AS faculty_designation,
      fp.metadata AS faculty_metadata,
      (
        SELECT COUNT(*)
        FROM user_sessions s
        WHERE s.user_id = u.user_id AND s.is_revoked = FALSE AND s.expires_at > CURRENT_TIMESTAMP
      ) AS active_sessions_count
    FROM users u
    LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
    LEFT JOIN faculty_profiles fp ON u.user_id = fp.user_id
    WHERE u.user_id = $1;
  `;

  const res = await query(sql, [userId]);
  const row = res.rows[0];
  if (!row) return null;

  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    mustChangePassword: row.must_change_password,
    statusReason: row.status_reason,
    statusUpdatedAt: row.status_updated_at,
    verificationStatus: row.verification_status,
    verificationNotes: row.verification_notes,
    verificationUpdatedAt: row.verification_updated_at,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    roles: row.roles,
    activeSessionsCount: parseInt(row.active_sessions_count || 0, 10),
    studentProfile: row.enrollment_number
      ? {
          enrollmentNumber: row.enrollment_number,
          department: row.student_department,
          semester: row.student_semester,
          metadata: row.student_metadata
        }
      : null,
    facultyProfile: row.employee_id
      ? {
          employeeId: row.employee_id,
          department: row.faculty_department,
          designation: row.faculty_designation,
          metadata: row.faculty_metadata
        }
      : null
  };
}

/**
 * Counts the number of distinct active administrators.
 * Used for Last-Admin protection.
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<number>}
 */
export async function countActiveAdmins(client = null) {
  const sql = `
    SELECT COUNT(DISTINCT u.user_id) AS active_admins
    FROM users u
    JOIN user_roles ur ON u.user_id = ur.user_id
    WHERE ur.role = 'ADMIN' AND u.status = 'ACTIVE';
  `;
  const executor = client ? client.query.bind(client) : query;
  const res = await executor(sql);
  return parseInt(res.rows[0]?.active_admins || 0, 10);
}

/**
 * Creates a minimal user record with initial unverified status and must_change_password flag.
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} [params.phone]
 * @param {string} params.passwordHash
 * @param {string} params.role
 * @param {string} [params.identifier] - Enrollment Number or Employee ID
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object>}
 */
export async function createMinimalUser(
  { name, email, phone = null, passwordHash, role, identifier = null },
  client = null
) {
  const runInTransaction = !client;
  const pool = getPool();
  const dbClient = client || (await pool.connect());

  try {
    if (runInTransaction) {
      await dbClient.query('BEGIN');
    }

    // 1. Insert core user
    const insertUserSql = `
      INSERT INTO users (
        name, email, phone, password_hash, status, 
        verification_status, must_change_password
      )
      VALUES ($1, $2, $3, $4, 'ACTIVE', 'UNVERIFIED', TRUE)
      RETURNING user_id, name, email, phone, status, verification_status, must_change_password, created_at;
    `;
    const userRes = await dbClient.query(insertUserSql, [
      name.trim(),
      email.toLowerCase().trim(),
      phone ? phone.trim() : null,
      passwordHash
    ]);
    const user = userRes.rows[0];

    // 2. Assign initial role
    const insertRoleSql = `
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, $2);
    `;
    await dbClient.query(insertRoleSql, [user.user_id, role]);

    // 3. Create minimal role-specific profile row if student or faculty
    if (role === 'STUDENT' && identifier) {
      const insertStudentSql = `
        INSERT INTO student_profiles (user_id, enrollment_number, metadata)
        VALUES ($1, $2, '{}'::jsonb);
      `;
      await dbClient.query(insertStudentSql, [user.user_id, identifier.trim()]);
    } else if ((role === 'FACULTY' || role === 'INVIGILATOR') && identifier) {
      const insertFacultySql = `
        INSERT INTO faculty_profiles (user_id, employee_id, metadata)
        VALUES ($1, $2, '{}'::jsonb);
      `;
      await dbClient.query(insertFacultySql, [user.user_id, identifier.trim()]);
    }

    if (runInTransaction) {
      await dbClient.query('COMMIT');
    }

    return {
      userId: user.user_id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      verificationStatus: user.verification_status,
      mustChangePassword: user.must_change_password,
      roles: [role],
      identifier,
      createdAt: user.created_at
    };
  } catch (err) {
    if (runInTransaction) {
      await dbClient.query('ROLLBACK');
    }
    throw err;
  } finally {
    if (runInTransaction) {
      dbClient.release();
    }
  }
}

/**
 * Updates a user's account status.
 * @param {string} userId
 * @param {string} status
 * @param {string} [reason]
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object>}
 */
export async function updateUserStatus(userId, status, reason = null, client = null) {
  const sql = `
    UPDATE users
    SET status = $2,
        status_reason = $3,
        status_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING user_id, status, status_reason, status_updated_at;
  `;
  const executor = client ? client.query.bind(client) : query;
  const res = await executor(sql, [userId, status, reason]);
  return res.rows[0];
}

/**
 * Clears failed login attempts and un-locks account.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function unlockUser(userId) {
  const sql = `
    UPDATE users
    SET failed_login_attempts = 0,
        locked_until = NULL,
        status = CASE WHEN status = 'LOCKED' THEN 'ACTIVE' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1;
  `;
  await query(sql, [userId]);
}

/**
 * Updates user password hash and clears must_change_password flag.
 * @param {string} userId
 * @param {string} passwordHash
 * @param {boolean} [mustChangePassword=false]
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<void>}
 */
export async function updateUserPassword(
  userId,
  passwordHash,
  mustChangePassword = false,
  client = null
) {
  const sql = `
    UPDATE users
    SET password_hash = $2,
        must_change_password = $3,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1;
  `;
  const executor = client ? client.query.bind(client) : query;
  await executor(sql, [userId, passwordHash, mustChangePassword]);
}

/**
 * Updates verification status and reviewer notes.
 * @param {string} userId
 * @param {string} verificationStatus
 * @param {string} [verificationNotes]
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object>}
 */
export async function updateVerificationStatus(
  userId,
  verificationStatus,
  verificationNotes = null,
  client = null
) {
  const sql = `
    UPDATE users
    SET verification_status = $2,
        verification_notes = $3,
        verification_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING user_id, verification_status, verification_notes, verification_updated_at;
  `;
  const executor = client ? client.query.bind(client) : query;
  const res = await executor(sql, [userId, verificationStatus, verificationNotes]);
  return res.rows[0];
}

/**
 * Updates candidate/student profile during onboarding.
 * @param {string} userId
 * @param {object} profileData
 * @param {string} profileData.department
 * @param {number} profileData.semester
 * @param {string} [profileData.phone]
 * @param {object} [profileData.metadata]
 * @param {import('pg').PoolClient} [client]
 */
export async function updateStudentOnboardingProfile(userId, profileData, client = null) {
  const executor = client ? client.query.bind(client) : query;

  if (profileData.phone) {
    await executor('UPDATE users SET phone = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1;', [
      userId,
      profileData.phone.trim()
    ]);
  }

  const sql = `
    UPDATE student_profiles
    SET department = $2,
        semester = $3,
        metadata = metadata || $4::jsonb,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1;
  `;
  await executor(sql, [
    userId,
    profileData.department.trim(),
    profileData.semester,
    JSON.stringify(profileData.metadata || {})
  ]);
}

/**
 * Updates faculty profile during onboarding.
 * @param {string} userId
 * @param {object} profileData
 * @param {string} profileData.department
 * @param {string} profileData.designation
 * @param {string} [profileData.phone]
 * @param {object} [profileData.metadata]
 * @param {import('pg').PoolClient} [client]
 */
export async function updateFacultyOnboardingProfile(userId, profileData, client = null) {
  const executor = client ? client.query.bind(client) : query;

  if (profileData.phone) {
    await executor('UPDATE users SET phone = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1;', [
      userId,
      profileData.phone.trim()
    ]);
  }

  const sql = `
    UPDATE faculty_profiles
    SET department = $2,
        designation = $3,
        metadata = metadata || $4::jsonb,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1;
  `;
  await executor(sql, [
    userId,
    profileData.department.trim(),
    profileData.designation.trim(),
    JSON.stringify(profileData.metadata || {})
  ]);
}

/**
 * Assigns an additional role to a user.
 * @param {string} userId
 * @param {string} role
 * @param {import('pg').PoolClient} [client]
 */
export async function assignRole(userId, role, client = null) {
  const sql = `
    INSERT INTO user_roles (user_id, role)
    VALUES ($1, $2)
    ON CONFLICT (user_id, role) DO NOTHING;
  `;
  const executor = client ? client.query.bind(client) : query;
  await executor(sql, [userId, role]);
}

/**
 * Revokes a role from a user.
 * @param {string} userId
 * @param {string} role
 * @param {import('pg').PoolClient} [client]
 */
export async function revokeRole(userId, role, client = null) {
  const sql = `
    DELETE FROM user_roles
    WHERE user_id = $1 AND role = $2;
  `;
  const executor = client ? client.query.bind(client) : query;
  await executor(sql, [userId, role]);
}

/**
 * Updates basic user profile information.
 * @param {string} userId
 * @param {object} fields
 * @returns {Promise<object>}
 */
export async function updateUserProfile(userId, fields = {}) {
  const updates = [];
  const params = [userId];

  if (fields.name) {
    params.push(fields.name.trim());
    updates.push(`name = $${params.length}`);
  }

  if (fields.phone !== undefined) {
    params.push(fields.phone ? fields.phone.trim() : null);
    updates.push(`phone = $${params.length}`);
  }

  if (updates.length === 0) {
    return findUserDetailById(userId);
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  const sql = `
    UPDATE users
    SET ${updates.join(', ')}
    WHERE user_id = $1
    RETURNING user_id, name, email, phone, updated_at;
  `;
  await query(sql, params);
  return findUserDetailById(userId);
}
