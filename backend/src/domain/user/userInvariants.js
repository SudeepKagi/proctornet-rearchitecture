/**
 * @file userInvariants.js
 * @description Core business invariants and guards for user administration and account lifecycles.
 */

import { DomainInvariantError } from '../shared/domainErrors.js';
import { VerificationStatus } from './userStates.js';

/**
 * Asserts that an administrative action does not eliminate the final active administrator.
 * @param {object} params
 * @param {number} params.activeAdminCount - Total active administrators currently in the database
 * @param {boolean} [params.isRemovingAdminRole=false] - Whether the action revokes the ADMIN role
 * @param {boolean} [params.isDisablingAdmin=false] - Whether the action disables or suspends the admin
 * @throws {DomainInvariantError}
 */
export function assertNotLastAdmin({
  activeAdminCount,
  isRemovingAdminRole = false,
  isDisablingAdmin = false
}) {
  if (activeAdminCount <= 1 && (isRemovingAdminRole || isDisablingAdmin)) {
    throw new DomainInvariantError(
      'User',
      'Cannot deactivate, suspend, or revoke admin role from the final active administrator',
      { activeAdminCount, isRemovingAdminRole, isDisablingAdmin }
    );
  }
}

/**
 * Asserts that an administrator is not executing a prohibited self-target destructive mutation.
 * @param {object} params
 * @param {string} params.actorUserId
 * @param {string} params.targetUserId
 * @param {'SUSPEND' | 'DISABLE' | 'REVOKE_ADMIN'} params.action
 * @throws {DomainInvariantError}
 */
export function assertNotSelfTarget({ actorUserId, targetUserId, action }) {
  if (actorUserId && targetUserId && String(actorUserId) === String(targetUserId)) {
    if (action === 'REVOKE_ADMIN') {
      throw new DomainInvariantError(
        'User',
        'Administrator cannot revoke their own ADMIN role',
        { actorUserId, targetUserId, action }
      );
    }
    if (['SUSPEND', 'DISABLE'].includes(action)) {
      throw new DomainInvariantError(
        'User',
        `Administrator cannot ${action.toLowerCase()} their own account`,
        { actorUserId, targetUserId, action }
      );
    }
  }
}

/**
 * Asserts that a user satisfies all prerequisite invariants before submitting onboarding details.
 * @param {object} params
 * @param {boolean} params.mustChangePassword
 * @param {string} params.currentVerificationStatus
 * @throws {DomainInvariantError}
 */
export function assertCanSubmitOnboarding({ mustChangePassword, currentVerificationStatus }) {
  if (mustChangePassword === true) {
    throw new DomainInvariantError(
      'User',
      'Must complete temporary password change before submitting onboarding profile',
      { mustChangePassword }
    );
  }

  if (currentVerificationStatus === VerificationStatus.VERIFIED) {
    throw new DomainInvariantError(
      'User',
      'Account is already verified; onboarding cannot be resubmitted',
      { currentVerificationStatus }
    );
  }
}
