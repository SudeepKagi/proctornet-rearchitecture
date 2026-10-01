/**
 * @file student.repository.js
 * @description PostgreSQL data access layer for student profiles.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

export async function getStudentProfile(userId) {
  const sql = `
    SELECT 
      u.user_id,
      u.name,
      u.email,
      u.phone,
      u.status,
      u.verification_status,
      u.verification_notes,
      sp.enrollment_number,
      sp.semester,
      sp.face_photo_url,
      sp.college_id_url,
      sp.pending_face_photo_url,
      sp.pending_college_id_url,
      sp.photo_review_status,
      sp.department_id,
      d.name AS department_name,
      d.code AS department_code
    FROM users u
    LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
    LEFT JOIN departments d ON sp.department_id = d.department_id
    WHERE u.user_id = $1;
  `;
  const result = await query(sql, [userId]);
  return result.rows[0] || null;
}

export async function updateStudentProfile(userId, { name, departmentId, semester, facePhotoUrl, collegeIdUrl, phone }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (name || phone !== undefined) {
      const userUpdates = [];
      const userParams = [userId];
      if (name) {
        userParams.push(name.trim());
        userUpdates.push(`name = $${userParams.length}`);
      }
      if (phone !== undefined) {
        userParams.push(phone ? phone.trim() : null);
        userUpdates.push(`phone = $${userParams.length}`);
      }
      userUpdates.push('updated_at = CURRENT_TIMESTAMP');
      await client.query(
        `UPDATE users SET ${userUpdates.join(', ')} WHERE user_id = $1`,
        userParams
      );
    }

    const spUpdates = [];
    const spParams = [userId];

    if (departmentId !== undefined) {
      spParams.push(departmentId);
      spUpdates.push(`department_id = $${spParams.length}`);
    }
    if (semester !== undefined) {
      spParams.push(semester);
      spUpdates.push(`semester = $${spParams.length}`);
    }
    if (facePhotoUrl !== undefined) {
      spParams.push(facePhotoUrl);
      spUpdates.push(`face_photo_url = $${spParams.length}`);
    }
    if (collegeIdUrl !== undefined) {
      spParams.push(collegeIdUrl);
      spUpdates.push(`college_id_url = $${spParams.length}`);
    }

    if (spUpdates.length > 0) {
      spUpdates.push('updated_at = CURRENT_TIMESTAMP');
      await client.query(
        `UPDATE student_profiles SET ${spUpdates.join(', ')} WHERE user_id = $1`,
        spParams
      );
    }

    await client.query('COMMIT');
    return getStudentProfile(userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function submitStudentOnboarding(userId, { name, departmentId, semester, facePhotoUrl, collegeIdUrl }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Update user name and set verification_status = 'PENDING'
    await client.query(
      `UPDATE users 
       SET name = $2, verification_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1`,
      [userId, name ? name.trim() : 'Student']
    );

    // 2. Ensure student_profiles row exists or update it
    const existing = await client.query('SELECT 1 FROM student_profiles WHERE user_id = $1', [userId]);
    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO student_profiles (user_id, department_id, semester, face_photo_url, college_id_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, departmentId || null, semester || null, facePhotoUrl || null, collegeIdUrl || null]
      );
    } else {
      await client.query(
        `UPDATE student_profiles 
         SET department_id = $2, semester = $3, face_photo_url = $4, college_id_url = $5, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId, departmentId || null, semester || null, facePhotoUrl || null, collegeIdUrl || null]
      );
    }

    await client.query('COMMIT');
    return getStudentProfile(userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listDepartments() {
  const sql = `SELECT department_id, name, code FROM departments ORDER BY name ASC;`;
  const result = await query(sql);
  return result.rows;
}

export async function submitPendingPhotoUpdate(userId, pendingUrl) {
  const sql = `
    UPDATE student_profiles
    SET pending_face_photo_url = $2,
        photo_review_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING user_id, face_photo_url, pending_face_photo_url, photo_review_status;
  `;
  const result = await query(sql, [userId, pendingUrl]);
  return result.rows[0] || null;
}
