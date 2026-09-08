/**
 * @file StudentOnboardingPage.jsx
 * @description Candidate academic onboarding form for department and semester completion prior to verification.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as onboardingApi from '../../api/onboardingApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Alert } from '../../components/common/Alert.jsx';

export function StudentOnboardingPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [initialData, setInitialData] = useState(null);
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState('1');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    async function loadStatus() {
      try {
        const data = await onboardingApi.getOnboardingStatus();
        setInitialData(data);
        if (data.department) setDepartment(data.department);
        if (data.semester) setSemester(String(data.semester));
        if (data.phone) setPhone(data.phone);

        if (data.verificationStatus === 'PENDING') {
          navigate('/onboarding/pending', { replace: true });
        } else if (data.verificationStatus === 'VERIFIED') {
          navigate('/candidate', { replace: true });
        }
      } catch (err) {
        setError(err?.message || 'Failed to load onboarding status');
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!department.trim()) {
      setError('Department is required');
      return;
    }

    const semNum = parseInt(semester, 10);
    if (isNaN(semNum) || semNum < 1 || semNum > 8) {
      setError('Semester must be between 1 and 8');
      return;
    }

    setSubmitting(true);
    try {
      await onboardingApi.submitOnboardingProfile({
        department: department.trim(),
        semester: semNum,
        phone: phone.trim() || undefined
      });
      navigate('/onboarding/pending', { replace: true });
    } catch (err) {
      setError(err?.message || 'Failed to submit onboarding profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--color-text-muted)' }}>Loading onboarding profile...</div>
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
      padding: 'var(--space-lg) var(--space-md)'
    }}>
      <Card style={{ maxWidth: '560px', width: '100%', padding: 'var(--space-xl)' }}>
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <div style={{
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-primary-subtle)',
            color: 'var(--color-primary)',
            fontSize: '0.75rem',
            fontWeight: 600,
            marginBottom: 'var(--space-xs)'
          }}>
            Step 2 of 2: Academic Profile
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-base)', margin: 0 }}>
            Student Onboarding
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: 'var(--space-xs)' }}>
            Complete your academic affiliation to submit your account for administrative verification.
          </p>
        </div>

        {initialData?.verificationStatus === 'REJECTED' && (
          <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>
            <strong>Previous Submission Returned:</strong> {initialData.verificationNotes || 'Please correct your details and resubmit.'}
          </Alert>
        )}

        {error && (
          <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-md)',
            background: 'var(--color-bg-surface)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)'
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>CANDIDATE NAME</div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 500, marginTop: '2px' }}>{initialData?.name}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>USN / ENROLLMENT NO.</div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-primary)', marginTop: '2px' }}>
                {initialData?.identifier || initialData?.studentProfile?.enrollmentNumber || 'Assigned by Admin'}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>INSTITUTIONAL EMAIL</div>
              <div style={{ fontSize: '0.9375rem', marginTop: '2px' }}>{initialData?.email}</div>
            </div>
          </div>

          <Input
            id="department"
            label="Academic Department / Program"
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Computer Science and Engineering"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <div>
              <label htmlFor="semester" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 'var(--space-xs)' }}>
                Current Semester
              </label>
              <select
                id="semester"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-bg-surface)',
                  color: 'var(--color-text-base)',
                  fontSize: '0.9375rem'
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
            </div>

            <Input
              id="phone"
              label="Contact Phone (Optional)"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>

          {/* Clarification 1: Phase 24 / Phase 25 stub boundary notice */}
          <div style={{
            background: 'var(--color-info-subtle, rgba(59, 130, 246, 0.08))',
            border: '1px solid var(--color-info-border, rgba(59, 130, 246, 0.2))',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
            fontSize: '0.8125rem',
            color: 'var(--color-text-muted)'
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1rem' }}>ℹ️</span>
              <div>
                <strong style={{ color: 'var(--color-text-base)' }}>Biometric & ID Verification Notice:</strong>
                <p style={{ margin: '4px 0 0 0' }}>
                  Government ID document verification and facial biometric enrollment are scheduled to activate during examination check-in. No photo or document uploads are required at this stage.
                </p>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            style={{ width: '100%', marginTop: 'var(--space-xs)' }}
          >
            Submit for Verification
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
