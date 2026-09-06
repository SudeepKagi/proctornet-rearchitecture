/**
 * @file examStateMachine.js
 * @description Pure deterministic state machine for the Exam lifecycle.
 * Free of external I/O, database access, or framework dependencies.
 */

import { ExamStatus, EXAM_TRANSITIONS, isValidExamStatus } from './examStates.js';
import { InvalidStateTransitionError, DomainInvariantError } from '../shared/domainErrors.js';

/**
 * Returns the array of allowed target states from the current state.
 * @param {string} currentState
 * @returns {readonly string[]}
 * @throws {DomainInvariantError} If currentState is not a recognized status
 */
export function getNextAllowedExamStates(currentState) {
  if (!isValidExamStatus(currentState)) {
    throw new DomainInvariantError('Exam', `Unknown or invalid current state: '${currentState}'`);
  }
  return EXAM_TRANSITIONS[currentState] || Object.freeze([]);
}

/**
 * Checks whether a requested state transition for an Exam is legal.
 * @param {string} currentState
 * @param {string} requestedState
 * @returns {boolean}
 */
export function canTransitionExam(currentState, requestedState) {
  if (!isValidExamStatus(currentState) || !isValidExamStatus(requestedState)) {
    return false;
  }
  const allowed = EXAM_TRANSITIONS[currentState];
  return Boolean(allowed && allowed.includes(requestedState));
}

/**
 * Executes a deterministic state transition for an Exam.
 * @param {string} currentState - Current state of the exam
 * @param {string} requestedState - Target state to transition into
 * @returns {string} The new resulting ExamStatus
 * @throws {DomainInvariantError} If either status is unrecognized
 * @throws {InvalidStateTransitionError} If the transition is illegal
 */
export function transitionExamState(currentState, requestedState) {
  if (!isValidExamStatus(currentState)) {
    throw new DomainInvariantError('Exam', `Cannot transition from invalid current state: '${currentState}'`);
  }

  if (!isValidExamStatus(requestedState)) {
    throw new DomainInvariantError('Exam', `Cannot transition to invalid target state: '${requestedState}'`);
  }

  const allowed = EXAM_TRANSITIONS[currentState] || [];

  if (!allowed.includes(requestedState)) {
    throw new InvalidStateTransitionError('Exam', currentState, requestedState, allowed);
  }

  return requestedState;
}
