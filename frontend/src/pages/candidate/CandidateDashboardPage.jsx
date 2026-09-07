/**
 * @file CandidateDashboardPage.jsx
 * @description Candidate home portal listing enrolled sessions and exam launch options.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as sessionsApi from '../../api/sessionsApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Badge, getStatusBadgeVariant } from '../../components/common/Badge.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function CandidateDashboardPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadSessions() {
      try {
        setLoading(true);
        const data = await sessionsApi.listSessions();
        setSessions(data);
      } catch (err) {
        setError(err.message || 'Failed to load exam sessions');
      } finally {
        setLoading(false);
      }
    }
    loadSessions();
  }, []);

  function formatDateTime(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          Candidate Portal
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
          Your scheduled assessments and enrolled examination sessions.
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <Spinner size="lg" label="Loading sessions..." />
        </div>
      ) : sessions.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
            No Assigned Exam Sessions
          </h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            You currently have no exam sessions scheduled or assigned to your profile.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {sessions.map((session) => {
            const isLive = session.status === 'ACTIVE';
            return (
              <Card key={session.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <Badge variant={getStatusBadgeVariant(session.status)}>
                      {session.status}
                    </Badge>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                      Room: <strong>{session.room_name || 'Assigned'}</strong>
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
                    {session.exam_title || `Exam Session #${session.id.slice(0, 8)}`}
                  </h3>

                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1.25rem' }}>
                    <div>Window: {formatDateTime(session.start_time)} – {formatDateTime(session.end_time)}</div>
                    <div>Duration: {session.exam_duration_minutes || 60} minutes</div>
                  </div>
                </div>

                <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', gap: '0.75rem' }}>
                  <Button
                    variant={isLive ? 'primary' : 'secondary'}
                    style={{ flex: 1 }}
                    onClick={() => navigate(`/candidate/readiness/${session.id}`)}
                  >
                    {isLive ? 'Enter Examination' : 'Pre-Exam Readiness'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
