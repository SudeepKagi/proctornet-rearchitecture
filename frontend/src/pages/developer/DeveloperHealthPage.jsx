/**
 * @file DeveloperHealthPage.jsx
 * @description Comprehensive 13-Subsystem Health Telemetry Matrix (Workspace 2).
 * Displays live statuses, latencies, connection metrics, and failure diagnostics.
 */

import React, { useState, useEffect } from 'react';
import { getDeveloperHealth } from '../../api/developerApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Server,
  Database,
  Radio,
  Layers,
  Cpu,
  ShieldCheck,
} from 'lucide-react';

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
  wireguard: { label: 'WireGuard Management VPN', category: 'Secure Management' },
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
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size="lg" className="text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Probing subsystem health matrix...</span>
      </div>
    );
  }

  const subsystems = health?.subsystems || {};

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" />
            13-Subsystem Health Telemetry Matrix
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Last checked: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'N/A'}{' '}
            {health?.cached && '(cached response)'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="auto-refresh-health"
              checked={autoRefresh}
              onCheckedChange={(checked) => setAutoRefresh(Boolean(checked))}
            />
            <label htmlFor="auto-refresh-health" className="text-xs font-medium text-foreground cursor-pointer">
              Auto-refresh (5s)
            </label>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => loadHealth(true)}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Probing...' : 'Force Probe Refresh'}</span>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Probe Failure</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Health Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(subsystems).map(([key, sub]) => {
          const meta = SUBSYSTEM_METADATA[key] || { label: key, category: 'Subsystem' };
          const isExpanded = expandedKey === key;
          const badgeVariant =
            sub.status === 'UP' ? 'default' : sub.status === 'DEGRADED' ? 'secondary' : 'destructive';

          return (
            <Card key={key} className="shadow-xs border-border/80 transition-all hover:border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {meta.category}
                    </span>
                    <h3 className="font-semibold text-foreground text-sm mt-0.5">{meta.label}</h3>
                  </div>
                  <Badge
                    variant={badgeVariant}
                    className={sub.status === 'UP' ? 'bg-emerald-600 hover:bg-emerald-700 text-xs' : 'text-xs'}
                  >
                    {sub.status}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">
                    Latency:{' '}
                    <strong className="text-foreground font-mono">
                      {sub.latencyMs !== undefined ? `${sub.latencyMs} ms` : 'N/A'}
                    </strong>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2 text-primary hover:text-primary"
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                  >
                    <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                    {isExpanded ? (
                      <ChevronUp className="h-3 w-3 ml-1" />
                    ) : (
                      <ChevronDown className="h-3 w-3 ml-1" />
                    )}
                  </Button>
                </div>

                {isExpanded && sub.details && (
                  <div className="rounded-md bg-muted/40 border border-border/80 p-3 text-[11px] font-mono text-foreground overflow-x-auto max-h-[180px]">
                    <pre className="m-0 whitespace-pre-wrap">{JSON.stringify(sub.details, null, 2)}</pre>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
