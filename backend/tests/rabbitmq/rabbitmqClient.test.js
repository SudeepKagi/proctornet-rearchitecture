import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  isTestRunner,
  defaultRetryStrategy,
  getRabbitMQConnectionConfig,
  publishConfirmed,
  checkRabbitMQHealth,
  closeRabbitMQ,
  setRabbitMQConnection
} from '../../src/infrastructure/rabbitmq/client.js';

describe('RabbitMQ Client Lifecycle and Infrastructure', () => {
  afterEach(async () => {
    await closeRabbitMQ();
    setRabbitMQConnection(null);
  });

  describe('isTestRunner Detector', () => {
    it('should detect test runner when nodeEnv is test', () => {
      assert.equal(isTestRunner({ nodeEnv: 'test' }), true);
    });

    it('should detect test runner from execArgv --test', () => {
      assert.equal(isTestRunner({ nodeEnv: 'development', execArgv: ['--test'] }), true);
    });

    it('should detect test runner from argv containing --test', () => {
      assert.equal(isTestRunner({ nodeEnv: 'development', argv: ['node', 'tests/foo.test.js', '--test'] }), true);
    });

    it('should detect test runner from testContext flag', () => {
      assert.equal(isTestRunner({ nodeEnv: 'development', testContext: true }), true);
    });

    it('should return false when no test signals are present', () => {
      assert.equal(isTestRunner({ nodeEnv: 'production', execArgv: [], argv: ['node', 'server.js'], testContext: false }), false);
    });
  });

  describe('defaultRetryStrategy', () => {
    it('should bound retries under test environment to at most 1 attempt', () => {
      assert.equal(defaultRetryStrategy(1, true), 50);
      assert.equal(defaultRetryStrategy(2, true), null);
      assert.equal(defaultRetryStrategy(3, true), null);
    });

    it('should back off exponentially and cap at 5000ms under non-test environment', () => {
      assert.equal(defaultRetryStrategy(1, false), 500);
      assert.equal(defaultRetryStrategy(2, false), 1000);
      assert.equal(defaultRetryStrategy(5, false), 2500);
      assert.equal(defaultRetryStrategy(10, false), 5000);
      assert.equal(defaultRetryStrategy(11, false), null);
    });
  });

  describe('getRabbitMQConnectionConfig URL Precedence', () => {
    it('should prioritize RABBITMQ_URL over individual settings', () => {
      const config = getRabbitMQConnectionConfig({
        RABBITMQ_URL: 'amqp://priority-user:priority-pass@remote-host:5672/priority-vhost',
        RABBITMQ_HOST: 'ignored-host',
        RABBITMQ_PORT: 9999,
        RABBITMQ_USER: 'ignored-user',
        RABBITMQ_PASSWORD: 'ignored-password',
        RABBITMQ_VHOST: '/ignored-vhost'
      });

      assert.equal(config.url, 'amqp://priority-user:priority-pass@remote-host:5672/priority-vhost');
      assert.equal(config.isUrl, true);
    });

    it('should construct amqp connection URL from individual parameters when RABBITMQ_URL is not set', () => {
      const config = getRabbitMQConnectionConfig({
        RABBITMQ_URL: undefined,
        RABBITMQ_HOST: 'local-rabbit',
        RABBITMQ_PORT: 5672,
        RABBITMQ_USER: 'appuser',
        RABBITMQ_PASSWORD: 'apppassword',
        RABBITMQ_VHOST: 'customvhost',
        RABBITMQ_HEARTBEAT_SEC: 60
      });

      assert.equal(config.url, 'amqp://appuser:apppassword@local-rabbit:5672/customvhost');
      assert.equal(config.isUrl, false);
      assert.equal(config.hostname, 'local-rabbit');
      assert.equal(config.port, 5672);
      assert.equal(config.username, 'appuser');
    });
  });

  describe('publishConfirmed Contract Verification', () => {
    function createMockChannel() {
      const channel = new EventEmitter();
      channel.publishCalls = [];
      channel.publish = function (exchange, routingKey, content, options, callback) {
        channel.publishCalls.push({ exchange, routingKey, content, options, callback });
      };
      return channel;
    }

    it('should require options.messageId', async () => {
      const mockChannel = createMockChannel();
      await assert.rejects(
        () => publishConfirmed(mockChannel, 'exchange', 'key', Buffer.from('test'), {}),
        /publishConfirmed requires options.messageId/
      );
    });

    it('should resolve when broker confirms without return event', async () => {
      const mockChannel = createMockChannel();
      const messageId = 'msg-123';

      const publishPromise = publishConfirmed(
        mockChannel,
        'proctornet.events',
        'attempt.submitted',
        Buffer.from('payload'),
        { messageId }
      );

      assert.equal(mockChannel.publishCalls.length, 1);
      const call = mockChannel.publishCalls[0];
      assert.equal(call.options.mandatory, true);
      assert.equal(call.options.persistent, true);
      assert.equal(call.options.messageId, messageId);

      // Simulate successful broker confirmation
      call.callback(null);

      const result = await publishPromise;
      assert.deepEqual(result, { published: true, messageId });
      assert.equal(mockChannel.listenerCount('return'), 0);
      assert.equal(mockChannel.listenerCount('error'), 0);
      assert.equal(mockChannel.listenerCount('close'), 0);
    });

    it('should reject when broker emits return event for unroutable message', async () => {
      const mockChannel = createMockChannel();
      const messageId = 'msg-unroutable-456';

      const publishPromise = publishConfirmed(
        mockChannel,
        'proctornet.events',
        'unbound.key',
        Buffer.from('payload'),
        { messageId }
      );

      // Broker emits basic.return before callback
      mockChannel.emit('return', {
        properties: { messageId },
        fields: {
          routingKey: 'unbound.key',
          exchange: 'proctornet.events',
          replyCode: 312,
          replyText: 'NO_ROUTE'
        }
      });

      // Then callback fires with success
      mockChannel.publishCalls[0].callback(null);

      await assert.rejects(
        publishPromise,
        /Message unroutable: no matching queue binding for routingKey 'unbound.key'/
      );
      assert.equal(mockChannel.listenerCount('return'), 0);
    });

    it('should reject when broker sends nack error', async () => {
      const mockChannel = createMockChannel();
      const messageId = 'msg-nack';

      const publishPromise = publishConfirmed(
        mockChannel,
        'proctornet.events',
        'attempt.submitted',
        Buffer.from('payload'),
        { messageId }
      );

      mockChannel.publishCalls[0].callback(new Error('Broker disk full (nack)'));

      await assert.rejects(publishPromise, /Broker disk full \(nack\)/);
      assert.equal(mockChannel.listenerCount('return'), 0);
    });

    it('should reject when channel emits error before confirmation', async () => {
      const mockChannel = createMockChannel();
      const messageId = 'msg-error';

      const publishPromise = publishConfirmed(
        mockChannel,
        'proctornet.events',
        'attempt.submitted',
        Buffer.from('payload'),
        { messageId }
      );

      mockChannel.emit('error', new Error('AMQP channel exception'));

      await assert.rejects(publishPromise, /Channel error during publishConfirmed: AMQP channel exception/);
      assert.equal(mockChannel.listenerCount('return'), 0);
    });

    it('should reject when channel closes before confirmation', async () => {
      const mockChannel = createMockChannel();
      const messageId = 'msg-close';

      const publishPromise = publishConfirmed(
        mockChannel,
        'proctornet.events',
        'attempt.submitted',
        Buffer.from('payload'),
        { messageId }
      );

      mockChannel.emit('close');

      await assert.rejects(publishPromise, /Channel closed before publish confirmation was received/);
      assert.equal(mockChannel.listenerCount('return'), 0);
    });

    it('should reject when timeout expires before broker confirmation', async () => {
      const mockChannel = createMockChannel();
      const messageId = 'msg-timeout';

      const publishPromise = publishConfirmed(
        mockChannel,
        'proctornet.events',
        'attempt.submitted',
        Buffer.from('payload'),
        { messageId, timeoutMs: 50 }
      );

      // Do not call callback; let timeout fire
      await assert.rejects(
        publishPromise,
        /publishConfirmed timed out after 50ms waiting for broker confirm\/return/
      );
      assert.equal(mockChannel.listenerCount('return'), 0);
    });
  });

  describe('checkRabbitMQHealth Probe', () => {
    it('should report DOWN when connection is not established', async () => {
      setRabbitMQConnection(null);
      const health = await checkRabbitMQHealth(500);
      assert.equal(health.healthy, false);
      assert.equal(health.status, 'DOWN');
      assert.match(health.error, /connection not established/);
    });

    it('should report UP when channel creation succeeds', async () => {
      const mockConn = {
        async createChannel() {
          return {
            async close() {}
          };
        }
      };
      setRabbitMQConnection(mockConn);

      const health = await checkRabbitMQHealth(500);
      assert.equal(health.healthy, true);
      assert.equal(health.status, 'UP');
      assert.equal(typeof health.latencyMs, 'number');
    });

    it('should report DOWN when probe times out', async () => {
      const mockConn = {
        async createChannel() {
          return new Promise(() => {}); // Never settles
        }
      };
      setRabbitMQConnection(mockConn);

      const health = await checkRabbitMQHealth(50);
      assert.equal(health.healthy, false);
      assert.equal(health.status, 'DOWN');
      assert.match(health.error, /timeout/);
    });
  });
});
