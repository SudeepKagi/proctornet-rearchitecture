# ProctorNet Re-Architecture — Architecture Specification

> **Notice & Authority Statement**  
> This architecture specification is derived directly from the finalized design specification:  
> **"13 Final Re-Architecture — ProctorNet Implementation Master"** (Sections 13.1 through 13.17).  
> It represents the single architectural source of truth for the rebuild of ProctorNet.  
> No architectural changes, shortcuts, or alternative designs may be introduced without an explicit Architectural Decision Record (ADR) and review.

---

## 1. System Purpose & Vision

ProctorNet is a secure, high-concurrency, enterprise-grade online examination and remote proctoring platform. The re-architecture addresses the scalability and reliability bottlenecks of previous implementations by enforcing strict transactional integrity, authoritative server-side state, resilient asynchronous processing, and isolated media streaming.

The platform supports:
- High-concurrency exam delivery with zero data loss on student answers.
- Authoritative server-side timing and state transitions.
- Multi-modal remote proctoring (event logging, automated evidence capture, and live WebRTC-based video/audio monitoring).
- Idempotent and transactional exam submission and automated/manual evaluation workflows.

---

## 2. Target Technology Stack

| Layer | Technology | Primary Role / Justification |
| :--- | :--- | :--- |
| **Frontend** | React (SPA) | Modern, responsive, component-driven examination and proctoring interface. |
| **Backend** | Node.js 24 LTS + Express (JavaScript, ES Modules) | Fast, asynchronous, modular monolith API service handling exam lifecycle and business rules. |
| **Authoritative DB** | PostgreSQL | Sole authoritative source of business-critical state with strict ACID guarantees and transactional outbox. |
| **Cache & State Sync** | Redis | Ephemeral session caching, rate-limiting tokens, and WebSocket pub/sub synchronization (non-authoritative). |
| **Message Broker** | RabbitMQ | Reliable asynchronous message queuing for decoupled worker processing (evaluation, notifications, media transcoding). |
| **Object Storage** | AWS S3 (or S3-compatible) | Secure, tamper-evident storage for proctoring evidence snapshots, screen captures, audio, and audit archives. |
| **Control Signaling** | WebSocket | Low-latency bidirectional control plane for proctoring events, student heartbeats, and room alerts. |
| **Media Relays** | WebRTC + SFU (Selective Forwarding Unit) | Scalable video/audio multi-party media routing separated cleanly from HTTP API traffic. |
| **Infrastructure & CI** | Docker, Terraform, GitHub Actions, AWS | Containerized reproducible environments, declarative Infrastructure as Code, and automated CI/CD pipelines. |

---

## 3. Core Architectural Approach: Modular Monolith

ProctorNet adopts a **Modular Monolith** architecture for its core application backend, avoiding premature distributed microservices while maintaining clean domain boundaries.

```
+-----------------------------------------------------------------------------------+
|                                ProctorNet Frontend                                |
|             (Candidate Exam UI / Proctor Dashboard / Admin Management)            |
+------------------------------------+-----------------------------+----------------+
                                     |                             |
                                 HTTP REST                     WebSocket
                                     |                             |
+------------------------------------v-----------------------------v----------------+
|                         ProctorNet Core Modular Monolith                          |
|  +-----------------------------------------------------------------------------+  |
|  | Modules: Auth | Exams | Attempts | Answers | Submission | Proctoring | Audit  |  |
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
|           Candidate Media Stream  ------>  SFU Media Relay  ------>  Proctors     |
+-----------------------------------------------------------------------------------+
```

### Key Modular Monolith Boundaries:
1. **Domain Encapsulation**: Domain modules (Authentication, Exams, Attempts, Answers, Proctoring, Evaluation, Audit) communicate internally through clearly defined domain services and interfaces rather than tight circular couplings.
2. **Independent Workload Boundaries**:
   - **HTTP API Monolith**: Handles CRUD, authentication, exam delivery, and atomic answer autosaves.
   - **WebSocket Signaling Gateway**: Manages persistent socket connections, room multiplexing, and proctoring control signals.
   - **Asynchronous Background Workers**: Consume tasks from RabbitMQ to execute evaluations, audit aggregation, and evidence post-processing.
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
- **Idempotent Consumers**: All worker consumers must maintain idempotency keys to safely process duplicate messages.

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
   - Realtime multi-proctor candidate video feeds are handled by dedicated WebRTC SFU servers.
   - SFU traffic is completely decoupled from the core application HTTP/WebSocket infrastructure.

---

## 7. Security Boundaries & Authorization

- **Authentication**: Secure JWT/session tokens with strict expiry and cryptographic signing.
- **Authorization**: Mandatory Resource-Level Access Control (RBAC/ABAC). Every attempt, answer, and proctoring event query verifies student ownership or proctor assignment.
- **Data Protection**: Sensitive candidate data encrypted at rest and in transit (TLS 1.3). Tamper-evident evidence hashing (SHA-256) on S3 uploads.
- **Secrets Management**: No credentials or private keys in source code; configuration is injected via environment variables and secret stores.

---

## 8. Scalability & Operational Boundaries

- **Database Connection Pooling**: Centralized connection management (e.g., PgBouncer / pool managers) to sustain high-concurrency connection spikes during exam starts.
- **Stateless API Layer**: Monolith instances are horizontally scalable behind an Application Load Balancer.
- **Separation of Concerns**: Resource-intensive tasks (e.g., code execution, media conversion) are offloaded to dedicated asynchronous worker clusters.

---

## 9. Explicit Non-Goals (What We Are NOT Building)

To prevent premature complexity and architectural drift, the following are strictly out of scope for initial phases:
- **No Premature Microservices**: Avoid distributed inter-service RPC overhead.
- **No Database Sharding**: PostgreSQL single-cluster with read-replicas provides sufficient headroom for initial target scale.
- **No Multi-Region Active-Active**: Single primary region deployment.
- **No Kafka**: RabbitMQ meets all asynchronous messaging and outbox requirements with simpler operational overhead.
- **No GraphQL**: RESTful APIs with predictable payloads and caching semantics.
- **No Kubernetes in Early Phases**: Docker Compose for local development; containerized ECS / App Runner / EC2 for initial deployments before considering Kubernetes.

---

## 10. Compliance and Deviations

Every developer and AI assistant working on ProctorNet must adhere to this architecture. If a practical implementation challenge necessitates a deviation, an **Architectural Decision Record (ADR)** must be drafted in `docs/ADR/` and approved before code implementation begins.
