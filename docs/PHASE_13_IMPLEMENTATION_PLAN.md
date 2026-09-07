# PHASE 13 — OBSERVABILITY & AUDIT IMPLEMENTATION PLAN

## Status: PLANNED / READY FOR PLAN REVIEW (CORRECTED)
**Date:** 2026-09-07  
**Author:** Antigravity (Pair Programming AI)  
**Target Milestone:** Phase 13 — Observability & Audit  
**Corpus / Baseline:** `SudeepKagi/proctornet-rearchitecture` (`main` post-Phase 12 merge `4e3c5cd`)

---

## 1. Executive Summary & Objectives

Phase 13 introduces enterprise-grade observability and an immutable audit trail to the ProctorNet examination platform. As a mission-critical platform managing high-stakes academic examinations, ProctorNet must provide continuous real-time insight into system health, operational throughput, and candidate concurrency, while preserving a legally defensible, tamper-evident audit log of all administrative, academic, and security-relevant actions.

### Core Objectives
1. **Prometheus Metrics Exposition (`GET /metrics`)**: Expose comprehensive operational counters, gauges, and histograms instrumenting HTTP traffic, database connection pools, answer autosave latencies, outbox backlog, worker evaluation throughput, and Redis cache/rate-limiting performance.
2. **Distributed Correlation & Trace Context Propagation (W3C Traceparent)**: Standardize correlation identifiers across HTTP requests, PostgreSQL transactions, transactional outbox envelopes, RabbitMQ headers, and worker consumers (`X-Request-ID`, `X-Correlation-ID`, and W3C `traceparent`). *Note: Phase 13 implements correlation and context propagation only; distributed trace storage, exporters, and visualization backends are explicitly out of scope.*
3. **Structured Logging Enhancements**: Unify Pino structured JSON logging across HTTP handlers, background pollers, and asynchronous workers with context-bound trace identifiers and strict PII/credential redaction.
4. **Immutable Security Audit Log (`audit_logs`)**: Leverage the existing PostgreSQL `audit_logs` schema, adding database-level tamper-resistance (triggers disallowing `UPDATE`, `DELETE`, and `TRUNCATE`), centralizing audit event recording across Auth, Exams, Sessions, Attempts, Submissions, and Results, and providing an administrative query API.
5. **Worker, Outbox, & Broker Observability**: Track outbox dispatch lag, worker evaluation durations, retry tier distributions, DLQ quarantine rates, and broker connection/channel events.

---

## 2. Scope and Non-Goals

### In Scope
* **Metrics Layer**:
  * Integrate standard Node.js Prometheus client (`prom-client`).
  * Dedicated metrics endpoint (`GET /metrics`) with optional token authentication or internal network restriction.
  * Standard HTTP request duration histogram (labels: `method`, `route`, `status_code` using normalized route templates).
  * System/runtime metrics (Node.js event loop lag, process memory heap/RSS, active handles).
  * PostgreSQL connection pool gauge metrics (total, idle, waiting, active).
  * Database query duration histogram (labels: `operation`).
  * Answer save latency histogram (labels: `status`) and OCC revision conflict counter (labels: `conflict_type`).
  * Transactional outbox gauge (pending, processing, failed backlog) updated asynchronously and dispatch duration histogram.
  * RabbitMQ worker evaluation duration histogram (labels: `outcome`), attempt counter by outcome (`success`, `duplicate`, `transient_retry`, `dlq`).
  * Redis operation latency histogram, cache hit/miss counters, and rate-limiting block counter.
* **Distributed Correlation & Context Propagation**:
  * Single consolidated middleware in `src/middleware/requestId.js` supporting incoming `traceparent` (W3C Trace Context), `X-Request-ID`, and `X-Correlation-ID`.
  * Pure helper in `src/utils/traceContext.js` for traceparent parsing, validation, and child span generation.
  * Propagation of correlation and trace identifiers through PostgreSQL `outbox_events` and RabbitMQ CloudEvents headers (`x-correlation-id`, `traceparent`).
  * Worker consumer child logger binding to incoming request trace identifiers.
