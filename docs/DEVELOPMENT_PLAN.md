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
- [ ] **Status:** Pending
- **Objective:** Implement secure candidate, proctor, and administrator authentication, password hashing, JWT/session management, and RBAC/ABAC authorization.
- **Dependencies:** Phase 3
- **Major Tasks:**
  - Implement password hashing using Argon2 / bcrypt with constant-time verification.
  - Implement user registration, login, token refresh, and logout endpoints.
  - Implement JWT token issue and verification with strict claims and expiration.
  - Implement resource-level authorization middleware (`requireRole`, `requirePermission`, `requireOwnership`).
  - Add brute-force protection and account lockout mechanics.
- **Acceptance Criteria:**
  - Unauthorized requests are rejected with `401 Unauthorized`.
  - Resource access across unauthorized tenants/users is rejected with `403 Forbidden`.
  - Authentication tokens are securely signed and verified.
- **Tests Required:** Auth unit tests, token expiration tests, RBAC/ABAC boundary integration tests.

---

### Phase 5 — Exams, Sessions & Assignments
- [ ] **Status:** Pending
- **Objective:** Build exam authoring, scheduling, candidate enrollment, and proctor assignment domain and API modules.
- **Dependencies:** Phase 4
- **Major Tasks:**
  - Database migrations for `exams`, `sections`, `questions`, `question_options`, `exam_candidates`, and `exam_proctors`.
  - Exam creation, modification, publishing, and scheduling API endpoints (Admin / Teacher role).
  - Candidate roster assignment and invitation token generation.
  - Proctor-to-candidate room allocation logic.
  - Strict window validation (scheduled start/end times vs. current authoritative server time).
- **Acceptance Criteria:**
  - Instructors can create multi-section exams with varying question types.
  - Candidates can only access exams for which they are explicitly scheduled within the valid time window.
- **Tests Required:** Exam creation API integration tests, scheduling validation tests, roster authorization tests.

---

### Phase 6 — Attempts & Question Mapping
- [ ] **Status:** Pending
- **Objective:** Implement candidate exam initialization, attempt creation, question order randomization/mapping, and attempt resumption.
- **Dependencies:** Phase 5
- **Major Tasks:**
  - Database migrations for `attempts` and `attempt_question_mappings`.
  - Implement `POST /api/exams/:id/start` endpoint with strict idempotency and single-attempt constraint.
  - Deterministic question shuffling / option randomization per candidate attempt.
  - Attempt resumption endpoint retrieving authorized question set and current server time remaining.
  - Enforce server-side authoritative timer calculation.
- **Acceptance Criteria:**
  - Multiple clicks on "Start Exam" result in exactly one attempt record (idempotent).
  - Attempt start fails if time window has not opened or has passed.
  - Question ordering is securely stored and consistent upon candidate reconnect/resume.
- **Tests Required:** Concurrency tests for duplicate attempt start, time window boundary tests, question mapping persistence tests.

---

### Phase 7 — Answers, Autosave & Concurrency
- [ ] **Status:** Pending
- **Objective:** Implement resilient, atomic, concurrency-safe answer saving with revision tracking and optimistic locking.
- **Dependencies:** Phase 6
- **Major Tasks:**
  - Database migrations for `answers` and `answer_revisions`.
  - Implement `PUT /api/attempts/:id/answers/:questionId` with revision ID and payload verification.
  - Optimistic locking mechanism to prevent out-of-order save overwrites over erratic networks.
  - Batch answer autosave endpoint (`POST /api/attempts/:id/answers/batch`).
  - Server-side validation that attempt is currently in `IN_PROGRESS` state and time has not expired.
- **Acceptance Criteria:**
  - Every answer save is durably committed to PostgreSQL before HTTP `200 OK` is returned.
  - Stale revision saves (older client timestamp or lower revision) do not overwrite newer revisions.
  - Answer saves rejected immediately if attempt has expired or is submitted.
- **Tests Required:** Concurrency race condition tests, out-of-order network arrival tests, expired attempt rejection tests.

---

### Phase 8 — Submission, Outbox & Evaluation
- [ ] **Status:** Pending
- **Objective:** Implement atomic, idempotent exam submission, transactional outbox event creation, and evaluation trigger.
- **Dependencies:** Phase 7
- **Major Tasks:**
  - Implement `POST /api/attempts/:id/submit` endpoint with atomic transaction and lock.
  - Automated auto-submit trigger for expired attempts during heartbeat/save checks.
  - Transactional Outbox insertion (`outbox_events`) recording `AttemptSubmittedEvent` in same DB transaction.
  - Immediate score calculation for objective questions (MCQ, True/False) or queuing for worker evaluation.
- **Acceptance Criteria:**
  - Submission transitions attempt state to `SUBMITTED` atomically; duplicate submissions return success idempotently.
  - Post-submission answer writes are completely impossible.
  - Outbox event is reliably written to PostgreSQL with business data.
