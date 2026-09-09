/**
 * @file CandidateDetailDrawer.jsx
 * @description Slide-out drawer for inspecting candidate live details, focused high-resolution stream,
 * hardware readiness, violation timeline, evidence inspection, and triggering interventions.
 * Conforms to Phase 26 Track 2 Workstream E.
 */

import React, { useState, useEffect } from 'react';
import { Badge, getStatusBadgeVariant } from '../common/Badge.jsx';
import { Button } from '../common/Button.jsx';
import { VideoPlayer } from '../media/VideoPlayer.jsx';
import * as proctoringApi from '../../api/proctoringApi.js';
import * as evidenceApi from '../../api/evidenceApi.js';
import * as interventionsApi from '../../api/interventionsApi.js';

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
  onOpenIncident
}) {
  const [timeline, setTimeline] = useState([]);
  const [evidenceList, setEvidenceList] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const attemptId = candidate?.attemptId || candidate?.attempt_id;

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

  const status = candidate.attempt_status || 'ACTIVE';
  const riskScore = candidate.risk_score || 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '460px',
        maxWidth: '90vw',
        background: 'var(--color-bg-surface, #18181b)',
        borderLeft: '1px solid var(--color-border, #27272a)',
        zIndex: 1000,
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '1.25rem',
          borderBottom: '1px solid var(--color-border, #27272a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-bg-subtle, #121214)'
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: 'var(--color-text-primary, #fff)' }}>
            {candidate.name || 'Candidate Details'}
          </h3>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #a1a1aa)' }}>
            {candidate.email || '—'}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-muted, #a1a1aa)',
            fontSize: '1.25rem',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem'
          }}
          aria-label="Close drawer"
        >
          ✕
        </button>
      </div>

      {/* Body scrollable */}
      <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Status and Risk Indicators */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
              Anomaly Risk
            </span>
            <Badge variant={riskScore >= 50 ? 'danger' : riskScore > 0 ? 'warning' : 'neutral'} size="sm">
              Risk: {riskScore} / 100
            </Badge>
          </div>
        </div>

        {/* Focused Video Stream */}
        {candidate.webcamTrack && (
          <div style={{ borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <VideoPlayer
              track={candidate.webcamTrack}
              label={`Focused Feed: ${candidate.name || 'Candidate'}`}
              isFocused={true}
              isMuted={false}
            />
          </div>
        )}

        {/* Intervention Command Actions */}
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.75rem 0', color: 'var(--color-text-primary)' }}>
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
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.75rem 0', color: 'var(--color-text-primary)' }}>
            Violation & Telemetry Timeline
          </h4>
          {loadingTimeline ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Loading timeline events...</p>
          ) : timeline.length === 0 ? (
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.375rem', border: '1px dashed var(--color-border)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>No anomalies recorded for this attempt</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {timeline.map((evt, idx) => (
                <div
                  key={evt.violationId || idx}
                  style={{
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '0.375rem',
                    borderLeft: `3px solid ${
                      evt.severity === 'CRITICAL' ? 'var(--color-danger, #ef4444)' :
                      evt.severity === 'HIGH' ? '#f97316' : '#eab308'
                    }`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {evt.eventType}
                    </span>
                    <Badge variant={evt.severity === 'CRITICAL' ? 'danger' : 'warning'} size="sm">
                      {evt.severity}
                    </Badge>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {new Date(evt.serverTimestamp || evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CandidateDetailDrawer;
