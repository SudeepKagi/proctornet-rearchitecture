# ProctorNet Re-Architecture — Architecture Specification

> **Notice & Authority Statement**  
> This architecture specification represents the single architectural source of truth for the ProctorNet Examination Platform.  
> No architectural changes, shortcuts, or alternative designs may be introduced without an explicit Architectural Decision Record (ADR) and review.

---

## 1. System Purpose & Vision

ProctorNet is a student-built academic software engineering project demonstrating an open, resilient, high-concurrency online examination and remote proctoring platform. The architecture addresses the scalability and reliability bottlenecks of traditional examination systems by enforcing strict transactional integrity, authoritative server-side state, resilient asynchronous processing, and isolated media streaming.

The platform supports:
- High-concurrency exam delivery with zero data loss on student answers.
- Authoritative server-side timing and state transitions.
- Multi-modal remote proctoring (event logging, automated evidence capture, and live WebRTC-based video/audio monitoring).
- Idempotent and transactional exam submission and automated/manual evaluation workflows.
- Five distinct institutional roles: Student, Faculty, Invigilator, Administrator, and Developer.

---

## 2. Target Technology Stack

| Layer | Technology | Primary Role / Justification |
| :--- | :--- | :--- |
| **Frontend** | React 19 (SPA) + Vite 6 | Modern, responsive, component-driven examination and proctoring interface. |
| **Backend** | Node.js 24 LTS + Express (JavaScript, ES Modules) | Fast, asynchronous, modular monolith API service handling exam lifecycle and business rules. |
| **Authoritative DB** | PostgreSQL 16 | Sole authoritative source of business-critical state with strict ACID guarantees and transactional outbox. |
| **Cache & State Sync** | Redis 7 | Ephemeral session caching, rate-limiting tokens, and WebSocket pub/sub synchronization (non-authoritative). |
| **Message Broker** | RabbitMQ 3.13 | Reliable asynchronous message queuing for decoupled worker processing (evaluation, notifications, outbox relay). |
| **Object Storage** | AWS S3 (or S3-compatible) | Secure, tamper-evident storage for proctoring evidence snapshots, screen captures, audio, and audit archives. |
| **Control Signaling** | WebSocket | Low-latency bidirectional control plane for proctoring events, student heartbeats, and room alerts. |
| **Media Relays** | WebRTC + SFU (`mediasoup` v3) | Scalable video/audio multi-party media routing separated cleanly from HTTP API traffic. |
| **Infrastructure & CI** | Docker, Terraform, GitHub Actions, AWS | Containerized reproducible environments, declarative Infrastructure as Code, and automated CI/CD pipelines. |
| **Test Runners** | Vitest | Lightning-fast test runner for both backend domain logic and frontend component/hook lifecycles. |

---

## 3. Core Architectural Approach: Modular Monolith

ProctorNet adopts a **Modular Monolith** architecture for its core application backend, avoiding premature distributed microservices while maintaining clean domain boundaries.

```
+-----------------------------------------------------------------------------------+
|                                ProctorNet Frontend                                |
|   [Student Portal]  [Faculty Console]  [Invigilator Matrix]  [Admin]  [Developer] |
+------------------------------------+-----------------------------+----------------+
                                     |                             |
                                 HTTP REST                     WebSocket
                                     |                             |
+------------------------------------v-----------------------------v----------------+
|                         ProctorNet Core Modular Monolith                          |
|  +-----------------------------------------------------------------------------+  |
|  | Modules: Auth | Users | Exams | Attempts | Answers | Proctoring | Audit     |  |
|  +-----------------------------------------------------------------------------+  |
|  | Transactional Outbox Engine | Event Dispatcher | Authority Enforcement Engine|  |
+-------------------+--------------------+------------------------+-----------------+
                    |                    |                        |
             ACID Transactions      Pub/Sub & Cache        Outbox Poller / Publisher
                    |                    |                        |
+-------------------v----+     +---------v----------+     +-------v-----------------+
|       PostgreSQL       |     |       Redis        |     |        RabbitMQ         |
|  (Authoritative Store) |     | (Transient Caches) |     |    (Asynchronous MQ)    |
+------------------------+     +--------------------+     +-------+-----------------+
                                                                  |
                                                           Worker Consumers
                                                                  |
                                                          +-------v-----------------+
                                                          | Evaluation & Processing |
                                                          +-------------------------+

+-----------------------------------------------------------------------------------+
|                         Separate Media Plane (WebRTC + SFU)                       |
|           Candidate Media Stream  ------>  SFU Media Relay  ------>  Invigilators |
+-----------------------------------------------------------------------------------+
```