- **Tests Required:** Double-submit race condition tests, timeout auto-submit tests, outbox atomicity transaction tests.

---

### Phase 9 — Results
- [ ] **Status:** Pending
- **Objective:** Implement exam evaluation aggregation, scoring, manual grading workflows, and candidate result release.
- **Dependencies:** Phase 8
- **Major Tasks:**
  - Database migrations for `evaluations`, `manual_grades`, and `final_results`.
  - Manual grading interface and API for subjective/essay questions (Instructor role).
  - Result publication rules (immediate, scheduled, or manual release).
  - Candidate result retrieval endpoint (`GET /api/attempts/:id/result`) honoring visibility rules.
- **Acceptance Criteria:**
  - Candidate cannot view results until exam policy permits release.
  - Aggregated scores accurately reflect objective auto-grades and manual adjustments.
- **Tests Required:** Scoring calculation unit tests, result visibility authorization tests, manual grading API tests.

---

### Phase 10 — Frontend
- [ ] **Status:** Pending
- **Objective:** Build the modern React SPA covering Candidate Exam UI, Proctor Monitoring Dashboard, and Admin/Teacher Management.
- **Dependencies:** Phase 9
- **Major Tasks:**
  - Initialize React application with modern JavaScript tooling (Vite / JavaScript JSX) and modular UI components.
  - Implement Candidate Exam Interface: clean question navigator, countdown timer synced to server time, autosave indicator, network offline warning banner.
  - Implement Proctoring Dashboard: candidate grid, live alerts feed, flag candidates, event timeline.
  - Implement Admin / Instructor Portals: exam authoring, question bank, grading dashboard, student management.
  - Implement responsive state management and resilient HTTP/WebSocket client wrappers.
- **Acceptance Criteria:**
  - Frontend renders flawlessly without flicker or unnecessary re-renders during rapid autosaves.
  - Visual countdown strictly synchronizes with authoritative server deadline.
  - Offline mode warns candidate immediately when network connectivity is lost.
- **Tests Required:** Frontend component unit tests (React Testing Library), end-to-end user flow tests (Playwright/Cypress).

---

### Phase 11 — Redis
- [ ] **Status:** Pending
- **Objective:** Integrate Redis for non-authoritative caching, rate-limiting tokens, session blacklist, and distributed locks.
- **Dependencies:** Phase 10
- **Major Tasks:**
  - Setup Redis client wrapper with connection pooling, reconnect retry backoff, and health checks.
  - Implement sliding-window rate limiting middleware for sensitive endpoints (login, answer save, submit).
  - Implement token blacklist caching for instant session revocations.
  - Implement transient read-through caching for static exam question templates.
  - Fallback mechanisms ensuring complete system functionality even if Redis experiences temporary outages.
- **Acceptance Criteria:**
  - High-traffic read requests are served from Redis cache.
  - Redis failure does not crash the API or cause data loss for critical writes.
- **Tests Required:** Redis fallback unit tests, rate-limiting integration tests, cache invalidation tests.

---

### Phase 12 — RabbitMQ & Workers
- [ ] **Status:** Pending
- **Objective:** Implement reliable outbox poller, RabbitMQ exchange/queue topologies, dead-letter exchanges, and decoupled worker consumers.
- **Dependencies:** Phase 11
- **Major Tasks:**
  - Setup RabbitMQ connection manager with channel pooling and reconnection handling.
  - Configure exchanges, queues, routing keys, and Dead Letter Queues (DLQ).
  - Implement Transactional Outbox Poller / Publisher service in backend.
  - Implement Worker Consumers for automated grading, email notifications, and audit processing.
  - Enforce consumer idempotency using message deduplication tables.
- **Acceptance Criteria:**
  - Events published to outbox are reliably delivered to RabbitMQ queues (at-least-once).
  - Failed worker tasks are retried with exponential backoff and routed to DLQ upon exhaustion.
  - Re-delivered messages are processed idempotently without side effects.
- **Tests Required:** Outbox poller integration tests, consumer idempotency tests, DLQ failure routing tests.

---

### Phase 13 — Observability & Audit
- [ ] **Status:** Pending
- **Objective:** Implement comprehensive structured logging, Prometheus/OpenTelemetry metrics, distributed tracing, and immutable audit logging.
- **Dependencies:** Phase 12
- **Major Tasks:**
  - Integrate OpenTelemetry / Prometheus metrics (request rates, error rates, DB pool stats, answer save latency, outbox lag).
  - Implement standardized HTTP request tracing (`traceparent` / `X-Request-ID`).
  - Create immutable system audit log table (`audit_events`) capturing all administrative and proctoring actions.
  - Setup Grafana dashboard configurations and alerts.
- **Acceptance Criteria:**
  - Metrics endpoint (`/metrics`) exposes actionable operational counters and histograms.
  - Critical actions (grade changes, exam edits, student exclusions) are recorded in audit logs with actor identity and timestamp.
