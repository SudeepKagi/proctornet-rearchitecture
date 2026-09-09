/**
 * @file InterventionModals.jsx
 * @description Dialog modals for invigilator interventions: Room Announcements, Direct Messages/Warnings,
 * Remote Pause, Remote Resume, and Emergency Termination.
 * Conforms to Phase 26 Track 2 Workstream F.
 */

import React, { useState } from 'react';
import { Button } from '../common/Button.jsx';
import * as interventionsApi from '../../api/interventionsApi.js';

export function AnnouncementModal({ isOpen, sessionId, onClose, onSuccess }) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      await interventionsApi.broadcastAnnouncement(sessionId, message.trim());
      setMessage('');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to broadcast announcement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ maxWidth: '480px', width: '100%', background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Broadcast Room Announcement</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0 0 1rem 0' }}>
          This message will appear immediately on the screens of all active candidates in this session.
        </p>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            required
            placeholder="e.g. 15 minutes remaining. Please verify you have answered all questions."
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.375rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', marginBottom: '1rem' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={submitting || !message.trim()}>{submitting ? 'Broadcasting...' : 'Broadcast to Room'}</Button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

export function CandidateMessageModal({ isOpen, candidate, attemptId, candidateName, onClose, onSuccess }) {
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('PROCTORING_ANOMALY');
  const [isWarning, setIsWarning] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const target = candidate || (attemptId ? { attempt_id: attemptId, name: candidateName } : null);
  if (!isOpen || !target) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      await interventionsApi.sendCandidateMessage(target.attempt_id, {
        message: message.trim(),
        reason,
        isWarning
      });
      setMessage('');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to send direct message');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ maxWidth: '480px', width: '100%', background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>
          Send Direct Message to {target.name || 'Candidate'}
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0 0 1rem 0' }}>
          This message is private to this candidate and will be displayed on their exam workspace.
        </p>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isWarning}
                onChange={(e) => setIsWarning(e.target.checked)}
              />
              Mark as Official Warning (Integrity Violation Notice)
            </label>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Anomaly Reason Category
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <option value="PROCTORING_ANOMALY">Suspicious Telemetry / Proctoring Anomaly</option>
              <option value="MULTIPLE_PERSONS">Multiple Persons Detected</option>
              <option value="DEVICE_DETECTED">Unauthorized Mobile / Smart Device</option>
              <option value="GAZE_AWAY">Extended Gaze Away from Screen</option>
              <option value="AUDIO_NOISE">Background Voice / Acoustic Activity</option>
              <option value="FULLSCREEN_EXIT">Browser Focus / Window Exit</option>
              <option value="GENERAL_NOTICE">General Information</option>
            </select>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            required
            placeholder="Please return to full-screen mode and maintain single-occupant workspace."
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.375rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', marginBottom: '1rem' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={submitting || !message.trim()}>{submitting ? 'Sending...' : 'Send Message'}</Button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

export function PauseAttemptModal({ isOpen, candidate, attemptId, candidateName, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const target = candidate || (attemptId ? { attempt_id: attemptId, name: candidateName } : null);
  if (!isOpen || !target) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      await interventionsApi.pauseAttempt(target.attempt_id, reason.trim());
      setReason('');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to pause attempt');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ maxWidth: '480px', width: '100%', background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: '#f59e0b' }}>
          Remotely Pause Exam: {target.name || 'Candidate'}
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0 0 1rem 0' }}>
          The candidate's screen will lock and their countdown timer will immediately freeze until you resume the exam. A mandatory rationale is required.
        </p>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            placeholder="e.g. Inspecting environment following detected reflection."
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.375rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', marginBottom: '1rem' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={submitting || !reason.trim()}>{submitting ? 'Pausing...' : 'Confirm Remote Pause'}</Button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

export function ResumeAttemptModal({ isOpen, candidate, attemptId, candidateName, onClose, onSuccess }) {
  const [reason, setReason] = useState('Inspection completed, clear to proceed');
  const [extensionSeconds, setExtensionSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const target = candidate || (attemptId ? { attempt_id: attemptId, name: candidateName } : null);
  if (!isOpen || !target) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      await interventionsApi.resumeAttempt(target.attempt_id, {
        reason: reason.trim(),
        extensionSeconds: Number(extensionSeconds) || 0
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to resume attempt');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ maxWidth: '480px', width: '100%', background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: '#10b981' }}>
          Resume Exam: {target.name || 'Candidate'}
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0 0 1rem 0' }}>
          Unlocks the candidate's workspace and extends the exam timer by the exact paused duration plus any optional compensation time.
        </p>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Additional Compensation Time
            </label>
            <select
              value={extensionSeconds}
              onChange={(e) => setExtensionSeconds(Number(e.target.value))}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <option value={0}>No Extra Extension (+0 min)</option>
              <option value={120}>+2 Minutes Extension</option>
              <option value={300}>+5 Minutes Extension</option>
              <option value={600}>+10 Minutes Extension</option>
            </select>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            placeholder="e.g. Investigation completed, identity re-verified."
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.375rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', marginBottom: '1rem' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={submitting || !reason.trim()}>{submitting ? 'Resuming...' : 'Confirm Resume'}</Button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

export function TerminateAttemptModal({ isOpen, candidate, attemptId, candidateName, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const target = candidate || (attemptId ? { attempt_id: attemptId, name: candidateName } : null);
  if (!isOpen || !target) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim() || !confirmed) return;
    setSubmitting(true);
    setError('');

    try {
      await interventionsApi.terminateAttempt(target.attempt_id, reason.trim());
      setReason('');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to terminate attempt');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ maxWidth: '480px', width: '100%', background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-danger)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: '#ef4444' }}>
          Emergency Terminate Exam: {target.name || 'Candidate'}
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0 0 1rem 0' }}>
          This is an irreversible, terminal action. The candidate will immediately be expelled from the exam and their attempt will be locked with zero further answers permitted.
        </p>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            placeholder="Mandatory violation reason (e.g. Confirmed unauthorized communication / external materials)."
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.375rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', marginBottom: '1rem' }}
          />
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm this termination is necessary and complies with examination integrity policies.
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button variant="danger" type="submit" disabled={submitting || !reason.trim() || !confirmed}>
              {submitting ? 'Terminating...' : 'Terminate Attempt'}
            </Button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

function ModalBackdrop({ children, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '1rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
