import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config/env.js';

describe('Configuration Validation', () => {
  it('should accept valid configuration and apply defaults', () => {
    const config = validateConfig({
      NODE_ENV: 'test',
      PORT: '5000',
      LOG_LEVEL: 'silent'
    });

    assert.equal(config.NODE_ENV, 'test');
    assert.equal(config.PORT, 5000);
    assert.equal(config.LOG_LEVEL, 'silent');
    assert.equal(config.DB_HOST, 'localhost');
    assert.equal(config.DB_PORT, 5432);
    assert.equal(config.DB_NAME, 'proctornet');
    assert.equal(config.DB_POOL_MIN, 2);
    assert.equal(config.DB_POOL_MAX, 10);
    assert.equal(config.REDIS_ENABLED, true);
    assert.equal(config.REDIS_HOST, 'localhost');
    assert.equal(config.REDIS_PORT, 6379);
    assert.equal(config.REDIS_PASSWORD, undefined);
    assert.equal(config.REDIS_DB, 0);
    assert.equal(config.REDIS_CONNECT_TIMEOUT_MS, 5000);
    assert.equal(config.RABBITMQ_ENABLED, true);
    assert.equal(config.RABBITMQ_HOST, 'localhost');
    assert.equal(config.RABBITMQ_PORT, 5672);
    assert.equal(config.RABBITMQ_USER, 'guest');
    assert.equal(config.RABBITMQ_PASSWORD, 'guest');
    assert.equal(config.RABBITMQ_VHOST, '/');
    assert.equal(config.RABBITMQ_HEARTBEAT_SEC, 60);
    assert.equal(config.RABBITMQ_PREFETCH, 10);
    assert.equal(config.RABBITMQ_DISPATCH_INTERVAL_MS, 5000);
    assert.equal(config.RABBITMQ_CONNECT_TIMEOUT_MS, 5000);
    assert.equal(config.RABBITMQ_MANDATORY_TIMEOUT_MS, 5000);
    assert.equal(config.METRICS_ENABLED, true);
    assert.equal(config.METRICS_AUTH_TOKEN, undefined);
  });

  it('should accept custom Redis configuration', () => {
    const config = validateConfig({
      NODE_ENV: 'test',
      REDIS_ENABLED: 'false',
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      REDIS_PASSWORD: 'secret-redis-pwd',
      REDIS_DB: '2',
      REDIS_CONNECT_TIMEOUT_MS: '10000'
    });

    assert.equal(config.REDIS_ENABLED, false);
    assert.equal(config.REDIS_HOST, 'redis.internal');
    assert.equal(config.REDIS_PORT, 6380);
    assert.equal(config.REDIS_PASSWORD, 'secret-redis-pwd');
    assert.equal(config.REDIS_DB, 2);
    assert.equal(config.REDIS_CONNECT_TIMEOUT_MS, 10000);
  });

  it('should reject invalid REDIS_PORT values', () => {
    assert.throws(
      () => {
        validateConfig({
          REDIS_PORT: 'not-a-number'
        });
      },
      {
        message: /Environment configuration validation failed/
      }
    );
  });

  it('should reject invalid REDIS_DB values', () => {
    assert.throws(
      () => {
        validateConfig({
          REDIS_DB: '99'
        });
      },
      {
        message: /Environment configuration validation failed/
      }
    );
  });

  it('should reject invalid PORT values', () => {
    assert.throws(
      () => {
        validateConfig({
          PORT: 'not-a-number'
        });
      },
      {
        message: /Environment configuration validation failed/
      }
    );
  });

  it('should reject invalid NODE_ENV values', () => {
    assert.throws(
      () => {
        validateConfig({
          NODE_ENV: 'invalid-environment'
        });
      },
      {
        message: /Environment configuration validation failed/
      }
    );
  });

  it('should freeze the returned config object preventing mutation', () => {
    const config = validateConfig({ NODE_ENV: 'test' });
    assert.ok(Object.isFrozen(config));
  });
});
