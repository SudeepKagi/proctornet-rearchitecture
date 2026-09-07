/**
 * @file AdminOverviewPage.jsx
 * @description System-wide administrative overview for exams, sessions, and campus facilities.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as examsApi from '../../api/examsApi.js';
import * as sessionsApi from '../../api/sessionsApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge, getStatusBadgeVariant } from '../../components/common/Badge.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function AdminOverviewPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [examsData, sessionsData, roomsData] = await Promise.all([
          examsApi.listExams().catch(() => []),
          sessionsApi.listSessions().catch(() => []),
          sessionsApi.listRooms().catch(() => []),
        ]);
        setExams(examsData);
        setSessions(sessionsData);
        setRooms(roomsData);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Spinner size="lg" label="Loading system-wide metrics..." />
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          System Administration Overview
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
          Global oversight of academic blueprints, examination execution windows, and physical rooms.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <Card padding="normal">
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
            TOTAL EXAM BLUEPRINTS
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary)' }}>
            {exams.length}
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/faculty')}>
              Manage All Exams &rarr;
            </Button>
          </div>
        </Card>

        <Card padding="normal">
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
            SCHEDULED SESSIONS
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-success)' }}>
            {sessions.length}
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/faculty/sessions')}>
              Manage Sessions &rarr;
            </Button>
          </div>
        </Card>

        <Card padding="normal">
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
            CAMPUS ROOMS
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {rooms.length}
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/faculty/sessions')}>
              Inspect Facilities &rarr;
            </Button>
          </div>
        </Card>
      </div>

      <Card padding="normal">
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Active System Sessions</h3>
        {sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
            No sessions currently active in the system.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Session ID</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Exam</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Room</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 5).map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-family-mono)' }}>
                    {s.id.slice(0, 8)}...
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{s.exam_title || '—'}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{s.room_name || 'Virtual'}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <Badge variant={getStatusBadgeVariant(s.status)} size="sm">
                      {s.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