### Key Modular Monolith Boundaries:
1. **Domain Encapsulation**: Domain modules communicate internally through clearly defined domain services and interfaces rather than tight circular couplings.
2. **Independent Workload Boundaries**:
   - **HTTP API Monolith**: Handles CRUD, authentication, exam delivery, and atomic answer autosaves.
   - **WebSocket Signaling Gateway**: Manages persistent socket connections, room multiplexing, and proctoring control signals.
   - **Asynchronous Background Workers**: Consume tasks from RabbitMQ to execute evaluations, outbox relaying, and evidence post-processing.
   - **SFU Media Gateway**: Dedicated Selective Forwarding Unit instances handling audio/video WebRTC streams completely isolated from business API workloads.

---

## 4. State Authority & Consistency Principles

### 4.1 PostgreSQL is the Single Authoritative Source of Truth
- Every critical piece of business state—user accounts, exam definitions, attempt records, question mappings, answer revisions, submission timestamps, score calculations, and audit logs—resides authoritatively in PostgreSQL.
- Database writes for critical actions (e.g., answer autosave, exam submission) must be durable on disk before the server acknowledges the request to the client (`200 OK`).

### 4.2 Browser and Client State is Untrusted
- Clients cannot dictate exam time, question order validity, score calculations, or state transitions.
- All timestamps (exam start, question access, autosave, submission, expiry) are computed and validated authoritatively on the server.
- The client-side timer is purely a visual countdown; server-side deadlines are strictly enforced on every API call.

### 4.3 Redis Role (Strictly Non-Authoritative)
- Redis is utilized exclusively for:
  - Ephemeral session tokens / blacklist checks.
  - API rate-limiting buckets.
  - Ephemeral user presence and heartbeat timestamps.
  - Pub/Sub channels for multi-node WebSocket event broadcasting.
  - Transient, read-through caching of static exam configurations.
- **Rule**: If Redis fails or is flushed, zero critical exam answers or submission state will be lost; the system falls back gracefully to PostgreSQL.

### 4.4 RabbitMQ & Transactional Outbox
- RabbitMQ handles asynchronous downstream workloads (e.g., automated code evaluation, notification delivery, evidence transcoding, external webhooks).
- **Transactional Outbox Pattern**: Business transactions in PostgreSQL write domain events to an `outbox_events` table within the *same* database transaction as the business entity changes. A reliable outbox relay reads and publishes these events to RabbitMQ with at-least-once delivery guarantees.
- **Idempotent Consumers**: All worker consumers maintain idempotency keys to safely process duplicate messages.

---

## 5. Answer Saving & Concurrency Architecture

1. **Revision Tracking & Optimistic Concurrency**:
   - Every answer save is recorded with an incremental revision sequence number (`revision_id`) and client timestamp alongside server-received timestamp.
   - Saves are validated against the current attempt state and question version to prevent lost updates or stale overwrite races from unreliable networks.
2. **Durable Before Acknowledgement**:
   - Answer saves are committed to PostgreSQL before returning an HTTP success response to the client.
3. **Idempotent Submission**:
   - The submission endpoint is strictly atomic and idempotent.
   - Double clicks, network retries, or concurrent automated timeouts transition the attempt state using an explicit state machine (`IN_PROGRESS` $\to$ `SUBMITTED`) protected by database-level locks / conditional updates (`WHERE status = 'IN_PROGRESS'`).

---

## 6. Proctoring, Media & Evidence Separation

Proctoring is partitioned into three distinct planes:

1. **Proctoring Events (Control Plane)**:
   - Client event logs (tab switch, window blur, keyboard shortcuts, full-screen exit) are transmitted via lightweight HTTPS endpoints or WebSockets and written to the append-only audit trail in PostgreSQL.
2. **Evidence Storage (Data Plane)**:
   - Visual/audio evidence (periodic webcam snapshots, screen captures, audio snippets) are uploaded directly to AWS S3 using short-lived pre-signed URLs generated by the API.
   - Metadata references (S3 bucket, object key, SHA-256 hash, timestamp, student ID) are recorded in PostgreSQL.
3. **Live Media Stream (Realtime Media Plane)**:
   - Realtime multi-proctor candidate video feeds are handled by dedicated WebRTC SFU servers (`mediasoup` v3).
   - SFU traffic is completely decoupled from the core application HTTP/WebSocket infrastructure.

---

## 7. Institutional Role Architecture & Dual Invigilation

ProctorNet implements an explicit 5-role Role-Based Access Control (RBAC) model:

| Role | Primary Responsibility | Primary Portal Routes |
| :--- | :--- | :--- |
| **`STUDENT`** | Candidate exam delivery, onboarding verification, result access | `/candidate/dashboard`, `/candidate/exams`, `/exam/:attemptId` |
| **`FACULTY`** | Exam blueprint creation, session scheduling, evaluation, self-invigilation | `/faculty/exams`, `/faculty/sessions`, `/faculty/grading` |
| **`INVIGILATOR`** | Real-time proctoring supervision, anomaly triage, active session sign-off | `/invigilator`, `/invigilator/sessions/:sessionId` |
| **`ADMIN`** | Institution setup, user provisioning, onboarding approval, immutable audit logs | `/admin/overview`, `/admin/users`, `/admin/verification`, `/admin/audit` |
| **`DEVELOPER`** | System operations, telemetry matrix, log buffer inspection, incident triage | `/developer/overview`, `/developer/health`, `/developer/logs`, `/developer/topology` |

