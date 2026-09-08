/**
 * @file CandidateMediaGrid.test.jsx
 * @description Unit tests for CandidateMediaGrid component:
 * 12-candidate grid rendering, muted-by-default audio policy, and solo listening focus switching.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CandidateMediaGrid } from '../../src/components/media/CandidateMediaGrid.jsx';
import * as useMediaSubscriptionModule from '../../src/hooks/useMediaSubscription.js';

describe('CandidateMediaGrid component', () => {
  const mockCandidates = new Map([
    [
      'user-1',
      {
        userId: 'user-1',
        consumers: new Map([
          ['webcam', { id: 'c-webcam-1', kind: 'video', track: { id: 't-webcam-1', kind: 'video' } }],
          ['microphone', { id: 'c-mic-1', kind: 'audio', track: { id: 't-mic-1', kind: 'audio' } }]
        ])
      }
    ],
    [
      'user-2',
      {
        userId: 'user-2',
        consumers: new Map([
          ['webcam', { id: 'c-webcam-2', kind: 'video', track: { id: 't-webcam-2', kind: 'video' } }],
          ['microphone', { id: 'c-mic-2', kind: 'audio', track: { id: 't-mic-2', kind: 'audio' } }]
        ])
      }
    ]
  ]);

  let mockFocusCandidate;

  beforeEach(() => {
    mockFocusCandidate = vi.fn();
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue();
    global.MediaStream = class MockMediaStream {
      constructor(tracks = []) {
        this.tracks = tracks;
      }
      getTracks() {
        return this.tracks;
      }
    };
  });

  it('renders active candidates with muted-by-default audio status', () => {
    vi.spyOn(useMediaSubscriptionModule, 'useMediaSubscription').mockReturnValue({
      candidates: mockCandidates,
      focusedCandidateId: null,
      focusCandidate: mockFocusCandidate,
      isReady: true,
      error: null
    });

    render(<CandidateMediaGrid sessionId="sess-test-grid" />);

    expect(screen.getByText('Live SFU Media Connected')).toBeDefined();
    expect(screen.getByText('(2 Active Streams)')).toBeDefined();
    expect(screen.getByText('Audio: 12-Grid Muted by Default')).toBeDefined();

    // Both candidates should have Inspect buttons
    const inspectButtons = screen.getAllByRole('button', { name: /inspect/i });
    expect(inspectButtons.length).toBe(2);
  });

  it('toggles focus and triggers focusCandidate when inspect is clicked', () => {
    vi.spyOn(useMediaSubscriptionModule, 'useMediaSubscription').mockReturnValue({
      candidates: mockCandidates,
      focusedCandidateId: null,
      focusCandidate: mockFocusCandidate,
      isReady: true,
      error: null
    });

    render(<CandidateMediaGrid sessionId="sess-test-grid" />);

    const inspectButtons = screen.getAllByRole('button', { name: /inspect/i });
    fireEvent.click(inspectButtons[0]);

    expect(mockFocusCandidate).toHaveBeenCalledWith('user-1');
  });

  it('updates header and tiles when a candidate is solo focused', () => {
    vi.spyOn(useMediaSubscriptionModule, 'useMediaSubscription').mockReturnValue({
      candidates: mockCandidates,
      focusedCandidateId: 'user-1',
      focusCandidate: mockFocusCandidate,
      isReady: true,
      error: null
    });

    render(<CandidateMediaGrid sessionId="sess-test-grid" />);

    expect(screen.getByText(/solo listening/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /unfocus/i })).toBeDefined();
  });

  it('renders error notice when media subscription fails', () => {
    vi.spyOn(useMediaSubscriptionModule, 'useMediaSubscription').mockReturnValue({
      candidates: new Map(),
      focusedCandidateId: null,
      focusCandidate: mockFocusCandidate,
      isReady: false,
      error: new Error('Failed to connect to SFU router')
    });

    render(<CandidateMediaGrid sessionId="sess-test-grid" />);

    expect(screen.getByText('Media Monitoring Error')).toBeDefined();
    expect(screen.getByText('Failed to connect to SFU router')).toBeDefined();
  });
});
