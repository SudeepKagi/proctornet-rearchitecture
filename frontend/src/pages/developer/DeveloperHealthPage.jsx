/**
 * @file DeveloperHealthPage.jsx
 * @description Comprehensive 13-Subsystem Health Telemetry Matrix (Workspace 2).
 * Displays live statuses, latencies, connection metrics, and failure diagnostics.
 */

import React, { useState, useEffect } from 'react';
import { getDeveloperHealth } from '../../api/developerApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

const SUBSYSTEM_METADATA = {
  node_api: { label: 'Node.js Backend API', category: 'Application Runtime' },
  postgres_primary: { label: 'PostgreSQL Primary', category: 'Database (Authoritative)' },
  postgres_replica: { label: 'PostgreSQL Standalone / Replica', category: 'Database' },
  redis: { label: 'Redis Cache & Pub/Sub', category: 'Cache / Ephemeral' },
  rabbitmq: { label: 'RabbitMQ Message Broker', category: 'Asynchronous Broker' },
  websocket: { label: 'WebSocket Realtime Gateway', category: 'Realtime Fan-out' },
  sfu: { label: 'Mediasoup SFU (Media Plane)', category: 'WebRTC Selective Forwarder' },
  coturn: { label: 'Coturn STUN / TURN Relay', category: 'Media NAT Traversal' },
  outbox_poller: { label: 'Transactional Outbox Poller', category: 'Background Worker' },
  evaluation_consumer: { label: 'Evaluation Async Consumer', category: 'Background Worker' },
  s3_storage: { label: 'AWS S3 Evidence Storage', category: 'Object Storage' },
  backup_service: { label: 'Automated Backup Engine', category: 'Maintenance' },
  wireguard: { label: 'WireGuard Management VPN', category: 'Secure Management' }
};

export function DeveloperHealthPage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedKey, setExpandedKey] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function loadHealth(force = false) {
    try {
      if (force) setRefreshing(true);
      const data = await getDeveloperHealth(force);
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch subsystem health matrix');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadHealth(false);
    if (!autoRefresh) return;

    const interval = setInterval(() => loadHealth(false), 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (loading && !health) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const subsystems = health?.subsystems || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
            Comprehensive 13-Subsystem Health Matrix
          </h2>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Last checked: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'N/A'} {health?.cached && '(cached)'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (5s)
          </label>
          <Button
            variant="secondary"
            size="sm"
            disabled={refreshing}
            onClick={() => loadHealth(true)}
          >
            {refreshing ? 'Probing...' : 'Force Probe Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}

      {/* Health Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
        {Object.entries(subsystems).map(([key, sub]) => {
          const meta = SUBSYSTEM_METADATA[key] || { label: key, category: 'Subsystem' };
          const isExpanded = expandedKey === key;
          const badgeVariant =
            sub.status === 'UP' ? 'success' : sub.status === 'DEGRADED' ? 'warning' : 'danger';

          return (
            <Card key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                    {meta.category}
                  </span>
                  <div style={{ fontSize: '1.125rem', fontWeight: 600, marginTop: '0.125rem' }}>
                    {meta.label}
                  </div>
                </div>
                <Badge variant={badgeVariant}>{sub.status}</Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: '0.8125rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  Latency: <strong>{sub.latencyMs !== undefined ? `${sub.latencyMs} ms` : 'N/A'}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  {isExpanded ? 'Hide Details ▲' : 'Inspect Telemetry ▼'}
                </button>
              </div>

              {isExpanded && sub.details && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    backgroundColor: 'var(--color-surface-sunken)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  {JSON.stringify(sub.details, null, 2)}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
