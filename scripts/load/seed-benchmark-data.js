/**
 * @file seed-benchmark-data.js
 * @description Deterministic benchmark fixture generator for ProctorNet Phase 21 load testing.
 * Seeds isolated benchmark entities directly into PostgreSQL without modifying schemas or migrations.
 *
 * Usage:
 *   node scripts/load/seed-benchmark-data.js [--count=25] [--prefix=bench_]
 */

import { randomUUID, createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(new URL('../../backend/package.json', import.meta.url));

const pg = require('pg');
const bcrypt = require('bcrypt');

// 1. Environment Safeguards
const NODE_ENV = process.env.NODE_ENV || 'development';
if (NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_BENCHMARK !== 'true') {
  console.error('FATAL: Running seed-benchmark-data in production environment is prohibited without ALLOW_PRODUCTION_BENCHMARK=true');
  process.exit(1);
}

// 2. Parse arguments
const args = process.argv.slice(2);
let candidateCount = 25;
let prefix = 'bench_';
let mode = 'prepared'; // 'prepared' (Mode A) or 'lifecycle' (Mode B)

for (const arg of args) {
  if (arg.startsWith('--count=')) {
    const val = parseInt(arg.split('=')[1], 10);
    if (!isNaN(val) && val > 0) candidateCount = val;
  } else if (arg.startsWith('--prefix=')) {
    prefix = arg.split('=')[1] || prefix;
  } else if (arg.startsWith('--mode=')) {
    const m = arg.split('=')[1].toLowerCase();
    if (m === 'prepared' || m === 'lifecycle') mode = m;
  }
}

// 3. Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'proctornet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 10
};

const pool = new pg.Pool(dbConfig);

// Benchmark password (configurable via env, never uses production credentials)
const BENCHMARK_PASSWORD = process.env.BENCHMARK_PASSWORD || 'BenchPass#123!';

