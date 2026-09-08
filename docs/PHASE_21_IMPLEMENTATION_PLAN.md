# ProctorNet — Phase 21 Implementation Plan
## Load Testing & Concurrency Benchmarking (Zero-Revision-Gap Final Specification)

> **Governance Status:** PLAN ONLY — STRICT EXECUTION GATE  
> **Lifecycle Phase:** Phase 21 — Load Testing & Concurrency Benchmarking  
> **Repository Baseline:** `main` @ `bbcb02a`  
> **Predecessor Phase:** Phase 20 — AWS Infrastructure as Code Foundation (COMPLETE & MERGED)  
> **Target Production Baseline:** AWS Single-Host EC2 `c6i.xlarge` (4 vCPUs, 8 GiB RAM, encrypted gp3 EBS volume)  
> **Architectural Paradigm:** Modular Monolith First; PostgreSQL Authoritative State; Redis Non-Authoritative Cache/Ephemeral; RabbitMQ Asynchronous Transport; Transactional Outbox  

---

## 1. Executive Summary

Phase 21 establishes the empirical load-testing, concurrency-benchmarking, and capacity-qualification framework for ProctorNet. The primary objective is to rigorously determine how far the approved single-host modular monolith architecture scales under realistic, production-profiled candidate workloads ranging across five formal tiers: **500, 1,000, 1,500, 2,000, and 2,500 concurrent candidates**.

The benchmark harness tests three primary workloads:
1. **High-Frequency Answer Autosaves:** 1 save every 5–10 seconds per candidate with realistic Poisson arrival jitter, evaluating Optimistic Concurrency Control (OCC), revision-conflict detection, idempotent retries, and row-level locking behavior.
2. **Synchronized Submission Burst:** 500 to 2,500 candidates simultaneously submitting completed exams over a tight 30-second window, committing final dirty answers, asserting durable idempotency, and enqueuing transactional outbox events.
3. **Asynchronous Evaluation Pipeline:** Measuring transactional outbox claim throughput (`batchSize = 20`, `interval = 5000ms`), RabbitMQ Quorum Queue buffering, and background evaluation worker consumption and scoring throughput.

The benchmark produces empirical evidence to identify the primary and secondary architectural bottlenecks (PostgreSQL connection pool, EBS disk I/O, Node.js event-loop lag, Redis Lua execution, or worker concurrency) and delivers data-driven thresholds for **Phase 32** (Horizontal Scaling, AWS RDS, AWS ElastiCache, and ALB activation).

---

## 2. Repository Inspection Findings

Direct inspection of the active codebase confirms the following concrete implementation realities:

### A. Backend Implementation
- **HTTP Server & Lifecycle (`backend/src/server.js`):** Node.js 24 runtime listening on port 4000. Initializes WebSocket broadcaster (`defaultBroadcaster.init()`), SFU media pool (`defaultSfuManager.init()`), outbox poller (`startOutboxPoller()`), and evaluation consumer (`startEvaluationConsumer()`). Implements graceful shutdown with a 10s force-kill timer, draining WebSockets, HTTP connections, outbox poller, evaluation consumer, RabbitMQ channels, Redis, and the PostgreSQL pool in strict sequence.
- **Environment & Pool Configuration (`backend/src/config/env.js`):** PostgreSQL configured via `DB_POOL_MIN` (default 2), `DB_POOL_MAX` (default 10), `DB_CONNECTION_TIMEOUT_MS` (default 5000ms), and `DB_IDLE_TIMEOUT_MS` (default 30000ms). RabbitMQ configured via `RABBITMQ_DISPATCH_INTERVAL_MS` (default 5000ms) and `RABBITMQ_PREFETCH` (default 10).
- **PostgreSQL Pool Client (`backend/src/infrastructure/postgres/pool.js`):** Singleton `pg.Pool` instance instrumented with `db_query_duration_seconds` Prometheus histogram. Exposes `checkDatabaseHealth(timeoutMs)` for readiness probes.
- **Answer Autosave & OCC (`backend/src/modules/answers/`):** Route `PUT /api/v1/attempts/:attemptId/answers/:attemptQuestionId` requires `STUDENT` role, valid HMAC-SHA256 signature (`antiTamperMiddleware`), and passes through `answerSaveRateLimiter` (60 req/min per candidate attempt). Answers require `expected_revision`. Unanswered question requires `expected_revision = 0` $\to$ inserts revision 1. Modifying existing answer requires matching revision $K \to K+1$. If $K-1$ with identical payload $\to$ returns 200 (idempotent replay). Stale revisions throw `409 STALE_REVISION_CONFLICT`. The attempt row is locked via `SELECT ... FOR UPDATE` inside an explicit transaction.
- **Submission & Idempotency (`backend/src/modules/submissions/`):** Route `POST /api/v1/attempts/:attemptId/submit` requires mandatory `Idempotency-Key` header. Validates attempt status is `ACTIVE` and deadline has not expired. Checks `submission_idempotency` table for exact fingerprint matching; if identical request is repeated, returns cached 200 response with `replay: true`. Commits any optional "final dirty answers" provided in `body.answers` within the same transaction. Inserts `ATTEMPT_SUBMITTED` event into `outbox_events`, inserts an immutable audit log, and calls `triggerOutboxDispatch()`.
- **Transactional Outbox (`backend/src/modules/outbox/`):** `OutboxDispatcher` claims up to 20 events per batch using `SELECT ... FOR UPDATE SKIP LOCKED` inside a short transaction, marks them `PROCESSING`, commits, and publishes them to RabbitMQ exchange `proctornet.events`. Exponential backoff is applied upon publish failure. Background poller runs every 5000ms (`RABBITMQ_DISPATCH_INTERVAL_MS`).
- **RabbitMQ Evaluation Consumer (`backend/src/modules/evaluation/`):** Subscribes to Quorum Queue `proctornet.evaluation.jobs` with `prefetch = 10`. Validates UUIDs, checks if attempt is already evaluated (idempotent check), executes scoring via `evaluateAttempt()`, persists result to `results` table, and sends message ACK only after durable PostgreSQL commit.
- **Redis Client & Rate Limiting (`backend/src/infrastructure/redis/` & `backend/src/middleware/rateLimiter.js`):** Redis 7.4 client. Implements atomic sliding-window rate limiting via Redis Lua script (`SLIDING_WINDOW_LUA`) tracking timestamps in a sorted set (`ZADD`, `ZREMRANGEBYSCORE`, `ZCARD`). Automatically falls back to in-memory sliding window if Redis is unavailable or disabled. Redis is strictly non-authoritative.
- **Health & Metrics Endpoints (`backend/src/routes/health.routes.js`):** `GET /health` (liveness), `GET /ready` (readiness checking DB, Redis, and RabbitMQ), and `GET /metrics` (Prometheus exposition with optional `METRICS_AUTH_TOKEN` validation).
- **Prometheus Metrics Registry (`backend/src/infrastructure/metrics/registry.js`):** Pre-built gauges, counters, and histograms for HTTP requests, database pool (`total`, `idle`, `waiting`, `active`), query latency, answer save latency, OCC conflict counters, outbox backlog, worker evaluation duration, Redis operations, rate-limit blocks, and Node.js process runtime metrics (`nodejs_*`).

