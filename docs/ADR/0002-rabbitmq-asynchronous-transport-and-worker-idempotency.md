# ADR-0002: RabbitMQ Asynchronous Transport, Quorum Queue Delayed Retries, and Worker Idempotency

## Status
Proposed (Phase 12)

## Date
2026-09-07

## Context & Problem Statement
In the ProctorNet examination platform, exam submission is a high-concurrency event where hundreds or thousands of candidates submit their attempts within narrow time windows (e.g., at the scheduled end of an exam session). Grading submitted attempts inline within the HTTP submission request introduces severe scalability bottlenecks, increases HTTP response latency, and exhausts PostgreSQL client connections.

Furthermore, decoupling submission from evaluation requires a message transport mechanism that guarantees zero data loss, survives node crashes, and prevents poison messages from indefinitely consuming worker compute resources. While the transactional outbox pattern guarantees that events are durably persisted to PostgreSQL within the submission transaction, dispatching and consuming these events asynchronously across decoupled workers requires an enterprise message broker with strict delivery, routing, and idempotency guarantees.

## Decision Drivers
1. **Zero Message Loss & Durability:** Submitted attempts must never be lost due to worker crashes, network partitions, or broker restarts.
2. **PostgreSQL as Authoritative Source of Truth:** Results, scores, and attempt states remain strictly in PostgreSQL; message brokers serve solely as asynchronous delivery pipelines.
3. **At-Least-Once Delivery with Exactly-Once Processing Semantics:** The system must tolerate network duplicates, broker crash redeliveries, and worker retries through strict database idempotency.
4. **Bounded Retry Paths without Poison Message Loops:** Transient evaluation failures must retry with exponential/tiered backoff, while permanent malformed or corrupt messages must quarantine to a Dead Letter Queue (DLQ) without looping indefinitely.
5. **Broker Semantics & Delivery Invariants:** Confirmation of retry/DLQ forwarding must strictly precede acknowledgment of the original delivery. Consumer ACK must strictly follow database transaction commit.

## Considered Options
1. **Option 1: Synchronous Inline Grading within Submission HTTP Request**
   - Candidate submission request directly calculates objective scores, persists results, and returns complete scorecards in the HTTP response.
   - *Rejected:* Causes high latency spikes during exam completion deadlines, holds database connections during grading computation, and violates the architectural requirement for decoupled asynchronous processing (Step 13.5).
2. **Option 2: Redis-Based Queue / BullMQ**
   - Using Redis lists or streams as a job queue for background workers.
   - *Rejected:* Violates ADR-0001 and authoritative architectural hierarchy (Step 13). Redis is designated strictly as a non-authoritative, disposable cache and rate-limiting accelerator. Storing jobs in Redis risks data loss during Redis failover or crash.
3. **Option 3: RabbitMQ Quorum Queues with Transactional Outbox, Model A Delayed Retries, and Idempotent Worker (Chosen)**
   - The submission transaction atomically persists the `ATTEMPT_SUBMITTED` event into PostgreSQL `outbox_events`.
   - A dual-trigger dispatcher (immediate post-commit trigger + periodic background poller) claims pending events using `FOR UPDATE SKIP LOCKED` and publishes them to RabbitMQ using publisher confirms (`publishConfirmed`) with `mandatory: true`.
   - RabbitMQ topology utilizes durable Quorum Queues with at-least-once dead-lettering (`x-dead-letter-strategy: 'at-least-once'`, `x-overflow: 'reject-publish'`).
   - Workers consume from the primary jobs queue with bounded concurrency (`basic.qos(prefetch)`).
   - Failed evaluations follow Model A retry semantics: transient failures are forwarded with confirmed publishing to delayed retry queues (5s and 15s TTL) with dead-letter exchange routing back to the jobs queue, capping application attempts at 3 before DLQ quarantine.
   - Malformed/poison messages route directly to `proctornet.evaluation.dlq`.
   - Database results deduplicate by `attempt_id` prior to scoring; duplicate deliveries are acknowledged immediately without re-evaluation.

## Decision Outcome
Chosen option: **Option 3**, because it provides industrial-grade message durability, bounded resilience against broker and worker failures, and aligns with the authoritative re-architecture specifications.

