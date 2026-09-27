import 'dotenv/config';
import { getPool } from '../src/infrastructure/postgres/pool.js';

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
  console.log('=== AUDIT FLOW 6: Results API Server-Side Gate ===\n');
  const pool = getPool();

  // 1. Authenticate Faculty
  console.log('1. Authenticating Faculty to schedule exam with MANUAL result release policy...');
  const facultyLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'faculty@proctornet.edu',
      password: 'Faculty#2026_SecureExams!'
    })
  });
  const facultyToken = facultyLogin.data.data.accessToken;

  // 2. Authenticate Student
  console.log('2. Authenticating Student candidate...');
  const studentLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'student@proctornet.edu',
      password: 'Student#2026_SecureExams!'
    })
  });
  const studentToken = studentLogin.data.data.accessToken;
  const studentUserId = studentLogin.data.data.user.userId;

  // 3. Schedule Live Exam
  const now = Date.now();
  const liveStart = new Date(now - 10 * 60 * 1000).toISOString();
  const liveEnd = new Date(now + 50 * 60 * 1000).toISOString();

  const scheduleRes = await api('/faculty/exams/schedule', {
    method: 'POST',
    headers: { Authorization: `Bearer ${facultyToken}` },
    body: JSON.stringify({
      title: `Unreleased Results Audit Test ${Date.now()}`,
      durationMinutes: 60,
      targetSemester: 4,
      targetDepartment: 'Computer Science and Engineering (CSE)',
      scheduledStartTime: liveStart,
      scheduledEndTime: liveEnd,
      poolId: 'd8fee93d-b402-48db-9271-a8a4d8dd470a'
    })
  });
  const examId = scheduleRes.data.data.exam.exam_id;
  const sessionId = scheduleRes.data.data.session.session_id;

  // Set results release policy to MANUAL and ensure unpublished
  await pool.query(
    "UPDATE exams SET results_release_policy = 'MANUAL', results_published_at = NULL, status = 'LIVE' WHERE exam_id = $1",
    [examId]
  );
  console.log(`Exam created (${examId}) with results_release_policy = 'MANUAL', results_published_at = NULL`);

  // 4. Candidate starts attempt and submits
  console.log('\n3. Candidate starting attempt and answering question...');
  const startRes = await api(`/sessions/${sessionId}/attempts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  const attemptId = startRes.data.data.attemptId || startRes.data.data.attempt_id;

  // Fetch question and answer
  const questionsRes = await api(`/attempts/${attemptId}/questions`, {
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  const questions = questionsRes.data.data.questions;
  const q1 = questions[0];

  await api(`/attempts/${attemptId}/answers/${q1.attempt_question_id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({
      answer_value: { selected_option_id: q1.options[0].option_id },
      expected_revision: 0
    })
  });

  // Submit attempt
  console.log('4. Candidate submitting completed exam attempt...');
  const submitRes = await api(`/attempts/${attemptId}/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Idempotency-Key': `flow6-sub-${Date.now()}`
    },
    body: JSON.stringify({
      finalizedAt: new Date().toISOString()
    })
  });
  console.log(`Submit status: HTTP ${submitRes.status} (${submitRes.data?.data?.status || submitRes.data?.status})`);

  // Ensure result evaluation is stored in DB
  const resInDb = await pool.query('SELECT result_id, score FROM results WHERE attempt_id = $1', [attemptId]);
  console.log(`Result evaluated in DB: ${resInDb.rowCount > 0 ? `Score: ${resInDb.rows[0].score}` : 'Evaluated via on-demand hook'}`);

  // 5. TEST: Candidate directly calls Results API for unreleased exam
  console.log('\n5. Candidate calls GET /api/v1/attempts/:attemptId/result while results are UNRELEASED...');
  const unreleasedCheck = await api(`/attempts/${attemptId}/result`, {
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  console.log(`API response status: HTTP ${unreleasedCheck.status}`, unreleasedCheck.data?.error || unreleasedCheck.data?.message);
  
  const isRejectedServerSide = unreleasedCheck.status === 403 && 
    (unreleasedCheck.data?.error?.code === 'RESULT_NOT_PUBLISHED' || unreleasedCheck.data?.code === 'RESULT_NOT_PUBLISHED' || unreleasedCheck.data?.message?.includes('not been released'));
  
  console.log(`Server strictly rejected direct call with HTTP 403 (RESULT_NOT_PUBLISHED): ${isRejectedServerSide}`);
  if (!isRejectedServerSide) {
    throw new Error(`CRITICAL: Server returned unreleased results to candidate! (HTTP ${unreleasedCheck.status})`);
  }

  // 6. TEST: Candidate tries calling staff results list
  console.log('\n6. Candidate tries calling staff results endpoint GET /api/v1/exams/:examId/results...');
  const staffCheck = await api(`/exams/${examId}/results`, {
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  console.log(`Staff endpoint response for student: HTTP ${staffCheck.status}`, staffCheck.data?.error || staffCheck.data?.message);
  const isStaffForbidden = staffCheck.status === 403;
  console.log(`Student strictly forbidden from staff results list: ${isStaffForbidden}`);
  if (!isStaffForbidden) {
    throw new Error('Student was able to access staff results endpoint!');
  }

  // 7. Faculty publishes results
  console.log('\n7. Faculty authoritatively publishes results for the exam...');
  await pool.query("UPDATE exams SET status = 'ENDED', updated_at = NOW() WHERE exam_id = $1", [examId]);
  const publishRes = await api(`/exams/${examId}/results/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${facultyToken}` }
  });
  console.log(`Publish results status: HTTP ${publishRes.status}`, publishRes.data?.data || publishRes.data);
  if (publishRes.status !== 200) {
    throw new Error(`Failed to publish exam results: ${JSON.stringify(publishRes.data)}`);
  }

  // 8. Candidate calls Results API AFTER release
  console.log('\n8. Candidate calls GET /api/v1/attempts/:attemptId/result AFTER publication...');
  const releasedCheck = await api(`/attempts/${attemptId}/result`, {
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  console.log(`Released result status: HTTP ${releasedCheck.status}`);
  const resultData = releasedCheck.data?.data || releasedCheck.data;
  console.log(`Result payload received: Score: ${resultData?.score}/${resultData?.total_marks || resultData?.totalMarks}, Percentage: ${resultData?.percentage}%, Passed: ${resultData?.passed}`);
  if (releasedCheck.status !== 200 || resultData?.score === undefined) {
    throw new Error('Candidate was unable to view results after publication!');
  }

  console.log('\n>>> FLOW 6 RESULT: 100% PASS - Unreleased results strictly rejected server-side with HTTP 403 (RESULT_NOT_PUBLISHED), verified authorized release after faculty publication <<<');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFlow 6 Error:', err);
  process.exit(1);
});
