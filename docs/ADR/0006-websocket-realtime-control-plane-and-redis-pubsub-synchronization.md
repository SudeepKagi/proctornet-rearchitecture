# ADR-0006: WebSocket Realtime Control Plane, Subprotocol Authentication, and Redis Pub/Sub Synchronization

## Status
Accepted (Phase 16)

## Date
2026-09-08

## Context & Problem Statement
During high-stakes online examinations, invigilators require low-latency visibility into candidate anomaly events, calculated risk score spikes, and violation flags generated during active sessions. Candidates must also receive instant official invigilator warnings and session state transitions.

Historically, web applications implemented periodic HTTP polling, which introduces unacceptable latency ($\ge 5\text{–}10\text{s}$), creates artificial thundering-herd database read contention, and burns CPU cycles when state is static.

We require a bidirectional realtime control plane capable of dispatching instant notifications ($<100\text{ms}$) while preserving system stability, memory safety, and strict compliance with the authoritative architecture:
1. **Authority Invariant**: PostgreSQL must remain the sole authoritative store of persistent business entities. REST remains authoritative for all mutations and queries. WebSocket is strictly an ephemeral notification delivery transport.
2. **Credential Privacy**: Access tokens must never leak into URLs, proxy logs, or browser histories.
3. **Cluster Resilience**: In multi-instance deployments, Redis Pub/Sub outages must not produce silent split-brain, nor may they crash business transactions.
4. **Presence Integrity**: Candidate connectivity must be reliably monitored without generating false alarms from transient network jitter.
5. **Client Multiplexing**: Multiple UI components must not open redundant TCP sockets.

## Decision Drivers
- **Absolute Authority of PostgreSQL**: Realtime transport failures must never mutate, corrupt, or block committed database transactions.
- **Credential Protection**: Complete elimination of query-string JWT tokens in WebSocket handshakes to prevent credential leakage into CloudWatch, access logs, and browser history.
- **Multi-Instance Reliability**: Graceful degradation when cross-node synchronization fails, alerting operators and triggering safe REST fallback polling without data loss.
- **Resource Protection & Memory Safety**: Strict bounds on inbound frames (16 KB), connection concurrency (max 3 per user), outbound queues (100 frames / 1 MB buffer), and pre-upgrade requests (30 req/min/IP).
- **Minimal Dependencies**: Native Node.js RFC 6455 implementation (`ws`) and native browser `window.WebSocket` with zero frontend npm dependencies.

## Considered Options
1. **Option 1: Socket.IO**
   - *Pros*: Built-in reconnection, room abstraction, HTTP long-polling fallback.
   - *Cons*: Heavy proprietary protocol layer, bloated client and server packages, non-standard handshake semantics, complex engine.io abstraction, incompatible with future Phase 17 raw WebRTC SDP signaling without protocol adapters.
2. **Option 2: Native Server-Sent Events (SSE) + REST**
   - *Pros*: HTTP-based, unidirectional simplicity.
   - *Cons*: Half-duplex only; requires candidate heartbeats to run over separate HTTP requests, increasing connection overhead and latency.
3. **Option 3: RFC 6455 Native WebSockets (`ws` on backend, native `window.WebSocket` on frontend)** (Chosen)
   - *Pros*: Standardized, zero-overhead binary framing, minimal memory footprint (~25KB/socket), native support in Node 24 and all modern browsers, clean alignment with Phase 17 WebRTC signaling.

## Decision Outcome
Chosen option: **Option 3: RFC 6455 Native WebSockets with subprotocol authentication, Redis Pub/Sub synchronization, and strict post-commit isolation**.

### Key Architectural Decisions:

#### 1. REST vs. WebSocket Boundary
- **PostgreSQL**: Authoritative for all persistent data (`exam_attempts`, `violation_flags`, `violation_events`, `audit_logs`).
- **REST APIs**: Authoritative command and query surface (answers, telemetry ingestion, flag review, submission, presigned evidence).
- **WebSocket Gateway**: Non-authoritative, best-effort transient control plane for realtime notifications only.
- **Zero Database Persistence for Sockets**: Transient socket IDs, pings, and room subscriptions are never written to PostgreSQL.

#### 2. Subprotocol Handshake Authentication
- Browser handshakes transmit the JWT strictly via the subprotocol header:
  `Sec-WebSocket-Protocol: proctornet, <access_token>`
- The server extracts and cryptographically validates the token, returning `Sec-WebSocket-Protocol: proctornet`.
- Eliminates URL token parameters (`/ws?token=...`), preventing credential leakage in access logs, reverse proxy logs, and browser history.
- Query parameter fallback is strictly permitted for external CLI tools, with immediate in-memory redaction before any logger executes.

#### 3. Pre-Upgrade IP Rate Limiting
- HTTP upgrade requests pass through an IP sliding-window rate limiter before socket allocation or cryptographic verification.
- Limits upgrades to 30 requests/minute per source IP, mitigating unauthenticated connection exhaustion attacks.

