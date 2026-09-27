import { describe, it, expect } from 'vitest';
import { ConflictError } from '../../src/utils/errors.js';

describe('Autosave OCC (Optimistic Concurrency Control) Revision Rules', () => {
  function simulateOccSave({ currentRevision, expectedRevision, currentValue, newValue }) {
    if (currentRevision === null || currentRevision === undefined) {
      if (expectedRevision !== 0 && expectedRevision !== 1) {
        throw new ConflictError(
          `Stale revision conflict: Question is currently unanswered (expected_revision must be 0 or 1, received ${expectedRevision})`,
          'STALE_REVISION_CONFLICT'
        );
      }
      return { answer_value: newValue, revision: 1 };
    }

    if (expectedRevision === currentRevision) {
      return { answer_value: newValue, revision: currentRevision + 1 };
    }

    if (expectedRevision === currentRevision - 1 && JSON.stringify(currentValue) === JSON.stringify(newValue)) {
      // Idempotent retry of immediately previous committed revision
      return { answer_value: currentValue, revision: currentRevision };
    }

    throw new ConflictError(
      `Stale revision conflict: Current server revision is ${currentRevision}, but expected_revision was ${expectedRevision}`,
      'STALE_REVISION_CONFLICT'
    );
  }

  it('accepts initial save with expectedRevision 0 or 1 and creates revision 1', () => {
    const res0 = simulateOccSave({
      currentRevision: null,
      expectedRevision: 0,
      newValue: { option_id: 'opt-a' }
    });
    expect(res0.revision).toBe(1);

    const res1 = simulateOccSave({
      currentRevision: null,
      expectedRevision: 1,
      newValue: { option_id: 'opt-a' }
    });
    expect(res1.revision).toBe(1);
  });

  it('rejects initial save if expectedRevision is greater than 1 with 409 Conflict', () => {
    expect(() => simulateOccSave({
      currentRevision: null,
      expectedRevision: 5,
      newValue: { option_id: 'opt-a' }
    })).toThrow(ConflictError);
  });

  it('increments revision when expectedRevision matches current server revision', () => {
    const res = simulateOccSave({
      currentRevision: 1,
      expectedRevision: 1,
      currentValue: { option_id: 'opt-a' },
      newValue: { option_id: 'opt-b' }
    });
    expect(res.revision).toBe(2);
    expect(res.answer_value).toEqual({ option_id: 'opt-b' });
  });

  it('permits idempotent retry when expectedRevision is currentRevision - 1 and payload is identical', () => {
    const res = simulateOccSave({
      currentRevision: 2,
      expectedRevision: 1,
      currentValue: { option_id: 'opt-b' },
      newValue: { option_id: 'opt-b' }
    });
    expect(res.revision).toBe(2);
    expect(res.answer_value).toEqual({ option_id: 'opt-b' });
  });

  it('throws ConflictError (409) when expectedRevision is stale (less than currentRevision)', () => {
    expect(() => simulateOccSave({
      currentRevision: 3,
      expectedRevision: 1,
      currentValue: { option_id: 'opt-c' },
      newValue: { option_id: 'opt-d' }
    })).toThrow(ConflictError);
  });

  it('throws ConflictError (409) when expectedRevision is ahead of server revision', () => {
    expect(() => simulateOccSave({
      currentRevision: 2,
      expectedRevision: 4,
      currentValue: { option_id: 'opt-b' },
      newValue: { option_id: 'opt-e' }
    })).toThrow(ConflictError);
  });
});