* **Audit Trail**:
  * PostgreSQL migration adding tamper-resistance triggers on `audit_logs`:
    * Row-level trigger prohibiting `UPDATE` and `DELETE`.
    * Statement-level trigger prohibiting `TRUNCATE`.
  * Additional query-driven indexes for global temporal scanning and action filtering on `audit_logs`.
  * Centralized `auditService.recordAuditEvent(...)` and `auditRepository.createAuditLog(...)` supporting active transaction clients.
  * Comprehensive audit instrumentation across Auth, Exams, Sessions, Attempts, Submissions, and Results using the repository's existing audit action taxonomy.
  * Administrative query API: `GET /api/v1/audit-logs` (admin-only, paginated, filtered by actor, action, resource, date range).
* **Automated Tests**:
  * Metric registry, route template normalization, and non-blocking scrape endpoint verification tests.
  * Audit log insertion, querying, transactional consistency, and tamper-resistance constraint tests (`UPDATE`, `DELETE`, `TRUNCATE` rejection).
  * Trace context parsing, validation, and correlation ID propagation integration tests.

### Non-Goals (Explicitly Out of Scope)
* **No Distributed Trace Collection, Storage, or APM**: No OpenTelemetry collector clusters, Jaeger, Tempo, Zipkin, or waterfall trace visualizers. Phase 13 provides correlation and trace context propagation only.
* **No Automated S3 Archival, Cold Storage, or Partitioning**: Phase 13 does NOT implement automated audit archival, S3 cold storage, pg_dump export pipelines, or table partitioning. Scope is strictly confined to PostgreSQL-native `audit_logs` storage, append-only immutability, queryability, and retention policy definition. Archival automation belongs to a future infrastructure phase and requires its own approved plan.
* **No Kubernetes / Sidecar Agents**: Prometheus scrape targets remain standard HTTP endpoints; no Kubernetes operators or daemonsets.
* **No Commercial SaaS Dependencies**: No Datadog, New Relic, Dynatrace, or vendor-locked APM SDKs.
* **No Live WebRTC / Media Plane Metrics**: Media streaming metrics belong to Phase 15/16 WebRTC SFU implementation.
* **No Client-Side Violation Ingestion**: Client-side proctoring violation detection and ingestion belongs strictly to Phase 14 (`proctoring_events`).
* **No External Elasticsearch / Logstash / Kibana (ELK) Clusters**: Pino writes structured JSON to standard output (`stdout`), leaving external log ingestion to deployment log shippers (e.g. FluentBit / CloudWatch).

---

## 3. Architectural Precedence & Invariants

All Phase 13 designs strictly adhere to the authoritative architectural hierarchy:
1. **PostgreSQL is Authoritative**: Audit logs (`audit_logs`) reside authoritatively in PostgreSQL. They are committed within the same database transaction as the audited business state change whenever transactional consistency is required.
2. **Redis is Non-Authoritative**: Redis metrics (hit/miss, latency) are recorded in-process; Redis is not used to store audit events or operational metrics.
3. **RabbitMQ is Transport Only**: Broker message metrics (lag, dispatch counts) are recorded at the publisher and consumer application boundaries.
4. **Append-Only Immutability**: Audit logs are strictly append-only:
   * `INSERT` = Permitted
   * `UPDATE` = Prohibited (raises SQLSTATE `20000`)
   * `DELETE` = Prohibited (raises SQLSTATE `20000`)
   * `TRUNCATE` = Prohibited (raises SQLSTATE `20000`)
   No application role (including system administrator) can alter or truncate `audit_logs`.
5. **No Performance Degradation on Critical Path**:
   * *Metric Observation SLO Target*: In-memory metric updates target sub-millisecond execution without event loop stalls.
   * *Audit Logging Overhead Target*: Audit log inserts within business transactions target an overhead of approximately `< 2ms` under representative operating conditions.
   * *Scrape Response Target*: Scrapes against `GET /metrics` target `< 10ms` by serving in-memory gauges and counters with zero synchronous database queries.
   *(These are architectural performance design targets / SLOs, not brittle wall-clock unit test assertion thresholds.)*