#### 4. Redis Pub/Sub & Degraded Synchronization Semantics
- In multi-instance deployments, cross-node fan-out uses Redis Pub/Sub on channel `proctornet:ws:events`.
- If Redis Pub/Sub disconnects or fails:
  - Distributor status transitions to `DEGRADED`.
  - Prometheus counter `proctornet_websocket_redis_sync_errors_total` increments.
  - Server emits `system:realtime_degraded` to local sockets.
  - Invigilator frontend dashboards automatically activate 10-second REST fallback polling.
  - When Redis reconnects, distributor transitions to `HEALTHY`, emits `system:realtime_recovered`, and dashboards deactivate polling.
- In single-instance / local environments, in-process `ChannelManager` handles all routing without Redis.

#### 5. Post-Commit Realtime Error Isolation
- Domain services (`proctoring.service.js`) trigger broadcasts strictly after database transactions execute `COMMIT`.
- All broadcast calls are wrapped in non-blocking `try/catch` error boundaries. If broadcasting fails (e.g., Redis timeout), an error is logged and metrics incremented, but the committed HTTP response returns 200 OK without failing.

#### 6. Mathematically Derived Presence Detection
- **Observable / Graceful Close**: Immediate TCP close frame detection emits `candidate:presence_changed` (`status: "OFFLINE"`) within $\le 1\text{ second}$.
- **Ungraceful / Silent Loss (Crash, Cable Pull)**:
  - Candidates emit an application presence pulse every 5 seconds (`CANDIDATE_HEARTBEAT_INTERVAL_MS = 5000`).
  - Server evaluates heartbeats with a 15-second lapse threshold (3 missed pulses) and a 5-second sweep cycle.
  - Upper detection bound: $15\text{s} + 5\text{s} = 20\text{ seconds}$ worst-case, eliminating false alarms from minor 1–2s network jitter.
- Presence status is strictly advisory and never mutates attempt lifecycle state (`exam_attempts.status`).

#### 7. Long-Lived Connection Token Management
- Access tokens expire every 15 minutes; examinations last 1–3 hours.
- Active WebSocket connections remain open and authenticated for the exam duration, subject to Redis session blacklist and PostgreSQL revocation sweeps.
- Frontend proactively refreshes tokens via REST `POST /api/v1/auth/refresh` at minute 12. If a socket reconnects after minute 15, it authenticates using the freshly renewed token.

#### 8. Frontend Singleton Multiplexing
- `<RealtimeProvider>` maintains a single shared `RealtimeClient` instance across all React components.
- Room subscriptions utilize reference counting: the first hook increments the count and sends a `subscribe` frame; subsequent hooks increment local ref counts without duplicate network frames.
- Reconnection automatically re-subscribes to active rooms with exponential backoff and $\pm 20\%$ jitter.

#### 9. Backpressure & Queue Limits
- Inbound payload hard limit: 16 KB (`maxPayload: 16384`).
- Outbound per-socket queue limit: 100 frames.
- Outbound buffer threshold: 1 MB (`ws.bufferedAmount > 1048576`). Sockets exceeding limits are cleanly terminated with code `1008 Policy Violation`.

## Consequences

### Positive Consequences
- Realtime notification delivery within $<100\text{ms}$ without continuous HTTP polling.
- Zero credential exposure in server logs or proxy access logs.
- Absolute isolation between realtime transport errors and committed database transactions.
- Transparent cross-node degradation handling with automated REST fallback polling.
- Zero extra frontend npm bundle size (uses native `window.WebSocket`).
- Seamless foundation for Phase 17 WebRTC signaling.

### Negative Consequences / Trade-offs
- Invigilator and candidate state is non-authoritative over WebSockets; clients must perform REST resynchronization upon reconnection.
- Redis Pub/Sub introduces operational dependencies in clustered deployments, requiring the documented degraded-mode fallback.

## Compliance & Validation
- **Schemas**: Validated via Zod (`realtime.schemas.js`).
- **Unit Tests**: `backend/tests/realtime/websocketUnit.test.js` verifies protocol negotiation, pre-upgrade rate limiting, and backpressure.
- **Integration Tests**: `backend/tests/realtime/websocketIntegration.test.js` validates upgrade handshake, room authorization, proctoring event fan-out, presence bounds, and graceful shutdown.
- **Consistency Tests**: `backend/tests/realtime/websocketConsistency.test.js` validates post-commit error isolation and Redis degraded/recovery transitions.
- **Security Tests**: `backend/tests/realtime/websocketSecurity.test.js` validates BOLA room protection, connection limits, and credential redaction.
- **Frontend Tests**: `frontend/tests/services/realtimeClient.test.js` validates single shared connection, reference counting, and degraded mode switching.
