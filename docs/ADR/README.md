# Architecture Decision Records (ADR)

## Purpose

Architecture Decision Records (ADRs) capture significant architectural decisions, along with their context, rationale, alternatives considered, and consequences. They serve as a historical record of architectural evolution and ensure that changes to the baseline architecture specified in `docs/ARCHITECTURE.md` are deliberately designed, reviewed, and approved.

---

## When to Write an ADR

An ADR must be created whenever:
- A new technology, library, or architectural pattern is proposed.
- An existing architectural component or constraint is modified.
- A significant trade-off (e.g., consistency vs. latency, synchronization mechanism) is evaluated and decided upon.
- A non-trivial data model change or state machine workflow is introduced.

*Note: Do not create speculative ADRs for decisions that have not yet arisen in active development.*

---

## ADR Template

When creating a new record, number it sequentially (e.g., `0001-record-title.md`) and use the following format:

```markdown
# ADR-0000: [Short Title of Decision]

## Status
[Proposed | Accepted | Rejected | Superseded by ADR-XXXX]

## Date
YYYY-MM-DD

## Context & Problem Statement
Describe the context, requirements, problem, and technical constraints that necessitate this decision.

## Decision Drivers
- [Driver 1, e.g., Concurrency requirement at peak submission]
- [Driver 2, e.g., Zero-data-loss answer persistence]
- [Driver 3, e.g., Minimizing operational complexity]

## Considered Options
1. Option A: [Description]
2. Option B: [Description]
3. Option C: [Description]

## Decision Outcome
Chosen option: [Option X], because [rationale].

### Positive Consequences
- [Positive outcome 1]
- [Positive outcome 2]

### Negative Consequences / Trade-offs
- [Trade-off or additional operational overhead]

## Compliance & Validation
How will this decision be enforced and validated in testing/CI?
```

---

## Index of Approved ADRs

- [ADR-0001: Redis Non-Authoritative Caching, Sliding-Window Rate Limiting, and Resilience](0001-redis-non-authoritative-caching-and-resilience.md) — *Accepted (Phase 11)*
- [ADR-0002: RabbitMQ Asynchronous Transport, Quorum Queue Delayed Retries, and Worker Idempotency](0002-rabbitmq-asynchronous-transport-and-worker-idempotency.md) — *Accepted (Phase 12)*
- [ADR-0003: In-Process Prometheus Metrics, Distributed Trace Context Propagation, and Database-Enforced Audit Immutability](0003-observability-metrics-and-audit.md) — *Accepted (Phase 13)*
- [ADR-0004: Proctoring Event Ingestion, Server-Authoritative Anomaly Scoring, and Flag Lifecycle](0004-proctoring-event-ingestion-and-anomaly-scoring.md) — *Accepted (Phase 14)*
- [ADR-0005: Private Object Storage Architecture, Direct Presigned Evidence Uploads, and Authoritative PostgreSQL Metadata Lifecycle](0005-private-object-storage-architecture-direct-presigned-evidence-uploads-and-authoritative-postgresql-metadata-lifecycle.md) — *Accepted (Phase 15)*
- [ADR-0006: WebSocket Realtime Control Plane, Subprotocol Authentication, and Redis Pub/Sub Synchronization](0006-websocket-realtime-control-plane-and-redis-pubsub-synchronization.md) — *Accepted (Phase 16)*
- [ADR-0007: WebRTC SFU Media Plane Architecture and mediasoup Integration](0007-webrtc-sfu-media-plane-architecture-and-mediasoup-integration.md) — *Accepted (Phase 17)*
- [ADR-0008: Application Security Hardening, Cryptographic Anti-Tampering, and Defense-in-Depth](0008-application-security-hardening-cryptographic-anti-tampering.md) — *Accepted (Phase 18)*

