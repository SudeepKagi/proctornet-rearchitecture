/**
 * @file TimerDisplay.jsx
 * @description Tabular visual countdown timer with 5-minute and 1-minute urgency styles.
 */

import React from 'react';

export function TimerDisplay({
  formattedTime,
  isExpired,
  isUrgent5Min,
  isUrgent1Min,
}) {
  let borderColor = 'var(--color-border-medium)';
  let textColor = 'var(--color-text-primary)';
  let bgColor = 'var(--color-surface)';
  let urgencyLabel = 'Time Remaining';

  if (isExpired) {
    borderColor = 'var(--color-danger-border)';
    textColor = 'var(--color-danger)';
    bgColor = 'var(--color-danger-light)';
    urgencyLabel = 'Time Expired';
  } else if (isUrgent1Min) {
    borderColor = 'var(--color-danger)';
    textColor = 'var(--color-danger)';
    bgColor = 'var(--color-danger-light)';
    urgencyLabel = 'Final Minute!';
  } else if (isUrgent5Min) {
    borderColor = 'var(--color-warning)';
    textColor = 'var(--color-warning)';
    bgColor = 'var(--color-warning-light)';
    urgencyLabel = '< 5 Minutes Remaining';
  }

  return (
    <div
      role="timer"
      aria-label={urgencyLabel}
      aria-live={isUrgent1Min ? 'assertive' : isUrgent5Min ? 'polite' : 'off'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0.375rem 0.875rem',
        borderRadius: 'var(--radius-sm)',
        border: `1.5px solid ${borderColor}`,
        backgroundColor: bgColor,
        transition: 'all var(--transition-fast)',
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: textColor }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>

      <span
        style={{
          fontFamily: 'var(--font-family-mono)',
          fontWeight: 700,
          fontSize: '1rem',
          letterSpacing: '0.05em',
          color: textColor,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {isExpired ? '00:00' : formattedTime}
      </span>
    </div>
  );
}
