# ProctorNet Re-Architecture — Testing Strategy & Guidelines

## Overview

High test coverage and thorough validation are non-negotiable requirements for the ProctorNet re-architecture. Because the system handles high-stakes examination delivery and concurrent answer persistence, testing must verify not only functional correctness but also transactional durability, concurrency safety, security boundaries, and resilience under failure conditions.

Automated tests are developed and executed alongside each phase of implementation.

---

## Testing Levels & Categories

The project testing pyramid encompasses ten distinct categories:

```
                      +-----------------------------+
                      |         Load & Chaos        |  (k6, Fault Injection)
                      +-----------------------------+
                   +-----------------------------------+
                   |   Concurrency & State-Machine     |  (Race conditions, ACID)
                   +-----------------------------------+
                +-----------------------------------------+
                |    Security, Proctoring & Media Tests   |  (RBAC, S3, WebRTC)
                +-----------------------------------------+
             +-----------------------------------------------+
             |      Integration & Database / API Tests       |  (PostgreSQL, Redis, MQ)
             +-----------------------------------------------+
          +-----------------------------------------------------+
          |                     Unit Tests                      |  (Pure domain logic)
          +-----------------------------------------------------+
```

### 1. Unit Tests
- Focus: Isolated business logic, pure domain models, deterministic calculation functions, value objects, and utility helpers.
- Constraints: Must be blazing fast with zero external I/O, network, or database dependencies.

### 2. Integration Tests
- Focus: Interactions between application modules and local external services (PostgreSQL, Redis, RabbitMQ, S3 mock).
- Scenarios: Service repository layer queries, caching workflows, event emission to transactional outbox, worker consumer processing.

### 3. API Tests
- Focus: End-to-end HTTP REST endpoint and WebSocket interface validation.
- Scenarios: Request/response schema validation, HTTP status codes, error payload consistency, header compliance, and rate limiting.

### 4. Database Tests
- Focus: Schema integrity, migrations, foreign key constraints, triggers, and transactional rollbacks.
- Scenarios: Testing migration `up` and `down` scripts, index verification, connection pool exhaustion handling, and ACID transaction atomicity.

### 5. Concurrency Tests
- Focus: Validating behavior under simulated high-contention simultaneous requests.
- Scenarios:
  - Rapid autosaves on the same question to verify revision ordering and optimistic locking.
  - Simultaneous double-clicks on "Submit Exam" to verify single-execution idempotency.
  - Race conditions during attempt initialization.

### 6. State-Machine Tests
- Focus: Rigorous verification of deterministic state transitions across domain models.
- Scenarios:
  - `Exam` lifecycle transitions (`DRAFT` $\to$ `PUBLISHED` $\to$ `ACTIVE` $\to$ `CONCLUDED` $\to$ `ARCHIVED`).
  - `Attempt` lifecycle transitions (`NOT_STARTED` $\to$ `IN_PROGRESS` $\to$ `SUBMITTED` $\to$ `EVALUATING` $\to$ `EVALUATED` $\to$ `EXPIRED` $\to$ `ABORTED`).
  - Ensuring all illegal or out-of-order state transitions throw domain exceptions.

### 7. Security Tests
- Focus: Verification of authorization boundaries, input sanitization, and cryptographic guarantees.
- Scenarios:
  - Cross-tenant/cross-user data access attempts (RBAC/ABAC enforcement).
  - Client-side time spoofing and expired token rejection.
  - SQL injection and cross-site scripting (XSS) payload fuzzing.
  - Tamper detection for answer payloads and S3 evidence hashes.

### 8. Failure & Recovery Tests
- Focus: System survival and zero-data-loss guarantees during external dependency failures.
- Scenarios:
  - Temporary Redis outage (verifying seamless fallback to PostgreSQL).
  - RabbitMQ broker downtime (verifying outbox event accumulation and replay upon recovery).
  - Abrupt client network disconnects and resumption during active exams.

### 9. Load Tests
- Focus: High-concurrency performance and throughput benchmarking.
- Scenarios:
  - Synchronized start of 1,000–10,000 candidate attempts.
  - Sustained continuous autosave traffic (1 save every 5–10s per candidate).
  - Burst submission spikes at exam conclusion.
  - Verifying answer save p95 latency remains under 200ms.

### 10. Proctoring & Media Tests
- Focus: Real-time control plane, signaling, and media streaming validation.
- Scenarios:
  - WebSocket signaling handshake and room broadcast latencies.
  - Selective Forwarding Unit (SFU) media stream publishing and subscription.
  - Secure S3 pre-signed upload URL generation and evidence confirmation.

---

## Tooling Roadmap

- **Unit & Integration Testing:** Vitest / Jest, Supertest.
- **Database Testing:** Testcontainers / localized PostgreSQL docker instances with transaction rollback per test.
- **Load Testing:** k6 / Artillery.
- **Frontend E2E Testing:** Playwright.
- **Static Analysis & Security:** ESLint, Checkov/tfsec.

---

*Note: Specific test harnesses and runners will be instantiated in their respective implementation phases.*