6. **Zero Sensitive Data Leakage & Low Label Cardinality**: Passwords, raw tokens, cookie values, secret answers, candidate names, emails, and entity UUIDs (`exam_id`, `attempt_id`, `user_id`) must NEVER appear in metric labels. Route labels must use normalized route templates (e.g. `/api/v1/attempts/:attemptId/answers`).

---

## 4. Component Design & Specifications

### 4.1 Metrics Architecture (`prom-client`)

A centralized metrics registry (`src/infrastructure/metrics/`) manages Prometheus metric collectors.

```text
                   +-----------------------------------+
                   |     HTTP Request / Response       |
                   +-----------------+-----------------+
                                     |
                          httpMetricsMiddleware
                                     |
                +--------------------v---------------------+
                |         Prometheus Metric Registry       |
                |                                          |
                |  - http_request_duration_seconds (Hist)  |
                |  - http_requests_total (Counter)         |
                |  - db_pool_connections (Gauge)           |
                |  - db_query_duration_seconds (Hist)      |
                |  - answer_save_duration_seconds (Hist)   |
                |  - answer_revisions_conflict_total (Ctr) |
                |  - outbox_backlog_total (Gauge)          |
                |  - outbox_dispatch_duration_seconds (H)  |
                |  - worker_evaluations_total (Counter)    |
                |  - worker_evaluation_duration_seconds (H)|
                |  - redis_operations_total (Counter)      |
                |  - rate_limit_blocks_total (Counter)     |
                |  - default runtime metrics (gc, memory)  |
                +--------------------+---------------------+
                                     |
                                Scrape: GET /metrics
                                     |
                   +-----------------v-----------------+
                   |       Prometheus Server / Scraper |
                   +-----------------------------------+
```

#### Metrics Catalog

| Metric Name | Type | Labels | Description |
| :--- | :--- | :--- | :--- |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | HTTP request latency in seconds. `route` uses normalized templates (e.g. `/api/v1/attempts/:attemptId/answers`). Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10. |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests handled. `route` strictly normalized. |
| `db_pool_connections` | Gauge | `state` (`total`, `idle`, `active`, `waiting`) | Current state of the PostgreSQL connection pool (collected synchronously from `pg.Pool` properties). |
| `db_query_duration_seconds` | Histogram | `operation` (`query`, `transaction`) | Database query and transaction execution time. |
| `answer_save_duration_seconds` | Histogram | `status` (`success`, `conflict`, `error`) | Answer save latency including OCC verification. |
| `answer_revisions_conflict_total`| Counter | `conflict_type` (`revision_mismatch`, `stale_timestamp`) | Count of OCC revision conflicts. Low-cardinality bounded label; specific exam/attempt UUIDs are logged in structured logs, never in metric labels. |
| `outbox_backlog_total` | Gauge | `status` (`PENDING`, `PROCESSING`, `RETRYABLE`) | Current count of uncompleted outbox events in PostgreSQL (updated asynchronously by background poller, zero scrape DB queries). |
| `outbox_dispatch_duration_seconds`| Histogram | `transport` (`rabbitmq`, `in_process`) | Duration of outbox dispatch batches. |
| `worker_evaluations_total` | Counter | `outcome` (`success`, `duplicate`, `transient_retry`, `dlq`) | Total evaluation tasks processed by the worker consumer. |
| `worker_evaluation_duration_seconds`| Histogram | `outcome` (`success`, `duplicate`, `failure`) | Time taken by worker to evaluate attempt and commit result. |
| `redis_operations_total` | Counter | `operation` (`get`, `set`, `del`), `status` (`hit`, `miss`, `error`) | Redis cache operations and hit rates. |
| `rate_limit_blocks_total` | Counter | `endpoint` | Count of requests rejected with 429 by rate limiter. `endpoint` uses normalized path templates. |
| `process_cpu_seconds_total` | Counter | — | Default Node.js process CPU metric. |
| `nodejs_eventloop_lag_seconds` | Gauge | — | Default Node.js event loop lag metric. |
| `nodejs_heap_size_bytes` | Gauge | — | Default Node.js memory heap gauge. |

