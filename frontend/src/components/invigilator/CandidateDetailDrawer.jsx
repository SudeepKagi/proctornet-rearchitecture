/**
 * @file CandidateDetailDrawer.jsx
 * @description Slide-out drawer for inspecting candidate live details, focused high-resolution stream,
 * hardware readiness, violation timeline, evidence inspection, and triggering interventions.
 * Conforms to Phase 26 & Phase 28:
 * - 0-100 risk score with clear severity tiers (LOW, MEDIUM, ELEVATED, HIGH)
 * - Source attribution badges: [BROWSER], [SCREEN AI], [TECHNICAL]
 * - Clear separation of Technical Degradation (capped at 15 pts) vs Behavioral Misconduct
 * - Auditable flag acknowledgement/dismissal without deleting original event records or evidence
 * - Accessible drawer (role="dialog", aria-modal="true", focus trap, Escape key handling)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Badge, getStatusBadgeVariant } from '../common/Badge.jsx';
import { Button } from '../common/Button.jsx';
import { VideoPlayer } from '../media/VideoPlayer.jsx';
import * as proctoringApi from '../../api/proctoringApi.js';
import * as evidenceApi from '../../api/evidenceApi.js';
import * as interventionsApi from '../../api/interventionsApi.js';

function getRiskTier(score) {
  const num = Number(score) || 0;
  if (num >= 80) return { label: `HIGH (${num}/100)`, variant: 'danger' };
  if (num >= 50) return { label: `ELEVATED (${num}/100)`, variant: 'danger' };
  if (num >= 20) return { label: `MEDIUM (${num}/100)`, variant: 'warning' };
  return { label: `LOW (${num}/100)`, variant: 'success' };
}

function getSourceAttribution(evt) {
  if (evt.source) {
    if (evt.source === 'SCREEN_AI') return 'SCREEN AI';
    if (evt.source === 'TECHNICAL') return 'TECHNICAL';
    return evt.source;
  }
  const type = evt.eventType || '';
  if (['SCREEN_CAPTURE_INTERRUPTED', 'SCREEN_STREAM_DEGRADED', 'TECHNICAL_DEGRADATION'].includes(type)) {
    return 'TECHNICAL';
  }
  if (['SCREEN_CONTEXT_CLASSIFICATION', 'REPEATED_CONTEXT_SWITCHING'].includes(type)) {
    return 'SCREEN AI';
  }
  return 'BROWSER';
}

export function CandidateDetailDrawer({
  candidate,
  isOpen,
  onClose,
  onOpenMessageModal,
  onOpenPauseModal,
  onOpenResumeModal,
  onOpenTerminateModal,
  onOpenEvidenceModal,
  onOpenMessage,
  onOpenPause,
  onOpenResume,
  onOpenTerminate,
  onOpenEvidence,
  onOpenIncident,
  onFlagUpdated
}) {
  const [timeline, setTimeline] = useState([]);
  const [evidenceList, setEvidenceList] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [dismissingFlagId, setDismissingFlagId] = useState(null);

  const drawerRef = useRef(null);
  const triggerElementRef = useRef(null);

  const attemptId = candidate?.attemptId || candidate?.attempt_id;

  // Focus management & Escape key
  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement;
      document.body.style.overflow = 'hidden';

      requestAnimationFrame(() => {
        const closeBtn = drawerRef.current?.querySelector('button');
        closeBtn?.focus();
      });
    } else {
      document.body.style.overflow = '';
      if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
        triggerElementRef.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!drawerRef.current) return;
        const focusableElements = drawerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.prototype.filter.call(
          focusableElements,
          (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load timeline & evidence
  useEffect(() => {
    if (!isOpen || !attemptId) return;

    let isMounted = true;
    setLoadingTimeline(true);

    Promise.all([
      interventionsApi.getAttemptTimeline(attemptId).catch(() => []),
      evidenceApi.listEvidence(attemptId, { limit: 10 }).catch(() => ({ evidence: [] }))
    ]).then(([timelineData, evData]) => {
      if (!isMounted) return;
      setTimeline(Array.isArray(timelineData) ? timelineData : timelineData?.events || []);
      setEvidenceList(evData?.evidence || []);
      setLoadingTimeline(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, attemptId]);

  if (!isOpen || !candidate) return null;

  const status = candidate.attempt_status || candidate.attemptStatus || 'ACTIVE';
  const riskScore = candidate.risk_score ?? candidate.riskScore ?? 0;
  const riskTier = getRiskTier(riskScore);
  const activeFlags = candidate.activeFlags || [];

  // Check technical degradation state
  const hasTechnicalDegradation = timeline.some(
    (e) => ['SCREEN_CAPTURE_INTERRUPTED', 'SCREEN_STREAM_DEGRADED'].includes(e.eventType)
  );

  const handleDismissFlag = async (flagId) => {
    if (!attemptId || !flagId) return;
    setDismissingFlagId(flagId);
    try {
      await proctoringApi.updateFlagStatus(attemptId, flagId, {
        status: 'DISMISSED',
        reviewNotes: 'Acknowledged and dismissed by invigilator during live session'
      });
      if (onFlagUpdated) {
        onFlagUpdated(flagId);
      }
    } catch (err) {
      console.error('Failed to dismiss flag:', err);
    } finally {
      setDismissingFlagId(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(2px)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-drawer-title"
        style={{
          width: '500px',
          maxWidth: '90vw',
          height: '100%',
          backgroundColor: 'var(--color-surface, #ffffff)',
          borderLeft: '1px solid var(--color-border-subtle, #e2e8f0)',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-surface-secondary, #f8fafc)'
          }}
        >
          <div>
            <h3
              id="candidate-drawer-title"
              style={{
                fontSize: '1.125rem',
                fontWeight: 600,
                margin: 0,
                color: 'var(--color-text-primary, #0f172a)'
              }}
            >
              {candidate.name || candidate.student_name || 'Candidate Details'}
            </h3>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #64748b)' }}>
              {candidate.email || '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-muted, #64748b)',
              fontSize: '1.5rem',
              lineHeight: 1,
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-xs, 4px)'
            }}
            aria-label="Close candidate details drawer"
          >
            &times;
          </button>
        </div>

        {/* Body scrollable */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}
        >
          {/* Status and Risk Indicators */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '0.75rem',
              padding: '0.75rem',
              backgroundColor: 'var(--color-surface-secondary, #f8fafc)',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px solid var(--color-border-subtle, #e2e8f0)'
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Attempt Status
              </span>
              <Badge variant={getStatusBadgeVariant(status)} size="sm">
                {status}
              </Badge>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Behavioral Risk
              </span>
              <Badge variant={riskTier.variant} size="sm">
                {riskTier.label}
              </Badge>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Technical Condition
              </span>
              {hasTechnicalDegradation ? (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.2rem 0.5rem',
                    borderRadius: 'var(--radius-xs, 4px)',
                    backgroundColor: 'var(--badge-technical-bg, #f1f5f9)',
                    color: 'var(--badge-technical-text, #475569)',
                    border: '1px solid var(--badge-technical-border, #cbd5e1)',
                    display: 'inline-block'
                  }}
                  title="Technical degradation is score-capped at 15 pts max and does not escalate behavioral risk."
                >
                  DEGRADED [TECHNICAL]
                </span>
              ) : (
                <Badge variant="success" size="sm">
                  NORMAL
                </Badge>
              )}
            </div>
          </div>

          {/* Active Flags Triage Section */}
          {activeFlags.length > 0 && (
            <div
              style={{
                backgroundColor: 'var(--color-surface-secondary, #f8fafc)',
                padding: '1rem',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--color-border-subtle, #e2e8f0)'
              }}
            >
              <h4
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  margin: '0 0 0.5rem 0',
                  color: 'var(--color-text-primary)'
                }}
              >
                Active Incident Flags ({activeFlags.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {activeFlags.map((flag) => (
                  <div
                    key={flag.flagId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-sm, 6px)',
                      backgroundColor: 'var(--color-surface, #ffffff)',
                      border: '1px solid var(--color-border-subtle, #e2e8f0)'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{flag.flagType}</span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          marginLeft: '0.5rem',
                          color: flag.severity === 'CRITICAL' ? 'var(--color-danger)' : 'var(--color-warning)'
                        }}
                      >
                        ({flag.severity})
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={dismissingFlagId === flag.flagId}
                      onClick={() => handleDismissFlag(flag.flagId)}
                    >
                      {dismissingFlagId === flag.flagId ? 'Dismissing...' : 'Acknowledge / Dismiss'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Focused Video Stream */}
          {candidate.webcamTrack && (
            <div
              style={{
                borderRadius: 'var(--radius-md, 8px)',
                overflow: 'hidden',
                border: '1px solid var(--color-border-subtle)'
              }}
            >
              <VideoPlayer
                track={candidate.webcamTrack}
                label={`Focused Feed: ${candidate.name || 'Candidate'}`}
                isFocused={true}
                isMuted={false}
              />
            </div>
          )}

          {/* Intervention Command Actions */}
          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px solid var(--color-border-subtle)',
              backgroundColor: 'var(--color-surface-secondary, #f8fafc)'
            }}
          >
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                margin: '0 0 0.75rem 0',
                color: 'var(--color-text-primary)'
              }}
            >
              Interventions & Enforcement
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (onOpenMessage) onOpenMessage(candidate);
                  else if (onOpenMessageModal) onOpenMessageModal(candidate);
                }}
              >
                Direct Message / Warning
              </Button>

              {status === 'PAUSED' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (onOpenResume) onOpenResume(candidate);
                    else if (onOpenResumeModal) onOpenResumeModal(candidate);
                  }}
                >
                  Resume Exam
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={status !== 'ACTIVE'}
                  onClick={() => {
                    if (onOpenPause) onOpenPause(candidate);
                    else if (onOpenPauseModal) onOpenPauseModal(candidate);
                  }}
                >
                  Pause Exam
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (onOpenEvidence) onOpenEvidence(candidate, evidenceList);
                  else if (onOpenEvidenceModal) onOpenEvidenceModal(candidate, evidenceList);
                }}
              >
                Inspect Evidence ({evidenceList.length})
              </Button>

              <Button
                variant="danger"
                size="sm"
                disabled={['TERMINATED', 'SUBMITTED', 'EXPIRED'].includes(status)}
                onClick={() => {
                  if (onOpenTerminate) onOpenTerminate(candidate);
                  else if (onOpenTerminateModal) onOpenTerminateModal(candidate);
                }}
              >
                Emergency Terminate
              </Button>
            </div>
          </div>

          {/* Violation & Anomaly Timeline */}
          <div>
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                margin: '0 0 0.75rem 0',
                color: 'var(--color-text-primary)'
              }}
            >
              Telemetry & Violation Timeline
            </h4>
            {loadingTimeline ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Loading timeline events...</p>
            ) : timeline.length === 0 ? (
              <div
                style={{
                  padding: '1.5rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px dashed var(--color-border-subtle)',
                  textAlign: 'center'
                }}
              >
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  No anomalies recorded for this attempt
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {timeline.map((evt, idx) => {
                  const sourceAttribution = getSourceAttribution(evt);
                  const isTech = sourceAttribution === 'TECHNICAL';
                  const isScreenAI = sourceAttribution === 'SCREEN AI';

                  return (
                    <div
                      key={evt.violationId || idx}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: 'var(--color-surface, #ffffff)',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--color-border-subtle)',
                        borderLeft: `4px solid ${
                          isTech
                            ? 'var(--color-technical, #64748b)'
                            : evt.severity === 'CRITICAL'
                            ? 'var(--color-danger, #ef4444)'
                            : evt.severity === 'HIGH'
                            ? '#f97316'
                            : '#eab308'
                        }`
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.25rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.4rem',
                              borderRadius: 'var(--radius-xs, 4px)',
                              backgroundColor: isTech
                                ? 'var(--badge-technical-bg, #f1f5f9)'
                                : isScreenAI
                                ? 'var(--badge-screen-ai-bg, #faf5ff)'
                                : 'var(--badge-browser-bg, #eff6ff)',
                              color: isTech
                                ? 'var(--badge-technical-text, #475569)'
                                : isScreenAI
                                ? 'var(--badge-screen-ai-text, #7e22ce)'
                                : 'var(--badge-browser-text, #1d4ed8)',
                              border: `1px solid ${
                                isTech
                                  ? 'var(--badge-technical-border, #cbd5e1)'
                                  : isScreenAI
                                  ? 'var(--badge-screen-ai-border, #e9d5ff)'
                                  : 'var(--badge-browser-border, #bfdbfe)'
                              }`
                            }}
                          >
                            [{sourceAttribution}]
                          </span>
                          <span
                            style={{
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              color: 'var(--color-text-primary)'
                            }}
                          >
                            {evt.eventType}
                          </span>
                        </div>

                        <Badge
                          variant={
                            isTech
                              ? 'neutral'
                              : evt.severity === 'CRITICAL'
                              ? 'danger'
                              : evt.severity === 'HIGH'
                              ? 'warning'
                              : 'primary'
                          }
                          size="sm"
                        >
                          {evt.severity}
                        </Badge>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                          color: 'var(--color-text-muted)'
                        }}
                      >
                        <span>
                          {new Date(evt.serverTimestamp || evt.timestamp || Date.now()).toLocaleTimeString()}
                        </span>
                        {isTech && (
                          <span style={{ fontStyle: 'italic' }}>Technical Cap Active (&le;15 pts)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CandidateDetailDrawer;
