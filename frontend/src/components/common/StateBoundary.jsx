/**
 * @file StateBoundary.jsx
 * @description Standardized accessible wrapper for Loading, Empty, Error, and Retry states.
 * Conforms to WCAG 2.1 AA (role="status" for loading/empty, role="alert" for error, accessible retry).
 */

import React from 'react';
import { Spinner } from './Spinner.jsx';
import { Button } from './Button.jsx';

export function StateBoundary({
  isLoading = false,
  error = null,
  isEmpty = false,
  loadingMessage = 'Loading content, please wait...',
  emptyTitle = 'No items found',
  emptyDescription = 'There is currently no data to display.',
  onRetry = null,
  children
}) {
  if (isLoading) {
    return (
      <div
        data-testid="state-boundary-loading"
        aria-live="polite"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem 1.5rem',
          textAlign: 'center',
          gap: '1rem',
          minHeight: '180px'
        }}
      >
        <Spinner size="lg" />
        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted, #64748b)' }}>
          {loadingMessage}
        </span>
      </div>
    );
  }

  if (error) {
    const errorMessage = typeof error === 'string' ? error : error?.message || 'An unexpected error occurred.';

    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          padding: '2rem 1.5rem',
          borderRadius: 'var(--radius-lg, 12px)',
          backgroundColor: 'var(--color-danger-light, #fef2f2)',
          border: '1px solid var(--color-danger-border, #fecaca)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '0.75rem',
          minHeight: '180px'
        }}
      >
        <div
          aria-hidden="true"
          style={{
            fontSize: '1.75rem',
            lineHeight: 1
          }}
        >
          ⚠️
        </div>
        <h4
          style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--color-danger, #dc2626)'
          }}
        >
          Something went wrong
        </h4>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: 'var(--color-text-body, #334155)',
            maxWidth: '480px'
          }}
        >
          {errorMessage}
        </p>
        {onRetry && (
          <div style={{ marginTop: '0.5rem' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: '3rem 1.5rem',
          borderRadius: 'var(--radius-lg, 12px)',
          border: '1px dashed var(--color-border-medium, #cbd5e1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '0.5rem',
          minHeight: '180px',
          backgroundColor: 'var(--color-surface-secondary, #f8fafc)'
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--color-text-primary, #0f172a)'
          }}
        >
          {emptyTitle}
        </h4>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: 'var(--color-text-muted, #64748b)',
            maxWidth: '400px'
          }}
        >
          {emptyDescription}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export default StateBoundary;
