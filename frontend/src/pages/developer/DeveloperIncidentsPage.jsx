/**
 * @file DeveloperIncidentsPage.jsx
 * @description Technical Incident Triage & Alerts Dashboard (Workspace 6).
 * Surfaces operational service degradations with Acknowledge and Resolve workflows.
 */

import React, { useState, useEffect } from 'react';
import {
  getDeveloperIncidents,
  acknowledgeDeveloperIncident,
  resolveDeveloperIncident
} from '../../api/developerApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

const STATUS_TABS = ['ALL', 'TRIGGERED', 'ACKNOWLEDGED', 'RESOLVED'];

export function DeveloperIncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [actionNotes, setActionNotes] = useState('');
  const [activeModal, setActiveModal] = useState(null); // { type: 'ACK' | 'RESOLVE', incidentId: string }
  const [submitting, setSubmitting] = useState(false);

  async function loadIncidents() {
    try {
      setLoading(true);
      const filters = {};
      if (statusFilter !== 'ALL') filters.status = statusFilter;

      const res = await getDeveloperIncidents(filters);
      setIncidents(res.incidents || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch operational incidents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIncidents();
  }, [statusFilter]);

  async function handleAcknowledge(incidentId) {
    try {
      setSubmitting(true);
      await acknowledgeDeveloperIncident(incidentId, actionNotes);
      setActiveModal(null);
      setActionNotes('');
      await loadIncidents();
    } catch (err) {
      setError(err.message || 'Failed to acknowledge incident');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(incidentId) {
    try {
      setSubmitting(true);
      await resolveDeveloperIncident(incidentId, actionNotes);
      setActiveModal(null);
      setActionNotes('');
      await loadIncidents();
    } catch (err) {
      setError(err.message || 'Failed to resolve incident');
    } finally {
      setSubmitting(false);
    }
  }

  function getSeverityBadge(sev) {
    switch (sev?.toUpperCase()) {
      case 'CRITICAL':
        return <Badge variant="danger">CRITICAL</Badge>;
      case 'HIGH':
        return <Badge variant="warning">HIGH</Badge>;
      case 'MEDIUM':
        return <Badge variant="primary">MEDIUM</Badge>;
      default:
        return <Badge variant="neutral">LOW</Badge>;
    }
  }

  function getStatusBadge(status) {
    switch (status?.toUpperCase()) {
      case 'TRIGGERED':
        return <Badge variant="danger">TRIGGERED</Badge>;
      case 'ACKNOWLEDGED':
        return <Badge variant="warning">ACKNOWLEDGED</Badge>;
      case 'RESOLVED':
        return <Badge variant="success">RESOLVED</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Status Filters */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor:
                    statusFilter === tab
                      ? 'var(--color-primary)'
                      : 'var(--color-surface)',
                  color:
                    statusFilter === tab
                      ? 'var(--color-text-inverse)'
                      : 'var(--color-text-secondary)'
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <Button variant="secondary" size="sm" onClick={loadIncidents}>
            Refresh Incidents
          </Button>
        </div>
      </Card>

      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}

      {/* Incidents List */}
      <Card>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <Spinner size="md" />
          </div>
        ) : incidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)' }}>
            No operational incidents matching the selected status. All systems normal.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {incidents.map((inc) => (
              <div
                key={inc.id}
                style={{
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  backgroundColor: 'var(--color-surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    {getSeverityBadge(inc.severity)}
                    {getStatusBadge(inc.status)}
                    <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                      {inc.component}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                      ({inc.id})
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Triggered: {new Date(inc.triggeredAt).toLocaleString()}
                    {inc.occurrenceCount > 1 && ` (Seen ${inc.occurrenceCount}x)`}
                  </div>
                </div>

                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                  {inc.message}
                </div>

                {/* Status Metadata & Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border-subtle)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    {inc.acknowledgedBy && (
                      <span style={{ marginRight: '1rem' }}>
                        Ack by: <strong>{inc.acknowledgedBy}</strong> at {new Date(inc.acknowledgedAt).toLocaleTimeString()}
                      </span>
                    )}
                    {inc.resolvedBy && (
                      <span>
                        Resolved by: <strong>{inc.resolvedBy}</strong> at {new Date(inc.resolvedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {inc.status === 'TRIGGERED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setActiveModal({ type: 'ACK', incidentId: inc.id });
                          setActionNotes('');
                        }}
                      >
                        Acknowledge
                      </Button>
                    )}
                    {inc.status !== 'RESOLVED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setActiveModal({ type: 'RESOLVE', incidentId: inc.id });
                          setActionNotes('');
                        }}
                      >
                        Mark Resolved
                      </Button>
                    )}
                  </div>
                </div>

                {/* Notes History */}
                {inc.notes && inc.notes.length > 0 && (
                  <div style={{ marginTop: '0.25rem', padding: '0.5rem', backgroundColor: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}>
                    <strong>Investigation Notes:</strong>
                    {inc.notes.map((note, idx) => (
                      <div key={idx} style={{ marginTop: '0.25rem', color: 'var(--color-text-secondary)' }}>
                        &bull; [{new Date(note.timestamp).toLocaleTimeString()}] {note.author}: {note.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Action Dialog / Modal */}
      {activeModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem'
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              maxWidth: '480px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>
              {activeModal.type === 'ACK' ? 'Acknowledge Incident' : 'Resolve Incident'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              Incident: <strong>{activeModal.incidentId}</strong>
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                Operational Notes / Root Cause (Optional)
              </label>
              <textarea
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit'
                }}
                placeholder="Enter triage diagnosis, mitigation steps, or root-cause details..."
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={submitting}
                onClick={() => setActiveModal(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={submitting}
                onClick={() =>
                  activeModal.type === 'ACK'
                    ? handleAcknowledge(activeModal.incidentId)
                    : handleResolve(activeModal.incidentId)
                }
              >
                {submitting ? 'Submitting...' : 'Confirm Action'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