### B. Database Schema & Migration Invariants
- **Migrations:** Exactly 17 migrations (`001_extensions.js` through `017_evidence_storage.js`).
- **High-Concurrency Indexing (`010_indexes.js` & `013_outbox_and_idempotency.js`):**
  - `idx_exam_attempts_session_student ON exam_attempts(session_id, student_id)`
  - `idx_attempt_questions_attempt_order ON attempt_questions(attempt_id, display_order)`
  - `idx_answers_attempt_question_id ON answers(attempt_question_id)`
  - `idx_outbox_events_pending_claim ON outbox_events(status, next_retry_at, created_at) WHERE status IN ('PENDING', 'FAILED')`
  - `idx_submission_idempotency_user_key ON submission_idempotency(user_id, idempotency_key)`
- **Schema Sufficiency:** The existing database schema completely supports all Phase 21 requirements. **Zero database migrations are needed.**

### C. Infrastructure Topology
- **Production Baseline (`infrastructure/docker-compose.prod.yml`):** PostgreSQL 16.4-alpine, Redis 7.4-alpine, RabbitMQ 3.13.7-management-alpine, Coturn TURN server. Persistence volumes mapped to `/opt/proctornet/data` on encrypted gp3 EBS volume. PostgreSQL, Redis, and RabbitMQ strictly bound to `127.0.0.1` loopback.
- **Local Integration Baseline (`docker-compose.yml`):** Includes LocalStack S3, postgres, redis, rabbitmq on `proctornet-net` bridge network.

---

## 3. Architecture Baseline

The approved architectural invariants remain strictly intact:
1. **Modular Monolith First:** Single Node.js application process containing all domain modules (Auth, Exams, Sessions, Attempts, Answers, Submissions, Outbox, Evaluation, Realtime).
2. **PostgreSQL Authority:** PostgreSQL 16 is the sole source of authoritative business truth for accounts, sessions, attempts, answers, results, idempotency records, and outbox events.
3. **Redis Ephemeral Role:** Redis 7 is strictly non-authoritative. Used only for distributed sliding-window rate-limiting, token blacklisting, and anti-tamper nonce tracking. If Redis fails or saturates, the system fails open or falls back to in-memory tracking without corrupting business data.
4. **RabbitMQ Asynchronous Transport:** Used exclusively for asynchronous event transport. Submissions are committed transactionally to PostgreSQL before events are published.
5. **Transactional Outbox:** Guarantees at-least-once message publication.
6. **Exactly-Once Business Semantics:** Achieved via idempotent consumer deduplication and database constraints, not message transport guarantees.
7. **Single-Host EC2 Baseline:** AWS `c6i.xlarge` (4 vCPUs, 8 GiB RAM, 100 GB gp3 EBS) running containerized services on local loopback.
8. **Horizontal Scaling Boundary:** Managed services (AWS RDS PostgreSQL, AWS ElastiCache Redis, AWS Application Load Balancer) are strictly deferred to **Phase 32**.

---

## 4. Phase 21 Scope

Phase 21 includes:
1. Development of an automated, deterministic fixture seeding and teardown harness.
2. Formulation and execution of five concurrency tiers: 500, 1,000, 1,500, 2,000, and 2,500 concurrent examinees.
3. Benchmarking periodic answer autosave throughput with OCC revision tracking and simulated client jitter.
4. Benchmarking synchronized 30-second end-of-exam submission burst spikes with dirty answer commits.
5. Profiling PostgreSQL connection pool saturation limits (`DB_POOL_MIN`, `DB_POOL_MAX`), transaction latencies, and deadlock resistance.
6. Profiling Redis sliding-window Lua rate limiter latency and non-authoritative fallback behavior.
7. Measuring transactional outbox claim throughput, queue buffering, and asynchronous evaluation worker drain time.
8. Comprehensive resource telemetry capture (CPU, RAM, Event-Loop Lag, EBS gp3 IOPS/throughput).
9. Empirical capacity ceiling classification (Sustainable, Degraded, Saturation, Failure).
10. Concrete, data-driven scaling recommendation report for Phase 32.
11. Lightweight CI smoke load test ($< 45\text{ seconds}$, 25 VUs) for pre-merge regression safety.

---

## 5. Non-Scope

Phase 21 explicitly does **NOT** include:
- Modifying application business logic or core routing.
- Adding new database migrations or altering existing schemas.
- Modifying Terraform IaC to activate RDS, ElastiCache, ALB, or Auto-Scaling Groups (Phase 32).
- Injecting chaos faults (container kills, network partitions, disk corruptions) — strictly reserved for **Phase 22**.
- Running destructive load tests against the live production environment.
- Implementing WireGuard VPN tunnels (Phase 29).
- Implementing biometric identification or advanced AI proctoring (Phases 25–28).
- Kubernetes, microservice decomposition, or multi-region deployments.

