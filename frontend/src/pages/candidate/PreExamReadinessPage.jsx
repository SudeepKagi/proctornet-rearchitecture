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
import { stopMediaStream } from '../../hooks/useMediaCapture.js';
import { setAntiTamperToken } from '../../api/client.js';

export function PreExamReadinessPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [existingAttempt, setExistingAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');

  // Media readiness preview state
  const [previewStream, setPreviewStream] = useState(null);
  const [mediaCheckStatus, setMediaCheckStatus] = useState('IDLE'); // 'IDLE' | 'CHECKING' | 'READY' | 'FAILED'
  const [mediaError, setMediaError] = useState('');
  const previewVideoRef = React.useRef(null);

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

  const cleanupPreview = React.useCallback(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    stopMediaStream(previewStream);
    setPreviewStream(null);
  }, [previewStream]);

  // Clean up preview stream on unmount or beforeunload to prevent hardware locks
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupPreview();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupPreview();
    };
  }, [cleanupPreview]);

  async function testCameraAndMic() {
    cleanupPreview();
    setMediaCheckStatus('CHECKING');
    setMediaError('');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('WebRTC camera and microphone access not supported in this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 20 } },
        audio: true
      });

      setPreviewStream(stream);
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.play().catch(() => {});
      }
      setMediaCheckStatus('READY');
    } catch (err) {
      setMediaCheckStatus('FAILED');
      setMediaError(err.name === 'NotAllowedError' ? 'Camera and microphone permission denied' : err.message);
      cleanupPreview();
    }
  }

  async function handleStartOrResume() {
    setError('');

    // Mandatory hardware release before route change
    cleanupPreview();

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
      if (attempt?.anti_tamper_token) {
        setAntiTamperToken(attempt.anti_tamper_token);
      }
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
          Hardware Readiness Check (Webcam & Microphone)
        </h3>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          This proctored examination requires active video and audio surveillance. Verify that your camera and microphone function properly before starting.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          {previewStream ? (
            <div style={{ width: '100%', maxWidth: '400px', aspectRatio: '4/3', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#000' }}>
              <video ref={previewVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: '400px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-subtle, #1e293b)', borderRadius: '8px', color: 'var(--color-text-muted)' }}>
              {mediaCheckStatus === 'CHECKING' ? 'Requesting Device Access...' : 'Camera Preview Inactive'}
            </div>
          )}

          {mediaError && (
            <div style={{ color: 'var(--color-danger, #ef4444)', fontSize: '0.875rem' }}>
              {mediaError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              size="sm"
              loading={mediaCheckStatus === 'CHECKING'}
              onClick={testCameraAndMic}
            >
              {mediaCheckStatus === 'READY' ? 'Re-test Hardware' : 'Test Camera & Microphone'}
            </Button>
            {previewStream && (
              <Button variant="secondary" size="sm" onClick={cleanupPreview}>
                Turn Off Preview
              </Button>
            )}
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
