/**
 * @file auth.repository.js
 * @description Direct PostgreSQL data access repository for users, roles, profiles, and sessions.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

/**
 * Finds a user record by normalized email.
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function findUserByEmail(email) {
  const text = `
    SELECT user_id, name, email, phone, password_hash, status, failed_login_attempts, locked_until, created_at, updated_at
    FROM users
    WHERE email = $1;
  `;
  const res = await query(text, [email.toLowerCase().trim()]);
  return res.rows[0] || null;
}

/**
 * Finds a user record by user_id.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function findUserById(userId) {
  const text = `
    SELECT user_id, name, email, phone, status, failed_login_attempts, locked_until, created_at, updated_at
    FROM users
    WHERE user_id = $1;
  `;
  const res = await query(text, [userId]);
  return res.rows[0] || null;
}

/**
 * Retrieves all assigned role strings for a given user.
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function getUserRoles(userId) {
  const text = `
    SELECT role
    FROM user_roles
    WHERE user_id = $1
    ORDER BY role;
  `;
  const res = await query(text, [userId]);
  return res.rows.map((r) => r.role);
}

/**
 * Records a failed login attempt and locks account if threshold exceeded.
 * @param {string} userId
 * @param {number} currentFailed
 * @param {number} threshold
 * @param {number} lockoutMinutes
 * @returns {Promise<{ isLocked: boolean, failedAttempts: number }>}
 */
export async function recordFailedLogin(userId, currentFailed, threshold, lockoutMinutes) {
  const nextFailed = currentFailed + 1;
  let text;
  let params;

  if (nextFailed >= threshold) {
    text = `
      UPDATE users
      SET failed_login_attempts = $2,
          locked_until = CURRENT_TIMESTAMP + ($3 || ' minutes')::interval,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING failed_login_attempts, locked_until;
    `;
    params = [userId, nextFailed, lockoutMinutes];
  } else {
    text = `
      UPDATE users
      SET failed_login_attempts = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING failed_login_attempts, locked_until;
    `;
    params = [userId, nextFailed];
  }

  const res = await query(text, params);
  const row = res.rows[0];
  return {
    isLocked: nextFailed >= threshold,
    failedAttempts: row.failed_login_attempts
  };
}

/**
 * Resets failed login attempts and unlocks account upon successful authentication.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function resetFailedLogins(userId) {
  const text = `
    UPDATE users
    SET failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1;
  `;
  await query(text, [userId]);
}

/**
 * Transactionally creates a new user, assigns initial role, and sets up profile.
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} [params.phone]
 * @param {string} params.passwordHash
 * @param {string} [params.role='STUDENT']
 * @param {object} [params.studentProfile]
 * @param {object} [params.facultyProfile]
 * @returns {Promise<object>}
 */
export async function createUser({
  name,
  email,
  phone = null,
  passwordHash,
  role = 'STUDENT',
  studentProfile = null,
  facultyProfile = null
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insert user
    const insertUserText = `
      INSERT INTO users (name, email, phone, password_hash, status)
      VALUES ($1, $2, $3, $4, 'ACTIVE')
      RETURNING user_id, name, email, phone, status, created_at;
    `;
    const userRes = await client.query(insertUserText, [
      name.trim(),
      email.toLowerCase().trim(),
      phone ? phone.trim() : null,
      passwordHash
    ]);
    const user = userRes.rows[0];

    // 2. Assign role
    const insertRoleText = `
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, $2);
    `;
    await client.query(insertRoleText, [user.user_id, role]);

    // 3. Insert specific profile if provided
    if (role === 'STUDENT' && studentProfile) {
      const insertStudentText = `
        INSERT INTO student_profiles (user_id, enrollment_number, department, semester, metadata)
        VALUES ($1, $2, $3, $4, $5);
      `;
      await client.query(insertStudentText, [
        user.user_id,
        studentProfile.enrollment_number,
        studentProfile.department,
        studentProfile.semester,
        JSON.stringify(studentProfile.metadata || {})
      ]);
    } else if ((role === 'FACULTY' || role === 'INVIGILATOR') && facultyProfile) {
      const insertFacultyText = `
        INSERT INTO faculty_profiles (user_id, employee_id, department, designation, metadata)
        VALUES ($1, $2, $3, $4, $5);
      `;
      await client.query(insertFacultyText, [
        user.user_id,
        facultyProfile.employee_id,
        facultyProfile.department,
        facultyProfile.designation,
        JSON.stringify(facultyProfile.metadata || {})
      ]);
    }

    await client.query('COMMIT');
    return {
      ...user,
      roles: [role]
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Creates a new active user session in the database.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.refreshTokenHash
 * @param {string} [params.userAgent]
 * @param {string} [params.ipAddress]
 * @param {Date} params.expiresAt
 * @returns {Promise<object>}
 */
export async function createSession({
  userId,
  refreshTokenHash,
  userAgent = null,
  ipAddress = null,
  expiresAt
}) {
  const text = `
    INSERT INTO user_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING session_id, user_id, refresh_token_hash, is_revoked, expires_at, created_at;
  `;
  const res = await query(text, [userId, refreshTokenHash, userAgent, ipAddress, expiresAt]);
  return res.rows[0];
}

/**
 * Finds a session record by its refresh token hash.
 * @param {string} refreshTokenHash
 * @returns {Promise<object|null>}
 */
export async function findSessionByRefreshHash(refreshTokenHash) {
  const text = `
    SELECT s.session_id, s.user_id, s.refresh_token_hash, s.is_revoked, s.expires_at, s.created_at,
           u.status AS user_status, u.locked_until, u.failed_login_attempts
    FROM user_sessions s
    JOIN users u ON s.user_id = u.user_id
    WHERE s.refresh_token_hash = $1;
  `;
  const res = await query(text, [refreshTokenHash]);
  return res.rows[0] || null;
}

/**
 * Atomically rotates the refresh token hash for an active session.
 * @param {string} sessionId
 * @param {string} newRefreshTokenHash
 * @param {Date} newExpiresAt
 * @returns {Promise<object|null>}
 */
export async function updateSessionRefreshToken(sessionId, newRefreshTokenHash, newExpiresAt) {
  const text = `
    UPDATE user_sessions
    SET refresh_token_hash = $2,
        expires_at = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE session_id = $1 AND is_revoked = FALSE
    RETURNING session_id, user_id, refresh_token_hash, is_revoked, expires_at;
  `;
  const res = await query(text, [sessionId, newRefreshTokenHash, newExpiresAt]);
  return res.rows[0] || null;
}

/**
 * Explicitly revokes a session by session_id.
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export async function revokeSession(sessionId) {
  const text = `
    UPDATE user_sessions
    SET is_revoked = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE session_id = $1;
  `;
  await query(text, [sessionId]);
}

/**
 * Revokes all sessions for a given user (e.g., password change or admin security action).
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function revokeAllUserSessions(userId) {
  const text = `
    UPDATE user_sessions
    SET is_revoked = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1;
  `;
  await query(text, [userId]);
}
