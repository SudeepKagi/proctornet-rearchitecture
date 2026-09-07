/**
 * @file PreExamReadinessPage.jsx
 * @description Pre-exam check-in screen with instructions, readiness verification, and attempt launch.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as sessionsApi from '../../api/sessionsApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge, getStatusBadgeVariant } from '../../components/common/Badge.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function PreExamReadinessPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [existingAttempt, setExistingAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [sessionData, myAttempt] = await Promise.all([
          sessionsApi.getSession(sessionId),
          sessionsApi.getMyAttempt(sessionId).catch(() => null),
        ]);
        setSession(sessionData);
        setExistingAttempt(myAttempt);
      } catch (err) {
        setError(err.message || 'Failed to load examination readiness data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [sessionId]);

  async function handleStartOrResume() {
    setError('');

    // If attempt already active, resume directly
    if (existingAttempt?.id && existingAttempt.status === 'ACTIVE') {
      navigate(`/candidate/attempts/${existingAttempt.id}`);
      return;
    }

    // If attempt already submitted, view results
    if (existingAttempt?.id && existingAttempt.status === 'SUBMITTED') {
      navigate(`/candidate/attempts/${existingAttempt.id}/result`);
      return;
    }

    setStarting(true);
    try {
      const attempt = await sessionsApi.startAttemptForSession(sessionId);
      navigate(`/candidate/attempts/${attempt.id}`);
    } catch (err) {
      setError(err.message || 'Could not start examination attempt');
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Spinner size="lg" label="Checking examination readiness..." />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container" style={{ maxWidth: '600px' }}>
        <Card style={{ textAlign: 'center', padding: '2rem' }}>
          <h2>Session Not Found</h2>
          <p style={{ color: 'var(--color-text-muted)', margin: '1rem 0' }}>
            The requested examination session could not be found or you are not enrolled.
          </p>
          <Button onClick={() => navigate('/candidate')}>Return to Dashboard</Button>
        </Card>
      </div>
    );
  }

  const isSessionLive = session.status === 'ACTIVE';

  return (
    <div className="container" style={{ maxWidth: '720px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Button variant="secondary" size="sm" onClick={() => navigate('/candidate')} style={{ marginBottom: '1rem' }}>
          &larr; Back to Sessions
        </Button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            {session.exam_title || `Examination #${session.id.slice(0, 8)}`}
          </h1>
          <Badge variant={getStatusBadgeVariant(session.status)}>
            {session.status}
          </Badge>
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
          Pre-assessment readiness check and integrity instructions.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-danger-light)',
            border: '1px solid var(--color-danger-border)',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}

      <Card style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', color: 'var(--color-text-primary)' }}>
          Assessment Specifications
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
          <div>
            <span style={{ color: 'var(--color-text-muted)' }}>Allocated Time:</span>{' '}
            <strong>{session.exam_duration_minutes || 60} Minutes</strong>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-muted)' }}>Campus Room:</span>{' '}
            <strong>{session.room_name || 'Virtual / Online'}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-muted)' }}>Start Window:</span>{' '}
            <strong>{new Date(session.start_time).toLocaleString()}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-muted)' }}>Closing Window:</span>{' '}
            <strong>{new Date(session.end_time).toLocaleString()}</strong>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem', color: 'var(--color-text-primary)' }}>
          Candidate Rules & Integrity Guidelines
        </h3>
        <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-body)', lineHeight: 1.7 }}>
          <li>
            <strong>Authoritative Server Countdown</strong>: The remaining time is validated authoritatively against server timestamps. Local clock adjustments will not extend your attempt.
          </li>
          <li>
            <strong>Automatic Autosave</strong>: Your responses are continuously debounced and synchronized to the server every second.
          </li>
          <li>
            <strong>In-Memory Offline Resilience</strong>: If network connection is interrupted, unsaved responses remain in this tab's memory. <em>Do not close or reload this tab</em>.
          </li>
          <li>
            <strong>Irreversible Submission</strong>: Submitting an exam is permanent. Once submitted, answers cannot be edited or rescinded.
          </li>
        </ul>

        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border-subtle)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
            />
            <span>I acknowledge and agree to adhere to all assessment rules and academic integrity policies.</span>
          </label>
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
        <Button variant="secondary" onClick={() => navigate('/candidate')}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={!agreed || (!isSessionLive && !existingAttempt) || starting}
          loading={starting}
          onClick={handleStartOrResume}
        >
          {existingAttempt?.status === 'ACTIVE'
            ? 'Resume Active Attempt'
            : existingAttempt?.status === 'SUBMITTED'
            ? 'View Submitted Results'
            : isSessionLive
            ? 'Begin Examination'
            : 'Session Not Active'}
        </Button>
      </div>
    </div>
  );
}