---

### 4.2 Distributed Correlation & Trace Context Propagation (W3C Traceparent)

Phase 13 implements lightweight correlation and trace context propagation across HTTP, PostgreSQL Outbox, and RabbitMQ workers without requiring external APM or trace collection backends:

```text
Incoming HTTP Request (traceparent / X-Request-ID)
                    ↓
   requestIdMiddleware (src/middleware/requestId.js)
        ├── parse/validate via traceContext.js helper
        ├── generate 16-byte traceId & 8-byte child spanId if absent/invalid
        ├── bind req.log = createChildLogger({ requestId, traceId, spanId })
        └── set response headers: X-Request-ID, traceparent
                    ↓
   Transactional Outbox (CloudEvents envelope metadata: { traceparent, correlationId })
                    ↓
   RabbitMQ Delivery (headers: { 'x-correlation-id', 'traceparent' })
                    ↓
   Worker Consumer (evaluation.consumer.js)
        └── binds consumer logger with { traceparent, correlationId }
```

1. **Consolidated Middleware (`src/middleware/requestId.js`)**:
   - Delegates header parsing, validation, and generation to a pure helper `src/utils/traceContext.js`.
   - Inspects incoming `traceparent` (format: `00-{traceId}-{spanId}-{traceFlags}`).
   - If valid, extracts the 32-hex `traceId`, generates a new 16-hex child `spanId`, and sets `traceFlags` (e.g. `01`).
   - If absent or malformed, generates a new random 32-hex `traceId` and 16-hex `spanId` conforming to W3C Trace Context specifications.
   - Extracts or generates `X-Request-ID` / `X-Correlation-ID` for backward compatibility.
   - Binds `{ requestId, traceId, spanId }` to `req.log`.
   - Emits both `X-Request-ID` and `traceparent` on all HTTP responses.
2. **Context Propagation Across System Boundaries**:
   - Outbox dispatcher attaches `traceparent` and `correlationId` into the CloudEvents envelope `metadata`.
   - RabbitMQ worker extracts `traceparent` from incoming message headers and binds it to its child Pino logger for the evaluation job.

---

### 4.3 Structured Logging Requirements

- **Standard Format**: Single-line structured JSON output via Pino.
- **Redaction List**: Centralized redaction in `src/utils/logger.js` automatically censors passwords, tokens (`accessToken`, `refreshToken`), session cookies, authorization headers, API keys, and candidate answer payloads (`selected_option_id`, `answer_text`, `numeric_value`, `answers`).
- **Base Bindings**: `{ service: 'proctornet-backend', env: config.NODE_ENV }`.
- **Request-Scoped Child Logger**: Bound with `{ requestId, traceId, spanId }`.
- **Error Logging**: Every unhandled or 500 error logs the full stack trace, error code, request URI, and correlation IDs without leaking internal DB connection strings or credentials.

---

### 4.4 Immutable Audit Logging Architecture

#### Database Schema & Tamper-Resistance Migration (`015_audit_immutability.js`)
The existing `audit_logs` table (created in Migration 009) is protected against all tampering via both row-level and statement-level PostgreSQL triggers:

```sql
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. UPDATE, DELETE, and TRUNCATE operations are strictly prohibited.'
  USING ERRCODE = '20000';
END;
$$ LANGUAGE plpgsql;

-- 1. Row-level protection against UPDATE and DELETE
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();

-- 2. Statement-level protection against TRUNCATE
CREATE TRIGGER trg_audit_logs_truncate
BEFORE TRUNCATE ON audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_audit_log_mutation();

-- Additional query-driven indexes for global audit inspection
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp ON audit_logs(action, timestamp DESC);
```

