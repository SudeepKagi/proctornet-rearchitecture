import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PreExamReadinessPage } from '../PreExamReadinessPage.jsx';
import { ScreenStreamProvider } from '../../../context/ScreenStreamContext.jsx';
import * as sessionsApi from '../../../api/sessionsApi.js';
import * as biometricsApi from '../../../api/biometricsApi.js';

describe('PreExamReadinessPage Stepper Component', () => {
  const mockSession = {
    session_id: 'session-101',
    exam_title: 'Algorithms & Data Structures Final Exam',
    scheduled_start_time: new Date(Date.now() - 60000).toISOString(),
    scheduled_end_time: new Date(Date.now() + 3600000).toISOString(),
    exam_duration_minutes: 90,
    target_department: 'Computer Science',
    status: 'ACTIVE'
  };

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

    navigator.mediaDevices = {
      getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
      getUserMedia: vi.fn().mockResolvedValue(mockStream)
    };

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) })
    });
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,mockimagedata');
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue();

    vi.spyOn(sessionsApi, 'getSession').mockResolvedValue(mockSession);
    vi.spyOn(sessionsApi, 'getMyAttempt').mockResolvedValue(null);
    vi.spyOn(sessionsApi, 'getClearanceStatus').mockResolvedValue({
      hasClearance: false,
      screenShareAt: null,
      livenessPassed: false,
      faceVerifiedAt: null
    });
    vi.spyOn(sessionsApi, 'recordScreenShareClearance').mockResolvedValue({
      clearanceId: 'clearance-1',
      screenShareAt: new Date().toISOString()
    });
    vi.spyOn(biometricsApi, 'verifyIdentitySnapshot').mockResolvedValue({
      verified: true,
      finalStatus: 'VERIFIED',
      similarityScore: 0.94
    });
    vi.spyOn(sessionsApi, 'startAttemptForSession').mockResolvedValue({
      attemptId: 'attempt-999',
      redirectUrl: '/candidate/attempts/attempt-999'
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/candidate/readiness/session-101']}>
        <ScreenStreamProvider>
          <Routes>
            <Route path="/candidate/readiness/:sessionId" element={<PreExamReadinessPage />} />
            <Route path="/candidate/attempts/:attemptId" element={<div data-testid="exam-started">Live Exam</div>} />
          </Routes>
        </ScreenStreamProvider>
      </MemoryRouter>
    );
  }

  it('renders exam session details and initializes on Step 1 (Screen Share)', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Algorithms & Data Structures Final Exam')).toBeInTheDocument();
    });

    expect(screen.getByText(/Step 1: Screen Sharing Permission/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share Entire Screen/i })).toBeInTheDocument();
  });

  it('completes 3-step gate: screen share -> face verification -> start exam', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Algorithms & Data Structures Final Exam')).toBeInTheDocument();
    });

    // --- STEP 1: Screen Share ---
    const shareBtn = screen.getByRole('button', { name: /Share Entire Screen/i });
    await act(async () => {
      fireEvent.click(shareBtn);
    });

    await waitFor(() => {
      expect(sessionsApi.recordScreenShareClearance).toHaveBeenCalledWith('session-101');
    });

    // Advance to Step 2
    const toStep2Btn = screen.getByRole('button', { name: /Proceed to Biometric Check/i });
    expect(toStep2Btn).not.toBeDisabled();
    fireEvent.click(toStep2Btn);

    // --- STEP 2: Biometric Verification ---
    await waitFor(() => {
      expect(screen.getByText(/Step 2: Biometric Facial Identity Verification/i)).toBeInTheDocument();
      const verifyFaceBtn = screen.getByRole('button', { name: /Verify Live Face/i });
      expect(verifyFaceBtn).not.toBeDisabled();
    });

    const verifyFaceBtn = screen.getByRole('button', { name: /Verify Live Face/i });
    await act(async () => {
      fireEvent.click(verifyFaceBtn);
    });

    await waitFor(() => {
      expect(biometricsApi.verifyIdentitySnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-101' })
      );
      expect(screen.getByText(/Biometric Clearance Granted/i)).toBeInTheDocument();
    });

    // Advance to Step 3
    const toStep3Btn = screen.getByRole('button', { name: /Proceed to Final Step/i });
    expect(toStep3Btn).not.toBeDisabled();
    fireEvent.click(toStep3Btn);

    // --- STEP 3: Honor Code & Attempt Launch ---
    await waitFor(() => {
      expect(screen.getByText(/Step 3: Honor Code & Final Examination Entry/i)).toBeInTheDocument();
    });

    const startBtn = screen.getByRole('button', { name: /Start Examination/i });
    expect(startBtn).toBeDisabled(); // Disabled until agreed

    // Check honor code checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(startBtn).not.toBeDisabled();

    // Click start exam
    await act(async () => {
      fireEvent.click(startBtn);
    });

    await waitFor(() => {
      expect(sessionsApi.startAttemptForSession).toHaveBeenCalledWith('session-101');
      expect(screen.getByTestId('exam-started')).toBeInTheDocument();
    });
  });
});
