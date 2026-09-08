# ProctorNet Re-Architecture — Master Development Plan

## Project Implementation Status

```
+-------------------------------------------------------------------------+
| Current Phase:     Phase 21                                             |
| Current Milestone: Load Testing & Concurrency Benchmarking              |
| Status:            Complete (Merged in PR #19, Merge 32e07a7)           |
| Master Plan:       Reconstructed & Expanded (Phases 0–34)               |
| Next Milestone:    Phase 22 — Failure, Resilience & Chaos Testing       |
+-------------------------------------------------------------------------+
```

### Standard Implementation Workflow
Every phase and milestone must strictly follow this lifecycle:
$$\text{Plan} \longrightarrow \text{Implement} \longrightarrow \text{Test} \longrightarrow \text{Review} \longrightarrow \text{Commit} \longrightarrow \text{Pull Request} \longrightarrow \text{Merge} \longrightarrow \text{Mark Complete} \longrightarrow \text{Next Phase}$$

- **No phase may be silently skipped.**
- **No speculative implementation of future phases.**

---

## Phased Implementation Sequence

### Phase 0 — Repository & Development Foundation
- [x] **Status:** Completed
- **Objective:** Establish the foundational repository structure, development governance, architectural source of truth, git branching strategy, and documentation framework.
- **Dependencies:** None
- **Major Tasks:**
  - Create directory structure (`frontend/`, `backend/`, `infrastructure/`, `docs/`).
  - Author `docs/ARCHITECTURE.md` derived from the finalized specification.
  - Author `docs/DEVELOPMENT_PLAN.md` with complete 25-phase tracking.
  - Author `docs/DEVELOPMENT_RULES.md` defining development and git discipline.
  - Initialize `docs/ADR/` for Architecture Decision Records.
  - Initialize `docs/TESTING/` with overall testing strategy.
- **Acceptance Criteria:**
  - Repository contains full governance docs and placeholder project scaffolding.
  - No application business code is written prematurely.
  - Git remote, branch protections, and Conventional Commits standards are established.
- **Tests Required:** Repository structure validation, markdown linting, git branch verification.

---

### Phase 1 — Backend Foundation
- [x] **Status:** Completed
- **Objective:** Initialize the Node.js 24 LTS + Express backend service with JavaScript (ES Modules), configuration management, environment validation, error handling, and structured logging.
- **Dependencies:** Phase 0
- **Major Tasks:**
  - Initialize `backend/` workspace with Node.js 24 LTS baseline, `"type": "module"`, and JavaScript ES Modules (`.js` files).
  - Configure ESLint, Prettier, and code standards.
  - Implement centralized configuration loader with strict environment variable validation (using Zod or Joi).
  - Implement standardized HTTP response format, custom error classes, and global error middleware.
  - Implement structured JSON logging (e.g., Winston / Pino) with request correlation IDs.
  - Configure health check endpoints (`/healthz`, `/live`, `/ready`).
- **Acceptance Criteria:**
  - Backend server boots cleanly in development mode.
  - Invalid environment configurations fail fast at startup with explicit error messages.
  - Health checks respond with accurate system status.
  - Zero TypeScript dependencies or configuration present.
- **Tests Required:** Unit tests for config validation, error middleware, and health check integration tests.

---

### Phase 2 — Database & Migrations
- [x] **Status:** Completed
- **Objective:** Setup PostgreSQL connection pooling, migration toolchain, baseline schema creation, and database utilities.
- **Dependencies:** Phase 1
- **Major Tasks:**
  - Select and configure database migration tool (e.g., node-pg-migrate / Knex / Prisma / Kysely).
  - Configure PostgreSQL client connection pool with retry logic and lifecycle management.
  - Write baseline database migration covering core tables: users, roles, permissions, audit_logs.
  - Create transactional outbox schema table (`outbox_events`).
  - Setup database seed scripts for local development and integration testing.
- **Acceptance Criteria:**
  - Migrations run forward and rollback cleanly without errors.
  - Database pool handles transient connection drops gracefully.
- **Tests Required:** Migration up/down integration tests, connection pool connectivity tests.

---

### Phase 3 — Core Domain & State Machines
- [x] **Status:** Completed
- **Objective:** Model core domain entities, value objects, and deterministic state machines for exams, attempts, question workflows, and evaluation status.
- **Dependencies:** Phase 2
- **Major Tasks:**
  - Define domain enums and types (`ExamStatus`, `AttemptStatus`, `QuestionType`, `EvaluationStatus`).
  - Implement deterministic state machine for authoritative `Exam` lifecycle (`DRAFT` $\to$ `PUBLISHED` $\to$ `SCHEDULED` $\to$ `LIVE` $\to$ `ENDED` $\to$ `EVALUATED` $\to$ `RESULT_PUBLISHED`).
  - Implement deterministic state machine for authoritative `Attempt` lifecycle (`READY` $\to$ `ACTIVE` $\to$ `SUBMITTED` / `TERMINATED` / `EXPIRED`).
  - Implement question invariant validation for `MCQ`, `TRUE_FALSE`, and `NUMERIC` types.
  - Implement domain invariant validators preventing illegal state transitions and unauthorized answer mutations.
- **Acceptance Criteria:**
  - State machines reject invalid transitions with domain-specific exceptions (`InvalidStateTransitionError`, `DomainInvariantError`).
  - Core domain logic has zero external I/O or network dependencies (pure domain logic).
- **Tests Required:** Comprehensive unit tests covering all valid and invalid state machine transitions, invariants, and question types.

---

### Phase 4 — Authentication & Authorization
- [x] **Status:** Completed
- **Objective:** Implement secure candidate, proctor, and administrator authentication, password hashing, JWT/session management, and RBAC/ABAC authorization.
- **Dependencies:** Phase 3
- **Major Tasks:**
  - Implement password hashing using bcrypt with constant-time verification.
  - Implement user registration, login, token refresh, and logout endpoints.
  - Implement JWT token issue and verification with strict claims and expiration.
  - Implement resource-level authorization middleware (`authenticate`, `requireRole`, `requireOwnership`, `requireResourceScope`).
  - Add brute-force protection and account lockout mechanics (5 attempts threshold, 15m duration).
- **Acceptance Criteria:**
  - Unauthorized requests are rejected with `401 Unauthorized`.
  - Resource access across unauthorized roles/users is rejected with `403 Forbidden`.
  - Authentication tokens are securely signed and verified.
- **Tests Required:** Auth unit tests, token expiration tests, RBAC/ABAC boundary integration tests, account lockout tests.

---

### Phase 5 — Exams, Sessions & Assignments
- [x] **Status:** Completed
- **Objective:** Build exam authoring, blueprint rules, publishing, session scheduling, candidate roster management, and invigilator assignment modules.
- **Dependencies:** Phase 4
- **Major Tasks:**
  - Migration 012 adding authoritative exam creator ownership (`created_by`) and subject relationship (`subject_id`).
  - Exam creation, draft modification, topic rules configuration, and publishing lifecycle validation (`POST /api/v1/exams`, `POST /api/v1/exams/:id/publish`).
  - Strict domain invariants: draft mutability restriction (`assertExamCanBeMutated`), passing marks vs total marks, blueprint balancing, and question bank inventory validation.
  - Multi-session exam scheduling (`POST /api/v1/sessions`): first session transitions `PUBLISHED -> SCHEDULED`; subsequent sessions maintain `SCHEDULED`.
  - Authoritative server-time window validation (`scheduled_end_time > scheduled_start_time` and duration enforcement).
  - Transactional room capacity management (`SELECT ... FOR UPDATE` on `rooms`) with deduplication during candidate roster assignments (`POST /api/v1/sessions/:id/students`).
  - Invigilator assignments (`POST /api/v1/sessions/:id/invigilators`) with role checking (`FACULTY`, `INVIGILATOR`, `ADMIN`).
  - Full audit trail logging into `audit_logs`.
- **Acceptance Criteria:**
  - Instructors and Admins can create exams, configure topic rules, and publish them after automated blueprint verification.
  - Sessions can be scheduled with room capacity checks, candidate enrollments, and invigilator assignments.
  - All operations enforce strict RBAC and creator ownership boundaries.
- **Tests Implemented:** 40+ unit and integration tests across `examService.test.js`, `examApi.test.js`, `sessionService.test.js`, `sessionApi.test.js`. Full test suite: 180/180 passing.

---

### Phase 6 — Attempts & Question Mapping
- [x] **Status:** Completed
- **Objective:** Implement candidate exam initialization, attempt creation, deterministic question mapping, authoritative server timing, and attempt resumption.
- **Dependencies:** Phase 5
- **Major Tasks:**
  - Verified and utilized finalized Migration 008 (`exam_attempts`, `attempt_questions`) and Migration 010 indexes.
  - Implement `POST /api/v1/sessions/:id/attempts` (and alias `POST /api/v1/attempts/start`) with candidate-only authorization and strict idempotency.
  - Deterministic question permutation and selection per candidate using Mulberry32 PRNG and MurmurHash3_32 seed (`hash(sessionId:studentId:topicId)`).
  - Strict mapping invariants: total count equals blueprint rules, contiguous display order `1..N`, and zero duplicate `question_id`.
  - Authoritative PostgreSQL timing and deadline calculation (`expires_at = LEAST(CURRENT_TIMESTAMP + duration, scheduled_end_time)`).
  - Lazy on-access `ACTIVE -> EXPIRED` lifecycle transition on retrieval.
  - Hierarchical lock ordering (`exam_sessions` -> `exams` -> `session_students` -> `exam_attempts`) preventing deadlocks.
  - Defense-in-depth duplicate attempt protection with PostgreSQL error code 23505 rollback and recovery.
  - Sanitized question endpoints (`GET /api/v1/attempts/:id`, `GET /api/v1/attempts/:id/questions`, `GET /api/v1/sessions/:id/my-attempt`) stripping answers and solution metadata with BOLA protection.
- **Acceptance Criteria:**
  - 10 concurrent clicks on "Start Exam" result in exactly one attempt record and one mapping set with identical responses (idempotent).
  - Attempt start fails if time window has not opened or has passed.
  - Question ordering is securely stored and consistent upon candidate reconnect/resume.
  - Zero answer leakage to candidate.
- **Tests Implemented:** 33 unit and integration tests across `attemptService.test.js` and `attemptApi.test.js`. Full test suite: 213/213 passing.

---

### Phase 7 — Answers, Autosave & Concurrency
- [x] **Status:** Completed
- **Objective:** Implement resilient, atomic, concurrency-safe answer persistence with revision sequence tracking, revision-aware payload-based retries, OCC clear-answer deletion, attempt-level locking, authoritative deadline enforcement, and all-or-nothing batch autosave.
- **Dependencies:** Phase 6
- **Major Tasks:**
  - Utilized existing schema from Migration 008 (`answers`) and Migration 010 indexes with zero new migrations required.
  - Implemented `PUT /api/v1/attempts/:attemptId/answers/:attemptQuestionId` with strict OCC revision semantics:
    - Unanswered question requires `expected_revision = 0`, inserting row with `revision = 1`.
    - Answered question at revision $K$ requires `expected_revision = K`, updating row to `revision = K + 1`.
    - Repeated save with `expected_revision = K - 1` and identical payload is handled idempotently as a network retry and returns existing committed revision $K$ without incrementing.
    - Stale or mismatched revision rejects with `409 Conflict` (`STALE_REVISION_CONFLICT`).
  - Implemented OCC-governed clear-answer deletion (`DELETE /api/v1/attempts/:attemptId/answers/:attemptQuestionId`):
    - Requires `{ "expected_revision": K }`, deleting row and returning `200 OK` (`cleared: true`).
    - Unanswered question clear with `expected_revision = 0` is safe and idempotent.
    - After deletion, question returns to unanswered state (`answered = row exists; unanswered = no row`); next save requires `expected_revision = 0` to create `revision = 1`.
  - Implemented atomic batch autosave (`POST /api/v1/attempts/:attemptId/answers/batch`):
    - Entire batch executes within a single PostgreSQL transaction (`BEGIN ... COMMIT`).
    - Duplicate `attempt_question_id` entries inside a batch are rejected with `400 Bad Request` (`BAD_REQUEST`), modifying zero database rows.
    - Deterministic sorting by `attempt_question_id` for predictable execution.
    - If any single item fails validation or encounters an OCC conflict, the entire batch executes `ROLLBACK` (all-or-nothing atomicity; zero partial commits).
  - Authoritative PostgreSQL server timing (`CURRENT_TIMESTAMP`) for `saved_at` and `server_time`; client timestamps strictly excluded from write DTOs.
  - Attempt-level row locking (`SELECT ... FROM exam_attempts WHERE attempt_id = $1 FOR UPDATE`) serializing answer writes within an attempt, eliminating races against deadlines or state changes.
  - Authoritative deadline expiration check: if `CURRENT_TIMESTAMP >= expires_at`, transitions attempt to `EXPIRED`, logs `ATTEMPT_EXPIRED` audit entry, commits expiration, and rejects save/clear with `409 Conflict` (`ATTEMPT_EXPIRED`).
  - Question-type semantic validation for MCQ, TRUE_FALSE (option existence check in `question_options`), and NUMERIC (finite number check) with zero solution leakage (`is_correct`, `correct_numeric_value` stripped).
  - BOLA defense restricting answer writes strictly to the candidate owner (`STUDENT` role) while allowing owner, creator faculty, assigned invigilator, and admin to inspect answers (`GET /api/v1/attempts/:attemptId/answers`).
- **Acceptance Criteria:**
  - Every answer save is durably committed to PostgreSQL before HTTP `200 OK` is returned.
  - Stale revision saves do not overwrite newer revisions.
  - Answer writes and clears are rejected immediately with `409 Conflict` if attempt is not `ACTIVE` or deadline has elapsed.
  - Batch saves commit atomically or roll back completely.
- **Tests Implemented:** 39 unit and integration tests across `answerService.test.js` and `answerApi.test.js`. Full test suite: 252/252 passing across 60 suites.

---

### Phase 8 — Submission, Outbox & Evaluation
- [x] **Status:** Completed
- **Objective:** Implement atomic, idempotent exam submission, transactional outbox event creation, and asynchronous objective evaluation trigger.
- **Dependencies:** Phase 7
- **Major Tasks:**
  - Migration 013 creating `outbox_events` and `submission_idempotency`.
  - Implemented `POST /api/v1/attempts/:attemptId/submit` endpoint with mandatory `Idempotency-Key` and optional final dirty answer persistence under OCC rules.
  - Implemented atomic, durable submission transaction transition (`ACTIVE -> SUBMITTED`), authoritative deadline enforcement (`ATTEMPT_EXPIRED`), and outbox event publishing (`ATTEMPT_SUBMITTED`).
  - Implemented Transactional Outbox dispatcher, in-process polling worker, exponential backoff retries, and asynchronous EvaluationWorker.
  - Implemented objective evaluation logic for MCQ, TRUE_FALSE, and NUMERIC questions, persisting scores and answer counts into `results`.
- **Acceptance Criteria:**
  - Submission transitions attempt state to `SUBMITTED` atomically; duplicate submissions return cached response idempotently.
  - Post-submission answer writes are strictly impossible.
  - Outbox event is reliably written to PostgreSQL with business data and processed asynchronously.
- **Tests Implemented:** 45 tests across `submissionService.test.js`, `submissionApi.test.js`, `outboxDispatcher.test.js`, `evaluator.test.js`, `evaluationWorker.test.js`. Full test suite: 297/297 passing.

---

### Phase 9 — Results
- [x] **Status:** Completed
- **Objective:** Implement exam result publication, candidate visibility policies, staff results inspection, aggregated summary statistics, and policy immutability.
- **Dependencies:** Phase 8
- **Major Tasks:**
  - Migration 014 adding `results_release_policy`, `results_release_at`, and `results_published_at` to `exams`.
  - Implemented candidate result endpoint `GET /api/v1/attempts/:attemptId/result` with strict BOLA defense, attempt status checks, and authoritative PostgreSQL primary visibility predicates.
  - Implemented Immediate Visibility Invariant: `IMMEDIATE` policy requires exam status `ENDED`, `EVALUATED`, or `RESULT_PUBLISHED` before candidate visibility is granted, preventing score leakage during `LIVE` exams.
  - Implemented Scheduled Visibility: `SCHEDULED` policy grants candidate visibility once exam has concluded and authoritative PostgreSQL `transaction_timestamp() >= results_release_at`.
  - Implemented staff results inspection (`GET /api/v1/exams/:examId/results`) and aggregated summary statistics (`GET /api/v1/exams/:examId/results/summary`) with dual-layer scoping for Invigilators (`sessionId` + `session_invigilators` SQL join), Faculty Owners, and Admins.
  - Implemented manual administrative publication (`POST /api/v1/exams/:examId/results/publish`) with state machine validation and idempotent completion.
  - Implemented release policy mutation (`PATCH /api/v1/exams/:examId/results/policy`) with strict immutability once results have become candidate-visible (`409 RESULT_ALREADY_RELEASED`).
- **Acceptance Criteria:**
  - Candidates cannot view results while exam is `LIVE` or until policy/publication conditions are satisfied.
  - Release policy is strictly immutable once candidates have gained visibility.
  - Summary statistics accurately aggregate attempts, evaluations, pass/fail counts, and score averages without skew from unevaluated attempts.
  - All staff endpoints strictly enforce role and session scoping.
- **Tests Implemented:** 54 unit and integration tests across `resultsVisibility.test.js`, `resultsApi.test.js`, `resultsAuth.test.js`, `resultsSummary.test.js`, `resultsConcurrency.test.js`. Full test suite: 351/351 passing across 83 suites.

---

### Phase 10 — Frontend
- [x] **Status:** Completed
- **Objective:** Build the production-grade React 19 SPA covering Candidate Exam UI, Proctor Monitoring Dashboard, Faculty Assessment & Authoring, and Administrator Overview.
- **Dependencies:** Phase 9
- **Major Tasks:**
  - Initialized React 19 SPA with modern tooling (Vite 6, React Router DOM v7, Vitest, React Testing Library, jsdom) in `frontend/`.
  - Established light-first modern SaaS design system with CSS custom properties across 4 visual density tiers (Marketing/Auth, Dashboard, Exam Workspace, Proctoring).
  - Implemented centralized API client (`api/client.js`) with in-memory access token storage, 401 transparent refresh token rotation interceptor, and strict `localStorage` restriction to UI preferences (`theme`).
  - Implemented Candidate Examination Portal: session listing, pre-exam readiness check, sanitized question renderer for dynamic $N$ questions (MCQ, True/False, Numeric), visual tabular countdown timer with server drift calibration, 1,000ms debounced autosave with in-memory retry buffer and OCC revision tracking, and floating network loss banner.
  - Implemented Idempotent Submission: unified manual submission and automatic expiry-triggered submission with mandatory `Idempotency-Key` header; single UUID reused across network retries. Codified OFFLINE != SUBMITTED with accurate non-durable in-memory warning copy and mandatory backend `200 OK` confirmation.
  - Implemented Candidate Results Scorecard: translates Phase 9 visibility matrix states (200 released scorecard, 403 pending release, 404 grading with manual refresh button, 409 active attempt, 403 BOLA denied) without answer key leakage.
  - Implemented Faculty Assessment Portal: draft exam authoring, topic rule composition with difficulty and points balancing, blueprint freezing, session scheduling with campus rooms, student roster enrollment, invigilator assignments, results summary KPIs, manual publication trigger, and release policy modal.
  - Implemented Invigilator Proctoring Console: assigned sessions listing, real-time candidate attempt state tracking (`READY`, `ACTIVE`, `SUBMITTED`, `EXPIRED`), and session-scoped results inspection with zero administrative controls.
  - Implemented Administrator Portal: global system counts, active session monitoring, and cross-exam oversight.
- **Acceptance Criteria:**
  - Frontend builds cleanly with zero errors (`vite build` in 928ms).
  - Countdown timer synchronizes with server time and locks inputs locally at zero.
  - Autosave debounces at 1,000ms and resolves OCC revisions seamlessly.
  - Offline banner warns candidate that unsynchronized answers reside in memory only.
  - Final submission sends mandatory UUID `Idempotency-Key` and reuses same key on retries.
  - Backend confirmation (`200 OK`) is strictly required before displaying submitted state.
  - All 351 baseline Phase 0–9 backend tests pass without regression.
- **Tests Implemented:** 25 unit and integration tests across 10 test files (`QuestionRenderer`, `TimerDisplay`, `QuestionNavigator`, `AutosaveIndicator`, `useExamTimer`, `useAutosave`, `LoginPage`, `ExamTakingPage`, `CandidateResultPage`, `FacultyResultsPage`). All 25 tests passing. Full backend regression: 351/351 passing across 83 suites.

---

