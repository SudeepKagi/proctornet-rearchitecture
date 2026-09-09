/**
 * @file CandidateInterventionOverlays.jsx
 * @description Candidate-facing realtime intervention overlays conforming to Phase 26 Workstream G.
 * Includes Pause Overlay, Termination Overlay, Announcement Banner, and Direct Warning Toast.
 */

import React from 'react';

export function CandidatePauseOverlay({ isOpen, reason }) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.96)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          width: '100%',
          backgroundColor: '#1e293b',
          border: '2px solid #f59e0b',
          borderRadius: '1rem',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          color: '#f8fafc',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 1.5rem',
            borderRadius: '50%',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '2px solid #f59e0b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
          }}
        >
          ⏸️
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem', color: '#fef3c7' }}>
          Examination Remotely Paused
        </h2>

        <p style={{ fontSize: '0.9375rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          An invigilator has temporarily paused your examination attempt. All inputs have been frozen,
          and your countdown timer is currently paused.
        </p>

        {reason && (
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1.5rem',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              Proctor Stated Rationale:
            </div>
            <div style={{ fontSize: '0.875rem', color: '#f1f5f9', fontWeight: 500 }}>
              {reason}
            </div>
          </div>
        )}

        <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
          Please remain seated in front of your camera. Your session will resume once the invigilator releases the pause.
        </div>
      </div>
    </div>
  );
}

export function CandidateTerminationOverlay({ isOpen, reason, onReturnHome }) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.98)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          width: '100%',
          backgroundColor: '#1e293b',
          border: '2px solid #ef4444',
          borderRadius: '1rem',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.3)',
          color: '#f8fafc',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 1.5rem',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '2px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
          }}
        >
          🛑
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem', color: '#fecaca' }}>
          Examination Attempt Terminated
        </h2>

        <p style={{ fontSize: '0.9375rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Your examination attempt has been officially terminated by the proctoring authority.
          Further answers cannot be submitted.
        </p>

        {reason && (
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1.75rem',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f87171', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              Termination Reason:
            </div>
            <div style={{ fontSize: '0.875rem', color: '#f1f5f9', fontWeight: 500 }}>
              {reason}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onReturnHome}
          style={{
            padding: '0.75rem 1.75rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            borderRadius: '0.5rem',
            backgroundColor: '#ef4444',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
          }}
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}

export function AnnouncementBanner({ announcement, onDismiss }) {
  if (!announcement) return null;

  return (
    <div
      role="alert"
      style={{
        backgroundColor: '#3b82f6',
        color: '#ffffff',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.875rem',
        fontWeight: 500,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.25rem' }}>📢</span>
        <span>
          <strong>Proctor Announcement:</strong> {announcement.message || announcement}
        </span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#ffffff',
            fontSize: '1rem',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
            opacity: 0.8,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function CandidateDirectMessageToast({ messageData, onDismiss }) {
  if (!messageData) return null;

  const isWarning = messageData.isWarning;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        maxWidth: '420px',
        width: '100%',
        zIndex: 60,
        backgroundColor: isWarning ? '#7f1d1d' : '#1e293b',
        border: `2px solid ${isWarning ? '#ef4444' : '#3b82f6'}`,
        borderRadius: '0.75rem',
        padding: '1.25rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
        color: '#f8fafc',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9375rem' }}>
          <span>{isWarning ? '⚠️' : '💬'}</span>
          <span>{isWarning ? 'Official Invigilator Warning' : 'Direct Message from Proctor'}</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>

      <p style={{ fontSize: '0.875rem', color: '#e2e8f0', lineHeight: 1.5, marginBottom: '0.75rem' }}>
        {messageData.message}
      </p>

      {messageData.reason && (
        <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '0.75rem', fontStyle: 'italic' }}>
          Rationale: {messageData.reason}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: '0.35rem 0.75rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: '0.375rem',
            backgroundColor: isWarning ? '#ef4444' : '#3b82f6',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
}
