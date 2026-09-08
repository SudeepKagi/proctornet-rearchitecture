/**
 * @file VerificationRejectedPage.jsx
 * @description Informs candidate/faculty that their onboarding profile was rejected with review notes, allowing correction and resubmission.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as onboardingApi from '../../api/onboardingApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Alert } from '../../components/common/Alert.jsx';

export function VerificationRejectedPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const data = await onboardingApi.getOnboardingStatus();
        setStatusData(data);
        if (data.verificationStatus === 'VERIFIED') {
          if (user?.roles?.includes('FACULTY')) {
            navigate('/faculty', { replace: true });
          } else {
            navigate('/candidate', { replace: true });
          }
        } else if (data.verificationStatus === 'PENDING') {
          navigate('/onboarding/pending', { replace: true });
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, [navigate, user]);

  const handleResubmit = () => {
    if (user?.roles?.includes('FACULTY')) {
      navigate('/onboarding/faculty');
    } else {
      navigate('/onboarding/student');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--color-text-muted)' }}>Loading verification report...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-base)',
      padding: 'var(--space-md)'
    }}>
      <Card style={{ maxWidth: '520px', width: '100%', padding: 'var(--space-xl)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-md)'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-base)', margin: '0 0 var(--space-xs) 0' }}>
            Verification Returned
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', lineHeight: 1.5, margin: 0 }}>
            Your submitted onboarding profile could not be verified by the administrator. Please review the notes below, update your details, and resubmit.
          </p>
        </div>

        <Alert variant="danger" style={{ marginBottom: 'var(--space-lg)' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Administrator Review Notes:</div>
          <div>{statusData?.verificationNotes || 'Details do not match university registrar records. Please verify and correct your department and affiliation.'}</div>
        </Alert>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <Button
            type="button"
            variant="primary"
            onClick={handleResubmit}
            style={{ width: '100%' }}
          >
            Update & Resubmit Profile
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