### Phase 11 — Redis
- [x] **Status:** Completed
- **Objective:** Integrate Redis for non-authoritative caching, rate-limiting tokens, session blacklist, and distributed locks.
- **Dependencies:** Phase 10
- **Major Tasks:**
  - Setup managed persistent Redis client wrapper with connection pooling, reconnect retry backoff, graceful shutdown, and health checks.
  - Implemented sliding-window rate limiting middleware for sensitive endpoints (`/api/v1/auth/login`, `/api/v1/attempts/:id/answers`, `/api/v1/attempts/:id/submit`) using atomic Redis Lua scripts with local in-memory fallback.
  - Implemented token blacklist caching for instant session revocations with fail-closed semantics on dual-store outages.
  - Implemented transient cache-aside layer for published exam blueprints (`v1:exam:{examId}`) and active attempt sanitized question bundles (`v1:attempt:{attemptId}:questions`) with dynamic attempt deadline-bounded TTL.
  - Fallback mechanisms ensuring complete system functionality even if Redis experiences temporary outages.
- **Acceptance Criteria:**
  - High-traffic read requests are served from Redis cache.
  - Redis failure does not crash the API or cause data loss for critical writes.
  - Authoritative data remains strictly in PostgreSQL; candidate scorecards and summaries are 100% uncached.
- **Tests Implemented:** 50 unit, integration, and fallback tests across `redisClient.test.js`, `cacheService.test.js`, `examCacheAside.test.js`, `questionCacheAside.test.js`, `rateLimiter.unit.test.js`, `rateLimiter.integration.test.js`, `tokenBlacklist.test.js`, `authRevocationFallback.test.js`, `redisFallback.test.js`. Full regression: 404/404 backend passing, 25/25 frontend passing. ADR-0001 approved.

---

### Phase 12 — RabbitMQ & Workers
- [x] **Status:** Completed
- **Objective:** Implement reliable outbox poller, RabbitMQ exchange/queue topologies, dead-letter exchanges, decoupled worker consumers, broker reconnect consumer restoration, and graceful in-flight evaluation draining.
- **Dependencies:** Phase 11
- **Major Tasks:**
  - Setup RabbitMQ connection manager (`client.js`) using approved `amqplib` 0.10.x (`^0.10.5`), URL precedence, bounded reconnection retry backoff, test runner detection, reconnect lifecycle hook registry (`registerReconnectHook`), and clean graceful shutdown.
  - Asserted complete RabbitMQ topology: 3 durable direct exchanges (`proctornet.events`, `proctornet.retry`, `proctornet.dlx`), 4 Quorum Queues (`proctornet.evaluation.jobs`, `proctornet.evaluation.retry.1` [5,000ms TTL], `proctornet.evaluation.retry.2` [15,000ms TTL], `proctornet.evaluation.dlq`) with `x-dead-letter-strategy: 'at-least-once'` and `x-overflow: 'reject-publish'`.
  - Implemented `RabbitMQEventTransport` publishing CloudEvents 1.0 compliant envelopes using `publishConfirmed` with `mandatory: true`, unroutable return handling, and auto-recovering cached ConfirmChannels.
  - Integrated dual-trigger outbox dispatcher (immediate post-commit `setImmediate` trigger + periodic background poller and stale lock recovery).
  - Implemented idempotent evaluation consumer (`evaluation.consumer.js`) adhering strictly to Model A retry semantics (Tier 0 initial, Tier 1 5s TTL, Tier 2 15s TTL, then DLQ quarantine; broker redeliveries distinct from application retry counts; ACK strictly after PostgreSQL result commit; confirmed forwarding before original ACK).
  - Implemented automatic consumer restoration upon RabbitMQ reconnect (`restoreEvaluationConsumer`) with idempotent consumer tag cancellation to prevent duplicate consumers.
  - Implemented explicit in-flight evaluation tracking (`inFlightHandlers`) and graceful shutdown drain with 5,000ms bounded timeout, rejecting new deliveries during shutdown while letting in-flight evaluations finish.
  - Wired startup topology assertion, poller, and consumer into `server.js` with graceful shutdown hooks.
  - Verified non-fatal RabbitMQ health check in `GET /ready`.
- **Acceptance Criteria:**
  - Events published to outbox are reliably delivered to RabbitMQ queues with publisher confirms and mandatory routing verification.
  - Failed worker tasks are retried with tiered TTL delays and routed to DLQ upon exhaustion.
  - Re-delivered messages are processed idempotently without duplicate scoring.
  - Broker disconnection and reconnect automatically restores worker consumers without duplicate consumers.
  - Graceful shutdown stops accepting deliveries, drains in-flight evaluations up to 5000ms, and closes channels only after completion or timeout.
  - Zero message loss across worker crashes, channel drops, and network partitions.
  - Full backward compatibility: falls back to `InProcessEventTransport` when `RABBITMQ_ENABLED=false`.
- **Tests Implemented:** 66 unit, integration, live broker, resilience, and E2E tests across `rabbitmqConfig.test.js`, `rabbitmqClient.test.js`, `topology.test.js`, `outboxTransport.test.js`, `evaluationConsumer.test.js`, `brokerSemantics.integration.test.js`, `rabbitmqResilience.test.js`, `e2eOutboxWorker.integration.test.js`. Full regression: 470/470 backend passing across 111 suites, 25/25 frontend passing. ADR-0002 approved.

---

### Phase 13 — Observability & Audit
- [x] **Status:** Completed
- **Objective:** Implement comprehensive structured logging, Prometheus metrics, W3C distributed trace context propagation, and database-enforced append-only audit logging.
- **Dependencies:** Phase 12
- **Major Tasks:**
  - Integrated in-process Prometheus metrics (`prom-client` v15) exposing `GET /metrics` with optional scraper token authentication (`METRICS_AUTH_TOKEN`) and zero blocking DB queries.
  - Implemented HTTP duration and request counters with route template normalization (`normalizeRoute`), eliminating high-cardinality label explosion (zero UUIDs in labels).
  - Instrumented custom operational metrics: DB pool gauges, DB query latency, answer autosave latency, OCC revision conflict counters, outbox backlog gauges/dispatch histograms, evaluation worker duration/outcome counters, and Redis hit/miss/error telemetry.
  - Implemented W3C Trace Context recommendation (`traceContext.js`) with 32-hex traceId and 16-hex spanId validation/generation, and HTTP ingress correlation middleware emitting `X-Request-ID` and `traceparent`.
  - Propagated distributed trace context through transactional outbox into AMQP CloudEvent message headers (`traceparent`, `x-correlation-id`) and worker consumer logger child contexts.
  - Created Migration 015 enforcing append-only immutability on `audit_logs` via row trigger (`BEFORE UPDATE OR DELETE`) and statement trigger (`BEFORE TRUNCATE`) raising SQLSTATE `20000`.
  - Built centralized audit module (`src/modules/audit/`) with transactional client support, metadata sanitization, and admin inspection endpoint (`GET /api/v1/audit-logs`) with RBAC enforcement.
  - Instrumented comprehensive authentication auditing (`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOCKOUT_TRIGGERED`, `AUTH_LOGOUT`, `AUTH_SESSION_REVOKED`).
  - Authored and approved ADR-0003.
- **Acceptance Criteria:**
  - Metrics endpoint (`/metrics`) exposes actionable operational counters and histograms without executing synchronous DB queries.
  - Critical administrative, academic, and authentication actions are recorded in immutable audit logs with actor identity and timestamp.
  - Prohibited mutations (`UPDATE`, `DELETE`, `TRUNCATE`) on `audit_logs` are strictly rejected at the database level with SQLSTATE `20000`.
  - Foreign key entity deletions cannot mutate or anonymize audit records.
  - Zero raw UUIDs or PII leak into Prometheus metric label dimensions.
- **Tests Implemented:** 36 dedicated unit and integration tests across `metrics.test.js`, `traceContext.test.js`, `auditImmutability.test.js`, `auditService.test.js`, `auditApi.test.js`. Full regression: 506/506 backend passing across 124 suites, 25/25 frontend passing across 10 suites. ADR-0003 approved.

---

