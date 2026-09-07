import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { RabbitMQEventTransport } from '../../src/modules/outbox/outbox.transport.js';

describe('RabbitMQEventTransport Unit Tests', () => {
  function createMockChannel() {
    const channel = new EventEmitter();
    channel.publishCalls = [];
    channel.publish = function (exchange, routingKey, content, options, callback) {
      channel.publishCalls.push({ exchange, routingKey, content, options, callback });
    };
    return channel;
  }

  it('should correctly format CloudEvents envelope', () => {
    const transport = new RabbitMQEventTransport();
    const event = {
      event_id: 'evt-12345',
      event_type: 'ATTEMPT_SUBMITTED',
      created_at: new Date('2026-09-07T12:00:00Z'),
      payload: JSON.stringify({
        attemptId: 'att-999',
        studentId: 'stu-888'
      })
    };

    const envelope = transport.formatEnvelope(event);

    assert.equal(envelope.specversion, '1.0');
    assert.equal(envelope.id, 'evt-12345');
    assert.equal(envelope.source, 'proctornet.submissions');
    assert.equal(envelope.type, 'ATTEMPT_SUBMITTED');
    assert.equal(envelope.time, '2026-09-07T12:00:00.000Z');
    assert.equal(envelope.datacontenttype, 'application/json');
    assert.deepEqual(envelope.data, {
      attemptId: 'att-999',
      studentId: 'stu-888'
    });
  });

  it('should publish with mandatory: true and messageId correlation', async () => {
    const mockChannel = createMockChannel();
    const channelProvider = {
      getConfirmChannel() {
        return mockChannel;
      }
    };

    const transport = new RabbitMQEventTransport(channelProvider, {
      exchange: 'proctornet.events',
      routingKey: 'attempt.submitted'
    });

    const event = {
      event_id: 'evt-corr-1',
      event_type: 'ATTEMPT_SUBMITTED',
      created_at: new Date('2026-09-07T12:00:00Z'),
      payload: { attemptId: 'att-1' }
    };

    const publishPromise = transport.publish(event);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(mockChannel.publishCalls.length, 1);
    const call = mockChannel.publishCalls[0];
    assert.equal(call.exchange, 'proctornet.events');
    assert.equal(call.routingKey, 'attempt.submitted');
    assert.equal(call.options.mandatory, true);
    assert.equal(call.options.persistent, true);
    assert.equal(call.options.messageId, 'evt-corr-1');
    assert.equal(call.options.headers['x-retry-attempt'], 0);

    // Simulate successful broker ack
    call.callback(null);

    const result = await publishPromise;
    assert.deepEqual(result, { published: true, messageId: 'evt-corr-1' });
  });

  it('should reject publish when broker emits return event for unroutable message', async () => {
    const mockChannel = createMockChannel();
    const channelProvider = {
      getConfirmChannel() {
        return mockChannel;
      }
    };

    const transport = new RabbitMQEventTransport(channelProvider);
    const event = {
      event_id: 'evt-unroutable',
      event_type: 'ATTEMPT_SUBMITTED',
      payload: { attemptId: 'att-unroutable' }
    };

    const publishPromise = transport.publish(event);
    await new Promise((resolve) => setImmediate(resolve));

    // Broker emits return before ack
    mockChannel.emit('return', {
      properties: { messageId: 'evt-unroutable' },
      fields: {
        routingKey: 'attempt.submitted',
        exchange: 'proctornet.events',
        replyCode: 312,
        replyText: 'NO_ROUTE'
      }
    });

    // Callback fires
    mockChannel.publishCalls[0].callback(null);

    await assert.rejects(
      publishPromise,
      /Message unroutable: no matching queue binding for routingKey 'attempt.submitted'/
    );
  });
});
