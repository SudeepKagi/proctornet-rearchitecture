import { describe, it, expect } from 'vitest';
import { AttemptStatus } from '../../src/domain/attempt/attemptStates.js';
import {
  getNextAllowedAttemptStates,
  canTransitionAttempt,
  transitionAttemptState
} from '../../src/domain/attempt/attemptStateMachine.js';
import { InvalidStateTransitionError, DomainInvariantError } from '../../src/domain/shared/domainErrors.js';

describe('AttemptStateMachine Invariants & Transitions', () => {
  describe('getNextAllowedAttemptStates', () => {
    it('returns [ACTIVE] for READY status', () => {
      const allowed = getNextAllowedAttemptStates(AttemptStatus.READY);
      expect(allowed).toEqual([AttemptStatus.ACTIVE]);
    });

    it('returns [PAUSED, SUBMITTED, TERMINATED, EXPIRED] for ACTIVE status', () => {
      const allowed = getNextAllowedAttemptStates(AttemptStatus.ACTIVE);
      expect(allowed).toEqual([
        AttemptStatus.PAUSED,
        AttemptStatus.SUBMITTED,
        AttemptStatus.TERMINATED,
        AttemptStatus.EXPIRED
      ]);
    });

    it('returns empty array for terminal statuses', () => {
      expect(getNextAllowedAttemptStates(AttemptStatus.SUBMITTED)).toEqual([]);
      expect(getNextAllowedAttemptStates(AttemptStatus.TERMINATED)).toEqual([]);
      expect(getNextAllowedAttemptStates(AttemptStatus.EXPIRED)).toEqual([]);
    });

    it('throws DomainInvariantError for unknown statuses', () => {
      expect(() => getNextAllowedAttemptStates('INVALID_STATUS')).toThrow(DomainInvariantError);
    });
  });

  describe('canTransitionAttempt', () => {
    it('permits valid transitions according to transition matrix', () => {
      expect(canTransitionAttempt(AttemptStatus.READY, AttemptStatus.ACTIVE)).toBe(true);
      expect(canTransitionAttempt(AttemptStatus.ACTIVE, AttemptStatus.SUBMITTED)).toBe(true);
      expect(canTransitionAttempt(AttemptStatus.ACTIVE, AttemptStatus.PAUSED)).toBe(true);
      expect(canTransitionAttempt(AttemptStatus.PAUSED, AttemptStatus.ACTIVE)).toBe(true);
      expect(canTransitionAttempt(AttemptStatus.PAUSED, AttemptStatus.TERMINATED)).toBe(true);
    });

    it('rejects illegal transitions without throwing', () => {
      expect(canTransitionAttempt(AttemptStatus.READY, AttemptStatus.SUBMITTED)).toBe(false);
      expect(canTransitionAttempt(AttemptStatus.SUBMITTED, AttemptStatus.ACTIVE)).toBe(false);
      expect(canTransitionAttempt(AttemptStatus.TERMINATED, AttemptStatus.READY)).toBe(false);
      expect(canTransitionAttempt('UNKNOWN', AttemptStatus.ACTIVE)).toBe(false);
    });
  });

  describe('transitionAttemptState', () => {
    it('executes legal transition and returns target status', () => {
      const next = transitionAttemptState(AttemptStatus.READY, AttemptStatus.ACTIVE);
      expect(next).toBe(AttemptStatus.ACTIVE);
    });

    it('throws InvalidStateTransitionError when attempting transition from terminal state', () => {
      expect(() => transitionAttemptState(AttemptStatus.SUBMITTED, AttemptStatus.ACTIVE))
        .toThrow(InvalidStateTransitionError);
      expect(() => transitionAttemptState(AttemptStatus.TERMINATED, AttemptStatus.ACTIVE))
        .toThrow(InvalidStateTransitionError);
      expect(() => transitionAttemptState(AttemptStatus.EXPIRED, AttemptStatus.ACTIVE))
        .toThrow(InvalidStateTransitionError);
    });

    it('throws InvalidStateTransitionError on disallowed forward transitions', () => {
      expect(() => transitionAttemptState(AttemptStatus.READY, AttemptStatus.TERMINATED))
        .toThrow(InvalidStateTransitionError);
    });

    it('throws DomainInvariantError on unknown states', () => {
      expect(() => transitionAttemptState('FOO', AttemptStatus.ACTIVE))
        .toThrow(DomainInvariantError);
      expect(() => transitionAttemptState(AttemptStatus.READY, 'BAR'))
        .toThrow(DomainInvariantError);
    });
  });
});
