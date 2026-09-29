import 'dotenv/config';
import { getPool } from '../../src/infrastructure/postgres/pool.js';

const API_BASE = 'http://localhost:3000/api/v1';

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function main() {
  console.log('=== AUDIT FLOW 3: Faculty Roster Auto-Assignment & Re-sync ===\n');
  const pool = getPool();

  // 1. Login as Faculty
  console.log('1. Logging in as Faculty...');
  const facultyLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'faculty@proctornet.edu',
      password: 'Faculty#2026_SecureExams!'
    })
  });
  if (facultyLogin.status !== 200 || !facultyLogin.data?.data?.accessToken) {
    throw new Error(`Faculty login failed: ${JSON.stringify(facultyLogin.data)}`);
  }
  const facultyToken = facultyLogin.data.data.accessToken;
  const facultyUserId = facultyLogin.data.data.user.userId;
  console.log(`Faculty authenticated (User ID: ${facultyUserId})`);

  // Ensure test students exist in DB
  // Student A: CSE, Semester 4, ACTIVE
  // Student B: ECE, Semester 7, ACTIVE
  const cseStudentsInDb = await pool.query(`
    SELECT sp.user_id, u.name, u.email, sp.department, sp.semester
    FROM student_profiles sp
    JOIN users u ON sp.user_id = u.user_id
    WHERE sp.semester = 4 AND (sp.department ILIKE '%Computer Science%') AND u.status = 'ACTIVE'
  `);
  console.log(`\nDB Check: Found ${cseStudentsInDb.rowCount} eligible CSE Sem 4 student(s):`, cseStudentsInDb.rows);

  const eceStudentsInDb = await pool.query(`
    SELECT sp.user_id, u.name, u.email, sp.department, sp.semester
    FROM student_profiles sp
    JOIN users u ON sp.user_id = u.user_id
    WHERE sp.semester = 7 AND (sp.department ILIKE '%Electronics%') AND u.status = 'ACTIVE'
  `);
  console.log(`DB Check: Found ${eceStudentsInDb.rowCount} eligible ECE Sem 7 student(s):`, eceStudentsInDb.rows);

  // 2. Schedule Exam targeting CSE Semester 4
  console.log('\n2. Scheduling Exam targeting Computer Science & Engineering, Semester 4...');
  const now = Date.now();
  const startTime = new Date(now + 3600 * 1000).toISOString();
  const endTime = new Date(now + 7200 * 1000).toISOString();

  const schedulePayload = {
    title: `Audit Test Exam ${Date.now()}`,
    description: 'Exam for validating auto-assignment and re-sync',
    durationMinutes: 60,
    targetSemester: 4,
    targetDepartment: 'Computer Science and Engineering (CSE)',
    scheduledStartTime: startTime,
    scheduledEndTime: endTime,
    poolId: 'd8fee93d-b402-48db-9271-a8a4d8dd470a'
  };

  const scheduleRes = await api('/faculty/exams/schedule', {
    method: 'POST',
    headers: { Authorization: `Bearer ${facultyToken}` },
    body: JSON.stringify(schedulePayload)
  });

  console.log(`Schedule API status: ${scheduleRes.status}`);
  if (scheduleRes.status !== 201) {
    throw new Error(`Schedule exam failed: ${JSON.stringify(scheduleRes.data)}`);
  }
  const examId = scheduleRes.data.data.exam.exam_id;
  const sessionId = scheduleRes.data.data.session.session_id;
  console.log(`Exam created: ${examId}, Session: ${sessionId}`);

  // 3. Confirm auto-assigned roster directly in DB
  console.log('\n3. Verifying auto-assigned roster in DB (session_students)...');
  const rosterInitial = await pool.query(
    'SELECT student_id, status FROM session_students WHERE session_id = $1',
    [sessionId]
  );
  console.log(`Auto-assigned student count in DB: ${rosterInitial.rowCount}`);
  const assignedIds = rosterInitial.rows.map(r => r.student_id);
  const expectedCseIds = cseStudentsInDb.rows.map(r => r.user_id);
  
  const matchesCse = expectedCseIds.every(id => assignedIds.includes(id));
  console.log(`Roster matches DB CSE Sem 4 students: ${matchesCse} (Assigned: ${assignedIds.length}, Expected: ${expectedCseIds.length})`);
  if (!matchesCse || assignedIds.length !== expectedCseIds.length) {
    throw new Error('Initial roster auto-assignment mismatch!');
  }

  // 4. Edit target department and semester to ECE, Semester 7
  console.log('\n4. Editing exam target to Electronics & Communication Engineering (ECE), Semester 7...');
  const updateRes = await api(`/faculty/exams/${examId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${facultyToken}` },
    body: JSON.stringify({
      targetSemester: 7,
      targetDepartment: 'Electronics and Communication Engineering (ECE)'
    })
  });
  console.log(`Update Exam API status: ${updateRes.status}`);
  if (updateRes.status !== 200) {
    throw new Error(`Update exam failed: ${JSON.stringify(updateRes.data)}`);
  }

  // 5. Confirm re-synced roster directly in DB
  console.log('\n5. Verifying re-synced roster in DB (session_students)...');
  const rosterResynced = await pool.query(
    'SELECT student_id, status FROM session_students WHERE session_id = $1',
    [sessionId]
  );
  console.log(`Re-synced student count in DB: ${rosterResynced.rowCount}`);
  const resyncedIds = rosterResynced.rows.map(r => r.student_id);
  const expectedEceIds = eceStudentsInDb.rows.map(r => r.user_id);

  const matchesEce = expectedEceIds.every(id => resyncedIds.includes(id));
  const noOldStudents = !assignedIds.some(id => resyncedIds.includes(id) && !expectedEceIds.includes(id));
  console.log(`Roster matches DB ECE Sem 7 students: ${matchesEce}`);
  console.log(`Old CSE Sem 4 students completely cleared: ${noOldStudents}`);

  if (!matchesEce || !noOldStudents) {
    throw new Error('Roster re-sync verification failed!');
  }

  console.log('\n>>> FLOW 3 RESULT: 100% PASS - Roster auto-assignment and re-sync verified in DB <<<');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFlow 3 Error:', err);
  process.exit(1);
});
