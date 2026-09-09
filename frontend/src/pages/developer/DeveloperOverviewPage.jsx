/**
 * @file DeveloperOverviewPage.jsx
 * @description Executive Developer Operations Overview Screen (Workspace 1).
 * Displays high-level system telemetry, health summary, and quick status metrics.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDeveloperOverview } from '../../api/developerApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function DeveloperOverviewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const navigate = useNavigate();

  async function loadOverview() {
    try {
      setLoading((prev) => (data ? false : true));
      const res = await getDeveloperOverview();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load developer overview telemetry');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    if (!autoRefresh) return;

    const interval = setInterval(loadOverview, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-danger)' }}>
          <p style={{ fontWeight: 600 }}>{error}</p>
          <Button variant="secondary" onClick={loadOverview}>Retry</Button>
        </div>
      </Card>
    );
  }

  const health = data?.healthSummary || {};
  const incidents = data?.incidentsSummary || {};
  const metrics = data?.telemetryMetrics || {};
  const specs = data?.systemSpecs || {};
  const mgmt = data?.managementPlane || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Controls Strip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (10s)
        </label>
        <Button variant="secondary" size="sm" onClick={loadOverview}>
          Refresh Now
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem'
        }}
      >
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                System Health
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {health.status || 'UNKNOWN'}
              </div>
            </div>
            <Badge
              variant={health.status === 'UP' ? 'success' : health.status === 'DEGRADED' ? 'warning' : 'danger'}
            >
              {health.upCount || 0} / {health.totalSubsystems || 13} UP
            </Badge>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            Degraded: {health.degradedCount || 0} | Down: {health.downCount || 0}
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Incidents
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {incidents.totalActiveCount || 0}
              </div>
            </div>
            <Badge variant={incidents.totalActiveCount > 0 ? 'danger' : 'success'}>
              {incidents.triggeredCount || 0} Unacknowledged
            </Badge>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            Acknowledged: {incidents.acknowledgedCount || 0}
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Errors (Last Hour)
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {metrics.errorCountLastHour || 0}
              </div>
            </div>
            <Badge variant={metrics.errorCountLastHour > 10 ? 'warning' : 'neutral'}>
              {metrics.fatalCountLastHour || 0} Fatal
            </Badge>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            Buffer: {metrics.logBufferSize || 0} / {metrics.logBufferCapacity || 5000} entries
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                WireGuard Network
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.5rem', fontFamily: 'monospace' }}>
                {mgmt.wireguardSubnet}
              </div>
            </div>
            <Badge variant="success">ACTIVE</Badge>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            Gateway: {mgmt.gatewayIp}:{mgmt.port}
          </div>
        </Card>
      </div>

      {/* System Specifications & Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        <Card title="Runtime & Infrastructure Baseline">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Node Environment:</span>
              <strong>{data?.environment} ({specs.nodeVersion})</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Host Platform / Arch:</span>
              <strong>{specs.platform} / {specs.arch} ({specs.cpuCount} CPUs)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Memory (Free / Total):</span>
              <strong>{specs.freeMemoryMb} MB / {specs.totalMemoryMb} MB</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Backend Process Uptime:</span>
              <strong>{Math.floor((data?.uptimeSeconds || 0) / 3600)}h {Math.floor(((data?.uptimeSeconds || 0) % 3600) / 60)}m</strong>
            </div>
          </div>
        </Card>

        <Card title="Operational Quick Actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Button variant="primary" onClick={() => navigate('/developer/health')}>
              Inspect Subsystem Health Matrix (13 Probes)
            </Button>
            <Button variant="secondary" onClick={() => navigate('/developer/logs')}>
              Search Structured System Logs (Circular Buffer)
            </Button>
            <Button variant="secondary" onClick={() => navigate('/developer/topology')}>
              View Infrastructure Topology Map
            </Button>
            <Button variant="secondary" onClick={() => navigate('/developer/incidents')}>
              Manage Active Incidents &amp; Alerts
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