### Architectural Invariants:
1. **Topology Architecture:**
   - **Exchanges:** 3 durable direct exchanges:
     - `proctornet.events` (primary ingress)
     - `proctornet.retry` (delayed retry routing)
     - `proctornet.dlx` (dead-letter exchange)
   - **Queues:** 4 Quorum Queues (`x-queue-type: 'quorum'`, `durable: true`, `x-dead-letter-strategy: 'at-least-once'`, `x-overflow: 'reject-publish'`):
     - `proctornet.evaluation.jobs` (primary evaluation work queue)
     - `proctornet.evaluation.retry.1` (5,000ms TTL, DLX to `proctornet.events`)
     - `proctornet.evaluation.retry.2` (15,000ms TTL, DLX to `proctornet.events`)
     - `proctornet.evaluation.dlq` (terminal poison/exhaustion quarantine)
2. **Mandatory Routing & Publisher Confirms:**
   - All publishes utilize `publishConfirmed` on `ConfirmChannel` with `mandatory: true`.
   - Publications resolve only when the broker sends positive `basic.ack` and no `basic.return` event is emitted.
   - Unroutable returns, broker nacks, channel closures, or timeouts immediately reject the publish promise.
3. **Model A Tiered Delayed Retry Semantics:**
   - **Tier 0 (Attempt 0):** Immediate evaluation on initial delivery. On transient failure, confirmed forward to `retry.1` (`x-retry-attempt: 1`), then ACK original.
   - **Tier 1 (Attempt 1):** Delivery from `retry.1` (5s TTL). On transient failure, confirmed forward to `retry.2` (`x-retry-attempt: 2`), then ACK original.
   - **Tier 2 (Attempt 2):** Delivery from `retry.2` (15s TTL). On transient failure, application retry budget is exhausted; confirmed forward to DLQ with `x-death-reason: 'RETRIES_EXHAUSTED'`, then ACK original.
   - **Crash / Channel Drop Redeliveries:** RabbitMQ broker redeliveries (`msg.fields.redelivered: true`) are orthogonal to application retry attempts (`x-retry-attempt`). Worker crashes before DB commit legitimately cause broker redelivery at the current attempt tier.
4. **Poison Message Quarantine:**
   - Malformed JSON or invalid/missing `attemptId` UUID payloads bypass retry queues and forward directly to `proctornet.evaluation.dlq` with error headers, followed by ACK of the poison delivery.
5. **Two-Phase Acknowledgment Ordering:**
   - **Successful Evaluation:** `channel.ack(msg)` executes **strictly after** the PostgreSQL result transaction has successfully committed to disk.
   - **Retry / DLQ Forwarding:** `channel.ack(msg)` executes **strictly after** `publishConfirmed` resolves. If forwarding fails or times out, the original message is **left unacknowledged** to prevent message loss.
6. **Authoritative Result Idempotency:**
   - The worker executes an authoritative PostgreSQL pre-check (`findResultByAttemptId`). If a result already exists, the worker logs the duplicate delivery and immediately ACKs without re-scoring.
7. **Dual-Trigger Outbox Lifecycle:**
   - The outbox dispatcher is triggered immediately post-commit via `setImmediate` and periodically polled every 5,000ms as a backstop.
   - Stale processing locks (interrupted workers) are recovered after 5 minutes with retry budget consumption.

### Positive Consequences
- Immediate sub-50ms HTTP response times for exam submissions, fully decoupling submission from CPU-bound evaluation.
- High-availability message replication and durability via RabbitMQ Quorum Queues.
- Complete protection against poison message infinite loops through structured DLQ quarantine.
- Guaranteed zero data loss across worker crashes, database failovers, and broker restarts.
- Full platform backward compatibility: system falls back to `InProcessEventTransport` when `RABBITMQ_ENABLED=false`.

### Negative Consequences / Trade-offs
- Requires operational maintenance of a RabbitMQ broker (or cluster).
- Eventual consistency: candidate scorecards are generated asynchronously (typically within 100-300ms, or up to 20s if transient database deadlocks occur).

## Compliance & Validation
- **Unit Testing:** Verified configuration schemas, topology assertions, CloudEvents envelope formatting, mandatory routing returns, error classifiers, and consumer forwarding logic.
- **Live Broker Integration Testing (RabbitMQ 3.12.1):** Verified all 10 authoritative broker semantics (A through J), including confirmed retry forwarding before ACK, redelivery upon worker crash, 5s and 15s Quorum TTL dead-letter routing, and DLQ quarantine.
- **Fault-Tolerance & Resilience Testing:** Verified outbox persistence during broker disconnection, exponential backoff, stale lock recovery, and worker duplicate message deduplication.
- **Pipeline End-to-End Testing:** Full submission -> outbox -> RabbitMQ -> worker consumer -> PostgreSQL result pipeline verified with 100% green execution across 460 backend tests and 25 frontend tests.
