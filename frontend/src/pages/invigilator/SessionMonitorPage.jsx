/**
 * @file SessionMonitorPage.jsx
 * @description Invigilator monitor displaying real-time candidate roster attempt statuses,
 * 12-stream SFU video grid, candidate detail drawer, realtime intervention controls,
 * incident reporting, and formal session sign-off.
 * Conforms to Phase 26 Track 2 Workstreams E, F, and H.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as sessionsApi from '../../api/sessionsApi.js';
import * as resultsApi from '../../api/resultsApi.js';
import * as proctoringApi from '../../api/proctoringApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge, getStatusBadgeVariant } from '../../components/common/Badge.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';
import { useRealtime } from '../../hooks/useRealtime.js';
import { CandidateMediaGrid } from '../../components/media/CandidateMediaGrid.jsx';
import CandidateDetailDrawer from '../../components/invigilator/CandidateDetailDrawer.jsx';
import {
  AnnouncementModal,
  CandidateMessageModal,
  PauseAttemptModal,
  ResumeAttemptModal,
  TerminateAttemptModal
} from '../../components/invigilator/InterventionModals.jsx';
import EvidenceModal from '../../components/invigilator/EvidenceModal.jsx';
import { SessionSignOffModal, IncidentReportModal } from '../../components/invigilator/SessionSignOffModal.jsx';

function getRiskBadgeVariant(score) {
  if (score >= 80) return 'danger';
  if (score >= 50) return 'warning';
  if (score > 0) return 'primary';
  return 'neutral';
}

export function SessionMonitorPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [results, setResults] = useState([]);
  const [proctoringSummary, setProctoringSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('media');

  // Modal and Drawer States
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // 'announcement' | 'message' | 'pause' | 'resume' | 'terminate' | 'evidence' | 'incident' | 'signoff'

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const sessionData = await sessionsApi.getSession(sessionId);
      setSession(sessionData);

      const [scopedResults, proctorData] = await Promise.all([
        sessionData?.exam_id
          ? resultsApi.getExamResults(sessionData.exam_id, { sessionId }).catch(() => [])
          : Promise.resolve([]),
        proctoringApi.getSessionProctoringSummary(sessionId).catch(() => null)
      ]);
      setResults(scopedResults);
      setProctoringSummary(proctorData);
    } catch (err) {
      setError(err.message || 'Failed to load session monitor data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const [presenceMap, setPresenceMap] = useState({});

  const handleRiskScoreUpdated = useCallback((payload) => {
    setProctoringSummary((prev) => {
      if (!prev || !prev.candidates) return prev;
      const nextCandidates = prev.candidates.map((c) => {
        if (c.studentId === payload.studentId) {
          return {
            ...c,
            riskScore: payload.riskScore,
            violationCount: (c.violationCount || 0) + 1
          };
        }
        return c;
      });
      const highRiskCount = nextCandidates.filter((c) => (Number(c.riskScore) || 0) >= 50).length;
      return {
        ...prev,
        candidates: nextCandidates,
        highRiskAttemptsCount: highRiskCount
      };
    });
  }, []);

  const handleFlagRaised = useCallback((payload) => {
    setProctoringSummary((prev) => {
      if (!prev || !prev.candidates) return prev;
      const nextCandidates = prev.candidates.map((c) => {
        if (c.studentId === payload.studentId) {
          const activeFlags = Array.isArray(c.activeFlags) ? [...c.activeFlags] : [];
          if (!activeFlags.some((f) => f.flagId === payload.flagId)) {
            activeFlags.push(payload);
          }
          return {
            ...c,
            activeFlags,
            activeFlagsCount: (c.activeFlagsCount || 0) + 1,
            latestViolation: { eventType: payload.flagType, severity: payload.severity }
          };
        }
        return c;
      });
      return {
        ...prev,
        candidates: nextCandidates
      };
    });
  }, []);

  const handleFlagReviewed = useCallback((payload) => {
    setProctoringSummary((prev) => {
      if (!prev || !prev.candidates) return prev;
      const nextCandidates = prev.candidates.map((c) => {
        if (c.studentId === payload.studentId && Array.isArray(c.activeFlags)) {
          const activeFlags = c.activeFlags.filter((f) => f.flagId !== payload.flagId);
          return {
            ...c,
            activeFlags,
            activeFlagsCount: Math.max(0, (c.activeFlagsCount || 1) - 1)
          };
        }
        return c;
      });
      return {
        ...prev,
        candidates: nextCandidates
      };
    });
  }, []);

  const handlePresenceChanged = useCallback((payload) => {
    if (payload?.studentId) {
      setPresenceMap((prev) => ({
        ...prev,
        [payload.studentId]: payload.status
      }));
    }
  }, []);

  const handleInterventionEvent = useCallback(() => {
    loadData(true);
  }, [loadData]);

  const realtimeHandlers = useMemo(
    () => ({
      'proctoring:risk_score_updated': handleRiskScoreUpdated,
      'proctoring:flag_raised': handleFlagRaised,
      'proctoring:flag_reviewed': handleFlagReviewed,
      'candidate:presence_changed': handlePresenceChanged,
      'candidate:paused': handleInterventionEvent,
      'candidate:resumed': handleInterventionEvent,
      'candidate:terminated': handleInterventionEvent,
      'invigilator:intervention_logged': handleInterventionEvent,
      'session:concluded': handleInterventionEvent
    }),
    [handleRiskScoreUpdated, handleFlagRaised, handleFlagReviewed, handlePresenceChanged, handleInterventionEvent]
  );

  const { status: wsStatus, isDegraded } = useRealtime(
    sessionId ? `session:${sessionId}` : null,
    realtimeHandlers
  );

  // Fallback to 10s REST polling when cross-node Redis synchronization is degraded
  useEffect(() => {
    if (!isDegraded) return;
    const pollTimer = setInterval(() => {
      loadData(true);
    }, 10000);
    return () => clearInterval(pollTimer);
  }, [isDegraded, loadData]);

  const candidateProctorMap = useMemo(() => {
    const map = {};
    if (proctoringSummary?.candidates) {
      for (const c of proctoringSummary.candidates) {
        map[c.studentId] = c;
      }
    }
    return map;
  }, [proctoringSummary]);

  const students = session?.students || [];

  const selectedCandidate = useMemo(() => {
    if (!selectedCandidateId) return null;
    const st = students.find((s) => (s.student_id || s.id) === selectedCandidateId) || {};
    const pData = candidateProctorMap[selectedCandidateId] || {};
    return {
      ...st,
      studentId: selectedCandidateId,
      name: st.name || st.student_name || 'Candidate',
      attemptId: pData.attemptId || st.attempt_id,
      attemptStatus: pData.attemptStatus || st.attempt_status || 'READY',
      riskScore: pData.riskScore ?? 0,
      violationCount: pData.violationCount ?? 0,
      activeFlags: pData.activeFlags || [],
      latestViolation: pData.latestViolation
    };
  }, [selectedCandidateId, students, candidateProctorMap]);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Spinner size="lg" label="Connecting to session monitor..." />
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '1.5rem' }}>
        <Button variant="secondary" size="sm" onClick={() => navigate('/invigilator')} style={{ marginBottom: '1rem' }}>
          &larr; Back to Invigilator Dashboard
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                {session?.exam_title || `Session #${sessionId.slice(0, 8)}`}
              </h1>
              <Badge variant={getStatusBadgeVariant(session?.status)}>{session?.status}</Badge>
              {isDegraded ? (
                <Badge variant="warning">Realtime Degraded (10s Polling)</Badge>
              ) : wsStatus === 'CONNECTED' ? (
                <Badge variant="success">Live Realtime</Badge>
              ) : (
                <Badge variant="neutral">Realtime {wsStatus}</Badge>
              )}
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
              Room: <strong>{session?.room_name || 'Online / Virtual'}</strong> | Active Proctoring Console
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setActiveModal('announcement')}
            >
              📢 Room Announcement
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setActiveModal('incident')}
            >
              📝 File Incident
            </Button>
            {session?.status !== 'CONCLUDED' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setActiveModal('signoff')}
              >
                ✓ Sign-Off & Conclude
              </Button>
            )}
            <Button variant="secondary" size="sm" loading={refreshing} onClick={() => loadData(true)}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {isDegraded && (
        <div
          role="alert"
          style={{
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-warning-light)',
            border: '1px solid var(--color-warning-border)',
            color: 'var(--color-warning)',
            fontWeight: 600,
            fontSize: '0.875rem'
          }}
        >
          ⚠️ Notice: Cross-node realtime synchronization is degraded. Invigilator console has automatically activated 10-second REST fallback polling.
        </div>
      )}

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

      {/* Proctoring Summary KPI Cards */}
      {proctoringSummary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}
        >
          <Card padding="compact">
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              Total Candidates
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem' }}>
              {proctoringSummary.totalAssignedCandidates}
            </div>
          </Card>
          <Card padding="compact">
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              Active Ingesting Attempts
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--color-primary)' }}>
              {proctoringSummary.activeAttemptCount}
            </div>
          </Card>
          <Card padding="compact">
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              High-Risk Attempts (Score &ge; 80)
            </div>
            <div
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                marginTop: '0.25rem',
                color: proctoringSummary.highRiskAttemptCount > 0 ? 'var(--color-danger)' : 'var(--color-success)'
              }}
            >
              {proctoringSummary.highRiskAttemptCount}
            </div>
          </Card>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '0.5rem' }}>
        <Button
          variant={activeTab === 'media' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveTab('media')}
        >
          Live Media Monitor (12-Stream SFU)
        </Button>
        <Button
          variant={activeTab === 'roster' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveTab('roster')}
        >
          Candidate Roster & Status ({students.length})
        </Button>
      </div>

      {activeTab === 'media' && (
        <Card padding="normal" style={{ marginBottom: '1.5rem' }}>
          <CandidateMediaGrid
            sessionId={sessionId}
            onSelectCandidate={(candidateId) => setSelectedCandidateId(candidateId)}
          />
        </Card>
      )}

      {activeTab === 'roster' && (
        <Card padding="normal" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>
            Enrolled Candidates & Proctoring Status ({students.length})
          </h3>

          {students.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              No candidates are currently assigned to this proctoring session.
            </div>
          ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Candidate Name</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Email</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Attempt State</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Risk Score</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Violations</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Active Flags</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Latest Anomaly</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((st) => {
                  const candidateId = st.student_id || st.id;
                  const pData = candidateProctorMap[candidateId] || {};
                  const riskScore = pData.riskScore ?? 0;
                  const violationCount = pData.violationCount ?? 0;
                  const activeFlags = pData.activeFlags || [];
                  const latestViolation = pData.latestViolation;

                  return (
                    <tr key={candidateId} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{st.name || st.student_name || 'Candidate'}</span>
                          {presenceMap[candidateId] === 'OFFLINE' ? (
                            <Badge variant="danger" size="sm">OFFLINE</Badge>
                          ) : (
                            <Badge variant="success" size="sm">ONLINE</Badge>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-text-muted)' }}>{st.email || '—'}</td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <Badge variant={getStatusBadgeVariant(pData.attemptStatus || st.attempt_status || 'READY')} size="sm">
                          {pData.attemptStatus || st.attempt_status || 'READY'}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <Badge variant={getRiskBadgeVariant(riskScore)} size="sm">
                          {riskScore} / 100
                        </Badge>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                        {violationCount}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {activeFlags.length === 0 ? (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>None</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {activeFlags.map((flag) => (
                              <Badge key={flag.flagId} variant={flag.severity === 'CRITICAL' ? 'danger' : 'warning'} size="sm">
                                {flag.flagType}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                        {latestViolation ? (
                          <span>
                            <strong>{latestViolation.eventType}</strong> ({latestViolation.severity})
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedCandidateId(candidateId)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--color-primary-light, rgba(59, 130, 246, 0.1))',
                            border: '1px solid var(--color-primary)',
                            color: 'var(--color-primary)',
                            cursor: 'pointer'
                          }}
                        >
                          Inspect & Intervene
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}

      {/* Session-Scoped Results (Inspection Only) */}
      {results.length > 0 && (
        <Card padding="normal">
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>
            Session Evaluated Scores ({results.length})
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Candidate</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Score</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Percentage</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.attempt_id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{r.student_name || 'Candidate'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{r.score} / {r.total_marks}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    {r.percentage !== undefined ? `${Number(r.percentage).toFixed(2)}%` : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <Badge variant={r.is_passed ? 'success' : 'danger'} size="sm">
                      {r.is_passed ? 'PASSED' : 'FAILED'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Candidate Detail Drawer */}
      <CandidateDetailDrawer
        isOpen={Boolean(selectedCandidateId)}
        onClose={() => setSelectedCandidateId(null)}
        candidate={selectedCandidate}
        onOpenMessage={() => setActiveModal('message')}
        onOpenPause={() => setActiveModal('pause')}
        onOpenResume={() => setActiveModal('resume')}
        onOpenTerminate={() => setActiveModal('terminate')}
        onOpenEvidence={() => setActiveModal('evidence')}
        onOpenIncident={() => setActiveModal('incident')}
      />

      {/* Realtime Intervention Modals */}
      <AnnouncementModal
        isOpen={activeModal === 'announcement'}
        onClose={() => setActiveModal(null)}
        sessionId={sessionId}
      />

      {selectedCandidate && (
        <>
          <CandidateMessageModal
            isOpen={activeModal === 'message'}
            onClose={() => setActiveModal(null)}
            attemptId={selectedCandidate.attemptId}
            candidateName={selectedCandidate.name}
          />
          <PauseAttemptModal
            isOpen={activeModal === 'pause'}
            onClose={() => setActiveModal(null)}
            attemptId={selectedCandidate.attemptId}
            candidateName={selectedCandidate.name}
            onSuccess={() => loadData(true)}
          />
          <ResumeAttemptModal
            isOpen={activeModal === 'resume'}
            onClose={() => setActiveModal(null)}
            attemptId={selectedCandidate.attemptId}
            candidateName={selectedCandidate.name}
            onSuccess={() => loadData(true)}
          />
          <TerminateAttemptModal
            isOpen={activeModal === 'terminate'}
            onClose={() => setActiveModal(null)}
            attemptId={selectedCandidate.attemptId}
            candidateName={selectedCandidate.name}
            onSuccess={() => loadData(true)}
          />
          <EvidenceModal
            isOpen={activeModal === 'evidence'}
            onClose={() => setActiveModal(null)}
            attemptId={selectedCandidate.attemptId}
            candidateName={selectedCandidate.name}
          />
        </>
      )}

      <SessionSignOffModal
        isOpen={activeModal === 'signoff'}
        onClose={() => setActiveModal(null)}
        sessionId={sessionId}
        onSignedOff={() => loadData(true)}
      />

      <IncidentReportModal
        isOpen={activeModal === 'incident'}
        onClose={() => setActiveModal(null)}
        sessionId={sessionId}
        candidates={students}
        preselectedCandidateId={selectedCandidate?.studentId || null}
        onReported={() => loadData(true)}
      />
    </div>
  );
}
