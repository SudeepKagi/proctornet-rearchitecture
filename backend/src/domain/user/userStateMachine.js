/**
 * @file userStateMachine.js
 * @description Pure deterministic state machine for UserStatus and VerificationStatus lifecycles.
 */

import {
  UserStatus,
  VerificationStatus,
  ALLOWED_USER_STATUS_TRANSITIONS,
  ALLOWED_VERIFICATION_TRANSITIONS
} from './userStates.js';
import { InvalidStateTransitionError, DomainInvariantError } from '../shared/domainErrors.js';

/**
 * Validates whether a given status string is a recognized UserStatus.
 * @param {string} status
 * @returns {boolean}
 */
export function isValidUserStatus(status) {
  return typeof status === 'string' && Object.values(UserStatus).includes(status);
}

/**
 * Validates whether a given verification status string is a recognized VerificationStatus.
 * @param {string} status
 * @returns {boolean}
 */
export function isValidVerificationStatus(status) {
  return typeof status === 'string' && Object.values(VerificationStatus).includes(status);
}

/**
 * Executes a deterministic state transition for an account lifecycle status.
 * @param {string} currentStatus - Current status of the user
 * @param {string} requestedStatus - Target status to transition into
 * @returns {string} The new UserStatus
 * @throws {DomainInvariantError} If either status is unrecognized
 * @throws {InvalidStateTransitionError} If the transition is illegal
 */
export function transitionUserState(currentStatus, requestedStatus) {
  if (!isValidUserStatus(currentStatus)) {
    throw new DomainInvariantError('User', `Cannot transition from invalid current state: '${currentStatus}'`);
  }

  if (!isValidUserStatus(requestedStatus)) {
    throw new DomainInvariantError('User', `Cannot transition to invalid target state: '${requestedStatus}'`);
  }

  if (currentStatus === requestedStatus) {
    return currentStatus; // Idempotent no-op
  }

  const allowedSet = ALLOWED_USER_STATUS_TRANSITIONS[currentStatus];
  const allowed = allowedSet ? Array.from(allowedSet) : [];

  if (!allowedSet || !allowedSet.has(requestedStatus)) {
    throw new InvalidStateTransitionError('User', currentStatus, requestedStatus, allowed);
  }

  return requestedStatus;
}

/**
 * Executes a deterministic state transition for a verification lifecycle status.
 * @param {string} currentStatus - Current verification status of the user
 * @param {string} requestedStatus - Target verification status to transition into
 * @returns {string} The new VerificationStatus
 * @throws {DomainInvariantError} If either status is unrecognized
 * @throws {InvalidStateTransitionError} If the transition is illegal
 */
export function transitionVerificationState(currentStatus, requestedStatus) {
  if (!isValidVerificationStatus(currentStatus)) {
    throw new DomainInvariantError('UserVerification', `Cannot transition from invalid current state: '${currentStatus}'`);
  }

  if (!isValidVerificationStatus(requestedStatus)) {
    throw new DomainInvariantError('UserVerification', `Cannot transition to invalid target state: '${requestedStatus}'`);
  }

  if (currentStatus === requestedStatus) {
    return currentStatus; // Idempotent no-op
  }

  const allowedSet = ALLOWED_VERIFICATION_TRANSITIONS[currentStatus];
  const allowed = allowedSet ? Array.from(allowedSet) : [];

  if (!allowedSet || !allowedSet.has(requestedStatus)) {
    throw new InvalidStateTransitionError('UserVerification', currentStatus, requestedStatus, allowed);
  }

  return requestedStatus;
}
