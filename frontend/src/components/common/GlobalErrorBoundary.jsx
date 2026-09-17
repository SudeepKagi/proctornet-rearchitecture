/**
 * @file GlobalErrorBoundary.jsx
 * @description Application-wide React Error Boundary.
 * Catches unhandled runtime render exceptions, prevents white-screen crashes,
 * displays an accessible light-theme recovery interface, and provides
 * Try Again, Go to Dashboard, and Go to Home actions.
 */

import React from 'react';

export class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      referenceId: null,
    };
  }

  static getDerivedStateFromError(error) {
    const referenceId = `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    return {
      hasError: true,
      error,
      referenceId,
    };
  }

  componentDidCatch(error, errorInfo) {
    const safeMessage = error?.message || 'Unknown render exception';
    const componentStack = errorInfo?.componentStack || '';

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

  handleGoDashboard = () => {
    this.setState({ hasError: false, error: null, referenceId: null });
    window.location.href = '/dashboard';
  };

  handleGoHome = () => {
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
            backgroundColor: 'var(--color-canvas, #f8fafc)',
            color: 'var(--color-text-primary, #0f172a)',
            fontFamily: 'var(--font-family-sans, system-ui, -apple-system, sans-serif)',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: '#ffffff',
              border: '1px solid var(--color-border-subtle, #e2e8f0)',
              borderRadius: 'var(--radius-lg, 12px)',
              padding: '2.5rem 2rem',
              textAlign: 'center',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
            }}
          >
            {/* Warning Shield Graphic */}
            <div
              aria-hidden="true"
              style={{
                width: '56px',
                height: '56px',
                margin: '0 auto 1.25rem auto',
                borderRadius: '50%',
                backgroundColor: 'var(--color-danger-light, #fef2f2)',
                border: '1px solid var(--color-danger-border, #fecaca)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
              }}
            >
              ⚠️
            </div>

            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                margin: '0 0 0.5rem 0',
                color: 'var(--color-text-primary, #0f172a)',
              }}
            >
              Something went wrong.
            </h1>

            <p
              style={{
                fontSize: '1rem',
                lineHeight: 1.5,
                color: 'var(--color-text-body, #334155)',
                margin: '0 0 1.5rem 0',
              }}
            >
              ProctorNet could not load this page.
            </p>

            {referenceId && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.375rem 0.75rem',
                  backgroundColor: 'var(--color-surface-secondary, #f1f5f9)',
                  border: '1px solid var(--color-border-subtle, #e2e8f0)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: 'var(--color-text-muted, #64748b)',
                  marginBottom: '1.75rem',
                }}
              >
                <span>Diagnostic Reference:</span>
                <strong>{referenceId}</strong>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={this.handleRetry}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: 'var(--radius-sm, 6px)',
                  backgroundColor: 'var(--color-primary, #2563eb)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #2563eb)')}
              >
                Try again
              </button>

              <button
                type="button"
                onClick={this.handleGoDashboard}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: 'var(--radius-sm, 6px)',
                  backgroundColor: '#ffffff',
                  color: 'var(--color-text-body, #334155)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  border: '1px solid var(--color-border-medium, #cbd5e1)',
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-secondary, #f1f5f9)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
              >
                Go to Dashboard
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: 'var(--radius-sm, 6px)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-muted, #64748b)',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  border: '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'color 150ms ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-muted, #64748b)')}
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
