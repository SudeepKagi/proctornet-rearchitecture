import 'dotenv/config';
import WebSocket from 'ws';
import { getPool } from '../../src/infrastructure/postgres/pool.js';
import { defaultSfuManager } from '../../src/infrastructure/media/sfuManager.js';
import { getRedisClient } from '../../src/infrastructure/redis/client.js';

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

// Minimal valid video RTP parameters for mediasoup Router
const MOCK_VIDEO_RTP_PARAMETERS = {
  mid: '0',
  codecs: [
    {
      mimeType: 'video/VP8',
      payloadType: 96,
      clockRate: 90000,
      rtcpFeedback: []
    }
  ],
  headerExtensions: [],
  encodings: [
    {
      ssrc: 11111111
    }
  ],
  rtcp: {
    cname: 'proctornet-test-stream',
    reducedSize: true
  }
};

async function main() {
  console.log('=== AUDIT FLOW 5: Live Invigilation & SFU Producer Release ===\n');
  const pool = getPool();
  const redis = getRedisClient();

  // 1. Authenticate Faculty
  console.log('1. Authenticating Faculty to schedule live exam session...');
  const facultyLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'faculty@proctornet.edu',
      password: 'Faculty#2026_SecureExams!'
    })
  });
  const facultyToken = facultyLogin.data.data.accessToken;

  // 2. Schedule live exam session
  const now = Date.now();
  const liveStart = new Date(now - 5 * 60 * 1000).toISOString();
  const liveEnd = new Date(now + 55 * 60 * 1000).toISOString();

  const scheduleRes = await api('/faculty/exams/schedule', {
    method: 'POST',
    headers: { Authorization: `Bearer ${facultyToken}` },
    body: JSON.stringify({
      title: `Invigilation Multi-Video Test ${Date.now()}`,
      durationMinutes: 60,
      targetSemester: 4,
      targetDepartment: 'Computer Science and Engineering (CSE)',
      scheduledStartTime: liveStart,
      scheduledEndTime: liveEnd,
      poolId: 'd8fee93d-b402-48db-9271-a8a4d8dd470a'
    })
  });
  const sessionId = scheduleRes.data.data.session.session_id;
  console.log(`Live Session created: ${sessionId}`);

  // 3. Setup 3 Candidates:
  // Candidate 1: student@proctornet.edu
  // Candidate 2: audit_student_1790516230780@proctornet.edu
  // Candidate 3: audit_student_flow5@proctornet.edu (created if needed)
  console.log('\n2. Setting up 3 active candidate sessions...');
  
  // Ensure candidate 3 exists
  let cand3Res = await pool.query("SELECT user_id FROM users WHERE email = 'flow5_student3@proctornet.edu'");
  let cand3Id;
  if (cand3Res.rowCount === 0) {
    const inserted = await pool.query(`
      INSERT INTO users (email, name, password_hash, status, verification_status)
      VALUES ('flow5_student3@proctornet.edu', 'Flow5 Candidate Three', 'dummyhash', 'ACTIVE', 'VERIFIED')
      RETURNING user_id
    `);
    cand3Id = inserted.rows[0].user_id;
    await pool.query(`
      INSERT INTO student_profiles (user_id, enrollment_number, department, semester, department_id)
      VALUES ($1, 'FLOW5_003', 'Computer Science and Engineering (CSE)', 4, '1c1f730c-236d-4a59-a05b-97af3603d5f1')
    `, [cand3Id]);
    await pool.query(`
      INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT')
    `, [cand3Id]);
  } else {
    cand3Id = cand3Res.rows[0].user_id;
  }

  // Assign all 3 candidates to the session roster and start attempts
  const candidateUsers = [
    { email: 'student@proctornet.edu', name: 'Candidate 1' },
    { email: 'audit_student_1790516230780@proctornet.edu', name: 'Candidate 2' },
    { email: 'flow5_student3@proctornet.edu', name: 'Candidate 3' }
  ];

  const candidateSessions = [];

  for (const c of candidateUsers) {
    const uRes = await pool.query('SELECT user_id FROM users WHERE email = $1', [c.email]);
    const uId = uRes.rows[0].user_id;

    // Ensure assigned to session
    await pool.query(`
      INSERT INTO session_students (session_id, student_id, status)
      VALUES ($1, $2, 'ASSIGNED')
      ON CONFLICT (session_id, student_id) DO NOTHING
    `, [sessionId, uId]);

    // Create or find active attempt
    let attRes = await pool.query(
      "SELECT attempt_id, status FROM exam_attempts WHERE session_id = $1 AND student_id = $2",
      [sessionId, uId]
    );
    let attemptId;
    if (attRes.rowCount === 0) {
      const newAtt = await pool.query(`
        INSERT INTO exam_attempts (session_id, student_id, status, started_at, expires_at)
        VALUES ($1, $2, 'ACTIVE', NOW(), NOW() + INTERVAL '1 hour')
        RETURNING attempt_id
      `, [sessionId, uId]);
      attemptId = newAtt.rows[0].attempt_id;
    } else {
      attemptId = attRes.rows[0].attempt_id;
    }

    candidateSessions.push({
      userId: uId,
      email: c.email,
      name: c.name,
      attemptId
    });
  }
  console.log(`Active candidates ready:`, candidateSessions.map(c => `${c.name} (${c.userId})`));

  // 4. Authenticate Invigilator
  console.log('\n3. Authenticating Invigilator and assigning to session...');
  const invigLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'invigilator@proctornet.edu',
      password: 'Invigilator#2026_SecureExams!'
    })
  });
  const invigilatorUserId = invigLogin.data.data.user.userId;
  await pool.query(`
    INSERT INTO session_invigilators (session_id, user_id, role)
    VALUES ($1, $2, 'PRIMARY')
    ON CONFLICT (session_id, user_id) DO NOTHING
  `, [sessionId, invigilatorUserId]);
  console.log(`Invigilator assigned: ${invigilatorUserId}`);

  // 5. Initialize SFU Router for this session
  console.log('\n4. Initializing mediasoup SFU Router for the session...');
  await defaultSfuManager.init();
  const { router } = await defaultSfuManager.getOrCreateRouter(sessionId);
  console.log(`Mediasoup router created for session: ${sessionId}, RTP codecs: ${router.rtpCapabilities.codecs.length}`);

  // 6. Connect All 3 Candidates and Produce Video Tracks
  console.log('\n5. Creating WebRTC send transports and producing video for all 3 candidates...');
  const candidateTransports = [];
  const candidateProducers = [];

  for (let i = 0; i < 3; i++) {
    const cand = candidateSessions[i];
    const connectionId = `conn-cand-${i + 1}-${Date.now()}`;
    
    // Create Send Transport: (sessionId, connectionId, userId, direction)
    const transportObj = await defaultSfuManager.createTransport(
      sessionId,
      connectionId,
      cand.userId,
      'send'
    );

    // Produce Video Stream
    const rtpParams = {
      ...MOCK_VIDEO_RTP_PARAMETERS,
      encodings: [{ ssrc: 20000000 + i * 1000 }]
    };

    const prodResult = await defaultSfuManager.produce(
      sessionId,
      transportObj.id,
      'video',
      rtpParams,
      { trackType: 'webcam' },
      connectionId,
      cand.userId
    );

    candidateTransports.push({ transportId: transportObj.id, connectionId, userId: cand.userId });
    candidateProducers.push({ producerId: prodResult.id, connectionId, userId: cand.userId, name: cand.name });
    console.log(`Candidate ${i + 1} (${cand.name}) produced video stream: Producer ID ${prodResult.id}`);
  }

  // 7. Invigilator Side: Consuming All 3 Streams
  console.log('\n6. Invigilator consuming all 3 candidate video feeds simultaneously...');
  const invigConnId = `conn-invig-${Date.now()}`;
  const invigRecvTransport = await defaultSfuManager.createTransport(
    sessionId,
    invigConnId,
    invigilatorUserId,
    'recv'
  );

  const consumedFeeds = [];
  for (const prod of candidateProducers) {
    const consumerRes = await defaultSfuManager.consume(
      sessionId,
      invigRecvTransport.id,
      prod.producerId,
      router.rtpCapabilities,
      invigConnId,
      invigilatorUserId
    );
    consumedFeeds.push({
      consumerId: consumerRes.id,
      producerId: prod.producerId,
      kind: consumerRes.kind,
      type: consumerRes.type
    });
    console.log(`Invigilator actively consuming ${prod.name}: Consumer ID ${consumerRes.id} (${consumerRes.kind} ${consumerRes.type})`);
  }

  console.log(`All ${consumedFeeds.length} candidate video feeds successfully rendered to invigilator!`);
  if (consumedFeeds.length !== 3) {
    throw new Error('Failed to consume all 3 video feeds');
  }

  // --- Release Test 1: Candidate 1 closes tab mid-exam ---
  console.log('\n--- Release Test 1: Candidate 1 Closes Tab Mid-Exam ---');
  const cand1 = candidateProducers[0];
  console.log(`Candidate 1 (${cand1.name}) abruptly closes tab (connectionId: ${cand1.connectionId})...`);
  await defaultSfuManager.closeTransportsForConnection(cand1.connectionId);

  const cand1Leaked = defaultSfuManager.producers.has(cand1.producerId);
  const cand1InRedis = await redis.hget(`media:session:${sessionId}`, cand1.producerId);
  console.log(`Candidate 1 producer in memory map: ${cand1Leaked} (Expected: false)`);
  console.log(`Candidate 1 producer in Redis registry: ${Boolean(cand1InRedis)} (Expected: false)`);
  if (cand1Leaked || cand1InRedis) {
    throw new Error('Candidate 1 producer was leaked on tab close!');
  }
  console.log('Test 1 PASS: Producer cleanly released on abrupt tab close without leak.');

  // --- Release Test 2: Candidate 2 Clean Normal Submit ---
  console.log('\n--- Release Test 2: Candidate 2 Clean Normal Submit ---');
  const cand2 = candidateProducers[1];
  console.log(`Candidate 2 (${cand2.name}) submits exam and tears down media...`);
  // Explicitly close producer on submit
  await defaultSfuManager.closeProducer(cand2.producerId);
  await defaultSfuManager.closeTransportsForConnection(cand2.connectionId);

  const cand2Leaked = defaultSfuManager.producers.has(cand2.producerId);
  const cand2InRedis = await redis.hget(`media:session:${sessionId}`, cand2.producerId);
  console.log(`Candidate 2 producer in memory map: ${cand2Leaked} (Expected: false)`);
  console.log(`Candidate 2 producer in Redis registry: ${Boolean(cand2InRedis)} (Expected: false)`);
  if (cand2Leaked || cand2InRedis) {
    throw new Error('Candidate 2 producer was leaked on normal submit!');
  }
  console.log('Test 2 PASS: Producer cleanly released on normal submit.');

  // --- Release Test 3: Candidate 3 Page Refresh ---
  console.log('\n--- Release Test 3: Candidate 3 Page Refresh ---');
  const cand3 = candidateProducers[2];
  console.log(`Candidate 3 (${cand3.name}) refreshes page...`);
  console.log(`1. Old page unload: closing old connection (${cand3.connectionId})...`);
  await defaultSfuManager.closeTransportsForConnection(cand3.connectionId);

  const oldProdLeaked = defaultSfuManager.producers.has(cand3.producerId);
  console.log(`Old producer before refresh released: ${!oldProdLeaked}`);
  if (oldProdLeaked) {
    throw new Error('Old producer from before refresh leaked in SFU!');
  }

  console.log('2. New page load: reconnecting and establishing new send transport...');
  const newConnId = `conn-cand-3-refreshed-${Date.now()}`;
  const newTransport = await defaultSfuManager.createTransport(
    sessionId,
    newConnId,
    cand3.userId,
    'send'
  );
  const newProdResult = await defaultSfuManager.produce(
    sessionId,
    newTransport.id,
    'video',
    {
      ...MOCK_VIDEO_RTP_PARAMETERS,
      encodings: [{ ssrc: 30000000 }]
    },
    { trackType: 'webcam' },
    newConnId,
    cand3.userId
  );
  console.log(`New producer after refresh created: ${newProdResult.id}`);

  // Verify only 1 producer for Candidate 3 exists in total
  let cand3TotalProducers = 0;
  for (const p of defaultSfuManager.producers.values()) {
    if (p.sessionId === sessionId && p.userId === cand3.userId) {
      cand3TotalProducers++;
    }
  }
  console.log(`Total active producers for Candidate 3 in SFU: ${cand3TotalProducers} (Expected: 1)`);
  if (cand3TotalProducers !== 1) {
    throw new Error('Multiple or orphaned producers detected for Candidate 3 after page refresh!');
  }

  // Cleanup remaining
  await defaultSfuManager.closeTransportsForConnection(newConnId);
  await defaultSfuManager.closeTransportsForConnection(invigConnId);

  console.log('\n>>> FLOW 5 RESULT: 100% PASS - 3 concurrent candidate video sessions verified, producer release validated across tab close, normal submit, and page refresh <<<');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFlow 5 Error:', err);
  process.exit(1);
});
