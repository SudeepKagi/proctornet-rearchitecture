import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProctoringEvents } from '../../src/hooks/useProctoringEvents.js';
import * as proctoringApi from '../../src/api/proctoringApi.js';

vi.mock('../../src/api/proctoringApi.js');

describe('useProctoringEvents Hook (Frontend Telemetry)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buffers telemetry events in memory and flushes periodically on timer expiry', async () => {
    proctoringApi.ingestEvents.mockResolvedValueOnce({
      accepted: 2,
      deduplicated: 0,
      riskScore: 10
    });

    const { result } = renderHook(() =>
      useProctoringEvents({
        attemptId: 'att-xyz-123',
        isActive: true,
        flushIntervalMs: 5000,
        maxBufferSize: 20
      })
    );

    // Enqueue 2 events
    act(() => {
      result.current.enqueueEvent('WINDOW_BLUR', { target: 'window' });
      result.current.enqueueEvent('TAB_HIDDEN', { target: 'tab' });
    });

    expect(result.current.getPendingEventCount()).toBe(2);
    expect(proctoringApi.ingestEvents).not.toHaveBeenCalled();

    // Advance timer by 4,000ms (not yet flushed)
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(proctoringApi.ingestEvents).not.toHaveBeenCalled();

    // Advance remaining 1,000ms (5,000ms total)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(proctoringApi.ingestEvents).toHaveBeenCalledTimes(1);
    const [calledAttemptId, calledBatch] = proctoringApi.ingestEvents.mock.calls[0];

    expect(calledAttemptId).toBe('att-xyz-123');
    expect(calledBatch).toHaveLength(2);
    expect(calledBatch[0].eventType).toBe('WINDOW_BLUR');
    expect(calledBatch[0].eventId).toBeDefined();
    expect(calledBatch[0].clientTimestamp).toBeDefined();

    // STRICT PRIVACY / SECURITY BOUNDARY: No client severity or score injected
    expect(calledBatch[0].severity).toBeUndefined();
    expect(calledBatch[0].riskScore).toBeUndefined();
    expect(calledBatch[1].eventType).toBe('TAB_HIDDEN');

    // Buffer cleared after successful flush
    expect(result.current.getPendingEventCount()).toBe(0);
  });

  it('immediately flushes when buffer reaches maxBufferSize (20 events)', async () => {
    proctoringApi.ingestEvents.mockResolvedValueOnce({
      accepted: 20,
      deduplicated: 0,
      riskScore: 20
    });

    const { result } = renderHook(() =>
      useProctoringEvents({
        attemptId: 'att-batch-999',
        isActive: true,
        flushIntervalMs: 10000,
        maxBufferSize: 20
      })
    );

    // Enqueue 19 events (below threshold)
    act(() => {
      for (let i = 0; i < 19; i++) {
        result.current.enqueueEvent('PERIODIC_HEARTBEAT');
      }
    });
    expect(result.current.getPendingEventCount()).toBe(19);
    expect(proctoringApi.ingestEvents).not.toHaveBeenCalled();

    // 20th event triggers immediate flush
    await act(async () => {
      result.current.enqueueEvent('PERIODIC_HEARTBEAT');
    });

    expect(proctoringApi.ingestEvents).toHaveBeenCalledTimes(1);
    expect(proctoringApi.ingestEvents.mock.calls[0][1]).toHaveLength(20);
  });

  it('retains un-sent events in memory upon API network failure for next retry', async () => {
    proctoringApi.ingestEvents.mockRejectedValueOnce(new Error('Network offline'));

    const { result } = renderHook(() =>
      useProctoringEvents({
        attemptId: 'att-offline-1',
        isActive: true,
        flushIntervalMs: 5000
      })
    );

    act(() => {
      result.current.enqueueEvent('RESTRICTED_KEY_COMBO', { combo: 'ALT_TAB' });
    });

    // Flush fails
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(proctoringApi.ingestEvents).toHaveBeenCalledTimes(1);
    // Events remain in buffer
    expect(result.current.getPendingEventCount()).toBe(1);

    // Next flush succeeds
    proctoringApi.ingestEvents.mockResolvedValueOnce({ accepted: 1, deduplicated: 0 });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(proctoringApi.ingestEvents).toHaveBeenCalledTimes(2);
    expect(result.current.getPendingEventCount()).toBe(0);
  });
});
