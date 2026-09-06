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
