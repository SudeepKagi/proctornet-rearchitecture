/**
 * @file outbox.transport.js
 * @description Event Transport abstraction decoupling outbox dispatching from underlying message brokers.
 * Conforms to Step 13.5 and Step 13.17 specifications.
 */

import { publishConfirmed, createConfirmChannel } from '../../infrastructure/rabbitmq/client.js';

/**
 * @abstract
 * Base EventTransport class.
 */
export class EventTransport {
  /**
   * Publishes an event to the downstream transport.
   * @param {object} event - The outbox event record
   * @returns {Promise<void>}
   */
  async publish(event) {
    throw new Error('publish() must be implemented by concrete EventTransport subclass');
  }
}

/**
 * Phase 8 In-Process Event Transport.
 * Directly invokes the EvaluationWorker locally and awaits completion before resolving.
 * In Phase 12, this will be replaced by RabbitMQEventTransport without changing worker logic.
 */
export class InProcessEventTransport extends EventTransport {
  /**
   * @param {object} evaluationWorker - Instance of EvaluationWorker
   */
  constructor(evaluationWorker) {
    super();
    this.evaluationWorker = evaluationWorker;
  }

  /**
   * Publishes an outbox event.
   * Awaits worker completion so that worker exceptions propagate back to the dispatcher for retry handling.
   *
   * @param {object} event
   * @returns {Promise<void>}
   */
  async publish(event) {
    if (event.event_type === 'ATTEMPT_SUBMITTED') {
      if (!this.evaluationWorker || typeof this.evaluationWorker.handle !== 'function') {
        throw new Error('InProcessEventTransport: evaluationWorker is not properly configured');
      }
      // Strictly await worker completion:
      // publish() resolves ONLY after worker successfully handles evaluation and commits result
      await this.evaluationWorker.handle(event);
    }
  }
}

/**
 * Phase 12 RabbitMQ Event Transport.
 * Publishes events to RabbitMQ exchange using mandatory publishConfirmed on ConfirmChannel.
 * Resolves only when confirmed by the broker AND verified not returned as unroutable.
 * Rejects if broker rejects (nack), unroutable return occurs, channel drops, or timeout expires.
 */
export class RabbitMQEventTransport extends EventTransport {
  /**
   * @param {object} [channelProvider] - Object providing getConfirmChannel() or createConfirmChannel()
   * @param {object} [options]
   */
  constructor(channelProvider, options = {}) {
    super();
    this.channelProvider = channelProvider;
    this.exchange = options.exchange || 'proctornet.events';
    this.routingKey = options.routingKey || 'attempt.submitted';
    this.cachedChannel = null;
  }

  /**
   * Obtains an active ConfirmChannel, creating or recovering on reconnect as necessary.
   * @returns {Promise<import('amqplib').ConfirmChannel>}
   */
  async getChannel() {
    if (this.channelProvider && typeof this.channelProvider.getConfirmChannel === 'function') {
      return this.channelProvider.getConfirmChannel();
    }
    if (this.channelProvider && typeof this.channelProvider.createConfirmChannel === 'function') {
      return this.channelProvider.createConfirmChannel();
    }
    if (this.channelProvider && typeof this.channelProvider.publishConfirmed === 'function') {
      return this.channelProvider;
    }

    if (this.cachedChannel && !this.cachedChannel.closed) {
      return this.cachedChannel;
    }

    const channel = await createConfirmChannel();
    this.cachedChannel = channel;

    channel.once('close', () => {
      if (this.cachedChannel === channel) {
        this.cachedChannel = null;
      }
    });

    channel.once('error', () => {
      if (this.cachedChannel === channel) {
        this.cachedChannel = null;
      }
    });

    return channel;
  }

  /**
   * Formats the event into a CloudEvents-compliant envelope.
   * @param {object} event
   * @returns {object}
   */
  formatEnvelope(event) {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    return {
      specversion: '1.0',
      id: event.event_id,
      source: 'proctornet.submissions',
      type: event.event_type,
      time: event.created_at ? new Date(event.created_at).toISOString() : new Date().toISOString(),
      datacontenttype: 'application/json',
      data: payload
    };
  }

  /**
   * Publishes an outbox event.
   * @param {object} event
   * @returns {Promise<{ published: boolean, messageId: string }>}
   */
  async publish(event) {
    const channel = await this.getChannel();

    const envelope = this.formatEnvelope(event);
    const content = Buffer.from(JSON.stringify(envelope));
    const messageId = event.event_id;

    return publishConfirmed(channel, this.exchange, this.routingKey, content, {
      messageId,
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      timestamp: Math.floor(new Date(event.created_at || Date.now()).getTime() / 1000),
      headers: {
        'x-retry-attempt': 0,
        'x-correlation-id': event.event_id
      }
    });
  }
}
