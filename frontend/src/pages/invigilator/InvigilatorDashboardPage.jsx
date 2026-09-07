/**
 * @file InvigilatorDashboardPage.jsx
 * @description Invigilator portal listing assigned proctoring sessions.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as sessionsApi from '../../api/sessionsApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge, getStatusBadgeVariant } from '../../components/common/Badge.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function InvigilatorDashboardPage() {
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
        setError(err.message || 'Failed to load assigned sessions');
      } finally {
        setLoading(false);
      }
    }
    loadSessions();
  }, []);

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          Invigilator Proctoring Dashboard
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
          Monitor enrolled candidate attempt status and oversee in-session academic integrity.
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
          <Spinner size="lg" label="Loading invigilation assignments..." />
        </div>
      ) : sessions.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <h3>No Assigned Invigilation Sessions</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            You do not currently have any proctoring duties assigned to your user account.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sessions.map((sess) => (
            <Card key={sess.id} padding="normal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                  <h3 style={{ fontSize: '1.125rem', margin: 0 }}>
                    {sess.exam_title || `Session #${sess.id.slice(0, 8)}`}
                  </h3>
                  <Badge variant={getStatusBadgeVariant(sess.status)}>{sess.status}</Badge>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', display: 'flex', gap: '1.5rem' }}>
                  <span>Room: <strong>{sess.room_name || 'Virtual / Unassigned'}</strong></span>
                  <span>Start: <strong>{new Date(sess.start_time).toLocaleString()}</strong></span>
                  <span>End: <strong>{new Date(sess.end_time).toLocaleString()}</strong></span>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/invigilator/sessions/${sess.id}`)}
              >
                Launch Session Monitor &rarr;
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
