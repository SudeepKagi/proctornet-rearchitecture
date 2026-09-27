/**
 * @file seed-default-users.js
 * @description Idempotent default credentials seeder for ProctorNet local development and evaluation.
 * Seeds standard demonstration accounts for ADMIN, DEVELOPER, FACULTY, and STUDENT roles.
 *
 * Usage:
 *   node scripts/db/seed-default-users.js
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

export const DEFAULT_USERS = [
  {
    role: 'ADMIN',
    name: 'System Administrator',
    email: 'admin@proctornet.edu',
    password: 'Admin#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  },
  {
    role: 'DEVELOPER',
    name: 'Developer Operations',
    email: 'developer@proctornet.edu',
    password: 'Dev#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  },
  {
    role: 'DEVELOPER',
    name: 'Developer Operations',
    email: 'dev@proctornet.edu',
    password: 'Dev#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  },
  {
    role: 'FACULTY',
    name: 'Professor Faculty',
    email: 'faculty@proctornet.edu',
    password: 'Faculty#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  },
  {
    role: 'INVIGILATOR',
    name: 'Exam Invigilator',
    email: 'invigilator@proctornet.edu',
    password: 'Invigilator#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  },
  {
    role: 'STUDENT',
    name: 'Candidate Student',
    email: 'student@proctornet.edu',
    password: 'Student#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  },
  {
    role: 'STUDENT',
    name: 'Sudeep Shankaranarayana Kagi',
    email: 'sudeep@proctornet.edu',
    password: 'Student#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  }
];

async function seedDefaultUsers() {
  console.log('================================================================');
  console.log('PROCTORNET: SEEDING DEFAULT EVALUATION & DEV USERS');
  console.log('================================================================');

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'proctornet',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    connectionTimeoutMillis: 5000
  });

  try {
    const client = await pool.connect();
    console.log('[Seed] Connected to PostgreSQL successfully.');

    for (const user of DEFAULT_USERS) {
      const passwordHash = await bcrypt.hash(user.password, 10);

      // Insert or update user
      const userRes = await client.query(
        `INSERT INTO users (name, email, password_hash, status, verification_status, must_change_password)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           status = 'ACTIVE',
           verification_status = 'VERIFIED',
           must_change_password = FALSE
         RETURNING user_id;`,
        [user.name, user.email, passwordHash, user.status, user.verificationStatus]
      );

      const userId = userRes.rows[0].user_id;

      // Assign user role
      await client.query(
        `INSERT INTO user_roles (user_id, role)
         VALUES ($1, $2)
         ON CONFLICT (user_id, role) DO NOTHING;`,
        [userId, user.role]
      );

      console.log(`[Seed] ✓ Provisioned ${user.role} account: ${user.email}`);
    }

    client.release();
    console.log('\n[Seed] Default evaluation credentials successfully provisioned:');
    DEFAULT_USERS.forEach((u) => {
      console.log(`  - Role: ${u.role.padEnd(10)} | Email: ${u.email.padEnd(25)} | Password: ${u.password}`);
    });
    console.log('================================================================\n');
  } catch (err) {
    console.error('[Seed] Database connection or seeding error:', err.message);
    console.error('[Seed] Note: Ensure PostgreSQL container is running (docker compose up -d postgres)');
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDefaultUsers();
}
