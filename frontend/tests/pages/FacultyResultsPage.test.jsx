import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FacultyResultsPage } from '../../src/pages/faculty/FacultyResultsPage.jsx';
import * as resultsApi from '../../src/api/resultsApi.js';
import * as examsApi from '../../src/api/examsApi.js';

vi.mock('../../src/api/resultsApi.js');
vi.mock('../../src/api/examsApi.js');

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ examId: 'ex-test-101' }),
  };
});

describe('FacultyResultsPage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    examsApi.getExam.mockResolvedValue({
      id: 'ex-test-101',
      title: 'Database Architecture Exam',
      status: 'ENDED',
      results_release_policy: 'MANUAL',
    });
    resultsApi.getExamResultsSummary.mockResolvedValue({
      total_attempts: 25,
      evaluated_count: 25,
      pass_count: 22,
      fail_count: 3,
      average_score: 78.4,
    });
    resultsApi.getExamResults.mockResolvedValue([
      {
        attempt_id: 'att-1',
        student_name: 'John Student',
        student_email: 'john@uni.edu',
        score: 82,
        total_marks: 100,
        percentage: 82.0,
        is_passed: true,
      },
    ]);
  });

  it('renders class KPI summary cards and candidate performance table', async () => {
    render(
      <MemoryRouter>
        <FacultyResultsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Database Architecture Exam')).toBeInTheDocument();
      expect(screen.getByText('TOTAL ATTEMPTS')).toBeInTheDocument();
      expect(screen.getAllByText('25')).toHaveLength(2);
      expect(screen.getByText('78.4')).toBeInTheDocument();
      expect(screen.getByText('John Student')).toBeInTheDocument();
      expect(screen.getByText(/82\s*\/\s*100/)).toBeInTheDocument();
    });

  });

  it('opens manual publication modal and dispatches publish call', async () => {
    resultsApi.publishExamResults.mockResolvedValueOnce({
      status: 'success',
      published_count: 25,
    });

    render(
      <MemoryRouter>
        <FacultyResultsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Publish Results Now/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Publish Results Now/i }));

    expect(screen.getByText('Publish Results to Candidates')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Confirm Publication/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(resultsApi.publishExamResults).toHaveBeenCalledWith('ex-test-101');
    });
  });
});