#### Foreign Key Cascades & Audit Preservation Note
In Migration 009, `actor_user_id` and `attempt_id` were defined with `ON DELETE SET NULL`. Under the immutability trigger, any attempt to delete a user or attempt that has referenced audit logs will cause PostgreSQL to attempt an `UPDATE` to set foreign keys to `NULL`, which will be strictly blocked by `trg_audit_logs_immutable` with SQLSTATE `20000`. This is the intended security invariant: **audit records cannot be modified or anonymized by entity deletion**. Deleting entities with audit logs is prohibited.

#### Centralized Audit Service & Repository (`src/modules/audit/`)
Consolidates audit log creation across the platform, replacing previous per-module duplicates:
* `auditRepository.createAuditLog(auditData, client)`: Executes the parameterized `INSERT INTO audit_logs` statement. Accepts an optional PostgreSQL transaction client.
* `auditService.recordAuditEvent(auditData, client)`: Validates audit fields, cleanses sensitive metadata, and persists the record. If a transactional client is provided, the audit log commits atomically with the business transaction.
* `auditService.queryAuditLogs(filters, user)`: Admin-scoped querying with BOLA/RBAC enforcement and pagination.

#### Standardized Audit Event Actions (Repository-Aligned)
Phase 13 strictly preserves and extends the repository's existing audit action taxonomy:

```text
[AUTH]
- AUTH_LOGIN_SUCCESS
- AUTH_LOGIN_FAILURE
- AUTH_LOGOUT
- AUTH_LOCKOUT_TRIGGERED
- AUTH_SESSION_REVOKED

[EXAMS]
- EXAM_CREATED
- EXAM_UPDATED
- EXAM_TOPIC_RULE_CONFIGURED
- EXAM_TOPIC_RULE_DELETED
- EXAM_PUBLISHED

[SESSIONS]
- ROOM_CREATED
- SESSION_CREATED
- SESSION_UPDATED
- SESSION_STUDENTS_ASSIGNED
- SESSION_STUDENT_REMOVED
- SESSION_INVIGILATOR_ASSIGNED
- SESSION_INVIGILATOR_REMOVED

[ATTEMPTS]
- ATTEMPT_STARTED
- ATTEMPT_RESUMED
- ATTEMPT_EXPIRED

[SUBMISSIONS]
- ATTEMPT_SUBMITTED
- ATTEMPT_EXPIRED

[RESULTS]
- EXAM_RESULTS_PUBLISHED
- EXAM_RELEASE_POLICY_UPDATED
```

---

### 4.5 Health, Readiness, and Metrics Interplay

The platform distinguishes three operational inspection endpoints:
1. **Liveness Probe (`GET /health`)**:
   - Confirms the Node.js event loop is alive. Zero I/O overhead; always responds `200 OK`.
2. **Readiness Probe (`GET /ready`)**:
   - Confirms critical infrastructure dependencies are reachable.
   - PostgreSQL connectivity is strictly mandatory (returns `503 Service Unavailable` if PostgreSQL is down).
   - Redis and RabbitMQ connectivity are non-fatal (returns `200 OK` with degraded status reporting if unavailable).
3. **Metrics Scrape (`GET /metrics`)**:
   - Completely independent of health probes. Neither scraper availability nor metric collection failures will affect `/health` or `/ready`.
   - Scrapes in-memory metric registries without executing synchronous database queries on every scrape.
   - Database pool gauges reflect synchronous pool properties (`pool.totalCount`, `pool.idleCount`, `pool.waitingCount`).
   - Outbox backlog gauges are updated asynchronously during outbox poller cycles.

---

### 4.6 Event Lifecycle, Retention & Archival Scope Boundary

- **Retention Window**: Active `audit_logs` are retained in the primary PostgreSQL database for an operational policy window of a minimum of 180 days (standard academic semester + grade dispute window).
- **Archival Scope Boundary**: Phase 13 does NOT implement automated audit archival, S3 cold storage, pg_dump export pipelines, or table partitioning. Scope is strictly limited to PostgreSQL-native `audit_logs` storage, append-only immutability, queryability, and retention policy definition. Any archival/cold-storage implementation belongs to a future infrastructure phase and requires its own approved plan.
- **Audit Storage Authority**: PostgreSQL remains the sole authoritative store for audit events. Audit records are never offloaded to Redis, local disk files, or third-party analytical caches.

