import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../../src/config/env.js';

describe('RabbitMQ Configuration Validation', () => {
  it('should apply correct default RabbitMQ configuration', () => {
    const config = validateConfig({
      NODE_ENV: 'test'
    });

    assert.equal(config.RABBITMQ_ENABLED, true);
    assert.equal(config.RABBITMQ_URL, undefined);
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
  });

  it('should accept custom individual parameters', () => {
    const config = validateConfig({
      NODE_ENV: 'test',
      RABBITMQ_ENABLED: 'false',
      RABBITMQ_HOST: 'rabbit.internal',
      RABBITMQ_PORT: '5673',
      RABBITMQ_USER: 'admin',
      RABBITMQ_PASSWORD: 'secretpassword',
      RABBITMQ_VHOST: '/exams',
      RABBITMQ_HEARTBEAT_SEC: '30',
      RABBITMQ_PREFETCH: '25',
      RABBITMQ_DISPATCH_INTERVAL_MS: '2000',
      RABBITMQ_CONNECT_TIMEOUT_MS: '3000',
      RABBITMQ_MANDATORY_TIMEOUT_MS: '8000'
    });

    assert.equal(config.RABBITMQ_ENABLED, false);
    assert.equal(config.RABBITMQ_HOST, 'rabbit.internal');
    assert.equal(config.RABBITMQ_PORT, 5673);
    assert.equal(config.RABBITMQ_USER, 'admin');
    assert.equal(config.RABBITMQ_PASSWORD, 'secretpassword');
    assert.equal(config.RABBITMQ_VHOST, '/exams');
    assert.equal(config.RABBITMQ_HEARTBEAT_SEC, 30);
    assert.equal(config.RABBITMQ_PREFETCH, 25);
    assert.equal(config.RABBITMQ_DISPATCH_INTERVAL_MS, 2000);
    assert.equal(config.RABBITMQ_CONNECT_TIMEOUT_MS, 3000);
    assert.equal(config.RABBITMQ_MANDATORY_TIMEOUT_MS, 8000);
  });

  it('should accept a valid RABBITMQ_URL with amqp scheme', () => {
    const config = validateConfig({
      NODE_ENV: 'test',
      RABBITMQ_URL: 'amqp://custom-user:custom-pass@rabbit-cluster:5672/vhost'
    });

    assert.equal(config.RABBITMQ_URL, 'amqp://custom-user:custom-pass@rabbit-cluster:5672/vhost');
  });

  it('should accept a valid RABBITMQ_URL with amqps secure scheme', () => {
    const config = validateConfig({
      NODE_ENV: 'test',
      RABBITMQ_URL: 'amqps://secure-user:secure-pass@rabbit-tls:5671/secure-vhost'
    });

    assert.equal(config.RABBITMQ_URL, 'amqps://secure-user:secure-pass@rabbit-tls:5671/secure-vhost');
  });

  it('should reject RABBITMQ_URL with non-amqp scheme', () => {
    assert.throws(
      () => {
        validateConfig({
          NODE_ENV: 'test',
          RABBITMQ_URL: 'http://localhost:5672'
        });
      },
      {
        message: /Environment configuration validation failed/
      }
    );
  });

  it('should reject malformed RABBITMQ_URL', () => {
    assert.throws(
      () => {
        validateConfig({
          NODE_ENV: 'test',
          RABBITMQ_URL: 'not-a-valid-url'
        });
      },
      {
        message: /Environment configuration validation failed/
      }
    );
  });

  it('should reject invalid RABBITMQ_PORT', () => {
    assert.throws(
      () => {
        validateConfig({
          NODE_ENV: 'test',
          RABBITMQ_PORT: 'invalid-port'
        });
      },
      {
        message: /Environment configuration validation failed/
      }
    );
  });

  it('should coerce boolean and string variants for RABBITMQ_ENABLED', () => {
    assert.equal(validateConfig({ NODE_ENV: 'test', RABBITMQ_ENABLED: 'true' }).RABBITMQ_ENABLED, true);
    assert.equal(validateConfig({ NODE_ENV: 'test', RABBITMQ_ENABLED: '1' }).RABBITMQ_ENABLED, true);
    assert.equal(validateConfig({ NODE_ENV: 'test', RABBITMQ_ENABLED: true }).RABBITMQ_ENABLED, true);
    assert.equal(validateConfig({ NODE_ENV: 'test', RABBITMQ_ENABLED: 'false' }).RABBITMQ_ENABLED, false);
    assert.equal(validateConfig({ NODE_ENV: 'test', RABBITMQ_ENABLED: '0' }).RABBITMQ_ENABLED, false);
    assert.equal(validateConfig({ NODE_ENV: 'test', RABBITMQ_ENABLED: false }).RABBITMQ_ENABLED, false);
  });
});
