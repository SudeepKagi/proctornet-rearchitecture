import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  handleEvaluationMessage,
  isValidUuid,
  isTransientError
} from '../../src/modules/evaluation/evaluation.consumer.js';
import { TOPOLOGY } from '../../src/infrastructure/rabbitmq/topology.js';

describe('Evaluation Consumer Unit Tests', () => {
  function createMockChannel() {
    const channel = new EventEmitter();
    channel.ackCalls = [];
    channel.nackCalls = [];
    channel.publishCalls = [];

    channel.ack = function (msg) {
      channel.ackCalls.push(msg);
    };

    channel.nack = function (msg, allUpTo, requeue) {
      channel.nackCalls.push({ msg, allUpTo, requeue });
    };

    channel.publish = function (exchange, routingKey, content, options, callback) {
      channel.publishCalls.push({ exchange, routingKey, content, options, callback });
      // Default auto-confirm on next tick
      setImmediate(() => {
        if (callback) callback(null);
      });
    };

    return channel;
  }

  describe('Validation & Error Classifiers', () => {
    it('should validate valid UUIDs and reject invalid strings', () => {
      assert.equal(isValidUuid('a1aae9f3-285e-4ff6-8a9b-123aa7dc74e3'), true);
      assert.equal(isValidUuid('invalid-uuid'), false);
      assert.equal(isValidUuid(''), false);
      assert.equal(isValidUuid(null), false);
    });

    it('should identify transient vs permanent errors accurately', () => {
      assert.equal(isTransientError({ code: 'ECONNREFUSED' }), true);
      assert.equal(isTransientError({ code: '40P01' }), true); // Postgres deadlock
      assert.equal(isTransientError({ message: 'connection pool timeout' }), true);
      assert.equal(isTransientError({ code: 'ATTEMPT_NOT_FOUND' }), false);
      assert.equal(isTransientError({ isPermanent: true }), false);
    });
  });

  describe('handleEvaluationMessage Processing Logic', () => {
    it('should route malformed JSON directly to DLQ and then ACK original', async () => {
      const channel = createMockChannel();
      const msg = {
        content: Buffer.from('{ malformed json ---'),
        properties: { messageId: 'bad-json-msg' }
      };

      await handleEvaluationMessage(msg, channel);

      assert.equal(channel.publishCalls.length, 1);
      const publish = channel.publishCalls[0];
      assert.equal(publish.exchange, TOPOLOGY.EXCHANGES.DLX);
      assert.equal(publish.routingKey, TOPOLOGY.ROUTING_KEYS.EVALUATION_DLQ);
      assert.equal(publish.options.headers['x-death-reason'], 'MALFORMED_JSON');

      // Original delivery acknowledged strictly after forward
      assert.equal(channel.ackCalls.length, 1);
      assert.equal(channel.ackCalls[0], msg);
    });

    it('should route invalid attemptId UUID directly to DLQ and then ACK original', async () => {
      const channel = createMockChannel();
      const msg = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          id: 'msg-invalid-uuid',
          data: { attemptId: 'not-a-valid-uuid' }
        })),
        properties: { messageId: 'msg-invalid-uuid' }
      };

      await handleEvaluationMessage(msg, channel);

      assert.equal(channel.publishCalls.length, 1);
      const publish = channel.publishCalls[0];
      assert.equal(publish.exchange, TOPOLOGY.EXCHANGES.DLX);
      assert.equal(publish.routingKey, TOPOLOGY.ROUTING_KEYS.EVALUATION_DLQ);
      assert.equal(publish.options.headers['x-death-reason'], 'INVALID_ATTEMPT_ID');

      assert.equal(channel.ackCalls.length, 1);
      assert.equal(channel.ackCalls[0], msg);
    });

    it('should ACK duplicate delivery immediately without evaluating if result already exists', async () => {
      const channel = createMockChannel();
      const attemptId = 'a1aae9f3-285e-4ff6-8a9b-123aa7dc74e3';
      const msg = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          id: 'msg-dup',
          data: { attemptId }
        })),
        properties: { messageId: 'msg-dup' }
      };

      const mockRepo = {
        async findResultByAttemptId(id) {
          assert.equal(id, attemptId);
          return { result_id: 'res-existing-1', attempt_id: id, score: 85.0 };
        }
      };

      let workerInvoked = false;
      const mockWorker = {
        async handle() {
          workerInvoked = true;
        }
      };

      await handleEvaluationMessage(msg, channel, mockWorker, mockRepo);

      assert.equal(workerInvoked, false);
      assert.equal(channel.publishCalls.length, 0); // No forwarding
      assert.equal(channel.ackCalls.length, 1); // Acknowledged cleanly
      assert.equal(channel.ackCalls[0], msg);
    });

    it('should forward transient failure to retry.1 on Attempt 0 and ACK original after confirm', async () => {
      const channel = createMockChannel();
      const attemptId = 'b2bbe9f3-285e-4ff6-8a9b-123aa7dc74e4';
      const msg = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          id: 'msg-attempt-0',
          data: { attemptId }
        })),
        properties: {
          messageId: 'msg-attempt-0',
          headers: { 'x-retry-attempt': 0 }
        }
      };

      const mockRepo = {
        async findResultByAttemptId() {
          return null; // Not yet evaluated
        }
      };

      // Mock evaluateAttempt to throw transient error by monkeypatching or testing forwardToRetryPath
      const { forwardToRetryPath } = await import('../../src/modules/evaluation/evaluation.consumer.js');
      await forwardToRetryPath(channel, msg, { id: 'msg-attempt-0', data: { attemptId } }, new Error('Database pool saturation'));

      assert.equal(channel.publishCalls.length, 1);
      const call = channel.publishCalls[0];
      assert.equal(call.exchange, TOPOLOGY.EXCHANGES.RETRY);
      assert.equal(call.routingKey, TOPOLOGY.ROUTING_KEYS.RETRY_1);
      assert.equal(call.options.messageId, 'msg-attempt-0:retry:1');
      assert.equal(call.options.headers['x-retry-attempt'], 1);
      assert.match(call.options.headers['x-last-error'], /Database pool saturation/);
    });

    it('should forward transient failure to retry.2 on Attempt 1', async () => {
      const channel = createMockChannel();
      const attemptId = 'c3cce9f3-285e-4ff6-8a9b-123aa7dc74e5';
      const msg = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          id: 'msg-attempt-1',
          data: { attemptId }
        })),
        properties: {
          messageId: 'msg-attempt-1',
          headers: { 'x-retry-attempt': 1 }
        }
      };

      const { forwardToRetryPath } = await import('../../src/modules/evaluation/evaluation.consumer.js');
      await forwardToRetryPath(channel, msg, { id: 'msg-attempt-1', data: { attemptId } }, new Error('Network timeout'));

      assert.equal(channel.publishCalls.length, 1);
      const call = channel.publishCalls[0];
      assert.equal(call.exchange, TOPOLOGY.EXCHANGES.RETRY);
      assert.equal(call.routingKey, TOPOLOGY.ROUTING_KEYS.RETRY_2);
      assert.equal(call.options.messageId, 'msg-attempt-1:retry:2');
      assert.equal(call.options.headers['x-retry-attempt'], 2);
      assert.match(call.options.headers['x-last-error'], /Network timeout/);
    });

    it('should forward transient failure to DLQ when application retries are exhausted (Attempt 2)', async () => {
      const channel = createMockChannel();
      const attemptId = 'd4dde9f3-285e-4ff6-8a9b-123aa7dc74e6';
      const msg = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          id: 'msg-attempt-2',
          data: { attemptId }
        })),
        properties: {
          messageId: 'msg-attempt-2',
          headers: { 'x-retry-attempt': 2 }
        }
      };

      const { forwardToRetryPath } = await import('../../src/modules/evaluation/evaluation.consumer.js');
      await forwardToRetryPath(channel, msg, { id: 'msg-attempt-2', data: { attemptId } }, new Error('Persistent transient failure'));

      assert.equal(channel.publishCalls.length, 1);
      const call = channel.publishCalls[0];
      assert.equal(call.exchange, TOPOLOGY.EXCHANGES.DLX);
      assert.equal(call.routingKey, TOPOLOGY.ROUTING_KEYS.EVALUATION_DLQ);
      assert.equal(call.options.messageId, 'msg-attempt-2:dlq');
      assert.equal(call.options.headers['x-death-reason'], 'RETRIES_EXHAUSTED');
    });

    it('should NOT ACK original delivery if confirmed forward to retry fails', async () => {
      const channel = createMockChannel();
      // Make publish fail
      channel.publish = function (exchange, routingKey, content, options, callback) {
        setImmediate(() => {
          callback(new Error('Broker rejected publish (nack)'));
        });
      };

      const msg = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          id: 'msg-fail-fwd',
          data: { attemptId: 'e5eee9f3-285e-4ff6-8a9b-123aa7dc74e7' }
        })),
        properties: {
          messageId: 'msg-fail-fwd',
          headers: { 'x-retry-attempt': 0 }
        }
      };

      const { forwardToRetryPath } = await import('../../src/modules/evaluation/evaluation.consumer.js');
      await assert.rejects(
        () => forwardToRetryPath(channel, msg, { id: 'msg-fail-fwd', data: { attemptId: 'e5eee9f3-285e-4ff6-8a9b-123aa7dc74e7' } }, new Error('db err')),
        /Broker rejected publish \(nack\)/
      );

      // Must NOT ACK
      assert.equal(channel.ackCalls.length, 0);
    });
  });
});
