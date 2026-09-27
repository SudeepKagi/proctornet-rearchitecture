import { describe, it, expect } from 'vitest';
import { UserStatus, VerificationStatus } from '../../src/domain/user/userStates.js';
import {
  transitionUserState,
  transitionVerificationState,
  isValidUserStatus,
  isValidVerificationStatus
} from '../../src/domain/user/userStateMachine.js';
import { InvalidStateTransitionError, DomainInvariantError } from '../../src/domain/shared/domainErrors.js';

describe('UserStateMachine Invariants & Transitions', () => {
  describe('UserStatus transitions', () => {
    it('validates recognized user statuses', () => {
      expect(isValidUserStatus(UserStatus.ACTIVE)).toBe(true);
      expect(isValidUserStatus(UserStatus.SUSPENDED)).toBe(true);
      expect(isValidUserStatus(UserStatus.LOCKED)).toBe(true);
      expect(isValidUserStatus(UserStatus.DISABLED)).toBe(true);
      expect(isValidUserStatus('BOGUS')).toBe(false);
    });

    it('permits ACTIVE <-> SUSPENDED transitions', () => {
      expect(transitionUserState(UserStatus.ACTIVE, UserStatus.SUSPENDED)).toBe(UserStatus.SUSPENDED);
      expect(transitionUserState(UserStatus.SUSPENDED, UserStatus.ACTIVE)).toBe(UserStatus.ACTIVE);
    });

    it('permits ACTIVE -> LOCKED -> ACTIVE transitions', () => {
      expect(transitionUserState(UserStatus.ACTIVE, UserStatus.LOCKED)).toBe(UserStatus.LOCKED);
      expect(transitionUserState(UserStatus.LOCKED, UserStatus.ACTIVE)).toBe(UserStatus.ACTIVE);
    });

    it('handles idempotent transitions smoothly', () => {
      expect(transitionUserState(UserStatus.ACTIVE, UserStatus.ACTIVE)).toBe(UserStatus.ACTIVE);
      expect(transitionUserState(UserStatus.SUSPENDED, UserStatus.SUSPENDED)).toBe(UserStatus.SUSPENDED);
    });

    it('enforces allowed transitions for DISABLED', () => {
      expect(transitionUserState(UserStatus.DISABLED, UserStatus.ACTIVE)).toBe(UserStatus.ACTIVE);
      expect(() => transitionUserState(UserStatus.DISABLED, UserStatus.SUSPENDED))
        .toThrow(InvalidStateTransitionError);
    });
  });

  describe('VerificationStatus transitions', () => {
    it('validates recognized verification statuses', () => {
      expect(isValidVerificationStatus(VerificationStatus.UNVERIFIED)).toBe(true);
      expect(isValidVerificationStatus(VerificationStatus.PENDING)).toBe(true);
      expect(isValidVerificationStatus(VerificationStatus.VERIFIED)).toBe(true);
      expect(isValidVerificationStatus(VerificationStatus.REJECTED)).toBe(true);
      expect(isValidVerificationStatus('RANDOM')).toBe(false);
    });

    it('allows UNVERIFIED -> PENDING', () => {
      expect(transitionVerificationState(VerificationStatus.UNVERIFIED, VerificationStatus.PENDING))
        .toBe(VerificationStatus.PENDING);
    });

    it('allows PENDING -> VERIFIED or REJECTED', () => {
      expect(transitionVerificationState(VerificationStatus.PENDING, VerificationStatus.VERIFIED))
        .toBe(VerificationStatus.VERIFIED);
      expect(transitionVerificationState(VerificationStatus.PENDING, VerificationStatus.REJECTED))
        .toBe(VerificationStatus.REJECTED);
    });

    it('allows re-application from REJECTED back to PENDING', () => {
      expect(transitionVerificationState(VerificationStatus.REJECTED, VerificationStatus.PENDING))
        .toBe(VerificationStatus.PENDING);
    });

    it('handles idempotent verification state transitions', () => {
      expect(transitionVerificationState(VerificationStatus.VERIFIED, VerificationStatus.VERIFIED))
        .toBe(VerificationStatus.VERIFIED);
    });

    it('throws DomainInvariantError on unrecognized verification states', () => {
      expect(() => transitionVerificationState('BAD', VerificationStatus.VERIFIED))
        .toThrow(DomainInvariantError);
    });
  });
});
