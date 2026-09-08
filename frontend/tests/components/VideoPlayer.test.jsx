/**
 * @file VideoPlayer.test.jsx
 * @description Unit tests for VideoPlayer component:
 * Track attachment, hardware cleanup on unmount, muted state, focus toggle, and VU meter rendering.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoPlayer } from '../../src/components/media/VideoPlayer.jsx';

describe('VideoPlayer component', () => {
  let originalMediaStream;

  beforeEach(() => {
    originalMediaStream = global.MediaStream;
    global.MediaStream = class MockMediaStream {
      constructor(tracks = []) {
        this.tracks = tracks;
      }
      getTracks() {
        return this.tracks;
      }
    };
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue();
  });

  afterEach(() => {
    global.MediaStream = originalMediaStream;
    vi.restoreAllMocks();
  });

  it('renders video element and candidate label', () => {
    render(<VideoPlayer label="Candidate John Doe" isMuted={true} />);

    expect(screen.getByText('Candidate John Doe')).toBeDefined();
    const video = document.querySelector('video');
    expect(video).toBeDefined();
    expect(video.muted).toBe(true);
  });

  it('triggers onFocusToggle when tile is clicked', () => {
    const handleFocusToggle = vi.fn();
    render(<VideoPlayer label="Candidate Jane" onFocusToggle={handleFocusToggle} />);

    const tile = screen.getByText('Candidate Jane').closest('.video-player-tile');
    fireEvent.click(tile);

    expect(handleFocusToggle).toHaveBeenCalledTimes(1);
  });

  it('attaches MediaStream when track is provided and cleans up on unmount', () => {
    const mockTrack = { id: 'test-track-1', kind: 'video' };
    const { unmount } = render(<VideoPlayer track={mockTrack} label="Candidate Stream" />);

    const video = document.querySelector('video');
    expect(video.srcObject).toBeDefined();

    unmount();
    expect(video.srcObject).toBeNull();
  });

  it('renders visual VU meter with audio level percentage and dynamic colors', () => {
    // 25% -> green
    const { rerender } = render(<VideoPlayer label="Candidate VU" audioLevel={0.25} />);
    const greenBar = document.querySelector('.bg-green-500');
    expect(greenBar).toBeDefined();
    expect(greenBar.style.width).toBe('25%');

    // 75% -> red
    rerender(<VideoPlayer label="Candidate VU" audioLevel={0.75} />);
    const redBar = document.querySelector('.bg-red-500');
    expect(redBar).toBeDefined();
    expect(redBar.style.width).toBe('75%');
  });
});
