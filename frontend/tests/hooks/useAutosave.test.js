import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from '../../src/hooks/useAutosave.js';
import * as answersApi from '../../src/api/answersApi.js';

vi.mock('../../src/api/answersApi.js');

describe('useAutosave Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces save invocations by 1,000ms and updates revision upon success', async () => {
    answersApi.saveAnswer.mockResolvedValueOnce({
      revision_id: 2,
      updated_at: new Date().toISOString(),
    });

    const { result } = renderHook(() =>
      useAutosave({
        attemptId: 'att-123',
        initialAnswers: [{ attempt_question_id: 'q1', answer_value: { selected_option_id: 'opt-a' }, revision_id: 1 }],
      })
    );

    // Initial state
    expect(result.current.answers['q1']).toEqual({ selected_option_id: 'opt-a' });

    // Set new answer (immediate local state update)
    act(() => {
      result.current.setAnswer('q1', { selected_option_id: 'opt-b' });
    });

    expect(result.current.answers['q1']).toEqual({ selected_option_id: 'opt-b' });
    expect(answersApi.saveAnswer).not.toHaveBeenCalled();

    // Advance 500ms (still within debounce)
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(answersApi.saveAnswer).not.toHaveBeenCalled();

    // Advance remaining 500ms (1,000ms total)
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(answersApi.saveAnswer).toHaveBeenCalledWith(
      'att-123',
      'q1',
      { selected_option_id: 'opt-b' },
      1
    );
  });

  it('buffers answers in in-memory queue upon network failure and reflects offline status', async () => {
    answersApi.saveAnswer.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() =>
      useAutosave({
        attemptId: 'att-123',
        initialAnswers: [],
      })
    );

    act(() => {
      result.current.setAnswer('q2', { numeric_value: 42 });
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.saveStatus).toBe('offline');
    expect(result.current.isDirty).toBe(true);

    const dirtyList = result.current.getDirtyAnswersArray();
    expect(dirtyList).toHaveLength(1);
    expect(dirtyList[0]).toEqual({
      attempt_question_id: 'q2',
      answer_value: { numeric_value: 42 },
      expected_revision: 1,
    });
  });
});