---

## 6. Benchmark Environments

To ensure zero production contamination and high reproducibility, testing is strictly segregated into three environments:

| Environment | Purpose | Infrastructure | Workload Applied |
|---|---|---|---|
| **A. LOCAL** | Script correctness, HMAC signature verification, fixture generation debugging, smoke tests. | Developer workstation, local Docker Compose stack (`docker-compose.yml`). | 25 VUs smoke test; single-iteration verification. |
| **B. BENCHMARK / STAGING** | **Official Phase 21 performance benchmarking & capacity qualification.** | Dedicated EC2 `c6i.xlarge` instance provisioned identically to production via Phase 20 Terraform baseline (`terraform/environments/staging/`). | Full 500 to 2,500 VUs concurrency tiers; 30s submission bursts. |
| **C. PRODUCTION** | Verification of operational health, baseline latency checks, zero-load readiness. | Live AWS Production environment (`c6i.xlarge`). | **Readiness probes and safe single-user smoke checks ONLY.** Destructive multi-thousand VU tests are strictly prohibited. |

---

## 7. Workload Models

All workload tiers operate against a standardized 50-question examination (30 MCQ, 10 True/False, 10 Numeric). Concurrency tiers are defined with deterministic ramp-ups, 5-minute steady-state windows, and coordinated 30-second burst conclusions.

### Workload Tier Specifications

```
Concurrency Ramp Progression:
[Tier 1: 500 VUs]  ==> 60s ramp  ==> 5m steady (71 saves/s)  ==> 30s burst (17 sub/s)
[Tier 2: 1,000 VUs] ==> 120s ramp ==> 5m steady (143 saves/s) ==> 30s burst (33 sub/s)
[Tier 3: 1,500 VUs] ==> 180s ramp ==> 5m steady (214 saves/s) ==> 30s burst (50 sub/s)
[Tier 4: 2,000 VUs] ==> 240s ramp ==> 5m steady (285 saves/s) ==> 30s burst (67 sub/s)
[Tier 5: 2,500 VUs] ==> 300s ramp ==> 5m steady (357 saves/s) ==> 30s burst (83 sub/s)
```

| Parameter | Tier 1 (500 VUs) | Tier 2 (1,000 VUs) | Tier 3 (1,500 VUs) | Tier 4 (2,000 VUs) | Tier 5 (2,500 VUs) |
|---|---|---|---|---|---|
| **Ramp-Up Duration** | 60 seconds | 120 seconds | 180 seconds | 240 seconds | 300 seconds |
| **Steady-State Duration**| 5 minutes | 5 minutes | 5 minutes | 5 minutes | 5 minutes |
| **Autosave Frequency** | 1 save / 7s ($\pm 2\text{s}$ jitter) | 1 save / 7s ($\pm 2\text{s}$ jitter) | 1 save / 7s ($\pm 2\text{s}$ jitter) | 1 save / 7s ($\pm 2\text{s}$ jitter) | 1 save / 7s ($\pm 2\text{s}$ jitter) |
| **Steady-State Autosave RPS** | ~71 req/sec | ~143 req/sec | ~214 req/sec | ~285 req/sec | ~357 req/sec |
| **Total Autosaves (5 min)**| ~21,300 | ~42,900 | ~64,200 | ~85,500 | ~107,100 |
| **Submission Window** | 30 seconds | 30 seconds | 30 seconds | 30 seconds | 30 seconds |
| **Peak Submission RPS** | ~17 req/sec | ~33 req/sec | ~50 req/sec | ~67 req/sec | ~83 req/sec |
| **Submission Injections**| 2 dirty answers | 2 dirty answers | 2 dirty answers | 2 dirty answers | 2 dirty answers |
| **Simulated Idempotent Replays** | 10% of candidates | 10% of candidates | 10% of candidates | 10% of candidates | 10% of candidates |

---

## 8. Autosave Benchmark

### A. Realistic Jitter & Arrival Distribution
To avoid artificial synchronization harmonics ("thundering herds"), each virtual user applies randomized Gaussian think time:
$$t_{\text{think}} \sim \mathcal{N}(\mu = 7.0\text{s}, \sigma = 1.5\text{s}), \quad \text{clamped to } [5.0\text{s}, 10.0\text{s}]$$

### B. Protocol & Cryptographic Integrity
- **Endpoint:** `PUT /api/v1/attempts/:attemptId/answers/:attemptQuestionId`
- **Headers:**
  - `Authorization: Bearer <jwt_access_token>`
  - `X-Payload-Signature: t=<timestamp_ms>,n=<nonce_uuid>,v1=<hmac_sha256_hex>`
  - `X-Client-Timestamp: <iso_8601>`
  - `Content-Type: application/json`
