import pg from 'pg';
import bcrypt from 'bcrypt';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'proctornet',
  user: 'postgres',
  password: 'postgres'
});

async function main() {
  const accounts = [
    { email: 'student@proctornet.edu', pass: 'Candidate#2026_SecureExams!' },
    { email: 'candidate@proctornet.edu', pass: 'Candidate#2026_SecureExams!' },
    { email: 'faculty@proctornet.edu', pass: 'Faculty#2026_SecureExams!' },
    { email: 'invigilator@proctornet.edu', pass: 'Invigilator#2026_SecureExams!' },
    { email: 'admin@proctornet.edu', pass: 'Admin#2026_SecureExams!' },
    { email: 'developer@proctornet.edu', pass: 'Dev#2026_SecureExams!' }
  ];

  for (const acc of accounts) {
    const hash = await bcrypt.hash(acc.pass, 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, status, verification_status, must_change_password)
       VALUES ($1, $2, $3, 'ACTIVE', 'VERIFIED', FALSE)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'ACTIVE', failed_login_attempts = 0, locked_until = NULL;`,
      [acc.email.split('@')[0], acc.email, hash]
    );

    // Get user id
    const res = await pool.query('SELECT user_id FROM users WHERE email = $1', [acc.email]);
    const uid = res.rows[0].user_id;

    let role = 'STUDENT';
    if (acc.email.includes('faculty')) role = 'FACULTY';
    else if (acc.email.includes('invigilator')) role = 'INVIGILATOR';
    else if (acc.email.includes('admin')) role = 'ADMIN';
    else if (acc.email.includes('developer')) role = 'DEVELOPER';

    await pool.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id, role) DO NOTHING;`,
      [uid, role]
    );

    if (role === 'STUDENT') {
      await pool.query(
        `INSERT INTO session_students (session_id, student_id, status)
         SELECT s.session_id, $1, 'ASSIGNED'
         FROM exam_sessions s
         WHERE s.status != 'COMPLETED'
         ON CONFLICT (session_id, student_id) DO NOTHING;`,
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