- **Tests Required:** Metric increment verification tests, audit log tamper-resistance integration tests.

---

### Phase 14 — Proctoring Events
- [ ] **Status:** Pending
- **Objective:** Implement automated client-side violation detection (tab switch, window blur, keyboard shortcuts, multi-display) and server ingestion.
- **Dependencies:** Phase 13
- **Major Tasks:**
  - Database migrations for `proctoring_events` and `violation_flags`.
  - Implement frontend event listeners (visibility change, blur, copy/paste, fullscreen exit) with debouncing.
  - Implement ingestion endpoint (`POST /api/attempts/:id/events`) with rate limiting and batching.
  - Server-side anomaly scoring and real-time alert trigger for proctors.
- **Acceptance Criteria:**
  - Client violations are captured, timestamped, and transmitted reliably without blocking the candidate's exam UI.
  - Proctors receive real-time flags when suspicious activity thresholds are exceeded.
- **Tests Required:** Event ingestion API tests, violation rate-limiting tests, anomaly scoring unit tests.

---

### Phase 15 — Evidence Storage
- [ ] **Status:** Pending
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
- [ ] **Status:** Pending
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
- [ ] **Status:** Pending
- **Objective:** Implement WebRTC media streaming via a dedicated Selective Forwarding Unit (SFU) for live multi-candidate video/audio proctoring.
- **Dependencies:** Phase 16
- **Major Tasks:**
  - Integrate SFU media server (e.g., mediasoup / LiveKit / Janus) as an isolated media gateway.
  - Implement SFU signaling transport over WebSocket.
  - Candidate media publisher pipeline (webcam, microphone, screen share).
  - Proctor multi-stream subscriber pipeline with adaptive bitrate and grid pagination.
  - Complete isolation between SFU media traffic and core application HTTP API.
- **Acceptance Criteria:**
  - Proctors can view multiple simultaneous candidate video/audio streams with low latency.
  - Heavy media transport has zero performance impact on core database or answer autosaves.
- **Tests Required:** Media signaling exchange integration tests, stream producer/consumer connection tests.

---

### Phase 18 — Security Hardening
- [ ] **Status:** Pending
- **Objective:** Perform thorough application security hardening, penetration defense, rate limiting, header security, and data sanitization.
- **Dependencies:** Phase 17
- **Major Tasks:**
  - Configure Helmet for secure HTTP headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options).
  - Enforce strict CORS policies restricted to authorized origin domains.
  - Implement input sanitization and XSS prevention across all incoming payloads.
  - Audit database queries against SQL injection (enforce parameterized queries everywhere).
  - Implement anti-tampering cryptographic validation on answer payloads and client events.
- **Acceptance Criteria:**
  - Automated security scans pass with zero high or critical vulnerabilities.
  - OWASP Top 10 vulnerabilities are systematically mitigated.
- **Tests Required:** Security penetration tests, SQLi/XSS fuzzing tests, CORS/CSP header validation tests.

---

### Phase 19 — Containerization & Deployment
- [ ] **Status:** Pending
- **Objective:** Create optimized Docker container images, multi-stage builds, and local development Docker Compose environments.
- **Dependencies:** Phase 18
- **Major Tasks:**
  - Author multi-stage, production-optimized `Dockerfile` for backend API, workers, and frontend SPA.
  - Author `docker-compose.yml` orchestrating PostgreSQL, Redis, RabbitMQ, Backend, Frontend, and LocalStack (S3 mock).
  - Configure container non-root users and security contexts.
  - Setup CI/CD GitHub Actions workflows for linting, testing, and automated container image builds.
- **Acceptance Criteria:**
  - `docker compose up` spins up the entire working environment locally with single command.
  - Production container images are minimal, secure, and devoid of development dependencies.
- **Tests Required:** Container build tests, docker-compose end-to-end startup health checks.

---

### Phase 20 — AWS Infrastructure
- [ ] **Status:** Pending
- **Objective:** Define declarative Infrastructure as Code using Terraform for AWS cloud deployment (VPC, RDS PostgreSQL, ElastiCache Redis, S3, ALB, ECS/App Runner).
- **Dependencies:** Phase 19
- **Major Tasks:**
  - Write Terraform modules for AWS VPC, public/private subnets, security groups, and NAT gateways.
  - Terraform for Amazon RDS PostgreSQL (multi-AZ, automated backups, encryption).
  - Terraform for Amazon ElastiCache Redis.
  - Terraform for Amazon S3 evidence buckets with lifecycle policies and strict private bucket policies.
  - Terraform for Application Load Balancer and compute resources (ECS / Fargate / EC2).
- **Acceptance Criteria:**
  - `terraform plan` executes without errors and provisions isolated, highly available AWS infrastructure.
  - Zero hardcoded secrets in Terraform definitions.
- **Tests Required:** Terraform validation, `tflint`, and security static analysis (Checkov / tfsec).

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
