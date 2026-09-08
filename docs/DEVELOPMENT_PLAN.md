# ProctorNet Re-Architecture — Master Development Plan

## Project Implementation Status

```
+-------------------------------------------------------------------------+
| Current Phase:     Phase 2                                              |
| Current Milestone: Database & Migrations                                |
| Status:            Completed                                            |
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

### Phase 21 — Load Testing
- [ ] **Status:** Pending
- **Objective:** Validate system capacity, autosave throughput, submission bursts, and database connection limits under target concurrent workloads.
- **Dependencies:** Phase 20
- **Major Tasks:**
  - Create load testing scripts using k6 / Artillery.
  - Simulate 1,000 to 10,000 concurrent candidates starting exam simultaneously.
  - Simulate high-frequency periodic answer autosaves (1 save every 5–10 seconds per candidate).
  - Simulate synchronized end-of-exam submission spike.
  - Measure p95/p99 latency, error rates, DB CPU, and memory utilization.
- **Acceptance Criteria:**
  - p95 latency for answer autosave remains under 200ms at peak target concurrency.
  - Zero answer loss or database deadlocks during burst submission.
- **Tests Required:** k6 load test scenarios, burst concurrency benchmark reports.

---

### Phase 22 — Failure / Chaos Testing
- [ ] **Status:** Pending
- **Objective:** Verify system resilience, data durability, and recovery during network partitions, Redis crashes, RabbitMQ downtime, and DB failovers.
- **Dependencies:** Phase 21
- **Major Tasks:**
  - Test unexpected Redis outage during active exam session (verify zero answer loss and graceful fallback).
  - Test RabbitMQ queue downtime (verify transactional outbox accumulates events and drains cleanly on recovery).
  - Test sudden candidate network disconnects and reconnects.
  - Test database failover / connection pool exhaustion scenarios.
- **Acceptance Criteria:**
  - Core exam taking and answer persistence remain functional even when non-critical subsystems fail.
  - System recovers cleanly without manual data intervention.
- **Tests Required:** Chaos testing scripts and documented failure recovery runs.

---

### Phase 23 — Final Hardening
- [ ] **Status:** Pending
- **Objective:** Conduct end-to-end system validation, code auditing, performance profiling, dependency vulnerability sweeps, and pre-production checks.
- **Dependencies:** Phase 22
- **Major Tasks:**
  - Execute full end-to-end regression test suite across all user roles.
  - Perform dependency vulnerability audit (`npm audit`, Snyk).
  - Memory leak analysis and profiling on long-running backend processes and workers.
  - Review all database query execution plans (`EXPLAIN ANALYZE`) for missing indexes.
- **Acceptance Criteria:**
  - Zero critical/high vulnerabilities.
  - All automated tests pass with 100% green status.
  - All critical database queries execute with optimal index scans.
- **Tests Required:** Full regression suite, static security analysis, database index performance benchmarks.

---

### Phase 24 — Final Documentation
- [ ] **Status:** Pending
- **Objective:** Complete comprehensive developer guides, API specifications, operational runbooks, disaster recovery procedures, and handover documentation.
- **Dependencies:** Phase 23
- **Major Tasks:**
  - Generate OpenAPI / Swagger API reference documentation.
  - Author Operational Runbook (monitoring, alert responses, backup/restore procedures).
  - Author Developer Onboarding & Contribution Guide.
  - Archive all project ADRs and compile the final release changelog.
- **Acceptance Criteria:**
  - Documentation enables an engineer to onboard, run, deploy, and operate ProctorNet independently.
- **Tests Required:** Documentation accuracy audit and link verification.
