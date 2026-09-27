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

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  database: process.env.DB_NAME || 'proctornet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

async function main() {
  const accounts = [
    { email: 'admin@proctornet.edu', pass: 'Admin#2026_SecureExams!', role: 'ADMIN', name: 'System Administrator' },
    { email: 'developer@proctornet.edu', pass: 'Dev#2026_SecureExams!', role: 'DEVELOPER', name: 'Developer Operations' },
    { email: 'dev@proctornet.edu', pass: 'Dev#2026_SecureExams!', role: 'DEVELOPER', name: 'Developer Operations' },
    { email: 'faculty@proctornet.edu', pass: 'Faculty#2026_SecureExams!', role: 'FACULTY', name: 'Professor Faculty' },
    { email: 'invigilator@proctornet.edu', pass: 'Invigilator#2026_SecureExams!', role: 'INVIGILATOR', name: 'Exam Invigilator' },
    { email: 'student@proctornet.edu', pass: 'Student#2026_SecureExams!', role: 'STUDENT', name: 'Candidate Student' },
    { email: 'sudeep@proctornet.edu', pass: 'Student#2026_SecureExams!', role: 'STUDENT', name: 'Sudeep Shankaranarayana Kagi' }
  ];

  for (const acc of accounts) {
    const hash = await bcrypt.hash(acc.pass, 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, status, verification_status, must_change_password)
       VALUES ($1, $2, $3, 'ACTIVE', 'VERIFIED', FALSE)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         status = 'ACTIVE',
         verification_status = 'VERIFIED',
         must_change_password = FALSE,
         failed_login_attempts = 0,
         locked_until = NULL;`,
      [acc.name, acc.email, hash]
    );

    // Get user id
    const res = await pool.query('SELECT user_id FROM users WHERE email = $1', [acc.email]);
    const uid = res.rows[0].user_id;

    const role = acc.role;

    await pool.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id, role) DO NOTHING;`,
      [uid, role]
    );

    if (role === 'STUDENT') {
      await pool.query(
        `INSERT INTO student_profiles (user_id, enrollment_number, department, semester, enrolled_face_photo_url)
         VALUES ($1, $2, 'Computer Science and Engineering', 6, 'https://proctornet-evidence-dev-01.s3.ap-south-1.amazonaws.com/reference-photos/sudeep-reference.jpg')
         ON CONFLICT (user_id) DO UPDATE SET
           enrolled_face_photo_url = EXCLUDED.enrolled_face_photo_url;`,
        [uid, acc.email.startsWith('sudeep') ? 'CS2026-001' : 'CS2026-002']
      );
      await pool.query(
        `INSERT INTO session_students (session_id, student_id, status)
         SELECT s.session_id, $1, 'ASSIGNED'
         FROM exam_sessions s
         WHERE s.status != 'COMPLETED'
         ON CONFLICT (session_id, student_id) DO NOTHING;`,
        [uid]
      );
    } else if (role === 'FACULTY') {
      await pool.query(
        `INSERT INTO faculty_profiles (user_id, employee_id, department, designation)
         VALUES ($1, 'FAC-2026-001', 'Computer Science and Engineering', 'Associate Professor')
         ON CONFLICT (user_id) DO NOTHING;`,
        [uid]
      );
    } else if (role === 'INVIGILATOR') {
      await pool.query(
        `INSERT INTO session_invigilators (session_id, user_id, role)
         SELECT s.session_id, $1, 'PRIMARY'
         FROM exam_sessions s
         WHERE s.status != 'COMPLETED'
         ON CONFLICT (session_id, user_id) DO NOTHING;`,
        [uid]
      );
    }

    console.log(`✓ Synchronized ${acc.email} with password "${acc.pass}" (Role: ${role})`);
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