---

### 4.7 Worker, Outbox & RabbitMQ Observability

- **Outbox Poller Metrics**:
  - `outbox_backlog_total` gauge updated on every poll cycle, segmented by status (`PENDING`, `PROCESSING`, `RETRYABLE`).
  - `outbox_dispatch_duration_seconds` histogram measuring duration of dispatch batches.
- **RabbitMQ Worker Metrics**:
  - `worker_evaluations_total` counter incremented with labels `outcome: success | duplicate | transient_retry | dlq`.
  - `worker_evaluation_duration_seconds` histogram tracking evaluation execution time (labels: `outcome: success | duplicate | failure`).
- **Broker State Tracking**:
  - Metrics tracking reconnect attempts, consumer restorations, and channel errors.

---

### 4.8 Authentication & Authorization Audit Requirements

- All authentication operations must log an audit event:
  - Successful login: `AUTH_LOGIN_SUCCESS` (captures `actor_user_id`, `ip`, `userAgent`, timestamp).
  - Failed login: `AUTH_LOGIN_FAILURE` (captures attempted email in metadata, `ip`, failure reason; passwords strictly omitted).
  - Account lockout: `AUTH_LOCKOUT_TRIGGERED` when 5-attempt threshold is reached.
  - Logout: `AUTH_LOGOUT`.
  - Session revocation: `AUTH_SESSION_REVOKED` when tokens are invalidated.
- Administrative authorization failures (403 Forbidden on privileged endpoints) are logged as structured warnings with actor ID and requested resource.

---

### 4.9 Failure, Error & Degraded-State Observability

- **Redis Cache Fallback**: When Redis fails, log structured warning `CACHE_FALLBACK_TRIGGERED` and increment `redis_operations_total{operation="get|set", status="error"}`.
- **RabbitMQ Disconnection**: When broker connection drops, log alert `RABBITMQ_BROKER_DISCONNECTED` and track connection recovery duration.
- **Optimistic Concurrency Conflicts**: Answer save OCC revision mismatches increment `answer_revisions_conflict_total{conflict_type="revision_mismatch"}`. Specific `examId` and `attemptId` are logged as structured log metadata, preserving zero metric cardinality explosion.

---

### 4.10 Audit Log Query API (`GET /api/v1/audit-logs`)

* **Authorization**: Strictly restricted to `ADMIN` role.
* **Query Parameters**:
  * `actor_user_id` (UUID): Filter by initiating user.
  * `action` (string): Filter by specific action enum.
  * `resource_type` (string): e.g. `EXAM`, `SESSION`, `ATTEMPT`.
  * `resource_id` (string): Filter by resource UUID.
  * `start_date` / `end_date` (ISO timestamp): Time window.
  * `page` (integer, default 1) / `limit` (integer, default 20, max 100).
* **Ordering**: `ORDER BY timestamp DESC, audit_id DESC` (deterministic ordering for pagination).
* **Response Envelope**: Standard paginated response:
  ```json
  {
    "status": "success",
    "data": {
      "audit_logs": [ ... ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 142,
        "totalPages": 8
      }
    }
  }
  ```

---

## 5. Security & Privacy Considerations

1. **Strict Redaction & Cardinality Control**:
   - Metric labels must use normalized route templates (e.g. `/api/v1/attempts/:attemptId/answers`) instead of raw paths (`/api/v1/attempts/7d806b.../answers`) to prevent label cardinality explosion.
   - PII, student names, emails, credentials, and passwords are never used as Prometheus label values.
   - Resource UUIDs (`exam_id`, `attempt_id`, `user_id`) are NEVER used as metric label values.
   - Audit `metadata` JSONB strips tokens, passwords, and sensitive student responses.
2. **Metrics Access Control**:
   - The `/metrics` endpoint is protected: accessible by scrapers with metric authentication token (`METRICS_AUTH_TOKEN`) or restricted to local/internal network interfaces.
