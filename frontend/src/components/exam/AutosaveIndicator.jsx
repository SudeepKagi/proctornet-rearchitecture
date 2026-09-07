/**
 * @file AutosaveIndicator.jsx
 * @description Subtle visual status indicator for autosave progress and offline queue.
 */

import React from 'react';

export function AutosaveIndicator({ status = 'saved' }) {
  if (status === 'saving') {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          fontSize: '0.8125rem',
          color: 'var(--color-primary)',
          fontWeight: 500,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '10px',
            height: '10px',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
          aria-hidden="true"
        />
        <span>Saving...</span>
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          fontSize: '0.8125rem',
          color: 'var(--color-warning)',
          fontWeight: 500,
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-warning)',
          }}
          aria-hidden="true"
        />
        <span>Offline — changes queued</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        fontSize: '0.8125rem',
        color: 'var(--color-text-muted)',
        fontWeight: 500,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>All changes saved</span>
    </div>
  );
}
