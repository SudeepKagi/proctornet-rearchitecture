/**
 * @file fixtures.js
 * @description Isolated deterministic test fixture management for ProctorNet Phase 22 Chaos Testing.
 * Generates and tears down isolated CHAOS_* prefixed records with strict boundaries protecting production data.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(new URL('../../backend/package.json', import.meta.url));

const pg = require('pg');
const bcrypt = require('bcrypt');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'proctornet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 5
};

const BCRYPT_SALT_ROUNDS = 4; // Fast rounds for transient test fixtures
const FIXTURE_PREFIX = 'chaos_';

export function getDbPool() {
  return new pg.Pool(dbConfig);
}

/**
 * Seeds isolated chaos test fixtures (instructor, candidates, subject, topic, questions, exam, session, attempts).
 * Concurrency is strictly bounded (max 10 candidates) per Phase 22 safety guidelines.
 *
 * @param {object} [options]
 * @param {number} [options.candidateCount=5] - Number of candidate attempts to seed (capped at 10)
 * @param {string} [options.prefix='chaos_'] - Prefix for emails, titles, and IDs
 * @param {pg.Pool} [options.pool] - Optional existing pg pool
 * @returns {Promise<object>} Fixture metadata
 */
export async function seedChaosFixtures(options = {}) {
  const candidateCount = Math.min(Math.max(options.candidateCount || 5, 1), 10);
  const prefix = options.prefix || FIXTURE_PREFIX;
  const pool = options.pool || getDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const hashedPassword = await bcrypt.hash('ChaosPassword123!', BCRYPT_SALT_ROUNDS);

    // 1. Create Instructor User and Role
    const instructorId = randomUUID();
    const instructorEmail = `${prefix}instructor_${Date.now()}@proctornet.test`;
    await client.query(
      `INSERT INTO users (user_id, name, email, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW());`,
      [instructorId, 'Chaos Test Instructor', instructorEmail, hashedPassword]
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role, created_at)
       VALUES ($1, 'FACULTY', NOW());`,
      [instructorId]
    );
    const instructor = { user_id: instructorId, email: instructorEmail };

    // 2. Create Students and Roles
    const students = [];
    for (let i = 1; i <= candidateCount; i++) {
      const studentId = randomUUID();
      const studentEmail = `${prefix}student_${i}_${Date.now()}@proctornet.test`;
      await client.query(
        `INSERT INTO users (user_id, name, email, password_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW());`,
        [studentId, `Chaos Student ${i}`, studentEmail, hashedPassword]
      );
      await client.query(
        `INSERT INTO user_roles (user_id, role, created_at)
         VALUES ($1, 'STUDENT', NOW());`,
        [studentId]
      );
      students.push({ user_id: studentId, email: studentEmail });
    }

    // 3. Create Subject & Topic
    const subjectId = randomUUID();
    const subjectCode = `CHS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const subjectName = `${prefix.toUpperCase()}SUBJECT_${Date.now()}`;
    await client.query(
      `INSERT INTO subjects (subject_id, code, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, 'Chaos Resilience Test Subject', NOW(), NOW());`,
      [subjectId, subjectCode, subjectName]
    );

    const topicId = randomUUID();
    const topicName = `${prefix.toUpperCase()}TOPIC_${Date.now()}`;
    await client.query(
      `INSERT INTO topics (topic_id, subject_id, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, 'Chaos Resilience Test Topic', NOW(), NOW());`,
      [topicId, subjectId, topicName]
    );

    // 4. Create Questions (MCQ, TRUE_FALSE, NUMERIC) & Options
    const questions = [
      {
        id: randomUUID(),
        type: 'MCQ',
        text: 'What is the primary authoritative datastore in ProctorNet?',
        options: [
          { text: 'PostgreSQL', is_correct: true },
          { text: 'Redis', is_correct: false },
          { text: 'RabbitMQ', is_correct: false },
          { text: 'LocalStack', is_correct: false }
        ],
        points: 2.0
      },
      {
        id: randomUUID(),
        type: 'TRUE_FALSE',
        text: 'Redis failure causes exam answers to be lost.',
        options: [
          { text: 'True', is_correct: false },
          { text: 'False', is_correct: true }
        ],
        points: 1.0
      },
      {
        id: randomUUID(),
        type: 'NUMERIC',
        text: 'What is 10 + 15?',
        numericValue: 25.0,
        points: 2.0
      }
    ];

    for (const q of questions) {
      await client.query(
        `INSERT INTO questions (question_id, topic_id, question_type, prompt_text, default_points, correct_numeric_value, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW());`,
        [q.id, topicId, q.type, q.text, q.points, q.numericValue || null]
      );

      if (q.options) {
        for (let oIdx = 0; oIdx < q.options.length; oIdx++) {
          const opt = q.options[oIdx];
          await client.query(
            `INSERT INTO question_options (option_id, question_id, option_text, is_correct, display_order, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW());`,
            [randomUUID(), q.id, opt.text, opt.is_correct, oIdx + 1]
          );
        }
      }
    }

    // 5. Create Exam & Rules
    const examId = randomUUID();
    const examTitle = `${prefix.toUpperCase()}EXAM_${Date.now()}`;
    await client.query(
      `INSERT INTO exams (exam_id, title, description, subject_id, duration_minutes, total_marks, passing_marks, created_by, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 60, 5.0, 2.0, $5, 'PUBLISHED', NOW(), NOW());`,
      [examId, examTitle, 'Automated Chaos Resilience Test Exam', subjectId, instructor.user_id]
    );

    await client.query(
      `INSERT INTO exam_topic_rules (rule_id, exam_id, topic_id, question_count, points_per_question, created_at)
       VALUES ($1, $2, $3, 3, 1.0, NOW());`,
      [randomUUID(), examId, topicId]
    );

    // 6. Create Session
    const sessionId = randomUUID();
    await client.query(
      `INSERT INTO exam_sessions (session_id, exam_id, scheduled_start_time, scheduled_end_time, status, created_at, updated_at)
       VALUES ($1, $2, NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '55 minutes', 'ACTIVE', NOW(), NOW());`,
      [sessionId, examId]
    );

    // 7. Assign Candidates & Create Attempts
    const attempts = [];
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      // Session student mapping
      await client.query(
        `INSERT INTO session_students (session_id, student_id, status, created_at)
         VALUES ($1, $2, 'PRESENT', NOW())
         ON CONFLICT (session_id, student_id) DO NOTHING;`,
        [sessionId, student.user_id]
      );

      // Attempt creation
      const attemptId = randomUUID();
      await client.query(
        `INSERT INTO exam_attempts (attempt_id, session_id, student_id, started_at, expires_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '50 minutes', 'ACTIVE', NOW(), NOW());`,
        [attemptId, sessionId, student.user_id]
      );

      // Map Attempt Questions
      const attemptQuestions = [];
      for (let order = 0; order < questions.length; order++) {
        const q = questions[order];
        const aqId = randomUUID();
        await client.query(
          `INSERT INTO attempt_questions (attempt_question_id, attempt_id, question_id, display_order, created_at)
           VALUES ($1, $2, $3, $4, NOW());`,
          [aqId, attemptId, q.id, order + 1]
        );
        attemptQuestions.push({ attemptQuestionId: aqId, questionId: q.id, order: order + 1 });
      }

      attempts.push({
        attemptId,
        studentId: student.user_id,
        email: student.email,
        attemptQuestions
      });
    }

    await client.query('COMMIT');

    return {
      instructor,
      subjectId,
      topicId,
      examId,
      examTitle,
      sessionId,
      questions,
      students,
      attempts
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    if (!options.pool) await pool.end();
  }
}

