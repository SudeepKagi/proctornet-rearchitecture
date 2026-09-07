/**
 * @file outbox.transport.js
 * @description Event Transport abstraction decoupling outbox dispatching from underlying message brokers.
 * Conforms to Step 13.5 and Step 13.17 specifications.
 */

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