3. **Audit Log Access Control**:
   - Strict RBAC: only users with role `ADMIN` can access `GET /api/v1/audit-logs`. Candidates and faculty cannot read cross-tenant or global audit trails.

---

## 6. Testing Strategy & Operational Verification

### Unit Tests
* **Metrics Registry**: Verify metric registration, route template normalization, histogram observation, and counter increments. Verify no entity UUIDs exist in metric label names.
* **Trace Context Parsing (`src/utils/traceContext.js`)**: Verify valid W3C `traceparent` ingestion, corrupt header rejection, child span ID generation, and random fallback.
* **Audit Serialization**: Verify metadata JSONB formatting and sensitive field pruning.

### Integration Tests
* **`/metrics` Endpoint**:
  * Verify scrape output matches Prometheus text exposition format (version 0.0.4).
  * Functional assertion proving `/metrics` does NOT execute synchronous database queries during scrape handling.
* **Metric Route-Template Normalization**:
  * Verify that a request such as `POST /api/v1/attempts/123e4567-e89b-12d3-a456-426614174000/answers` records `http_request_duration_seconds` under route label `/api/v1/attempts/:attemptId/answers` and never under the raw UUID path.
* **Database Pool Instrumentation**: Verify gauge accurately reflects PostgreSQL client acquisition and release via synchronous pool properties.
* **Answer Save Latency & OCC Conflicts**: Verify histogram records observations during answer saving and counter increments on OCC revision mismatch with `conflict_type="revision_mismatch"`.
* **Outbox & Worker Telemetry**: Verify counters increment when outbox publishes and evaluation worker completes jobs.
* **Audit Log Immutability & Tamper Resistance**:
  * Verify `INSERT INTO audit_logs` succeeds.
  * Verify `UPDATE audit_logs SET action = 'MUTATED'` fails with SQLSTATE `20000`.
  * Verify `DELETE FROM audit_logs` fails with SQLSTATE `20000`.
  * Verify `TRUNCATE TABLE audit_logs` fails with SQLSTATE `20000`.
* **Audit Entity Deletion Protection**: Verify that attempting to delete a user or attempt that has referenced audit logs fails due to immutability trigger constraints.
* **Audit Query API**: Verify admin authorization, student/faculty rejection (`403 Forbidden`), stable pagination ordering, and filter predicates.

### Regression Verification
* Full existing regression test suite must pass with zero regressions:
  * **470/470 backend tests** across 111 suites.
  * **25/25 frontend tests** across 10 suites.

---

## 7. Acceptance Criteria

1. **Metrics**:
   - `GET /metrics` returns 200 OK with valid Prometheus text exposition format without synchronous database calls.
   - HTTP latency histogram records requests exclusively with normalized route templates.
   - No metric contains unbounded entity UUIDs (`exam_id`, `user_id`, etc.) in its label dimensions.
   - Database connection pool gauges reflect actual pool metrics.
   - Answer save latencies, OCC conflicts, and outbox lag metrics are actively tracked.
2. **Correlation & Trace Context Propagation**:
   - Incoming `traceparent` headers are parsed; missing or invalid headers generate valid W3C traceparents.
   - Response headers emit `X-Request-ID` and `traceparent`.
   - Logs emitted during request lifecycle include `requestId`, `traceId`, and `spanId`.
3. **Audit Logging & Immutability**:
   - Attempting an `UPDATE`, `DELETE`, or `TRUNCATE` on `audit_logs` raises an exception with SQLSTATE `20000`.
   - Core business events (exam publish, attempt submission, manual result release, topic rule configuration) record audit entries matching existing repository action names.
   - `GET /api/v1/audit-logs` enforces `ADMIN` role and returns paginated records with filtering and stable ordering.
4. **Regression**:
   - All 470 existing backend tests and 25 frontend tests pass with zero regressions.

---

## 8. Files and Modules to Create / Modify

