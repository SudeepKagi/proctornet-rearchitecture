/**
 * @file purge-and-keep-admin-dev.js
 * @description Purges all existing examination, session, student, faculty, audit,
 * and test data while strictly preserving the ADMIN and DEVELOPER accounts.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(new URL('../../backend/package.json', import.meta.url));

const pg = require('pg');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'proctornet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function purgeData() {
  console.log('================================================================');
  console.log('PROCTORNET: PURGING ALL DATA EXCEPT ADMIN & DEV ACCOUNTS');
  console.log('================================================================');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Temporarily disable audit immutability triggers so audit_logs can be cleared
    console.log('[Purge] Disabling audit_logs immutability triggers...');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable;');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_truncate;');

    // 2. Truncate all non-user application tables with CASCADE
    console.log('[Purge] Truncating all transactional and operational data tables...');
    await client.query(`
      TRUNCATE TABLE
        answers,
        attempt_questions,
        audit_logs,
        biometric_verifications,
        evidence_records,
        exam_analytics_cache,
        exam_attempts,
        exam_entry_clearances,
        exam_questions,
        exam_sessions,
        exams,
        face_biometrics,
        faculty_profiles,
        liveness_challenges,
        manual_grade_audits,
        manual_grades,
        outbox_events,
        proctor_interventions,
        question_banks,
        question_options,
        questions,
        results,
        rooms,
        session_invigilators,
        session_students,
        student_configurations,
        student_identity_documents,
        student_profiles,
        subjects,
        submission_idempotency,
        topics,
        user_sessions,
        violation_events,
        violation_flags
      CASCADE;
    `);

    // 3. Re-enable audit immutability triggers
    console.log('[Purge] Re-enabling audit_logs immutability triggers...');
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable;');
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_truncate;');

    // 4. Remove all user_roles except those belonging to admin and developer
    console.log('[Purge] Purging non-admin, non-developer user roles...');
    await client.query(`
      DELETE FROM user_roles
      WHERE user_id NOT IN (
        SELECT user_id FROM users
        WHERE email IN ('admin@proctornet.edu', 'developer@proctornet.edu', 'dev@proctornet.edu')
      );
    `);

    // 5. Remove all users except admin and developer
    console.log('[Purge] Purging non-admin, non-developer users...');
    const delUsersRes = await client.query(`
      DELETE FROM users
      WHERE email NOT IN ('admin@proctornet.edu', 'developer@proctornet.edu', 'dev@proctornet.edu');
    `);
    console.log(`[Purge] Deleted ${delUsersRes.rowCount} user rows.`);

    // 6. Ensure admin and developer accounts exist and are in healthy active state
    console.log('[Purge] Verifying and provisioning ADMIN and DEVELOPER accounts...');
    
    const adminPassHash = await bcrypt.hash('Admin#2026_SecureExams!', 10);
    const devPassHash = await bcrypt.hash('Dev#2026_SecureExams!', 10);

    // Admin account
    const adminRes = await client.query(`
      INSERT INTO users (name, email, password_hash, status, verification_status, must_change_password, failed_login_attempts, locked_until)
      VALUES ('System Administrator', 'admin@proctornet.edu', $1, 'ACTIVE', 'VERIFIED', FALSE, 0, NULL)
      ON CONFLICT (email) DO UPDATE SET
        name = 'System Administrator',
        password_hash = $1,
        status = 'ACTIVE',
        verification_status = 'VERIFIED',
        must_change_password = FALSE,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      RETURNING user_id;
    `, [adminPassHash]);
    const adminId = adminRes.rows[0].user_id;

    await client.query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'ADMIN')
      ON CONFLICT (user_id, role) DO NOTHING;
    `, [adminId]);

    // Developer account (developer@proctornet.edu)
    const devRes = await client.query(`
      INSERT INTO users (name, email, password_hash, status, verification_status, must_change_password, failed_login_attempts, locked_until)
      VALUES ('Developer Operations', 'developer@proctornet.edu', $1, 'ACTIVE', 'VERIFIED', FALSE, 0, NULL)
      ON CONFLICT (email) DO UPDATE SET
        name = 'Developer Operations',
        password_hash = $1,
        status = 'ACTIVE',
        verification_status = 'VERIFIED',
        must_change_password = FALSE,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      RETURNING user_id;
    `, [devPassHash]);
    const devId = devRes.rows[0].user_id;

    await client.query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'DEVELOPER')
      ON CONFLICT (user_id, role) DO NOTHING;
    `, [devId]);

    // Developer account alias (dev@proctornet.edu)
    const devAliasRes = await client.query(`
      INSERT INTO users (name, email, password_hash, status, verification_status, must_change_password, failed_login_attempts, locked_until)
      VALUES ('Developer Operations', 'dev@proctornet.edu', $1, 'ACTIVE', 'VERIFIED', FALSE, 0, NULL)
      ON CONFLICT (email) DO UPDATE SET
        name = 'Developer Operations',
        password_hash = $1,
        status = 'ACTIVE',
        verification_status = 'VERIFIED',
        must_change_password = FALSE,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      RETURNING user_id;
    `, [devPassHash]);
    const devAliasId = devAliasRes.rows[0].user_id;

    await client.query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'DEVELOPER')
      ON CONFLICT (user_id, role) DO NOTHING;
    `, [devAliasId]);

    // 7. Update organization settings to point to Admin
    await client.query(`
      UPDATE organization_settings
      SET updated_by = $1,
          updated_at = NOW();
    `, [adminId]);

    await client.query('COMMIT');
    console.log('[Purge] PostgreSQL purge committed successfully.');

    // 8. Verification query
    const remainingUsers = await client.query(`
      SELECT u.user_id, u.name, u.email, u.status, u.verification_status, array_agg(r.role) as roles
      FROM users u
      LEFT JOIN user_roles r ON u.user_id = r.user_id
      GROUP BY u.user_id, u.name, u.email, u.status, u.verification_status;
    `);

    console.log('\n[Purge] Remaining Users in Database:');
    console.table(remainingUsers.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Purge] Error during purge:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

purgeData()
  .then(() => {
    console.log('[Purge] All data successfully purged except admin and dev accounts.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Purge] Failed:', err);
    process.exit(1);
  });
