import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import {
  createRedisClient,
  getRedisClient,
  setRedisClient,
  checkRedisHealth,
  closeRedis,
  isTestRunner,
  defaultRetryStrategy
} from '../../src/infrastructure/redis/client.js';
import { config } from '../../src/config/env.js';

describe('Redis Client Infrastructure', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = new RedisMock();
    setRedisClient(mockRedis);
  });

  afterEach(async () => {
    await closeRedis();
  });

  it('should initialize and return the managed client singleton', () => {
    const client = getRedisClient();
    assert.ok(client);
    assert.equal(client, mockRedis);
  });

  it('should perform health check reporting UP when Redis is responsive', async () => {
    const health = await checkRedisHealth();
    assert.equal(health.healthy, true);
    assert.equal(health.status, 'UP');
    assert.ok(typeof health.latencyMs === 'number');
  });

  it('should perform health check reporting DOWN when ping throws', async () => {
    mockRedis.ping = async () => {
      throw new Error('Connection refused');
    };

    const health = await checkRedisHealth();
    assert.equal(health.healthy, false);
    assert.equal(health.status, 'DOWN');
    assert.ok(health.error.includes('Connection refused'));
  });

  it('should close client and reset instance during graceful close', async () => {
    let quitCalled = false;
    mockRedis.status = 'ready';
    mockRedis.quit = async () => {
      quitCalled = true;
    };

    await closeRedis();
    assert.equal(quitCalled, true);
  });

  it('should force disconnect when client is not ready during closeRedis', async () => {
    let disconnectCalled = false;
    mockRedis.status = 'reconnecting';
    mockRedis.disconnect = (reconnect) => {
      disconnectCalled = true;
      assert.equal(reconnect, false);
    };

    await closeRedis();
    assert.equal(disconnectCalled, true);
  });

  it('should create client with expected keyPrefix option', () => {
    const client = createRedisClient({ lazyConnect: true });
    assert.equal(client.options.keyPrefix, 'proctornet:');
    assert.equal(client.options.enableOfflineQueue, false);
    client.disconnect(false);
  });

  describe('Test-Runner Detection (isTestRunner)', () => {
    it('should detect test runner when NODE_ENV is test', () => {
      assert.equal(isTestRunner({ nodeEnv: 'test', execArgv: [], argv: [] }), true);
    });

    it('should detect test runner when execArgv contains --test even if NODE_ENV is development', () => {
      assert.equal(
        isTestRunner({ nodeEnv: 'development', execArgv: ['--test'], argv: ['node'] }),
        true
      );
    });

    it('should detect test runner when argv contains --test even if NODE_ENV is development', () => {
      assert.equal(
        isTestRunner({ nodeEnv: 'development', execArgv: [], argv: ['node', '--test', 'tests/foo.js'] }),
        true
      );
    });

    it('should detect test runner when testContext is provided', () => {
      assert.equal(
        isTestRunner({ nodeEnv: 'development', execArgv: [], argv: ['node', 'server.js'], testContext: true }),
        true
      );
    });

    it('should return false in production/development without test flags', () => {
      assert.equal(
        isTestRunner({ nodeEnv: 'development', execArgv: [], argv: ['node', 'src/server.js'] }),
        false
      );
      assert.equal(
        isTestRunner({ nodeEnv: 'production', execArgv: [], argv: ['node', 'src/server.js'] }),
        false
      );
    });

    it('should evaluate to true in the current test runner execution', () => {
      // In the real test runner, isTestRunner() should be true regardless of config.NODE_ENV
      assert.equal(isTestRunner(), true);
    });
  });

  describe('Retry Strategy Behavior (defaultRetryStrategy)', () => {
    it('should permit bounded initial retry in test environment and stop immediately after bound', () => {
      // In test mode: times=1 yields 50ms, times>1 yields null to stop reconnecting
      assert.equal(defaultRetryStrategy(1, true), 50);
      assert.equal(defaultRetryStrategy(2, true), null);
      assert.equal(defaultRetryStrategy(3, true), null);
      assert.equal(defaultRetryStrategy(10, true), null);
    });

    it('should apply exponential backoff in non-test environments up to bounded limit', () => {
      // Non-test mode: backoff is Math.min(times * 100, 3000)
      assert.equal(defaultRetryStrategy(1, false), 100);
      assert.equal(defaultRetryStrategy(2, false), 200);
      assert.equal(defaultRetryStrategy(5, false), 500);
      assert.equal(defaultRetryStrategy(10, false), 1000);
      // Beyond 10 attempts: returns null to prevent infinite reconnect loop
      assert.equal(defaultRetryStrategy(11, false), null);
      assert.equal(defaultRetryStrategy(20, false), null);
    });

    it('should configure retryStrategy on created client that stops reconnecting in test mode', () => {
      const client = createRedisClient({ lazyConnect: true });
      assert.equal(typeof client.options.retryStrategy, 'function');
      assert.equal(client.options.retryStrategy(1), 50);
      assert.equal(client.options.retryStrategy(2), null);
      client.disconnect(false);
    });
  });
});