### Dual Invigilation Model (ADR-0015)
To accommodate diverse institutional practices without architectural bifurcation:
- **Dedicated Staff Model**: Professional proctoring staff holding the `INVIGILATOR` role monitor multi-candidate SFU feeds, log session incidents, issue real-time candidate interventions (warning, pause, resume, termination), and submit official session sign-offs.
- **Faculty Self-Invigilation Model**: Teaching staff holding the `FACULTY` role can directly supervise live sessions for their own scheduled exams (`SessionMonitorPage.jsx`) without requiring cross-role elevation or administrator intervention.

---

## 8. Scalability, Department Management & Testing

### 8.1 Canonical Department Model & Batched Enrollment
- Academic disciplines are standardized in the `departments` table (e.g., `CSE`, `ECE`, `MECH`, `CIVIL`, `AIML`, `ISE`).
- Exam definitions enforce referential integrity with foreign key linking to `departments.department_id`.
- Student session enrollment executes in a single batched `INSERT ... SELECT` query, scaling to thousands of examinees without $O(N)$ network roundtrips.

### 8.2 Automated Quality Assurance (Vitest)
Both backend and frontend leverage Vitest test runners:
- **Backend Tests**: Verify domain state machines (`attemptStateMachine`, `examStateMachine`, `userStateMachine`), RBAC authorization middleware, OCC autosave race protection, scheduling validation, biometric fail-closed gate, SFU media schemas, and results release policies.
- **Frontend Tests**: Verify client-side autosave hooks (`useAutosave`) under network partition, OCC 409 conflict resolution, localStorage crash recovery, and standardized UI state boundaries (`StateBoundary`).
- **Continuous Integration**: GitHub Actions workflow (`.github/workflows/ci.yml`) validates database migrations, runs backend and frontend test suites, and verifies production bundle compilation on every pull request.

### 8.3 Concurrency Boundaries: Architectural Target vs. Empirical Baseline
To maintain strict engineering honesty and avoid unvalidated capacity overclaims:
- **Target Scale Specification**: The long-term master architectural design envisions supporting up to 10,000 concurrent students during synchronized university-wide examination sessions. This target requires the full multi-AZ enterprise topology (Application Load Balancer, horizontal stateless API replicas, AWS RDS PostgreSQL Multi-AZ, and AWS ElastiCache Redis cluster) specified in the system design notes.
- **Current Deployed Topology (ADR-0010)**: The operational baseline is packaged on a single AWS EC2 `c6i.xlarge` host running Docker Compose with host-networked mediasoup SFU worker processes (`40000–49999/udp`). Managed cloud services (RDS, ElastiCache, ALB) are pre-authored behind Terraform feature flags (`enable_rds`, `enable_elasticache`, `enable_alb`) to avoid premature infrastructure cost prior to verified multi-host staging validation.
- **Empirical Measured Results**:
  1. *REST API & Autosave Contention*: Validated up to **150 concurrent Virtual Users (VUs)** locally on development hardware ($230\text{ req/s}$, $0.00\%$ error rate across candidate lifecycle; see [CAPACITY_AND_SCALING_REPORT.md](benchmarks/CAPACITY_AND_SCALING_REPORT.md)).
  2. *WebRTC SFU Media Plane*: Validated up to **36 concurrent candidate video publishers** and **108 active consumer pipelines** on a single mediasoup C++ worker process with sub-$20\text{ms}$ batch acquisition latency (see [SFU_LOAD_TEST_REPORT.md](benchmarks/SFU_LOAD_TEST_REPORT.md)).
  3. *Database Connection Pool Sizing*: Sized at `DB_POOL_MIN=10` and `DB_POOL_MAX=50` in production Terraform configuration to resolve FIFO queue contention identified during local saturation testing.


---

## 9. Explicit Non-Goals (What We Are NOT Building)

To prevent premature complexity and architectural drift:
- **No Premature Microservices**: Avoid distributed inter-service RPC overhead; modular monolith provides clean boundaries.
- **No Database Sharding**: PostgreSQL single-cluster with read-replicas provides sufficient headroom for target scale.
- **No Multi-Region Active-Active**: Single primary region deployment.
- **No Kafka**: RabbitMQ meets all asynchronous messaging and outbox requirements with simpler operational overhead.
- **No GraphQL**: RESTful APIs with predictable payloads and caching semantics.
- **No Kubernetes**: Docker Compose for local development; containerized EC2 single-host architecture with host-networked SFU and Nginx edge.

---

## 10. Compliance and Deviations

Every contributor to ProctorNet must adhere to this architecture. If an implementation requirement necessitates a deviation, an **Architectural Decision Record (ADR)** must be drafted in `docs/ADR/` and approved before implementation begins.
