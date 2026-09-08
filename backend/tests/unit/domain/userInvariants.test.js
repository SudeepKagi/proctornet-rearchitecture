/**
 * @file userInvariants.test.js
 * @description Level 1 unit tests for user domain business invariants and guards.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNotLastAdmin,
  assertNotSelfTarget,
  assertCanSubmitOnboarding,
  assertValidRole,
  isValidRole,
  VerificationStatus
} from '../../../src/domain/index.js';
import { DomainInvariantError } from '../../../src/domain/shared/domainErrors.js';

describe('User Domain — Invariants (Level 1 Unit Tests)', () => {
  describe('Authoritative Roles', () => {
    it('recognizes exactly the five authoritative roles', () => {
      assert.equal(isValidRole('ADMIN'), true);
      assert.equal(isValidRole('DEVELOPER'), true);
      assert.equal(isValidRole('FACULTY'), true);
      assert.equal(isValidRole('INVIGILATOR'), true);
      assert.equal(isValidRole('STUDENT'), true);
      assert.equal(isValidRole('SUPERADMIN'), false);
      assert.equal(isValidRole('GUEST'), false);
    });

    it('assertValidRole throws on unauthorized roles', () => {
      assert.doesNotThrow(() => assertValidRole('ADMIN'));
      assert.throws(
        () => assertValidRole('STAFF'),
        (err) => err instanceof DomainInvariantError
      );
    });
  });

  describe('Last-Admin Protection Invariant', () => {
    it('throws DomainInvariantError when attempting to disable the only active admin', () => {
      assert.throws(
        () => assertNotLastAdmin({ activeAdminCount: 1, isDisablingAdmin: true }),
        (err) => err instanceof DomainInvariantError
      );
    });

    it('throws DomainInvariantError when attempting to revoke admin role from the only active admin', () => {
      assert.throws(
        () => assertNotLastAdmin({ activeAdminCount: 1, isRemovingAdminRole: true }),
        (err) => err instanceof DomainInvariantError
      );
    });

    it('permits disabling or role removal when more than one active admin exists', () => {
      assert.doesNotThrow(() =>
        assertNotLastAdmin({ activeAdminCount: 2, isDisablingAdmin: true })
      );
      assert.doesNotThrow(() =>
        assertNotLastAdmin({ activeAdminCount: 3, isRemovingAdminRole: true })
      );
    });
  });

  describe('Self-Target Protection Invariant', () => {
    it('throws DomainInvariantError when admin attempts to suspend their own account', () => {
      assert.throws(
        () =>
          assertNotSelfTarget({
            actorUserId: 'admin-uuid-1',
            targetUserId: 'admin-uuid-1',
            action: 'SUSPEND'
          }),
        (err) => err instanceof DomainInvariantError
      );
    });

    it('throws DomainInvariantError when admin attempts to disable their own account', () => {
      assert.throws(
        () =>
          assertNotSelfTarget({
            actorUserId: 'admin-uuid-1',
            targetUserId: 'admin-uuid-1',
            action: 'DISABLE'
          }),
        (err) => err instanceof DomainInvariantError
      );
    });

    it('throws DomainInvariantError when admin attempts to revoke their own ADMIN role', () => {
      assert.throws(
        () =>
          assertNotSelfTarget({
            actorUserId: 'admin-uuid-1',
            targetUserId: 'admin-uuid-1',
            action: 'REVOKE_ADMIN'
          }),
        (err) => err instanceof DomainInvariantError && /cannot revoke their own ADMIN role/i.test(err.message)
      );
    });

    it('permits admin modifying a different target user', () => {
      assert.doesNotThrow(() =>
        assertNotSelfTarget({
          actorUserId: 'admin-uuid-1',
          targetUserId: 'student-uuid-2',
          action: 'SUSPEND'
        })
      );
      assert.doesNotThrow(() =>
        assertNotSelfTarget({
          actorUserId: 'admin-uuid-1',
          targetUserId: 'admin-uuid-2',
          action: 'REVOKE_ADMIN'
        })
      );
    });
  });

  describe('Onboarding Invariants', () => {
    it('blocks onboarding submission if mustChangePassword is true', () => {
      assert.throws(
        () =>
          assertCanSubmitOnboarding({
            mustChangePassword: true,
            currentVerificationStatus: VerificationStatus.UNVERIFIED
          }),
        (err) => err instanceof DomainInvariantError
      );
    });

    it('blocks onboarding submission if account is already VERIFIED', () => {
      assert.throws(
        () =>
          assertCanSubmitOnboarding({
            mustChangePassword: false,
            currentVerificationStatus: VerificationStatus.VERIFIED
          }),
        (err) => err instanceof DomainInvariantError
      );
    });

    it('permits onboarding submission for UNVERIFIED or REJECTED accounts after password change', () => {
      assert.doesNotThrow(() =>
        assertCanSubmitOnboarding({
          mustChangePassword: false,
          currentVerificationStatus: VerificationStatus.UNVERIFIED
        })
      );
      assert.doesNotThrow(() =>
        assertCanSubmitOnboarding({
          mustChangePassword: false,
          currentVerificationStatus: VerificationStatus.REJECTED
        })
      );
    });
  });
});
