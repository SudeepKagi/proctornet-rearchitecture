/**
 * @file test_exam_security_evidence.js
 * @description Integration test for Item 6: WebSocket live evidence broadcast and fullscreen violation telemetry.
 */

import WebSocket from 'ws';

async function runTest() {
  console.log('=== Running Item 6 Live Evidence & Fullscreen Security Test ===');
  const baseUrl = 'http://localhost:3000/api/v1';

  // 1. Admin login to get token and query active session
  console.log('1. Admin logging in...');
  const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@proctornet.edu', password: 'Admin#2026_SecureExams!' })
  });
  const adminLoginData = await adminLoginRes.json();
  const adminToken = adminLoginData.data.accessToken;

  // 2. Teacher login
  console.log('2. Teacher logging in...');
  const teacherLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'teacher_68986@proctornet.edu', password: 'SecureTeacherPass123!' })
  });
  const teacherLoginData = await teacherLoginRes.json();
  const teacherToken = teacherLoginData.data.accessToken;

  // Fetch teacher's exams and sessions
  const examsRes = await fetch(`${baseUrl}/faculty/exams`, {
    headers: { 'Authorization': `Bearer ${teacherToken}` }
  });
  const examsData = await examsRes.json();
  const examsList = examsData.data?.exams || examsData.data || [];
  let testExam = examsList[0];
  let sessionId;

  if (testExam) {
    const sessRes = await fetch(`${baseUrl}/faculty/exams/${testExam.exam_id}/sessions`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    const sessData = await sessRes.json();
    const sessions = sessData.data?.sessions || sessData.data || [];
    if (sessions.length > 0) {
      sessionId = sessions[0].session_id;
    }
  }

  if (!sessionId) {
    // If no existing session, create an exam with session
    const deptsRes = await fetch(`${baseUrl}/student/departments`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    const deptsData = await deptsRes.json();
    const deptsList = deptsData.data?.departments || deptsData.data || [];
    const chosenDept = deptsList[0];
    const deptId = chosenDept?.department_id || chosenDept?.id;

    const start = new Date(Date.now() + 60000).toISOString();

    const createExamRes = await fetch(`${baseUrl}/faculty/exams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        title: `Security Test Exam ${Date.now()}`,
        subjectName: 'Computer Networks',
        description: 'Verifying live evidence and fullscreen violation telemetry',
        departmentId: deptId,
        targetSemester: 4,
        scheduledStartTime: start,
        durationMinutes: 60,
        totalMarks: 50,
        passingMarks: 20,
        questions: [
          {
            prompt_text: 'What layer does IP operate on?',
            points: 5,
            options: [
              { option_text: 'Network Layer', is_correct: true },
              { option_text: 'Transport Layer', is_correct: false },
              { option_text: 'Data Link Layer', is_correct: false },
              { option_text: 'Application Layer', is_correct: false }
            ]
          }
        ]
      })
    });
    const createData = await createExamRes.json();
    sessionId = createData.data?.session?.session_id || createData.data?.session_id;
    if (!sessionId) {
      console.error('Failed to create exam session:', createData);
      process.exit(1);
    }
  }

  console.log(`Using Session ID: ${sessionId}`);

  // 3. Connect Admin and Teacher WebSocket clients
  const wsUrl = 'ws://localhost:3000/ws';
  const teacherWs = new WebSocket(wsUrl, ['proctornet', adminToken]); // Admin has global authority on all rooms
  const studentWs = new WebSocket(wsUrl, ['proctornet', adminToken]);

  const evidenceReceivedPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for live evidence broadcast (10s)')), 10000);

    teacherWs.on('message', (data) => {
      try {
        const envelope = JSON.parse(data.toString());
        console.log(`[Observer WS Received Envelope]: ${envelope.type}`);
        if (envelope.type === 'VIOLATION_EVIDENCE_RECORDED') {
          console.log('[Observer WS] Successfully received live evidence snapshot payload:', envelope.payload);
          clearTimeout(timer);
          resolve(envelope.payload);
        }
      } catch (err) {
        // ignore
      }
    });
  });

  if (teacherWs.readyState !== WebSocket.OPEN) {
    await new Promise((resolve) => teacherWs.once('open', resolve));
  }
  console.log('[Observer WS Connected]');

  // Subscribe observer to session room
  teacherWs.send(JSON.stringify({
    type: 'subscribe',
    payload: { room: `session:${sessionId}` }
  }));

  // Wait for subscription to register
  await new Promise((r) => setTimeout(r, 600));

  if (studentWs.readyState !== WebSocket.OPEN) {
    await new Promise((resolve) => studentWs.once('open', resolve));
  }
  console.log('[Candidate WS Connected]');

  // 4. Candidate sends live violation evidence
  const mockPayload = {
    sessionId,
    attemptId: '11111111-2222-3333-4444-555555555555',
    studentName: 'Candidate Test',
    violationType: 'FULLSCREEN_EXIT',
    timestamp: new Date().toISOString(),
    screenshotUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...'
  };

  console.log('[Candidate WS Sending VIOLATION_EVIDENCE_RECORDED]...');
  studentWs.send(JSON.stringify({
    type: 'VIOLATION_EVIDENCE_RECORDED',
    payload: mockPayload
  }));

  const received = await evidenceReceivedPromise;
  if (received.violationType !== 'FULLSCREEN_EXIT') {
    throw new Error('Received unexpected violationType');
  }

  console.log('\n======================================================');
  console.log('ITEM 6 EVIDENCE VERIFIED: Real-time violation evidence snapshot streamed and received over WebSocket successfully!');
  console.log('======================================================\n');

  teacherWs.close();
  studentWs.close();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
