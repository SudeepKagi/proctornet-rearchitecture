/**
 * @file evaluationStatus.js
 * @description Evaluation job and attempt grading status lifecycle.
 * Models the pure status transitions required for the evaluation pipeline.
 */

import { InvalidStateTransitionError, DomainInvariantError } from '../shared/domainErrors.js';

/**
 * Authoritative Evaluation Status Enum.
 * @readonly
 * @enum {string}
 */
export const EvaluationStatus = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
});

/**
 * All valid Evaluation statuses.
 * @type {readonly string[]}
 */
export const ALL_EVALUATION_STATUSES = Object.freeze(Object.values(EvaluationStatus));

/**
 * Allowed forward transitions for Evaluation lifecycle.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const EVALUATION_TRANSITIONS = Object.freeze({
  [EvaluationStatus.PENDING]: Object.freeze([EvaluationStatus.IN_PROGRESS]),
  [EvaluationStatus.IN_PROGRESS]: Object.freeze([EvaluationStatus.COMPLETED, EvaluationStatus.FAILED]),
  [EvaluationStatus.FAILED]: Object.freeze([EvaluationStatus.IN_PROGRESS]), // Retry support
  [EvaluationStatus.COMPLETED]: Object.freeze([]) // Final result generated
});

/**
 * Checks if a given status string is a recognized EvaluationStatus.
 * @param {string} status
 * @returns {boolean}
 */
export function isValidEvaluationStatus(status) {
  return ALL_EVALUATION_STATUSES.includes(status);
}

/**
 * Checks whether a requested state transition for an Evaluation is legal.
 * @param {string} currentStatus
 * @param {string} requestedStatus
 * @returns {boolean}
 */
export function canTransitionEvaluation(currentStatus, requestedStatus) {
  if (!isValidEvaluationStatus(currentStatus) || !isValidEvaluationStatus(requestedStatus)) {
    return false;
  }
  const allowed = EVALUATION_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.includes(requestedStatus));
}

/**
 * Executes a deterministic state transition for an Evaluation.
 * @param {string} currentStatus - Current evaluation status
 * @param {string} requestedStatus - Target evaluation status
 * @returns {string} The resulting EvaluationStatus
 * @throws {DomainInvariantError} If either status is invalid
 * @throws {InvalidStateTransitionError} If the transition is illegal
 */
export function transitionEvaluationStatus(currentStatus, requestedStatus) {
  if (!isValidEvaluationStatus(currentStatus)) {
    throw new DomainInvariantError('Evaluation', `Invalid current evaluation status: '${currentStatus}'`);
  }

  if (!isValidEvaluationStatus(requestedStatus)) {
    throw new DomainInvariantError('Evaluation', `Invalid target evaluation status: '${requestedStatus}'`);
  }

  const allowed = EVALUATION_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(requestedStatus)) {
    throw new InvalidStateTransitionError('Evaluation', currentStatus, requestedStatus, allowed);
  }

  return requestedStatus;
}
