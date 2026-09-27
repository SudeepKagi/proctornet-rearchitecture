import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from '../useAutosave.js';
import * as answersApi from '../../api/answersApi.js';

describe('useAutosave Hook', () => {
  const attemptId = 'attempt-123';

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes with initial answers map', () => {
    const { result } = renderHook(() =>
      useAutosave({
        attemptId,
        initialAnswers: [
          { attempt_question_id: 'q1', answer_value: { option_id: 'opt-a' }, revision_id: 1 }
        ]
      })
    );

    expect(result.current.answers['q1']).toEqual({ option_id: 'opt-a' });
    expect(result.current.saveStatus).toBe('idle');
    expect(result.current.isDirty).toBe(false);
  });

  it('updates local state immediately on setAnswer and marks state dirty', () => {
    const { result } = renderHook(() => useAutosave({ attemptId }));

    act(() => {
      result.current.setAnswer('q2', { option_id: 'opt-b' });
    });

    expect(result.current.answers['q2']).toEqual({ option_id: 'opt-b' });
    expect(result.current.isDirty).toBe(true);
  });

  it('persists dirty queue into localStorage to survive reloads', () => {
    const { result } = renderHook(() => useAutosave({ attemptId }));

    act(() => {
      result.current.setAnswer('q3', { option_id: 'opt-c' });
    });

    const storageKey = `proctornet:attempt:${attemptId}:dirty-answers`;
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0][0]).toBe('q3');
    expect(stored[0][1].answer_value).toEqual({ option_id: 'opt-c' });
  });

  it('recovers unpersisted answers from localStorage on mount (offline replay)', () => {
    const storageKey = `proctornet:attempt:${attemptId}:dirty-answers`;
    localStorage.setItem(
      storageKey,
      JSON.stringify([
        ['q4', { answer_value: { option_id: 'opt-recovered' }, expected_revision: 2 }]
      ])
    );

    const { result } = renderHook(() => useAutosave({ attemptId, isOffline: true }));

    expect(result.current.answers['q4']).toEqual({ option_id: 'opt-recovered' });
    expect(result.current.saveStatus).toBe('offline');
  });

  it('handles 409 conflict by fetching server answers and reconciling state', async () => {
    const saveSpy = vi.spyOn(answersApi, 'saveAnswer').mockRejectedValue({
      status: 409,
      code: 'STALE_REVISION_CONFLICT'
    });

    const getSpy = vi.spyOn(answersApi, 'getAnswers').mockResolvedValue([
      { attempt_question_id: 'q1', answer_value: { option_id: 'opt-server' }, revision_id: 3 }
    ]);

    const { result } = renderHook(() => useAutosave({ attemptId }));

    act(() => {
      result.current.setAnswer('q1', { option_id: 'opt-local' });
    });

    // Advance debounce timer (1,000ms)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveSpy).toHaveBeenCalledWith(attemptId, 'q1', { option_id: 'opt-local' }, 0);
    expect(getSpy).toHaveBeenCalledWith(attemptId);
    expect(result.current.answers['q1']).toEqual({ option_id: 'opt-server' });
    expect(result.current.saveStatus).toBe('saved');
  });
});
