import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExamTimer } from '../../src/hooks/useExamTimer.js';

describe('useExamTimer Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates server drift and formats tabular time', () => {
    const now = new Date('2026-09-07T12:00:00.000Z').getTime();
    vi.setSystemTime(now);

    // Server time matches client time, expiry is in 10 minutes (600s)
    const serverTime = new Date('2026-09-07T12:00:00.000Z').toISOString();
    const expiresAt = new Date('2026-09-07T12:10:00.000Z').toISOString();
    const onExpire = vi.fn();

    const { result } = renderHook(() =>
      useExamTimer({ serverTime, expiresAt, onExpire })
    );

    expect(result.current.formattedTime).toBe('10:00');
    expect(result.current.isExpired).toBe(false);

    // Advance 5 minutes
    act(() => {
      vi.advanceTimersByTime(300000);
    });

    expect(result.current.formattedTime).toBe('05:00');
    expect(result.current.isUrgent5Min).toBe(true);

    // Advance to 0
    act(() => {
      vi.advanceTimersByTime(300000);
    });

    expect(result.current.isExpired).toBe(true);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
