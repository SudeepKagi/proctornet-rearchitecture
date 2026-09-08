/**
 * @file useMediaCapture.test.js
 * @description Unit tests for useMediaCapture hook and stopMediaStream hardware cleanup utility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaCapture, stopMediaStream } from '../../src/hooks/useMediaCapture.js';

describe('useMediaCapture hook & stopMediaStream utility', () => {
  let mockTracks = [];
  let mockMediaStream;

  beforeEach(() => {
    mockTracks = [
      { id: 'video-track-1', kind: 'video', enabled: true, stop: vi.fn() },
      { id: 'audio-track-1', kind: 'audio', enabled: true, stop: vi.fn() }
    ];

    mockMediaStream = {
      getTracks: () => mockTracks,
      getAudioTracks: () => mockTracks.filter((t) => t.kind === 'audio'),
      getVideoTracks: () => mockTracks.filter((t) => t.kind === 'video')
    };

    global.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
      getDisplayMedia: vi.fn().mockResolvedValue(mockMediaStream)
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stopMediaStream', () => {
    it('stops and disables all tracks on a MediaStream', () => {
      stopMediaStream(mockMediaStream);

      expect(mockTracks[0].stop).toHaveBeenCalled();
      expect(mockTracks[0].enabled).toBe(false);
      expect(mockTracks[1].stop).toHaveBeenCalled();
      expect(mockTracks[1].enabled).toBe(false);
    });

    it('handles null stream gracefully without throwing', () => {
      expect(() => stopMediaStream(null)).not.toThrow();
      expect(() => stopMediaStream(undefined)).not.toThrow();
    });
  });

  describe('useMediaCapture hook', () => {
    it('starts with null streams and false isCapturing', () => {
      const { result } = renderHook(() => useMediaCapture());

      expect(result.current.stream).toBeNull();
      expect(result.current.screenStream).toBeNull();
      expect(result.current.isCapturing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('starts capture and sets active stream on success', async () => {
      const { result } = renderHook(() => useMediaCapture());

      await act(async () => {
        await result.current.startCapture({ video: true, audio: true });
      });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
      expect(result.current.stream).toBe(mockMediaStream);
      expect(result.current.isCapturing).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('handles permission denied error from getUserMedia', async () => {
      const permissionErr = new Error('Permission denied');
      permissionErr.name = 'NotAllowedError';
      navigator.mediaDevices.getUserMedia.mockRejectedValue(permissionErr);

      const { result } = renderHook(() => useMediaCapture());

      await act(async () => {
        try {
          await result.current.startCapture();
        } catch {}
      });

      expect(result.current.isCapturing).toBe(false);
      expect(result.current.error).toBe(permissionErr);
      expect(result.current.error.name).toBe('NotAllowedError');
    });


    it('stops capture and releases tracks when stopCapture is called', async () => {
      const { result } = renderHook(() => useMediaCapture());

      await act(async () => {
        await result.current.startCapture();
      });

      expect(result.current.isCapturing).toBe(true);

      act(() => {
        result.current.stopCapture();
      });

      expect(result.current.stream).toBeNull();
      expect(result.current.isCapturing).toBe(false);
      expect(mockTracks[0].stop).toHaveBeenCalled();
    });
  });
});
