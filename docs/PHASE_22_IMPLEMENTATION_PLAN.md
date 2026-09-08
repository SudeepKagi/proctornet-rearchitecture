# ProctorNet — Phase 22 Implementation Plan
## Failure, Resilience & Chaos Testing (Authoritative Architecture Specification)

> **Governance Status:** PLAN ONLY — STRICT PLANNING GATE  
> **Lifecycle Phase:** Phase 22 — Failure, Resilience & Chaos Testing  
> **Repository Baseline:** `main` @ `616772b`  
> **Predecessor Phase:** Phase 21 — Load Testing & Concurrency Benchmarking (COMPLETE & MERGED — PR #19)  
> **Architectural Baseline:** Single-Host Modular Monolith; PostgreSQL Authoritative State; Redis Non-Authoritative Cache/Ephemeral; RabbitMQ Asynchronous Transport; Transactional Outbox; WebSocket Realtime; WebRTC/SFU Media; Docker Deployment  
> **Safety Directive:** Fast Development Without Quality Compromise; Zero Production Destruction; Local Workstation Resource Protection; No Premature Distributed Architecture Changes  

---

## 1. Executive Summary & Objective

Phase 22 verifies system resilience, data durability, and automated recovery across all layers of the ProctorNet architecture during unexpected subsystem outages, network partitions, container crashes, and resource constraints.

Unlike Phase 21 (which evaluated throughput and latency limits under staged concurrency), Phase 22 injects deliberate, controlled faults into active workflows (e.g., student authentication, answer autosave with OCC, submission bursts, outbox event publication, asynchronous evaluation, and proctoring telemetry) to empirically verify that:
1. **PostgreSQL Authoritative State**: PostgreSQL Authoritative State remains consistent and durable under the defined Phase 22 failure scenarios, with zero observed committed-data loss or corruption.
2. **Redis Failure is Non-Fatal**: Redis outages never interrupt examinations or drop answers. The system fails open gracefully, falling back to PostgreSQL for reads and local in-memory sliding-window maps for rate limiting.
3. **RabbitMQ Broker Downtime Causes Zero Event Loss**: Submissions are durably committed to PostgreSQL along with their transactional outbox events before any network publish. When RabbitMQ is down, the outbox safely buffers events, applies exponential backoff, and drains automatically upon broker reconnection.
4. **Worker Crashes Cause Zero Duplicate Business Effects**: If an evaluation consumer crashes mid-processing, unacknowledged messages are safely re-queued by RabbitMQ, and consumers enforce idempotent deduplication before writing results.
5. **WebSockets and Realtime Services Reconnect Gracefully**: Network blips or socket closures do not disrupt academic attempts; clients reconnect with seamless token refresh and state synchronization.
6. **Workstation Safety is Maintained**: All chaos tests are designed with bounded concurrency, isolated test fixtures, explicit timeouts, and automatic cleanup to prevent host system unresponsiveness.

> [!NOTE]
> **Implementation Integrity**: All expected failure behaviors documented herein represent **testable expectations** to be verified against the existing implementation. Application business logic must NOT be modified merely to force a test to pass.

---

## 2. Authoritative Architecture & Component Mapping

The resilience verification directly exercises the concrete components implemented in the repository:

| Subsystem | Authoritative Role | Failure Behavior & Fallback Strategy | Primary Source Files |
| :--- | :--- | :--- | :--- |
| **PostgreSQL 16** | **Authoritative State** (Single Source of Truth) | Fail-closed on connection pool exhaustion with bounded queue wait (`DB_CONNECTION_TIMEOUT_MS`); readiness returns 503; zero partial commits. | `backend/src/infrastructure/postgres/pool.js`<br>`backend/src/infrastructure/postgres/migrate.js` |
| **Redis 7.4** | **Non-Authoritative** (Cache, Rate Limiting) | Safe fail-open; cache misses fall back to DB; sliding-window rate limiter falls back to bounded in-memory map; readiness reports 200 READY with `checks.redis: DOWN`. | `backend/src/infrastructure/redis/client.js`<br>`backend/src/infrastructure/redis/cacheService.js`<br>`backend/src/middleware/rateLimiter.js` |
| **RabbitMQ 3.13** | **Asynchronous Transport** (Outbox $\to$ Worker) | Transactional Outbox buffers events in PostgreSQL; dispatcher uses exponential backoff; evaluation consumer uses Quorum Queue Model A retries and dead-lettering; auto-reconnect hook. | `backend/src/infrastructure/rabbitmq/client.js`<br>`backend/src/infrastructure/rabbitmq/topology.js`<br>`backend/src/modules/outbox/`<br>`backend/src/modules/evaluation/` |
| **Transactional Outbox** | **Guaranteed At-Least-Once Delivery** | Poller claims batches via `SELECT ... FOR UPDATE SKIP LOCKED`, marks `PROCESSING`, and publishes. Unsent events survive broker crashes; stale locks recovered automatically. | `backend/src/modules/outbox/outbox.dispatcher.js`<br>`backend/src/modules/outbox/outbox.repository.js` |
| **Evaluation Worker** | **Asynchronous Idempotent Evaluation** | Consumes from `proctornet.evaluation.jobs`. Distinguishes transient vs permanent errors; checks attempt state for duplicate evaluation; commits score to DB before ACK. | `backend/src/modules/evaluation/evaluation.consumer.js`<br>`backend/src/modules/evaluation/evaluator.js` |
| **WebSocket Realtime** | **Transient Telemetry & Presence** | Transport ping/pong heartbeat; candidate disconnect triggers status broadcast; reconnect restores channel subscriptions without academic state disruption. | `backend/src/infrastructure/realtime/websocketServer.js`<br>`backend/src/infrastructure/realtime/channelManager.js` |
| **WebRTC / SFU** | **Live Proctoring Audio/Video** | Mediasoup worker pool; ICE connection state monitoring; worker process crash cleanup; candidate reconnects media pipeline independently of exam state. | `backend/src/infrastructure/media/sfuManager.js`<br>`backend/src/infrastructure/media/mediaSignaling.js` |
| **Storage (S3)** | **Durable Evidence Storage** | Presigned PUT URLs; client uploads direct to S3; server verifies cryptographic checksum upon confirmation; upload failure does not invalidate attempt. | `backend/src/infrastructure/storage/s3Storage.js`<br>`backend/src/modules/evidence/` |
| **Express Application** | **Modular Monolith HTTP Layer** | Graceful shutdown handler (10s force-kill safety timer) draining WebSockets, HTTP connections, outbox poller, evaluation consumer, RabbitMQ, Redis, and DB pool in strict order. | `backend/src/server.js`<br>`backend/src/app.js` |

---

## 3. Failure Taxonomy

The Phase 22 test harness explicitly injects and validates 16 discrete failure classes across the infrastructure and application stack:

```
+---------------------------------------------------------------------------------------------------+
|                                     PROCTORNET FAILURE TAXONOMY                                   |
+---------------------------------------------------------------------------------------------------+
|  [PROCESS & LIFECYCLE]       [STORAGE & STATE]            [MESSAGING & JOBS]     [REALTIME & NET] |
|  - Process crash (SIGKILL)   - PostgreSQL unreachable     - RabbitMQ outage      - WS disconnect  |
|  - Graceful stop (SIGTERM)   - DB pool exhaustion         - Outbox accumulation  - Network drop   |
|  - Container restart         - Redis outage               - Worker crash mid-job - WebRTC close   |
|  - Dependency boot order     - Disk/Storage pressure      - Evaluation backlog   - Rate limit hit |
+---------------------------------------------------------------------------------------------------+
|  [RESOURCE EXHAUSTION]       [APPLICATION DEGRADATION]                                            |
|  - CPU event-loop lag        - Partial subsystem degradation (e.g. Redis down, DB up)             |
|  - Memory pressure/GC        - Concurrent recovery storm (all services recovering at once)        |
+---------------------------------------------------------------------------------------------------+
```

1. **Application Process Failure**: Unhandled exception, process exit, SIGTERM graceful termination, or SIGKILL abrupt abortion during active answer saves or submission transactions.
2. **Container Restart**: Docker daemon or container stop/restart (`proctornet-backend`, `proctornet-postgres`, `proctornet-redis`, `proctornet-rabbitmq`) simulating host reboot or orchestrator container restart.
3. **PostgreSQL Unavailable**: Database service abruptly stopped, socket severed, or network partitioned during read/write queries.
4. **PostgreSQL Connection Exhaustion**: Connection pool max (`DB_POOL_MAX=10`) fully saturated with waiting queries; pool timeout (`DB_CONNECTION_TIMEOUT_MS=5000`) reached.
5. **Redis Unavailable**: Redis service down, connection refused (`ECONNREFUSED`), socket timeout during active autosaves, rate limit checks, or token verification.
6. **RabbitMQ Unavailable**: Broker connection dropped or broker offline during exam submission burst and outbox dispatch.
7. **Worker Crash**: Evaluation consumer process or message handler killed while actively scoring an exam attempt before ACK.
8. **Outbox Backlog**: Outbox events accumulating in PostgreSQL due to extended broker downtime, followed by burst drain.
9. **Evaluation Backlog**: Message backlog accumulation in RabbitMQ `proctornet.evaluation.jobs` queue, validating consumer processing under backlog pressure.
10. **WebSocket Interruption**: Abrupt socket closure, proxy disconnect, transport heartbeat failure (`wsHeartbeatTimeoutsTotal`), and subsequent reconnection.
11. **Network Interruption / Latency Spikes**: Simulated client-side flapping, delayed packets, and client timeout during REST API mutations.
12. **WebRTC / SFU Interruption**: Mediasoup worker crash or transport closure, verifying that media failures remain strictly isolated from exam submission.
13. **Disk Pressure**: Write failure simulation on persistent data volume, asserting graceful error handling and zero silent corruption.
14. **CPU Pressure & Event-Loop Lag**: Synthetic event-loop blocking workloads to verify health check responsiveness and timeout guards under compute contention.
15. **Memory Pressure**: Heap allocation stress to verify memory limits, lack of leaks in buffer/socket pools, and process resilience.
16. **Dependency Recovery & Partial Degradation**: Staggered recovery where subsystems recover in arbitrary order (e.g., Redis $\to$ RabbitMQ $\to$ PostgreSQL, or vice versa), asserting clean reconnection.

---

## 4. Recovery Expectations & Architectural Guarantees

For every failure scenario, ProctorNet enforces specific architectural invariants:

1. **Startup Recovery**: Services can start in any sequence. If Redis or RabbitMQ are unreachable at boot time, the backend starts successfully, registers reconnect hooks, and serves core academic requests.
2. **Automated Reconnection**:
   - Redis: Reconnection via bounded exponential backoff (capped at 3000ms).
   - RabbitMQ: Automatic reconnect loop with topology re-assertion and consumer re-registration (`registerReconnectHook`).
   - PostgreSQL: Connection pool creates replacement clients dynamically after network recovery.
3. **Retry Behavior with Exponential Backoff**:
   - Outbox dispatcher: Increments `retry_count`, calculates backoff ($2^{\text{retry\_count}} \times 2$s), and defers `next_retry_at`.
   - Evaluation worker: Employs Model A retry exchange with quorum queues and dead-letter routing after max retries.
4. **Idempotency Across All Layers**:
   - Answer autosave: Monotonic OCC revisions ($K \to K+1$). Replays of revision $K$ with matching payload return 200 without re-writing. Stale revisions reject with 409.
   - Submission: Mandatory `Idempotency-Key` header cached in `submission_idempotency` table. Repeated requests return cached result.
   - Evaluation: Attempt status check prevents double-scoring. If attempt is already evaluated, message is safely ACKed and discarded.
5. **Transactional Consistency & Atomicity**:
   - No partial database commits: Answer saves, attempt status updates, idempotency fingerprints, and outbox event creation occur in single atomic database transactions.
   - Durability before acknowledgement: HTTP 200/201 responses are returned **only** after disk commit.
6. **Outbox Durability**:
   - Outbox records are written to PostgreSQL before publishing to RabbitMQ. If RabbitMQ is down, outbox records remain safely buffered in `PENDING` or `FAILED` status.
7. **Zero Duplicate Business Effects**:
   - Exactly one academic score generated per candidate attempt.
   - Exactly one audit record per state transition.
   - Zero duplicated outbox side-effects.
8. **Graceful Subsystem Degradation**:
   - `/ready` returns 503 only when PostgreSQL is down. If Redis or RabbitMQ are down, `/ready` returns 200 READY with degraded component status reported.
   - Rate limiting fails open to in-memory sliding window when Redis is down.
   - Cache-aside returns `null` and queries PostgreSQL directly when Redis is down.
9. **Bounded Recovery Time**:
   - Reconnection and outbox queue draining occur within measurable, deterministic time thresholds ($< 15$ seconds post-restoration).
10. **Post-Recovery Data Integrity**:
    - 100% pass rate on all Phase 21 ACID integrity invariants after recovery.

---

## 5. Controlled Chaos Scenarios

Each chaos experiment is formally structured with isolated fixtures, clear injection mechanisms, explicit rollback/cleanup, and quantitative pass/fail thresholds:

### Scenario CH-01: Redis Outage During Active Autosave & Rate Limiting
- **Classification**: Non-destructive
- **Setup**: Active exam attempt with candidate saving answers every 2 seconds.
- **Fault Injection**: Abruptly close Redis client connection and reject subsequent Redis commands (`ECONNREFUSED`).
- **Expected Behavior**:
  - `cacheService.get` fails open (returns `null`), transparently falling back to PostgreSQL.
  - `cacheService.set` fails open (returns `false`) without throwing.
  - `createRateLimiter` switches to local in-memory sliding window; legitimate autosaves continue without interruption.
  - Candidate answer autosaves commit to PostgreSQL with HTTP 200 and incrementing OCC revisions.
  - `GET /ready` returns HTTP 200 with `checks.redis: DOWN`.
- **Observability Evidence**:
  - `redis_operations_total{status="error"}` increments.
  - Warning logs: `"Redis cache get failed; falling back to authoritative database"`.
  - Zero 500 Internal Server Errors in HTTP request metrics.
- **Rollback / Cleanup**: Re-enable Redis connection; verify Redis client reconnects and cache resumes.
- **Pass/Fail Criteria**: Zero dropped answers, zero 500 errors, 100% answer persistence verified in PostgreSQL.
- **Max Safe Duration**: 30 seconds.

---

### Scenario CH-02: RabbitMQ Outage During Synchronized Submission Surge
- **Classification**: Non-destructive
- **Setup**: 10 candidates concurrently submit completed exams with mandatory `Idempotency-Key` headers.
- **Fault Injection**: Disconnect RabbitMQ channel and sever broker connectivity prior to submission requests.
- **Expected Behavior**:
  - Submissions commit atomically in PostgreSQL (attempt status $\to$ `SUBMITTED`, answers locked, idempotency record written, outbox event inserted with status `PENDING`).
  - Candidate receives HTTP 200 with submission summary (`replay: false`).
  - Outbox dispatcher fails to publish to RabbitMQ, catches error, increments `retry_count`, and schedules exponential backoff.
  - Zero submission failures; zero unhandled promise rejections.
  - `GET /ready` returns HTTP 200 with `checks.rabbitmq: DOWN`.
- **Observability Evidence**:
  - `outbox_backlog_total` increases by 10.
  - Warning logs: `"Outbox publish failed; scheduling retry"`.
  - Zero database rollbacks on submissions.
- **Rollback / Cleanup**: Reconnect RabbitMQ; trigger outbox poller.
- **Pass/Fail Criteria**: All 10 attempts are marked `SUBMITTED`; all 10 outbox events are in PostgreSQL; candidates received HTTP 200.
- **Max Safe Duration**: 30 seconds.

---

### Scenario CH-03: RabbitMQ Restoration & Outbox Drain Recovery
- **Classification**: Non-destructive
- **Setup**: 10 `PENDING` outbox events buffered in PostgreSQL from Scenario CH-02.
- **Fault Injection**: Restore RabbitMQ broker connectivity and trigger reconnect handlers.
- **Expected Behavior**:
  - `registerReconnectHook` detects broker restoration and re-establishes confirm channels.
  - Outbox poller claims pending events via `SELECT ... FOR UPDATE SKIP LOCKED`.
  - All 10 events are published to RabbitMQ exchange `proctornet.events` and routed to `proctornet.evaluation.jobs`.
  - Outbox event statuses transition to `PUBLISHED` with `published_at` timestamp.
  - Background evaluation consumer processes all 10 jobs, executes deterministic scoring, and commits results to `results` table.
- **Observability Evidence**:
  - `outbox_backlog_total` decreases to 0.
  - `worker_evaluations_total{status="success"}` increments by 10.
  - `proctornet_outbox_events_total{status="published"}` increments by 10.
- **Rollback / Cleanup**: Reset consumer test hooks; verify queue depth is 0.
- **Pass/Fail Criteria**: Outbox backlog drains to 0; exactly 10 evaluation results exist in PostgreSQL; zero duplicate evaluations.
- **Max Safe Duration**: 45 seconds.

---

### Scenario CH-04: Evaluation Worker Crash Mid-Processing
- **Classification**: Non-destructive
- **Setup**: Single evaluation job published to `proctornet.evaluation.jobs`.
- **Fault Injection**: Simulate worker process crash / consumer channel abort while `evaluateAttempt` is actively executing before message ACK.
- **Expected Behavior**:
  - Unacknowledged message is returned to RabbitMQ queue by the broker (`basic.nack` with requeue or consumer disconnect).
  - Replacement evaluation consumer reconnects and picks up the re-queued message.
  - Evaluation consumer checks attempt evaluation status: if already evaluated, safely ACKs and discards; if uncompleted, executes evaluation to completion.
  - Exactly one final result row is committed to `results`.
- **Observability Evidence**:
  - Error logs: `"Consumer channel closed with in-flight message"`.
  - Subsequent success log: `"Attempt evaluated successfully"`.
- **Rollback / Cleanup**: Drain queue; clean up test attempt and results.
- **Pass/Fail Criteria**: Exactly 1 result row in PostgreSQL; attempt status is `EVALUATED`; zero duplicate score records.
- **Max Safe Duration**: 30 seconds.

---

### Scenario CH-05: PostgreSQL Connection Pool Saturation & Recovery
- **Classification**: Non-destructive
- **Setup**: PostgreSQL connection pool configured with `DB_POOL_MAX=5` for testing.
- **Fault Injection**: Artificially acquire and hold 5 pool clients with long-running transactions; execute a 6th client request.
- **Expected Behavior**:
  - 6th request waits in pool queue up to `DB_CONNECTION_TIMEOUT_MS` (2000ms).
  - When timeout expires, pool throws `timeout exceeded when trying to connect` error.
  - Endpoint handles error cleanly, returns HTTP 503 or 500 error response without crashing Node process.
  - When the 5 held clients are released, connection pool immediately recovers and processes subsequent queries with normal latency.
- **Observability Evidence**:
  - `db_pool_waiting` gauge spikes.
  - `db_pool_active` reaches 5.
  - Error logs capture connection acquisition timeout cleanly.
- **Rollback / Cleanup**: Release all acquired clients; reset pool to default configuration.
- **Pass/Fail Criteria**: Zero process crashes; pool recovers immediately upon client release; subsequent queries succeed with $< 10$ms latency.
- **Max Safe Duration**: 20 seconds.

---

### Scenario CH-06: Abrupt Backend Termination (SIGKILL) During In-Flight Answer Save
- **Classification**: Non-destructive
- **Setup**: Candidate initiates answer autosave transaction ($K \to K+1$).
- **Fault Injection**: Abruptly terminate worker/process via SIGKILL while the transaction is mid-flight before PostgreSQL `COMMIT`.
- **Expected Behavior**:
  - PostgreSQL detects backend socket disconnect and automatically issues `ROLLBACK` for the active transaction.
  - No partial answer rows or orphaned revision states remain in PostgreSQL.
  - Upon backend restart, candidate attempt remains at revision $K$.
  - Candidate retries autosave ($K \to K+1$); request succeeds cleanly.
- **Observability Evidence**:
  - PostgreSQL server logs: `"could not receive data from client: Connection reset by peer"`.
  - Transaction rollbacks increment in PostgreSQL statistics.
- **Rollback / Cleanup**: Restart backend process; verify database consistency.
- **Pass/Fail Criteria**: Database has zero corrupted rows; candidate can resume and save answers without OCC revision errors.
- **Max Safe Duration**: 30 seconds.

---

### Scenario CH-07: Docker Container Restart with EBS Volume Persistence
- **Classification**: Non-destructive
- **Setup**: Seeded exam attempt with 5 saved answers and 1 pending outbox event.
- **Fault Injection**: Execute `docker compose restart postgres` to simulate unexpected database container restart.
- **Expected Behavior**:
  - PostgreSQL container terminates and restarts cleanly using persistent named volume `pg_data`.
  - Backend pool detects broken connections, purges stale clients, and establishes fresh connections once PostgreSQL reports ready.
  - All previously committed data (users, attempts, answers, outbox events) remains 100% intact.
  - Ongoing requests during downtime fail fast with connection errors; requests after restart succeed immediately.
- **Observability Evidence**:
  - Backend logs: `"Unexpected error on idle PostgreSQL client"` followed by `"Database query failed"`.
  - Health check transitions: `/ready` returns 503 during downtime, then 200 READY after container reboot.
- **Rollback / Cleanup**: Verify container health check is passing (`pg_isready`).
- **Pass/Fail Criteria**: Zero data loss; all seeded answers and outbox events present; database recovers within 15 seconds.
- **Max Safe Duration**: 45 seconds.

---

### Scenario CH-08: Candidate WebSocket Abrupt Severance & Resumption
- **Classification**: Non-destructive
- **Setup**: Active candidate WebSocket connection subscribed to session proctoring and exam channel.
- **Fault Injection**: Forcefully destroy socket connection without sending clean close frame.
- **Expected Behavior**:
  - WebSocket server detects severed socket on transport ping/pong timeout (`wsHeartbeatTimeoutsTotal`).
  - Broadcaster updates candidate presence to `DISCONNECTED` and notifies assigned invigilator.
  - Candidate client reconnects, authenticates with access token, and re-subscribes.
  - Presence updates to `ACTIVE`; attempt question order and previously saved answers remain identical.
- **Observability Evidence**:
  - `ws_heartbeat_timeouts_total` increments.
  - Invigilator channel receives `CANDIDATE_DISCONNECTED` event.
  - Subsequent `CANDIDATE_CONNECTED` event received upon reconnection.
- **Rollback / Cleanup**: Close test sockets cleanly.
- **Pass/Fail Criteria**: Candidate can resume examination without lost state; presence accurately reflects real-time status.
- **Max Safe Duration**: 30 seconds.

---

### Scenario CH-09: Network Latency Jitter & Idempotent Submission Replay
- **Classification**: Non-destructive
- **Setup**: Candidate submits exam with `Idempotency-Key: test-key-100`.
- **Fault Injection**: Inject 1500ms network delay on submission response; simulate client timeout and subsequent retry with identical `Idempotency-Key` and payload.
- **Expected Behavior**:
  - First request commits attempt submission to PostgreSQL and records idempotency record.
  - Second request arrives: backend detects duplicate `(user_id, idempotency_key)` in `submission_idempotency` table.
  - Backend returns cached HTTP 200 response with `replay: true`.
  - Zero duplicate outbox events created; zero duplicate evaluations triggered.
- **Observability Evidence**:
  - Second request response includes `replay: true`.
  - Database query confirms exactly 1 row in `submission_idempotency` and 1 row in `outbox_events`.
- **Rollback / Cleanup**: Clean up test attempt.
- **Pass/Fail Criteria**: Exactly 1 submission committed; exactly 1 outbox event generated; replay returns identical payload.
- **Max Safe Duration**: 20 seconds.

---

### Scenario CH-10: Staggered Dependency Boot Order Independence
- **Classification**: Non-destructive
- **Setup**: All application and infrastructure containers stopped.
- **Fault Injection**: Start services in reverse order:
  1. Boot `proctornet-backend` (while DB, Redis, and RabbitMQ are offline).
  2. Boot `proctornet-redis`.
  3. Boot `proctornet-rabbitmq`.
  4. Boot `proctornet-postgres`.
- **Expected Behavior**:
  - Backend handles initial connection failures without uncaught crashes.
  - Readiness probe reports `NOT_READY` (503) until PostgreSQL is reachable.
  - Reconnection loops for Redis and RabbitMQ successfully connect once services become available.
  - Once PostgreSQL starts, `/ready` transitions to 200 READY.
  - Outbox poller and evaluation consumers initialize automatically.
- **Observability Evidence**:
  - Startup warning logs: `"Failed to connect to Redis"`, `"Failed to initialize RabbitMQ during server boot"`.
  - Recovery logs: `"Redis client connection established"`, `"RabbitMQ connected post-boot; evaluation consumer initialized"`.
  - Health endpoint transitions from 503 $\to$ 200.
- **Rollback / Cleanup**: Verify all services report healthy in Docker.
- **Pass/Fail Criteria**: System reaches fully operational state automatically without manual intervention or process restarts.
- **Max Safe Duration**: 60 seconds.

---

## 6. Safety Boundaries & Local Workstation Protection

Phase 21 demonstrated that the development workstation has finite OS socket and named-pipe capacity (Docker Desktop Linux VM pipe exhaustion at 250 VUs). To ensure development PC stability:

1. **Strict Concurrency Caps**:
   - Chaos experiments must **NEVER** run high concurrency (zero 100+ VU workloads during fault injection).
   - Maximum concurrency during chaos tests is capped at **5 to 10 VUs** or targeted sequential programmatic API calls.
2. **Explicit Execution Timeouts**:
   - Every chaos test script must enforce a strict timeout (maximum 15 to 45 seconds).
   - Test harnesses must implement `AbortController` and `setTimeout` fail-safes that guarantee cleanup.
3. **Automated Teardown & Rollback**:
   - Injected faults must be restored in `finally` blocks (or test `afterEach` hooks) regardless of test pass or fail.
   - If a test crashes, cleanup logic must restore mocked clients, release database locks, and reconnect services.
4. **No Destructive Database Commands**:
   - Tests must never issue `DROP DATABASE`, `DROP TABLE`, or destructive raw filesystem operations.
   - Test data must use isolated prefixed fixtures (`CHAOS_*`) and deterministic cleanup scripts.
5. **Mandatory Container & Process Identity Verification**:
   - Before every process or container fault injection, the harness must verify the target container/process identity, container name, compose/project context, and test-environment marker. If identity cannot be verified, abort the scenario immediately.
6. **No AWS Resource Allocation**:
   - Zero AWS API calls; zero AWS infrastructure provisioning. All tests run against local Docker containers.
7. **Kill Switch**:
   - All chaos runners must register `SIGINT` and `SIGTERM` handlers that immediately restore normal container state and release resources.

---

## 7. Comprehensive Failure Test Matrix

| # | Subsystem | Injected Fault | Expected User Behavior | Expected Backend Behavior | Expected DB Behavior | Expected Queue Behavior | Observability Signal | Recovery Requirement |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **PostgreSQL** | Connection severed mid-query | HTTP 500 with friendly error; exam state preserved | Logs DB error; discards broken pool client; acquires fresh client on next query | Discards uncommitted transaction; zero partial writes | N/A | `db_query_duration_seconds` error; error log emitted | Pool recovers within 3s of DB restoration |
| **2** | **PostgreSQL** | Pool saturation (`DB_POOL_MAX` exceeded) | Brief request queueing; HTTP 503 if timeout expires | Holds query up to `DB_CONNECTION_TIMEOUT_MS`; throws timeout error cleanly | Active transactions run to completion; no deadlocks | N/A | `db_pool_waiting` gauge spikes; timeout warning | Pool drains back to normal once clients released |
| **3** | **Redis** | Redis service down (`ECONNREFUSED`) | Seamless; autosave and token validation succeed | Fails open on cache; switches to in-memory sliding window rate limiter | Authoritative reads queried directly from PostgreSQL | N/A | `redis_operations_total{status="error"}` increments | Auto-reconnects with exponential backoff ($<3$s) |
| **4** | **Redis** | Slow Redis response ($> 2000$ms) | No noticeable lag; request completes | Command timeout expires; falls back to DB/in-memory | Serves request from DB | N/A | Latency histogram spike; warning log | Fallback activates without blocking HTTP thread |
| **5** | **RabbitMQ** | Broker down during submission | HTTP 200; submission successfully accepted | Commits submission + outbox in PostgreSQL; outbox dispatch retry backoff | Outbox event stored with `status='PENDING'` | N/A | `outbox_backlog_total` increases; warning log | Zero lost submissions; outbox drains upon broker recovery |
| **6** | **RabbitMQ** | Channel closed during publish | HTTP 200 (submission already committed) | Catches channel error; marks event for retry; re-establishes confirm channel | Event `retry_count` incremented; `next_retry_at` updated | Unsent message stays in outbox | `outbox_dispatch_duration` records failure | Channel recreated; event published on next dispatch |
| **7** | **Worker** | Consumer killed mid-evaluation | Candidate sees attempt as `SUBMITTED`; results delayed | Broker detects unacked message; requeues to quorum queue | No partial result committed; transaction rolls back | Message returned to `proctornet.evaluation.jobs` | Warning log: consumer disconnect | Replacement worker evaluates attempt idempotently |
| **8** | **Worker** | Poison message / malformed UUID | No user impact (system administrator alerted) | Distinguishes permanent error; routes to DLQ (`.dlq`) without retrying | Attempt remains untouched | Message routed to DLQ exchange | Error log: permanent failure; DLQ metric inc | DLQ message stored for inspection; queue unblocked |
| **9** | **Outbox** | Stale `PROCESSING` lock from crashed poller | No user impact | `recoverStaleProcessing` identifies locks older than 5m; resets to `PENDING` | Updates status from `PROCESSING` $\to$ `PENDING` | N/A | Log: `"Recovered N stale outbox events"` | Events claimed and dispatched in subsequent batch |
| **10** | **Realtime** | WebSocket socket abruptly severed | UI shows "Reconnecting..."; attempts background reconnect | Detects heartbeat timeout; prunes connection; notifies invigilator | Session record updated if status change | N/A | `ws_heartbeat_timeouts_total` increments | Client reconnects with JWT; subscriptions restored |
| **11** | **Network** | Duplicate submission request (idempotency replay) | Receives identical HTTP 200 with `replay: true` | Detects duplicate key in `submission_idempotency`; returns cached response | Zero duplicate rows; zero new outbox events | Zero duplicate messages | Info log: idempotent replay returned | Clean 200 OK without re-evaluating exam |
| **12** | **App Host** | SIGKILL during active answer autosave | Client receives network drop; retries autosave | Process terminates immediately; OS closes TCP sockets | PostgreSQL rolls back uncommitted transaction; zero partial rows | N/A | Server restart logged upon reboot | Client retries autosave; revision increments cleanly |
| **13** | **Container** | Database container restart | Temporary 503 during reboot; immediate 200 post-boot | Pool reconnects automatically; readiness recovers | Persistent volume `pg_data` preserves 100% of data | N/A | `/ready` probe transitions 503 $\to$ 200 | All seeded attempts and answers intact |
| **14** | **SFU Media** | Mediasoup worker process killed | Candidate video feed restarts; exam unaffected | SFU manager detects worker death; recreates worker from pool | N/A | N/A | Error log: Mediasoup worker died; worker respawned | Media signaling reconnects; zero academic data loss |
| **15** | **Memory** | Heap pressure simulation (high allocation) | Requests succeed with slight latency increase | Node GC manages memory; rejects requests if bounds exceeded | N/A | N/A | `nodejs_heap_size_used_bytes` metric spike | Process avoids OOM; memory normalizes after load |
| **16** | **Boot Order** | Reverse boot (Backend before DB/Redis/MQ) | Unavailable until DB is ready | Non-fatal boot; auto-reconnects to each service as it comes online | Normal schema upon DB availability | Topology asserted upon MQ online | Reconnect logs for all dependencies | Full system operational within 15s of DB startup |

---

## 8. Data-Integrity Invariant Verification Model

Phase 22 reuses and extends the Phase 21 data-integrity model to verify that chaos injection causes zero data corruption. The automated verifier (`scripts/chaos/verify-resilience-invariants.js`) checks 8 architectural invariants via parameterized SQL queries:

```sql
-- Invariant 1: Zero Orphan Answers
SELECT COUNT(*) AS count FROM answers a
LEFT JOIN attempt_questions aq ON a.attempt_question_id = aq.attempt_question_id
WHERE aq.attempt_question_id IS NULL;

-- Invariant 2: Zero Orphan Attempt Questions
SELECT COUNT(*) AS count FROM attempt_questions aq
LEFT JOIN exam_attempts ea ON aq.attempt_id = ea.attempt_id
WHERE ea.attempt_id IS NULL;

-- Invariant 3: Zero Duplicate Submission Idempotency Records
SELECT user_id, idempotency_key, COUNT(*) AS count
FROM submission_idempotency
GROUP BY user_id, idempotency_key
HAVING COUNT(*) > 1;

-- Invariant 4: Monotonic Answer OCC Revisions (No non-positive or corrupted revisions)
SELECT COUNT(*) AS count FROM answers WHERE answer_revision < 1;

-- Invariant 5: Zero Duplicate Completed Results
SELECT attempt_id, COUNT(*) AS count
FROM results
GROUP BY attempt_id
HAVING COUNT(*) > 1;

-- Invariant 6: Outbox Consistency (Submitted attempts must have an outbox event)
SELECT COUNT(*) AS count FROM exam_attempts ea
LEFT JOIN outbox_events oe ON ea.attempt_id = oe.aggregate_id AND oe.event_type = 'ATTEMPT_SUBMITTED'
WHERE ea.status = 'SUBMITTED' AND oe.event_id IS NULL;

-- Invariant 7: Outbox Status Integrity (Events must be PENDING, PROCESSING, PUBLISHED, or DEAD_LETTER)
SELECT COUNT(*) AS count FROM outbox_events
WHERE status NOT IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD_LETTER');

-- Invariant 8: Audit Log Immutability (Attempted UPDATE or DELETE must fail with SQLSTATE 20000)
-- Verified dynamically by attempting a test UPDATE on an audit log row inside a rolled-back transaction.
-- NOTE: The audit-log immutability check is an independent invariant asserting database-level trigger protection and does not by itself prove post-fault durability of business records.
```

---

## 9. Recovery Metrics & Verification Standards

The resilience test harness records empirical quantitative metrics for every failure scenario:

| Metric | Definition | Threshold / Pass Criterion |
| :--- | :--- | :--- |
| **Fault Detection Time** | Time elapsed between fault injection and backend error logging/status change | $\le 2.0$ seconds |
| **Fault Recovery Time** | Time elapsed between fault removal and full service restoration | $\le 5.0$ seconds |
| **Data Loss Count** | Total number of committed answers, attempts, or events lost during fault | **Strictly 0** |
| **Duplicate Business Effects** | Total duplicate results, double submissions, or extra outbox events created | **Strictly 0** |
| **Outbox Drain Rate** | Throughput of outbox event claiming and publishing upon broker restoration | $\ge 20$ events / second |
| **Error Rate Post-Recovery** | HTTP 5xx error percentage on requests executed after service restoration | **Strictly 0.0%** |
| **Latency Degradation Factor** | Ratio of p95 latency during degraded mode vs normal mode | $\le 2.5\times$ normal baseline |
| **Readiness Accuracy** | `/ready` correctly reports 503 on DB outage and 200 READY (with degraded check) on Redis/MQ outage | **100% compliance** |

---

## 10. Multi-Level Testing Implementation Strategy

Following the **Test Escalation Model** established in the governance directives, Phase 22 organizes tests into five distinct levels:

```
[LEVEL 1: Deterministic Unit & Failure-Path Tests] (In-memory mocks, < 5s)
   │
[LEVEL 2: Subsystem Fault & Client Resilience Tests] (Targeted live services, < 15s)
   │
[LEVEL 3: Integration Pipeline Resilience Tests] (Multi-component workflows, < 30s)
   │
[LEVEL 4: Controlled Container Chaos Scenarios] (Docker container pause/restart, < 60s)
   │
[LEVEL 5: Broader Multi-Fault Combinations] (Compound failure scenarios, gated)
```

### Level 1: Deterministic Unit & Failure-Path Tests
- In-memory mock fault injection (simulating `ECONNREFUSED`, `ETIMEDOUT`, channel closures, corrupted payloads).
- Fast, non-networked tests validating:
  - `cacheService` safe fail-open methods (`get`, `set`, `del`).
  - `rateLimiter` in-memory fallback switching on Redis error.
  - `evaluation.consumer` permanent vs transient error classification and DLQ routing.
  - `outbox.dispatcher` exponential backoff calculation.
  - `anomalyScorer` and schema validators rejecting malformed payloads.

### Level 2: Subsystem Fault Tests
- Targeted integration tests against live local PostgreSQL, Redis, and RabbitMQ containers:
  - Database pool saturation test (`DB_POOL_MAX=5` acquisition and queue timeout).
  - Outbox dispatcher batch claiming with `SKIP LOCKED` under forced publish failure.
  - RabbitMQ topology recovery and confirm channel recreation.
  - Redis connection drop and auto-reconnect behavior.

### Level 3: Integration Pipeline Resilience Tests
- End-to-end failure injection during active business flows:
  - Answer autosave with OCC under live Redis outage (validates DB write + rate limit fallback).
  - Synchronized submissions with live RabbitMQ outage (validates DB commit + outbox accumulation).
  - Stale outbox lock recovery and batch publish after broker restoration.
  - Idempotent submission replay under high simulated network jitter.

### Level 4: Controlled Container Chaos Scenarios
- Automated chaos runner script (`scripts/chaos/run-resilience-suite.js`) manipulating local Docker containers:
  - Container stop/restart (`proctornet-postgres`, `proctornet-redis`, `proctornet-rabbitmq`).
  - Readiness probe validation before, during, and after container restart.
  - Post-restart ACID invariant verification.

### Level 5: Compound Failure Scenarios (Gated & Isolated)
- Compound scenarios executed only after Levels 1–4 pass:
  - Simultaneous Redis + RabbitMQ outage during active exam session (verifies PostgreSQL handles both answer writes and outbox buffering with zero data loss).
  - Reverse dependency boot order test.
- **Level 5 Execution Rule**: Level 5 is executed only if Levels 1–4 pass and the workstation, test environment, and individual fault recoverability remain within all safety limits. Level 5 may be skipped with documented justification and does not automatically imply a failed phase.

---

## 11. Concrete Deliverables

The Phase 22 implementation will produce the following concrete deliverables:

```
proctornet/
├── docs/
│   ├── PHASE_22_IMPLEMENTATION_PLAN.md                     <-- (This authoritative plan)
│   └── resilience/
│       ├── RESILIENCE_AND_CHAOS_REPORT.md                  <-- Comprehensive empirical findings & recovery evidence
│       └── ARCHITECTURAL_FINDINGS_AND_RECOMMENDATIONS.md    <-- Identified bottlenecks & horizontal scaling insights
├── backend/
│   └── tests/
│       └── resilience/
│           ├── redisChaos.integration.test.js              <-- Redis outage, fail-open cache, in-memory rate limiting
│           ├── rabbitmqChaos.integration.test.js           <-- RabbitMQ broker downtime, outbox backlog, reconnect
│           ├── postgresChaos.integration.test.js           <-- Pool saturation, connection timeout, transaction rollback
│           ├── workerChaos.integration.test.js             <-- Consumer crash mid-job, DLQ routing, idempotent retry
│           ├── processLifecycleChaos.integration.test.js   <-- Graceful shutdown, SIGTERM/SIGKILL, state recovery
│           └── realtimeChaos.integration.test.js           <-- WebSocket heartbeat timeout, disconnect, resumption
└── scripts/
    └── chaos/
        ├── chaos-harness.js                                <-- Core fault injection & recovery monitoring utility
        ├── verify-resilience-invariants.js                 <-- Automated 8/8 ACID/resilience invariant audit script
        ├── run-resilience-suite.js                         <-- Main execution orchestrator with safety guardrails
        └── scenarios/
            ├── scenario-redis-outage.js                    <-- Automated CH-01 runner
            ├── scenario-rabbitmq-outage.js                 <-- Automated CH-02 & CH-03 runner
            ├── scenario-pool-saturation.js                 <-- Automated CH-05 runner
            └── scenario-container-restart.js               <-- Automated CH-07 runner
```

---

## 12. Definition of Done (DoD)

Phase 22 adheres strictly to the project-wide 11-step lifecycle:

1. **PLAN**: Authoritative Phase 22 implementation plan authored and reviewed against architecture specifications.
2. **REVIEW PLAN**: Plan presented to the user for formal feedback and review.
3. **APPROVE PLAN**: Plan explicitly approved by the user before executing any implementation.
4. **IMPLEMENT**: Test suites, chaos runner harnesses, and invariant verification scripts implemented in logical batches without altering core architecture.
5. **TEST**:
   - Level 1: `node --check` syntax validation clean across all scripts.
   - Level 2: Deterministic failure-path unit tests passing.
   - Level 3: Subsystem integration resilience tests passing.
   - Level 4: Controlled chaos scenarios executed with zero host unresponsiveness.
   - Level 5: 8/8 ACID data-integrity invariants verified passing.
   - Full regression: Existing backend and frontend test suites pass cleanly.
6. **CODE REVIEW**: Formal code review for security, secret leakage, workstation safety, and architectural compliance.
7. **COMMIT**: Single coherent implementation commit following Conventional Commits (`feat(resilience): implement phase 22 failure, resilience and chaos testing suite`).
8. **PR**: Pull request opened against `main` documenting scope, methodology, failure matrix, and integrity results.
9. **REVIEW PR**: Formal PR review conducted.
10. **MERGE**: PR merged into `main`.
11. **MARK COMPLETE**: `docs/DEVELOPMENT_PLAN.md` updated with merge details; Phase 22 marked COMPLETE. Execution stops.

---

## 13. Fast-Development Optimization Strategy

In accordance with the **Fast Development Without Quality Compromise** directive:

- **Intelligent Staging**: Implementation proceeds in batches (Harnesses & Invariant Checker $\to$ Level 1/2 Tests $\to$ Level 3/4 Chaos Scenarios $\to$ Reporting).
- **Targeted Test Execution**: Run targeted resilience tests (`node --test tests/resilience/redisChaos.integration.test.js`) during active coding; do not execute full backend/frontend regression until the implementation is stable.
- **Cached Verified Results**: Existing passing suites (Phase 1–21) are cached and not re-executed repeatedly during chaos test authoring.
- **Controlled Chaos Execution**: Chaos scenarios are executed in a single, deliberate sequence with safety bounds rather than repeated speculative runs.
- **Batched Documentation**: The empirical resilience report (`docs/resilience/RESILIENCE_AND_CHAOS_REPORT.md`) is authored once post-execution, preventing continuous document churn.
- **No Premature Architecture Expansion**: All findings are documented as empirical observations for future scaling phases (Phase 32) without prematurely introducing distributed complexity (Kubernetes, multi-region, distributed transactions).

---

> **PLAN APPROVAL GATE**: Awaiting user review and formal approval. Implementation, test execution, and chaos scenarios will NOT proceed until explicit authorization is granted.
