import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExamTakingPage } from '../../src/pages/candidate/ExamTakingPage.jsx';
import * as attemptsApi from '../../src/api/attemptsApi.js';
import * as answersApi from '../../src/api/answersApi.js';

// Phase 16: ExamTakingPage uses useRealtime for candidate heartbeat pulses and
// invigilator warning/session-concluded events. Mock the hook to expose the
// exact interface the component consumes without requiring a RealtimeProvider.
vi.mock('../../src/hooks/useRealtime.js', () => ({
  useRealtime: () => ({
    sendHeartbeat: vi.fn(),
    status: 'CONNECTED',
    isDegraded: false,
    isConnected: true,
    subscribe: vi.fn(() => () => {}),
    unsubscribe: vi.fn()
  })
}));

vi.mock('../../src/api/attemptsApi.js');
vi.mock('../../src/api/answersApi.js');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ attemptId: 'att-test-123' }),
  };
});

describe('ExamTakingPage Integration', () => {
  const mockAttempt = {
    id: 'att-test-123',
    exam_title: 'Computer Systems Exam',
    status: 'ACTIVE',
    server_time: new Date('2026-09-07T12:00:00.000Z').toISOString(),
    expires_at: new Date('2026-09-07T12:30:00.000Z').toISOString(),
    time_remaining_seconds: 1800,
  };

  const mockQuestions = [
    {
      id: 'q1',
      prompt: 'Question 1: What is CPU clock speed?',
      question_type: 'MCQ',
      points: 2,
      options: [
        { id: 'opt-1a', text: 'Cycles per second' },
        { id: 'opt-1b', text: 'Memory size' },
      ],
    },
    {
      id: 'q2',
      prompt: 'Question 2: RAM is non-volatile memory.',
      question_type: 'TRUE_FALSE',
      points: 1,
      options: [
        { id: 'opt-2a', text: 'True' },
        { id: 'opt-2b', text: 'False' },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    attemptsApi.getAttempt.mockResolvedValue(mockAttempt);
    attemptsApi.getAttemptQuestions.mockResolvedValue(mockQuestions);
    answersApi.getAnswers.mockResolvedValue([]);
    answersApi.saveAnswer.mockResolvedValue({ revision_id: 2 });
  });

  it('mounts active exam attempt and navigates between questions', async () => {
    render(
      <MemoryRouter initialEntries={['/candidate/attempts/att-test-123']}>
        <ExamTakingPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Computer Systems Exam')).toBeInTheDocument();
      expect(screen.getByText('Question 1: What is CPU clock speed?')).toBeInTheDocument();
      expect(screen.getByText('Question Palette')).toBeInTheDocument();
    });

    // Next question navigation
    const nextBtn = screen.getByRole('button', { name: /Next Question/i });
    fireEvent.click(nextBtn);

    expect(screen.getByText('Question 2: RAM is non-volatile memory.')).toBeInTheDocument();

    // Previous question navigation
    const prevBtn = screen.getByRole('button', { name: /Previous Question/i });
    fireEvent.click(prevBtn);

    expect(screen.getByText('Question 1: What is CPU clock speed?')).toBeInTheDocument();
  });

  it('submits exam with mandatory Idempotency-Key and redirects on 200 OK', async () => {
    attemptsApi.submitAttempt.mockResolvedValueOnce({
      id: 'att-test-123',
      status: 'SUBMITTED',
    });

    render(
      <MemoryRouter initialEntries={['/candidate/attempts/att-test-123']}>
        <ExamTakingPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Computer Systems Exam')).toBeInTheDocument();
    });

    // Click Submit Exam in header
    const submitBtn = screen.getByRole('button', { name: /^Submit Exam$/i });
    fireEvent.click(submitBtn);

    // Modal opens
    expect(screen.getByText('Confirm Exam Submission')).toBeInTheDocument();
    expect(screen.getByText(/Submission is permanent and irreversible/i)).toBeInTheDocument();

    // Confirm submission
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Submit Exam/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(attemptsApi.submitAttempt).toHaveBeenCalledTimes(1);
      const [calledAttemptId, calledPayload, calledIdempotencyKey] = attemptsApi.submitAttempt.mock.calls[0];
      expect(calledAttemptId).toBe('att-test-123');
      expect(calledIdempotencyKey).toBeTruthy();
      expect(mockNavigate).toHaveBeenCalledWith('/candidate/attempts/att-test-123/result', { replace: true });
    });
  });

  it('displays accurate non-durable offline copy on submission failure and reuses same Idempotency-Key on retry', async () => {
    // First attempt fails (e.g. offline / network drop)
    attemptsApi.submitAttempt.mockRejectedValueOnce(new Error('Network offline'));

    render(
      <MemoryRouter initialEntries={['/candidate/attempts/att-test-123']}>
        <ExamTakingPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Computer Systems Exam')).toBeInTheDocument();
    });

    // Click submit
    const submitBtn = screen.getByRole('button', { name: /^Submit Exam$/i });
    fireEvent.click(submitBtn);

    const confirmBtn = screen.getByRole('button', { name: /Confirm & Submit Exam/i });
    fireEvent.click(confirmBtn);

    // Verify OFFLINE != SUBMITTED: exact copy appears, no redirect occurs
    await waitFor(() => {
      expect(screen.getByText(/Submission could not be completed because you're offline. Your unsynchronized answers remain in this tab. Reconnect and try again. Do not close or refresh this tab./i)).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    const firstKey = attemptsApi.submitAttempt.mock.calls[0][2];
    expect(firstKey).toBeTruthy();

    // Now user reconnects and clicks Retry Submission
    attemptsApi.submitAttempt.mockResolvedValueOnce({ status: 'SUBMITTED' });

    const retryBtn = screen.getByRole('button', { name: /Retry Submission/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(attemptsApi.submitAttempt).toHaveBeenCalledTimes(2);
      const secondKey = attemptsApi.submitAttempt.mock.calls[1][2];
      // CRITICAL CONTRACT CHECK: Retrying the same logical submission reuses the exact same Idempotency-Key
      expect(secondKey).toBe(firstKey);
      expect(mockNavigate).toHaveBeenCalledWith('/candidate/attempts/att-test-123/result', { replace: true });
    });
  });
});
