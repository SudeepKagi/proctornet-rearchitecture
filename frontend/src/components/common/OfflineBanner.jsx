/**
 * @file OfflineBanner.jsx
 * @description Floating amber banner notifying candidates of network loss and in-memory buffering.
 */

import React from 'react';

export function OfflineBanner({ isOffline }) {
  if (!isOffline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'var(--color-warning-light)',
        borderBottom: '1px solid var(--color-warning-border)',
        color: '#92400e',
        padding: '0.625rem 1.5rem',
        fontSize: '0.875rem',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
        <line x1="12" y1="20" x2="12.01" y2="20"></line>
      </svg>
      <span>
        <strong>Connection lost:</strong> Unsynchronized answers are kept in this tab's memory only. Do not close or refresh this tab.
      </span>
    </div>
  );
}
