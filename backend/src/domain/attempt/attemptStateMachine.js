/**
 * @file attemptStateMachine.js
 * @description Pure deterministic state machine for the Exam Attempt lifecycle.
 * Free of external I/O, database access, or framework dependencies.
 */

import { AttemptStatus, ATTEMPT_TRANSITIONS, isValidAttemptStatus, isAttemptTerminal } from './attemptStates.js';
import { InvalidStateTransitionError, DomainInvariantError } from '../shared/domainErrors.js';

/**
 * Returns the array of allowed target states from the current Attempt state.
 * @param {string} currentState
 * @returns {readonly string[]}
 * @throws {DomainInvariantError} If currentState is not a recognized status
 */
export function getNextAllowedAttemptStates(currentState) {
  if (!isValidAttemptStatus(currentState)) {
    throw new DomainInvariantError('ExamAttempt', `Unknown or invalid current state: '${currentState}'`);
  }
  return ATTEMPT_TRANSITIONS[currentState] || Object.freeze([]);
}

/**
 * Checks whether a requested state transition for an Exam Attempt is legal.
 * @param {string} currentState
 * @param {string} requestedState
 * @returns {boolean}
 */
export function canTransitionAttempt(currentState, requestedState) {
  if (!isValidAttemptStatus(currentState) || !isValidAttemptStatus(requestedState)) {
    return false;
  }
  const allowed = ATTEMPT_TRANSITIONS[currentState];
  return Boolean(allowed && allowed.includes(requestedState));
}

/**
 * Executes a deterministic state transition for an Exam Attempt.
 * @param {string} currentState - Current state of the attempt
 * @param {string} requestedState - Target state to transition into
 * @returns {string} The new resulting AttemptStatus
 * @throws {DomainInvariantError} If either status is unrecognized
 * @throws {InvalidStateTransitionError} If the transition is illegal
 */
export function transitionAttemptState(currentState, requestedState) {
  if (!isValidAttemptStatus(currentState)) {
    throw new DomainInvariantError('ExamAttempt', `Cannot transition from invalid current state: '${currentState}'`);
  }

  if (!isValidAttemptStatus(requestedState)) {
    throw new DomainInvariantError('ExamAttempt', `Cannot transition to invalid target state: '${requestedState}'`);
  }

  if (isAttemptTerminal(currentState)) {
    throw new InvalidStateTransitionError('ExamAttempt', currentState, requestedState, []);
  }

  const allowed = ATTEMPT_TRANSITIONS[currentState] || [];

  if (!allowed.includes(requestedState)) {
    throw new InvalidStateTransitionError('ExamAttempt', currentState, requestedState, allowed);
  }

  return requestedState;
}
