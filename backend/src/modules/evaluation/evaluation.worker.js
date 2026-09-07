/**
 * @file evaluation.worker.js
 * @description Decoupled Evaluation Worker consumer handling ATTEMPT_SUBMITTED domain events.
 * Conforms to Step 13.5, 13.7, and Phase 8 specifications.
 */

import { logger } from '../../utils/logger.js';
import * as evaluationRepo from './evaluation.repository.js';
import { evaluateAttempt } from './evaluation.service.js';

export class EvaluationWorker {
  /**
   * Handles an outbox event.
   * Extracts routing context, verifies idempotency against results table,
   * and triggers the objective evaluation service.
   *
   * @param {object} event - Domain outbox event
   * @returns {Promise<object>} Evaluation outcome
   */
  async handle(event) {
    const attemptId = event?.payload?.attempt_id || event?.aggregate_id;
    if (!attemptId) {
      throw new Error(`EvaluationWorker: Missing attempt_id in event ${event?.event_id}`);
    }

    logger.info(
      { eventId: event.event_id, attemptId, eventType: event.event_type },
      'EvaluationWorker processing event'
    );

    // 1. Post-result-insert crash idempotency check:
    // If results row already exists, the business scoring effect was already applied.
    const existingResult = await evaluationRepo.findResultByAttemptId(attemptId);
    if (existingResult) {
      logger.info(
        { attemptId, eventId: event.event_id, resultId: existingResult.result_id },
        'Result already exists for attempt; skipping re-evaluation (idempotent)'
      );
      return { alreadyEvaluated: true, result: existingResult };
    }

    // 2. Perform authoritative evaluation
    const result = await evaluateAttempt(attemptId);
    return { alreadyEvaluated: false, result };
  }
}

export const evaluationWorker = new EvaluationWorker();
