/**
 * @file studentConfig.repository.js
 * @description Database repository for per-student accommodations and proctoring strictness configuration.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';

/**
 * Retrieves student configuration by student ID.
 * @param {string} studentId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object|null>}
 */
export async function findConfigurationByStudentId(studentId, client = null) {
  const runner = client || getPool();
  const query = `
    SELECT
      sc.student_id,
      sc.extra_time_multiplier,
      sc.break_allowance_minutes,
      sc.max_breaks_allowed,
      sc.assistive_technology,
      sc.proctoring_strictness,
      sc.created_by,
      sc.updated_by,
      sc.created_at,
      sc.updated_at
    FROM student_configurations sc
    WHERE sc.student_id = $1;
  `;
  const result = await runner.query(query, [studentId]);
  return result.rows[0] || null;
}

/**
 * Inserts or updates per-student configuration in an authoritative upsert.
 * @param {object} data
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function upsertConfiguration(data, client = null) {
  const runner = client || getPool();
  const query = `
    INSERT INTO student_configurations (
      student_id,
      extra_time_multiplier,
      break_allowance_minutes,
      max_breaks_allowed,
      assistive_technology,
      proctoring_strictness,
      created_by,
      updated_by,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (student_id) DO UPDATE SET
      extra_time_multiplier = EXCLUDED.extra_time_multiplier,
      break_allowance_minutes = EXCLUDED.break_allowance_minutes,
      max_breaks_allowed = EXCLUDED.max_breaks_allowed,
      assistive_technology = EXCLUDED.assistive_technology,
      proctoring_strictness = EXCLUDED.proctoring_strictness,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const values = [
    data.studentId,
    data.extraTimeMultiplier ?? 1.00,
    data.breakAllowanceMinutes ?? 0,
    data.maxBreaksAllowed ?? 0,
    JSON.stringify(data.assistiveTechnology ?? { screenReader: false, speechToText: false, keyboardOnly: false }),
    data.proctoringStrictness ?? 'STANDARD',
    data.actorUserId || null
  ];

  const result = await runner.query(query, values);
  return result.rows[0];
}
