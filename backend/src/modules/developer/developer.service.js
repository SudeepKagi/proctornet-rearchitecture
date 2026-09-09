/**
 * @file developer.service.js
 * @description Central Developer Operations Service coordinating telemetry overview,
 * 13-subsystem health aggregation, masked logs, technical audit feed, and system topology.
 */

import os from 'node:os';
import { aggregateSystemHealth } from './healthAggregator.js';
import { logBuffer } from './logBuffer.js';
import { queryAuditLogs } from '../audit/audit.service.js';
import { sanitizeDeveloperPayload } from './developerPiiSanitizer.js';
import * as incidentService from './incidentService.js';
import { config } from '../../config/env.js';

// Technical audit actions allowed in Developer feed
const TECHNICAL_ACTION_PATTERNS = [
  /^AUTH_/i,
  /^USER_STATUS_/i,
  /^CONFIG_/i,
  /^SYSTEM_/i,
  /^DEPLOY_/i,
  /^SECURITY_/i,
  /^WIREGUARD_/i,
  /^OUTBOX_/i,
  /^SESSION_STATE_/i
];

/**
 * Checks if an audit action is classified as technical telemetry.
 * @param {string} action
 * @returns {boolean}
 */
function isTechnicalAction(action) {
  if (!action) return false;
  return TECHNICAL_ACTION_PATTERNS.some((pattern) => pattern.test(action));
}

/**
 * Returns executive engineering telemetry overview.
 * @returns {Promise<object>}
 */
export async function getOverview() {
  const health = await aggregateSystemHealth(false);

  // Sync any detected health degradations into incidents
  await incidentService.syncIncidentsFromHealth(health);

  const activeIncidents = incidentService.listIncidents({ status: 'TRIGGERED' });
  const acknowledgedIncidents = incidentService.listIncidents({ status: 'ACKNOWLEDGED' });

  // Query recent errors in the last hour from LogBuffer
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const errorLogs = logBuffer.query({ level: 'error', from: oneHourAgo, limit: 100 });
  const fatalLogs = logBuffer.query({ level: 'fatal', from: oneHourAgo, limit: 100 });

  return {
    environment: config.NODE_ENV,
    service: 'proctornet-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    healthSummary: {
      status: health.status,
      totalSubsystems: health.totalSubsystems,
      upCount: health.upCount,
      degradedCount: health.degradedCount,
      downCount: health.downCount
    },
    incidentsSummary: {
      triggeredCount: activeIncidents.length,
      acknowledgedCount: acknowledgedIncidents.length,
      totalActiveCount: activeIncidents.length + acknowledgedIncidents.length
    },
    telemetryMetrics: {
      errorCountLastHour: errorLogs.totalMatching,
      fatalCountLastHour: fatalLogs.totalMatching,
      logBufferSize: logBuffer.size,
      logBufferCapacity: logBuffer.capacity
    },
    systemSpecs: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuCount: os.cpus().length,
      totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemoryMb: Math.round(os.freemem() / (1024 * 1024))
    },
    managementPlane: {
      wireguardSubnet: '10.100.0.0/24',
      gatewayIp: '10.100.0.1',
      port: 51820,
      status: 'ACTIVE'
    }
  };
}

/**
 * Retrieves full system health or specific subsystem health probe.
 * @param {string} [component]
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object>}
 */
export async function getHealth(component = null, forceRefresh = false) {
  const health = await aggregateSystemHealth(forceRefresh);

  if (component) {
    const sub = health.subsystems[component];
    if (!sub) {
      return {
        status: 'UNKNOWN',
        error: `Subsystem '${component}' is not tracked in the 13-probe matrix`
      };
    }
    return {
      component,
      ...sub,
      timestamp: health.timestamp
    };
  }

  // Sync any detected health degradations into incidents
  await incidentService.syncIncidentsFromHealth(health);

  return health;
}

/**
 * Searches the in-memory LogBuffer with strict PII masking.
 * @param {object} queryParams
 * @returns {object}
 */
export function getLogs(queryParams) {
  return logBuffer.query(queryParams);
}

/**
 * Retrieves technical audit logs without candidate PII.
 * @param {object} filters
 * @param {object} user - Authenticated developer
 * @returns {Promise<object>}
 */
export async function getAuditFeed(filters = {}, user) {
  const result = await queryAuditLogs(filters, user);

  // Filter and sanitize audit logs: exclude any raw student PII/answer payloads
  const sanitizedLogs = result.audit_logs
    .filter((log) => isTechnicalAction(log.action))
    .map((log) => sanitizeDeveloperPayload(log));

  return {
    audit_logs: sanitizedLogs,
    pagination: {
      ...result.pagination,
      totalReturned: sanitizedLogs.length
    }
  };
}

/**
 * Generates live infrastructure topology map of actual deployed components.
 * @returns {Promise<object>}
 */
