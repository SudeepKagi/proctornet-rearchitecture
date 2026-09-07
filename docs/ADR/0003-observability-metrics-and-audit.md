# ADR-0003: In-Process Prometheus Metrics, Distributed Trace Context Propagation, and Database-Enforced Audit Immutability

## Status
Proposed (Phase 13)

## Date
2026-09-08

## Context & Problem Statement
The ProctorNet examination platform orchestrates high-stakes, concurrent engineering college examinations. Operating at scale with up to 10,000 concurrent students requires real-time operational visibility into HTTP traffic, PostgreSQL connection pool saturation, answer autosave latencies, transactional outbox dispatch backlogs, RabbitMQ worker throughput, and Redis cache performance.

Simultaneously, high-stakes academic examinations require:
1. **End-to-End Trace Correlation:** The ability to trace a candidate's request across the HTTP ingress boundary, PostgreSQL transaction boundary, transactional outbox event storage, RabbitMQ message transport, and asynchronous worker evaluation consumers.
2. **Defensible, Tamper-Evident Audit Logging:** An immutable audit record of every academic, administrative, and authentication action (e.g., exam publishing, roster modification, attempt submission, manual result release, account lockout) that cannot be altered, deleted, or truncated by any application user or role.
3. **Strict Privacy and Low-Cardinality Telemetry:** Protection against metric label cardinality explosion and sensitive data leakage (PII, tokens, passwords, and entity UUIDs must never appear in metric label dimensions).

## Decision Drivers
1. **PostgreSQL Authority & Audit Tamper-Resistance:** Audit records reside authoritatively in PostgreSQL and must be append-only with database-enforced protection against modification or deletion.
2. **Deterministic, Zero-Query Metric Exposition:** The `/metrics` endpoint must scrape in-memory state without issuing synchronous database queries, guaranteeing predictable sub-10ms response times without placing load on the database.
3. **Zero Entity UUIDs in Metric Labels:** Metrics must strictly adhere to low-cardinality label dimensions using normalized route templates (e.g., `/api/v1/attempts/:attemptId/answers`), never raw UUID paths.
4. **W3C Trace Context Standard:** Adoption of standard W3C `traceparent` headers to establish a vendor-neutral correlation standard across HTTP and messaging boundaries without requiring heavyweight APM collectors.
5. **PII and Credential Redaction:** Centralized, recursive masking of credentials, tokens, and secret student answer payloads across structured logs and audit records.

## Considered Options
1. **Option 1: External Commercial APM (Datadog, New Relic, Dynatrace)**
   - Integrate proprietary commercial APM SDKs for metrics, distributed tracing, and audit ingestion.
   - *Rejected:* Introduces external vendor lock-in, recurring SaaS costs, and potential data sovereignty issues with student examination records. Violates non-goals in Phase 13 plan.
2. **Option 2: OpenTelemetry Collector & Distributed Tracing Cluster (Tempo / Jaeger / OpenSearch)**
   - Deploy full OpenTelemetry SDKs, exporter daemons, collector sidecars, and distributed trace visualization backends.
   - *Rejected:* Premature infrastructure complexity for the current modular monolith architecture. Phase 13 requires trace correlation and context propagation, not full distributed waterfall visualization.
3. **Option 3: In-Process Prometheus Metrics (`prom-client`), W3C Trace Context Propagation, and PostgreSQL-Enforced Audit Immutability (Chosen)**
   - **Metrics Layer:** Standard in-process Prometheus registry (`prom-client`) exposing `GET /metrics` with optional scraper authentication token (`METRICS_AUTH_TOKEN`). All histograms and counters use normalized route templates with strictly bounded labels and zero entity UUIDs. Database connection pool gauges reflect synchronous `pg.Pool` properties without database round-trips.
   - **Trace Context Propagation:** Unified correlation middleware in `src/middleware/requestId.js` leveraging `src/utils/traceContext.js` to parse incoming W3C `traceparent` headers, generate standards-compliant 16-byte `traceId` and 8-byte `spanId` pairs, bind trace identifiers to logger child contexts, and propagate `traceparent` through transactional outbox envelopes into RabbitMQ message headers.
   - **Database-Enforced Audit Immutability:** PostgreSQL migration `015_audit_immutability.js` attaches both a row-level trigger (`trg_audit_logs_immutable` on `BEFORE UPDATE OR DELETE`) and a statement-level trigger (`trg_audit_logs_truncate` on `BEFORE TRUNCATE`) that raise SQLSTATE `20000` (`RESTRICTED_DATA_MUTATION`), preventing any application role from tampering with historical audit entries. Centralized `src/modules/audit/` provides administrative inspection API (`GET /api/v1/audit-logs`) with strict `ADMIN` role enforcement.

