/**
 * @file Spinner.jsx
 * @description Accessible loading spinner component.
 */

import React from 'react';

export function Spinner({ size = 'md', color = 'var(--color-primary)', label = 'Loading...' }) {
  const sizeMap = {
    sm: 16,
    md: 24,
    lg: 36,
  };

  const pixelSize = sizeMap[size] || 24;

  return (
    <div
      role="status"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          animation: 'spin 0.8s linear infinite',
        }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          style={{ opacity: 0.2, color }}
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ color }}
        />
      </svg>
      <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
        {label}
      </span>
    </div>
  );
}
