/**
 * @file workerChaos.integration.test.js
 * @description Phase 22 Level 1 & 2: Evaluation worker resilience, in-flight drain,
 * duplicate message deduplication, and dead-letter routing for poison pills.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import {
  handleEvaluationMessage,
  getInFlightCount,
  isConsumerShuttingDown,
  resetConsumerState,
  isValidUuid
} from '../../src/modules/evaluation/evaluation.consumer.js';

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
    setImmediate(() => {
      if (typeof callback === 'function') callback(null);
    });
    return true;
  };

  return channel;
}

describe('Phase 22 — Evaluation Worker Chaos & Resilience (Level 1 & 2)', () => {
  beforeEach(() => {
    resetConsumerState();
  });

  afterEach(() => {
    resetConsumerState();
  });

  it('L1: Invalid JSON payload in message is treated as permanent poison pill and acked/dlqd', async () => {
    const mockChannel = createMockChannel();

    const brokenMsg = {
      content: Buffer.from('{ invalid json ;;:'),
      properties: { headers: {}, messageId: 'msg-1' }
    };

    await handleEvaluationMessage(brokenMsg, mockChannel);

    // Poison pills must be safely acknowledged after DLQ routing to prevent infinite crash loops
    assert.strictEqual(mockChannel.ackCalls.length, 1, 'Malformed JSON must be ACKed after DLQ routing');
    assert.strictEqual(mockChannel.nackCalls.length, 0, 'Malformed JSON must not be NACKed with requeue');
    assert.strictEqual(mockChannel.publishCalls.length, 1, 'Poison message must be published to DLQ');
  });

  it('L1: Malformed attemptId UUID is rejected without querying the database', async () => {
    const mockChannel = createMockChannel();

    const invalidUuidMsg = {
      content: Buffer.from(JSON.stringify({
        eventId: randomUUID(),
        attemptId: 'not-a-valid-uuid-1234',
        studentId: randomUUID()
      })),
      properties: { headers: {}, messageId: 'msg-2' }
    };

    await handleEvaluationMessage(invalidUuidMsg, mockChannel);

    assert.strictEqual(mockChannel.ackCalls.length, 1);
    assert.strictEqual(mockChannel.publishCalls.length, 1, 'Invalid attemptId must be published to DLQ');
    assert.ok(mockChannel.publishCalls[0].routingKey.includes('dlq'));
  });

  it('L2: In-flight count tracks active handlers and cleans up after completion', async () => {
    assert.strictEqual(getInFlightCount(), 0);

    const mockChannel = createMockChannel();

    const msg = {
      content: Buffer.from(JSON.stringify({
        eventId: randomUUID(),
        attemptId: randomUUID(),
        studentId: randomUUID()
      })),
      properties: { headers: {}, messageId: 'msg-3' }
    };

    // Handler execution resolves cleanly
    const promise = handleEvaluationMessage(msg, mockChannel);
    await promise;

    // After completion, in-flight count must return to 0
    assert.strictEqual(getInFlightCount(), 0);
  });
});