```text
[NEW]
backend/migrations/015_audit_immutability.js          # Triggers preventing UPDATE, DELETE, and TRUNCATE on audit_logs
backend/src/infrastructure/metrics/registry.js         # prom-client registry, default metrics, custom collectors
backend/src/infrastructure/metrics/index.js            # Public metrics exports
backend/src/middleware/metricsMiddleware.js           # HTTP latency and request counter middleware with route normalization
backend/src/utils/traceContext.js                      # Pure helper for W3C traceparent parsing, validation, and child span generation
backend/src/modules/audit/audit.service.js             # Centralized audit logging and query service
backend/src/modules/audit/audit.repository.js          # Database queries for audit_logs
backend/src/modules/audit/audit.controller.js          # HTTP handler for GET /api/v1/audit-logs
backend/src/modules/audit/audit.routes.js              # Express router for audit endpoints
backend/src/modules/audit/index.js                     # Module entry point
backend/tests/metrics/metrics.test.js                  # Metrics collection & /metrics endpoint tests
backend/tests/audit/auditService.test.js               # Audit logging and query tests
backend/tests/audit/auditImmutability.test.js          # Tamper-resistance trigger integration tests (UPDATE, DELETE, TRUNCATE)

[MODIFY]
backend/package.json                                   # Add prom-client dependency
backend/src/config/env.js                              # Add METRICS_ENABLED, METRICS_PORT/TOKEN config
backend/src/app.js                                     # Mount metrics middleware and audit routes
backend/src/routes/health.routes.js                    # Mount GET /metrics route
backend/src/infrastructure/postgres/pool.js            # Instrument query durations and pool connection gauges
backend/src/modules/answers/answers.service.js         # Record answer save latency & revision conflict metrics (conflict_type label)
backend/src/modules/outbox/outbox.dispatcher.js        # Record outbox backlog and dispatch metrics
backend/src/modules/evaluation/evaluation.consumer.js   # Record worker evaluation latency and counter metrics
backend/src/middleware/requestId.js                    # Consolidated correlation middleware (traceparent + X-Request-ID + logger binding)
backend/src/middleware/requestLogger.js                # Bind traceId/spanId into structured logs
docs/ADR/0003-observability-metrics-and-audit.md       # ADR-0003 documenting observability standards
docs/DEVELOPMENT_PLAN.md                               # Record Phase 13 completion once verified
```

---

## 9. Rollout & Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| **High Cardinality in Prometheus Labels** | Low | High | Strictly sanitize route paths to route templates (e.g. `/api/v1/attempts/:attemptId/answers`). Exclude all entity UUIDs from labels. |
| **Audit Log Growth / Disk Overhead** | Low | Medium | Migration 010 already partitioned indexes on `(actor_user_id, timestamp)` and `(resource_type, resource_id, timestamp)`. `audit_logs` metadata is capped and indexed. |
| **Overhead on Critical Answer Save Path** | Low | High | Metric observation is pure in-memory math. Audit logging for autosaves is handled at attempt milestones (start, submit, expire) rather than every debounced keystroke. |
| **Tamper-Resistance Blocking Legitimate Migrations**| Low | Medium | Triggers are scoped strictly to table DML/DDL (`UPDATE`/`DELETE`/`TRUNCATE`). Schema alterations (`ALTER TABLE`) remain accessible to migration runner. |

---

## 10. Architectural Decision Record (ADR-0003 Outline)

An Architectural Decision Record (`docs/ADR/0003-observability-metrics-and-audit.md`) will be drafted covering:
1. **In-Process Prometheus Metrics**: Selection of `prom-client` as standard in-process exporter for the modular monolith, avoiding premature external collectors or sidecars.
2. **Distributed Correlation & Trace Context Propagation**: Adoption of W3C `traceparent` for correlation across asynchronous outbox and RabbitMQ worker boundaries without full distributed tracing infrastructure.
3. **Database-Enforced Audit Immutability**: Utilization of row-level and statement-level PostgreSQL triggers to enforce absolute append-only immutability against `UPDATE`, `DELETE`, and `TRUNCATE` operations.
