import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  handleEvaluationMessage,
  isValidUuid,
  isTransientError,
  getInFlightCount,
  isConsumerShuttingDown,
  getActiveConsumerInfo,
  stopEvaluationConsumer,
  restoreEvaluationConsumer,
  resetConsumerState
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

  describe('In-Flight Tracking & Graceful Shutdown Drain', () => {
    beforeEach(() => {
      resetConsumerState();
    });

    afterEach(async () => {
      await stopEvaluationConsumer({ maxDrainMs: 50 });
      resetConsumerState();
    });

    it('should track in-flight count during message handling and decrement on completion', async () => {
      const channel = createMockChannel();
      const attemptId = 'a1aae9f3-285e-4ff6-8a9b-123aa7dc74e1';
      let inFlightDuringWork = -1;

      const mockWorker = {
        evaluateAttempt: async () => {
          inFlightDuringWork = getInFlightCount();
          return { result_id: 'res-inflight-1' };
        }
      };
      const mockRepo = {
        findResultByAttemptId: async () => null
      };

      const msg = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          id: 'msg-inflight-1',
          data: { attemptId }
        })),
        properties: { messageId: 'msg-inflight-1' }
      };

      assert.equal(getInFlightCount(), 0);
      await handleEvaluationMessage(msg, channel, mockWorker, mockRepo);

      assert.equal(inFlightDuringWork, 1);
      assert.equal(getInFlightCount(), 0);
      assert.equal(channel.ackCalls.length, 1);
    });

    it('should wait for active in-flight handlers during stopEvaluationConsumer before closing channel', async () => {
      const channel = createMockChannel();
      channel.prefetch = async () => {};
      channel.assertExchange = async () => {};
      channel.assertQueue = async () => {};
      channel.bindQueue = async () => {};
      channel.cancel = async () => { channel.cancelled = true; };
      channel.close = async () => { channel.closed = true; };
      channel.consume = async () => ({ consumerTag: 'tag-drain-1' });

      await restoreEvaluationConsumer(null, channel);

      const attemptId = 'b2bbe9f3-285e-4ff6-8a9b-123aa7dc74e2';
      let workCompleted = false;

      const mockWorker = {
        evaluateAttempt: async () => {
          await new Promise((r) => setTimeout(r, 60));
          workCompleted = true;
          return { result_id: 'res-drain-1' };
        }
      };
      const mockRepo = {
        findResultByAttemptId: async () => null
      };

      const msg = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          id: 'msg-drain-1',
          data: { attemptId }
        })),
        properties: { messageId: 'msg-drain-1' }
      };

      // Start processing asynchronously
      const handlePromise = handleEvaluationMessage(msg, channel, mockWorker, mockRepo);

      // Verify in-flight count is 1
      assert.equal(getInFlightCount(), 1);

      // Stop consumer and drain
      const drainResult = await stopEvaluationConsumer({ maxDrainMs: 500 });

      assert.equal(drainResult.drained, true);
      assert.equal(drainResult.remainingCount, 0);
      assert.equal(workCompleted, true);
      assert.equal(channel.ackCalls.length, 1);
      assert.equal(channel.closed, true);

      await handlePromise;
    });

    it('should enforce drain timeout when a handler hangs, proceeding with shutdown without unearned ACK', async () => {
      const channel = createMockChannel();
      channel.prefetch = async () => {};
      channel.assertExchange = async () => {};
      channel.assertQueue = async () => {};
      channel.bindQueue = async () => {};
      channel.cancel = async () => { channel.cancelled = true; };
      channel.close = async () => { channel.closed = true; };
      channel.consume = async () => ({ consumerTag: 'tag-drain-hang' });

      await restoreEvaluationConsumer(null, channel);

      const attemptId = 'c3cce9f3-285e-4ff6-8a9b-123aa7dc74e3';

      let finishHangingWork;
      const mockWorker = {
        evaluateAttempt: async () => {
          await new Promise((r) => { finishHangingWork = r; });
          return { result_id: 'res-hang-1' };
        }
      };
      const mockRepo = {
        findResultByAttemptId: async () => null
      };

      const msg = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          id: 'msg-hang-1',
          data: { attemptId }
        })),
        properties: { messageId: 'msg-hang-1' }
      };

      // Launch hanging handler
      const handlePromise = handleEvaluationMessage(msg, channel, mockWorker, mockRepo);
      assert.equal(getInFlightCount(), 1);

      // Stop consumer with small drain timeout (50ms)
      const drainResult = await stopEvaluationConsumer({ maxDrainMs: 50 });

      assert.equal(drainResult.drained, false);
      assert.equal(drainResult.remainingCount, 1);
      // Crucial: unfinished work MUST NOT have been acknowledged
      assert.equal(channel.ackCalls.length, 0);
      assert.equal(channel.closed, true);

      // Cleanup hanging promise
      finishHangingWork();
      await handlePromise.catch(() => {});
    });

    it('should reject new incoming deliveries when isConsumerShuttingDown is true', async () => {
      const channel = createMockChannel();
      await stopEvaluationConsumer({ maxDrainMs: 10 });

      assert.equal(isConsumerShuttingDown(), true);

      let workerCalled = false;
      const mockWorker = {
        evaluateAttempt: async () => {
          workerCalled = true;
          return {};
        }
      };

      const msg = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          id: 'msg-during-shutdown',
          data: { attemptId: 'd4dde9f3-285e-4ff6-8a9b-123aa7dc74e4' }
        })),
        properties: { messageId: 'msg-during-shutdown' }
      };

      await handleEvaluationMessage(msg, channel, mockWorker);

      assert.equal(workerCalled, false);
      assert.equal(channel.ackCalls.length, 0);
    });

    it('should restore consumer idempotently without creating duplicate consumers', async () => {
      const channel1 = createMockChannel();
      channel1.prefetch = async () => {};
      channel1.assertExchange = async () => {};
      channel1.assertQueue = async () => {};
      channel1.bindQueue = async () => {};
      channel1.cancel = async () => { channel1.cancelled = true; };
      channel1.close = async () => { channel1.closed = true; };
      let consumeCount1 = 0;
      channel1.consume = async (q, fn, opts) => {
        consumeCount1 += 1;
        return { consumerTag: 'tag-channel-1' };
      };

      const channel2 = createMockChannel();
      channel2.prefetch = async () => {};
      channel2.assertExchange = async () => {};
      channel2.assertQueue = async () => {};
      channel2.bindQueue = async () => {};
      channel2.cancel = async () => { channel2.cancelled = true; };
      channel2.close = async () => { channel2.closed = true; };
      let consumeCount2 = 0;
      channel2.consume = async (q, fn, opts) => {
        consumeCount2 += 1;
        return { consumerTag: 'tag-channel-2' };
      };

      // 1. Initial restore on channel 1
      const res1 = await restoreEvaluationConsumer(null, channel1);
      assert.equal(res1.consumerTag, 'tag-channel-1');
      assert.equal(consumeCount1, 1);

      // 2. Second restore on channel 2 (e.g. after reconnect)
      const res2 = await restoreEvaluationConsumer(null, channel2);
      assert.equal(res2.consumerTag, 'tag-channel-2');
      assert.equal(consumeCount2, 1);

      // Crucial: previous channel1 was cancelled and closed
      assert.equal(channel1.cancelled, true);
      assert.equal(channel1.closed, true);

      // Clean up
      await stopEvaluationConsumer({ maxDrainMs: 50 });
      assert.equal(channel2.cancelled, true);
      assert.equal(channel2.closed, true);
    });
  });
});
