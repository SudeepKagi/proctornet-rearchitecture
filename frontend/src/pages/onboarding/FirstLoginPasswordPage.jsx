/**
 * @file FirstLoginPasswordPage.jsx
 * @description Mandatory first-login password change page for newly provisioned accounts.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as onboardingApi from '../../api/onboardingApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Alert } from '../../components/common/Alert.jsx';

export function FirstLoginPasswordPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters in length');
      return;
    }

    setLoading(true);
    try {
      await onboardingApi.changeFirstLoginPassword(currentPassword, newPassword);
      // Navigate to academic profile
      if (user?.roles?.includes('FACULTY')) {
        navigate('/onboarding/faculty', { replace: true });
      } else if (user?.roles?.includes('STUDENT')) {
        navigate('/onboarding/student', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err?.message || 'Failed to update temporary password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-base)',
      padding: 'var(--space-md)'
    }}>
      <Card style={{ maxWidth: '480px', width: '100%', padding: 'var(--space-xl)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--color-primary-subtle)',
            color: 'var(--color-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-sm)'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-base)', margin: 0 }}>
            Security Setup Required
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: 'var(--space-xs)' }}>
            Your account was provisioned with a temporary password. Please set a secure permanent password to continue.
          </p>
        </div>

        {error && (
          <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <Input
            id="current-password"
            label="Temporary Password"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter the password provided by administrator"
          />

          <Input
            id="new-password"
            label="New Permanent Password"
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 12 characters (upper, lower, number, symbol)"
          />

          <Input
            id="confirm-password"
            label="Confirm New Password"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
          />

          <div style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-sm)',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)'
          }}>
            <strong>Password requirements:</strong>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>At least 12 characters long</li>
              <li>Includes uppercase & lowercase letters</li>
              <li>Includes at least one digit (0-9)</li>
              <li>Includes at least one special character (!@#$%^&*)</li>
            </ul>
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            style={{ width: '100%', marginTop: 'var(--space-xs)' }}
          >
            Update Password & Continue
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={logout}
            style={{ width: '100%' }}
          >
            Sign Out
          </Button>
        </form>
      </Card>
    </div>
  );
}
