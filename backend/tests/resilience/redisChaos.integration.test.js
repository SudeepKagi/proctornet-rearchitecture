/**
 * @file redisChaos.integration.test.js
 * @description Phase 22 Level 1 & 2: Redis failure resilience, fail-open cache,
 * in-memory rate limiter fallback, and automated reconnection verification.
 */

import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';

import { setRedisClient, closeRedis, checkRedisHealth } from '../../src/infrastructure/redis/client.js';
import { cacheService } from '../../src/infrastructure/redis/cacheService.js';
import { createRateLimiter, resetRateLimits } from '../../src/middleware/rateLimiter.js';
import { defaultRetryStrategy } from '../../src/infrastructure/redis/client.js';

describe('Phase 22 — Redis Chaos & Resilience (Level 1 & 2)', () => {
  let brokenRedis;

  beforeEach(() => {
    // Create a mock client where all Redis commands fail with connection errors
    brokenRedis = new RedisMock();
    brokenRedis.get = async () => { throw new Error('ECONNREFUSED: Redis server offline'); };
    brokenRedis.set = async () => { throw new Error('ECONNREFUSED: Redis server offline'); };
    brokenRedis.del = async () => { throw new Error('ECONNREFUSED: Redis server offline'); };
    brokenRedis.ping = async () => { throw new Error('ECONNREFUSED: Redis server offline'); };
    brokenRedis.slidingWindowRateLimit = async () => { throw new Error('ECONNREFUSED: Redis server offline'); };

    setRedisClient(brokenRedis);
    resetRateLimits();
  });

  afterEach(async () => {
    resetRateLimits();
    await closeRedis();
  });

  after(async () => {
    await closeRedis();
  });

  it('L1: checkRedisHealth accurately reports DOWN during outage without throwing', async () => {
    const health = await checkRedisHealth(1000);
    assert.strictEqual(health.healthy, false);
    assert.strictEqual(health.status, 'DOWN');
    assert.ok(health.error.includes('ECONNREFUSED'));
  });

  it('L1: cacheService fails open gracefully on get, set, and del during Redis outage', async () => {
    // 1. GET returns null (safe fallback to authoritative DB)
    const getVal = await cacheService.get('v1:exam:resilience-test');
    assert.strictEqual(getVal, null, 'Cache get must return null on Redis failure');

    // 2. SET returns false without throwing
    const setSuccess = await cacheService.set('v1:exam:resilience-test', { data: 1 }, 60);
    assert.strictEqual(setSuccess, false, 'Cache set must return false on Redis failure');

    // 3. DEL returns false without throwing
    const delSuccess = await cacheService.del('v1:exam:resilience-test');
    assert.strictEqual(delSuccess, false, 'Cache del must return false on Redis failure');
  });

  it('L1: rateLimiter transparently switches to local in-memory sliding window when Redis is offline', async () => {
    const limiter = createRateLimiter({
      windowMs: 10000,
      max: 3,
      keyGenerator: () => 'chaos_test_ip_1'
    });

    const mockReq = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, baseUrl: '/api/v1/test', route: { path: '/test' } };
    const resHeaders = {};

    const mockRes = {
      setHeader(k, v) { resHeaders[k] = v; },
      status() { return this; },
      json() {}
    };

    const runMiddleware = () => new Promise((resolve) => {
      limiter(mockReq, mockRes, (err) => {
        resolve(err || null);
      });
    });

    // Request 1: Allowed (Remaining = 2)
    const err1 = await runMiddleware();
    assert.strictEqual(err1, null);
    assert.strictEqual(resHeaders['X-RateLimit-Remaining'], '2');

    // Request 2: Allowed (Remaining = 1)
    const err2 = await runMiddleware();
    assert.strictEqual(err2, null);
    assert.strictEqual(resHeaders['X-RateLimit-Remaining'], '1');

    // Request 3: Allowed (Remaining = 0)
    const err3 = await runMiddleware();
    assert.strictEqual(err3, null);
    assert.strictEqual(resHeaders['X-RateLimit-Remaining'], '0');

    // Request 4: Blocked with TooManyRequestsError (429)
    const err4 = await runMiddleware();
    assert.ok(err4, '4th request must be blocked');
    assert.strictEqual(err4.statusCode, 429);
    assert.strictEqual(err4.code, 'TOO_MANY_REQUESTS');
  });

  it('L2: defaultRetryStrategy enforces bounded backoff and stops retrying in test environment', () => {
    // In test environment, retry terminates after attempt 1
    const delayTest1 = defaultRetryStrategy(1, true);
    assert.strictEqual(delayTest1, 50);

    const delayTest2 = defaultRetryStrategy(2, true);
    assert.strictEqual(delayTest2, null, 'Test retry strategy must stop reconnect loop');

    // In production/non-test environment, retry is capped at 3000ms and max 10 attempts
    const delayProd1 = defaultRetryStrategy(1, false);
    assert.strictEqual(delayProd1, 100);

    const delayProd5 = defaultRetryStrategy(5, false);
    assert.strictEqual(delayProd5, 500);

    const delayProd10 = defaultRetryStrategy(10, false);
    assert.strictEqual(delayProd10, 1000);

    const delayProd11 = defaultRetryStrategy(11, false);
    assert.strictEqual(delayProd11, null, 'Max retries (10) must terminate reconnection');
  });

  it('L2: cacheService restores caching transparently when Redis client recovers', async () => {
    // 1. Working Redis mock
    const workingRedis = new RedisMock();
    setRedisClient(workingRedis);

    // 2. Set value
    const setRes = await cacheService.set('v1:recovered:key', { recovered: true }, 60);
    assert.strictEqual(setRes, true);

    // 3. Get value
    const getRes = await cacheService.get('v1:recovered:key');
    assert.deepStrictEqual(getRes, { recovered: true });

    // Clean up
    await closeRedis();
  });
});
