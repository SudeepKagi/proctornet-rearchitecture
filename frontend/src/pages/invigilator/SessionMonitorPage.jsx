/**
 * @file SessionMonitorPage.jsx
 * @description Invigilator monitor displaying real-time candidate roster attempt statuses.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as sessionsApi from '../../api/sessionsApi.js';
import * as resultsApi from '../../api/resultsApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge, getStatusBadgeVariant } from '../../components/common/Badge.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function SessionMonitorPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const sessionData = await sessionsApi.getSession(sessionId);
      setSession(sessionData);

      if (sessionData?.exam_id) {
        const scopedResults = await resultsApi
          .getExamResults(sessionData.exam_id, { sessionId })
          .catch(() => []);
        setResults(scopedResults);
      }
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
            Refresh Roster
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

      {/* Candidate Status Roster Grid */}
      <Card padding="normal" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>
          Enrolled Candidates ({students.length})
        </h3>

        {students.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            No candidates are currently assigned to this proctoring session.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Candidate Name</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Email</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Roster State</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Attempt State</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => (
                <tr key={st.student_id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{st.name || 'Candidate'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-text-muted)' }}>{st.email || '—'}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <Badge variant="neutral" size="sm">{st.status || 'ASSIGNED'}</Badge>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <Badge variant={getStatusBadgeVariant(st.attempt_status || 'READY')} size="sm">
                      {st.attempt_status || 'READY'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
