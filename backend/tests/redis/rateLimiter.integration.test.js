import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';
import { randomUUID } from 'node:crypto';
import { SLIDING_WINDOW_LUA } from '../../src/middleware/rateLimiter.js';

describe('Distributed Atomic Rate Limiter (Lua Script Concurrency)', () => {
  let redisClient;
  let isLiveRedis = false;
  const testKey = `test:v1:ratelimit:concurrency:${Date.now()}`;

  before(async () => {
    // Attempt connection to live Redis server
    try {
      const probe = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        family: 4,
        port: Number(process.env.REDIS_PORT) || 6379,
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null
      });

      probe.on('error', () => {}); // Silence connection errors during probe

      await new Promise((resolve, reject) => {
        probe.once('ready', resolve);
        probe.once('error', reject);
        setTimeout(() => reject(new Error('Probe timeout')), 2000);
      });

      await probe.ping();
      redisClient = probe;
      isLiveRedis = true;
      console.log('  ℹ Live Redis daemon detected on localhost:6379. Running live concurrency tests.');
    } catch {
      console.log('  ℹ Live Redis daemon not reachable on localhost:6379. Running integration test with RedisMock.');
      redisClient = new RedisMock();
      isLiveRedis = false;
    }

    redisClient.defineCommand('slidingWindowRateLimit', {
      numberOfKeys: 1,
      lua: SLIDING_WINDOW_LUA
    });
  });

  after(async () => {
    if (redisClient) {
      try {
        await redisClient.del(testKey);
        if (typeof redisClient.quit === 'function') {
          await redisClient.quit();
        } else if (typeof redisClient.disconnect === 'function') {
          redisClient.disconnect();
        }
      } catch {
        if (typeof redisClient.disconnect === 'function') {
          redisClient.disconnect();
        }
      }
    }
  });

  it('should guarantee atomic check-and-increment under concurrent requests', async () => {
    const limit = 10;
    const windowMs = 60000;
    const totalRequests = 30;
    const now = Date.now();

    // Dispatch 30 concurrent requests hitting the Lua script simultaneously
    const promises = Array.from({ length: totalRequests }).map((_, idx) => {
      const member = `${now}:${idx}:${randomUUID()}`;
      return redisClient.slidingWindowRateLimit(testKey, now, windowMs, limit, member);
    });

    const results = await Promise.all(promises);

    let allowedCount = 0;
    let rejectedCount = 0;

    for (const res of results) {
      const allowed = Number(res[0]);
      const remaining = Number(res[1]);
      const retryAfter = Number(res[2]);

      if (allowed === 1) {
        allowedCount++;
        assert.ok(remaining >= 0 && remaining < limit);
        assert.equal(retryAfter, 0);
      } else {
        rejectedCount++;
        assert.equal(allowed, 0);
        assert.equal(remaining, 0);
        assert.ok(retryAfter >= 1);
      }
    }

    // Invariant 1: Exactly 10 requests allowed
    assert.equal(allowedCount, limit, `Expected exactly ${limit} requests allowed, got ${allowedCount}`);

    // Invariant 2: Exactly 20 requests rejected
    assert.equal(rejectedCount, totalRequests - limit, `Expected exactly ${totalRequests - limit} requests rejected, got ${rejectedCount}`);

    // Invariant 3: ZSET cardinality must not exceed limit
    const card = await redisClient.zcard(testKey);
    assert.equal(card, limit, `Expected ZSET cardinality to be ${limit}, got ${card}`);
  });

  it('should reset allowed count after window slides', async () => {
    const slideKey = `test:v1:ratelimit:slide:${Date.now()}`;
    const limit = 2;
    const windowMs = 1000; // 1 second window
    const now = Date.now();

    // 1st request
    const r1 = await redisClient.slidingWindowRateLimit(slideKey, now, windowMs, limit, `m1:${randomUUID()}`);
    assert.equal(Number(r1[0]), 1);

    // 2nd request
    const r2 = await redisClient.slidingWindowRateLimit(slideKey, now, windowMs, limit, `m2:${randomUUID()}`);
    assert.equal(Number(r2[0]), 1);

    // 3rd request (immediate -> rejected)
    const r3 = await redisClient.slidingWindowRateLimit(slideKey, now, windowMs, limit, `m3:${randomUUID()}`);
    assert.equal(Number(r3[0]), 0);

    // Simulate time forward by (windowMs + 50ms)
    const later = now + windowMs + 50;
    const r4 = await redisClient.slidingWindowRateLimit(slideKey, later, windowMs, limit, `m4:${randomUUID()}`);
    assert.equal(Number(r4[0]), 1, 'Request after sliding window expiry should be allowed');

    await redisClient.del(slideKey);
  });
});
