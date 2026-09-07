import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import { setRedisClient, closeRedis } from '../../src/infrastructure/redis/client.js';
import { cacheService } from '../../src/infrastructure/redis/cacheService.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import * as attemptsService from '../../src/modules/attempts/attempts.service.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { ForbiddenError } from '../../src/utils/errors.js';

describe('Question Cache-Aside & Dynamic TTL Invariants', () => {
  let mockRedis;
  let studentA;
  let studentB;
  let testSubjectId;
  let testExamId;
  let testSessionId;
  let attemptA;

  before(async () => {
    // 1. Create students
    const regA = await authService.register({
      name: 'Student Cache A',
      email: `stud_a_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    studentA = { userId: regA.userId, roles: ['STUDENT'] };

    const regB = await authService.register({
      name: 'Student Cache B',
      email: `stud_b_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    studentB = { userId: regB.userId, roles: ['STUDENT'] };

    // 2. Create Subject
    const subjRes = await query(`
      INSERT INTO subjects (name, code, description)
      VALUES ($1, $2, $3)
      RETURNING subject_id;
    `, [`Question Cache Subj ${Date.now()}`, `QCS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`, 'Desc']);
    testSubjectId = subjRes.rows[0].subject_id;

    // 3. Create Topics & Questions
    const topRes = await query(`
      INSERT INTO topics (subject_id, name)
      VALUES ($1, $2)
      RETURNING topic_id;
    `, [testSubjectId, 'Cache Topic']);
    const topicId = topRes.rows[0].topic_id;

    for (let i = 1; i <= 3; i++) {
      const q = await query(`
        INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
        VALUES ($1, 'MCQ', $2, 10)
        RETURNING question_id;
      `, [topicId, `Question Prompt ${i}`]);

      await query(`
        INSERT INTO question_options (question_id, option_text, is_correct, display_order)
        VALUES ($1, 'Opt 1', true, 1), ($1, 'Opt 2', false, 2);
      `, [q.rows[0].question_id]);
    }

    // 4. Create Exam & Topic Rule
    const examRes = await query(`
      INSERT INTO exams (title, description, subject_id, duration_minutes, total_marks, passing_marks, status, created_by)
      VALUES ('Question Cache Exam', 'Desc', $1, 60, 30, 10, 'PUBLISHED', $2)
      RETURNING exam_id;
    `, [testSubjectId, studentA.userId]);
    testExamId = examRes.rows[0].exam_id;

    await query(`
      INSERT INTO exam_topic_rules (exam_id, topic_id, question_count, points_per_question)
      VALUES ($1, $2, 2, 10);
    `, [testExamId, topicId]);

    // 5. Create Session & Roster
    const sessRes = await query(`
      INSERT INTO exam_sessions (exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES ($1, CURRENT_TIMESTAMP - INTERVAL '5 minutes', CURRENT_TIMESTAMP + INTERVAL '60 minutes', 'ACTIVE')
      RETURNING session_id;
    `, [testExamId]);
    testSessionId = sessRes.rows[0].session_id;

    await query(`
      INSERT INTO session_students (session_id, student_id, status)
      VALUES ($1, $2, 'PRESENT'), ($1, $3, 'PRESENT');
    `, [testSessionId, studentA.userId, studentB.userId]);

    // 6. Start attempt for Student A
    attemptA = await attemptsService.startAttempt(testSessionId, studentA);
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });

  beforeEach(async () => {
    mockRedis = new RedisMock();
    await mockRedis.flushall();
    setRedisClient(mockRedis);
  });

  afterEach(async () => {
    await closeRedis();
  });

  it('should enforce BOLA authorization BEFORE checking cache', async () => {
    const cacheKey = `v1:attempt:${attemptA.attempt_id}:questions`;
    await cacheService.set(cacheKey, [{ question_id: 'fake' }], 3600);

    // Student B attempts to access Student A's questions -> must reject with 403 Forbidden
    await assert.rejects(
      async () => {
        await attemptsService.getAttemptQuestions(attemptA.attempt_id, studentB);
      },
      (err) => {
        assert.ok(err instanceof ForbiddenError);
        return true;
      }
    );
  });

  it('should populate attempt-scoped key in Redis on cache miss with remainingSeconds TTL', async () => {
    const cacheKey = `v1:attempt:${attemptA.attempt_id}:questions`;
    assert.equal(await cacheService.get(cacheKey), null);

    const result = await attemptsService.getAttemptQuestions(attemptA.attempt_id, studentA);
    assert.equal(result.attempt_id, attemptA.attempt_id);
    assert.ok(Array.isArray(result.questions));
    assert.equal(result.questions.length, 2);

    // Verify key was populated in Redis with attempt-scoped format
    const cached = await cacheService.get(cacheKey);
    assert.ok(cached);
    assert.equal(cached.length, 2);

    // Verify key TTL in Redis
    const ttl = await mockRedis.ttl(cacheKey);
    assert.ok(ttl > 0, `Expected positive TTL, got ${ttl}`);
    assert.ok(ttl <= 3605, `Expected TTL <= 3605s, got ${ttl}`);
  });

  it('should serve from cache on subsequent reads without querying PostgreSQL questions table', async () => {
    const cacheKey = `v1:attempt:${attemptA.attempt_id}:questions`;
    const fakeCachedQuestions = [
      { attempt_question_id: 'cached-aq-1', prompt_text: 'Cached Question 1' }
    ];
    await cacheService.set(cacheKey, fakeCachedQuestions, 1800);

    const result = await attemptsService.getAttemptQuestions(attemptA.attempt_id, studentA);
    assert.deepEqual(result.questions, fakeCachedQuestions);
  });

  it('should never cache questions when remainingSeconds <= 0', async () => {
    // Create separate session for Student B with past scheduled times
    const expSessRes = await query(`
      INSERT INTO exam_sessions (exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES ($1, CURRENT_TIMESTAMP - INTERVAL '30 minutes', CURRENT_TIMESTAMP - INTERVAL '10 minutes', 'CONCLUDED')
      RETURNING session_id;
    `, [testExamId]);
    const expSessionId = expSessRes.rows[0].session_id;

    await query(`
      INSERT INTO session_students (session_id, student_id, status)
      VALUES ($1, $2, 'PRESENT');
    `, [expSessionId, studentB.userId]);

    const expRes = await query(`
      INSERT INTO exam_attempts (session_id, student_id, status, started_at, expires_at)
      VALUES ($1, $2, 'EXPIRED', CURRENT_TIMESTAMP - INTERVAL '30 minutes', CURRENT_TIMESTAMP - INTERVAL '10 minutes')
      RETURNING attempt_id;
    `, [expSessionId, studentB.userId]);
    const expiredAttemptId = expRes.rows[0].attempt_id;

    const cacheKey = `v1:attempt:${expiredAttemptId}:questions`;

    await attemptsService.getAttemptQuestions(expiredAttemptId, studentB);

    // Must NOT have populated Redis
    const cached = await cacheService.get(cacheKey);
    assert.equal(cached, null);
  });
});