/**
 * Deterministically tears down all CHAOS_* test fixtures.
 * Strictly limited to records with the designated test prefix.
 *
 * @param {object} [options]
 * @param {string} [options.prefix='chaos_']
 * @param {pg.Pool} [options.pool]
 */
export async function teardownChaosFixtures(options = {}) {
  const prefix = options.prefix || FIXTURE_PREFIX;
  const pool = options.pool || getDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Identify chaos user IDs
    const usersRes = await client.query(
      `SELECT user_id FROM users WHERE email LIKE $1;`,
      [`${prefix}%@proctornet.test`]
    );
    const userIds = usersRes.rows.map((r) => r.user_id);

    // 2. Identify chaos exams
    const examsRes = await client.query(
      `SELECT exam_id FROM exams WHERE title LIKE $1;`,
      [`${prefix.toUpperCase()}%`]
    );
    const examIds = examsRes.rows.map((r) => r.exam_id);

    if (userIds.length > 0 || examIds.length > 0) {
      // Find all related sessions
      const sessRes = await client.query(
        `SELECT session_id FROM exam_sessions WHERE exam_id = ANY($1::uuid[]);`,
        [examIds]
      );
      const sessionIds = sessRes.rows.map((r) => r.session_id);

      // Find all related attempts
      const attemptsRes = await client.query(
        `SELECT attempt_id FROM exam_attempts WHERE student_id = ANY($1::uuid[]) OR session_id = ANY($2::uuid[]);`,
        [userIds, sessionIds]
      );
      const attemptIds = attemptsRes.rows.map((r) => r.attempt_id);

      if (attemptIds.length > 0) {
        // Delete results
        await client.query(`DELETE FROM results WHERE attempt_id = ANY($1::uuid[]);`, [attemptIds]);

        // Delete submission idempotency records
        await client.query(`DELETE FROM submission_idempotency WHERE attempt_id = ANY($1::uuid[]);`, [attemptIds]);

        // Delete outbox events
        await client.query(
          `DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[]) OR aggregate_type = 'CHAOS_TEST';`,
          [attemptIds]
        );

        // Delete violation events and flags
        await client.query(`DELETE FROM violation_events WHERE attempt_id = ANY($1::uuid[]);`, [attemptIds]);
        await client.query(`DELETE FROM violation_flags WHERE attempt_id = ANY($1::uuid[]);`, [attemptIds]);

        // Delete answers
        await client.query(
          `DELETE FROM answers WHERE attempt_question_id IN (
             SELECT attempt_question_id FROM attempt_questions WHERE attempt_id = ANY($1::uuid[])
           );`,
          [attemptIds]
        );

        // Delete attempt questions
        await client.query(`DELETE FROM attempt_questions WHERE attempt_id = ANY($1::uuid[]);`, [attemptIds]);

        // Delete attempts
        await client.query(`DELETE FROM exam_attempts WHERE attempt_id = ANY($1::uuid[]);`, [attemptIds]);
      }

      // Delete session students
      if (sessionIds.length > 0 || userIds.length > 0) {
        await client.query(
          `DELETE FROM session_students WHERE student_id = ANY($1::uuid[]) OR session_id = ANY($2::uuid[]);`,
          [userIds, sessionIds]
        );
      }

      // Delete sessions
      if (sessionIds.length > 0) {
        await client.query(`DELETE FROM exam_sessions WHERE session_id = ANY($1::uuid[]);`, [sessionIds]);
      }

      // Delete exam topic rules
      if (examIds.length > 0) {
        await client.query(`DELETE FROM exam_topic_rules WHERE exam_id = ANY($1::uuid[]);`, [examIds]);
      }

      // Delete exams
      if (examIds.length > 0) {
        await client.query(`DELETE FROM exams WHERE exam_id = ANY($1::uuid[]);`, [examIds]);
      }

      // Delete topics & subjects with prefix
      const topicsRes = await client.query(`SELECT topic_id FROM topics WHERE name LIKE $1;`, [`${prefix.toUpperCase()}%`]);
      const topicIds = topicsRes.rows.map((r) => r.topic_id);
      if (topicIds.length > 0) {
        await client.query(
          `DELETE FROM question_options WHERE question_id IN (SELECT question_id FROM questions WHERE topic_id = ANY($1::uuid[]));`,
          [topicIds]
        );
        await client.query(`DELETE FROM questions WHERE topic_id = ANY($1::uuid[]);`, [topicIds]);
        await client.query(`DELETE FROM topics WHERE topic_id = ANY($1::uuid[]);`, [topicIds]);
      }

      await client.query(`DELETE FROM subjects WHERE name LIKE $1;`, [`${prefix.toUpperCase()}%`]);

      // Delete user roles and users
      if (userIds.length > 0) {
        await client.query(`DELETE FROM user_roles WHERE user_id = ANY($1::uuid[]);`, [userIds]);
        await client.query(`DELETE FROM users WHERE user_id = ANY($1::uuid[]);`, [userIds]);
      }
    }

    // Clean any orphan outbox events created for resilience testing
    await client.query(`DELETE FROM outbox_events WHERE aggregate_type = 'CHAOS_TEST';`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    if (!options.pool) await pool.end();
  }
}

// CLI runner if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2] || 'seed';
  if (action === 'seed') {
    seedChaosFixtures({ candidateCount: 5 })
      .then((meta) => {
        console.log(`[Fixtures] Seeded chaos fixtures successfully.`);
        console.log(`  Exam: ${meta.examTitle} (${meta.examId})`);
        console.log(`  Candidates: ${meta.attempts.length}`);
        process.exit(0);
      })
      .catch((err) => {
        console.error('[Fixtures] Seeding failed:', err);
        process.exit(1);
      });
  } else if (action === 'clean') {
    teardownChaosFixtures()
      .then(() => {
        console.log('[Fixtures] Cleaned chaos fixtures successfully.');
        process.exit(0);
      })
      .catch((err) => {
        console.error('[Fixtures] Cleanup failed:', err);
        process.exit(1);
      });
  }
}