## Decision Outcome
Chosen option: **Option 3**, because it provides robust, production-grade observability and legally defensible audit integrity with zero external vendor dependencies, low operational overhead, and full compliance with the authoritative architecture.

### Architectural Invariants:
1. **Append-Only Audit Immutability:**
   - `INSERT`: Permitted.
   - `UPDATE`: Rejected with SQLSTATE `20000`.
   - `DELETE`: Rejected with SQLSTATE `20000`.
   - `TRUNCATE`: Rejected with SQLSTATE `20000`.
2. **Metric Cardinality Protection:**
   - Raw URL paths containing UUIDs or numeric IDs are mapped to route templates (`:attemptId`, `:examId`, `:sessionId`, `:id`) before recording metric observations.
   - Metric labels are strictly bounded to low-cardinality enums (`method`, `route`, `status_code`, `state`, `operation`, `status`, `conflict_type`, `outcome`).
3. **End-to-End Context Propagation Pipeline:**
   - HTTP Ingress (`requestId.js`): Ingests or creates W3C `traceparent` (`00-<trace_id>-<span_id>-<trace_flags>`), binds to request logger.
   - Business Logic / Outbox (`submissions.service.js`): Attaches `traceparent` and `correlationId` to transactional outbox event payloads.
   - Outbox Transport (`outbox.transport.js`): Publishes CloudEvents to RabbitMQ with `traceparent` and `x-correlation-id` headers.
   - Worker Consumer (`evaluation.consumer.js`): Extracts headers from incoming RabbitMQ delivery and binds child logger context with `traceparent` and `correlationId`.
4. **Scrape Endpoint Independence:**
   - `GET /metrics` operates independently from `/health` and `/ready` probes.
   - Metrics are collected from memory and synchronous pool properties; no blocking or synchronous database queries are executed during a scrape.

### Positive Consequences
- Real-time insight into autosave contention, OCC revision conflicts, outbox backlog, and evaluation worker throughput.
- Tamper-proof security audit log providing mathematical defensibility for grade reviews and academic integrity audits.
- Full distributed request correlation across HTTP, database outbox, and RabbitMQ workers without infrastructure bloat.
- Zero sensitive data leakage into metric scrapers or application log aggregators.

### Negative Consequences / Trade-offs
- Audit logs cannot be cleaned up using standard `DELETE` or `TRUNCATE` operations; future long-term archival beyond the 180-day retention window will require partition detachment or database-level migration scripts.
- Additional database storage overhead for audit log metadata JSONB (mitigated by GIN/btree indexing and metadata sanitization).

## Compliance & Validation
- **Unit & Integration Tests:**
  - `backend/tests/metrics/metrics.test.js`: Verifies registry collectors, route normalization, `/metrics` exposition format, and non-blocking zero-query scrape behavior.
  - `backend/tests/audit/auditImmutability.test.js`: Verifies `INSERT` succeeds, while `UPDATE`, `DELETE`, and `TRUNCATE` fail with SQLSTATE `20000`.
  - `backend/tests/audit/auditService.test.js`: Verifies transactional atomicity, metadata sanitization, and PII redaction.
  - `backend/tests/audit/auditApi.test.js`: Verifies `ADMIN`-only access control, 403 rejection for candidates/faculty, and deterministic pagination.
  - `backend/tests/middleware/traceContext.test.js`: Verifies W3C traceparent parsing, corrupted header fallback, and child span generation.
- **Continuous Integration:**
  - Complete backend regression suite (470+ tests) and frontend test suite (25 tests) must pass with zero regressions.
