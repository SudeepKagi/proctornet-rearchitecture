/**
 * @file VerificationPendingPage.jsx
 * @description Informs candidate/faculty that their submitted onboarding profile is pending administrative approval.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as onboardingApi from '../../api/onboardingApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';

export function VerificationPendingPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [statusData, setStatusData] = useState(null);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const data = await onboardingApi.getOnboardingStatus();
      setStatusData(data);
      if (data.verificationStatus === 'VERIFIED') {
        if (user?.roles?.includes('FACULTY')) {
          navigate('/faculty', { replace: true });
        } else {
          navigate('/candidate', { replace: true });
        }
      } else if (data.verificationStatus === 'REJECTED') {
        navigate('/onboarding/rejected', { replace: true });
      }
    } catch {
      // Ignore poll error
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-base)',
      padding: 'var(--space-md)'
    }}>
      <Card style={{ maxWidth: '480px', width: '100%', padding: 'var(--space-xl)', textAlign: 'center' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'rgba(234, 179, 8, 0.1)',
          color: '#ca8a04',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-md)'
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-base)', margin: '0 0 var(--space-xs) 0' }}>
          Verification Pending
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', lineHeight: 1.5, margin: 0 }}>
          Your profile details have been submitted and are currently under administrative review. Once verified by your institution, you will gain access to your dashboard and examination schedule.
        </p>

        {statusData && (
          <div style={{
            margin: 'var(--space-lg) 0',
            textAlign: 'left',
            background: 'var(--color-bg-surface)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
            fontSize: '0.8125rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Status:</span>
              <span style={{ fontWeight: 600, color: '#ca8a04' }}>UNDER REVIEW</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Department:</span>
              <span style={{ fontWeight: 500 }}>{statusData.department || '—'}</span>
            </div>
            {statusData.semester && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Semester:</span>
                <span style={{ fontWeight: 500 }}>Semester {statusData.semester}</span>
              </div>
            )}
            {statusData.designation && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Designation:</span>
                <span style={{ fontWeight: 500 }}>{statusData.designation}</span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <Button
            type="button"
            variant="primary"
            loading={checking}
            onClick={checkStatus}
            style={{ width: '100%' }}
          >
            Check Status Now
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={logout}
            style={{ width: '100%' }}
          >
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
}
