/**
 * @file DeveloperOverviewPage.jsx
 * @description Executive Developer Operations Overview Screen (Workspace 1).
 * Displays high-level system telemetry, health summary, and quick status metrics.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDeveloperOverview } from '../../api/developerApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { StateBoundary } from '@/components/common/StateBoundary.jsx';
import {
  Activity,
  AlertTriangle,
  Bug,
  Network,
  ArrowRight,
  Server,
  Cpu,
  HardDrive,
  Clock,
  RefreshCw,
  Terminal,
  ShieldAlert,
  Sliders,
} from 'lucide-react';

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

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <StateBoundary
          isLoading={loading}
          error={error}
          isEmpty={!data}
          loadingMessage="Loading system operations telemetry..."
          emptyTitle="No Telemetry Available"
          emptyDescription="Developer telemetry pipeline has not returned system metrics yet."
          onRetry={loadOverview}
        />
      </div>
    );
  }

  const health = data?.healthSummary || {};
  const incidents = data?.incidentsSummary || {};
  const metrics = data?.telemetryMetrics || {};
  const specs = data?.systemSpecs || {};
  const mgmt = data?.managementPlane || {};

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Controls Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" />
            Developer Operations & Telemetry
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time infrastructure health, distributed consensus, and operational runtime baseline.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="auto-refresh-overview"
              checked={autoRefresh}
              onCheckedChange={(checked) => setAutoRefresh(Boolean(checked))}
            />
            <label htmlFor="auto-refresh-overview" className="text-xs font-medium text-foreground cursor-pointer">
              Auto-refresh (10s)
            </label>
          </div>
          <Button variant="outline" size="sm" onClick={loadOverview} className="h-8 text-xs">
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              System Health
            </CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{health.status || 'UNKNOWN'}</div>
            <div className="mt-2 flex items-center justify-between">
              <Badge
                variant={health.status === 'UP' ? 'default' : health.status === 'DEGRADED' ? 'secondary' : 'destructive'}
                className={health.status === 'UP' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              >
                {health.upCount || 0} / {health.totalSubsystems || 13} UP
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Degraded: {health.degradedCount || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Incidents
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{incidents.totalActiveCount || 0}</div>
            <div className="mt-2 flex items-center justify-between">
              <Badge variant={incidents.totalActiveCount > 0 ? 'destructive' : 'default'} className={incidents.totalActiveCount === 0 ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>
                {incidents.triggeredCount || 0} Triggered
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Ack: {incidents.acknowledgedCount || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Errors (Past Hour)
            </CardTitle>
            <Bug className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{metrics.errorCountLastHour || 0}</div>
            <div className="mt-2 flex items-center justify-between">
              <Badge variant={metrics.errorCountLastHour > 10 ? 'secondary' : 'outline'} className="text-xs font-mono">
                {metrics.fatalCountLastHour || 0} Fatal
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Buf: {metrics.logBufferSize || 0}/{metrics.logBufferCapacity || 5000}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              WireGuard Subnet
            </CardTitle>
            <Network className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold font-mono text-foreground tracking-tight">
              {mgmt.wireguardSubnet || '10.100.0.0/24'}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                ACTIVE
              </Badge>
              <span className="text-[11px] font-mono text-muted-foreground">
                {mgmt.gatewayIp}:{mgmt.port}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Specifications & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-xs border-border/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Runtime & Infrastructure Baseline</CardTitle>
            </div>
            <CardDescription>Host environment specifications and process isolation telemetry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border/50">
              <span className="text-muted-foreground">Node Environment:</span>
              <strong className="text-foreground font-mono">{data?.environment} ({specs.nodeVersion})</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/50">
              <span className="text-muted-foreground">Host Platform / Architecture:</span>
              <strong className="text-foreground">{specs.platform} / {specs.arch} ({specs.cpuCount} CPUs)</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/50">
              <span className="text-muted-foreground">Memory (Free / Total):</span>
              <strong className="text-foreground font-mono">{specs.freeMemoryMb} MB / {specs.totalMemoryMb} MB</strong>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Backend Process Uptime:</span>
              <strong className="text-foreground">
                {Math.floor((data?.uptimeSeconds || 0) / 3600)}h {Math.floor(((data?.uptimeSeconds || 0) % 3600) / 60)}m
              </strong>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Operational Quick Actions</CardTitle>
            </div>
            <CardDescription>Deep-link navigation into dedicated operational observability suites.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-auto p-3 flex flex-col items-start justify-between text-left group"
              onClick={() => navigate('/developer/health')}
            >
              <div>
                <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-primary" />
                  Health Matrix
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  13 probe diagnostics & latency
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-1 mt-2" />
            </Button>

            <Button
              variant="outline"
              className="h-auto p-3 flex flex-col items-start justify-between text-left group"
              onClick={() => navigate('/developer/logs')}
            >
              <div>
                <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <Terminal className="h-4 w-4 text-primary" />
                  Masked Logs
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  5,000-entry ring buffer & W3C trace
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-1 mt-2" />
            </Button>

            <Button
              variant="outline"
              className="h-auto p-3 flex flex-col items-start justify-between text-left group"
              onClick={() => navigate('/developer/topology')}
            >
              <div>
                <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <Network className="h-4 w-4 text-primary" />
                  Topology Map
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Interactive SVG service mesh
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-1 mt-2" />
            </Button>

            <Button
              variant="outline"
              className="h-auto p-3 flex flex-col items-start justify-between text-left group"
              onClick={() => navigate('/developer/incidents')}
            >
              <div>
                <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  Incident Triage
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Acknowledge & resolve alerts
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-1 mt-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