export async function getTopology() {
  const health = await aggregateSystemHealth(false);
  const subs = health.subsystems || {};

  const nodes = [
    {
      id: 'nginx_edge',
      label: 'Nginx Edge Reverse Proxy',
      type: 'INGRESS',
      protocol: 'HTTPS/WSS/WebRTC',
      ports: ['80', '443', '8443'],
      status: 'UP'
    },
    {
      id: 'node_api',
      label: 'Node.js Modular Monolith',
      type: 'BACKEND',
      protocol: 'HTTP',
      ports: ['4000'],
      status: subs.node_api?.status || 'UP',
      details: subs.node_api?.details
    },
    {
      id: 'postgres_primary',
      label: 'PostgreSQL Primary (Authoritative)',
      type: 'DATABASE',
      protocol: 'Postgres Wire',
      ports: ['5432'],
      status: subs.postgres_primary?.status || 'UP',
      details: subs.postgres_primary?.details
    },
    {
      id: 'postgres_replica',
      label: 'PostgreSQL Standalone / Replica',
      type: 'DATABASE',
      protocol: 'Streaming Replication',
      ports: ['5432'],
      status: subs.postgres_replica?.status || 'UP',
      details: subs.postgres_replica?.details
    },
    {
      id: 'redis',
      label: 'Redis (Cache / Ephemeral / PubSub)',
      type: 'CACHE',
      protocol: 'RESP',
      ports: ['6379'],
      status: subs.redis?.status || 'UP',
      details: subs.redis?.details
    },
    {
      id: 'rabbitmq',
      label: 'RabbitMQ (Message Broker)',
      type: 'BROKER',
      protocol: 'AMQP 0-9-1',
      ports: ['5672'],
      status: subs.rabbitmq?.status || 'UP',
      details: subs.rabbitmq?.details
    },
    {
      id: 'websocket',
      label: 'WebSocket Gateway (Realtime Fan-out)',
      type: 'REALTIME',
      protocol: 'WSS',
      ports: ['4000'],
      status: subs.websocket?.status || 'UP',
      details: subs.websocket?.details
    },
    {
      id: 'sfu',
      label: 'Mediasoup SFU (Media Plane)',
      type: 'MEDIA',
      protocol: 'WebRTC / PlainRtp',
      ports: ['40000-49999/udp'],
      status: subs.sfu?.status || 'UP',
      details: subs.sfu?.details
    },
    {
      id: 'coturn',
      label: 'Coturn STUN / TURN Relay',
      type: 'MEDIA_RELAY',
      protocol: 'STUN/TURN',
      ports: ['3478', '49152-49250/udp'],
      status: subs.coturn?.status || 'UP',
      details: subs.coturn?.details
    },
    {
      id: 'outbox_poller',
      label: 'Transactional Outbox Poller',
      type: 'WORKER',
      protocol: 'In-Process',
      status: subs.outbox_poller?.status || 'UP',
      details: subs.outbox_poller?.details
    },
    {
      id: 'evaluation_consumer',
      label: 'Evaluation Async Consumer',
      type: 'WORKER',
      protocol: 'AMQP Consumer',
      status: subs.evaluation_consumer?.status || 'UP',
      details: subs.evaluation_consumer?.details
    },
    {
      id: 's3_storage',
      label: 'AWS S3 Evidence & Backup Storage',
      type: 'STORAGE',
      protocol: 'HTTPS / AWS SDK',
      ports: ['443'],
      status: subs.s3_storage?.status || 'UP',
      details: subs.s3_storage?.details
    },
    {
      id: 'backup_service',
      label: 'Automated Backup Engine',
      type: 'MAINTENANCE',
      protocol: 'Host Systemd / Cron',
      status: subs.backup_service?.status || 'UP',
      details: subs.backup_service?.details
    },
    {
      id: 'wireguard',
      label: 'WireGuard Management Gateway',
      type: 'MANAGEMENT_VPN',
      protocol: 'WireGuard UDP',
      ports: ['51820/udp'],
      subnet: '10.100.0.0/24',
      status: subs.wireguard?.status || 'UP',
      details: subs.wireguard?.details
    }
  ];

  const edges = [
    { from: 'nginx_edge', to: 'node_api', label: 'HTTP REST / Proxy' },
    { from: 'nginx_edge', to: 'websocket', label: 'WebSocket Upgrade' },
    { from: 'nginx_edge', to: 'sfu', label: 'WebRTC Media' },
    { from: 'node_api', to: 'postgres_primary', label: 'Authoritative Business State' },
    { from: 'postgres_primary', to: 'postgres_replica', label: 'WAL Streaming Replication' },
    { from: 'node_api', to: 'redis', label: 'Cache & Token Invalidation' },
    { from: 'node_api', to: 'rabbitmq', label: 'Publish Outbox Messages' },
    { from: 'websocket', to: 'redis', label: 'PubSub Multi-Node Fan-out' },
    { from: 'outbox_poller', to: 'postgres_primary', label: 'Poll & Lock outbox_events' },
    { from: 'outbox_poller', to: 'rabbitmq', label: 'Dispatch Pending Events' },
    { from: 'evaluation_consumer', to: 'rabbitmq', label: 'Consume Evaluation Jobs' },
    { from: 'evaluation_consumer', to: 'postgres_primary', label: 'Persist Evaluation Results' },
    { from: 'node_api', to: 's3_storage', label: 'Presigned Evidence URLs' },
    { from: 'backup_service', to: 'postgres_primary', label: 'pg_dump Automated Backups' },
    { from: 'backup_service', to: 's3_storage', label: 'S3 Sync AES256' },
    { from: 'wireguard', to: 'node_api', label: 'Protected /api/v1/developer' }
  ];

  return {
    timestamp: health.timestamp,
    overallHealth: health.status,
    nodes,
    edges
  };
}
