import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CandidateResultPage } from '../../src/pages/candidate/CandidateResultPage.jsx';
import * as resultsApi from '../../src/api/resultsApi.js';
import { ApiError } from '../../src/api/client.js';

vi.mock('../../src/api/resultsApi.js');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ attemptId: 'att-res-123' }),
  };
});

describe('CandidateResultPage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders full scorecard on 200 OK without fabricating answer keys', async () => {
    resultsApi.getCandidateResult.mockResolvedValueOnce({
      attempt_id: 'att-res-123',
      exam_title: 'Algorithms Final',
      score: 85,
      total_marks: 100,
      passing_marks: 40,
      percentage: 85.0,
      is_passed: true,
      total_questions: 10,
      correct_count: 8,
      wrong_count: 1,
      unanswered_count: 1,
      evaluated_at: new Date('2026-09-07T12:15:00.000Z').toISOString(),
    });

    render(
      <MemoryRouter>
        <CandidateResultPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Algorithms Final')).toBeInTheDocument();
      expect(screen.getByText('PASSED')).toBeInTheDocument();
      expect(screen.getByText('85 / 100')).toBeInTheDocument();
      expect(screen.getByText('85.00%')).toBeInTheDocument();
      expect(screen.getByText('TOTAL QUESTIONS')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
    });
  });

  it('renders informative waiting message on 403 RESULT_NOT_PUBLISHED', async () => {
    const error = new ApiError('Not published', 403, {
      code: 'RESULT_NOT_PUBLISHED',
      scheduled_publish_at: '2026-09-10T10:00:00.000Z',
    });
    resultsApi.getCandidateResult.mockRejectedValueOnce(error);

    render(
      <MemoryRouter>
        <CandidateResultPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Submission Received!')).toBeInTheDocument();
      expect(screen.getByText(/Results for this exam have not yet been published/i)).toBeInTheDocument();
      expect(screen.getByText(/Scheduled Release:/i)).toBeInTheDocument();
    });
  });

  it('renders grading message with manual refresh button on 404 RESULT_NOT_FOUND', async () => {
    const error = new ApiError('Result not found', 404, { code: 'RESULT_NOT_FOUND' });
    resultsApi.getCandidateResult.mockRejectedValueOnce(error);

    render(
      <MemoryRouter>
        <CandidateResultPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Grading in Progress')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Check Status \/ Refresh/i })).toBeInTheDocument();
    });

    // Test clicking manual refresh button
    resultsApi.getCandidateResult.mockResolvedValueOnce({
      score: 90,
      total_marks: 100,
      is_passed: true,
      total_questions: 10,
      correct_count: 9,
      wrong_count: 1,
      unanswered_count: 0,
    });

    const refreshBtn = screen.getByRole('button', { name: /Check Status \/ Refresh/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText('PASSED')).toBeInTheDocument();
    });
  });

  it('renders resume button on 409 ATTEMPT_ACTIVE', async () => {
    const error = new ApiError('Attempt active', 409, { code: 'ATTEMPT_ACTIVE' });
    resultsApi.getCandidateResult.mockRejectedValueOnce(error);

    render(
      <MemoryRouter>
        <CandidateResultPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Examination Attempt Active')).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /Resume Examination Attempt/i });
    fireEvent.click(resumeBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/candidate/attempts/att-res-123');
  });
});
