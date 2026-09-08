/**
 * @file RegisterPage.jsx
 * @description Public self-registration notice. Under Phase 23, public self-registration is strictly disabled.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-bg-base)',
        padding: '1rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <Card padding="spacious" style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-primary-subtle)',
              color: 'var(--color-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>

          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>
            Self-Registration Disabled
          </h2>

          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', lineHeight: 1.5, margin: '0 0 1.5rem 0' }}>
            In accordance with university examination security policy, Student and Faculty accounts must be provisioned directly by your institutional administrator or academic department.
          </p>

          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', lineHeight: 1.5, margin: '0 0 1.5rem 0' }}>
            If your account has already been created, please sign in using your institutional email and temporary password to complete your onboarding setup.
          </p>

          <Button
            type="button"
            variant="primary"
            size="lg"
            style={{ width: '100%' }}
            onClick={() => navigate('/login')}
          >
            Go to Sign In
          </Button>
        </Card>
      </div>
    </div>
  );
}
