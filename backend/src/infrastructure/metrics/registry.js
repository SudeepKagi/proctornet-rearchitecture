/**
 * @file registry.js
 * @description Centralized Prometheus metrics registry and custom collectors using prom-client.
 */

import promClient from 'prom-client';
import { getPool } from '../postgres/pool.js';

// Create a dedicated Prometheus Registry for the application
export const register = new promClient.Registry();

// Set default labels across all metrics
register.setDefaultLabels({
  app: 'proctornet-backend'
});

// Enable Node.js process runtime metrics
promClient.collectDefaultMetrics({
  register,
  prefix: 'nodejs_'
});

// ============================================================================
// 1. HTTP Metrics
// ============================================================================

export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

// ============================================================================
// 2. Database Connection Pool & Query Metrics
// ============================================================================

export const dbPoolConnections = new promClient.Gauge({
  name: 'db_pool_connections',
  help: 'Current state of the PostgreSQL connection pool',
  labelNames: ['state'],
  registers: [register],
  collect() {
    try {
      const pool = getPool();
      if (pool) {
        const total = pool.totalCount || 0;
        const idle = pool.idleCount || 0;
        const waiting = pool.waitingCount || 0;
        const active = Math.max(0, total - idle);

        this.set({ state: 'total' }, total);
        this.set({ state: 'idle' }, idle);
        this.set({ state: 'waiting' }, waiting);
        this.set({ state: 'active' }, active);
      }
    } catch {
      // Pool not yet initialized
    }
  }
});

export const dbQueryDuration = new promClient.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query and transaction execution time in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register]
});

// ============================================================================
// 3. Answers & Concurrency Metrics (Strictly Bounded Labels, Zero UUIDs)
// ============================================================================

export const answerSaveDuration = new promClient.Histogram({
  name: 'answer_save_duration_seconds',
  help: 'Answer autosave and save latency including OCC verification in seconds',
  labelNames: ['status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register]
});

export const answerRevisionsConflictTotal = new promClient.Counter({
  name: 'answer_revisions_conflict_total',
  help: 'Count of OCC revision conflicts. Uses bounded labels; entity UUIDs are logged, never in metric labels.',
  labelNames: ['conflict_type'],
  registers: [register]
});

// ============================================================================
// 4. Outbox & Asynchronous Worker Metrics
// ============================================================================

export const outboxBacklogTotal = new promClient.Gauge({
  name: 'outbox_backlog_total',
  help: 'Current count of uncompleted outbox events in PostgreSQL (updated asynchronously)',
  labelNames: ['status'],
  registers: [register]
});

export const outboxDispatchDuration = new promClient.Histogram({
  name: 'outbox_dispatch_duration_seconds',
  help: 'Duration of outbox dispatch batches in seconds',
  labelNames: ['transport'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

export const workerEvaluationsTotal = new promClient.Counter({
  name: 'worker_evaluations_total',
  help: 'Total evaluation tasks processed by the worker consumer',
  labelNames: ['outcome'],
  registers: [register]
});

export const workerEvaluationDuration = new promClient.Histogram({
  name: 'worker_evaluation_duration_seconds',
  help: 'Time taken by worker to evaluate attempt and commit result in seconds',
  labelNames: ['outcome'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

// ============================================================================
// 5. Redis & Rate-Limiting Telemetry
// ============================================================================

export const redisOperationsTotal = new promClient.Counter({
  name: 'redis_operations_total',
  help: 'Count of Redis operations, hit/miss status, and errors',
  labelNames: ['operation', 'status'],
  registers: [register]
});

export const rateLimitBlocksTotal = new promClient.Counter({
  name: 'rate_limit_blocks_total',
  help: 'Count of requests rejected with 429 by rate limiters',
  labelNames: ['endpoint'],
  registers: [register]
});

// ============================================================================
// 6. Proctoring Events & Anomaly Telemetry (Phase 14)
// ============================================================================

export const proctoringEventsTotal = new promClient.Counter({
  name: 'proctornet_proctoring_events_total',
  help: 'Total candidate proctoring and telemetry events ingested',
  labelNames: ['event_type', 'severity'],
  registers: [register]
});

export const proctoringIngestDuration = new promClient.Histogram({
  name: 'proctornet_proctoring_ingest_duration_seconds',
  help: 'Latency of candidate proctoring event ingestion batches in seconds',
  labelNames: ['status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register]
});

export const proctoringFlagsTotal = new promClient.Counter({
  name: 'proctornet_proctoring_flags_total',
  help: 'Total proctoring violation anomaly flags raised',
  labelNames: ['flag_type', 'severity'],
  registers: [register]
});

// ============================================================================
// 6. Evidence Storage Metrics (Phase 15 - Bounded Labels, Zero UUIDs)
// ============================================================================

export const evidenceUploadsInitiatedTotal = new promClient.Counter({
  name: 'proctornet_evidence_uploads_initiated_total',
  help: 'Total presigned evidence upload URLs minted',
  labelNames: ['evidence_type'],
  registers: [register]
});

export const evidenceUploadsConfirmedTotal = new promClient.Counter({
  name: 'proctornet_evidence_uploads_confirmed_total',
  help: 'Total evidence uploads confirmed',
  labelNames: ['evidence_type', 'status'],
  registers: [register]
});

export const evidenceDownloadsTotal = new promClient.Counter({
  name: 'proctornet_evidence_downloads_total',
  help: 'Total presigned download playback URLs minted',
  labelNames: ['evidence_type'],
  registers: [register]
});

export const evidenceBytesTotal = new promClient.Counter({
  name: 'proctornet_evidence_bytes_total',
  help: 'Cumulative bytes of confirmed evidence stored',
  labelNames: ['evidence_type'],
  registers: [register]
});

export const evidenceStorageLatencySeconds = new promClient.Histogram({
  name: 'proctornet_evidence_storage_latency_seconds',
  help: 'Latency of S3 client operations in seconds',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

// ============================================================================
// Helper Exports
// ============================================================================

/**
 * Renders Prometheus exposition text.
 * @returns {Promise<string>}
 */
export async function getMetrics() {
  return register.metrics();
}

/**
 * Returns Prometheus content-type header string.
 * @returns {string}
 */
export function getContentType() {
  return register.contentType;
}

/**
 * Clears all registered metrics (used primarily in test teardown).
 */
export function clearMetrics() {
  register.clear();
}