### Phase 14 — Proctoring Events
- [x] **Status:** Complete (Merged to main — PR #15)
- **Objective:** Implement automated client-side violation detection (tab switch, window blur, keyboard shortcuts, multi-display) and server ingestion.
- **Dependencies:** Phase 13
- **Major Tasks:**
  - Database migration `016_proctoring_events_and_flags.js` for `exam_attempts.risk_score`, `violation_events` client correlation, and `violation_flags`.
  - Server-authoritative event taxonomy and deterministic anomaly scoring (`anomalyScorer.js`).
  - Strict tamper-proof validation and privacy boundaries (`proctoring.schemas.js`).
  - Batch event ingestion endpoint (`POST /api/v1/attempts/:attemptId/events`) with Redis sliding-window rate limiter (60 req/min).
  - Attempt violation timeline (`GET /api/v1/attempts/:attemptId/events`) and session proctoring summary (`GET /api/v1/sessions/:sessionId/proctoring/summary`).
  - Manual flag creation and review lifecycle (`ACTIVE -> REVIEWED/DISMISSED`) with centralized transactional audit logging (`PROCTOR_FLAG_CREATED`, `PROCTOR_FLAG_REVIEWED`).
  - Reused Phase 13 Prometheus metrics (`proctornet_proctoring_events_total`, `proctornet_proctoring_ingest_duration_seconds`, `proctornet_proctoring_flags_total`).
  - Frontend telemetry hook (`useProctoringEvents.js`) and invigilator monitoring UI integration.
- **Acceptance Criteria:**
  - Server-authoritative scoring strictly isolated from academic evaluation.
  - Database-backed idempotency on `(attempt_id, client_event_id)` with row-level locking for concurrency safety.
  - Zero raw clipboard, keystroke, video, or audio data captured.
- **Tests Implemented:** 39 dedicated unit and integration tests across 8 suites (`anomalyScoring.test.js`, `proctoringValidation.test.js`, `proctoringIngestion.test.js`, `proctoringIdempotency.test.js`, `proctoringFlags.test.js`, `proctoringAtomicity.test.js`, `proctoringConcurrency.test.js`, `proctoringRbac.test.js`). 3 frontend hook tests. Full regression: 545/545 backend tests passing across 132 suites, 28/28 frontend tests passing across 11 suites. ADR-0004 approved.

---

### Phase 15 — Evidence Storage
- [x] **Status:** Complete (Merged in PR #16)
- **Objective:** Implement secure, direct-to-S3 evidence uploads (webcam snapshots, screen captures, audio) with signed URLs and metadata verification.
- **Dependencies:** Phase 14
- **Major Tasks:**
  - Database migrations for `evidence_records` (S3 key, bucket, content type, SHA-256 hash, size).
  - Implement `POST /api/attempts/:id/evidence/upload-url` generating short-lived AWS S3 pre-signed PUT URLs.
  - Implement `POST /api/attempts/:id/evidence/confirm` confirming successful upload with cryptographic checksum validation.
  - Implement secure signed URL generation for proctor evidence playback.
- **Acceptance Criteria:**
  - Heavy binary media uploads bypass the application server and upload directly to S3.
  - Unauthorized users cannot upload or download evidence artifacts.
- **Tests Required:** S3 pre-signed URL generation tests, evidence confirmation validation tests, tamper verification tests.

---

### Phase 16 — WebSocket
- [x] **Status:** Complete (Merged in PR #17)
- **Objective:** Build the real-time WebSocket control plane for proctoring alerts, candidate heartbeats, and room signaling.
- **Dependencies:** Phase 15
- **Major Tasks:**
  - Setup WebSocket server (e.g., `ws` or `Socket.io`) with JWT handshake authentication.
  - Implement Redis Pub/Sub adapter for horizontal multi-node WebSocket scaling.
  - Implement room multiplexing (`exam:<id>`, `room:<id>`, `student:<id>`).
  - Implement candidate periodic heartbeat and connection status broadcast (online, offline, reconnecting).
  - Implement proctor announcement broadcast and one-to-one candidate messaging.
- **Acceptance Criteria:**
  - Socket connections authenticate securely during handshake.
  - Message broadcasting across multiple server nodes functions seamlessly via Redis pub/sub.
  - Candidate disconnects are detected and surfaced on the proctor dashboard within seconds.
- **Tests Required:** WebSocket auth tests, multi-client room broadcast tests, disconnection detection tests.

---

### Phase 17 — WebRTC & SFU
- [x] **Status:** Complete (Merged in PR #18, Commit 11b1c5b, Merge a72240f)
- **Objective:** Implement WebRTC media streaming via a dedicated Selective Forwarding Unit (SFU) for live multi-candidate video/audio proctoring.
- **Dependencies:** Phase 16
- **Major Tasks:**
  - Integrate SFU media server (mediasoup v3) as an isolated media gateway with bounded worker scaling and deterministic session pinning.
  - Implement SFU signaling transport over WebSocket with 64 KB ceiling and dedicated token bucket rate limiting (240 msg/min, burst 60).
  - Candidate media publisher pipeline (webcam, microphone, screen share) with simulcast and hardware track cleanup (`stopMediaStream`).
  - Proctor multi-stream subscriber pipeline with 12-candidate grid pagination, muted-by-default audio, solo listening, and VU meters.
  - Complete isolation between SFU media traffic, PostgreSQL business logic, and RabbitMQ evaluation workers.
  - Coturn ephemeral credentials generated via HMAC-SHA1 with 900-second (15 minutes) TTL and mandatory production TURN validation.
  - ADR-0007 approved and indexed.
- **Acceptance Criteria:**
  - Proctors can view multiple simultaneous candidate video/audio streams with low latency.
  - Heavy media transport has zero performance impact on core database or answer autosaves.
  - Isolated per-worker crash recovery with generation fencing prevents cross-session cascading failures.
- **Tests Implemented:** 57 backend media tests across 9 test files (23 sub-suites); 19 frontend media tests across 4 files; Full regression: 704/704 backend tests passing, 56/56 frontend tests passing, clean production build.

---

### Phase 18 — Security Hardening
- [x] **Status:** Complete (Merged in PR #19, Commit 5b27370, Merge 5b247e7)
- **Objective:** Perform thorough application security hardening, penetration defense, rate limiting, header security, and data sanitization.
- **Dependencies:** Phase 17
- **Major Tasks:**
  - Configure Helmet for secure HTTP headers (CSP, HSTS 1-year maxAge with preload, X-Content-Type-Options nosniff, X-Frame-Options DENY, COOP, CORP, COEP, Permissions-Policy).
  - Enforce strict CORS policies restricted to authorized origin whitelist (`CORS_ALLOWED_ORIGINS`) with `credentials: true`.
  - Implement non-destructive structural input sanitization (`sanitizeInputMiddleware`) preventing prototype pollution (`__proto__`, `constructor`, `prototype`) and null-byte (`\0`) injection without corrupting candidate code/math answers.
  - Audit database queries against SQL injection (enforce parameterized queries and identifier allowlists; map Postgres `22P02` to HTTP 400).
  - Implement anti-tampering cryptographic validation (`HMAC-SHA256` token derivation, canonical body digest, WebCrypto client signing, Redis atomic replay prevention with fail-closed production semantics).
  - Validate binary file signatures (magic bytes) for 6 allowed evidence MIME types (JPEG, PNG, WebP, WebM, OGG, WAV) via S3 HTTP Range requests (`bytes=0-15`).
  - Register Prometheus security metrics (`security_tamper_violations_total`, `security_input_sanitizations_total`, etc.) and structured security audit logging.
  - Author and index ADR-0008 (`docs/ADR/0008-application-security-hardening-cryptographic-anti-tampering.md`).
- **Acceptance Criteria:**
  - Automated security scans pass with zero high or critical vulnerabilities.
  - OWASP Top 10 vulnerabilities are systematically mitigated.
  - Cryptographic tampering and replay attacks are rejected before business logic execution.
  - Student code submissions and mathematical formulas remain 100% uncorrupted.
- **Tests Implemented:** 46 backend security tests across 7 test files (`backend/tests/security/`); 7 frontend anti-tamper client tests; Full regression: 750/750 backend tests passing, 63/63 frontend tests passing, clean production build (0 errors).

---

### Phase 19 — Containerization & Deployment
- [x] **Status:** Complete (Merged in PR #20, Implementation Commit a4152f7, Merge cbf3089, Completion Date 2026-09-08)
- **Objective:** Establish production-grade multi-stage containerization, local orchestration, single-host AWS EC2 delivery pipeline, and automated GitHub Actions CI/CD workflows.
- **Dependencies:** Phase 18
- **Major Tasks:**
  - Author multi-stage, production-optimized `backend/Dockerfile` (`node:24-bookworm-slim`) compiling native `mediasoup-worker` in builder, running deterministic `npm prune --omit=dev`, and enforcing non-root `USER node` (UID 1000).
  - Author multi-stage `frontend/Dockerfile` (`node:24-alpine` -> `nginxinc/nginx-unprivileged:alpine`, UID 101) with fallback self-signed certificates for syntax validation prior to Let's Encrypt host mounts.
  - Implement dual Nginx virtual hosts: `frontend/nginx/default.local.conf` for local development on port 8080 (without TLS redirect) and `frontend/nginx/default.conf` for production (ACME challenge, 301 HTTPS redirect, TLS termination on 8443, and reverse proxying to `http://host.docker.internal:4000`).
  - Author `docker-compose.yml` orchestrating the 8-service local integration stack with cold-start dependency ordering (`postgres` -> `backend-migrate` -> `backend` -> `frontend`), restricted WebRTC port forwarding (`40000–40050/udp`), and host-networked Coturn.
  - Author `infrastructure/docker-compose.prod.yml` for single-host AWS EC2 deployment defining 7 services with host networking for backend and Coturn, loopback-only persistence (`127.0.0.1`), internal-only port 4000, and fail-closed secrets (`${VAR:?VAR is required}`).
  - Implement host deployment script `infrastructure/deploy.sh` executing targeted replacement workflow (`pull` -> `migrate` -> `up -d --no-deps frontend` -> `up -d --no-deps backend` -> readiness polling).
  - Implement systemd unit `infrastructure/proctornet.service` and backup script `infrastructure/backup-db.sh`.
  - Implement GitHub Actions CI pipeline `.github/workflows/ci.yml` with parallel stages, dynamic migration verification, negative devDependency assertion, and Trivy security auditing.
  - Author and index ADR-0009 (`docs/ADR/0009-containerization-topology-multistage-builds-host-networked-sfu-and-single-host-delivery.md`).
- **Acceptance Criteria:**
  - `docker compose up -d` spins up the complete local environment, with all 7 runtime services achieving healthy status and `backend-migrate` exiting with code 0.
  - Production runtime backend image strictly excludes devDependencies (`vitest`, `supertest`, `c8`).
  - Production secrets fail closed when missing. External port 4000 is blocked from `0.0.0.0/0`.
  - TLS private keys strictly enforce mode `0640` owned by `root:101`; world-readable mode `0644` is prohibited.
  - Deployment replacement ordering uses `--no-deps` for targeted replacement without restarting databases.
  - Zero database migrations created in Phase 19; automatic database rollback is strictly excluded.
- **Tests Implemented:** Full regression: 750/750 backend tests passing across 185 suites, 63/63 frontend Vitest tests passing, Vite production build compiled cleanly in 3.81s, Docker Buildx multi-stage image builds, negative devDependency leak assertion passed (0 leaks), 8-service Compose smoke test passed with all 7 services healthy and `backend-migrate` exiting with code 0, `/ready` probe verified (HTTP 200), React SPA HTML served (HTTP 200), API reverse proxy verified (HTTP 401 JSON), LocalStack S3 bucket creation verified, Coturn STUN RFC 5780 probe verified, and production Compose config validated.

---

### Phase 20 — AWS Infrastructure
- [x] **Status:** Complete (Merged in PR #21, Implementation Commit ee823d8, Merge 466bcae, Completion Date 2026-09-08)
- **Objective:** Define declarative Infrastructure as Code using Terraform >= 1.9.0 for AWS cloud deployment, establishing a single-host modular monolith EC2 baseline with persistent EBS storage, S3 remote state with native lockfiles, least-privilege IAM, CloudWatch observability, and scale-ready managed service boundaries.
- **Dependencies:** Phase 19
- **Major Tasks:**
  - Author S3 remote state bootstrap with native S3 lockfile locking (`use_lockfile = true`) and zero DynamoDB state locks (`terraform/bootstrap/`).
  - Implement AWS VPC module (`10.0.0.0/16`) with dual AZ public and private subnets, Internet Gateway, and zero NAT Gateways for cost-conscious single-host deployment (`terraform/modules/vpc/`).
  - Implement security groups strictly isolating port 4000 and persistence ports (5432, 6379, 5672) while permitting edge HTTP (80), HTTPS (443), Coturn (3478, 49152–49250/udp), SFU (40000–49999/udp), and restricted SSH (`terraform/modules/security_groups/`).
  - Author least-privilege EC2 IAM roles for S3 evidence/backups, SSM Parameter Store (`/proctornet/{environment}/*`), and CloudWatch agent metrics/logging (`terraform/modules/iam/`).
  - Provision dedicated S3 evidence and backup buckets with AES256 encryption, public access block, bucket ownership controls, and server-authoritative retention per ADR-0005 (`terraform/modules/s3/`).
  - Implement EC2 module (`c6i.xlarge` prod, `t3.large`/`xlarge` staging) on Ubuntu 24.04 LTS with IMDSv2 enforced, encrypted gp3 root volume, encrypted persistent gp3 EBS volume (`prevent_destroy = true`) mounted at `/opt/proctornet/data`, and cloud-init bootstrap template (`terraform/modules/ec2/`).
  - Author CloudWatch log groups with retention policies, log metric filters, and CloudWatch alarms for high CPU (>85%), memory (>85%), and disk space (>85%) (`terraform/modules/cloudwatch/`).
  - Author scale-ready managed service modules for RDS PostgreSQL 16, ElastiCache Redis 7, and Application Load Balancer gated behind default-disabled feature flags (`enable_* = false`) (`terraform/modules/{rds,elasticache,alb}/`).
  - Configure staging (`terraform/environments/staging/`) and production (`terraform/environments/production/`) environment roots with S3 backends and variable templates.
  - Implement secure SSM secret fetching utility (`infrastructure/fetch-secrets.sh`) enforcing mode `0600` permissions owned by `root:root` with fail-closed validation.
  - Update database backup script (`infrastructure/backup-db.sh`) with automated S3 sync (`--sse AES256`) while preserving local 30-day retention pruning.
  - Implement GitHub Actions CI workflow (`.github/workflows/terraform.yml`) enforcing `terraform fmt`, `tflint`, `checkov`, `terraform validate`, and invariant assertions.
  - Implement automated invariant test script (`scripts/verify-infrastructure-invariants.js`) asserting 6 architectural invariants.
  - Author and index ADR-0010 (`docs/ADR/0010-declarative-aws-infrastructure-single-host-delivery-baseline-and-managed-service-migration-boundaries.md`).
- **Acceptance Criteria:**
  - `terraform validate` executes cleanly across bootstrap, staging, and production roots.
  - S3 remote state uses native lockfile locking (`use_lockfile = true`); zero DynamoDB state lock tables in active codebase.
  - Ephemeral containers with persistent EBS storage (`/opt/proctornet/data`) safeguarded with `prevent_destroy = true`.
  - Zero NAT Gateways; public subnets with Internet Gateway routing.
  - Public ingress strictly limited; port 4000 and persistence ports (5432, 6379, 5672) strictly blocked from `0.0.0.0/0`.
  - Scale-ready modules (RDS, ElastiCache, ALB) disabled by default (`false`).
  - Server-authoritative S3 evidence retention (no automated expiration deleting current objects).
  - Exactly 17 database migrations remain intact (no new migrations).
  - SSM secret fetching fails closed if mandatory secrets are missing.
- **Tests Implemented:**
  - `terraform fmt -check -recursive`: PASS (0 formatting issues).
  - `tflint --recursive`: PASS (0 warnings, 0 errors across 11 directories).
  - `terraform validate`: PASS (bootstrap, staging, and production configurations valid).
  - Checkov static security analysis: PASS (30 passed checks, 0 failed, 19 skipped with justified rationale).
  - Automated invariant assertions (`node scripts/verify-infrastructure-invariants.js`): PASS (6/6 rules verified).
  - Shell script syntax verification (`bash -n`): PASS on deploy.sh, backup-db.sh, and fetch-secrets.sh.
  - Production Docker Compose configuration validation: PASS (`docker compose -f infrastructure/docker-compose.prod.yml config`).
  - Frontend Vitest suite: PASS (63/63 tests passing across 18 test files).
  - Frontend Vite production build: PASS (compiled cleanly in 3.61s).

---

### Phase 21 — Load Testing & Concurrency Benchmarking
- [x] **Status:** Complete (Merged in PR #19, Implementation Commit e657876, Merge 32e07a7, Completion Date 2026-09-08)
- **Objective:** Validate answer autosave throughput, submission burst handling, connection pool saturation limits, and Redis/RabbitMQ resource headroom under staged concurrent workloads.
- **Dependencies:** Phase 20
- **Major Tasks:**
  - Author k6 load testing suite simulating candidate login bursts, periodic autosave contention, synchronized submission surges, connection pool saturation, and complete candidate lifecycles (`scripts/load/k6/`).
  - Implement isolated benchmark data fixtures and deterministic teardown scripts (`scripts/load/seed-benchmark-data.js`, `scripts/load/cleanup-benchmark-data.js`).
  - Implement dynamic candidate authentication, anti-tamper signing, and metrics collection harnesses (`scripts/load/k6/k6-helpers.js`, `scripts/load/collect-metrics.js`, `scripts/load/run-official-tier.js`).
  - Implement post-benchmark ACID data integrity validation (`scripts/load/verify-data-integrity.js`).
  - Execute staged local benchmarks across 25, 50, 100, 150, and 250 VU tiers on the local development environment.
  - Profile and document system performance, concurrency bottlenecks (telemetry pool contention), and capacity constraints in `docs/benchmarks/CAPACITY_AND_SCALING_REPORT.md`.
  - Abandon AWS Phase 21 execution to protect AWS credits, remove temporary AWS benchmark credentials/resources, and mark AWS execution guides as superseded.
- **Acceptance Criteria & Final Outcome:**
  - **Limited Local Benchmark Only**: Results are environment-specific to the local development machine and do not establish AWS `c6i.xlarge` capacity, production capacity, or a Safe Operating Capacity (SOC). Phase 21 did not execute the original 500–2,500 VU AWS tiers.
  - **25 VUs**: **SUSTAINABLE** (zero errors, p95 autosave 31.8ms, pool utilization 30%).
  - **50 VUs**: **DEGRADED** (p95 autosave 114.7ms, p95 submission 845.5ms).
  - **100 VUs**: **DEGRADED** (p95 autosave 197.6ms, p95 submission 1,518.7ms).
  - **150 VUs**: **SATURATION** / maximum successfully completed local tier (p95 autosave 277.1ms, p95 submission 2,238.9ms; not sustainable for production).
  - **250 VUs**: **ABORTED** due to local workstation / Docker named-pipe socket exhaustion (`//./pipe/dockerDesktopLinuxEngine`).
  - **Data Integrity**: 7/7 ACID/concurrency invariants passed across completed tiers (zero orphan records, zero duplicate submission idempotency keys, zero deadlocks, monotonic OCC revisions).
- **Tests Implemented & Validated:**
  - k6 benchmark scenarios: `login-burst.js`, `autosave-contention.js`, `submission-surge.js`, `pool-saturation.js`, `full-exam-lifecycle.js`, `proctoring-telemetry.js`, `smoke-test.js`.
  - Integrity audit script: `node scripts/load/verify-data-integrity.js` (7/7 invariants passed).
  - Syntax validation: `node --check` passed across all 14 benchmark scripts.
  - Regression validation: Frontend Vitest (63/63 passed), Backend Domain tests (69/69 passed), Frontend Vite build passed.

---

### Phase 22 — Failure, Resilience & Chaos Testing
- [x] **Status:** Complete (Merged to main — PR #20, Merge Commit: 5909dc6d46e8fdea5c63cc3d98f32dac6dc92b33)
- **Objective:** Verify system resilience, data durability, and automated recovery during unexpected subsystem outages, network partitions, container crashes, and database connection pool saturation.
- **Dependencies:** Phase 21
- **Major Tasks:**
  - Build automated chaos harness (`scripts/chaos/chaos-harness.js`) with mandatory container identity verification (`verifyTargetIdentity`), auto-timeouts, and emergency kill switches.
  - Implement 8/8 data-integrity and ACID invariant auditor (`scripts/chaos/verify-resilience-invariants.js`).
  - Create isolated, deterministic test fixtures (`scripts/chaos/fixtures.js`) protecting production/baseline data.
  - Implement Level 1 & 2 deterministic unit/subsystem resilience test suites across Redis, RabbitMQ, PostgreSQL, Worker, Process Lifecycle, and Realtime WebSocket modules (28/28 tests passing).
  - Implement Level 3 multi-component integration resilience test suite (`integrationWorkflows.resilience.test.js`) covering autosave under Redis outage, outbox buffering under broker outage, outbox backlog drain, worker deduplication, and submission replay.
  - Execute Level 4 controlled Docker chaos scenarios (CH-01 through CH-10) with quantitative Fault Detection Time and Fault Recovery Time metric collection.
  - Conditionally execute Level 5 compound multi-fault scenario (simultaneous Redis + RabbitMQ outage during active examination).
  - Publish comprehensive empirical results in `docs/resilience/RESILIENCE_AND_CHAOS_REPORT.md` and architectural recommendations in `docs/resilience/ARCHITECTURAL_FINDINGS_AND_RECOMMENDATIONS.md`.
- **Acceptance Criteria & Final Outcome:**
  - **11/11 Chaos Scenarios Passed** (100% compliance across all primary and compound scenarios).
  - **PostgreSQL Authoritative State Durability**: PostgreSQL Authoritative State remains consistent and durable under the defined Phase 22 failure scenarios, with zero observed committed-data loss or corruption.
  - **Fault Detection Time**: Max observed 1503ms (Threshold $\le 2000$ms).
  - **Fault Recovery Time**: Max observed 317ms (Threshold $\le 5000$ms).
  - **Committed Data Loss**: Strictly 0 records lost across all failure and compound scenarios.
  - **Duplicate Business Effects**: Strictly 0 duplicate score records, submission rows, or outbox events.
  - **8/8 Data & ACID Invariants Passed**: Zero orphan answers, zero orphan questions, zero duplicate idempotency keys, monotonic OCC revisions, zero duplicate results, outbox event consistency, outbox status integrity, and independent audit log immutability trigger protection.
- **Tests Implemented & Validated:**
  - Unit/Subsystem Resilience Suites: 28/28 passed across 7 suites (`tests/resilience/*.test.js`).
  - Master Chaos Suite: 11/11 scenarios passed in 21.38s (`scripts/chaos/run-resilience-suite.js`).
  - Data Invariant Auditor: 8/8 invariants passed (`scripts/chaos/verify-resilience-invariants.js`).
  - Full Regression: Backend Domain tests (60/60 passed), Frontend Vitest (63/63 passed), Frontend Vite build passed, `git diff --check` passed cleanly.
---

### Phase 14 — Proctoring Events
- [x] **Status:** Complete (Merged to main — PR #15)
- **Objective:** Implement automated client-side violation detection (tab switch, window blur, keyboard shortcuts, multi-display) and server ingestion.
- **Dependencies:** Phase 13
- **Major Tasks:**
  - Database migration `016_proctoring_events_and_flags.js` for `exam_attempts.risk_score`, `violation_events` client correlation, and `violation_flags`.
  - Server-authoritative event taxonomy and deterministic anomaly scoring (`anomalyScorer.js`).
  - Strict tamper-proof validation and privacy boundaries (`proctoring.schemas.js`).
  - Batch event ingestion endpoint (`POST /api/v1/attempts/:attemptId/events`) with Redis sliding-window rate limiter (60 req/min).
  - Attempt violation timeline (`GET /api/v1/attempts/:attemptId/events`) and session proctoring summary (`GET /api/v1/sessions/:sessionId/proctoring/summary`).
  - Manual flag creation and review lifecycle (`ACTIVE -> REVIEWED/DISMISSED`) with centralized transactional audit logging (`PROCTOR_FLAG_CREATED`, `PROCTOR_FLAG_REVIEWED`).
  - Reused Phase 13 Prometheus metrics (`proctornet_proctoring_events_total`, `proctornet_proctoring_ingest_duration_seconds`, `proctornet_proctoring_flags_total`).
  - Frontend telemetry hook (`useProctoringEvents.js`) and invigilator monitoring UI integration.
- **Acceptance Criteria:**
  - Server-authoritative scoring strictly isolated from academic evaluation.
  - Database-backed idempotency on `(attempt_id, client_event_id)` with row-level locking for concurrency safety.
  - Zero raw clipboard, keystroke, video, or audio data captured.
- **Tests Implemented:** 39 dedicated unit and integration tests across 8 suites (`anomalyScoring.test.js`, `proctoringValidation.test.js`, `proctoringIngestion.test.js`, `proctoringIdempotency.test.js`, `proctoringFlags.test.js`, `proctoringAtomicity.test.js`, `proctoringConcurrency.test.js`, `proctoringRbac.test.js`). 3 frontend hook tests. Full regression: 545/545 backend tests passing across 132 suites, 28/28 frontend tests passing across 11 suites. ADR-0004 approved.

---

### Phase 15 — Evidence Storage
- [x] **Status:** Complete (Merged in PR #16)
- **Objective:** Implement secure, direct-to-S3 evidence uploads (webcam snapshots, screen captures, audio) with signed URLs and metadata verification.
- **Dependencies:** Phase 14
- **Major Tasks:**
  - Database migrations for `evidence_records` (S3 key, bucket, content type, SHA-256 hash, size).
  - Implement `POST /api/attempts/:id/evidence/upload-url` generating short-lived AWS S3 pre-signed PUT URLs.
  - Implement `POST /api/attempts/:id/evidence/confirm` confirming successful upload with cryptographic checksum validation.
  - Implement secure signed URL generation for proctor evidence playback.
- **Acceptance Criteria:**
  - Heavy binary media uploads bypass the application server and upload directly to S3.
  - Unauthorized users cannot upload or download evidence artifacts.
- **Tests Required:** S3 pre-signed URL generation tests, evidence confirmation validation tests, tamper verification tests.

---

### Phase 16 — WebSocket
- [x] **Status:** Complete (Merged in PR #17)
- **Objective:** Build the real-time WebSocket control plane for proctoring alerts, candidate heartbeats, and room signaling.
- **Dependencies:** Phase 15
- **Major Tasks:**
  - Setup WebSocket server (e.g., `ws` or `Socket.io`) with JWT handshake authentication.
  - Implement Redis Pub/Sub adapter for horizontal multi-node WebSocket scaling.
  - Implement room multiplexing (`exam:<id>`, `room:<id>`, `student:<id>`).
  - Implement candidate periodic heartbeat and connection status broadcast (online, offline, reconnecting).
  - Implement proctor announcement broadcast and one-to-one candidate messaging.
- **Acceptance Criteria:**
  - Socket connections authenticate securely during handshake.
  - Message broadcasting across multiple server nodes functions seamlessly via Redis pub/sub.
  - Candidate disconnects are detected and surfaced on the proctor dashboard within seconds.
- **Tests Required:** WebSocket auth tests, multi-client room broadcast tests, disconnection detection tests.

---

### Phase 17 — WebRTC & SFU
- [x] **Status:** Complete (Merged in PR #18, Commit 11b1c5b, Merge a72240f)
- **Objective:** Implement WebRTC media streaming via a dedicated Selective Forwarding Unit (SFU) for live multi-candidate video/audio proctoring.
- **Dependencies:** Phase 16
- **Major Tasks:**
  - Integrate SFU media server (mediasoup v3) as an isolated media gateway with bounded worker scaling and deterministic session pinning.
  - Implement SFU signaling transport over WebSocket with 64 KB ceiling and dedicated token bucket rate limiting (240 msg/min, burst 60).
  - Candidate media publisher pipeline (webcam, microphone, screen share) with simulcast and hardware track cleanup (`stopMediaStream`).
  - Proctor multi-stream subscriber pipeline with 12-candidate grid pagination, muted-by-default audio, solo listening, and VU meters.
  - Complete isolation between SFU media traffic, PostgreSQL business logic, and RabbitMQ evaluation workers.
  - Coturn ephemeral credentials generated via HMAC-SHA1 with 900-second (15 minutes) TTL and mandatory production TURN validation.
  - ADR-0007 approved and indexed.
- **Acceptance Criteria:**
  - Proctors can view multiple simultaneous candidate video/audio streams with low latency.
  - Heavy media transport has zero performance impact on core database or answer autosaves.
  - Isolated per-worker crash recovery with generation fencing prevents cross-session cascading failures.
- **Tests Implemented:** 57 backend media tests across 9 test files (23 sub-suites); 19 frontend media tests across 4 files; Full regression: 704/704 backend tests passing, 56/56 frontend tests passing, clean production build.

---

### Phase 18 — Security Hardening
- [x] **Status:** Complete (Merged in PR #19, Commit 5b27370, Merge 5b247e7)
- **Objective:** Perform thorough application security hardening, penetration defense, rate limiting, header security, and data sanitization.
- **Dependencies:** Phase 17
- **Major Tasks:**
  - Configure Helmet for secure HTTP headers (CSP, HSTS 1-year maxAge with preload, X-Content-Type-Options nosniff, X-Frame-Options DENY, COOP, CORP, COEP, Permissions-Policy).
  - Enforce strict CORS policies restricted to authorized origin whitelist (`CORS_ALLOWED_ORIGINS`) with `credentials: true`.
  - Implement non-destructive structural input sanitization (`sanitizeInputMiddleware`) preventing prototype pollution (`__proto__`, `constructor`, `prototype`) and null-byte (`\0`) injection without corrupting candidate code/math answers.
  - Audit database queries against SQL injection (enforce parameterized queries and identifier allowlists; map Postgres `22P02` to HTTP 400).
  - Implement anti-tampering cryptographic validation (`HMAC-SHA256` token derivation, canonical body digest, WebCrypto client signing, Redis atomic replay prevention with fail-closed production semantics).
  - Validate binary file signatures (magic bytes) for 6 allowed evidence MIME types (JPEG, PNG, WebP, WebM, OGG, WAV) via S3 HTTP Range requests (`bytes=0-15`).
  - Register Prometheus security metrics (`security_tamper_violations_total`, `security_input_sanitizations_total`, etc.) and structured security audit logging.
  - Author and index ADR-0008 (`docs/ADR/0008-application-security-hardening-cryptographic-anti-tampering.md`).
- **Acceptance Criteria:**
  - Automated security scans pass with zero high or critical vulnerabilities.
  - OWASP Top 10 vulnerabilities are systematically mitigated.
  - Cryptographic tampering and replay attacks are rejected before business logic execution.
  - Student code submissions and mathematical formulas remain 100% uncorrupted.
- **Tests Implemented:** 46 backend security tests across 7 test files (`backend/tests/security/`); 7 frontend anti-tamper client tests; Full regression: 750/750 backend tests passing, 63/63 frontend tests passing, clean production build (0 errors).

---

### Phase 19 — Containerization & Deployment
- [x] **Status:** Complete (Merged in PR #20, Implementation Commit a4152f7, Merge cbf3089, Completion Date 2026-09-08)
- **Objective:** Establish production-grade multi-stage containerization, local orchestration, single-host AWS EC2 delivery pipeline, and automated GitHub Actions CI/CD workflows.
- **Dependencies:** Phase 18
- **Major Tasks:**
  - Author multi-stage, production-optimized `backend/Dockerfile` (`node:24-bookworm-slim`) compiling native `mediasoup-worker` in builder, running deterministic `npm prune --omit=dev`, and enforcing non-root `USER node` (UID 1000).
  - Author multi-stage `frontend/Dockerfile` (`node:24-alpine` -> `nginxinc/nginx-unprivileged:alpine`, UID 101) with fallback self-signed certificates for syntax validation prior to Let's Encrypt host mounts.
  - Implement dual Nginx virtual hosts: `frontend/nginx/default.local.conf` for local development on port 8080 (without TLS redirect) and `frontend/nginx/default.conf` for production (ACME challenge, 301 HTTPS redirect, TLS termination on 8443, and reverse proxying to `http://host.docker.internal:4000`).
  - Author `docker-compose.yml` orchestrating the 8-service local integration stack with cold-start dependency ordering (`postgres` -> `backend-migrate` -> `backend` -> `frontend`), restricted WebRTC port forwarding (`40000–40050/udp`), and host-networked Coturn.
  - Author `infrastructure/docker-compose.prod.yml` for single-host AWS EC2 deployment defining 7 services with host networking for backend and Coturn, loopback-only persistence (`127.0.0.1`), internal-only port 4000, and fail-closed secrets (`${VAR:?VAR is required}`).
  - Implement host deployment script `infrastructure/deploy.sh` executing targeted replacement workflow (`pull` -> `migrate` -> `up -d --no-deps frontend` -> `up -d --no-deps backend` -> readiness polling).
  - Implement systemd unit `infrastructure/proctornet.service` and backup script `infrastructure/backup-db.sh`.
  - Implement GitHub Actions CI pipeline `.github/workflows/ci.yml` with parallel stages, dynamic migration verification, negative devDependency assertion, and Trivy security auditing.
  - Author and index ADR-0009 (`docs/ADR/0009-containerization-topology-multistage-builds-host-networked-sfu-and-single-host-delivery.md`).
- **Acceptance Criteria:**
  - `docker compose up -d` spins up the complete local environment, with all 7 runtime services achieving healthy status and `backend-migrate` exiting with code 0.
  - Production runtime backend image strictly excludes devDependencies (`vitest`, `supertest`, `c8`).
  - Production secrets fail closed when missing. External port 4000 is blocked from `0.0.0.0/0`.
  - TLS private keys strictly enforce mode `0640` owned by `root:101`; world-readable mode `0644` is prohibited.
  - Deployment replacement ordering uses `--no-deps` for targeted replacement without restarting databases.
  - Zero database migrations created in Phase 19; automatic database rollback is strictly excluded.
- **Tests Implemented:** Full regression: 750/750 backend tests passing across 185 suites, 63/63 frontend Vitest tests passing, Vite production build compiled cleanly in 3.81s, Docker Buildx multi-stage image builds, negative devDependency leak assertion passed (0 leaks), 8-service Compose smoke test passed with all 7 services healthy and `backend-migrate` exiting with code 0, `/ready` probe verified (HTTP 200), React SPA HTML served (HTTP 200), API reverse proxy verified (HTTP 401 JSON), LocalStack S3 bucket creation verified, Coturn STUN RFC 5780 probe verified, and production Compose config validated.

---

### Phase 20 — AWS Infrastructure
- [x] **Status:** Complete (Merged in PR #21, Implementation Commit ee823d8, Merge 466bcae, Completion Date 2026-09-08)
- **Objective:** Define declarative Infrastructure as Code using Terraform >= 1.9.0 for AWS cloud deployment, establishing a single-host modular monolith EC2 baseline with persistent EBS storage, S3 remote state with native lockfiles, least-privilege IAM, CloudWatch observability, and scale-ready managed service boundaries.
- **Dependencies:** Phase 19
- **Major Tasks:**
  - Author S3 remote state bootstrap with native S3 lockfile locking (`use_lockfile = true`) and zero DynamoDB state locks (`terraform/bootstrap/`).
  - Implement AWS VPC module (`10.0.0.0/16`) with dual AZ public and private subnets, Internet Gateway, and zero NAT Gateways for cost-conscious single-host deployment (`terraform/modules/vpc/`).
  - Implement security groups strictly isolating port 4000 and persistence ports (5432, 6379, 5672) while permitting edge HTTP (80), HTTPS (443), Coturn (3478, 49152–49250/udp), SFU (40000–49999/udp), and restricted SSH (`terraform/modules/security_groups/`).
  - Author least-privilege EC2 IAM roles for S3 evidence/backups, SSM Parameter Store (`/proctornet/{environment}/*`), and CloudWatch agent metrics/logging (`terraform/modules/iam/`).
  - Provision dedicated S3 evidence and backup buckets with AES256 encryption, public access block, bucket ownership controls, and server-authoritative retention per ADR-0005 (`terraform/modules/s3/`).
  - Implement EC2 module (`c6i.xlarge` prod, `t3.large`/`xlarge` staging) on Ubuntu 24.04 LTS with IMDSv2 enforced, encrypted gp3 root volume, encrypted persistent gp3 EBS volume (`prevent_destroy = true`) mounted at `/opt/proctornet/data`, and cloud-init bootstrap template (`terraform/modules/ec2/`).
  - Author CloudWatch log groups with retention policies, log metric filters, and CloudWatch alarms for high CPU (>85%), memory (>85%), and disk space (>85%) (`terraform/modules/cloudwatch/`).
  - Author scale-ready managed service modules for RDS PostgreSQL 16, ElastiCache Redis 7, and Application Load Balancer gated behind default-disabled feature flags (`enable_* = false`) (`terraform/modules/{rds,elasticache,alb}/`).
  - Configure staging (`terraform/environments/staging/`) and production (`terraform/environments/production/`) environment roots with S3 backends and variable templates.
  - Implement secure SSM secret fetching utility (`infrastructure/fetch-secrets.sh`) enforcing mode `0600` permissions owned by `root:root` with fail-closed validation.
  - Update database backup script (`infrastructure/backup-db.sh`) with automated S3 sync (`--sse AES256`) while preserving local 30-day retention pruning.
  - Implement GitHub Actions CI workflow (`.github/workflows/terraform.yml`) enforcing `terraform fmt`, `tflint`, `checkov`, `terraform validate`, and invariant assertions.
  - Implement automated invariant test script (`scripts/verify-infrastructure-invariants.js`) asserting 6 architectural invariants.
  - Author and index ADR-0010 (`docs/ADR/0010-declarative-aws-infrastructure-single-host-delivery-baseline-and-managed-service-migration-boundaries.md`).
- **Acceptance Criteria:**
  - `terraform validate` executes cleanly across bootstrap, staging, and production roots.
  - S3 remote state uses native lockfile locking (`use_lockfile = true`); zero DynamoDB state lock tables in active codebase.
  - Ephemeral containers with persistent EBS storage (`/opt/proctornet/data`) safeguarded with `prevent_destroy = true`.
  - Zero NAT Gateways; public subnets with Internet Gateway routing.
  - Public ingress strictly limited; port 4000 and persistence ports (5432, 6379, 5672) strictly blocked from `0.0.0.0/0`.
  - Scale-ready modules (RDS, ElastiCache, ALB) disabled by default (`false`).
  - Server-authoritative S3 evidence retention (no automated expiration deleting current objects).
  - Exactly 17 database migrations remain intact (no new migrations).
  - SSM secret fetching fails closed if mandatory secrets are missing.
- **Tests Implemented:**
  - `terraform fmt -check -recursive`: PASS (0 formatting issues).
  - `tflint --recursive`: PASS (0 warnings, 0 errors across 11 directories).
  - `terraform validate`: PASS (bootstrap, staging, and production configurations valid).
  - Checkov static security analysis: PASS (30 passed checks, 0 failed, 19 skipped with justified rationale).
  - Automated invariant assertions (`node scripts/verify-infrastructure-invariants.js`): PASS (6/6 rules verified).
  - Shell script syntax verification (`bash -n`): PASS on deploy.sh, backup-db.sh, and fetch-secrets.sh.
  - Production Docker Compose configuration validation: PASS (`docker compose -f infrastructure/docker-compose.prod.yml config`).
  - Frontend Vitest suite: PASS (63/63 tests passing across 18 test files).
  - Frontend Vite production build: PASS (compiled cleanly in 3.61s).

---

### Phase 21 — Load Testing & Concurrency Benchmarking
- [ ] **Status:** In Progress (Stages 21A & 21B Complete / Passed; Stage 21C Pending AWS Staging Execution)
- **Objective:** Validate single-host EC2 (`c6i.xlarge`) capacity, answer autosave throughput, submission burst handling, connection pool saturation limits, and Redis/RabbitMQ resource headroom under target concurrent workloads.
- **Dependencies:** Phase 20
- **Major Tasks:**
  - Establish automated repeatable load testing harness using k6 and Artillery with anti-tamper signing and dynamic auth. *(Stage 21A Complete)*
  - Execute Stage 21B environment, security, regression, and harness readiness gate. *(Stage 21B Complete / Passed)*
  - Execute official concurrency tiers (500, 1,000, 1,500, 2,000, 2,500 VUs) against the intended AWS `c6i.xlarge` staging/benchmark environment. *(Stage 21C Pending)*
  - Derive empirical Safe Operating Capacity (SOC), saturation thresholds, and Phase 32 migration triggers. *(Stage 21D/21E Pending)*
- **Acceptance Criteria:**
  - p95 latency for answer autosaves remains under 200ms at peak target concurrency.
  - Zero answer data loss, zero unhandled OCC rollback failures, and zero PostgreSQL deadlocks during burst submissions.
  - Asynchronous evaluation worker drains the evaluation queue without message drops or unroutable returns.
- **Tests Implemented:**
  - k6 load test scenarios (`autosave-contention.js`, `submission-surge.js`, `login-burst.js`, `full-exam-lifecycle.js`, `pool-saturation.js`, `smoke-test.js`).
  - Dynamic runtime authentication & secret-free fixture architecture (zero tokens/keys persisted in fixtures/artifacts).
  - Explicit separation of benchmark modes: Mode A (Prepared Active-Attempt) vs Mode B (Real Candidate Lifecycle).
  - Artillery scenarios (`candidate-journey.yml`, `proctoring-telemetry.yml`).
  - Post-benchmark database integrity verification (`verify-data-integrity.js`): PASS (Zero data loss, Zero orphans, OCC monotonicity verified, Zero deadlocks, Outbox event completeness verified).
  - Automated benchmark harness (`run-benchmarks.js`, `run-official-tier.js`): Configured with `--dry-run` and remote `BASE_URL` support.
  - Stage 21B Readiness Gate: 8/8 readiness gates PASS.
  - *Note:* Stage 21B readiness gate passed. Official concurrency capacity tiers (500–2,500 VUs) require execution against the intended AWS c6i.xlarge staging/benchmark environment (not local development machines). No capacity conclusion or Safe Operating Capacity has yet been established.

---

### Phase 22 — Failure, Resilience & Chaos Testing
- [ ] **Status:** Pending
- **Objective:** Verify system resilience, data durability, and automated recovery during unexpected subsystem outages, network partitions, container crashes, and database connection pool saturation.
- **Dependencies:** Phase 21
- **Major Tasks:**
  - Execute automated chaos testing scripts simulating unexpected Redis outages during active examinations (validate non-authoritative fallback to PostgreSQL without answer loss or exam interruption).
  - Simulate RabbitMQ broker downtime and network partitions (validate that transactional outbox reliably accumulates events in PostgreSQL and drains cleanly upon broker restoration).
  - Simulate sudden candidate network disconnects, packet loss, and rapid reconnects (validate attempt resumption and question order consistency).
  - Simulate host process crashes and Docker container restarts via systemd (validate stateful recovery and EBS data persistence).
  - Measure Recovery Time Objective (RTO) and Recovery Point Objective (RPO) against engineering reliability targets.
- **Acceptance Criteria:**
  - Core exam delivery, question navigation, and answer persistence remain 100% operational during transient cache or message broker failures.
  - System recovers cleanly and automatically upon service restoration without manual data repair or database intervention.
  - Zero corruption of candidate state, zero orphan attempt records, and zero lost outbox events.
- **Tests Required:** Chaos engineering scripts, Redis/RabbitMQ failure recovery integration tests, network partition simulation tests.

---

### Phase 23 — Complete User & Account Administration
- [ ] **Status:** Pending
- **Objective:** Build the institutional administrative control plane for complete user lifecycle management, multi-role account creation (Candidate, Faculty, Invigilator, Developer), bulk CSV ingestion, role assignment, credential management, authoritative account state machine enforcement, and organization-wide configuration policies.
- **Dependencies:** Phase 4, Phase 10, Phase 13
- **Major Tasks:**
  - Author database migration expanding `user_roles` check constraint to include `DEVELOPER` role and expanding `users.status` check constraint to support the authoritative 4-state lifecycle: `CHECK (status IN ('ACTIVE', 'LOCKED', 'DISABLED', 'SUSPENDED'))`.
  - Implement administrative user CRUD endpoints (`GET /api/v1/admin/users`, `POST /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id/status`, `POST /api/v1/admin/users/:id/reset-password`).
  - Implement bulk user import via CSV (`POST /api/v1/admin/users/bulk-import`) with transactional rollback on validation failure and detailed row-by-row error reporting.
  - Implement institutional settings and global platform configuration endpoints (`GET/PUT /api/v1/admin/organization`).
  - Build Admin Portal User Management UI across 5 dedicated screens:
    - User Management Overview (`/admin/users`) with searchable, filterable, and paginated user tables.
    - Create User Screen (`/admin/users/create`) with role selection and initial password generation.
    - Bulk CSV Import Tool (`/admin/users/bulk-import`) with upload progress, validation preview, and error grid.
    - Organization & Policy Settings (`/admin/organization`) with term dates, branding, and defaults.
    - Administrative Audit Viewer (`/admin/audit`) with searchable actor, action, and target log history.
  - Implement credential reset workflows with copyable temporary passwords, account status toggles (`ACTIVE`, `LOCKED`, `DISABLED`, `SUSPENDED`), and confirmation modals for destructive actions.
  - Enforce immutable administrative audit logging for all user modifications and role grants.
- **Acceptance Criteria:**
  - Administrators can create, activate, deactivate, suspend, and search user accounts across all 5 roles.
  - Bulk CSV import successfully validates and imports 500+ student accounts in a single atomic database transaction.
  - Authoritative account lifecycle transitions (`ACTIVE`, `LOCKED`, `DISABLED`, `SUSPENDED`) are strictly enforced; `LOCKED` (temporary auth lockout) and `SUSPENDED` (reversible administrative hold) behave as specified.
  - All administrative operations record actor identity, target user, action, and timestamp in immutable audit logs.
- **Tests Required:** User management API unit/integration tests, bulk CSV parser validation tests, Admin portal component and page tests, RBAC authorization boundary tests, account state machine transition tests.

---

### Phase 24 — Candidate Onboarding, Document Verification & Per-Student Configuration
- [ ] **Status:** Pending
- **Objective:** Implement the candidate onboarding journey, government ID and student document capture/upload, automated and manual document verification workflows, candidate profile completion, and individualized per-student configuration (accommodations, eligibility, retry limits).
- **Dependencies:** Phase 15, Phase 23
- **Major Tasks:**
  - Author database migration for `student_identity_documents` (S3 object key, document type, verification status, reviewer notes, extracted metadata) and student configuration columns (extra time multiplier, accommodations, retry allowances, proctoring strictness overrides).
  - Implement document upload URL generation (`POST /api/v1/candidate/identity/document-url`) and upload confirmation (`POST /api/v1/candidate/identity/confirm-document`) with direct-to-S3 presigned PUT and magic byte validation.
  - Implement candidate profile completion and identity status endpoints (`GET/PATCH /api/v1/candidate/profile`, `GET /api/v1/candidate/identity/status`).
  - Implement Admin Verification Review queue (`GET /api/v1/admin/verifications`, `PATCH /api/v1/admin/verifications/:id/review`) with approval, rejection, and retry request workflows.
  - Implement Per-Student Configuration API and screen (`GET/PATCH /api/v1/admin/students/:id`, `/admin/students/:id`) supporting:
    - Profile metadata (enrollment number, department, semester, academic standing)
    - Verification state overrides and manual retry allowance resets
    - Exam accommodations (extra time multiplier e.g. 1.25x, 1.5x, 2.0x, custom break allowances, assistive technology flags)
    - Proctoring strictness overrides for documented medical exemptions
    - Candidate examination history and verification audit trail
  - Build Candidate Onboarding UI (`/candidate/onboarding`, `/candidate/profile`, `/candidate/verify-identity`) with document upload guidance, framing guidelines, and verification status tracking.
  - Build Admin Verification Review Console (`/admin/verifications`) with side-by-side document inspection and rejection reason taxonomy.
  - Enforce strict privacy boundary: Per-student configuration and ID documents are accessible strictly to authorized Administrators, Faculty, and the student; Developers are strictly DENIED access.
- **Acceptance Criteria:**
  - Candidates can upload government or student IDs with client-side image validation and private S3 storage.
  - Admins can inspect submitted documents, approve or reject with documented reasons, and configure per-student accommodations.
  - Approved time accommodations automatically scale attempt durations during exam initialization in the Phase 6 engine.
- **Tests Required:** Document upload and confirmation integration tests, per-student configuration API tests, Admin verification review flow tests, Candidate onboarding component tests, accommodation duration calculation unit tests.

---

### Phase 25 — Biometric Identity: Face Enrollment, Verification & Anti-Spoofing
- [ ] **Status:** Pending
- **Objective:** Implement biometric identity verification capabilities including reference face enrollment, pre-exam face verification matching against enrolled reference and ID photo, passive and active liveness detection, and presentation attack mitigation, treating numerical thresholds as calibrated engineering targets.
- **Dependencies:** Phase 24
- **Major Tasks:**
  - Author database migration for `face_biometrics` (facial embeddings vector, enrollment status, quality scores, reference S3 keys).
  - Implement reference face enrollment endpoint (`POST /api/v1/candidate/biometrics/enroll-face`) with face quality validation (pose, illumination, sharpness) and facial embedding generation.
  - Implement pre-exam face verification endpoint (`POST /api/v1/candidate/biometrics/verify-face`) computing cosine similarity against enrolled template and ID document photo with server-authoritative thresholds (initial policy target: cosine similarity >= 0.85; target FAR < 0.1%).
  - Implement liveness challenge-response protocol (`POST /api/v1/candidate/biometrics/liveness-challenge`, `POST /api/v1/candidate/biometrics/verify-liveness`) verifying real-time user actions (head turn, blink sequence, random prompt within an initial target window of <= 8 seconds).
  - Classify numerical biometric thresholds (cosine similarity >= 0.85, FAR < 0.1%, challenge window <= 8s) as **ENGINEERING TARGETS / INITIAL POLICY PARAMETERS**:
    - Final thresholds require empirical calibration and benchmark validation against the selected model and diverse testing datasets.
    - Acceptance criteria must be based on measured evaluation benchmarks.
    - Threshold modifications must be strictly server-authoritative, controlled, and recorded in immutable audit logs.
  - Build Candidate Face Enrollment UI (`/candidate/biometrics/enroll`) with real-time camera preview, oval guide, lighting feedback, and step-by-step enrollment.
  - Integrate biometric verification gate into Pre-Exam Readiness flow (`/candidate/readiness/:sessionId`) preventing attempt start until identity is verified or manual administrative override is granted.
  - Implement privacy controls: facial embeddings stored securely in PostgreSQL; raw images stored in private encrypted S3 with configurable retention and zero public exposure.
- **Acceptance Criteria:**
  - Enrolled reference faces match candidate selfies with measured accuracy meeting the calibrated policy target (initial engineering target: cosine similarity >= 0.85, false accept rate < 0.1%).
  - Presentation attacks (printed photos, smartphone screen replays) are detected and rejected by passive liveness analysis and active challenge-response protocols.
  - Attempt start is strictly blocked if biometric verification fails and retry count is exhausted.
- **Tests Required:** Embedding similarity calculation unit tests, liveness challenge verification tests, anti-spoofing rejection tests, candidate readiness biometric integration tests, threshold calibration benchmarks.

---

### Phase 26 — Complete Faculty Examination & Assessment Lifecycle
- [ ] **Status:** Pending
- **Objective:** Expand the faculty/examiner portal into an end-to-end academic authoring and assessment suite with question banks, blueprint rules, rich-text question authoring, multi-room session scheduling, manual grading workflows, and item analytics.
- **Dependencies:** Phase 5, Phase 9, Phase 10
- **Major Tasks:**
  - Implement question bank management API (`GET/POST/PATCH/DELETE /api/v1/faculty/question-bank`) with subject and topic tagging, difficulty categorization, and question cloning.
  - Enhance question schemas and authoring to support rich text, mathematical formulas (LaTeX / MathJax), and programming code snippets with syntax highlighting.
  - Build Question Bank UI (`/faculty/question-bank`) with search, filter, bulk operations, and question preview.
  - Enhance Exam Editor UI (`/faculty/exams/:id`) with interactive topic rule builder, point distribution calculator, and automated blueprint validation checks.
  - Implement manual grading and assessment review API (`GET /api/v1/results/:id/evaluation`, `POST /api/v1/results/:id/manual-grade`) allowing instructors to grade subjective questions and adjust auto-evaluated scores with mandatory rationale.
  - Build Manual Grading Workspace (`/faculty/exams/:id/grading`) with side-by-side answer display, rubric scoring, and feedback entry.
  - Implement Exam Analytics API and Dashboard (`/faculty/exams/:id/analytics`) displaying score distribution histograms, question difficulty indices, and candidate completion rates.
- **Acceptance Criteria:**
  - Faculty can author reusable question banks, compose balanced exam blueprints, and schedule multi-room exam sessions.
  - Instructors can review and manually adjust evaluations with full audit trail tracking.
  - Analytics accurately report grade distributions, average completion times, and item discrimination metrics.
- **Tests Required:** Question bank CRUD API tests, manual grading consistency tests, analytics aggregation unit tests, faculty authoring UI component tests.

---

### Phase 27 — Complete Invigilation & Live Proctoring Workstation
- [ ] **Status:** Pending
- **Objective:** Deliver a high-density, real-time proctoring workstation enabling invigilators to monitor live candidate video/audio streams, inspect anomaly timelines, issue real-time interventions, and manage exam room discipline.
- **Dependencies:** Phase 14, Phase 16, Phase 17
- **Major Tasks:**
  - Implement proctor intervention endpoints (`POST /api/v1/sessions/:id/announcements`, `POST /api/v1/attempts/:id/messages`, `POST /api/v1/attempts/:id/pause`, `POST /api/v1/attempts/:id/terminate`).
  - Wire real-time intervention events over WebSocket control plane (`PROCTOR_ANNOUNCEMENT`, `DIRECT_MESSAGE`, `EXAM_PAUSED`, `EXAM_TERMINATED`) with client delivery acknowledgements.
  - Redesign Invigilator Console (`/invigilator/sessions/:id`) featuring a 12-candidate paginated video grid with audio activity indicators, WebRTC stream health badges, and risk score filters.
  - Build Candidate Detail Drawer featuring high-resolution live video, audio VU meter, candidate profile, hardware readiness history, real-time violation feed, and risk score gauge.
  - Implement Candidate Intervention Modals: Send Warning Message, Broadcast Room Alert, Pause Exam Attempt, and Emergency Terminate Attempt (with mandatory documented reason).
  - Implement Evidence Inspection Modal for in-session and post-session review of S3 snapshot evidence with secure presigned URLs.
  - Implement invigilator session completion workflow and post-session incident summary reporting.
- **Acceptance Criteria:**
  - Proctors can monitor multiple candidate streams concurrently with low latency and clear connection health indicators.
  - Candidate violation events appear in real time on the invigilator dashboard with server-authoritative severity scores.
  - Proctor interventions (warnings, pause, termination) propagate instantaneously over WebSocket and take immediate effect on the candidate client.
- **Tests Required:** Proctor intervention API unit/integration tests, WebSocket intervention delivery tests, invigilator video grid UI tests, candidate pause/terminate UX flow tests.

---

### Phase 28 — Developer & System Operations Portal
- [ ] **Status:** Pending
- **Objective:** Build a dedicated technical control plane for Developers and System Operators providing real-time system health observability, component status indicators, centralized log stream inspection, technical audit feeds, infrastructure topology mapping, and incident triage across all 6 dedicated developer screens.
- **Dependencies:** Phase 13, Phase 20
- **Major Tasks:**
  - Implement technical control plane API under `/api/v1/developer/*` strictly restricted to the `DEVELOPER` role.
  - Implement Comprehensive System Health Aggregator (`GET /api/v1/developer/health`) querying actual component probes:
    - Backend API process health and uptime
    - PostgreSQL primary pool status, active connections, and query latency
    - PostgreSQL replica status and replication lag (when replicas exist)
    - Redis connection health, memory usage, and hit/miss ratio
    - RabbitMQ connection, queue depths, and consumer counts
    - WebSocket gateway active connections and message throughput
    - WebRTC SFU worker processes, router counts, and active RTP transports
    - Coturn STUN/TURN listener health and allocation counts
    - Transactional Outbox poller status, dispatch latency, and event backlog
    - Asynchronous Evaluation Consumer status and in-flight job count
    - AWS S3 connectivity and bucket accessibility
    - Automated Backup service status and last backup timestamp
  - Standardize component health states: `UP`, `DEGRADED`, `DOWN`, `UNKNOWN` derived strictly from live telemetry (zero manual labels).
  - Implement Centralized System Logs Viewer API (`GET /api/v1/developer/logs`) aggregating structured logs with filtering by service, severity, timestamp range, host, request ID, trace ID, and event type with automated PII masking.
  - Implement Technical Audit Feed (`GET /api/v1/developer/audit`) surfacing authentication events, authorization rejections, deployment history, configuration updates, and security anomalies.
  - Build Developer Portal UI across all 6 specified screens:
    - Developer Overview (`/developer/overview`) with high-level system telemetry and KPI summary.
    - Subsystem Health Monitor (`/developer/health`) with live probe matrices and connection pool gauges.
    - Central System Logs Viewer (`/developer/logs`) with sub-second search, severity filters, and trace inspection.
    - Technical Audit Feed (`/developer/audit`) with security and operational event streams.
    - Infrastructure Topology Map (`/developer/topology`) with interactive service mesh and replication lag indicators.
    - Incident Triage & Alerts (`/developer/incidents`) with down/degraded service alerts and failure logs.
  - Enforce strict developer security boundary: Developer role has technical telemetry and operational maintenance privileges, but is strictly DENIED access to raw student PII, government ID documents, biometric images, candidate exam answers, and scorecards.
- **Acceptance Criteria:**
  - Developers can inspect live operational health, connection pool saturation, and error rates across all 12+ subsystems.
  - Centralized log viewer enables sub-second filtering by trace ID across backend, workers, and database logs with automated PII masking.
  - All 6 developer pages render with real-time telemetry, clear empty/loading/error states, and interactive diagnostics.
  - Sensitive candidate business data and biometrics remain completely inaccessible to the developer role.
- **Tests Required:** Developer API authorization tests, health probe aggregation tests, PII masking unit tests, Developer portal component and page tests across all 6 screens.

---

### Phase 29 — WireGuard Secure Management Plane & Network Segmentation
- [ ] **Status:** Pending
- **Objective:** Implement, containerize/daemonize, and operationalize the WireGuard management plane for secure administrator and developer access, establishing strict network segmentation between management traffic and candidate exam traffic.
- **Dependencies:** Phase 20, Phase 28
- **Major Tasks:**
  - Deploy and configure WireGuard VPN service on the management gateway/host using static IP subnet `10.100.0.0/24`.
  - Author automated peer management utility (`infrastructure/wireguard/manage-peers.sh`) for server key generation, peer key generation, IP allocation, and `.conf` / QR code export.
  - Configure host firewall rules (`iptables` / `ufw`) and AWS Security Groups restricting administrative SSH (port 22) and Developer/Admin web interfaces strictly to WireGuard VPN peers (`10.100.0.0/24` or `var.admin_cidr`).
  - Enforce architectural network segmentation:
    - **Management Plane**: WireGuard VPN tunnel required for all infrastructure access, SSH, database administration, and developer portals.
    - **Candidate Examination Plane**: Public TLS 1.3 HTTPS/WSS/WebRTC traffic via Nginx edge reverse proxy with zero VPN dependency. Candidates do NOT require WireGuard.
  - Clarify baseline boundary: Phase 20 established only the SG CIDR variable (`var.admin_cidr`); full WireGuard service deployment, daemon configuration, and peer management are implemented in Phase 29.
  - Implement peer lifecycle runbooks: peer provisioning, key rotation, instant peer revocation, and handshake monitoring via CloudWatch metrics.
- **Acceptance Criteria:**
  - Administrative SSH access is completely unreachable from the public internet (`0.0.0.0/0`) and accessible only through active WireGuard VPN sessions.
  - Authorized operators can generate peer profiles and connect securely to internal management endpoints.
  - Candidate examination traffic functions normally over the public internet without VPN interference or client requirements.
- **Tests Required:** WireGuard handshake verification tests, firewall ingress rejection tests from non-VPN IPs, peer provisioning and revocation script validation.

---

### Phase 30 — End-to-End User Experience, Accessibility & Design System Polish
- [ ] **Status:** Pending
- **Objective:** Perform holistic user experience refinement, responsive layout optimization, WCAG 2.1 AA accessibility compliance, unified design system token standardization, and complete journey testing across all 5 user roles, building upon the fully implemented role portals from Phases 23–29.
- **Dependencies:** Phases 23, 24, 25, 26, 27, 28, 29
- **Major Tasks:**
  - Audit and enforce CSS custom properties across the complete frontend application, ensuring visual consistency across all 4 density tiers (Marketing/Auth, Dashboard, Exam Workspace, Proctoring Console).
  - Implement responsive layouts and mobile/tablet breakpoints across all non-exam workspaces.
  - Enforce full keyboard navigation support: tab ordering, visible focus rings, keyboard shortcuts in exam workspace, and modal focus traps.
  - Implement comprehensive ARIA landmarks, roles, and live regions (`aria-live="polite"`) for real-time timer warnings, proctor alerts, and autosave feedback.
  - Implement standardized state components: Loading spinners, Empty states with actionable guidance, Error boundaries with retry buttons, and Destructive action confirmation dialogs.
  - Author automated end-to-end user journey test suites using Playwright validating all 5 roles from login through completion.
- **Acceptance Criteria:**
  - Full compliance with WCAG 2.1 AA accessibility standards verified via automated axe-core scans and manual keyboard navigation audits.
  - All supported user journeys execute end-to-end with zero layout breaks, console errors, or unhandled promise rejections.
  - All destructive operations (submitting exams, pausing candidates, deleting blueprints, revoking accounts) require explicit two-step confirmation.
- **Tests Required:** Playwright E2E journey tests across all 5 roles, axe-core automated accessibility audits, responsive viewport visual regression tests.

---

### Phase 31 — Advanced Real-Time AI Proctoring & Multi-Modal Anomaly Detection
- [ ] **Status:** Pending
- **Objective:** Implement client-side and server-assisted AI proctoring models for continuous face presence, gaze tracking, multiple-person detection, background voice classification, and integrated anomaly scoring, treating inference framerate targets as calibrated engineering benchmarks.
- **Dependencies:** Phase 14, Phase 17, Phase 25, Phase 27
- **Major Tasks:**
  - Implement client-side lightweight AI inference models (TensorFlow.js / ONNX runtime) executing in dedicated Web Workers:
    - Real-time face presence and bounding box detection
    - Gaze direction estimation (detecting prolonged off-screen looking)
    - Multiple face detection in camera view
    - Inference framerate performance target: >= 15 FPS on standard candidate laptop hardware (engineering benchmark target).
  - Implement server-assisted audio anomaly classification on periodic evidence audio snippets (speech detection, whispered voice detection).
  - Connect AI detection events to Phase 14 server-authoritative proctoring event ingestion pipeline (`POST /api/v1/attempts/:id/events`) with event types `AI_FACE_ABSENT`, `AI_MULTIPLE_FACES`, `AI_GAZE_OFF_SCREEN`, `AI_VOICE_DETECTED`.
  - Update Anomaly Scorer to incorporate multi-modal AI signals with configurable confidence weights and server-side dampening to prevent false positive alert storms.
  - Display real-time AI anomaly markers and confidence scores in the Invigilator Console Candidate Detail Drawer.
- **Acceptance Criteria:**
  - Client-side AI runs smoothly in Web Workers without degrading exam countdown timer accuracy or answer input responsiveness (calibrated engineering target: >= 15 fps on standard hardware).
  - High-confidence AI anomalies feed the server-authoritative risk score and trigger proctor notifications.
  - Proctors can dismiss false-positive AI flags with one click, feeding the audit trail.
- **Tests Required:** Web Worker AI inference benchmark tests, anomaly event ingestion integration tests, aggregate scoring calculation tests, Invigilator UI AI overlay tests.

---

### Phase 32 — Infrastructure Horizontal Scaling, High Availability & Managed Service Migration
- [ ] **Status:** Pending
- **Objective:** Migrate from the single-host EC2 baseline to horizontally scalable, multi-AZ high availability infrastructure when justified and guided by Phase 21 load testing benchmarks, activating managed AWS services (RDS PostgreSQL, ElastiCache Redis, ALB, mediasoup SFU clustering).
- **Dependencies:** Phase 20, Phase 21, Phase 22
- **Major Tasks:**
  - Analyze empirical bottleneck data and capacity ceilings from Phase 21 concurrency benchmarking to establish data-driven scaling triggers.
  - Activate Terraform managed service modules:
    - Multi-AZ Amazon RDS PostgreSQL 16 (`var.enable_rds = true`) with automated backups and read replicas
    - Amazon ElastiCache Redis replication group (`var.enable_elasticache = true`) with multi-node failover
    - AWS Application Load Balancer (`var.enable_alb = true`) with HTTPS termination and health check target groups
  - Execute zero-downtime database migration from containerized host PostgreSQL to Amazon RDS PostgreSQL using logical replication.
  - Migrate ephemeral session and caching layers to ElastiCache Redis.
  - Implement mediasoup SFU clustering and pipe transports allowing WebRTC candidate streams to route across multiple dedicated media nodes.
  - Configure Auto Scaling Groups for stateless backend application containers behind the ALB.
  - Update Developer Topology Dashboard to display live primary/replica health, replication lag, and multi-node cluster status.
- **Acceptance Criteria:**
  - Seamless migration to managed AWS services with zero data loss on business records.
  - High availability architecture survives single Availability Zone outage without exam service interruption.
  - ALB distributes traffic across backend pool with automatic unhealthy node eviction.
- **Tests Required:** Multi-AZ RDS failover tests, ElastiCache failover validation, ALB health check eviction tests, SFU pipe transport streaming tests.

---

### Phase 33 — Final Security Hardening, Penetration Testing & Compliance
- [ ] **Status:** Pending
- **Objective:** Execute comprehensive application and infrastructure security penetration testing, OWASP ASVS Level 2 verification, dependency supply chain audit, and data protection compliance verification (FERPA / GDPR).
- **Dependencies:** Phases 18, 29, 32
- **Major Tasks:**
  - Execute comprehensive Static Application Security Testing (SAST) and Dynamic Application Security Testing (DAST).
  - Perform dependency supply-chain security sweeps using Trivy, Snyk, and npm audit, resolving all high and critical vulnerabilities.
  - Conduct penetration testing across critical attack vectors: WebRTC media eavesdropping, WebSocket hijacking, JWT replay attacks, SQL injection, BOLA, and biometric spoofing.
  - Verify cryptographic anti-tampering enforcement across 100% of candidate mutation endpoints.
  - Verify automated data retention and purging policies for sensitive evidence and identity documents.
  - Compile security audit report and compliance verification matrix.
- **Acceptance Criteria:**
  - Zero critical, zero high, and zero unmitigated medium vulnerabilities across application and infrastructure code.
  - All OWASP Top 10 and ASVS Level 2 security requirements systematically satisfied.
  - Evidence retention and candidate data handling comply with FERPA and GDPR privacy principles.
- **Tests Required:** Penetration test validation suites, automated security vulnerability scans, cryptographic audit assertions, data purging verification tests.

---

### Phase 34 — Final Documentation, Runbooks & Release Handover
- [ ] **Status:** Pending
- **Objective:** Complete comprehensive developer guides, OpenAPI 3.1 specifications, operational runbooks, disaster recovery procedures, and project handover documentation.
- **Dependencies:** Phases 0–33
- **Major Tasks:**
  - Generate complete OpenAPI 3.1 specification for all REST API endpoints across all 5 roles.
  - Author System Operations Runbook covering incident triage, failover procedures, backup restoration, scaling guides, and metric alarm responses.
  - Author Developer Onboarding & Contribution Guide covering local environment setup, testing standards, and git workflows.
  - Author WireGuard Management Runbook covering peer generation, key rotation, and revocation procedures.
  - Archive all project Architecture Decision Records (ADRs) and compile the final release changelog.
- **Acceptance Criteria:**
  - Documentation enables a new engineer or system operator to onboard, deploy, operate, and maintain ProctorNet independently.
  - All API routes, request/response schemas, and error codes are fully documented.
  - Disaster recovery runbook verified through live restore walkthrough.
- **Tests Required:** Documentation link verification, OpenAPI schema validation tests, runbook procedure validation.

---

## 3. Comprehensive Feature Completeness Model & Status Matrix

Every product capability is classified into one of six authoritative states:
- **`IMPLEMENTED`**: Fully built, tested, and verified in active codebase across all required layers (Backend + Frontend + Integration + E2E UX).
- **`PARTIALLY IMPLEMENTED`**: Core backend or basic UI exists, but complete workflow, security controls, or user experience remains incomplete.
- **`PLANNED`**: Fully scoped, architecturally specified, and assigned to a dedicated future implementation phase.
- **`MISSING`**: Required for complete product delivery but was absent from earlier phase scopes; now captured and scheduled.
- **`DEFERRED`**: Intentionally scheduled for advanced scaling or enterprise hardening phases (e.g. multi-AZ horizontal scaling).
- **`REJECTED`**: Explicitly evaluated and rejected to prevent architectural drift (e.g. DynamoDB locks, NAT gateways, premature microservices).

| Domain | Feature / Capability | Backend API | Frontend UI | Integration | E2E UX | Status | Authoritative Phase |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| **Auth** | Candidate / Staff Login & Logout | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 4, Phase 10 |
| **Auth** | Refresh Token Rotation & Cookie Storage | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 4, Phase 10 |
| **Auth** | Token Blacklist & Session Revocation | [x] | [-] | [x] | [-] | `PARTIALLY IMPLEMENTED` | Phase 11, Phase 23 |
| **Auth** | Multi-Factor Authentication (MFA) | [ ] | [ ] | [ ] | [ ] | `PLANNED` | Phase 23 |
| **User Mgmt** | Admin User Management Overview (`/admin/users`) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 23 |
| **User Mgmt** | Admin Create User Screen (`/admin/users/create`) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 23 |
| **User Mgmt** | Bulk User CSV Import Tool (`/admin/users/bulk-import`)| [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 23 |
| **User Mgmt** | User Search, Filter, Pagination & Status | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 23 |
| **User Mgmt** | Credential Reset & Temporary Password | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 23 |
| **User Mgmt** | Organization Settings (`/admin/organization`) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 23 |
| **User Mgmt** | Administrative Audit Log Viewer (`/admin/audit`) | [x] (api) | [ ] | [x] | [ ] | `PARTIALLY IMPLEMENTED` | Phase 13, Phase 23 |
| **Student** | Student Profile Completion & Metadata | [x] (schema) | [ ] | [ ] | [ ] | `PARTIALLY IMPLEMENTED` | Phase 2, Phase 24 |
| **Student** | Per-Student Exam Accommodations (Time Buffer) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 24 |
| **Student** | Per-Student Config Screen (`/admin/students/:id`) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 24 |
| **Student** | Per-Student Eligibility & Exam Assignment | [x] | [ ] | [x] | [-] | `PARTIALLY IMPLEMENTED` | Phase 5, Phase 24 |
| **Identity** | Government / Student ID Document Capture | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 24 |
| **Identity** | Private S3 Encrypted Document Storage | [x] (base) | [ ] | [ ] | [ ] | `PARTIALLY IMPLEMENTED` | Phase 15, Phase 24 |
| **Identity** | Document OCR & Candidate Matching | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 24 |
| **Identity** | Admin Verification Review Queue (`/admin/verifications`)| [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 24 |
| **Biometrics** | Reference Face Enrollment & Embedding | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 25 |
| **Biometrics** | Pre-Exam Face Verification (Selfie Match) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 25 |
| **Biometrics** | Passive & Active Liveness / Anti-Spoofing | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 25 |
| **Exam Delivery** | Exam Authoring & Blueprint Composition | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 5, Phase 10 |
| **Exam Delivery** | Reusable Question Bank Management | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 26 |
| **Exam Delivery** | Multi-Room Session Scheduling & Rostering | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 5, Phase 10 |
| **Exam Delivery** | Deterministic Question Shuffling (PRNG) | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 6, Phase 10 |
| **Exam Delivery** | Authoritative Timing & Expiration Engine | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 6, Phase 10 |
| **Exam Delivery** | Debounced Answer Autosave & OCC Revision | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 7, Phase 10 |
| **Exam Delivery** | Atomic Batch Autosave | [x] | [ ] | [ ] | [ ] | `PARTIALLY IMPLEMENTED` | Phase 7, Phase 26 |
| **Exam Delivery** | Idempotent Exam Submission | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 8, Phase 10 |
| **Exam Delivery** | Transactional Outbox & Async Evaluation | [x] | N/A | [x] | [x] | `IMPLEMENTED` | Phase 8, Phase 12 |
| **Exam Delivery** | Manual Grading Workspace & Score Overrides | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 26 |
| **Exam Delivery** | Result Release Policies & Scorecards | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 9, Phase 10 |
| **Exam Delivery** | Exam Analytics, KPIs & Grade Distribution | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 26 |
| **Proctoring** | Client Violation Telemetry Hook & Ingestion | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 14, Phase 16 |
| **Proctoring** | Server-Authoritative Anomaly Scoring | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 14, Phase 16 |
| **Proctoring** | Direct Presigned Evidence Upload (S3) | [x] | [ ] | [ ] | [ ] | `PARTIALLY IMPLEMENTED` | Phase 15, Phase 27 |
| **Proctoring** | Realtime WebSocket Signaling & Presence | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 16, Phase 17 |
| **Proctoring** | WebRTC Multi-Party Video/Audio SFU | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 17 |
| **Proctoring** | Invigilator Multi-Stream Grid & Detail Drawer | [-] | [-] | [-] | [-] | `PARTIALLY IMPLEMENTED` | Phase 17, Phase 27 |
| **Proctoring** | Proctor Direct Interventions (Warn/Pause/Kill) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 27 |
| **Proctoring** | In-Session Evidence Inspection Modal | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 27 |
| **Proctoring** | Advanced AI Gaze & Multi-Face Detection | [ ] | [ ] | [ ] | [ ] | `PLANNED` | Phase 31 |
| **Operations** | Developer Role in RBAC (`user_roles`) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 28 |
| **Operations** | Developer Overview (`/developer/overview`) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 28 |
| **Operations** | Subsystem Health Monitor (`/developer/health`) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 28 |
| **Operations** | Centralized System Logs Viewer (`/developer/logs`) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 28 |
| **Operations** | Technical Audit Feed (`/developer/audit`) | [x] (admin) | [ ] | [x] | [ ] | `PARTIALLY IMPLEMENTED` | Phase 13, Phase 28 |
| **Operations** | Infrastructure Topology Map (`/developer/topology`) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 28 |
| **Operations** | Incident Triage & Alerts (`/developer/incidents`) | [ ] | [ ] | [ ] | [ ] | `MISSING` | Phase 28 |
| **Network** | WireGuard VPN Service & Daemon Deployment | [ ] | N/A | [ ] | N/A | `MISSING` | Phase 29 |
| **Network** | WireGuard Peer Generation & Key Management | [ ] | N/A | [ ] | N/A | `MISSING` | Phase 29 |
| **Network** | Management vs Exam Network Segmentation | [x] (SG base) | N/A | [ ] | N/A | `PARTIALLY IMPLEMENTED` | Phase 20, Phase 29 |
| **Infra** | Docker Containerization & Multi-Stage Builds | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 19 |
| **Infra** | Single-Host EC2 Production Baseline | [x] | N/A | [x] | [x] | `IMPLEMENTED` | Phase 19, Phase 20 |
| **Infra** | Persistent Encrypted EBS Volume Protection | [x] | N/A | [x] | [x] | `IMPLEMENTED` | Phase 20 |
| **Infra** | Terraform IaC (S3 Backend, S3 Lockfile) | [x] | N/A | [x] | [x] | `IMPLEMENTED` | Phase 20 |
| **Infra** | Scale-Ready Modules (RDS, Redis, ALB) | [x] (disabled)| N/A | [ ] | N/A | `IMPLEMENTED` (base) | Phase 20, Phase 32 |
| **Infra** | Horizontal Multi-AZ Scaling & Clustering | [ ] | N/A | [ ] | N/A | `DEFERRED` | Phase 32 |
| **Security** | Application Security Hardening (OWASP Top 10)| [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 18 |
| **Security** | Cryptographic Anti-Tampering & Signing | [x] | [x] | [x] | [x] | `IMPLEMENTED` | Phase 18 |
| **Security** | Security Group Isolation (No Public Internal)| [x] | N/A | [x] | [x] | `IMPLEMENTED` | Phase 20 |
| **UX** | WCAG 2.1 AA Accessibility & Keyboard Nav | [-] | [-] | N/A | [-] | `PARTIALLY IMPLEMENTED` | Phase 10, Phase 30 |
| **UX** | Unified Design System Tokens & Responsive UI | [x] (base) | [x] (base)| N/A | [-] | `PARTIALLY IMPLEMENTED` | Phase 10, Phase 30 |

---

## 4. Complete 5-Role Model & Role Specifications

ProctorNet defines an authoritative 5-role model. Each role possesses an isolated functional scope, strict resource-level authorization boundaries, and dedicated portal interfaces.

```
+----------------------------------------------------------------------------------------------------+
|                                      ProctorNet 5-Role Model                                       |
+--------------------------+--------------------------+----------------------------------------------+
| Primary DB / RBAC Token  | Operational Plane        | Domain & Context Aliases                     |
+--------------------------+--------------------------+----------------------------------------------+
| 1. ADMIN                 | Institutional Plane      | Institutional Administrator                  |
+--------------------------+--------------------------+----------------------------------------------+
| 2. DEVELOPER             | Technical Control Plane  | System Operator, DevOps Engineer             |
+--------------------------+--------------------------+----------------------------------------------+
| 3. FACULTY               | Academic Assessment      | Examiner, Academic Instructor, Course Author |
+--------------------------+--------------------------+----------------------------------------------+
| 4. INVIGILATOR           | Live Supervision         | Proctor, Exam Supervisor, Room Monitor       |
+--------------------------+--------------------------+----------------------------------------------+
| 5. STUDENT               | Examination Delivery     | Candidate, Examinee, Test-Taker              |
+--------------------------+--------------------------+----------------------------------------------+
```

> **Role & Alias Reconciliation Standard:**
> All database schemas, migrations, check constraints, JWT payloads, and backend authorization middleware strictly use the authoritative identifiers: `ADMIN`, `DEVELOPER`, `FACULTY`, `INVIGILATOR`, and `STUDENT`.
> Domain aliases (`Examiner` for Faculty, `Proctor` for Invigilator, `Candidate` for Student) represent human-facing UI labels and academic terminology. They do not constitute separate database roles or distinct RBAC permissions.

### 4.1 Authoritative User Account State Machine
User accounts across all 5 roles are governed by a deterministic 4-state lifecycle model:

```
                  +-----------------------------------+
                  |                                   |
                  |             [ ACTIVE ]            |
                  |     (Normal operational access)   |
                  |                                   |
                  +--------+------------------+-------+
                           |                  |
    Auth Lockout threshold |                  | Admin Suspends
    (5 failed / 15m)       |                  | (Disciplinary / Review)
                           ▼                  ▼
              +------------+----+       +-----+-------------+
              |                 |       |                   |
              |    [ LOCKED ]   |       |   [ SUSPENDED ]   |
              |   (Auth Lock)   |       |   (Admin Hold)    |
              |                 |       |                   |
              +-------+---------+       +-----+-------------+
                      |                       |
      Cooldown passes |                       | Admin Restores
      or Admin Unlock |                       |
                      |                       |
                      ▼                       |
               (Back to ACTIVE)               |
                      |                       |
                      +-----------+-----------+
                                  |
                                  | Admin Deactivates
                                  | (Permanent / Exit)
                                  ▼
                        +---------+---------+
                        |                   |
                        |   [ DISABLED ]    |
                        |    (Deactivated)  |
                        |                   |
                        +-------------------+
```

- **`ACTIVE`**: Normal operational status. User can authenticate, receive tokens, and access authorized role surfaces.
- **`LOCKED`**: **Temporary, automated authentication lockout**.
  - *Trigger*: Automatically engaged when consecutive failed login attempts reach threshold (5 failed attempts within 15 minutes). It is NOT an administrative status.
  - *Behavior*: Rejects login attempts with HTTP `423 Locked` (or `401 Unauthorized` with `Retry-After: 900`).
  - *Resolution*: Automatically clears back to `ACTIVE` upon cooldown expiration (15 minutes), or immediately via administrative unlock / password reset.
- **`SUSPENDED`**: **Persistent, reversible administrative status**.
  - *Trigger*: Imposed by an Administrator (e.g. academic integrity investigation, disciplinary hold, tuition hold).
  - *Behavior*: Retains student enrollments, attempt records, and course associations, but completely blocks active login and examination participation with HTTP `403 Forbidden` (`ACCOUNT_SUSPENDED`).
  - *Resolution*: Can only be cleared back to `ACTIVE` by an explicit administrative action.
- **`DISABLED`**: **Persistent, terminal/deactivated administrative status**.
  - *Trigger*: Imposed by an Administrator for permanent account deactivation (e.g. student withdrawal, graduation, faculty/staff departure).
  - *Behavior*: Immediately revokes all active refresh tokens, cancels pending exam enrollments, and permanently blocks authentication with HTTP `403 Forbidden` (`ACCOUNT_DISABLED`).
  - *Resolution*: Terminal status; re-enabling requires explicit Super Admin restoration.

### 4.2 Administrator Role (Institutional Control Plane)
- **Account / User Lifecycle Management**:
  - Direct creation of Candidate, Faculty, Invigilator, and authorized Developer accounts.
  - Bulk account ingestion via structured CSV files with atomic transaction guarantees and format validation.
  - User search, multi-attribute filtering (name, email, role, status, enrollment number, department), and pagination.
  - Account lifecycle state transitions: enforcing authoritative transitions across `ACTIVE`, `LOCKED`, `DISABLED`, `SUSPENDED`.
  - Secure credential resets: generates temporary credentials and forces password change on next login.
  - Role assignment and permission grants adhering to strict administrative privilege hierarchy.
- **Per-Student Configuration & Academic Accommodations**:
  - Profile metadata management (enrollment number, department, semester, academic standing).
  - Exam accommodation configuration: setting extra time multipliers (e.g. 1.25x, 1.5x, 2.0x), break allowances, and assistive technology flags.
  - Proctoring strictness overrides: configuring individualized sensitivity adjustments for candidates with medical accommodations.
  - Verification overrides: manual verification status overrides and retry counter resets.
- **Organization & Academic Policy Management**:
  - Global institution settings: campus name, academic terms, branding, contact configuration.
  - Exam policy defaults: default duration windows, passing score thresholds, auto-evaluation tolerances.
  - Identity verification rules: mandatory document types, verification strictness, maximum retry limits.
  - Proctoring policy baselines: required media streams (webcam, mic, screen), violation severity weights.
  - Evidence retention and automated purging rules conforming to FERPA and institutional data governance.
- **Institutional Admin Dashboard & Audit**:
  - Aggregate metrics: Total registered users by role, active exam blueprints, scheduled sessions, live examinations in progress, completed assessments.
  - Verification review queue: pending document verifications, biometric review requests, flagged identity mismatches.
  - Administrative audit trail: searchable inspection of all user creations, role grants, credential resets, and platform configuration updates.

### 4.3 Developer / System Operator Role (Technical Control Plane)
- **Architectural Security Boundary: Technical Telemetry vs. Business Data**:
  - The Developer role is designed strictly for infrastructure and application maintenance.
  - **Zero Unrestricted Business Data Access**: Developers cannot view candidate personal records, raw government ID documents, biometric images, or exam submission answers.
  - **Granular Privilege Matrix**:
    - `System Health Probes`: **READ** (all 12+ subsystems)
    - `Centralized System Logs`: **READ** (with mandatory automated PII masking)
    - `Prometheus Operational Metrics`: **READ** (CPU, memory, latency, pool utilization)
    - `Technical Audit Stream`: **READ** (authentication failures, deployments, system errors)
    - `Infrastructure Topology`: **READ** (service nodes, replica status, network paths)
    - `Service Maintenance & Cache Flush`: **CONTROL (Restricted)** (requires explicit administrative confirmation and audit record)
    - `Runtime Configuration Tuning`: **CONTROL (Restricted)** (rate limits, log levels, timeout adjustments)
    - `Raw Candidate Biometrics & Documents`: **DENIED by Default**
    - `Candidate Exam Answers & Scores`: **DENIED by Default**
- **System Health Observability**:
  - Live health status indicators for every subsystem: `UP`, `DEGRADED`, `DOWN`, `UNKNOWN`.
  - States derived dynamically from active probes, latency benchmarks, heartbeat freshness, connection pool saturation, and error rates (never manual labels).
  - Monitored components: Backend API process, PostgreSQL Primary, PostgreSQL Replicas, Redis, RabbitMQ, WebSocket Gateway, WebRTC SFU Workers, Coturn STUN/TURN, Outbox Poller, Evaluation Consumer, AWS S3 Storage, Automated Backup Service.
- **Centralized System Logs & Technical Audit**:
  - Centralized log viewer aggregating structured JSON logs across backend, workers, proxies, and database engines.
  - Real-time filtering by service name, log severity (`debug`, `info`, `warn`, `error`, `fatal`), timestamp range, host identity, request ID, trace ID, and event taxonomy.
  - Technical audit feed capturing authorization failures, rate-limit triggers, deploy events, configuration changes, and system crashes.
- **Infrastructure Topology & Incident Visibility**:
  - Visual diagram of the runtime architecture mapping traffic flow: Internet $\to$ Edge Reverse Proxy $\to$ Backend Instances $\to$ Primary Database $\to$ Replicas, Redis, RabbitMQ, SFU, S3.
  - Live indicator of primary/replica replication lag, disconnected nodes, and unhealthy dependencies.
  - Incident triage board highlighting active degradation, queue backlogs, failed backup runs, and unroutable messages.

### 4.4 Faculty / Examiner Role (Academic Assessment Plane)
- **Exam Blueprint Authoring**: Create and edit structured exam blueprints with title, subject, passing marks, total duration, and instructions.
- **Topic Rules & Difficulty Composition**: Define topic distribution rules balancing question counts across subjects, topics, and difficulty levels (`EASY`, `MEDIUM`, `HARD`).
- **Reusable Question Bank**: Author, import, clone, and categorize questions across supported types (MCQ, True/False, Numeric) with rich text, MathJax formulas, and code snippets.
- **Session Scheduling & Room Management**: Schedule examination windows, select campus rooms, allocate seat capacities, assign candidate rosters, and designate invigilators.
- **Assessment Oversight & Manual Grading**: Inspect automated evaluation results, manually grade open-ended or disputed answers, adjust points with mandatory justification, and sign off on final scorecards.
- **Result Release Control**: Configure and execute result visibility policies (`IMMEDIATE`, `SCHEDULED`, `MANUAL`) and inspect grade distribution analytics.

### 4.5 Invigilator / Proctor Role (Live Supervision Plane)
- **Live Multi-Stream Video Grid**: Monitor up to 12 candidate webcam and screen feeds simultaneously with automatic pagination and connection health indicators.
- **Candidate Detail Drawer**: Inspect high-resolution video/audio streams, hardware status, network latency, and historical readiness checks for selected candidates.
- **Real-Time Violation Timeline**: Live feed of automated proctoring events (tab switch, window blur, multi-display, face absence) with server-authoritative anomaly scores.
- **Direct Candidate Interventions**:
  - Broadcast session-wide announcements
  - Send private 1-on-1 warning messages to specific candidates
  - Pause a candidate's exam attempt during suspected integrity violations
  - Emergency terminate an exam attempt with mandatory documented justification
- **Evidence Review & Post-Session Sign-Off**: Inspect captured S3 evidence snapshots and submit post-session invigilation incident reports.

### 4.6 Candidate / Student Role (Examination Delivery Plane)
- Complete self-service portal covering onboarding, identity verification, exam discovery, pre-exam check-in, real-time exam taking, answer persistence, and results inspection through the authoritative 20-step user journey.

---

## 5. Candidate / Student Complete Journey & State Transition Matrix

The candidate experience encompasses a deterministic 20-step user journey. Every transition enforces explicit success, failure, retry, loading, timeout, blocked, and user guidance states.

```
Account Created (Admin / Reg)
  │
  ▼
[1] Credential Activation & First Login
  │
  ▼
[2] Student Profile Completion (Department, Semester, Enrollment)
  │
  ▼
[3] ID Document Capture & Upload (Government / Student ID)
  │
  ▼
[4] Document Verification Processing (Automated OCR / Admin Review)
  │
  ▼
[5] Biometric Face Enrollment (Reference Image & Embedding Generation)
  │
  ▼
[6] Exam Schedule Discovery & Eligible Session Selection
  │
  ▼
[7] Pre-Exam Check-In (Hardware, Camera, Mic, Network, Screen Permissions)
  │
  ▼
[8] Pre-Exam Face Verification & Liveness Challenge (Anti-Spoofing)
  │
  ▼
[9] Rules Agreement & Exam Instructions
  │
  ▼
[10] Exam Launch & Attempt Initialization (Deterministic Shuffling, Server Timing)
  │
  ▼
[11] WebRTC SFU Media Publishing (Webcam, Mic, Screen Streams Active)
  │
  ▼
[12] Real-Time Exam Taking (Sanitized Questions, Server Drift Calibration)
  │
  ▼
[13] Resilient Answer Autosave (Debounced 1,000ms, OCC Revision Tracking)
  │
  ▼
[14] Real-Time Proctoring Telemetry (Violations, Anomalies, Periodic Snapshots)
  │
  ▼
[15] Proctor Interventions (Warnings, Announcements, Direct Messages)
  │
  ▼
[16] Exam Submission (Idempotent Manual Submit or Authoritative Server Timeout)
  │
  ▼
[17] Media Stream Teardown & Camera/Mic Hardware Release
  │
  ▼
[18] Asynchronous Evaluation Processing (Transactional Outbox -> RabbitMQ -> Worker)
  │
  ▼
[19] Result Visibility Gate (Governed by Exam Release Policy)
  │
  ▼
[20] Candidate Scorecard Inspection & Post-Exam State
```

### Complete Journey State Transition Matrix

| Step # | Journey Step | Success State | Failure State | Retry State (Limits) | Loading State | Blocked State | User Guidance & UI Feedback |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Account Activation** | Valid credentials, session token issued, redirect to onboarding | Invalid password, expired activation token | Max 5 failed attempts before 15m account lock (`LOCKED`) | Spinner with "Authenticating..." | Account `LOCKED`, `DISABLED`, or `SUSPENDED` | "Check your email for activation link or contact administrator." |
| **2** | **Profile Completion** | Profile validated and saved to PostgreSQL | Missing required fields, invalid enrollment number | Unlimited retries until submitted | Spinner with "Saving profile..." | Incomplete profile blocks exam registration | "Enter your registered enrollment number, department, and semester." |
| **3** | **ID Capture & Upload** | Clean image captured, direct S3 upload confirmed (`200 OK`) | Blurry image, glare detected, unsupported format | Max 3 uploads per session | Progress bar: "Uploading ID..." | Upload failure blocks verification | "Align ID within the bounding frame. Ensure good lighting and readable text." |
| **4** | **Document Verification** | Verification status `APPROVED` by automated check or Admin | Document rejected (unreadable, expired, name mismatch) | Max 3 re-submissions before admin lock | Badge: "Verification Pending" | Status `REJECTED` blocks exam entry | Rejection reason displayed (e.g. "Name on ID does not match enrollment record"). |
| **5** | **Face Enrollment** | High-quality face detected, embedding stored | Poor lighting, face not centered, multiple faces | Max 5 attempts before manual review | Camera preview with oval guide | Incomplete enrollment blocks biometric gate | "Position your face inside the oval. Look straight into the camera." |
| **6** | **Session Discovery** | Assigned sessions displayed with start/end windows | No scheduled sessions found | Auto-refresh every 30s | Skeleton cards: "Loading sessions..." | Session window not yet open (`SCHEDULED`) | "Your exam session opens at 10:00 AM. Countdown displayed." |
| **7** | **Hardware Readiness** | Camera, mic, and screen permissions granted; bandwidth OK | Permission denied, device not found, high latency | Retry button to re-request browser permissions | Modal: "Testing hardware..." | Missing camera/mic blocks attempt launch | "Browser blocked camera access. Click camera icon in address bar to allow." |
| **8** | **Pre-Exam Biometrics** | Liveness challenge passed, face match >= calibrated target (initial: 0.85) | Match failed (< target), liveness challenge failed | Max 3 verification attempts | Video scan: "Verifying identity..." | Failed verification blocks exam start | "Turn your head slowly to the left. Match failed: Please adjust lighting." |
| **9** | **Rules Agreement** | Checkbox confirmed, instructions acknowledged | Launch attempted without agreeing | N/A | Button state: "Initializing..." | Unchecked box disables "Start Exam" | "You must read and accept the examination integrity rules to proceed." |
| **10** | **Attempt Launch** | Attempt initialized (`ACTIVE`), questions mapped | Window closed, unauthorized candidate | Idempotent: safe to click multiple times | Full-screen loader: "Preparing exam..." | Exam window passed (`EXPIRED`) | "Preparing your personalized question set. Do not refresh." |
| **11** | **WebRTC Media Connect**| SFU transport connected, tracks publishing | SFU connection drop, ICE failure | Automatic ICE restart and transport retry | Status badge: "Connecting media..." | Media failure triggers proctor warning | "Video stream active. Ensure your webcam remains uncovered." |
| **12** | **Exam Taking** | Questions rendered, choices selectable, timer ticking | Question render error, client network drop | Seamless local state caching | Skeleton question: "Loading..." | Attempt terminated by proctor | "Question 3 of 50. Mark for review available." |
| **13** | **Answer Autosave** | Answer persisted to PostgreSQL (`200 OK`, rev + 1) | Network timeout, OCC stale revision conflict | Auto-retry with 1,000ms debounce buffer | Badge: "Saving answer..." | Attempt expired blocks saves | "All answers saved to server. Offline: Answers stored in memory only." |
| **14** | **Proctoring Telemetry** | Events ingested, anomaly score updated | Client telemetry dropped | Buffered in memory and flushed on reconnect | Transparent background process | High violation score triggers proctor pause | "Warning: Full-screen exit detected and recorded on your audit log." |
| **15** | **Proctor Interventions**| Message received and acknowledged | Disconnected WebSocket | Automatic socket reconnect via exponential backoff | Toast alert with audible chime | Exam paused by proctor blocks input | "Proctor Message: Please keep your eyes on the screen." |
| **16** | **Exam Submission** | Attempt state `SUBMITTED`, outbox event written | Double submission, network drop during submit | Idempotent: reuses UUID `Idempotency-Key` | Full-screen modal: "Submitting..." | Attempt already submitted blocks edit | "Exam submitted successfully! Verification code: #SUB-8921." |
| **17** | **Media Teardown** | Hardware tracks stopped, camera light turns off | Browser track leak | Explicit `stopMediaStream` cleanup hook | Transparent | N/A | "Camera and microphone have been safely disconnected." |
| **18** | **Async Evaluation** | Worker grades objective items, score persisted | Worker queue delay | Automated dead-letter retry (Tiers 0–2) | Scorecard badge: "Grading in progress" | Corrupted submission flags admin | "Your submission is being processed by the evaluation engine." |
| **19** | **Visibility Gate** | Exam release conditions satisfied | Release conditions pending (`403`) | Auto-refresh button | Status card: "Awaiting results release" | Exam still live blocks score visibility | "Results will be released automatically when the exam concludes." |
| **20** | **Scorecard Inspection** | Score, percentage, and summary rendered cleanly | Unauthorized attempt access | N/A | Skeleton card: "Loading scorecard..." | BOLA violation: `403 Forbidden` | "Your Score: 84/100 (84%) — Status: PASSED. Feedback available." |

---

## 6. Dedicated Product Architecture Deep Dives

### 6.1 ID & Document Verification Product Architecture
- **Document Type Taxonomy**: Supports National Identity Card, Passport, Driver's License, and Institutional Student Card.
- **Client-Side Capture Pipeline**:
  - High-resolution HTML5 canvas capture with aspect-ratio framing guide (85.60 mm $\times$ 53.98 mm ID-1 card format).
  - Client-side pre-flight checks: blur detection using Laplacian variance, glare detection via luminance thresholding, and resolution validation (minimum $1200 \times 800$ pixels).
- **Secure Storage Architecture**:
  - Captured document images upload directly to private S3 bucket under encrypted prefix `/identity/{userId}/documents/{documentId}.jpg` using short-lived presigned PUT URLs.
  - S3 server-side encryption via AES256; public access strictly blocked; bucket access restricted to IAM role.
  - Strict retention policy: ID document artifacts are permanently purged 90 days after academic term conclusion, retaining only hash and verification status metadata in PostgreSQL.
- **Verification Engine & Workflow**:
  - Optical Character Recognition (OCR) extraction parses candidate name, date of birth, document number, and expiration date.
  - Automated match engine compares OCR data against student registration records (Levenshtein distance <= 2 on full name, exact match on DOB).
  - Status transitions: `UNVERIFIED` $\to$ `DOCUMENT_SUBMITTED` $\to$ `AUTOMATED_MATCH_PASSED` / `PENDING_MANUAL_REVIEW` $\to$ `VERIFIED` / `REJECTED`.
  - Manual review workspace for institutional administrators with side-by-side document image and enrollment profile comparison, documented rejection taxonomy (Blurry, Expired, Wrong Name, Suspected Tampering), and student notification.

### 6.2 Biometric Face Enrollment, Verification & Anti-Spoofing Architecture
- **Three Isolated Biometric Planes**:
  1. **Pre-Exam Enrollment Plane**: Establishes immutable baseline identity.
  2. **Pre-Exam Verification Plane**: Validates live candidate matches enrolled baseline before exam launch.
  3. **In-Exam Face Presence Plane**: Continuously monitors presence, gaze, and room occupancy without re-authenticating identity.
- **Reference Face Enrollment Workflow**:
  - Front-facing camera feed captured with oval face mesh alignment guide.
  - Quality validation checks: Inter-pupillary distance >= 90 pixels, pitch/yaw angles within $\pm 15^\circ$, uniform illumination, zero motion blur.
  - Facial embedding extraction: Generates a normalized 128-dimensional or 512-dimensional vector embedding stored in PostgreSQL `face_biometrics` table.
  - Privacy boundary: Raw enrollment photographs stored only in encrypted private S3; operational matching executes entirely against mathematical vector embeddings.
- **Pre-Exam Verification & Matching**:
  - Candidate captures live selfie in Pre-Exam Readiness workspace.
  - Face matching service calculates cosine similarity: $\text{sim}(u, v) = \frac{u \cdot v}{\|u\| \|v\|}$.
  - Server-authoritative verification threshold: Match accepted when cosine similarity >= calibrated threshold (initial policy baseline: 0.85).
  - Secondary cross-check: Face is compared against photo extracted from verified government ID document.
- **Passive & Active Liveness / Anti-Spoofing Protocol**:
  - **Passive Liveness**: Frequency-domain texture analysis and micro-motion detection distinguishing live skin from printed paper, curved photograph surfaces, and digital LCD screens.
  - **Active Challenge-Response Protocol**: Server generates an unpredictable ephemeral challenge sequence (e.g. "Slowly turn head right $\to$ Blink twice $\to$ Smile").
  - Response validation: Real-time optical flow tracks facial landmarks, verifying prompt execution order within an initial challenge window target of <= 8 seconds before issuing a signed verification token.
- **Biometric Parameters as Calibrated Engineering Targets**:
  - Initial policy parameters: Cosine similarity threshold >= 0.85, target False Accept Rate (FAR) < 0.1%, and challenge response window <= 8 seconds are **ENGINEERING TARGETS / INITIAL POLICY PARAMETERS**.
  - Final operational thresholds require empirical calibration and benchmark validation against the selected model and diverse testing datasets.
  - Threshold modifications must be strictly server-authoritative, controlled, and recorded in immutable audit logs.

### 6.3 Live Proctoring Product Workflows & Interventions
- **Candidate Hardware & Environmental Pre-Flight**:
  - Automated camera resolution and frame rate probe (minimum 720p @ 15fps).
  - Microphone audio level detection (background noise thresholding).
  - Browser display capture probe (screen share validation when exam rules mandate).
  - Network latency and jitter benchmark (rejecting connections with > 500ms RTT to media relay).
- **Invigilator Monitoring Workstation**:
  - Paginated video matrix rendering up to 12 simultaneous WebRTC video streams.
  - Real-time stream state overlay: Green (Healthy media & low risk), Yellow (Media jitter or moderate risk), Red (High risk anomaly score > 50 or media disconnected).
  - Candidate Detail Drawer: Full-screen video inspection, high-resolution screen share stream, audio VU meter with solo listening toggle, hardware track status, and interactive violation timeline.
- **Server-Authoritative Real-Time Interventions**:
  - **Broadcast Room Alert**: Invigilator sends a room-wide alert banner displayed across all active candidate screens (e.g. "15 minutes remaining").
  - **Private Warning**: Invigilator sends a direct 1-on-1 warning to a flagged student requiring explicit candidate acknowledgement click.
  - **Pause Exam**: Invigilator pauses an attempt remotely; candidate inputs are locked locally, exam timer is frozen on server, and full-screen pause modal appears.
  - **Emergency Termination**: Invigilator terminates attempt immediately for severe academic integrity violations; attempt transitions to `TERMINATED`, active inputs are discarded, and reason is logged in immutable audit records.

### 6.4 Faculty / Examiner Product Workflows
- **Exam Blueprint Builder**: Define title, subject, duration, passing score, total marks, topic rules, and proctoring strictness level.
- **Reusable Question Bank**: Author, import, clone, and manage questions with subject/topic tags, difficulty ratings, rich text, MathJax equations, and code blocks.
- **Session Scheduling**: Associate blueprints with academic terms, campus rooms, start/end time windows, candidate rosters, and assigned invigilators.
- **Assessment Oversight & Manual Grading**: Inspect automated evaluation results, manually grade open-ended or disputed items against rubrics, provide feedback, and adjust scores with documented rationale.
- **Release Policy & Analytics**: Manage results publication policy (`IMMEDIATE`, `SCHEDULED`, `MANUAL`) and inspect grade distributions, pass rates, and item discrimination metrics.

### 6.5 Invigilator / Proctor Workstation Product Workflows
- **Session Dashboard**: View assigned active and upcoming sessions, room allocations, enrolled student counts, and live attempt statuses.
- **Live Supervision Console**: 12-candidate paginated video matrix with WebRTC health badges, audio VU meters, and risk score sorting.
- **Candidate Detail Drawer**: High-resolution video/screen inspect, real-time violation timeline, proctoring notes, and hardware status.
- **Intervention Controls**: Broadcast announcements, send 1-on-1 warnings, pause exam attempts, and execute emergency attempt terminations with mandatory reasons.
- **Post-Session Sign-Off**: Review session violation summaries, inspect snapshot evidence, compile invigilation notes, and sign off on room completion.

### 6.6 Developer & System Operations Portal
- **Technical Observability vs Business Data Separation**:
  - Developers have full technical telemetry and operational maintenance privileges.
  - Developers are strictly DENIED access to student PII, government ID cards, biometric images, and exam answers.
- **Comprehensive Subsystem Health Monitor**:
  - Active probes query: Backend API, PostgreSQL Primary, PostgreSQL Replicas, Redis, RabbitMQ, WebSocket Gateway, WebRTC SFU Workers, Coturn STUN/TURN, Outbox Poller, Evaluation Consumer, S3 Storage, Backup Daemon.
  - Standardized health states: `UP`, `DEGRADED`, `DOWN`, `UNKNOWN` derived from live probes, connection pool utilization, latency, and queue depths.
- **Centralized System Logs Viewer**:
  - Sub-second log aggregation and search across backend, workers, and infrastructure containers.
  - Search and filter by service, severity (`debug` to `fatal`), timestamp range, trace ID, request ID, and host.
  - Automated PII masking ensures candidate names, emails, and sensitive values are scrubbed prior to log rendering.
- **Infrastructure Topology Map**:
  - Visual service mesh diagram rendering active components, primary/replica database links, replication lag, and connection health.
- **Incident & Alerting Board**:
  - Surfaces active component degradation, failed deployment runs, failed database backups, RabbitMQ DLQ accumulations, and database pool saturation.

### 6.7 WireGuard Secure Management Plane & Network Segmentation
- **Management Plane Isolation**:
  - WireGuard VPN service deployed on management gateway/host using static IP subnet `10.100.0.0/24`.
  - Administrative SSH (port 22) and Developer/Admin web interfaces restricted strictly to WireGuard VPN peers (`10.100.0.0/24` or `var.admin_cidr`).
  - Public access to administrative ports from `0.0.0.0/0` is strictly blocked.
- **Candidate Examination Network Separation**:
  - Candidate web traffic (HTTPS port 443), WebSocket signaling (WSS port 443), and WebRTC SFU media (UDP ports 40000–49999) route through public edge reverse proxy (Nginx).
  - Candidates do NOT require, nor are they permitted access to, the WireGuard management VPN.
- **Peer Lifecycle Management**:
  - Automated scripts generate server/client keys, preshared keys, and `.conf`/QR code profiles for authorized engineers.
  - Instant peer revocation and key rotation runbooks; handshake monitoring integrated with CloudWatch.

### 6.8 Per-Student Configuration & Academic Accommodations
- **Individual Student Profile & Metadata**:
  - Enrollment number, department, semester, academic standing, and custom institutional metadata.
- **Verification Lifecycle Tracking**:
  - Real-time status: `UNVERIFIED`, `DOCUMENT_SUBMITTED`, `PENDING_REVIEW`, `VERIFIED`, `REJECTED`.
  - Allowed verification retry count, rejection history, and administrative override flags.
- **Academic Accommodations**:
  - Extra time multiplier (e.g. 1.25x, 1.5x, 2.0x) automatically extending attempt deadlines during exam initialization.
  - Custom break/pause allowances and assistive technology flags (screen reader, high-contrast mode).
- **Proctoring Strictness Overrides**:
  - Individual adjustments for medical accommodations (e.g. permitted movement, alternative lighting allowances).
- **Candidate Comprehensive History**:
  - Exam attempt history, verification audit logs, incident flags, and individual results scorecards.
- **Privacy Boundary**: Sensitive configuration is strictly Admin/Student/Faculty-scoped; denied to Developer.

---

## 7. Frontend UI/UX Completeness, Design System & Role-Page-Feature Matrix

The ProctorNet frontend is structured across 4 visual density tiers with unified design tokens, full keyboard accessibility, responsive breakpoints, and complete state coverage (Loading, Empty, Error, Success, Retry).

### Comprehensive Role $\to$ Page $\to$ Feature Matrix

| Role | Page / Screen | Route | Key Components | Core Capabilities | Backend API | UX States Handled | Status | Phase |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Public** | Login Page | `/login` | `LoginForm`, `Input`, `Button`, `Card` | User authentication, token acquisition | `POST /api/v1/auth/login` | Loading, Error, Lockout countdown | `IMPLEMENTED` | Phase 10 |
| **Public** | Register Page | `/register` | `RegisterForm`, `Input`, `Select` | Candidate self-registration | `POST /api/v1/auth/register` | Loading, Validation errors, Success | `IMPLEMENTED` | Phase 10 |
| **Student** | Onboarding Wizard | `/candidate/onboarding` | `WizardStep`, `ProgressBar`, `ProfileForm` | Step-by-step profile completion | `PATCH /api/v1/candidate/profile` | Loading, Validation errors, Save success | `PLANNED` | Phase 24 |
| **Student** | Document Verification | `/candidate/verify-identity` | `DocumentCapture`, `CameraPreview`, `UploadCard`| Government / Student ID upload | `POST /api/v1/candidate/identity/*` | Camera loading, Blur warning, Upload progress | `PLANNED` | Phase 24 |
| **Student** | Face Enrollment | `/candidate/biometrics/enroll` | `FaceOvalGuide`, `LightingIndicator` | Reference facial embedding capture | `POST /api/v1/candidate/biometrics/*` | Pose feedback, Quality score, Success | `PLANNED` | Phase 25 |
| **Student** | Candidate Dashboard | `/candidate` | `SessionCard`, `StatusBadge`, `Countdown` | View eligible, upcoming, past exams | `GET /api/v1/sessions` | Loading skeleton, Empty list, Error retry | `IMPLEMENTED` | Phase 10 |
| **Student** | Pre-Exam Readiness | `/candidate/readiness/:id` | `HardwareCheck`, `BiometricGate`, `RulesModal`| Camera/mic test, face verification, launch | `POST /api/v1/sessions/:id/attempts` | Device check spinner, Biometric fail, Ready | `PARTIALLY IMPL`| Phase 10, 24, 25 |
| **Student** | Exam Taking Workspace | `/candidate/attempts/:id` | `QuestionRenderer`, `Timer`, `Autosave`, `Nav` | Question answer, debounced autosave, submit | `PUT /api/v1/attempts/:id/answers/*` | Offline banner, Save spinner, Expiry modal | `IMPLEMENTED` | Phase 10 |
| **Student** | Candidate Scorecard | `/candidate/attempts/:id/result`| `Scorecard`, `ProgressBar`, `FeedbackCard` | Score inspection, status badges | `GET /api/v1/attempts/:id/result` | Pending release card, Evaluated scorecard | `IMPLEMENTED` | Phase 10 |
| **Faculty** | Faculty Dashboard | `/faculty` | `ExamTable`, `StatCard`, `ActionMenu` | View authored blueprints and sessions | `GET /api/v1/exams` | Loading skeleton, Empty list, Error banner | `IMPLEMENTED` | Phase 10 |
| **Faculty** | Exam Editor | `/faculty/exams/:id` | `BlueprintForm`, `TopicRuleBuilder`, `PointsBar`| Author blueprint, topic rules, publish | `POST /api/v1/exams/:id/publish` | Validation errors, Publish confirmation | `IMPLEMENTED` | Phase 10 |
| **Faculty** | Question Bank Manager | `/faculty/question-bank` | `QuestionTable`, `RichTextEditor`, `MathJax` | Manage reusable question inventory | `GET/POST /api/v1/faculty/question-bank`| Search empty, Formula preview, Save success | `PLANNED` | Phase 26 |
| **Faculty** | Session Manager | `/faculty/sessions` | `ScheduleForm`, `RoomSelector`, `RosterUpload` | Schedule sessions, assign students/proctors | `POST /api/v1/sessions` | Capacity error, Success modal, Empty rooms | `IMPLEMENTED` | Phase 10 |
| **Faculty** | Manual Grading Workspace | `/faculty/exams/:id/grading` | `AnswerCompare`, `RubricScorer`, `FeedbackBox` | Review and grade subjective questions | `POST /api/v1/results/:id/manual-grade` | Loading queue, Score validation, Saved toast | `PLANNED` | Phase 26 |
| **Faculty** | Results & Analytics | `/faculty/exams/:id/results` | `ResultsTable`, `Histogram`, `ReleaseModal` | Inspect summary KPIs, release policy | `POST /api/v1/exams/:id/results/publish`| Empty results, Policy locked, Export CSV | `IMPLEMENTED` | Phase 10 |
| **Invigilator**| Invigilator Dashboard | `/invigilator` | `SessionCard`, `ActiveCountBadge` | View assigned active and upcoming sessions | `GET /api/v1/sessions` | Loading skeleton, Empty sessions card | `IMPLEMENTED` | Phase 10 |
| **Invigilator**| Live Supervision Console | `/invigilator/sessions/:id`| `VideoGrid`, `HealthBadge`, `CandidateDrawer` | 12-stream grid, audio meters, interventions | `POST /api/v1/attempts/:id/pause` | Stream connecting, Video lost, Alert modal | `PARTIALLY IMPL`| Phase 17, 27 |
| **Admin** | Admin Overview | `/admin` | `GlobalKPICards`, `AlertsBanner`, `QuickNav` | High-level system counts and health | `GET /api/v1/exams`, `GET /api/v1/sessions`| Loading skeleton, Alert banner | `IMPLEMENTED` | Phase 10 |
| **Admin** | User Management Portal | `/admin/users` | `UserTable`, `RoleBadge`, `StatusToggle` | Manage accounts across all 5 roles | `GET/POST/PATCH /api/v1/admin/users` | Search empty, Reset password modal, Save | `PLANNED` | Phase 23 |
| **Admin** | Create User Screen | `/admin/users/create` | `UserForm`, `RoleSelect`, `PasswordGen` | Direct account creation across all roles | `POST /api/v1/admin/users` | Form validation, Temp password modal, Save | `PLANNED` | Phase 23 |
| **Admin** | Bulk CSV Import Tool | `/admin/users/bulk-import` | `FileUpload`, `DataGridPreview`, `ErrorTable` | Bulk ingest student/faculty accounts | `POST /api/v1/admin/users/bulk-import` | Parsing progress, Format error report | `PLANNED` | Phase 23 |
| **Admin** | Organization Settings | `/admin/organization` | `OrgForm`, `PolicyConfig`, `DefaultsCard` | Campus terms, branding, policy defaults | `GET/PUT /api/v1/admin/organization` | Loading settings, Save confirmation toast | `PLANNED` | Phase 23 |
| **Admin** | Verification Review Queue| `/admin/verifications` | `DocumentViewer`, `SideBySideCompare`, `Action`| Review and approve ID documents | `GET/PATCH /api/v1/admin/verifications` | Empty queue, Rejection modal with reasons | `PLANNED` | Phase 24 |
| **Admin** | Per-Student Config | `/admin/students/:id` | `ProfileEditor`, `AccommodationForm` | Configure student accommodations/limits | `GET/PATCH /api/v1/admin/students/:id` | Loading profile, Save confirmation toast | `PLANNED` | Phase 24 |
| **Admin** | Administrative Audit | `/admin/audit` | `AuditTable`, `ActorFilter`, `TargetSelect` | View all administrative operations | `GET /api/v1/admin/audit` | Loading skeleton, Empty filter, Detail drawer| `PLANNED` | Phase 23 |
| **Developer** | Developer Overview | `/developer/overview` | `SubsystemGrid`, `KPICard`, `AlertBanner` | High-level engineering control plane | `GET /api/v1/developer/overview` | Component badges, Metric summary | `PLANNED` | Phase 28 |
| **Developer** | Subsystem Health Monitor | `/developer/health` | `HealthMatrix`, `LatencyGauge`, `PoolMeter` | Probe all 12+ components in real time | `GET /api/v1/developer/health` | Live polling spinner, DOWN service alert | `PLANNED` | Phase 28 |
| **Developer** | Central System Logs | `/developer/logs` | `LogStreamTable`, `FilterBar`, `TraceViewer` | Search structured logs with PII masking | `GET /api/v1/developer/logs` | Real-time stream indicator, Empty search | `PLANNED` | Phase 28 |
| **Developer** | Technical Audit Stream | `/developer/audit` | `TechnicalAuditTable`, `SeverityTag`, `JSON` | Inspect security and runtime audit events | `GET /api/v1/developer/audit` | Real-time polling, Detail drawer, Trace filter| `PLANNED` | Phase 28 |
| **Developer** | Infrastructure Topology | `/developer/topology` | `InteractiveServiceMesh`, `ReplicaLag` | Visual topology map of service mesh | `GET /api/v1/developer/topology` | Interactive zoom, Degraded link highlight | `PLANNED` | Phase 28 |
| **Developer** | Incident Triage & Alerts | `/developer/incidents` | `IncidentFeed`, `FailureTimeline`, `Action` | Surface DOWN/DEGRADED service triage | `GET /api/v1/developer/incidents` | Active incident banners, Triage modal | `PLANNED` | Phase 28 |

---

## 8. System Design Requirement Traceability Matrix

Every architectural requirement from the foundational specification (Notion Step 13.1 through 13.17) and subsequent system design discussions is mapped directly to its implementation status, phase, and acceptance criteria.

| Step | System Design Requirement | Architectural Scope | Phase | Status | Authoritative Acceptance Criteria |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **13.1** | Domain Model & State Machines | Authoritative state transitions for Exam, Attempt, and Questions | Phase 3 | `IMPLEMENTED` | State machines reject illegal transitions with domain exceptions (`InvalidStateTransitionError`). |
| **13.2** | PostgreSQL Database Authority | ACID transactional boundary, connection pooling, and baseline schema | Phase 2 | `IMPLEMENTED` | PostgreSQL is sole authoritative store; connection pool manages connection drops gracefully. |
| **13.3** | Authentication & RBAC/ABAC | Password hashing, JWT session lifecycle, role authorization | Phase 4 | `IMPLEMENTED` | Resource-level access control enforced; 401 on unauthorized and 403 on forbidden requests. |
| **13.4** | Exam Authoring & Scheduling | Blueprints, topic rules, publishing, session scheduling, rooms | Phase 5 | `IMPLEMENTED` | Exam authoring validated; multi-session scheduling with room capacity checks and rosters. |
| **13.5** | Modular Monolith & State Decoupling | In-process modular architecture, single-host EC2, stateless API | Phase 1, 10, 19, 20 | `IMPLEMENTED` | REST API, WebSocket, SFU worker, and outbox poller run in unified Node process on EC2. |
| **13.6** | Attempt Shuffling & Timing | Deterministic question mapping via PRNG, authoritative server timing | Phase 6 | `IMPLEMENTED` | 10 concurrent clicks result in exactly one attempt; question mapping consistent on reconnect. |
| **13.7** | Zero-Trust Client Threat Model | Client state untrusted, server-side validation, rate limiting | Phase 7, 8, 18 | `IMPLEMENTED` | Client timestamps ignored; request body signed with HMAC; tamper attempts rejected immediately. |
| **13.8** | Durable Answer Autosave & OCC | Revision tracking, optimistic concurrency, durable before ACK | Phase 7 | `IMPLEMENTED` | Answer saves committed to PostgreSQL before 200 OK; stale revision saves reject with 409 Conflict. |
| **13.9** | Idempotent Submission | Atomic state transition (`ACTIVE -> SUBMITTED`), Idempotency-Key | Phase 8 | `IMPLEMENTED` | Duplicate submissions return cached response idempotently; post-submission writes blocked. |
| **13.10** | Transactional Outbox & Async Grading | Outbox table in same DB transaction, RabbitMQ queue dispatch | Phase 8, 12 | `IMPLEMENTED` | Outbox events written atomically with business state; dispatched reliably with confirms. |
| **13.11** | Results Publication & Visibility | Scorecard visibility policies (`IMMEDIATE`, `SCHEDULED`, `MANUAL`) | Phase 9 | `IMPLEMENTED` | Scores concealed while exam is live; release policy immutable once results become visible. |
| **13.12** | Redis Non-Authoritative Cache | Rate limiting, token blacklist, exam blueprint cache-aside | Phase 11 | `IMPLEMENTED` | Redis failure does not crash API or lose answers; critical state falls back to PostgreSQL. |
| **13.13** | RabbitMQ Resilient Transport | Quorum queues, delayed retry exchanges, worker idempotency | Phase 12 | `IMPLEMENTED` | Failed evaluation jobs retried with backoff; duplicate deliveries processed idempotently. |
| **13.14** | WebSocket Realtime Control Plane | Room multiplexing, candidate heartbeats, proctor alerts | Phase 16 | `IMPLEMENTED` | Subprotocol authentication; candidate disconnects detected within seconds via ping/pong sweep. |
| **13.15** | WebRTC SFU Multi-Party Media Plane | Dedicated mediasoup workers, isolated media gateway, Coturn | Phase 17 | `IMPLEMENTED` | Heavy video/audio forwarding has zero performance impact on core database or autosaves. |
| **13.16** | Private Object Storage & Evidence | Direct presigned PUT uploads, metadata verification, SHA-256 | Phase 15, 18 | `IMPLEMENTED` | Heavy media uploads bypass application server; file signatures verified via magic bytes. |
| **13.17** | Defensive Engineering & Auditing | Database-enforced append-only audit logs, W3C trace context | Phase 13, 14, 18 | `IMPLEMENTED` | Prohibited mutations (`UPDATE`, `DELETE`, `TRUNCATE`) on audit logs rejected with SQLSTATE 20000. |
| **Req-A** | Complete User Administration | Admin account creation across all roles, bulk CSV ingestion | Phase 23 | `PLANNED` | Admins manage user lifecycle; bulk import processes 500+ accounts in atomic transaction. |
| **Req-B** | Candidate Onboarding & ID Document | Document capture, OCR extraction, verification approval queue | Phase 24 | `PLANNED` | Candidates upload government ID; Admin review queue enables approval/rejection with reasons. |
| **Req-C** | Biometric Face & Anti-Spoofing | Reference face enrollment, pre-exam verification, liveness | Phase 25 | `PLANNED` | Face matching verifies identity (initial target: sim >= 0.85); presentation attacks rejected by liveness challenge. |
| **Req-D** | Question Bank & Manual Grading | Reusable question banks, MathJax/code, manual evaluation workspace | Phase 26 | `PLANNED` | Faculty manage question inventories; subjective questions graded with audit rationale. |
| **Req-E** | Live Proctoring Workstation | 12-stream grid, candidate drawer, direct warning/pause/terminate | Phase 27 | `PLANNED` | Proctors monitor live grid; interventions execute instantaneously over WebSocket control plane. |
| **Req-F** | Developer Control Plane Portal | Subsystem health matrix, masked system logs, topology map | Phase 28 | `PLANNED` | Live health across all 12+ components; log viewer filters events without PII leakage across all 6 pages. |
| **Req-G** | WireGuard Management Plane | Dedicated VPN service, peer lifecycle, network segmentation | Phase 29 | `PLANNED` | Port 22 unreachable from public internet; management plane isolated from candidate web traffic. |
| **Req-H** | Accessible UI/UX & E2E Validation | Full keyboard navigation, WCAG 2.1 AA, complete journey suites | Phase 30 | `PLANNED` | All 5 roles have polished interfaces; automated E2E journey tests pass across all flows. |
| **Req-I** | Advanced Real-Time AI Proctoring | Client Web Worker AI, gaze tracking, multi-face, voice detect | Phase 31 | `PLANNED` | Client AI runs at >= 15 fps; high-confidence anomalies feed server-authoritative risk score. |
| **Req-J** | Horizontal Scaling & High Availability| Multi-AZ RDS PostgreSQL, ElastiCache, ALB, SFU clustering | Phase 32 | `PLANNED` | Zero-downtime migration to managed AWS services; multi-AZ failover survives AZ outage. |
| **Req-K** | Final Security Penetration & ASVS | DAST/SAST, ASVS Level 2, dependency sweeps, compliance | Phase 33 | `PLANNED` | Zero critical/high vulnerabilities; FERPA/GDPR compliance baseline verified. |
| **Req-L** | Final Documentation & Runbooks | OpenAPI 3.1, operational runbooks, disaster recovery manual | Phase 34 | `PLANNED` | Engineer can set up, deploy, and operate ProctorNet independently from documentation alone. |

---

## 9. Phase Dependency Rules & Critical Path Analysis

The execution sequence strictly honors technical dependencies to ensure that no feature is prematurely implemented without its foundational prerequisites.

```
Phase 20 (AWS Infrastructure Baseline) [COMPLETE]
  │
  ▼
Phase 21 (Load Testing & Capacity Benchmarking)
  │
  ▼
Phase 22 (Failure, Resilience & Chaos Testing)
  │
  ├───────────────────────────────────────────────┐
  ▼                                               ▼
Phase 23 (User & Account Administration)      Phase 28 (Developer & System Operations Portal)
  │                                               │
  ▼                                               ▼
Phase 24 (Candidate Onboarding & Documents)   Phase 29 (WireGuard Management Plane)
  │
  ▼
Phase 25 (Biometric Face & Anti-Spoofing)
  │
  ├───────────────────────────────────────────────┐
  ▼                                               ▼
Phase 26 (Faculty Assessment & Question Bank) Phase 27 (Invigilation & Live Workstation)
  │                                               │
  └───────────────────────┬───────────────────────┘
                          ▼
Phase 30 (End-to-End UX, Accessibility & Design Polish)
  │
  ▼
Phase 31 (Advanced Real-Time AI Proctoring)
  │
  ▼
Phase 32 (Horizontal Scaling & Managed Service Migration) [Triggered by Phase 21 Benchmarks]
  │
  ▼
Phase 33 (Final Security Hardening, Penetration Testing & Compliance)
  │
  ▼
Phase 34 (Final Documentation, Runbooks & Release Handover)
```

### Critical Dependency Constraints:
1. **Empirical Benchmarks Before Scaling**: Horizontal multi-AZ scaling and managed RDS/ElastiCache migration (Phase 32) depend strictly on empirical bottleneck data obtained from Phase 21 load testing.
2. **Identity Before Exam Delivery**: ID Document Verification (Phase 24) and Biometric Face Enrollment (Phase 25) must be fully established before final candidate onboarding can be marked complete.
3. **Device Readiness Before Live Biometrics**: Pre-exam face verification and liveness challenges (Phase 25) depend on the camera and hardware access pipelines established in Phase 17 and Phase 24.
4. **Control Plane Before Live Workstation**: Invigilator live interventions (Phase 27) depend directly on the WebSocket signaling infrastructure (Phase 16) and WebRTC media streaming (Phase 17).
5. **Telemetry Before Developer Portal**: Developer health and log inspection (Phase 28) depends directly on the metrics, trace context, and structured logging established in Phase 13.
6. **Feature Existence Before UX Polish**: Phase 30 (UX, Accessibility & Design System Polish) depends on all preceding functional role portals (Phases 23–29) being fully implemented so that all screens, journeys, and states can be audited, polished, and validated end-to-end.

---

## 10. Testing Strategy & Quality Assurance Framework

Every future phase must execute and document a multi-tier testing regimen prior to commit and PR generation:

1. **Backend Unit Tests**: Pure domain logic, state machines, validation schemas, utility algorithms, and mathematical score calculations isolated from external I/O.
2. **Integration Tests**: Database query execution against PostgreSQL, Redis cache operations, RabbitMQ message publication and consumption, S3 presigned URL generation, and transactional boundaries.
3. **Authorization & Security Tests**: Explicit verification of RBAC/ABAC middleware, BOLA defense, role checks (`STUDENT`, `FACULTY`, `INVIGILATOR`, `ADMIN`, `DEVELOPER`), and token validation.
4. **Frontend Component Tests**: Unit testing of individual UI components with mock providers (React Testing Library / Vitest), validating rendering, props, callbacks, and accessible DOM structures.
5. **Frontend Page & Flow Tests**: Integration testing of page-level workflows, routing navigation, form validation, error states, and responsive viewports.
6. **API Contract Tests**: Verification of frontend API clients against backend route schemas, asserting exact status codes, payload structures, and error response envelopes.
7. **End-to-End (E2E) Journey Tests**: Playwright automated browser tests simulating complete user journeys from authentication through examination completion across all 5 user roles.
8. **Failure-Path & Chaos Tests**: Automated simulation of network drops, service disconnects, unhandled rejections, and stale revision conflicts.
9. **Accessibility Audits**: Automated axe-core scans asserting zero WCAG 2.1 AA violations, verified keyboard tab ordering, and screen reader announcements.
10. **Static Analysis & Security Sweeps**: Pre-commit linters, `terraform fmt`, `tflint`, Checkov IaC scanning, and npm dependency vulnerability audits.

---

## 11. Final Product Definition of Done (DoD)

> ### Authoritative Completion Rule:
> **ProctorNet is not considered complete when the backend is complete.**
> The product is complete only when every committed capability is fully functional through the user-facing web application and can be executed end-to-end by its authorized role with production-quality interaction, accessibility, feedback, error recovery, security, observability, and validation.
>
> A feature is **NOT COMPLETE** merely because an API exists, a backend module exists, a database table exists, or a basic UI exists. A product feature is **COMPLETE** only when the required backend, frontend, authorization, integration, persistence, error handling, loading/empty states, success states, retry states, audit behavior, security controls, user interaction, and E2E validation are all complete. The final website must be fully functional for every committed product feature.

```
PRODUCT COMPLETE
=
BACKEND
+ FRONTEND
+ ROLE FLOWS
+ IDENTITY
+ PROCTORING
+ AI
+ OPERATIONS
+ SECURITY
+ INFRASTRUCTURE
+ UX
+ E2E VALIDATION
```

### Complete User Journey Validation Across All 5 Roles:
Every role flow must execute end-to-end with clear loading, empty, error, retry, blocked, success, and confirmation behavior:
1. **ADMIN JOURNEY**:
   Login $\to$ Institutional Dashboard $\to$ User Management Overview $\to$ Create User / Bulk CSV Import $\to$ Verification Review Queue (Approve / Reject ID with notes) $\to$ Per-Student Configuration (Accommodations & Overrides) $\to$ Organization Settings $\to$ Administrative Audit Log Viewer $\to$ Sign out.
2. **DEVELOPER JOURNEY**:
   Login $\to$ Engineering Overview $\to$ Subsystem Health Matrix (All 12+ components) $\to$ Centralized Masked System Logs $\to$ Technical Audit Feed $\to$ Infrastructure Topology Map $\to$ Incident Triage & Alerts $\to$ Restricted Maintenance Operations (with confirmation) $\to$ Sign out.
3. **FACULTY / EXAMINER JOURNEY**:
   Login $\to$ Assessment Dashboard $\to$ Reusable Question Bank $\to$ Exam Blueprint Authoring (Rules & Scoring) $\to$ Session Scheduling (Rooms & Rosters) $\to$ Invigilator Assignment $\to$ Manual Grading Workspace (Rubrics & Overrides) $\to$ Analytics & Grade Distribution $\to$ Results Release Policy Trigger $\to$ Sign out.
4. **INVIGILATOR / PROCTOR JOURNEY**:
   Login $\to$ Assigned Sessions Dashboard $\to$ Live Supervision Console (12-stream grid) $\to$ Candidate Detail Drawer (High-res stream, VU meter, history) $\to$ Realtime Violation Feed $\to$ Issue Interventions (Warning, Broadcast Alert, Pause Attempt, Terminate Attempt with modal justification) $\to$ Evidence Review $\to$ Post-Session Sign-Off $\to$ Sign out.
5. **STUDENT / CANDIDATE JOURNEY**:
   Account Activation $\to$ First Login $\to$ Profile Completion $\to$ ID Document Capture & Upload $\to$ Face Enrollment $\to$ Eligible Exam Session Discovery $\to$ Pre-Exam Readiness (Hardware checks, Pre-exam face verification, Liveness challenge) $\to$ Rules Agreement $\to$ Exam Launch $\to$ WebRTC Media Publishing $\to$ Real-Time Exam Taking $\to$ Resilient OCC Answer Autosaves $\to$ Real-Time Proctoring & Interventions $\to$ Idempotent Submission $\to$ Hardware Release $\to$ Asynchronous Evaluation $\to$ Result Scorecard Inspection.

### The 33 Final Product Completion Criteria:
1. [ ] **All Backend Capabilities Implemented**: Every domain module (Auth, Users, Exams, Sessions, Attempts, Answers, Submissions, Evaluation, Results, Proctoring, Evidence, Audit, Developer) is fully implemented with zero mock endpoints.
2. [ ] **All Frontend Capabilities Implemented**: Every page, wizard, table, modal, and drawer defined in the Role-Page-Feature Matrix is built and operational.
3. [ ] **Complete 5-Role Portals**: Dedicated, fully functional web portals exist for Admin, Developer, Faculty, Invigilator, and Candidate roles.
4. [ ] **All Major User Journeys Executable End-to-End**: Every supported user journey can be completed in the browser without manual database manipulation or engineer intervention.
5. [ ] **Admin Account Lifecycle Complete**: Administrators can create, activate, deactivate, suspend, restore, and search accounts across all 5 roles with authoritative lifecycle state enforcement.
6. [ ] **Candidate Onboarding Complete**: Students can complete profiles, configure preferences, and receive assignment notifications.
7. [ ] **ID Document Verification Complete**: Candidates can upload government/student IDs, and administrators can review, approve, or reject submissions with documented reasons.
8. [ ] **Face Enrollment Complete**: Reference facial embeddings are captured, validated for quality, and stored securely.
9. [ ] **Face Verification Complete**: Pre-exam selfies match enrolled references and ID photos with measured similarity meeting calibrated policy targets (initial engineering target: sim >= 0.85).
10. [ ] **Liveness & Anti-Spoofing Operational**: Active challenge-response and passive texture analysis reject presentation attacks (photos, screen replays).
11. [ ] **Candidate Examination Flow Complete**: Pre-exam checks, question delivery, countdown timer, autosave, and submission function seamlessly end-to-end.
12. [ ] **Faculty Assessment Workflow Complete**: Question bank authoring, blueprint rules, multi-room scheduling, manual grading, and analytics operate cleanly.
13. [ ] **Invigilator Proctoring Console Complete**: Multi-stream video matrix, candidate detail drawer, live violation feed, and direct interventions (warn, pause, terminate) work in real time.
14. [ ] **Developer Technical Control Plane Complete**: Real-time system health, telemetry metrics, centralized log viewer, and technical audit feed are functional across all 6 developer screens.
15. [ ] **Comprehensive System Health Visible**: Live health indicators monitor all 12+ subsystems with zero manual status labels.
16. [ ] **Centralized System Logs Accessible**: Developers can search structured logs with sub-second response times and automated PII masking.
17. [ ] **Technical Audit Stream Enforced**: All critical administrative, technical, and security actions are immutably recorded and inspectable.
18. [ ] **Subsystem Failure Visibility Complete**: Down, degraded, and disconnected services are instantly surfaced on the Developer dashboard.
19. [ ] **Database Replication Visible**: Primary/replica status and replication lag are visible in topology once replicas are provisioned.
20. [ ] **Automated Backup Health Visible**: Backup execution history, S3 synchronization status, and restore verification alerts are monitored.
21. [ ] **Deployment Health Visible**: Active Git commit, container image manifest digest, and deployment history are tracked.
22. [ ] **WireGuard Management Plane Deployed**: Management network is operational, SSH port 22 is restricted to VPN peers, and candidate traffic is isolated without VPN dependency.
23. [ ] **Per-Student Configuration Complete**: Accommodations (time multipliers, break allowances), eligibility rules, and strictness overrides operate correctly with strict Developer denial.
24. [ ] **Role-Based Authorization Verified**: Strict RBAC and resource ownership boundaries are enforced across 100% of API endpoints and UI routes.
25. [ ] **Biometric & PII Privacy Protected**: Raw biometric images and government IDs are protected by encryption, strict S3 access policies, and automated retention purging.
26. [ ] **Database Audit Immutability Verified**: Prohibited mutations (`UPDATE`, `DELETE`, `TRUNCATE`) on audit logs are strictly rejected by database triggers.
27. [ ] **Standardized UI States Implemented**: Every page implements clear Loading, Empty, Error, Success, and Retry states.
28. [ ] **Accessibility & Responsiveness Compliant**: Full compliance with WCAG 2.1 AA accessibility standards and responsive layouts across viewports.
29. [ ] **Automated E2E Test Suites Passing**: End-to-end automated journey test suites (Playwright) pass with 100% green status across all 5 roles.
30. [ ] **Zero Unresolved UX Gaps**: All user interactions have clear feedback, confirmation dialogs for destructive actions, and clear error recovery paths.
31. [ ] **Zero Critical Security Vulnerabilities**: Security scans (SAST, DAST, npm audit, Checkov) report zero critical or high vulnerabilities.
32. [ ] **No Feature Completed on Backend Alone**: Every committed product capability is verified across backend, frontend, integration, and user experience.
33. [ ] **Website Fully Functional**: The ProctorNet platform delivers a unified, production-grade, secure online examination and proctoring experience across all supported devices.
