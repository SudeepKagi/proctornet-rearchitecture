import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import { setRedisClient, closeRedis } from '../../src/infrastructure/redis/client.js';
import {
  createRateLimiter,
  resetRateLimits,
  TooManyRequestsError
} from '../../src/middleware/rateLimiter.js';

describe('Rate Limiter Unit Tests', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = new RedisMock();
    setRedisClient(mockRedis);
    resetRateLimits();
  });

  afterEach(async () => {
    await closeRedis();
  });

  it('should allow requests under the limit and set rate limit headers', async () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 3,
      keyGenerator: () => 'v1:ratelimit:test:user1'
    });

    const req = { ip: '127.0.0.1' };
    const headers = {};
    const res = {
      setHeader(name, val) {
        headers[name] = val;
      }
    };

    let nextCalled = false;
    let nextError = null;
    const next = (err) => {
      nextCalled = true;
      nextError = err || null;
    };

    // Request 1
    await limiter(req, res, next);
    assert.equal(nextCalled, true);
    assert.equal(nextError, null);
    assert.equal(headers['X-RateLimit-Limit'], '3');
    assert.equal(headers['X-RateLimit-Remaining'], '2');

    // Request 2
    nextCalled = false;
    await limiter(req, res, next);
    assert.equal(nextCalled, true);
    assert.equal(nextError, null);
    assert.equal(headers['X-RateLimit-Remaining'], '1');

    // Request 3
    nextCalled = false;
    await limiter(req, res, next);
    assert.equal(nextCalled, true);
    assert.equal(nextError, null);
    assert.equal(headers['X-RateLimit-Remaining'], '0');
  });

  it('should reject requests exceeding max with 429 and Retry-After header', async () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 2,
      message: 'Rate limit exceeded for testing',
      keyGenerator: () => 'v1:ratelimit:test:user2'
    });

    const req = { ip: '127.0.0.1' };
    const headers = {};
    const res = {
      setHeader(name, val) {
        headers[name] = val;
      }
    };

    let errorReceived = null;
    const next = (err) => {
      errorReceived = err || null;
    };

    await limiter(req, res, next);
    assert.equal(errorReceived, null);

    await limiter(req, res, next);
    assert.equal(errorReceived, null);

    // 3rd request should breach limit
    await limiter(req, res, next);
    assert.ok(errorReceived instanceof TooManyRequestsError);
    assert.equal(errorReceived.statusCode, 429);
    assert.equal(errorReceived.message, 'Rate limit exceeded for testing');
    assert.ok(Number(headers['Retry-After']) >= 1);
  });

  it('should fall back to in-memory limiter when Redis throws an error', async () => {
    mockRedis.slidingWindowRateLimit = async () => {
      throw new Error('Redis connection drop simulation');
    };

    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 2,
      keyGenerator: () => 'v1:ratelimit:test:fallback-user'
    });

    const req = { ip: '127.0.0.1' };
    const headers = {};
    const res = {
      setHeader(name, val) {
        headers[name] = val;
      }
    };

    let errorReceived = null;
    const next = (err) => {
      errorReceived = err || null;
    };

    // 1st request -> allowed via in-memory fallback
    await limiter(req, res, next);
    assert.equal(errorReceived, null);

    // 2nd request -> allowed via in-memory fallback
    await limiter(req, res, next);
    assert.equal(errorReceived, null);

    // 3rd request -> rejected via in-memory fallback
    await limiter(req, res, next);
    assert.ok(errorReceived instanceof TooManyRequestsError);
    assert.equal(errorReceived.statusCode, 429);
    assert.ok(Number(headers['Retry-After']) >= 1);
  });

  it('should fail-open if keyGenerator throws unexpected error', async () => {
    const limiter = createRateLimiter({
      keyGenerator: () => {
        throw new Error('Unexpected catastrophic error');
      }
    });

    const req = {};
    const res = { setHeader: () => {} };

    let nextCalled = false;
    let nextError = null;
    await limiter(req, res, (err) => {
      nextCalled = true;
      nextError = err;
    });

    assert.equal(nextCalled, true);
    assert.equal(nextError, undefined);
  });
});
