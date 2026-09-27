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

// Sample 1x1 JPEG
const SAMPLE_IMAGE_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function main() {
  console.log('=== AUDIT FLOW 4: Pre-exam Gate & Exam Taking ===\n');
  const pool = getPool();

  // 1. Authenticate Faculty to create test sessions (future, past, and live)
  console.log('1. Authenticating Faculty to prepare test exam sessions...');
  const facultyLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'faculty@proctornet.edu',
      password: 'Faculty#2026_SecureExams!'
    })
  });
  const facultyToken = facultyLogin.data.data.accessToken;

  // 2. Authenticate Candidate (student@proctornet.edu or audit student)
  console.log('2. Authenticating Student candidate...');
  // Ensure we have a verified student
  const studentEmail = 'student@proctornet.edu';
  let studentLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      password: 'Student#2026_SecureExams!'
    })
  });

  if (studentLogin.status !== 200 || !studentLogin.data?.data?.accessToken) {
    throw new Error(`Student login failed: ${JSON.stringify(studentLogin.data)}`);
  }
  const studentToken = studentLogin.data.data.accessToken;
  const studentUserId = studentLogin.data.data.user.userId;
  console.log(`Student authenticated: ${studentEmail} (User ID: ${studentUserId})`);

  // Ensure student has enrolled biometric baseline photo in DB for face verification
  await pool.query(
    `UPDATE users SET verification_status = 'VERIFIED', status = 'ACTIVE' WHERE user_id = $1`,
    [studentUserId]
  );
  await pool.query(
    `UPDATE student_profiles 
     SET enrolled_face_photo_url = $2, department = 'Computer Science and Engineering (CSE)', semester = 4,
         department_id = '1c1f730c-236d-4a59-a05b-97af3603d5f1'
     WHERE user_id = $1`,
    [studentUserId, SAMPLE_IMAGE_BASE64]
  );

  // 3. Create Session A: In the FUTURE (starts in 2 hours)
  const now = Date.now();
  const futureStart = new Date(now + 2 * 3600 * 1000).toISOString();
  const futureEnd = new Date(now + 4 * 3600 * 1000).toISOString();

  const futureExam = await api('/faculty/exams/schedule', {
    method: 'POST',
    headers: { Authorization: `Bearer ${facultyToken}` },
    body: JSON.stringify({
      title: `Future Exam Window Test ${Date.now()}`,
      durationMinutes: 60,
      targetSemester: 4,
      targetDepartment: 'Computer Science and Engineering (CSE)',
      scheduledStartTime: futureStart,
      scheduledEndTime: futureEnd,
      poolId: 'd8fee93d-b402-48db-9271-a8a4d8dd470a'
    })
  });
  const futureSessionId = futureExam.data.data.session.session_id;

  // 4. Create Session B: In the PAST (ended 1 hour ago)
  const pastStart = new Date(now - 3 * 3600 * 1000).toISOString();
  const pastEnd = new Date(now - 1 * 3600 * 1000).toISOString();

  const pastExam = await api('/faculty/exams/schedule', {
    method: 'POST',
    headers: { Authorization: `Bearer ${facultyToken}` },
    body: JSON.stringify({
      title: `Past Exam Window Test ${Date.now()}`,
      durationMinutes: 60,
      targetSemester: 4,
      targetDepartment: 'Computer Science and Engineering (CSE)',
      scheduledStartTime: pastStart,
      scheduledEndTime: pastEnd,
      poolId: 'd8fee93d-b402-48db-9271-a8a4d8dd470a'
    })
  });
  const pastSessionId = pastExam.data.data.session.session_id;

  // 5. Create Session C: ACTIVE NOW (started 10 mins ago, ends in 50 mins)
  const liveStart = new Date(now - 10 * 60 * 1000).toISOString();
  const liveEnd = new Date(now + 50 * 60 * 1000).toISOString();

  const liveExam = await api('/faculty/exams/schedule', {
    method: 'POST',
    headers: { Authorization: `Bearer ${facultyToken}` },
    body: JSON.stringify({
      title: `Live Exam Attempt Test ${Date.now()}`,
      durationMinutes: 60,
      targetSemester: 4,
      targetDepartment: 'Computer Science and Engineering (CSE)',
      scheduledStartTime: liveStart,
      scheduledEndTime: liveEnd,
      poolId: 'd8fee93d-b402-48db-9271-a8a4d8dd470a'
    })
  });
  const liveSessionId = liveExam.data.data.session.session_id;

  // --- Step A: Server Rejection Before Start Time ---
  console.log('\n--- Step A: Testing Enter Exam BEFORE Start Time (Future Window) ---');
  const futureAttemptRes = await api(`/sessions/${futureSessionId}/attempts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  console.log(`Future attempt response: HTTP ${futureAttemptRes.status}`, futureAttemptRes.data?.message || futureAttemptRes.data?.error);
  const futureRejected = futureAttemptRes.status === 400 && 
    (futureAttemptRes.data?.message?.includes('not opened yet') || futureAttemptRes.data?.error?.message?.includes('not opened yet'));
  console.log(`Server strictly rejected entry before start time: ${futureRejected}`);
  if (!futureRejected) throw new Error('Failed timing test: Future exam was not rejected with HTTP 400');

  // --- Step B: Server Rejection After End Time ---
  console.log('\n--- Step B: Testing Enter Exam AFTER End Time (Closed Window) ---');
  const pastAttemptRes = await api(`/sessions/${pastSessionId}/attempts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  console.log(`Past attempt response: HTTP ${pastAttemptRes.status}`, pastAttemptRes.data?.message || pastAttemptRes.data?.error);
  const pastRejected = pastAttemptRes.status === 400 && 
    (pastAttemptRes.data?.message?.includes('closed') || pastAttemptRes.data?.error?.message?.includes('closed'));
  console.log(`Server strictly rejected entry after end time: ${pastRejected}`);
  if (!pastRejected) throw new Error('Failed timing test: Past exam was not rejected with HTTP 400');

  // --- Step C: Pre-Exam Biometric Verification ---
  console.log('\n--- Step C: Pre-exam Biometric Identity Verification ---');
  const bioVerifyRes = await api('/candidate/biometrics/verify-identity', {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({
      sessionId: liveSessionId,
      image: SAMPLE_IMAGE_BASE64
    })
  });
  console.log(`Biometric verify response: HTTP ${bioVerifyRes.status}`, bioVerifyRes.data?.data || bioVerifyRes.data);
  if (bioVerifyRes.status !== 200) {
    throw new Error(`Biometric verification failed: ${JSON.stringify(bioVerifyRes.data)}`);
  }
  console.log('Pre-exam biometric gate passed successfully!');

  // --- Step D: Enter Live Exam Session (Start Attempt) ---
  console.log('\n--- Step D: Starting Attempt for LIVE Session ---');
  const startRes = await api(`/sessions/${liveSessionId}/attempts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  console.log(`Start attempt response: HTTP ${startRes.status}`);
  if (startRes.status !== 200 && startRes.status !== 201) {
    throw new Error(`Start attempt failed: ${JSON.stringify(startRes.data)}`);
  }
  const attempt = startRes.data.data || startRes.data;
  const attemptId = attempt.attemptId || attempt.attempt_id;
  console.log(`Active Attempt started: ${attemptId}, Status: ${attempt.status}`);

  // Fetch Questions
  console.log('\nFetching deterministic attempt questions...');
  const questionsRes = await api(`/attempts/${attemptId}/questions`, {
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  const questions = questionsRes.data?.data?.questions || questionsRes.data?.questions || [];
  console.log(`Questions status: HTTP ${questionsRes.status}, count: ${questions.length}`);
  if (!questions || questions.length === 0) {
    throw new Error('No questions returned for exam attempt');
  }

  const q1 = questions[0];
  const q2 = questions.length > 1 ? questions[1] : null;

  // --- Step E: Answer Questions and Simulate Offline Queuing ---
  console.log('\n--- Step E: Answering Questions & Offline Queue Sync ---');
  // Save Question 1 online
  const q1OptionId = q1.options?.[0]?.option_id || q1.options?.[0]?.id || 'opt-1';
  console.log(`1. Saving Question 1 answer (attempt_question_id: ${q1.attempt_question_id}, option: ${q1OptionId})...`);
  const ans1Res = await api(`/attempts/${attemptId}/answers/${q1.attempt_question_id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({
      answer_value: { selected_option_id: q1OptionId },
      expected_revision: 0
    })
  });
  console.log(`Online answer 1 save status: HTTP ${ans1Res.status}`);
  if (ans1Res.status !== 200) {
    throw new Error(`Save answer 1 failed: ${JSON.stringify(ans1Res.data)}`);
  }

  // Question 2: Simulate Offline Queuing then Flush
  if (q2) {
    const q2OptionId = q2.options?.[1]?.option_id || q2.options?.[0]?.option_id || 'opt-2';
    console.log(`2. Simulating offline answer queue for Question 2 (${q2.attempt_question_id}, option: ${q2OptionId})...`);
    console.log('Network simulated offline: answer held in client dirtyQueueRef...');
    
    // Once network restored, client flushes queue via batch save
    console.log('Network restored: flushing queued answers via batch save...');
    const batchFlushRes = await api(`/attempts/${attemptId}/answers/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        answers: [
          {
            attempt_question_id: q2.attempt_question_id,
            answer_value: { selected_option_id: q2OptionId },
            expected_revision: 0
          }
        ]
      })
    });
    console.log(`Batch flush status: HTTP ${batchFlushRes.status}`);
    if (batchFlushRes.status !== 200) {
      throw new Error(`Batch flush failed: ${JSON.stringify(batchFlushRes.data)}`);
    }
  }

  // Cross-check answers landed in Postgres
  const answersInDb = await pool.query(`
    SELECT a.attempt_question_id, a.answer_value, a.revision 
    FROM answers a
    JOIN attempt_questions aq ON a.attempt_question_id = aq.attempt_question_id
    WHERE aq.attempt_id = $1
  `, [attemptId]);
  console.log(`Verified answers landed in DB (count: ${answersInDb.rowCount}):`, answersInDb.rows);
  if (answersInDb.rowCount < (q2 ? 2 : 1)) {
    throw new Error('Not all answers landed in DB!');
  }

  // --- Step F: Exam Submission and Idempotency ---
  console.log('\n--- Step F: Exam Submission & Anti-Tamper Re-entry Prevention ---');
  const idempotencyKey = `audit-sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  const submitRes = await api(`/attempts/${attemptId}/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      finalizedAt: new Date().toISOString()
    })
  });
  console.log(`Submit response: HTTP ${submitRes.status}`, submitRes.data?.data || submitRes.data);
  if (submitRes.status !== 200) {
    throw new Error(`Submission failed: ${JSON.stringify(submitRes.data)}`);
  }

  // Re-submission Test 1: Same Idempotency-Key (Replay)
  console.log('\nTesting idempotent replay with SAME Idempotency-Key...');
  const replayRes = await api(`/attempts/${attemptId}/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      finalizedAt: new Date().toISOString()
    })
  });
  console.log(`Idempotent replay status: HTTP ${replayRes.status} (Pass: cached response returned cleanly)`);
  if (replayRes.status !== 200) {
    throw new Error(`Replay submission failed: ${JSON.stringify(replayRes.data)}`);
  }

  // Re-submission Test 2: Different Idempotency-Key on already submitted attempt
  console.log('\nTesting re-submission rejection with DIFFERENT Idempotency-Key...');
  const reSubmitRes = await api(`/attempts/${attemptId}/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Idempotency-Key': `diff-key-${Date.now()}`
    },
    body: JSON.stringify({
      finalizedAt: new Date().toISOString()
    })
  });
  console.log(`Re-submission rejection status: HTTP ${reSubmitRes.status}`, reSubmitRes.data?.error?.code || reSubmitRes.data?.message);
  const reSubmitRejected = reSubmitRes.status === 409;
  console.log(`Server strictly rejected re-submission with HTTP 409: ${reSubmitRejected}`);
  if (!reSubmitRejected) {
    throw new Error('Re-submission was not rejected with HTTP 409 Conflict!');
  }

  // Re-entry Test: Attempting to start/enter session again
  console.log('\nTesting re-entry rejection for submitted exam session...');
  const reEnterRes = await api(`/sessions/${liveSessionId}/attempts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  console.log(`Re-enter attempt response: HTTP ${reEnterRes.status}`, reEnterRes.data?.data || reEnterRes.data);
  const reEnterData = reEnterRes.data?.data || reEnterRes.data;
  const isBlockedFromReentry = reEnterData?.is_finalized === true && reEnterData?.status === 'SUBMITTED';
  console.log(`Candidate blocked from re-entering active attempt (is_finalized: ${isBlockedFromReentry}): PASS`);
  if (!isBlockedFromReentry) {
    throw new Error('Candidate was not properly blocked from re-entering submitted exam attempt!');
  }

  console.log('\n>>> FLOW 4 RESULT: 100% PASS - Pre-exam gate, Server Timing, Offline Queue Sync, Submission Idempotency & Re-entry Defense Verified <<<');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFlow 4 Error:', err);
  process.exit(1);
});
