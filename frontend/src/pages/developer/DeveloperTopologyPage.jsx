/**
 * @file DeveloperTopologyPage.jsx
 * @description Interactive Infrastructure Topology Map (Workspace 5).
 * Renders an accessible, responsive, interactive SVG service mesh visualizing real deployed components
 * and their live health states without using Mermaid or ASCII diagrams.
 */

import React, { useState, useEffect } from 'react';
import { getDeveloperTopology } from '../../api/developerApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Network,
  RefreshCw,
  Server,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Cpu,
  Layers,
  Info,
} from 'lucide-react';

export function DeveloperTopologyPage() {
  const [topology, setTopology] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState('node_api');

  async function loadTopology() {
    try {
      setLoading(true);
      const data = await getDeveloperTopology();
      setTopology(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load topology');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTopology();
  }, []);

  if (loading && !topology) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size="lg" className="text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Mapping infrastructure service mesh...</span>
      </div>
    );
  }

  const nodes = topology?.nodes || [];
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  function getStatusColor(status) {
    if (status === 'UP') return '#10b981';
    if (status === 'DEGRADED') return '#f59e0b';
    return '#ef4444';
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Topology Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Network className="h-7 w-7 text-primary" />
            Infrastructure Topology & Network Mesh
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Interactive SVG service mesh with real-time health overlays. Select any service node to inspect network boundaries.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadTopology} className="h-8 text-xs flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Topology</span>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Topology Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Grid: SVG Map on Left, Details Panel on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SVG Service Mesh Viewport */}
        <Card className="lg:col-span-8 shadow-xs border-border/80 overflow-hidden">
          <CardContent className="p-3 bg-slate-950 rounded-xl overflow-x-auto">
            <svg
              viewBox="0 0 880 500"
              width="100%"
              height="500"
              className="block min-w-[700px]"
              role="img"
              aria-label="ProctorNet System Topology Map"
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 8 5 L 0 9 z" fill="#64748b" />
                </marker>
              </defs>

              {/* Public Client Zone */}
              <rect x="20" y="40" width="180" height="420" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
              <text x="110" y="65" fill="#f8fafc" fontSize="11" fontWeight="700" textAnchor="middle">
                PUBLIC INTERNET (0.0.0.0/0)
              </text>

              <g
                transform="translate(35, 90)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('candidate_clients')}
              >
                <rect x="0" y="0" width="150" height="60" rx="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
                <text x="75" y="25" fill="#38bdf8" fontSize="11" fontWeight="600" textAnchor="middle">Candidate Clients</text>
                <text x="75" y="45" fill="#94a3b8" fontSize="9" textAnchor="middle">HTTPS / WSS / WebRTC</text>
              </g>

              <g
                transform="translate(35, 170)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('faculty_clients')}
              >
                <rect x="0" y="0" width="150" height="60" rx="6" fill="#0f172a" stroke="#a7f3d0" strokeWidth="1" />
                <text x="75" y="25" fill="#a7f3d0" fontSize="11" fontWeight="600" textAnchor="middle">Faculty &amp; Proctors</text>
                <text x="75" y="45" fill="#94a3b8" fontSize="9" textAnchor="middle">Web App Dashboards</text>
              </g>

              <g transform="translate(35, 270)">
                <rect x="0" y="0" width="150" height="160" rx="6" fill="#2d1215" stroke="#e11d48" strokeWidth="1" />
                <text x="75" y="25" fill="#f43f5e" fontSize="10" fontWeight="700" textAnchor="middle">PUBLIC BLOCKED</text>
                <text x="75" y="55" fill="#fca5a5" fontSize="9" textAnchor="middle">SSH Port 22 (DROP)</text>
                <text x="75" y="85" fill="#fca5a5" fontSize="9" textAnchor="middle">Developer Plane (403)</text>
                <text x="75" y="115" fill="#fca5a5" fontSize="9" textAnchor="middle">PostgreSQL / Redis (DROP)</text>
                <text x="75" y="145" fill="#fca5a5" fontSize="9" textAnchor="middle">RabbitMQ (DROP)</text>
              </g>

              {/* WireGuard Management Zone */}
              <g
                transform="translate(240, 40)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('wireguard')}
              >
                <rect
                  x="0"
                  y="0"
                  width="220"
                  height="120"
                  rx="8"
                  fill="#1e293b"
                  stroke={selectedNodeId === 'wireguard' ? '#8b5cf6' : '#6d28d9'}
                  strokeWidth="2"
                />
                <rect x="0" y="0" width="220" height="26" rx="8" fill="#6d28d9" />
                <text x="110" y="18" fill="#ffffff" fontSize="11" fontWeight="700" textAnchor="middle">
                  WireGuard Network (10.100.0.0/24)
                </text>
                <text x="110" y="50" fill="#ede9fe" fontSize="11" fontWeight="600" textAnchor="middle">
                  Gateway: 10.100.0.1 (wg0)
                </text>
                <text x="110" y="70" fill="#c4b5fd" fontSize="9" textAnchor="middle">
                  Port: 51820 / UDP (MTU 1420)
                </text>
                <circle cx="20" cy="100" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 'wireguard')?.status || 'UP')} />
                <text x="32" y="103" fill="#94a3b8" fontSize="9">Peer Range: 10.100.0.2 - 254</text>
              </g>

              {/* Nginx Edge */}
              <g
                transform="translate(240, 200)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('nginx_edge')}
              >
                <rect
                  x="0"
                  y="0"
                  width="220"
                  height="70"
                  rx="8"
                  fill="#1e293b"
                  stroke={selectedNodeId === 'nginx_edge' ? '#38bdf8' : '#2563eb'}
                  strokeWidth="2"
                />
                <text x="110" y="25" fill="#60a5fa" fontSize="12" fontWeight="700" textAnchor="middle">
                  Nginx Edge Reverse Proxy
                </text>
                <text x="110" y="45" fill="#94a3b8" fontSize="9" textAnchor="middle">
                  Ports: 80 / 443 / 8443 (TLS 1.3 Termination)
                </text>
                <circle cx="20" cy="55" r="4" fill="#10b981" />
                <text x="32" y="58" fill="#94a3b8" fontSize="9">Public Edge Ingress</text>
              </g>

              {/* Node.js Modular Monolith */}
              <g
                transform="translate(240, 310)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('node_api')}
              >
                <rect
                  x="0"
                  y="0"
                  width="220"
                  height="150"
                  rx="8"
                  fill="#1e293b"
                  stroke={selectedNodeId === 'node_api' ? '#a78bfa' : '#7c3aed'}
                  strokeWidth="2"
                />
                <rect x="0" y="0" width="220" height="26" rx="8" fill="#7c3aed" />
                <text x="110" y="18" fill="#ffffff" fontSize="11" fontWeight="700" textAnchor="middle">
                  Node.js Modular Monolith
                </text>
                <text x="110" y="45" fill="#f8fafc" fontSize="10" fontWeight="600" textAnchor="middle">
                  Port 4000 (Internal Only)
                </text>
                <text x="110" y="65" fill="#c4b5fd" fontSize="9" textAnchor="middle">
                  - 13 Live Subsystem Health Probes
                </text>
                <text x="110" y="80" fill="#c4b5fd" fontSize="9" textAnchor="middle">
                  - 5,000-Log Circular Ring Buffer
                </text>
                <text x="110" y="95" fill="#c4b5fd" fontSize="9" textAnchor="middle">
                  - Immutable Technical Audit
                </text>
                <circle cx="20" cy="130" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 'node_api')?.status || 'UP')} />
                <text x="32" y="133" fill="#94a3b8" fontSize="9">
                  Status: {topology?.nodes?.find(n => n.id === 'node_api')?.status || 'UP'}
                </text>
              </g>

              {/* Isolated Data Plane */}
              <rect x="500" y="40" width="360" height="420" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
              <text x="680" y="65" fill="#f8fafc" fontSize="11" fontWeight="700" textAnchor="middle">
                ISOLATED DATA &amp; WORKER PLANE
              </text>

              {/* PostgreSQL Primary */}
              <g
                transform="translate(520, 80)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('postgres_primary')}
              >
                <rect
                  x="0"
                  y="0"
                  width="160"
                  height="65"
                  rx="6"
                  fill="#0f172a"
                  stroke={selectedNodeId === 'postgres_primary' ? '#38bdf8' : '#334155'}
                  strokeWidth="1.5"
                />
                <circle cx="15" cy="20" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 'postgres_primary')?.status || 'UP')} />
                <text x="26" y="24" fill="#38bdf8" fontSize="11" fontWeight="600">PostgreSQL Primary</text>
                <text x="15" y="42" fill="#94a3b8" fontSize="9">Port 5432 (Sole Authority)</text>
                <text x="15" y="55" fill="#64748b" fontSize="8">Loopback / EBS Volume</text>
              </g>

              {/* PostgreSQL Replica */}
              <g
                transform="translate(690, 80)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('postgres_replica')}
              >
                <rect
                  x="0"
                  y="0"
                  width="155"
                  height="65"
                  rx="6"
                  fill="#0f172a"
                  stroke={selectedNodeId === 'postgres_replica' ? '#38bdf8' : '#334155'}
                  strokeWidth="1.5"
                />
                <circle cx="15" cy="20" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 'postgres_replica')?.status || 'UP')} />
                <text x="26" y="24" fill="#38bdf8" fontSize="11" fontWeight="600">Postgres Replica</text>
                <text x="15" y="42" fill="#94a3b8" fontSize="9">Streaming Replication</text>
                <text x="15" y="55" fill="#64748b" fontSize="8">Lag: 0s (Standalone)</text>
              </g>

              {/* Redis */}
              <g
                transform="translate(520, 160)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('redis')}
              >
                <rect
                  x="0"
                  y="0"
                  width="160"
                  height="65"
                  rx="6"
                  fill="#0f172a"
                  stroke={selectedNodeId === 'redis' ? '#f87171' : '#334155'}
                  strokeWidth="1.5"
                />
                <circle cx="15" cy="20" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 'redis')?.status || 'UP')} />
                <text x="26" y="24" fill="#f87171" fontSize="11" fontWeight="600">Redis 7</text>
                <text x="15" y="42" fill="#94a3b8" fontSize="9">Port 6379 (Cache/PubSub)</text>
                <text x="15" y="55" fill="#64748b" fontSize="8">Non-Authoritative</text>
              </g>

              {/* RabbitMQ */}
              <g
                transform="translate(690, 160)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('rabbitmq')}
              >
                <rect
                  x="0"
                  y="0"
                  width="155"
                  height="65"
                  rx="6"
                  fill="#0f172a"
                  stroke={selectedNodeId === 'rabbitmq' ? '#fbbf24' : '#334155'}
                  strokeWidth="1.5"
                />
                <circle cx="15" cy="20" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 'rabbitmq')?.status || 'UP')} />
                <text x="26" y="24" fill="#fbbf24" fontSize="11" fontWeight="600">RabbitMQ 3.13</text>
                <text x="15" y="42" fill="#94a3b8" fontSize="9">Port 5672 (Queues)</text>
                <text x="15" y="55" fill="#64748b" fontSize="8">Durable Exchanges</text>
              </g>

              {/* Outbox Poller & Evaluation Consumer */}
              <g
                transform="translate(520, 240)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('outbox_poller')}
              >
                <rect
                  x="0"
                  y="0"
                  width="160"
                  height="65"
                  rx="6"
                  fill="#0f172a"
                  stroke={selectedNodeId === 'outbox_poller' ? '#a7f3d0' : '#334155'}
                  strokeWidth="1.5"
                />
                <circle cx="15" cy="20" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 'outbox_poller')?.status || 'UP')} />
                <text x="26" y="24" fill="#34d399" fontSize="11" fontWeight="600">Outbox Poller</text>
                <text x="15" y="42" fill="#94a3b8" fontSize="9">Transactional Polling</text>
                <text x="15" y="55" fill="#64748b" fontSize="8">Guaranteed Delivery</text>
              </g>

              <g
                transform="translate(690, 240)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('evaluation_consumer')}
              >
                <rect
                  x="0"
                  y="0"
                  width="155"
                  height="65"
                  rx="6"
                  fill="#0f172a"
                  stroke={selectedNodeId === 'evaluation_consumer' ? '#a7f3d0' : '#334155'}
                  strokeWidth="1.5"
                />
                <circle cx="15" cy="20" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 'evaluation_consumer')?.status || 'UP')} />
                <text x="26" y="24" fill="#34d399" fontSize="11" fontWeight="600">Evaluation Worker</text>
                <text x="15" y="42" fill="#94a3b8" fontSize="9">Async Exam Scoring</text>
                <text x="15" y="55" fill="#64748b" fontSize="8">Idempotent Pipeline</text>
              </g>

              {/* SFU & Coturn */}
              <g
                transform="translate(520, 320)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('sfu')}
              >
                <rect
                  x="0"
                  y="0"
                  width="160"
                  height="65"
                  rx="6"
                  fill="#0f172a"
                  stroke={selectedNodeId === 'sfu' ? '#c084fc' : '#334155'}
                  strokeWidth="1.5"
                />
                <circle cx="15" cy="20" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 'sfu')?.status || 'UP')} />
                <text x="26" y="24" fill="#c084fc" fontSize="11" fontWeight="600">Mediasoup SFU</text>
                <text x="15" y="42" fill="#94a3b8" fontSize="9">UDP 40000-49999</text>
                <text x="15" y="55" fill="#64748b" fontSize="8">Native C++ Workers</text>
              </g>

              <g
                transform="translate(690, 320)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('coturn')}
              >
                <rect
                  x="0"
                  y="0"
                  width="155"
                  height="65"
                  rx="6"
                  fill="#0f172a"
                  stroke={selectedNodeId === 'coturn' ? '#c084fc' : '#334155'}
                  strokeWidth="1.5"
                />
                <circle cx="15" cy="20" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 'coturn')?.status || 'UP')} />
                <text x="26" y="24" fill="#c084fc" fontSize="11" fontWeight="600">Coturn Relay</text>
                <text x="15" y="42" fill="#94a3b8" fontSize="9">UDP/TCP 3478</text>
                <text x="15" y="55" fill="#64748b" fontSize="8">Ephemeral HMAC</text>
              </g>

              {/* AWS S3 Storage */}
              <g
                transform="translate(520, 395)"
                className="cursor-pointer"
                onClick={() => setSelectedNodeId('s3_storage')}
              >
                <rect
                  x="0"
                  y="0"
                  width="325"
                  height="50"
                  rx="6"
                  fill="#0f172a"
                  stroke={selectedNodeId === 's3_storage' ? '#f59e0b' : '#334155'}
                  strokeWidth="1.5"
                />
                <circle cx="15" cy="25" r="4" fill={getStatusColor(topology?.nodes?.find(n => n.id === 's3_storage')?.status || 'UP')} />
                <text x="26" y="28" fill="#fbbf24" fontSize="11" fontWeight="600">AWS S3 Encrypted Storage &amp; Backup Sync</text>
                <text x="26" y="42" fill="#94a3b8" fontSize="8">Evidence Presigned PUT/GET | AES256 Cloud Sync</text>
              </g>

              {/* Connections */}
              <line x1="185" y1="120" x2="240" y2="225" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4" markerEnd="url(#arrow)" />
              <line x1="185" y1="200" x2="240" y2="240" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4" markerEnd="url(#arrow)" />
              <line x1="350" y1="160" x2="350" y2="310" stroke="#a78bfa" strokeWidth="2" markerEnd="url(#arrow)" />
              <line x1="350" y1="270" x2="350" y2="310" stroke="#38bdf8" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="460" y1="350" x2="520" y2="120" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="460" y1="370" x2="520" y2="190" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="460" y1="390" x2="690" y2="190" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />
            </svg>
          </CardContent>
        </Card>

        {/* Selected Component Telemetry Inspection Drawer */}
        <Card className="lg:col-span-4 shadow-xs border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              Component Telemetry
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedNode ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Selected Node
                  </span>
                  <div className="text-base font-bold text-foreground mt-0.5">
                    {selectedNode.label || selectedNode.id}
                  </div>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge
                    variant={selectedNode.status === 'UP' ? 'default' : selectedNode.status === 'DEGRADED' ? 'secondary' : 'destructive'}
                    className={selectedNode.status === 'UP' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                  >
                    {selectedNode.status || 'UP'}
                  </Badge>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Type:</span>
                  <strong className="text-foreground font-mono">{selectedNode.type || 'RUNTIME'}</strong>
                </div>

                {selectedNode.protocol && (
                  <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">Protocol:</span>
                    <strong className="text-foreground font-mono">{selectedNode.protocol}</strong>
                  </div>
                )}

                {selectedNode.ports && (
                  <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">Ports:</span>
                    <strong className="text-foreground font-mono">{selectedNode.ports.join(', ')}</strong>
                  </div>
                )}

                {selectedNode.subnet && (
                  <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">Subnet:</span>
                    <strong className="text-foreground font-mono">{selectedNode.subnet}</strong>
                  </div>
                )}

                {selectedNode.details && (
                  <div className="pt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Live Telemetry Payload
                    </span>
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/80 font-mono text-[11px] max-h-[220px] overflow-y-auto">
                      <pre className="m-0 whitespace-pre-wrap text-foreground">
                        {JSON.stringify(selectedNode.details, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-xs">
                Select any node in the topology diagram to view real-time telemetry.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
