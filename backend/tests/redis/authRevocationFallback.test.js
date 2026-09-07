import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import { setRedisClient, closeRedis } from '../../src/infrastructure/redis/client.js';
import {
  authenticate,
  setSessionRevocationChecker,
  resetSessionRevocationChecker
} from '../../src/middleware/authenticate.js';
import { generateAccessToken } from '../../src/modules/auth/token.service.js';
import { blacklistSession } from '../../src/modules/auth/tokenBlacklist.js';
import { UnauthorizedError } from '../../src/utils/errors.js';

describe('Authentication & Session Revocation Fallback', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = new RedisMock();
    setRedisClient(mockRedis);
    resetSessionRevocationChecker();
  });

  afterEach(async () => {
    resetSessionRevocationChecker();
    await closeRedis();
  });

  it('should authenticate active session via fast-path when Redis is available', async () => {
    const token = generateAccessToken({
      userId: 'user-1',
      roles: ['STUDENT'],
      sessionId: 'sess-active-1'
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };
    let nextCalled = false;
    let nextError = null;

    await authenticate(req, {}, (err) => {
      nextCalled = true;
      nextError = err;
    });

    assert.equal(nextCalled, true);
    assert.equal(nextError, undefined);
    assert.equal(req.user.userId, 'user-1');
    assert.equal(req.user.sessionId, 'sess-active-1');
  });

  it('should reject blacklisted session immediately via Redis fast-path', async () => {
    const sessionId = 'sess-blacklisted-1';
    await blacklistSession(sessionId);

    const token = generateAccessToken({
      userId: 'user-1',
      roles: ['STUDENT'],
      sessionId
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };
    let nextError = null;

    await authenticate(req, {}, (err) => {
      nextError = err;
    });

    assert.ok(nextError instanceof UnauthorizedError);
    assert.equal(nextError.message, 'Session has been revoked');
  });

  it('should fall back to PostgreSQL user_sessions when Redis is unavailable and session is active', async () => {
    mockRedis.get = async () => {
      throw new Error('Redis connection down');
    };

    let pgQueryCalled = false;
    setSessionRevocationChecker(async (sessId) => {
      pgQueryCalled = true;
      assert.equal(sessId, 'sess-pg-active');
      return { is_revoked: false };
    });

    const token = generateAccessToken({
      userId: 'user-2',
      roles: ['STUDENT'],
      sessionId: 'sess-pg-active'
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };
    let nextCalled = false;
    let nextError = null;

    await authenticate(req, {}, (err) => {
      nextCalled = true;
      nextError = err;
    });

    assert.equal(pgQueryCalled, true);
    assert.equal(nextCalled, true);
    assert.equal(nextError, undefined);
    assert.equal(req.user.userId, 'user-2');
  });

  it('should fall back to PostgreSQL user_sessions and reject if revoked', async () => {
    mockRedis.get = async () => {
      throw new Error('Redis connection down');
    };

    setSessionRevocationChecker(async () => {
      return { is_revoked: true };
    });

    const token = generateAccessToken({
      userId: 'user-2',
      roles: ['STUDENT'],
      sessionId: 'sess-pg-revoked'
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };
    let nextError = null;

    await authenticate(req, {}, (err) => {
      nextError = err;
    });

    assert.ok(nextError instanceof UnauthorizedError);
    assert.equal(nextError.message, 'Session has been revoked');
  });

  it('should fail closed when BOTH Redis and PostgreSQL are down', async () => {
    mockRedis.get = async () => {
      throw new Error('Redis connection down');
    };

    setSessionRevocationChecker(async () => {
      throw new Error('PostgreSQL connection pool exhausted');
    });

    const token = generateAccessToken({
      userId: 'user-3',
      roles: ['STUDENT'],
      sessionId: 'sess-dual-down'
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };
    let nextError = null;

    await authenticate(req, {}, (err) => {
      nextError = err;
    });

    assert.ok(nextError instanceof UnauthorizedError);
    assert.equal(nextError.message, 'Authentication verification unavailable');
  });
});
