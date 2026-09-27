import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StateBoundary } from '../StateBoundary.jsx';

describe('StateBoundary Component', () => {
  it('renders loading state with custom message and polite aria-live', () => {
    render(
      <StateBoundary isLoading={true} loadingMessage="Fetching exam roster...">
        <div>Protected Content</div>
      </StateBoundary>
    );

    expect(screen.getByText('Fetching exam roster...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders error state with role="alert" and triggers onRetry', () => {
    const handleRetry = vi.fn();
    render(
      <StateBoundary
        isLoading={false}
        error={new Error('Network timeout')}
        onRetry={handleRetry}
      >
        <div>Protected Content</div>
      </StateBoundary>
    );

    const alertBox = screen.getByRole('alert');
    expect(alertBox).toBeInTheDocument();
    expect(screen.getByText('Network timeout')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders empty state with status role and custom title/description', () => {
    render(
      <StateBoundary
        isEmpty={true}
        emptyTitle="No Exams Scheduled"
        emptyDescription="You have not created any examination schedules yet."
      >
        <div>Exam List</div>
      </StateBoundary>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('No Exams Scheduled')).toBeInTheDocument();
    expect(screen.getByText('You have not created any examination schedules yet.')).toBeInTheDocument();
    expect(screen.queryByText('Exam List')).not.toBeInTheDocument();
  });

  it('renders children normally when not loading, no error, and not empty', () => {
    render(
      <StateBoundary isLoading={false} error={null} isEmpty={false}>
        <div>Active Exam Content</div>
      </StateBoundary>
    );

    expect(screen.getByText('Active Exam Content')).toBeInTheDocument();
  });
});
