/**
 * @file studentConfigInvariants.test.js
 * @description Level 1 unit tests for student accommodations and configuration invariants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProctoringStrictness } from '../../../src/domain/student/studentDocumentStates.js';
import {
  assertValidTimeMultiplier,
  assertValidBreakAllowance,
  assertValidProctoringStrictness,
  assertValidAssistiveTechnology
} from '../../../src/domain/student/studentConfigInvariants.js';

describe('Student Configuration Invariants (Level 1)', () => {
  describe('Extra Time Multiplier', () => {
    it('accepts multipliers within 1.00 to 3.00', () => {
      assert.doesNotThrow(() => assertValidTimeMultiplier(1.00));
      assert.doesNotThrow(() => assertValidTimeMultiplier(1.25));
      assert.doesNotThrow(() => assertValidTimeMultiplier(1.50));
      assert.doesNotThrow(() => assertValidTimeMultiplier(2.00));
      assert.doesNotThrow(() => assertValidTimeMultiplier(3.00));
    });

    it('rejects multipliers outside the 1.00 to 3.00 bounds', () => {
      assert.throws(() => assertValidTimeMultiplier(0.99), /Extra time multiplier must be between/);
      assert.throws(() => assertValidTimeMultiplier(0.50), /Extra time multiplier must be between/);
      assert.throws(() => assertValidTimeMultiplier(3.01), /Extra time multiplier must be between/);
      assert.throws(() => assertValidTimeMultiplier(5.00), /Extra time multiplier must be between/);
      assert.throws(() => assertValidTimeMultiplier('invalid'), /Extra time multiplier must be between/);
    });
  });

  describe('Break Allowance Limits', () => {
    it('accepts valid break minutes and counts', () => {
      assert.doesNotThrow(() => assertValidBreakAllowance(0, 0));
      assert.doesNotThrow(() => assertValidBreakAllowance(15, 1));
      assert.doesNotThrow(() => assertValidBreakAllowance(30, 2));
      assert.doesNotThrow(() => assertValidBreakAllowance(120, 10));
    });

    it('rejects out of bounds break minutes or counts', () => {
      assert.throws(() => assertValidBreakAllowance(-1, 0), /Break allowance minutes must be between/);
      assert.throws(() => assertValidBreakAllowance(121, 2), /Break allowance minutes must be between/);
      assert.throws(() => assertValidBreakAllowance(15, -1), /Max breaks allowed must be between/);
      assert.throws(() => assertValidBreakAllowance(15, 11), /Max breaks allowed must be between/);
    });
  });

  describe('Proctoring Strictness Enums', () => {
    it('accepts all valid strictness enums', () => {
      assert.doesNotThrow(() => assertValidProctoringStrictness(ProctoringStrictness.STANDARD));
      assert.doesNotThrow(() => assertValidProctoringStrictness(ProctoringStrictness.RELAXED));
      assert.doesNotThrow(() => assertValidProctoringStrictness(ProctoringStrictness.STRICT));
      assert.doesNotThrow(() => assertValidProctoringStrictness(ProctoringStrictness.MEDICAL_EXEMPTION));
    });

    it('rejects arbitrary strictness levels', () => {
      assert.throws(() => assertValidProctoringStrictness('EXTREME'), /Invalid proctoring strictness/);
      assert.throws(() => assertValidProctoringStrictness('NONE'), /Invalid proctoring strictness/);
    });
  });

  describe('Assistive Technology Structure', () => {
    it('accepts object flags', () => {
      assert.doesNotThrow(() => assertValidAssistiveTechnology({ screenReader: true }));
      assert.doesNotThrow(() => assertValidAssistiveTechnology({}));
      assert.doesNotThrow(() => assertValidAssistiveTechnology(null));
      assert.doesNotThrow(() => assertValidAssistiveTechnology(undefined));
    });

    it('rejects non-object primitives', () => {
      assert.throws(
        () => assertValidAssistiveTechnology('screenReader'),
        /Assistive technology must be a JSON object/
      );
      assert.throws(
        () => assertValidAssistiveTechnology(123),
        /Assistive technology must be a JSON object/
      );
    });
  });
});
