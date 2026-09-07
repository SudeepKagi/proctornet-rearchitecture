import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import { setRedisClient, closeRedis } from '../../src/infrastructure/redis/client.js';
import {
  blacklistSession,
  isSessionBlacklisted
} from '../../src/modules/auth/tokenBlacklist.js';

describe('Token Blacklist Service', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = new RedisMock();
    setRedisClient(mockRedis);
  });

  afterEach(async () => {
    await closeRedis();
  });

  it('should add a session to the Redis blacklist with TTL', async () => {
    const sessionId = 'session-test-uuid-1';
    const added = await blacklistSession(sessionId, 300);
    assert.equal(added, true);

    const check = await isSessionBlacklisted(sessionId);
    assert.equal(check.available, true);
    assert.equal(check.isBlacklisted, true);
  });

  it('should report not blacklisted for unknown active sessions', async () => {
    const check = await isSessionBlacklisted('unknown-active-session');
    assert.equal(check.available, true);
    assert.equal(check.isBlacklisted, false);
  });

  it('should handle Redis get errors and report available=false for DB fallback', async () => {
    mockRedis.get = async () => {
      throw new Error('Redis offline');
    };

    const check = await isSessionBlacklisted('any-session');
    assert.equal(check.available, false);
    assert.equal(check.isBlacklisted, false);
  });

  it('should return available=true, isBlacklisted=false for null/undefined sessionId', async () => {
    const check = await isSessionBlacklisted(null);
    assert.equal(check.available, true);
    assert.equal(check.isBlacklisted, false);
  });
});
