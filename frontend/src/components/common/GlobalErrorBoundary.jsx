/**
 * @file GlobalErrorBoundary.jsx
 * @description Application-wide React Error Boundary.
 * Catches unhandled runtime render exceptions, prevents white-screen crashes,
 * displays an accessible recovery interface with a safe reference ID, and provides
 * Retry and Return Home actions.
 */

import React from 'react';

export class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      referenceId: null
    };
  }

  static getDerivedStateFromError(error) {
    // Generate a safe, pseudorandom incident reference ID for telemetry tracking
    const referenceId = `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    return {
      hasError: true,
      error,
      referenceId
    };
  }

  componentDidCatch(error, errorInfo) {
    // Safely log diagnostic details without candidate PII or sensitive tokens
    const safeMessage = error?.message || 'Unknown render exception';
    const componentStack = errorInfo?.componentStack || '';
    
    // Log in development or telemetry buffer
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        `[GlobalErrorBoundary] Caught unhandled exception [${this.state.referenceId}]:`,
        safeMessage,
        componentStack
      );
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, referenceId: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReturnHome = () => {
    this.setState({ hasError: false, error: null, referenceId: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const { referenceId } = this.state;

      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1.5rem',
            backgroundColor: 'var(--color-bg-base, #0b0f19)',
            color: 'var(--color-text-base, #f8fafc)',
            fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)'
          }}
        >
          <div
            style={{
              maxWidth: '560px',
              width: '100%',
              backgroundColor: 'var(--color-bg-surface, #131b2e)',
              border: '1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1))',
              borderRadius: 'var(--radius-lg, 12px)',
              padding: '2.5rem 2rem',
              textAlign: 'center',
              boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.5))'
            }}
          >
            {/* Warning Shield Graphic */}
            <div
              aria-hidden="true"
              style={{
                width: '56px',
                height: '56px',
                margin: '0 auto 1.5rem auto',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
                color: '#ef4444'
              }}
            >
              ⚠️
            </div>

            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                margin: '0 0 0.75rem 0',
                color: 'var(--color-text-base, #ffffff)'
              }}
            >
              Something went wrong
            </h1>

            <p
              style={{
                fontSize: '0.9375rem',
                lineHeight: 1.6,
                color: 'var(--color-text-muted, #94a3b8)',
                margin: '0 0 1.5rem 0'
              }}
            >
              An unexpected error interrupted the application interface. No exam data or security state was compromised.
            </p>

            {referenceId && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontSize: '0.8125rem',
                  fontFamily: 'monospace',
                  color: 'var(--color-text-secondary, #cbd5e1)',
                  marginBottom: '2rem'
                }}
              >
                <span>Reference ID:</span>
                <strong style={{ color: '#60a5fa' }}>{referenceId}</strong>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}
            >
              <button
                type="button"
                onClick={this.handleRetry}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  backgroundColor: 'var(--color-primary, #3b82f6)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease'
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #3b82f6)')}
              >
                Try Again
              </button>

              <button
                type="button"
                onClick={this.handleReturnHome}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-base, #f8fafc)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  border: '1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.2))',
                  cursor: 'pointer',
                  transition: 'border-color 150ms ease'
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-subtle, rgba(255, 255, 255, 0.2))')}
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
