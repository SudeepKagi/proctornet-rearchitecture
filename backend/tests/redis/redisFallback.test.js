import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import { setRedisClient, closeRedis, checkRedisHealth } from '../../src/infrastructure/redis/client.js';
import { cacheService } from '../../src/infrastructure/redis/cacheService.js';
import { createRateLimiter, resetRateLimits } from '../../src/middleware/rateLimiter.js';
import {
  authenticate,
  setSessionRevocationChecker,
  resetSessionRevocationChecker
} from '../../src/middleware/authenticate.js';
import { generateAccessToken } from '../../src/modules/auth/token.service.js';
import { UnauthorizedError } from '../../src/utils/errors.js';

describe('System-Wide Redis Outage Fallback & Resilience', () => {
  let brokenRedis;

  beforeEach(() => {
    // Create a mock client where every single command throws a network/connection error
    brokenRedis = new RedisMock();
    brokenRedis.get = async () => { throw new Error('ECONNREFUSED: Redis server unreachable'); };
    brokenRedis.set = async () => { throw new Error('ECONNREFUSED: Redis server unreachable'); };
    brokenRedis.del = async () => { throw new Error('ECONNREFUSED: Redis server unreachable'); };
    brokenRedis.ping = async () => { throw new Error('ECONNREFUSED: Redis server unreachable'); };
    brokenRedis.slidingWindowRateLimit = async () => { throw new Error('ECONNREFUSED: Redis server unreachable'); };

    setRedisClient(brokenRedis);
    resetRateLimits();
    resetSessionRevocationChecker();
  });

  afterEach(async () => {
    resetSessionRevocationChecker();
    await closeRedis();
  });

  it('checkRedisHealth should report DOWN cleanly without crashing process', async () => {
    const health = await checkRedisHealth();
    assert.equal(health.healthy, false);
    assert.equal(health.status, 'DOWN');
    assert.ok(health.error.includes('ECONNREFUSED'));
  });

  it('cacheService should fail open gracefully on all operations during outage', async () => {
    const getResult = await cacheService.get('v1:exam:any-uuid');
    assert.equal(getResult, null);

    const setResult = await cacheService.set('v1:exam:any-uuid', { data: 1 }, 3600);
    assert.equal(setResult, false);

    const delResult = await cacheService.del('v1:exam:any-uuid');
    assert.equal(delResult, false);
  });

  it('rateLimiter should degrade to in-memory sliding window during Redis outage', async () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 2,
      keyGenerator: () => 'v1:ratelimit:outage:test'
    });

    const req = { ip: '192.168.1.1' };
    const res = { setHeader: () => {} };

    let err1 = null;
    await limiter(req, res, (err) => { err1 = err; });
    assert.equal(err1, undefined);

    let err2 = null;
    await limiter(req, res, (err) => { err2 = err; });
    assert.equal(err2, undefined);

    let err3 = null;
    await limiter(req, res, (err) => { err3 = err; });
    assert.ok(err3);
    assert.equal(err3.statusCode, 429);
  });

  it('authenticate should fall back to PostgreSQL and succeed for active session', async () => {
    let pgCalled = false;
    setSessionRevocationChecker(async (sessId) => {
      pgCalled = true;
      assert.equal(sessId, 'sess-resilient-1');
      return { is_revoked: false };
    });

    const token = generateAccessToken({
      userId: 'user-resilient-1',
      roles: ['STUDENT'],
      sessionId: 'sess-resilient-1'
    });

    const req = { headers: { authorization: `Bearer ${token}` } };
    let nextCalled = false;
    let nextError = null;

    await authenticate(req, {}, (err) => {
      nextCalled = true;
      nextError = err;
    });

    assert.equal(pgCalled, true);
    assert.equal(nextCalled, true);
    assert.equal(nextError, undefined);
    assert.equal(req.user.userId, 'user-resilient-1');
  });

  it('authenticate should fall back to PostgreSQL and reject revoked session', async () => {
    setSessionRevocationChecker(async () => {
      return { is_revoked: true };
    });

    const token = generateAccessToken({
      userId: 'user-resilient-2',
      roles: ['STUDENT'],
      sessionId: 'sess-revoked-2'
    });

    const req = { headers: { authorization: `Bearer ${token}` } };
    let nextError = null;

    await authenticate(req, {}, (err) => {
      nextError = err;
    });

    assert.ok(nextError instanceof UnauthorizedError);
    assert.equal(nextError.message, 'Session has been revoked');
  });

  it('authenticate should fail closed when both Redis and PostgreSQL fail', async () => {
    setSessionRevocationChecker(async () => {
      throw new Error('Database connection pool timeout');
    });

    const token = generateAccessToken({
      userId: 'user-resilient-3',
      roles: ['STUDENT'],
      sessionId: 'sess-dual-fail'
    });

    const req = { headers: { authorization: `Bearer ${token}` } };
    let nextError = null;

    await authenticate(req, {}, (err) => {
      nextError = err;
    });

    assert.ok(nextError instanceof UnauthorizedError);
    assert.equal(nextError.message, 'Authentication verification unavailable');
  });
});
