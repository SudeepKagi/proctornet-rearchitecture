import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ScreenStreamProvider, useScreenStream } from '../ScreenStreamContext.jsx';

function TestConsumer() {
  const {
    screenStream,
    isScreenSharing,
    startScreenCapture,
    stopScreenCapture,
    screenError
  } = useScreenStream();

  return (
    <div>
      <span data-testid="is-sharing">{isScreenSharing ? 'SHARING' : 'IDLE'}</span>
      <span data-testid="has-stream">{screenStream ? 'HAS_STREAM' : 'NO_STREAM'}</span>
      {screenError && <span data-testid="screen-error">{screenError}</span>}
      <button onClick={() => startScreenCapture().catch(() => {})}>Start</button>
      <button onClick={() => stopScreenCapture()}>Stop</button>
    </div>
  );
}

describe('ScreenStreamContext', () => {
  let mockTrack;
  let mockStream;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockTrack = {
      kind: 'video',
      readyState: 'live',
      onended: null,
      stop: vi.fn(),
      getSettings: () => ({ displaySurface: 'monitor' })
    };
    mockStream = {
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack]
    };
  });

  it('initializes in idle state without active stream', () => {
    render(
      <ScreenStreamProvider>
        <TestConsumer />
      </ScreenStreamProvider>
    );

    expect(screen.getByTestId('is-sharing').textContent).toBe('IDLE');
    expect(screen.getByTestId('has-stream').textContent).toBe('NO_STREAM');
  });

  it('captures screen stream and registers onended handler', async () => {
    navigator.mediaDevices = {
      getDisplayMedia: vi.fn().mockResolvedValue(mockStream)
    };

    render(
      <ScreenStreamProvider>
        <TestConsumer />
      </ScreenStreamProvider>
    );

    await act(async () => {
      screen.getByText('Start').click();
    });

    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
      video: { displaySurface: 'monitor', cursor: 'always' },
      audio: false
    });
    expect(screen.getByTestId('is-sharing').textContent).toBe('SHARING');
    expect(screen.getByTestId('has-stream').textContent).toBe('HAS_STREAM');
    expect(typeof mockTrack.onended).toBe('function');

    // Simulate track ended
    act(() => {
      mockTrack.onended();
    });

    expect(screen.getByTestId('is-sharing').textContent).toBe('IDLE');
    expect(screen.getByTestId('has-stream').textContent).toBe('NO_STREAM');
  });

  it('handles permission denied rejection gracefully', async () => {
    const permErr = new Error('Permission denied');
    permErr.name = 'NotAllowedError';
    navigator.mediaDevices = {
      getDisplayMedia: vi.fn().mockRejectedValue(permErr)
    };

    render(
      <ScreenStreamProvider>
        <TestConsumer />
      </ScreenStreamProvider>
    );

    await act(async () => {
      try {
        screen.getByText('Start').click();
      } catch {}
    });

    expect(screen.getByTestId('is-sharing').textContent).toBe('IDLE');
    expect(screen.getByTestId('screen-error')).toHaveTextContent(/permission was denied/i);
  });
});
