import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimerDisplay } from '../../src/components/exam/TimerDisplay.jsx';

describe('TimerDisplay Component', () => {
  it('formats tabular remaining time under standard conditions', () => {
    render(
      <TimerDisplay
        formattedTime="45:00"
        isExpired={false}
        isUrgent5Min={false}
        isUrgent1Min={false}
      />
    );

    expect(screen.getByText('45:00')).toBeInTheDocument();
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-label', 'Time Remaining');
  });

  it('applies polite alert styling when time <= 5 minutes', () => {
    render(
      <TimerDisplay
        formattedTime="04:30"
        isExpired={false}
        isUrgent5Min={true}
        isUrgent1Min={false}
      />
    );

    expect(screen.getByText('04:30')).toBeInTheDocument();
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-live', 'polite');
    expect(timer).toHaveAttribute('aria-label', '< 5 Minutes Remaining');
  });

  it('applies assertive critical alert when time <= 1 minute', () => {
    render(
      <TimerDisplay
        formattedTime="00:45"
        isExpired={false}
        isUrgent5Min={false}
        isUrgent1Min={true}
      />
    );

    expect(screen.getByText('00:45')).toBeInTheDocument();
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-live', 'assertive');
    expect(timer).toHaveAttribute('aria-label', 'Final Minute!');
  });

  it('renders expired indicator when isExpired is true', () => {
    render(
      <TimerDisplay
        formattedTime="00:00"
        isExpired={true}
        isUrgent5Min={false}
        isUrgent1Min={false}
      />
    );

    expect(screen.getByText('00:00')).toBeInTheDocument();
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-label', 'Time Expired');
  });
});
