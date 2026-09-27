/**
 * @file sfu-webrtc-load-harness.js
 * @description Real-time SFU media-plane and WebRTC signaling load test harness for ProctorNet.
 * Simulates N concurrent candidate publishers and M invigilator subscribers using live
 * WebSocket signaling and mediasoup C++ worker transports.
 *
 * Usage:
 *   node scripts/load/sfu-webrtc-load-harness.js [--candidates=12] [--invigilators=1] [--duration=15] [--cleanup=true]
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(new URL('../../backend/package.json', import.meta.url));

const pg = require('pg');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Load environment variables from backend/.env first, then root .env
const backendEnvPath = path.resolve(__dirname, '../../backend/.env');
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else {
  dotenv.config();
}

// 1. Parse CLI arguments
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split('=')[1] : defaultValue;
}

const candidateCount = parseInt(getArg('candidates', '12'), 10);
const invigilatorCount = parseInt(getArg('invigilators', '1'), 10);
const durationSec = parseInt(getArg('duration', '15'), 10);
const rampIntervalMs = parseInt(getArg('ramp-ms', '60'), 10);
const autoCleanup = getArg('cleanup', 'true') !== 'false';
const httpBaseUrl = getArg('host', `http://localhost:${process.env.PORT || '3000'}`);
const wsBaseUrl = getArg('ws-host', `ws://localhost:${process.env.PORT || '3000'}/ws`);
const batchSize = parseInt(getArg('batch-size', '12'), 10);

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'proctornet-dev-jwt-access-secret-32-chars-long';

// 2. Database client setup
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  database: process.env.DB_NAME || 'proctornet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 10
};

const pool = new pg.Pool(dbConfig);

// Helper for calculating percentiles
function calculateStats(values) {
  if (!values || values.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sum / sorted.length;
  const p = (pct) => {
    const idx = Math.min(Math.floor((pct / 100) * sorted.length), sorted.length - 1);
    return sorted[idx];
  };
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Number(avg.toFixed(2)),
    p50: Number(p(50).toFixed(2)),
    p90: Number(p(90).toFixed(2)),
    p95: Number(p(95).toFixed(2)),
    p99: Number(p(99).toFixed(2))
  };
}

// Helper to fetch prometheus metrics from backend
async function fetchPrometheusMetrics() {
  try {
    const res = await fetch(`${httpBaseUrl}/metrics`);
    if (!res.ok) return null;
    const text = await res.text();
    const metrics = {};
    for (const line of text.split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue;
      const parts = line.split(' ');
      if (parts.length >= 2) {
        metrics[parts[0]] = parseFloat(parts[1]);
      }
    }
    return metrics;
  } catch {
    return null;
  }
}

// Client wrapper for tracking media signaling interactions
class SimulatedWebRTCClient {
  constructor(userId, email, roles, options = {}) {
    this.userId = userId;
    this.email = email;
    this.roles = roles;
    this.sessionId = options.sessionId;
    this.attemptId = options.attemptId;
    this.direction = options.direction || 'send';
    this.ws = null;
    this.token = null;
    this.heartbeatTimer = null;
    this.latencies = {};
    this.errors = [];
    this.pendingRequests = new Map();
    this.activeTransportId = null;
    this.activeProducerId = null;
    this.activeConsumerIds = [];
    this.connected = false;
  }

  generateToken() {
    this.token = jwt.sign(
      {
        userId: this.userId,
        email: this.email,
        roles: this.roles,
        tokenType: 'access'
      },
      JWT_ACCESS_SECRET,
      { expiresIn: '1h', issuer: 'proctornet-auth', subject: this.userId }
    );
    return this.token;
  }

  async connect(clientIp = null) {
    this.generateToken();
    const t0 = performance.now();
    const headers = {};
    if (clientIp) {
      headers['X-Forwarded-For'] = clientIp;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${wsBaseUrl}?token=${this.token}`, { headers });
      } catch (err) {
        this.errors.push(`Connect exception: ${err.message}`);
        return reject(err);
      }

      const timeout = setTimeout(() => {
        if (!this.connected) {
          try { this.ws.terminate(); } catch {}
          reject(new Error('WebSocket handshake timeout (5000ms)'));
        }
      }, 5000);

      this.ws.on('open', () => {
        this.latencies.wsConnect = performance.now() - t0;
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleMessage(msg);
          if (msg.type === 'connection:established') {
            this.connected = true;
            clearTimeout(timeout);
            this._startHeartbeat();
            resolve();
          }
        } catch (err) {
          this.errors.push(`JSON parse error: ${err.message}`);
        }
      });

      this.ws.on('error', (err) => {
        this.errors.push(`WS error: ${err.message}`);
        if (!this.connected) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.ws.on('close', (code, reason) => {
        this.connected = false;
        clearInterval(this.heartbeatTimer);
      });
    });
  }

  _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'heartbeat',
          payload: { attemptId: this.attemptId }
        }));
      }
    }, 5000);
  }

  _handleMessage(msg) {
    if (msg.type === 'error') {
      this.errors.push(`Server error [${msg.payload?.code}]: ${msg.payload?.message}`);
    }

    // Resolve any matching pending request callback
    const req = this.pendingRequests.get(msg.type);
    if (req) {
      this.pendingRequests.delete(msg.type);
      req.resolve(msg.payload);
    }
  }

  request(commandType, expectedResponseType, payload = {}, timeoutMs = 5000) {
    const t0 = performance.now();
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not connected'));
      }

      const timer = setTimeout(() => {
        this.pendingRequests.delete(expectedResponseType);
        reject(new Error(`Timeout waiting for ${expectedResponseType} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(expectedResponseType, {
        resolve: (data) => {
          clearTimeout(timer);
          const rtt = performance.now() - t0;
          this.latencies[commandType] = rtt;
          resolve({ data, rtt });
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });

      this.ws.send(JSON.stringify({
        type: commandType,
        payload
      }));
    });
  }

  async close() {
    clearInterval(this.heartbeatTimer);
    if (this.ws) {
      try {
        this.ws.close(1000, 'Test completed');
      } catch {}
    }
  }
}

async function run() {
  const runId = `sfu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  console.log(`\n================================================================================`);
  console.log(`ProctorNet SFU / WebRTC Media Plane Real Concurrency Load Test`);
  console.log(`Run ID: ${runId}`);
  console.log(`Target: ${candidateCount} Candidates publishing, ${invigilatorCount} Invigilator(s) consuming`);
  console.log(`Duration: ${durationSec}s steady-state, Ramp: ${rampIntervalMs}ms per candidate`);
  console.log(`Host: ${httpBaseUrl} | WebSocket: ${wsBaseUrl}`);
  console.log(`================================================================================\n`);

  const initialMetrics = await fetchPrometheusMetrics();
  const dbClient = await pool.connect();

  let benchmarkSessionId = null;
  const candidateUsers = [];
  const invigilatorUsers = [];
  const testResults = {
    runId,
    timestamp: new Date().toISOString(),
    config: {
      candidates: candidateCount,
      invigilators: invigilatorCount,
      durationSec,
      rampIntervalMs,
      batchSize
    },
    timings: {
      wsConnect: [],
      getRouterCaps: [],
      createSendTransport: [],
      connectSendTransport: [],
      produceVideo: [],
      createRecvTransport: [],
      connectRecvTransport: [],
      consumeBatch: []
    },
    streamMetrics: {
      totalCandidatesAttempted: candidateCount,
      candidatesPublished: 0,
      invigilatorsSubscribed: 0,
      totalConsumersCreated: 0,
      consumerFailures: 0
    },
    serverTelemetry: {}
  };

  const candidateClients = [];
  const invigilatorClients = [];

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Seed Isolated Fixtures for this SFU Test Run
    // -------------------------------------------------------------------------
    console.log(`[Phase 1] Seeding database fixtures (1 session, ${candidateCount} active candidate attempts, ${invigilatorCount} invigilators)...`);
    await dbClient.query('BEGIN');

    // Create Room & Exam
    const roomRes = await dbClient.query(
      `INSERT INTO rooms (name, capacity, building)
       VALUES ($1, 500, 'Cloud Media SFU Lab')
       RETURNING room_id;`,
      [`Room-${runId}`]
    );
    const roomId = roomRes.rows[0].room_id;

    const subRes = await dbClient.query(
      `INSERT INTO subjects (code, name)
       VALUES ($1, 'WebRTC Systems Engineering')
       RETURNING subject_id;`,
      [`SFU-${runId}`]
    );
    const subjectId = subRes.rows[0].subject_id;

    // Faculty user for exam creation
    const facultyRes = await dbClient.query(
      `INSERT INTO users (name, email, password_hash, status)
       VALUES ($1, $2, 'hash_placeholder', 'ACTIVE')
       RETURNING user_id;`,
      [`Faculty ${runId}`, `bench_faculty_${runId}@example.com`]
    );
    const facultyId = facultyRes.rows[0].user_id;
    await dbClient.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY');`, [facultyId]);

    const examRes = await dbClient.query(
      `INSERT INTO exams (title, description, duration_minutes, total_marks, passing_marks, status, created_by, subject_id)
       VALUES ($1, 'SFU Media Plane Concurrency Verification', 60, 100, 40, 'PUBLISHED', $2, $3)
       RETURNING exam_id;`,
      [`Benchmark SFU Exam ${runId}`, facultyId, subjectId]
    );
    const examId = examRes.rows[0].exam_id;

    // Active Exam Session
    const sessionRes = await dbClient.query(
      `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
       VALUES ($1, $2, NOW() - INTERVAL '10 minutes', NOW() + INTERVAL '2 hours', 'ACTIVE')
       RETURNING session_id;`,
      [examId, roomId]
    );
    benchmarkSessionId = sessionRes.rows[0].session_id;

    // Candidates & Attempts
    for (let i = 1; i <= candidateCount; i++) {
      const pad = String(i).padStart(4, '0');
      const candUser = await dbClient.query(
        `INSERT INTO users (name, email, password_hash, status)
         VALUES ($1, $2, 'bench_hash', 'ACTIVE')
         RETURNING user_id;`,
        [`Bench Candidate ${pad}`, `bench_sfu_cand_${runId}_${pad}@example.com`]
      );
      const studentId = candUser.rows[0].user_id;
      await dbClient.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT');`, [studentId]);
      await dbClient.query(`INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, 'ASSIGNED');`, [benchmarkSessionId, studentId]);

      const attRes = await dbClient.query(
        `INSERT INTO exam_attempts (session_id, student_id, status, started_at, expires_at)
         VALUES ($1, $2, 'ACTIVE', NOW(), NOW() + INTERVAL '2 hours')
         RETURNING attempt_id;`,
        [benchmarkSessionId, studentId]
      );

      candidateUsers.push({
        index: i,
        userId: studentId,
        email: `bench_sfu_cand_${runId}_${pad}@example.com`,
        attemptId: attRes.rows[0].attempt_id
      });
    }

    // Invigilators
    for (let j = 1; j <= invigilatorCount; j++) {
      const invigUser = await dbClient.query(
        `INSERT INTO users (name, email, password_hash, status)
         VALUES ($1, $2, 'bench_hash', 'ACTIVE')
         RETURNING user_id;`,
        [`Bench Invigilator ${j}`, `bench_sfu_invig_${runId}_${j}@example.com`]
      );
      const invigId = invigUser.rows[0].user_id;
      await dbClient.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR');`, [invigId]);
      await dbClient.query(
        `INSERT INTO session_invigilators (session_id, user_id) VALUES ($1, $2);`,
        [benchmarkSessionId, invigId]
      );

      invigilatorUsers.push({
        index: j,
        userId: invigId,
        email: `bench_sfu_invig_${runId}_${j}@example.com`
      });
    }

    await dbClient.query('COMMIT');
    console.log(`[Phase 1] DB fixtures committed. Session ID: ${benchmarkSessionId}`);

    // -------------------------------------------------------------------------
    // Phase 2: Staged Candidate Media Publishing (N Streams)
    // -------------------------------------------------------------------------
    console.log(`\n[Phase 2] Launching ${candidateCount} simulated candidate publisher streams...`);
    const activeProducers = [];
    let routerCapabilities = null;

    for (const cand of candidateUsers) {
      const client = new SimulatedWebRTCClient(cand.userId, cand.email, ['STUDENT'], {
        sessionId: benchmarkSessionId,
        attemptId: cand.attemptId,
        direction: 'send'
      });
      candidateClients.push(client);

      try {
        const clientIp = `10.200.${Math.floor(cand.index / 250)}.${(cand.index % 250) + 1}`;
        await client.connect(clientIp);
        testResults.timings.wsConnect.push(client.latencies.wsConnect);

        // 1. Get router capabilities (only needed once, but each client requests in real flow)
        const capsRes = await client.request('media:get_router_capabilities', 'media:router_capabilities', {
          sessionId: benchmarkSessionId
        });
        testResults.timings.getRouterCaps.push(capsRes.rtt);
        if (!routerCapabilities) {
          routerCapabilities = capsRes.data.rtpCapabilities;
          testResults.serverTelemetry.workerId = capsRes.data.workerId;
          testResults.serverTelemetry.workerGeneration = capsRes.data.workerGeneration;
        }

        // 2. Create send transport
        const transportRes = await client.request('media:create_transport', 'media:transport_created', {
          sessionId: benchmarkSessionId,
          direction: 'send'
        });
        testResults.timings.createSendTransport.push(transportRes.rtt);
        const transportId = transportRes.data.id;
        client.activeTransportId = transportId;

        // 3. Connect send transport
        const connectRes = await client.request('media:connect_transport', 'media:transport_connected', {
          transportId,
          dtlsParameters: {
            role: 'client',
            fingerprints: [
              {
                algorithm: 'sha-256',
                value: '2F:A5:11:0A:55:E2:0E:7B:3F:8A:20:77:5B:3D:23:99:DA:CC:A1:6A:B1:D3:8C:38:39:F5:56:B2:D1:E2:05:14'
              }
            ]
          }
        });
        testResults.timings.connectSendTransport.push(connectRes.rtt);

        // 4. Produce video track
        const vp8Codec = routerCapabilities.codecs.find((c) => c.mimeType.toLowerCase() === 'video/vp8');
        const ssrc = 10000000 + cand.index * 10;

        const produceRes = await client.request('media:produce', 'media:produced', {
          transportId,
          kind: 'video',
          rtpParameters: {
            mid: '0',
            codecs: [
              {
                mimeType: vp8Codec.mimeType,
                payloadType: vp8Codec.preferredPayloadType,
                clockRate: vp8Codec.clockRate,
                parameters: vp8Codec.parameters || {},
                rtcpFeedback: vp8Codec.rtcpFeedback || []
              }
            ],
            headerExtensions: [],
            encodings: [
              { ssrc }
            ],
            rtcp: {
              cname: `cname-cand-${cand.index}`,
              reducedSize: true
            }
          },
          appData: { trackType: 'webcam' }
        });
        testResults.timings.produceVideo.push(produceRes.rtt);
        client.activeProducerId = produceRes.data.id;
        activeProducers.push(produceRes.data.id);
        testResults.streamMetrics.candidatesPublished++;

        process.stdout.write(`  [Candidate ${cand.index}/${candidateCount}] Stream established in ${produceRes.rtt.toFixed(1)}ms (Producer ID: ${produceRes.data.id.slice(0, 8)}...)\r`);
      } catch (err) {
        console.error(`\n  [Candidate ${cand.index}] FAILED: ${err.message}`);
      }

      if (rampIntervalMs > 0 && cand.index < candidateCount) {
        await new Promise((r) => setTimeout(r, rampIntervalMs));
      }
    }

    console.log(`\n[Phase 2] Completed. ${testResults.streamMetrics.candidatesPublished}/${candidateCount} candidate video streams publishing.`);

    // -------------------------------------------------------------------------
    // Phase 3: Invigilator Subscription via Batch Consume
    // -------------------------------------------------------------------------
    console.log(`\n[Phase 3] Launching ${invigilatorCount} invigilator consumer(s) monitoring session grid...`);

    for (const invig of invigilatorUsers) {
      const client = new SimulatedWebRTCClient(invig.userId, invig.email, ['INVIGILATOR'], {
        sessionId: benchmarkSessionId,
        direction: 'recv'
      });
      invigilatorClients.push(client);

      try {
        const clientIp = `10.250.0.${invig.index}`;
        await client.connect(clientIp);

        // 1. Create recv transport
        const recvTransportRes = await client.request('media:create_transport', 'media:transport_created', {
          sessionId: benchmarkSessionId,
          direction: 'recv'
        });
        testResults.timings.createRecvTransport.push(recvTransportRes.rtt);
        const recvTransportId = recvTransportRes.data.id;
        client.activeTransportId = recvTransportId;

        // 2. Connect recv transport
        const connectRecvRes = await client.request('media:connect_transport', 'media:transport_connected', {
          transportId: recvTransportId,
          dtlsParameters: {
            role: 'client',
            fingerprints: [
              {
                algorithm: 'sha-256',
                value: '2F:A5:11:0A:55:E2:0E:7B:3F:8A:20:77:5B:3D:23:99:DA:CC:A1:6A:B1:D3:8C:38:39:F5:56:B2:D1:E2:05:14'
              }
            ]
          }
        });
        testResults.timings.connectRecvTransport.push(connectRecvRes.rtt);

        // 3. Batch consume producers in chunks of batchSize (up to 12 or 36)
        for (let b = 0; b < activeProducers.length; b += batchSize) {
          const chunk = activeProducers.slice(b, b + batchSize);
          const batchRes = await client.request('media:consume_batch', 'media:consumed_batch', {
            transportId: recvTransportId,
            rtpCapabilities: routerCapabilities,
            producerIds: chunk
          });
          testResults.timings.consumeBatch.push(batchRes.rtt);

          const fulfilled = batchRes.data.results.filter((r) => r.status === 'fulfilled');
          const rejected = batchRes.data.results.filter((r) => r.status === 'rejected');

          testResults.streamMetrics.totalConsumersCreated += fulfilled.length;
          testResults.streamMetrics.consumerFailures += rejected.length;
          client.activeConsumerIds.push(...fulfilled.map((f) => f.consumerId));

          console.log(`  [Invigilator ${invig.index}] Batch consume chunk (${chunk.length} streams) -> ${fulfilled.length} fulfilled, ${rejected.length} rejected in ${batchRes.rtt.toFixed(1)}ms`);
        }

        testResults.streamMetrics.invigilatorsSubscribed++;
      } catch (err) {
        console.error(`  [Invigilator ${invig.index}] FAILED: ${err.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // Phase 4: Steady-State Holding & Server Telemetry Sampling
    // -------------------------------------------------------------------------
    console.log(`\n[Phase 4] Holding ${testResults.streamMetrics.candidatesPublished} publishers + ${testResults.streamMetrics.totalConsumersCreated} active consumers for ${durationSec}s steady-state...`);
    const peakMetrics = await fetchPrometheusMetrics();

    const tStart = Date.now();
    let sampleCount = 0;
    const cpuSamples = [];

    while (Date.now() - tStart < durationSec * 1000) {
      await new Promise((r) => setTimeout(r, 2000));
      sampleCount++;
      const load = os.loadavg();
      cpuSamples.push(load[0]);
      process.stdout.write(`  [Steady State] Elapsed: ${Math.round((Date.now() - tStart) / 1000)}s / ${durationSec}s (System 1m Load: ${load[0].toFixed(2)})\r`);
    }
    console.log(`\n[Phase 4] Steady-state holding complete.`);

    // Capture telemetry snapshot
    testResults.serverTelemetry.initial = initialMetrics;
    testResults.serverTelemetry.peak = peakMetrics;
    testResults.serverTelemetry.final = await fetchPrometheusMetrics();
    testResults.serverTelemetry.avgSystemLoad = cpuSamples.length > 0 ? Number((cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length).toFixed(2)) : 0;

  } catch (err) {
    console.error('FATAL during load test execution:', err);
    testResults.error = err.message;
  } finally {
    // -------------------------------------------------------------------------
    // Phase 5: Clean Teardown & Graceful Socket Closing
    // -------------------------------------------------------------------------
    console.log(`\n[Phase 5] Tearing down WebRTC connections and cleaning up test fixtures...`);

    for (const c of candidateClients) {
      await c.close();
    }
    for (const i of invigilatorClients) {
      await i.close();
    }

    if (autoCleanup && benchmarkSessionId) {
      try {
        await dbClient.query('BEGIN');
        await dbClient.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable;');
        await dbClient.query(`DELETE FROM audit_logs WHERE resource_id = $1::text OR actor_user_id IN (SELECT user_id FROM users WHERE email LIKE $2);`, [benchmarkSessionId, `bench_%${runId}%`]);
        await dbClient.query(`DELETE FROM session_students WHERE session_id = $1;`, [benchmarkSessionId]);
        await dbClient.query(`DELETE FROM session_invigilators WHERE session_id = $1;`, [benchmarkSessionId]);
        await dbClient.query(`DELETE FROM exam_attempts WHERE session_id = $1;`, [benchmarkSessionId]);
        await dbClient.query(`DELETE FROM exam_sessions WHERE session_id = $1;`, [benchmarkSessionId]);
        await dbClient.query(`DELETE FROM exams WHERE title = $1;`, [`Benchmark SFU Exam ${runId}`]);
        await dbClient.query(`DELETE FROM user_roles WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE $1);`, [`bench_%${runId}%`]);
        await dbClient.query(`DELETE FROM users WHERE email LIKE $1;`, [`bench_%${runId}%`]);
        await dbClient.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable;');
        await dbClient.query('COMMIT');
        console.log(`[Phase 5] Benchmark database records purged successfully.`);
      } catch (cleanupErr) {
        await dbClient.query('ROLLBACK');
        console.warn(`[Phase 5] Warning during DB cleanup: ${cleanupErr.message}`);
      }
    }

    dbClient.release();
    await pool.end();
  }

  // ---------------------------------------------------------------------------
  // Phase 6: Statistical Synthesis & Report Generation
  // ---------------------------------------------------------------------------
  const stats = {
    wsConnect: calculateStats(testResults.timings.wsConnect),
    getRouterCaps: calculateStats(testResults.timings.getRouterCaps),
    createSendTransport: calculateStats(testResults.timings.createSendTransport),
    connectSendTransport: calculateStats(testResults.timings.connectSendTransport),
    produceVideo: calculateStats(testResults.timings.produceVideo),
    createRecvTransport: calculateStats(testResults.timings.createRecvTransport),
    connectRecvTransport: calculateStats(testResults.timings.connectRecvTransport),
    consumeBatch: calculateStats(testResults.timings.consumeBatch)
  };

  testResults.summaryStats = stats;

  const resultDir = path.resolve(__dirname, 'results');
  if (!fs.existsSync(resultDir)) {
    fs.mkdirSync(resultDir, { recursive: true });
  }
  const resultFilePath = path.join(resultDir, `sfu-load-test-${runId}.json`);
  fs.writeFileSync(resultFilePath, JSON.stringify(testResults, null, 2), 'utf8');

  // Print Formatted Report Table
  console.log(`\n================================================================================`);
  console.log(`PROCTORNET SFU MEDIA PLANE LOAD TEST RESULTS`);
  console.log(`================================================================================`);
  console.log(`Session Worker ID:      ${testResults.serverTelemetry.workerId ?? 'N/A'}`);
  console.log(`Candidate Streams:      ${testResults.streamMetrics.candidatesPublished}/${testResults.streamMetrics.totalCandidatesAttempted} Established (${((testResults.streamMetrics.candidatesPublished / testResults.streamMetrics.totalCandidatesAttempted) * 100).toFixed(1)}%)`);
  console.log(`Invigilator Consumers:  ${testResults.streamMetrics.totalConsumersCreated} Active (${testResults.streamMetrics.consumerFailures} failed)`);
  console.log(`System 1m Load Avg:     ${testResults.serverTelemetry.avgSystemLoad}`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`Signaling Operation         Count   p50 (ms)   p90 (ms)   p95 (ms)   Max (ms)`);
  console.log(`--------------------------------------------------------------------------------`);
  const printRow = (label, s) => {
    console.log(
      `${label.padEnd(26)}  ` +
      `${String(s.count).padStart(5)}   ` +
      `${s.p50.toFixed(1).padStart(8)}   ` +
      `${s.p90.toFixed(1).padStart(8)}   ` +
      `${s.p95.toFixed(1).padStart(8)}   ` +
      `${s.max.toFixed(1).padStart(8)}`
    );
  };

  printRow('WebSocket Handshake', stats.wsConnect);
  printRow('Get Router Capabilities', stats.getRouterCaps);
  printRow('Create Send Transport', stats.createSendTransport);
  printRow('Connect Send Transport', stats.connectSendTransport);
  printRow('Produce Video Stream', stats.produceVideo);
  printRow('Create Recv Transport', stats.createRecvTransport);
  printRow('Connect Recv Transport', stats.connectRecvTransport);
  printRow('Batch Consume (Grid)', stats.consumeBatch);
  console.log(`================================================================================`);
  console.log(`Report JSON written to: ${resultFilePath}\n`);

  return testResults;
}

run().catch((err) => {
  console.error('Harness unhandled rejection:', err);
  process.exit(1);
});
