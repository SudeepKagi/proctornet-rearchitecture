import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import { setRedisClient, closeRedis } from '../../src/infrastructure/redis/client.js';
import { cacheService } from '../../src/infrastructure/redis/cacheService.js';

describe('Cache-Aside Service', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = new RedisMock();
    setRedisClient(mockRedis);
  });

  afterEach(async () => {
    await closeRedis();
  });

  it('should return null on cache miss', async () => {
    const result = await cacheService.get('v1:exam:nonexistent');
    assert.equal(result, null);
  });

  it('should store and retrieve serializable objects', async () => {
    const examData = {
      exam_id: 'exam-123',
      title: 'Distributed Systems Final',
      duration_minutes: 120
    };

    const saved = await cacheService.set('v1:exam:exam-123', examData, 3600);
    assert.equal(saved, true);

    const cached = await cacheService.get('v1:exam:exam-123');
    assert.deepEqual(cached, examData);
  });

  it('should skip caching when ttlSeconds <= 0', async () => {
    const savedZero = await cacheService.set('v1:attempt:1:questions', { data: 'test' }, 0);
    assert.equal(savedZero, false);

    const savedNegative = await cacheService.set('v1:attempt:1:questions', { data: 'test' }, -10);
    assert.equal(savedNegative, false);

    const cached = await cacheService.get('v1:attempt:1:questions');
    assert.equal(cached, null);
  });

  it('should gracefully discard corrupt JSON and return null miss', async () => {
    // Manually inject invalid non-JSON string into Redis
    await mockRedis.set('v1:corrupt:key', 'not-valid-json{{{');

    const result = await cacheService.get('v1:corrupt:key');
    assert.equal(result, null);

    // Verify key was cleaned up
    const exists = await mockRedis.exists('v1:corrupt:key');
    assert.equal(exists, 0);
  });

  it('should fail-open and return null when Redis get throws', async () => {
    mockRedis.get = async () => {
      throw new Error('Connection lost');
    };

    const result = await cacheService.get('v1:exam:123');
    assert.equal(result, null);
  });

  it('should fail-open and return false when Redis set throws', async () => {
    mockRedis.set = async () => {
      throw new Error('Write failed');
    };

    const result = await cacheService.set('v1:exam:123', { a: 1 }, 60);
    assert.equal(result, false);
  });

  it('should delete keys upon invalidation', async () => {
    await cacheService.set('v1:exam:456', { title: 'Exam 456' }, 3600);
    assert.ok(await cacheService.get('v1:exam:456'));

    const deleted = await cacheService.del('v1:exam:456');
    assert.equal(deleted, true);

    assert.equal(await cacheService.get('v1:exam:456'), null);
  });
});
