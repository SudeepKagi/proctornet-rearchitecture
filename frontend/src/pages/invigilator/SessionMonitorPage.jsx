/**
 * @file SessionMonitorPage.jsx
 * @description Invigilator monitor displaying real-time candidate roster attempt statuses,
 * risk scores, violation counts, active flags, and latest anomaly telemetry.
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

  const candidateProctorMap = useMemo(() => {
    const map = {};
    if (proctoringSummary?.candidates) {
      for (const c of proctoringSummary.candidates) {
        map[c.studentId] = c;
      }
    }
    return map;
  }, [proctoringSummary]);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Spinner size="lg" label="Connecting to session monitor..." />
      </div>
    );
  }

  const students = session?.students || [];

  return (
    <div className="container">
      <div style={{ marginBottom: '1.5rem' }}>
        <Button variant="secondary" size="sm" onClick={() => navigate('/invigilator')} style={{ marginBottom: '1rem' }}>
          &larr; Back to Invigilator Dashboard
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                {session?.exam_title || `Session #${sessionId.slice(0, 8)}`}
              </h1>
              <Badge variant={getStatusBadgeVariant(session?.status)}>{session?.status}</Badge>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
              Room: <strong>{session?.room_name || 'Online / Virtual'}</strong> | Active Proctoring Console
            </p>
          </div>

          <Button variant="secondary" size="sm" loading={refreshing} onClick={() => loadData(true)}>
            Refresh Roster & Telemetry
          </Button>
        </div>
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

      {/* Candidate Status & Proctoring Roster Grid */}
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
                </tr>
              </thead>
              <tbody>
                {students.map((st) => {
                  const pData = candidateProctorMap[st.student_id] || {};
                  const riskScore = pData.riskScore ?? 0;
                  const violationCount = pData.violationCount ?? 0;
                  const activeFlags = pData.activeFlags || [];
                  const latestViolation = pData.latestViolation;

                  return (
                    <tr key={st.student_id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{st.name || 'Candidate'}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
    </div>
  );
}