- **HMAC Calculation in k6:** Evaluated in-engine via `k6/crypto` using the pre-derived candidate signing key:
  $$\text{PayloadHash} = \text{SHA256}(\text{canonicalize}(body))$$
  $$\text{StringToSign} = \text{"v1:"} + t + \text{":"} + n + \text{":"PUT:/api/v1/attempts/"} + attemptId + \text{"/answers/"} + qId + \text{":"} + \text{PayloadHash}$$
  $$\text{Signature} = \text{HMAC-SHA256}(\text{signingKey}, \text{StringToSign})$$

### C. OCC State Transitions
1. **Initial Answer:** Client sends `expected_revision: 0` $\to$ Backend verifies question is unanswered $\to$ inserts answer with `revision = 1` $\to$ returns HTTP 200.
2. **Subsequent Revision:** Client tracks local revision $K$. Sends `expected_revision: K` $\to$ Backend increments to $K + 1$ $\to$ returns HTTP 200.
3. **Idempotent Retry (Simulated Network Replay):** 5% of autosaves resend identical payload with `expected_revision: K - 1`. Backend detects identical payload $\to$ returns HTTP 200 without error.
4. **Stale Revision Conflict (Injected Race Condition):** 1% of autosaves intentionally send $K - 1$ with modified payload. Backend rejects with `409 STALE_REVISION_CONFLICT` and increments `answer_revisions_conflict_total`. The benchmark harness classifies these 409 responses as **successful OCC verification**, not HTTP failures.

---

## 9. Submission Burst Benchmark

### A. Execution Scenarios
The submission benchmark executes two distinct scenarios at each concurrency tier:
1. **Realistic Randomized Burst:** Candidates conclude within a 30-second window following a Gaussian arrival curve ($\mu = 15\text{s}, \sigma = 5\text{s}$).
2. **Worst-Case Synchronized Spike:** All $N$ candidates submit within a rigid 5-second window to evaluate absolute connection pool and lock contention limits.

### B. Payload & Transactional Behavior
- **Endpoint:** `POST /api/v1/attempts/:attemptId/submit`
- **Headers:** `Idempotency-Key: <unique_uuid_v4>`
- **Payload:**
  ```json
  {
    "answers": [
      {
        "attempt_question_id": "<uuid-1>",
        "expected_revision": 3,
        "answer_value": { "selected_option_id": "<option-uuid>" }
      },
      {
        "attempt_question_id": "<uuid-2>",
        "expected_revision": 1,
        "answer_value": { "numeric_value": 42.5 }
      }
    ]
  }
  ```
- **Transactional Path:** In a single PostgreSQL transaction:
  1. `SELECT ... FOR UPDATE` locks the `exam_attempts` row.
  2. Final dirty answers are validated and updated with OCC increments.
  3. `exam_attempts.status` transitions from `ACTIVE` $\to$ `SUBMITTED`.
  4. `outbox_events` record inserted with event `ATTEMPT_SUBMITTED`.
  5. `submission_idempotency` record inserted with deterministic SHA-256 fingerprint.
  6. `audit_logs` record inserted.
  7. `COMMIT` releases locks.
  8. `triggerOutboxDispatch()` triggers immediate async dispatch.

---

## 10. PostgreSQL Benchmark

### A. Baseline vs. Sensitivity Configurations
- **Baseline Test Configuration:** Uses the exact Phase 20 production baseline:
  `DB_POOL_MIN = 2`, `DB_POOL_MAX = 10`, `DB_CONNECTION_TIMEOUT_MS = 5000ms`.
- **Sensitivity Test Configurations:** Executed as separate, isolated benchmark runs to determine optimal tuning:
  - Sensitivity Run A: `DB_POOL_MAX = 20`
  - Sensitivity Run B: `DB_POOL_MAX = 30`
  - Sensitivity Run C: `DB_POOL_MAX = 50`

### B. Metrics Collected Every 1 Second
- Pool State: `db_pool_connections{state="total|idle|waiting|active"}`
- Query Latency: `db_query_duration_seconds` (p50, p95, p99)
- Transaction Duration: Measured via custom client-side query timer.
- Contention & Locks: `pg_stat_activity` (sampling `wait_event_type = 'Lock'`).
- Deadlock Delta: `pg_stat_database.deadlocks` before and after test run (must be exactly 0).
- Storage Performance: EBS gp3 IOPS and disk write MB/s via `iostat -xz 1`.

---

## 11. Redis Benchmark

### A. Non-Authoritative Invariants
Redis is strictly evaluated as a high-throughput cache and ephemeral limiter. In Phase 21:
1. Rate Limiting Overhead: Profiling latency of `slidingWindowRateLimit` Lua script execution across 2,500 active candidate keys.
2. Anti-Tamper Nonce Overhead: Tracking memory consumption of 50,000 nonces (`v1:nonce:<attemptId>:<nonce>`) with 300s TTL.
3. Fallback Verification: If Redis CPU or memory saturates, verifying that backend logs in-memory fallback transitions and preserves 100% of answer writes to PostgreSQL.

### B. Telemetry Captured
- `redis_operations_total{operation="slidingWindowRateLimit", status="success"}`
- `rate_limit_blocks_total` (should be 0 under normal pacing)
- Redis `INFO commandstats` (calls, microsecond execution time)
- Redis `INFO memory` (used memory RSS, fragmentation ratio)

---

## 12. Outbox Benchmark

### A. Pipeline Telemetry
- Outbox Event Generation Rate: $\text{Events Enqueued / Sec}$ during submission burst.
- Backlog Gauge: `outbox_backlog_total{status="PENDING|PROCESSING|PUBLISHED|FAILED"}`.
- Claim Latency: Time taken to execute `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 20`.
- Batch Dispatch Duration: `outbox_dispatch_duration_seconds`.
- Stale Lock Recovery: Verifying that events stuck in `PROCESSING` longer than 5 minutes are recovered without duplication.

---

## 13. RabbitMQ Benchmark

### A. Queue & Channel Invariants
- Channel State: Publisher confirms enabled on `proctornet.events` exchange.
- Quorum Queue: `proctornet.evaluation.jobs` durable queue depth tracked via RabbitMQ Management API `/api/queues/%2F/proctornet.evaluation.jobs`.
- Message Reliability: Confirm zero unroutable returns (`basic.return`), zero dropped publishes, and zero dead-letter queue (DLQ) messages during standard runs.

---

## 14. Evaluation Worker Benchmark

### A. Asynchronous Scoring Pipeline
- Worker Throughput: `worker_evaluations_total{outcome="SUCCESS"}`.
- Processing Latency: `worker_evaluation_duration_seconds` (time to evaluate 50 questions, calculate scores, and persist to `results` table).
- Queue Drain Time ($T_{\text{drain}}$): Elapsed wall-clock time from the final candidate submission until `proctornet.evaluation.jobs` queue depth reaches exactly 0.
- End-to-End Latency ($T_{\text{e2e}}$): Time from candidate clicking "Submit" to result availability in PostgreSQL.

---

## 15. Resource & Infrastructure Telemetry

Host and container metrics are sampled synchronously at 1-second intervals by [`scripts/load/collect-system-metrics.sh`](file:///c:/Projects/Online%20Examination%20System/scripts/load/collect-system-metrics.sh):

```
                        TELEMETRY SAMPLING HARNESS
 +----------------------------------------------------------------------+
 | Source               | Metrics Captured               | Frequency    |
 +----------------------------------------------------------------------+
 | Backend /metrics     | http_*, db_*, answer_*,        | Every 1 sec  |
 |                      | outbox_*, worker_*, nodejs_*   |              |
 | docker stats         | Container CPU %, Memory RSS    | Every 1 sec  |
 |                      | (backend, postgres, redis, rmq)|              |
 | Linux iostat         | Disk r/s, w/s, rMB/s, wMB/s,   | Every 1 sec  |
 |                      | %util, await, r_await, w_await |              |
 | Linux vmstat         | Context switches, run-queue,   | Every 1 sec  |
 |                      | free/buffered/cached memory    |              |
 +----------------------------------------------------------------------+
```

All metrics are tagged with a unique `benchmark_run_id` (e.g., `bench-20260908-t5-2500vu-base`) and exported to timestamped CSV and JSON artifacts.

---

## 16. Load Generator Architecture

To guarantee that the load generation client does not become the bottleneck:
1. **Generator Placement:** The load generator runs on a separate, dedicated EC2 instance (e.g., `c6i.2xlarge` with 8 vCPUs, 16 GiB RAM) located in the same AWS Availability Zone (sub-millisecond latency, zero internet gateway traversal).
2. **Client Health Telemetry:** Generator CPU, memory, and open file descriptors are recorded every 1 second. If generator CPU exceeds **70%**, the test run is flagged as invalid.
3. **Socket Optimization:** Generator OS configured with:
   - `ulimit -n 65535` (max open file descriptors)
   - `net.ipv4.tcp_tw_reuse = 1` (instant socket recycling)
   - `net.ipv4.ip_local_port_range = 1024 65535`

---

## 17. k6 Strategy

### Responsibilities
- High-concurrency answer autosave stress testing (500 to 2,500 VUs).
- Synchronized 30-second submission bursts.
- PostgreSQL connection pool saturation testing.
- Cryptographic HMAC-SHA256 request signing using native Go-backed `k6/crypto`.

### Technical Implementation
- Script: `scripts/load/k6/autosave-concurrency.js`
- Custom Metrics:
  - `autosave_latency`: `Trend`
  - `occ_conflicts`: `Counter`
  - `submission_latency`: `Trend`
  - `successful_submissions`: `Counter`

---

## 18. Artillery Strategy

### Responsibilities
- Complex, multi-step candidate examination lifecycles:
  `Authenticate` $\to$ `Get Session Info` $\to$ `Start Attempt` $\to$ `Navigate Questions` $\to$ `Autosave Answers` $\to$ `Submit Exam` $\to$ `Poll for Evaluation Result`.
- Evaluating session enrollment and token validation under realistic user navigation patterns.

### Technical Implementation
- Script: `scripts/load/artillery/candidate-journey.yml`
- Implements custom JavaScript helper for HMAC signing and response assertion.

---

## 19. Benchmark Data & Credential Strategy

### A. Zero Secret Exposure Invariants
- No JWTs, passwords, or HMAC secrets are ever committed to Git.
- The fixture seeder ([`scripts/load/seed-benchmark-data.js`](file:///c:/Projects/Online%20Examination%20System/scripts/load/seed-benchmark-data.js)) reads `JWT_ACCESS_SECRET` and `ANTI_TAMPER_SECRET` from the local environment at runtime.
- Pre-hashed bcrypt password strings are used for database insertion, eliminating CPU starvation during seeder setup.

### B. Deterministic Fixture Structure
- Organization: `Benchmark Examination Testing Org`
- Exam: `Benchmark Assessment 2026` (50 questions: 30 MCQ, 10 True/False, 10 Numeric)
- Candidate Accounts: `benchmark_student_0001@example.com` through `benchmark_student_2500@example.com`
- Session: Scheduled 4-hour window covering the benchmark execution.
- Attempts: Pre-started in PostgreSQL with status `ACTIVE` and pre-generated `attempt_questions` mappings.
- Artifact Export: Outputs `scripts/load/fixtures/benchmark-fixtures.json` (git-ignored), mapping candidate IDs to pre-computed tokens and signing keys.

---

## 20. Capacity Classification Methodology

To prevent declaring 2,500 users supported merely because the system didn't crash, Phase 21 enforces four rigorous capacity states:

```
+-----------------------------------------------------------------------------------+
| CAPACITY STATE       | LATENCY (p95) | ERROR RATE | POOL WAIT | SYSTEM INDICATORS |
+-----------------------------------------------------------------------------------+
| 1. Sustainable       | < 200 ms      | < 0.01%    | = 0 ms    | CPU < 70%, 0 lag  |
| 2. Degraded          | 200 - 500 ms  | < 0.1%     | < 100 ms  | CPU 70-85%, lag<50|
| 3. Saturation Point  | 500 - 2000 ms | < 1.0%     | > 100 ms  | Pool queue builds |
| 4. Failure Point     | > 2000 ms / TO| > 1.0%     | Timeout   | 5xx errs, deadlocks|
+-----------------------------------------------------------------------------------+
```

### Safe Operating Capacity Rule
The final recommended production operating ceiling is calculated as:
$$\text{Safe Operating Capacity} = \min\left(\text{Sustainable Concurrency}, \, 0.80 \times \text{Saturation Concurrency}\right)$$

---

## 21. Data Integrity Validation

Following each benchmark tier, [`scripts/load/verify-data-integrity.js`](file:///c:/Projects/Online%20Examination%20System/scripts/load/verify-data-integrity.js) runs post-run SQL validation assertions:

1. **Zero Answer Data Loss:**
   $$\sum \text{Saved Answers in DB} \equiv \sum \text{Successful HTTP 200 Saves Reported by k6}$$
2. **Zero Orphan Attempts:**
   $$\text{Attempts in 'SUBMITTED'} \equiv \text{Successful Submissions Reported by k6}$$
3. **Zero Duplicate Business Effects:**
   $$\text{Rows in 'submission_idempotency'} \equiv \text{Unique Submitted Attempts}$$
4. **Outbox Completeness:**
   $$\text{Outbox Events with 'ATTEMPT_SUBMITTED'} \equiv \text{Submitted Attempts}$$
5. **Evaluation Result Completeness:**
   $$\text{Rows in 'results' Table} \equiv \text{Submitted Attempts}$$
6. **Zero Deadlocks:**
   $$\Delta(\text{pg\_stat\_database.deadlocks}) \equiv 0$$

---

## 22. Phase 32 Scaling Decision Methodology

Phase 21 produces the definitive decision matrix for Phase 32 managed service activation:

| Architecture Component | Primary Bottleneck Indicator | Phase 32 Activation Trigger | Scaling Recommendation |
|---|---|---|---|
| **PostgreSQL Database** | Disk I/O utilization $> 85\%$ or connection wait time $> 100\text{ ms}$ despite pool tuning. | Single EBS volume saturates on IOPS or host RAM exhausts. | **Activate AWS RDS PostgreSQL (Phase 32)** |
| **Redis Cache / Limiter** | Redis CPU $> 20\%$ or Lua script latency $> 10\text{ ms}$. | Memory limits threaten single host; multi-node sync needed. | **Activate AWS ElastiCache Redis (Phase 32)** |
| **Backend Compute** | Node.js event loop lag $> 50\text{ ms}$ or host CPU $> 75\%$ at steady state. | Single Node.js process CPU-bound on crypto / HTTP. | **Activate AWS ALB + Multi-Instance Monolith (Phase 32)** |
| **Evaluation Workers** | Queue drain time $T_{\text{drain}} > 120\text{ seconds}$ after burst. | Single worker consumer unable to keep up with queue spikes. | **Decouple Worker Process to Standalone Service (Phase 32)** |

---

## 23. CI/CD Strategy

1. **CI Smoke Load Test (Lightweight Gate):**
   - Script: `scripts/load/k6/smoke-test.js`
   - Concurrency: 25 VUs, duration: 30 seconds.
   - Purpose: Validates k6 script execution, HMAC signature generation, OCC incrementing, and HTTP 200 responses.
   - Runtime: $< 45\text{ seconds}$. Integrated into `.github/workflows/ci.yml`.
2. **Full Concurrency Benchmarks (Tiers 1–5):**
   - Executed **outside ordinary PR CI**.
   - Triggered manually on benchmark EC2 infrastructure or local performance workstation.
   - Results exported to `docs/benchmarks/CAPACITY_AND_SCALING_REPORT.md`.

---

## 24. Exact File-by-File Changes

```
+-----------------------------------------------------------------------------------------------------------------------------+
| File Path                                   | Action   | Purpose                                                            |
+-----------------------------------------------------------------------------------------------------------------------------+
| scripts/load/seed-benchmark-data.js         | CREATE   | Deterministic fixture seeder for 500-2500 candidates, exams, keys   |
| scripts/load/cleanup-benchmark-data.js      | CREATE   | Cascading teardown utility for benchmark_* database records        |
| scripts/load/verify-data-integrity.js       | CREATE   | Post-benchmark SQL invariant validation (0 loss, 0 deadlocks)       |
| scripts/load/collect-system-metrics.sh      | CREATE   | Background telemetry collector for Prometheus, Docker, and iostat  |
| scripts/load/k6/autosave-concurrency.js     | CREATE   | k6 answer autosave concurrency benchmark suite                     |
| scripts/load/k6/submission-burst.js         | CREATE   | k6 synchronized 30-second submission burst suite                   |
| scripts/load/k6/pool-saturation.js          | CREATE   | k6 PostgreSQL connection pool saturation stress suite              |
| scripts/load/k6/smoke-test.js               | CREATE   | Fast 25-VU CI smoke load test                                      |
| scripts/load/artillery/candidate-journey.yml| CREATE   | Artillery multi-phase candidate exam lifecycle scenario            |
| scripts/load/run-benchmarks.sh              | CREATE   | Master orchestration script running all tiers and generating reports|
| docs/benchmarks/BENCHMARK_METHODOLOGY.md    | CREATE   | Authoritative benchmarking runbook and scientific methodology       |
| docs/benchmarks/CAPACITY_AND_SCALING_REPORT.md| CREATE | Empirical results, capacity ceiling, and Phase 32 scaling report    |
| docs/TESTING/README.md                      | MODIFY   | Index Phase 21 load testing suites and execution instructions       |
| backend/package.json                        | MODIFY   | Add devDependencies (artillery) and npm convenience scripts         |
| docs/DEVELOPMENT_PLAN.md                    | MODIFY   | Mark Phase 21 complete upon final PR merge                          |
| backend/src/**                              | NO CHANGE| Zero application source code modifications                          |
| backend/migrations/**                       | NO CHANGE| Zero database schema modifications (count remains 17)               |
| terraform/**                                | NO CHANGE| Zero IaC changes (managed services remain deferred to Phase 32)     |
+-----------------------------------------------------------------------------------------------------------------------------+
```

---

## 25. Test Plan

Before executing the full 2,500-VU benchmark, the following verification pipeline must pass:

1. **Fixture Validation:** Verify `node scripts/load/seed-benchmark-data.js --count=25` provisions records with valid foreign keys and JWTs.
2. **HMAC Compatibility Test:** Verify that k6-generated `X-Payload-Signature` headers pass `antiTamperMiddleware` with zero rejections.
3. **Idempotency Replay Test:** Verify that replayed submission requests return HTTP 200 with stored responses and zero duplicate outbox rows.
4. **OCC Conflict Test:** Verify that stale revision writes return HTTP 409 and increment `answer_revisions_conflict_total`.
5. **CI Smoke Test:** Execute `k6 run scripts/load/k6/smoke-test.js` (25 VUs, 30s) and assert 0% error rate.
6. **Teardown Test:** Execute `node scripts/load/cleanup-benchmark-data.js` and assert that count of `benchmark_*` records in PostgreSQL is exactly 0.

---

## 26. Cleanup Strategy

- **Targeted Purge:** Deletes only records matching:
  - `users.email LIKE 'benchmark_student_%'`
  - `exams.title LIKE 'Benchmark Assessment%'`
- **Cascading Foreign Keys:** Deletes cascade automatically through `exam_results`, `outbox_events`, `answers`, `attempt_questions`, `exam_attempts`, `session_students`, `exam_sessions`, and `exams`.
- **Safety Guard:** Script requires explicit `ALLOW_BENCHMARK_CLEANUP=true` environment flag and aborts immediately if executed against an environment where `NODE_ENV === 'production'` without manual override.
- **Dry-Run Mode:** Supports `--dry-run` to report matching row counts before deletion.

---

## 27. Documentation Deliverables

1. [`docs/benchmarks/BENCHMARK_METHODOLOGY.md`](file:///c:/Projects/Online%20Examination%20System/docs/benchmarks/BENCHMARK_METHODOLOGY.md): Complete scientific methodology, mathematical capacity definitions, arrival distributions, and hardware profiling procedures.
2. [`docs/benchmarks/CAPACITY_AND_SCALING_REPORT.md`](file:///c:/Projects/Online%20Examination%20System/docs/benchmarks/CAPACITY_AND_SCALING_REPORT.md): Empirical test logs, quantile latency charts, bottleneck classifications, and Phase 32 scaling triggers.
3. [`docs/TESTING/README.md`](file:///c:/Projects/Online%20Examination%20System/docs/TESTING/README.md): Updated load testing reference and command runbook.

---

## 28. Risks & Mitigations

| Risk | Severity | Technical Mitigation |
|---|---|---|
| **Load Generator Bottleneck** | HIGH | Use compiled Go k6 binary with connection reuse; execute from dedicated EC2 instance in same AZ; monitor generator CPU $< 70\%$. |
| **Bcrypt Password CPU Starvation** | HIGH | Pre-seed candidate accounts and pre-mint JWT tokens offline in fixture generator; load test tests API, not bcrypt. |
| **HMAC Signature Desynchronization** | HIGH | Implement Web Crypto-compliant HMAC-SHA256 canonicalization in `k6/crypto`; validate against backend unit tests. |
| **PostgreSQL Pool Timeout (5000ms)** | MEDIUM | Monitor `db_pool_connections{state="waiting"}`; test pool sensitivity sizes of 10, 20, 30, and 50. |
| **Ephemeral Port Exhaustion (TIME_WAIT)** | MEDIUM | Enable HTTP keep-alive in k6 and configure Linux sysctl `net.ipv4.tcp_tw_reuse = 1` on generator. |
| **EBS gp3 IOPS Throttling** | MEDIUM | Monitor disk %util with `iostat`; verify test volume has baseline 3,000 IOPS and 125 MB/s throughput provisioned. |
| **Test Data Contamination** | MEDIUM | Scope all test records to `benchmark_*` prefixes; enforce automated pre-run and post-run cleanup. |
| **Outbox Dispatch Latency Lag** | LOW | Track `outbox_backlog_total`; measure queue drain time to identify optimal dispatch batch size. |

---

## 29. Dependency Graph

```
Step 1: Benchmark Fixture Tooling
  [seed-benchmark-data.js] --------+
  [cleanup-benchmark-data.js] -----+
  [verify-data-integrity.js] ------+
                                   |
                                   v
Step 2: Load Test Scenarios Development
  [k6/autosave-concurrency.js] <---+ (Consumes seed fixtures)
  [k6/submission-burst.js] <-------+
  [k6/pool-saturation.js] <--------+
  [k6/smoke-test.js] <-------------+
  [artillery/candidate-journey.yml]+
                                   |
                                   v
Step 3: Verification & Pre-Flight Smoke Test
  Execute smoke-test.js (25 VUs, 30s)
  Verify HMAC signatures, OCC handling, 200 OKs
                                   |
                                   v
Step 4: Full Concurrency Benchmarking (Tiers 1 to 5)
  Tier 1: 500 VUs   ===> Telemetry Capture & Invariant Verification
  Tier 2: 1,000 VUs ===> Telemetry Capture & Invariant Verification
  Tier 3: 1,500 VUs ===> Telemetry Capture & Invariant Verification
  Tier 4: 2,000 VUs ===> Telemetry Capture & Invariant Verification
  Tier 5: 2,500 VUs ===> Telemetry Capture & Invariant Verification
                                   |
                                   v
Step 5: Post-Test Analysis & Deliverables
  [CAPACITY_AND_SCALING_REPORT.md]
  [BENCHMARK_METHODOLOGY.md]
  Update docs/TESTING/README.md & docs/DEVELOPMENT_PLAN.md
```

---

## 30. Acceptance Criteria

| Metric / Condition | Target Threshold | Source Authority |
|---|---|---|
| **Autosave p95 Latency** | **$< 200\text{ ms}$** at peak target concurrency | `docs/DEVELOPMENT_PLAN.md` |
| **Autosave p99 Latency** | **$< 500\text{ ms}$** at peak target concurrency | Engineering Target |
| **Answer Data Loss** | **Exactly 0** | `docs/DEVELOPMENT_PLAN.md` |
| **OCC Rollback Failures** | **Exactly 0** | `docs/DEVELOPMENT_PLAN.md` |
| **PostgreSQL Deadlocks** | **Exactly 0** (`pg_stat_database.deadlocks` delta = 0) | `docs/DEVELOPMENT_PLAN.md` |
| **HTTP Error Rate (5xx)** | **$< 0.01\%$** ($< 1$ in 10,000 requests) | `docs/DEVELOPMENT_PLAN.md` |
| **Evaluation Queue Drain** | **100% drained, 0 drops, 0 unroutable returns** | `docs/DEVELOPMENT_PLAN.md` |
| **Evaluation Result Commit**| **$100\%$ ($N / N$ submitted attempts)** | `docs/DEVELOPMENT_PLAN.md` |
| **Redis Rate Limit Latency**| **$< 5\text{ ms}$** average per check | Engineering Target |
| **Host CPU Saturation** | **$< 85\%$** steady-state | Engineering Target |

---

## 31. Implementation Sequence

Upon receiving user approval, execution will proceed through these exact gates:
1. **Gate 1: Dependencies & Fixture Tooling:** Install artillery devDependency; author `seed-benchmark-data.js`, `cleanup-benchmark-data.js`, and `verify-data-integrity.js`.
2. **Gate 2: Load Test Suites:** Author `k6/autosave-concurrency.js`, `k6/submission-burst.js`, `k6/pool-saturation.js`, `k6/smoke-test.js`, and `artillery/candidate-journey.yml`.
3. **Gate 3: Telemetry & Orchestration:** Author `collect-system-metrics.sh` and `run-benchmarks.sh`.
4. **Gate 4: Pre-Flight Verification:** Run smoke test (25 VUs, 30s) and verify 100% HMAC compatibility and data integrity.
5. **Gate 5: Full Benchmark Execution:** Run Tiers 1 through 5, record telemetry, and execute post-run integrity checks.
6. **Gate 6: Documentation:** Author `BENCHMARK_METHODOLOGY.md` and `CAPACITY_AND_SCALING_REPORT.md`; update `docs/TESTING/README.md`.
7. **Gate 7: Code Review & Git Lifecycle:** Commit with structured message, push branch, open PR, review, squash/merge, and mark complete.

---

## 32. Final Self-Audit

- [x] Repository was inspected instead of assumptions being made
- [x] Phase 20 baseline configuration is preserved
- [x] Baseline and sensitivity tests are separated
- [x] 500/1000/1500/2000/2500 workloads are defined
- [x] Autosave workload is realistic (5–10s jitter, initial save, updates, OCC, idempotency, stale revision)
- [x] Submission burst is modeled (30-second window, randomized arrival, worst-case spike, final dirty answers)
- [x] OCC behavior is included (409 handling, revision increment, idempotent retry)
- [x] Idempotency is included (Idempotency-Key header, SHA-256 fingerprint, replay)
- [x] PostgreSQL pool behavior is measurable (active, idle, waiting, total, transaction duration, deadlocks)
- [x] Redis remains non-authoritative (sliding-window Lua rate limiter, non-fatal fallback)
- [x] Outbox behavior is measurable (claim batch 20, SKIP LOCKED, dispatch duration, backlog)
- [x] RabbitMQ behavior is measurable (Quorum Queue depth, publish rate, unroutable returns, prefetch 10)
- [x] Evaluation worker behavior is measurable (jobs/sec, evaluation duration, ACK only after commit, drain time)
- [x] CPU/memory/EBS/event-loop telemetry is included (docker stats, iostat, nodejs_* metrics)
- [x] Load generator saturation is addressed (k6 compiled Go binary, generator CPU/RAM/net monitoring)
- [x] Capacity classification is explicit (Sustainable, Degraded, Saturation, Failure)
- [x] Safe operating capacity methodology is explicit (80% of knee in curve)
- [x] Phase 32 decision output is explicit (matrix for RDS, ElastiCache, ALB, backend horizontal scaling)
- [x] Credentials cannot leak into Git (.gitignore, runtime generation, ephemeral secrets)
- [x] Benchmark fixtures are isolated (`benchmark_*` prefix, separate test exam)
- [x] Production destructive load testing is prohibited (strict environment isolation)
- [x] Cleanup is safe (cascading purge of `benchmark_*` records, dry-run mode)
- [x] CI smoke test is separated from full benchmark (fast 25-VU 30s smoke test in CI vs. full external benchmark)
- [x] Exact repository files are identified (no invented paths, based on inspection)
- [x] No unnecessary database migration is assumed (verified existing 17 migrations are sufficient)
- [x] No unnecessary product-code change is assumed (zero product logic modifications)
- [x] Data integrity verification exists (post-benchmark verification queries for 0 answer loss, 0 orphan attempts, 0 duplicate results)
- [x] Benchmark reproducibility metadata exists (commit SHA, versions, hardware, pool configs, run ID)
- [x] Phase 22 chaos testing is not accidentally duplicated (fault injection, network drops isolated to Phase 22)
- [x] No future-phase implementation is included (WireGuard, AI proctoring, multi-region excluded)
- [x] Testing strategy is complete (fixture tests, smoke tests, contract tests, teardown tests)
- [x] Risks and mitigations are complete (all listed risks addressed with technical mitigations)
- [x] Documentation deliverables are complete (methodology, report, test docs)

---

## 33. Governance Status

```
================================================================================
PHASE 21 PLAN — FINAL / IMPLEMENTATION-READY / AWAITING EXPLICIT APPROVAL
================================================================================
```

- **Architectural Conflicts Discovered:** ZERO.
- **ADR Required:** NO. Phase 21 produces empirical data for future Phase 32 decisions and introduces no architectural changes.
- **Scope Completeness:** Complete and authoritative.
- **Implementation Status:** No implementation was performed.
- **Files Modified:** ZERO product code or infrastructure files modified.
- **Next Step:** Awaiting explicit user review and approval before creating the feature branch and beginning implementation.
