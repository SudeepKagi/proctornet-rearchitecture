import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import { setRedisClient, closeRedis } from '../../src/infrastructure/redis/client.js';
import { cacheService } from '../../src/infrastructure/redis/cacheService.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { ExamStatus } from '../../src/domain/exam/examStates.js';

describe('Exam Cache-Aside & Invalidation', () => {
  let mockRedis;
  let testUser;
  let testSubjectId;

  before(async () => {
    // Setup test user & subject in DB
    const faculty = await authService.register({
      name: 'Exam Cache Tester',
      email: `exam_cache_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    testUser = { userId: faculty.userId, roles: ['FACULTY', 'STUDENT'] };

    const subjRes = await query(`
      INSERT INTO subjects (name, code, description)
      VALUES ($1, $2, $3)
      RETURNING subject_id;
    `, [`Redis Cache Subj ${Date.now()}`, `RCS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`, 'Testing exam caching']);
    testSubjectId = subjRes.rows[0].subject_id;
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });

  beforeEach(() => {
    mockRedis = new RedisMock();
    setRedisClient(mockRedis);
  });

  afterEach(async () => {
    await closeRedis();
  });

  it('should serve directly from cache when exam key is present (cache hit)', async () => {
    const fakeExamId = 'exam-cache-hit-uuid';
    const cachedRepresentation = {
      exam_id: fakeExamId,
      title: 'Fast Cached Exam',
      duration_minutes: 60,
      total_marks: '100.00',
      status: ExamStatus.PUBLISHED,
      topic_rules: []
    };

    // Pre-populate Redis
    await cacheService.set(`v1:exam:${fakeExamId}`, cachedRepresentation, 3600);

    // Call service - should return from Redis without querying DB (fake ID doesn't exist in DB)
    const result = await examService.getExamById(fakeExamId);
    assert.deepEqual(result, cachedRepresentation);
  });

  it('should populate Redis on cache miss for PUBLISHED exam', async () => {
    // Create draft exam in DB
    const exam = await examService.createExam({
      title: 'Cache Miss Exam',
      description: 'Testing miss and populate',
      subject_id: testSubjectId,
      duration_minutes: 45,
      total_marks: 50,
      passing_marks: 20
    }, testUser.userId);

    // Create topic and rule so exam can be published
    const topicRes = await query(`
      INSERT INTO topics (subject_id, name)
      VALUES ($1, $2)
      RETURNING topic_id;
    `, [testSubjectId, `Cache Topic ${Date.now()}`]);
    const topicId = topicRes.rows[0].topic_id;

    // Create question in pool
    const qRes = await query(`
      INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
      VALUES ($1, 'MCQ', 'Sample Question for Publish', 50)
      RETURNING question_id;
    `, [topicId]);

    await query(`
      INSERT INTO question_options (question_id, option_text, is_correct, display_order)
      VALUES ($1, 'Opt A', true, 1), ($1, 'Opt B', false, 2);
    `, [qRes.rows[0].question_id]);

    await examService.configureTopicRule(exam.exam_id, {
      topic_id: topicId,
      question_count: 1,
      points_per_question: 50
    }, testUser);

    // Publish the exam
    await examService.publishExam(exam.exam_id, testUser);

    // Verify cache is currently empty (publish invalidates)
    assert.equal(await cacheService.get(`v1:exam:${exam.exam_id}`), null);

    // First read -> Cache miss, loads from DB, populates Redis
    const loaded = await examService.getExamById(exam.exam_id);
    assert.equal(loaded.exam_id, exam.exam_id);
    assert.equal(loaded.status, ExamStatus.PUBLISHED);

    // Second read -> Should now be in Redis cache
    const inCache = await cacheService.get(`v1:exam:${exam.exam_id}`);
    assert.ok(inCache);
    assert.equal(inCache.title, 'Cache Miss Exam');
    assert.equal(inCache.status, ExamStatus.PUBLISHED);
  });

  it('should invalidate cache when draft exam is updated', async () => {
    const exam = await examService.createExam({
      title: 'Mutable Exam',
      description: 'Before edit',
      subject_id: testSubjectId,
      duration_minutes: 30,
      total_marks: 100,
      passing_marks: 40
    }, testUser.userId);

    // Seed cache entry
    await cacheService.set(`v1:exam:${exam.exam_id}`, { title: 'Old Cached Title' }, 3600);
    assert.ok(await cacheService.get(`v1:exam:${exam.exam_id}`));

    // Update draft exam
    await examService.updateDraftExam(exam.exam_id, { title: 'Updated Title' }, testUser);

    // Cache entry must be deleted
    const cachedAfter = await cacheService.get(`v1:exam:${exam.exam_id}`);
    assert.equal(cachedAfter, null);
  });
});
