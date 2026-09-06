import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AttemptStatus,
  ALL_ATTEMPT_STATUSES,
  TERMINAL_ATTEMPT_STATES,
  isValidAttemptStatus,
  isAttemptTerminal,
  transitionAttemptState,
  canTransitionAttempt,
  getNextAllowedAttemptStates,
  validateAttemptInvariants,
  assertAttemptCanAcceptAnswers,
  InvalidStateTransitionError,
  DomainInvariantError
} from '../../src/domain/index.js';

describe('Exam Attempt Domain & State Machine', () => {
  describe('AttemptStatus Enum & Utility Checks', () => {
    it('should define exactly the 5 authoritative attempt lifecycle states', () => {
      assert.deepEqual(ALL_ATTEMPT_STATUSES, [
        'READY',
        'ACTIVE',
        'SUBMITTED',
        'TERMINATED',
        'EXPIRED'
      ]);
    });

    it('should correctly identify valid and invalid attempt statuses', () => {
      assert.equal(isValidAttemptStatus('READY'), true);
      assert.equal(isValidAttemptStatus('ACTIVE'), true);
      assert.equal(isValidAttemptStatus('SUBMITTED'), true);
      assert.equal(isValidAttemptStatus('TERMINATED'), true);
      assert.equal(isValidAttemptStatus('EXPIRED'), true);

      // Deprecated or invalid statuses
      assert.equal(isValidAttemptStatus('NOT_STARTED'), false);
      assert.equal(isValidAttemptStatus('IN_PROGRESS'), false);
      assert.equal(isValidAttemptStatus('EVALUATING'), false);
      assert.equal(isValidAttemptStatus('EVALUATED'), false);
      assert.equal(isValidAttemptStatus('ABORTED'), false);
      assert.equal(isValidAttemptStatus(''), false);
      assert.equal(isValidAttemptStatus(null), false);
    });

    it('should correctly identify terminal attempt statuses', () => {
      assert.equal(isAttemptTerminal(AttemptStatus.SUBMITTED), true);
      assert.equal(isAttemptTerminal(AttemptStatus.TERMINATED), true);
      assert.equal(isAttemptTerminal(AttemptStatus.EXPIRED), true);

      assert.equal(isAttemptTerminal(AttemptStatus.READY), false);
      assert.equal(isAttemptTerminal(AttemptStatus.ACTIVE), false);
    });

    it('should return allowed next states for non-terminal and terminal states', () => {
      assert.deepEqual(getNextAllowedAttemptStates(AttemptStatus.READY), [AttemptStatus.ACTIVE]);
      assert.deepEqual(getNextAllowedAttemptStates(AttemptStatus.ACTIVE), [
        AttemptStatus.SUBMITTED,
        AttemptStatus.TERMINATED,
        AttemptStatus.EXPIRED
      ]);
      assert.deepEqual(getNextAllowedAttemptStates(AttemptStatus.SUBMITTED), []);
      assert.deepEqual(getNextAllowedAttemptStates(AttemptStatus.TERMINATED), []);
      assert.deepEqual(getNextAllowedAttemptStates(AttemptStatus.EXPIRED), []);
    });

    it('should throw DomainInvariantError when inspecting invalid attempt state', () => {
      assert.throws(
        () => getNextAllowedAttemptStates('INVALID_STATUS'),
        (err) => err instanceof DomainInvariantError
      );
    });
  });

  describe('Valid Attempt Transitions', () => {
    it('should allow student start: READY -> ACTIVE', () => {
      assert.equal(canTransitionAttempt(AttemptStatus.READY, AttemptStatus.ACTIVE), true);
      const next = transitionAttemptState(AttemptStatus.READY, AttemptStatus.ACTIVE);
      assert.equal(next, AttemptStatus.ACTIVE);
    });

    it('should allow candidate finish: ACTIVE -> SUBMITTED', () => {
      assert.equal(canTransitionAttempt(AttemptStatus.ACTIVE, AttemptStatus.SUBMITTED), true);
      const next = transitionAttemptState(AttemptStatus.ACTIVE, AttemptStatus.SUBMITTED);
      assert.equal(next, AttemptStatus.SUBMITTED);
    });

    it('should allow proctor/security intervention: ACTIVE -> TERMINATED', () => {
      assert.equal(canTransitionAttempt(AttemptStatus.ACTIVE, AttemptStatus.TERMINATED), true);
      const next = transitionAttemptState(AttemptStatus.ACTIVE, AttemptStatus.TERMINATED);
      assert.equal(next, AttemptStatus.TERMINATED);
    });

    it('should allow timer expiration: ACTIVE -> EXPIRED', () => {
      assert.equal(canTransitionAttempt(AttemptStatus.ACTIVE, AttemptStatus.EXPIRED), true);
      const next = transitionAttemptState(AttemptStatus.ACTIVE, AttemptStatus.EXPIRED);
      assert.equal(next, AttemptStatus.EXPIRED);
    });
  });

  describe('Invalid Attempt Transitions & Guards', () => {
    it('should reject direct jump from READY to any terminal state without becoming ACTIVE', () => {
      const invalidFromReady = [
        AttemptStatus.SUBMITTED,
        AttemptStatus.TERMINATED,
        AttemptStatus.EXPIRED
      ];

      for (const target of invalidFromReady) {
        assert.equal(canTransitionAttempt(AttemptStatus.READY, target), false);
        assert.throws(
          () => transitionAttemptState(AttemptStatus.READY, target),
          (err) => err instanceof InvalidStateTransitionError
        );
      }
    });

    it('should reject transitions originating from terminal states (SUBMITTED, TERMINATED, EXPIRED)', () => {
      for (const terminal of TERMINAL_ATTEMPT_STATES) {
        for (const target of ALL_ATTEMPT_STATUSES) {
          assert.equal(canTransitionAttempt(terminal, target), false, `Cannot transition from terminal ${terminal} to ${target}`);
          assert.throws(
            () => transitionAttemptState(terminal, target),
            (err) => {
              assert.ok(err instanceof InvalidStateTransitionError);
              assert.equal(err.entity, 'ExamAttempt');
              assert.equal(err.currentState, terminal);
              assert.equal(err.requestedState, target);
              return true;
            }
          );
        }
      }
    });

    it('should reject backward transitions (e.g., ACTIVE -> READY)', () => {
      assert.equal(canTransitionAttempt(AttemptStatus.ACTIVE, AttemptStatus.READY), false);
      assert.throws(
        () => transitionAttemptState(AttemptStatus.ACTIVE, AttemptStatus.READY),
        (err) => err instanceof InvalidStateTransitionError
      );
    });

    it('should reject self-transitions', () => {
      for (const status of ALL_ATTEMPT_STATUSES) {
        assert.equal(canTransitionAttempt(status, status), false);
        assert.throws(
          () => transitionAttemptState(status, status),
          (err) => err instanceof InvalidStateTransitionError
        );
      }
    });

    it('should throw DomainInvariantError on unrecognized status values', () => {
      assert.throws(
        () => transitionAttemptState('NON_EXISTENT', AttemptStatus.ACTIVE),
        (err) => err instanceof DomainInvariantError
      );
      assert.throws(
        () => transitionAttemptState(AttemptStatus.READY, 'NON_EXISTENT'),
        (err) => err instanceof DomainInvariantError
      );
    });
  });

  describe('Attempt Invariants & Answer Eligibility', () => {
    const validAttempt = {
      session_id: 'd9b2d63d-a233-4f9e-a89c-0c5a2e5d95e1',
      student_id: 'e2b3c4d5-1111-2222-3333-444455556666',
      status: AttemptStatus.READY,
      expires_at: new Date(Date.now() + 3600000).toISOString()
    };

    it('should validate complete and correct attempt objects', () => {
      assert.doesNotThrow(() => validateAttemptInvariants(validAttempt));
    });

    it('should reject missing or empty session_id or student_id', () => {
      assert.throws(
        () => validateAttemptInvariants({ ...validAttempt, session_id: '' }),
        (err) => err instanceof DomainInvariantError && err.message.includes('session_id')
      );
      assert.throws(
        () => validateAttemptInvariants({ ...validAttempt, student_id: '   ' }),
        (err) => err instanceof DomainInvariantError && err.message.includes('student_id')
      );
    });

    it('should reject invalid attempt status in object definition', () => {
      assert.throws(
        () => validateAttemptInvariants({ ...validAttempt, status: 'UNKNOWN' }),
        (err) => err instanceof DomainInvariantError && err.message.includes('Invalid attempt status')
      );
    });

    it('should reject invalid expires_at timestamp or started_at > expires_at', () => {
      assert.throws(
        () => validateAttemptInvariants({ ...validAttempt, expires_at: 'not-a-date' }),
        (err) => err instanceof DomainInvariantError && err.message.includes('expires_at')
      );

      const now = Date.now();
      assert.throws(
        () => validateAttemptInvariants({
          ...validAttempt,
          started_at: new Date(now + 5000),
          expires_at: new Date(now)
        }),
        (err) => err instanceof DomainInvariantError && err.message.includes('cannot be after expires_at')
      );
    });

    it('should enforce that submitted attempts must have submitted_at timestamp', () => {
      assert.throws(
        () => validateAttemptInvariants({ ...validAttempt, status: AttemptStatus.SUBMITTED }),
        (err) => err instanceof DomainInvariantError && err.message.includes('submitted_at')
      );
      assert.doesNotThrow(() => {
        validateAttemptInvariants({
          ...validAttempt,
          status: AttemptStatus.SUBMITTED,
          submitted_at: new Date().toISOString()
        });
      });
    });

    it('should allow answer modifications ONLY when attempt is ACTIVE', () => {
      assert.doesNotThrow(() => assertAttemptCanAcceptAnswers(AttemptStatus.ACTIVE));

      const nonActiveStates = [
        AttemptStatus.READY,
        AttemptStatus.SUBMITTED,
        AttemptStatus.TERMINATED,
        AttemptStatus.EXPIRED
      ];

      for (const status of nonActiveStates) {
        assert.throws(
          () => assertAttemptCanAcceptAnswers(status),
          (err) => err instanceof DomainInvariantError && err.message.includes('Cannot save or modify answers'),
          `Should forbid answer saves for attempt status: ${status}`
        );
      }
    });
  });
});
