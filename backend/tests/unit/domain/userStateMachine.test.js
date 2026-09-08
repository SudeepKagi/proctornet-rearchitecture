/**
 * @file userStateMachine.test.js
 * @description Level 1 unit tests for UserStatus and VerificationStatus state machines.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UserStatus,
  VerificationStatus,
  transitionUserState,
  transitionVerificationState,
  isValidUserStatus,
  isValidVerificationStatus
} from '../../../src/domain/index.js';
import {
  InvalidStateTransitionError,
  DomainInvariantError
} from '../../../src/domain/shared/domainErrors.js';

describe('User Domain — State Machine (Level 1 Unit Tests)', () => {
  describe('UserStatus Transitions', () => {
    it('validates recognized and unrecognized user statuses', () => {
      assert.equal(isValidUserStatus('ACTIVE'), true);
      assert.equal(isValidUserStatus('LOCKED'), true);
      assert.equal(isValidUserStatus('SUSPENDED'), true);
      assert.equal(isValidUserStatus('DISABLED'), true);
      assert.equal(isValidUserStatus('PENDING'), false); // PENDING is a verification status, not an account status!
      assert.equal(isValidUserStatus('UNKNOWN'), false);
    });

    it('allows valid transitions from ACTIVE', () => {
      assert.equal(transitionUserState(UserStatus.ACTIVE, UserStatus.LOCKED), UserStatus.LOCKED);
      assert.equal(transitionUserState(UserStatus.ACTIVE, UserStatus.SUSPENDED), UserStatus.SUSPENDED);
      assert.equal(transitionUserState(UserStatus.ACTIVE, UserStatus.DISABLED), UserStatus.DISABLED);
      assert.equal(transitionUserState(UserStatus.ACTIVE, UserStatus.ACTIVE), UserStatus.ACTIVE); // idempotent
    });

    it('allows valid transitions from LOCKED', () => {
      assert.equal(transitionUserState(UserStatus.LOCKED, UserStatus.ACTIVE), UserStatus.ACTIVE);
      assert.equal(transitionUserState(UserStatus.LOCKED, UserStatus.SUSPENDED), UserStatus.SUSPENDED);
      assert.equal(transitionUserState(UserStatus.LOCKED, UserStatus.DISABLED), UserStatus.DISABLED);
    });

    it('allows valid transitions from SUSPENDED', () => {
      assert.equal(transitionUserState(UserStatus.SUSPENDED, UserStatus.ACTIVE), UserStatus.ACTIVE);
      assert.equal(transitionUserState(UserStatus.SUSPENDED, UserStatus.DISABLED), UserStatus.DISABLED);
    });

    it('rejects illegal transition from SUSPENDED directly to LOCKED', () => {
      assert.throws(
        () => transitionUserState(UserStatus.SUSPENDED, UserStatus.LOCKED),
        (err) => err instanceof InvalidStateTransitionError
      );
    });

    it('allows reactivation from DISABLED to ACTIVE', () => {
      assert.equal(transitionUserState(UserStatus.DISABLED, UserStatus.ACTIVE), UserStatus.ACTIVE);
    });

    it('rejects transition from DISABLED to LOCKED', () => {
      assert.throws(
        () => transitionUserState(UserStatus.DISABLED, UserStatus.LOCKED),
        (err) => err instanceof InvalidStateTransitionError
      );
    });

    it('throws DomainInvariantError on invalid status strings', () => {
      assert.throws(
        () => transitionUserState('FOO', UserStatus.ACTIVE),
        (err) => err instanceof DomainInvariantError
      );
      assert.throws(
        () => transitionUserState(UserStatus.ACTIVE, 'BAR'),
        (err) => err instanceof DomainInvariantError
      );
    });
  });

  describe('VerificationStatus Transitions', () => {
    it('validates recognized verification statuses', () => {
      assert.equal(isValidVerificationStatus('UNVERIFIED'), true);
      assert.equal(isValidVerificationStatus('PENDING'), true);
      assert.equal(isValidVerificationStatus('VERIFIED'), true);
      assert.equal(isValidVerificationStatus('REJECTED'), true);
      assert.equal(isValidVerificationStatus('ACTIVE'), false);
    });

    it('allows UNVERIFIED -> PENDING upon onboarding submission', () => {
      assert.equal(
        transitionVerificationState(VerificationStatus.UNVERIFIED, VerificationStatus.PENDING),
        VerificationStatus.PENDING
      );
    });

    it('rejects UNVERIFIED -> VERIFIED directly without onboarding submission', () => {
      assert.throws(
        () => transitionVerificationState(VerificationStatus.UNVERIFIED, VerificationStatus.VERIFIED),
        (err) => err instanceof InvalidStateTransitionError
      );
    });

    it('allows PENDING -> VERIFIED and PENDING -> REJECTED upon admin review', () => {
      assert.equal(
        transitionVerificationState(VerificationStatus.PENDING, VerificationStatus.VERIFIED),
        VerificationStatus.VERIFIED
      );
      assert.equal(
        transitionVerificationState(VerificationStatus.PENDING, VerificationStatus.REJECTED),
        VerificationStatus.REJECTED
      );
    });

    it('allows REJECTED -> PENDING upon candidate profile resubmission', () => {
      assert.equal(
        transitionVerificationState(VerificationStatus.REJECTED, VerificationStatus.PENDING),
        VerificationStatus.PENDING
      );
    });

    it('allows VERIFIED -> REJECTED if administrative revocation occurs', () => {
      assert.equal(
        transitionVerificationState(VerificationStatus.VERIFIED, VerificationStatus.REJECTED),
        VerificationStatus.REJECTED
      );
    });
  });
});