async function run() {
  const client = await pool.connect();
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  console.log(`[Seed] Starting benchmark seed for ${candidateCount} candidates. Run ID: ${runId}`);

  try {
    await client.query('BEGIN');

    // Step A: Create Subject & Topic
    const subjectCode = `BENCH-CS-${runId}`;
    const subjectRes = await client.query(
      `INSERT INTO subjects (code, name, description)
       VALUES ($1, 'Benchmark Computer Science', 'Benchmark test subject')
       RETURNING subject_id;`,
      [subjectCode]
    );
    const subjectId = subjectRes.rows[0].subject_id;

    const topicRes = await client.query(
      `INSERT INTO topics (subject_id, name, description)
       VALUES ($1, 'Benchmark Topic', 'Benchmark test topic')
       RETURNING topic_id;`,
      [subjectId]
    );
    const topicId = topicRes.rows[0].topic_id;

    // Step B: Create 50 Questions (30 MCQ, 10 TRUE_FALSE, 10 NUMERIC)
    const questionDefinitions = [];
    for (let i = 1; i <= 50; i++) {
      let qType = 'MCQ';
      if (i > 40) qType = 'NUMERIC';
      else if (i > 30) qType = 'TRUE_FALSE';

      questionDefinitions.push({
        index: i,
        type: qType,
        prompt: `Benchmark Question ${i} [${qType}] - Performance verification query item.`,
        points: 2.00,
        numericVal: qType === 'NUMERIC' ? 42.0000 : null
      });
    }

    const createdQuestions = [];
    for (const q of questionDefinitions) {
      const qRes = await client.query(
        `INSERT INTO questions (topic_id, question_type, prompt_text, default_points, correct_numeric_value)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING question_id, question_type;`,
        [topicId, q.type, q.prompt, q.points, q.numericVal]
      );
      const questionId = qRes.rows[0].question_id;

      const options = [];
      if (q.type === 'MCQ') {
        const optRes = await client.query(
          `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
           VALUES
            ($1, 'Option A (Incorrect)', false, 0),
            ($1, 'Option B (Correct)', true, 1),
            ($1, 'Option C (Incorrect)', false, 2),
            ($1, 'Option D (Incorrect)', false, 3)
           RETURNING option_id, option_text, display_order;`,
          [questionId]
        );
        options.push(...optRes.rows);
      } else if (q.type === 'TRUE_FALSE') {
        const optRes = await client.query(
          `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
           VALUES
            ($1, 'True', true, 0),
            ($1, 'False', false, 1)
           RETURNING option_id, option_text, display_order;`,
          [questionId]
        );
        options.push(...optRes.rows);
      }

      createdQuestions.push({
        questionId,
        questionType: q.type,
        options
      });
    }
    console.log(`[Seed] Created 50 questions across MCQ, TRUE_FALSE, and NUMERIC types`);

    // Step C: Create Faculty & Exam
    const facultyPasswordHash = await bcrypt.hash(BENCHMARK_PASSWORD, 10);
    const facultyEmail = `${prefix}faculty_${runId}@example.com`;
    const facultyRes = await client.query(
      `INSERT INTO users (name, email, password_hash, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       RETURNING user_id;`,
      [`Benchmark Faculty ${runId}`, facultyEmail, facultyPasswordHash]
    );
    const facultyId = facultyRes.rows[0].user_id;

    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY');`,
      [facultyId]
    );

    const examRes = await client.query(
      `INSERT INTO exams (title, description, duration_minutes, total_marks, passing_marks, status, created_by, subject_id)
       VALUES ($1, 'Benchmark Examination for Load Testing', 120, 100.00, 40.00, 'PUBLISHED', $2, $3)
       RETURNING exam_id;`,
      [`Benchmark Exam ${runId}`, facultyId, subjectId]
    );
    const examId = examRes.rows[0].exam_id;

    await client.query(
      `INSERT INTO exam_topic_rules (exam_id, topic_id, question_count, points_per_question)
       VALUES ($1, $2, 50, 2.00);`,
      [examId, topicId]
    );

    // Step D: Create Room & Active Session
    const roomRes = await client.query(
      `INSERT INTO rooms (name, capacity, building)
       VALUES ($1, 10000, 'Benchmark Cloud')
       RETURNING room_id;`,
      [`Bench-Room-${runId}`]
    );
    const roomId = roomRes.rows[0].room_id;

    const startTime = new Date(Date.now() - 10 * 60 * 1000);
    const endTime = new Date(Date.now() + 4 * 60 * 60 * 1000);

    const sessionRes = await client.query(
      `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING session_id;`,
      [examId, roomId, startTime.toISOString(), endTime.toISOString()]
    );
    const sessionId = sessionRes.rows[0].session_id;

    // Step E: Create Candidates, Enrollments, Sessions, Attempts, and Attempt Questions
    console.log(`[Seed] Creating ${candidateCount} candidates and attempts...`);
    const studentPasswordHash = facultyPasswordHash; // reuse bcrypt hash for high speed
    const candidateFixtures = [];

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    for (let i = 1; i <= candidateCount; i++) {
      const paddedIndex = String(i).padStart(5, '0');
      const studentEmail = `${prefix}student_${runId}_${paddedIndex}@example.com`;
      const studentName = `Bench Candidate ${paddedIndex}`;

      const userRes = await client.query(
        `INSERT INTO users (name, email, password_hash, status)
         VALUES ($1, $2, $3, 'ACTIVE')
         RETURNING user_id;`,
        [studentName, studentEmail, studentPasswordHash]
      );
      const studentId = userRes.rows[0].user_id;

      await client.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT');`,
        [studentId]
      );

      await client.query(
        `INSERT INTO student_profiles (user_id, enrollment_number, department, semester)
         VALUES ($1, $2, 'Computer Science', 6);`,
        [studentId, `ENROLL-${runId}-${paddedIndex}`]
      );

      // Auth user session (for both Redis fast-path and PostgreSQL fallback)
      const authSessionId = randomUUID();
      const refreshTokenHash = randomUUID();
      await client.query(
        `INSERT INTO user_sessions (session_id, user_id, refresh_token_hash, is_revoked, expires_at)
         VALUES ($1, $2, $3, false, $4);`,
        [authSessionId, studentId, refreshTokenHash, endTime.toISOString()]
      );

      // Session student enrollment
      await client.query(
        `INSERT INTO session_students (session_id, student_id, status)
         VALUES ($1, $2, 'ASSIGNED');`,
        [sessionId, studentId]
      );

      let attemptId = null;
      let attemptQuestions = [];

      if (mode === 'prepared') {
        // Mode A: PREPARED ACTIVE-ATTEMPT BENCHMARK
        // Create Active Attempt for high-volume autosave & OCC testing
        const attemptRes = await client.query(
          `INSERT INTO exam_attempts (session_id, student_id, status, started_at, expires_at)
           VALUES ($1, $2, 'ACTIVE', $3, $4)
           RETURNING attempt_id, started_at;`,
          [sessionId, studentId, now.toISOString(), expiresAt.toISOString()]
        );
        attemptId = attemptRes.rows[0].attempt_id;

        // Create Attempt Questions (50 questions mapped with stable display_order in single batch insert)
        const aqPlaceholders = [];
        const aqParams = [attemptId];
        for (let d = 0; d < createdQuestions.length; d++) {
          aqParams.push(createdQuestions[d].questionId);
          aqPlaceholders.push(`($1, $${aqParams.length}, ${d + 1})`);
        }
        const aqRes = await client.query(
          `INSERT INTO attempt_questions (attempt_id, question_id, display_order)
           VALUES ${aqPlaceholders.join(', ')}
           RETURNING attempt_question_id, question_id, display_order;`,
          aqParams
        );
        for (const row of aqRes.rows) {
          const q = createdQuestions.find(cq => cq.questionId === row.question_id);
          attemptQuestions.push({
            attemptQuestionId: row.attempt_question_id,
            questionId: row.question_id,
            displayOrder: row.display_order,
            questionType: q.questionType,
            options: q.options
          });
        }
      }

      // SECRECY ENFORCEMENT: Never persist reusable JWTs or HMAC signing keys in fixture artifacts.
      // All authentication tokens and anti-tamper tokens are obtained at runtime via API endpoints.
      candidateFixtures.push({
        index: i,
        userId: studentId,
        email: studentEmail,
        attemptId,
        attemptQuestions
      });

      if (i % 250 === 0 || i === candidateCount) {
        console.log(`[Seed] Seeded ${i}/${candidateCount} candidates (${mode === 'prepared' ? 'Mode A: Prepared Attempts' : 'Mode B: Real Lifecycle'})...`);
      }
    }

    await client.query('COMMIT');
    console.log(`[Seed] Successfully committed all database transactions.`);

    // Step F: Write fixture JSON to scripts/load/fixtures/benchmark-fixtures.json (METADATA ONLY - ZERO SECRETS)
    const fixturePayload = {
      runId,
      benchmarkMode: mode === 'prepared' ? 'PREPARED_ACTIVE_ATTEMPTS' : 'REAL_LIFECYCLE',
      createdAt: new Date().toISOString(),
      candidateCount,
      examId,
      sessionId,
      subjectId,
      topicId,
      roomId,
      candidates: candidateFixtures
    };

    const fixtureDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    const fixturePath = path.join(fixtureDir, 'benchmark-fixtures.json');
    fs.writeFileSync(fixturePath, JSON.stringify(fixturePayload, null, 2), 'utf8');
    console.log(`[Seed] Fixtures written successfully to: ${fixturePath}`);
    console.log(`[Seed] Candidate Count: ${candidateCount}, Mode: ${mode}, Exam ID: ${examId}, Session ID: ${sessionId}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed] Error seeding benchmark data. Rolled back.', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
