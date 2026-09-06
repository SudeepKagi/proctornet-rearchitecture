/**
 * @file attemptInvariants.js
 * @description Domain invariant validators and business assertions for Exam Attempts.
 */

import { AttemptStatus, isValidAttemptStatus, isAttemptTerminal } from './attemptStates.js';
import { DomainInvariantError } from '../shared/domainErrors.js';

/**
 * Validates the core business invariant attributes of an Exam Attempt.
 * @param {object} attempt
 * @param {string} attempt.session_id
 * @param {string} attempt.student_id
 * @param {string} attempt.status
 * @param {Date|string|number} attempt.expires_at
 * @param {Date|string|number} [attempt.started_at]
 * @param {Date|string|number} [attempt.submitted_at]
 * @throws {DomainInvariantError} If any invariant is violated
 */
export function validateAttemptInvariants(attempt) {
  if (!attempt || typeof attempt !== 'object') {
    throw new DomainInvariantError('ExamAttempt', 'Attempt data must be a non-null object');
  }

  if (typeof attempt.session_id !== 'string' || attempt.session_id.trim().length === 0) {
    throw new DomainInvariantError('ExamAttempt', 'Attempt must be associated with a valid session_id', { session_id: attempt.session_id });
  }

  if (typeof attempt.student_id !== 'string' || attempt.student_id.trim().length === 0) {
    throw new DomainInvariantError('ExamAttempt', 'Attempt must be associated with a valid student_id', { student_id: attempt.student_id });
  }

  if (!isValidAttemptStatus(attempt.status)) {
    throw new DomainInvariantError('ExamAttempt', `Invalid attempt status: '${attempt.status}'`, { status: attempt.status });
  }

  const expiresTime = attempt.expires_at instanceof Date ? attempt.expires_at.getTime() : new Date(attempt.expires_at).getTime();
  if (Number.isNaN(expiresTime)) {
    throw new DomainInvariantError('ExamAttempt', 'Attempt expires_at must be a valid timestamp', { expires_at: attempt.expires_at });
  }

  if (attempt.started_at) {
    const startedTime = attempt.started_at instanceof Date ? attempt.started_at.getTime() : new Date(attempt.started_at).getTime();
    if (Number.isNaN(startedTime)) {
      throw new DomainInvariantError('ExamAttempt', 'Attempt started_at must be a valid timestamp', { started_at: attempt.started_at });
    }
    if (startedTime > expiresTime) {
      throw new DomainInvariantError(
        'ExamAttempt',
        'Attempt started_at timestamp cannot be after expires_at timestamp',
        { started_at: attempt.started_at, expires_at: attempt.expires_at }
      );
    }
  }

  if (attempt.status === AttemptStatus.SUBMITTED && !attempt.submitted_at) {
    throw new DomainInvariantError('ExamAttempt', 'Submitted attempt must have a valid submitted_at timestamp');
  }
}

/**
 * Asserts that an Exam Attempt is in an active state capable of accepting answer updates.
 * Invariant: Answers can only be saved/autosaved when the attempt is in ACTIVE status.
 * Attempts in READY, SUBMITTED, TERMINATED, or EXPIRED states must reject answer modifications.
 * @param {string} status - Current AttemptStatus
 * @throws {DomainInvariantError} If the attempt is not ACTIVE
 */
export function assertAttemptCanAcceptAnswers(status) {
  if (status !== AttemptStatus.ACTIVE) {
    let reason = `Attempt is in '${status}' state.`;
    if (isAttemptTerminal(status)) {
      reason += ' The attempt is finalized and no further answer changes can be submitted.';
    } else if (status === AttemptStatus.READY) {
      reason += ' The attempt has not yet been started.';
    }

    throw new DomainInvariantError(
      'ExamAttempt',
      `Cannot save or modify answers: ${reason}`,
      { currentStatus: status, requiredStatus: AttemptStatus.ACTIVE }
    );
  }
}
