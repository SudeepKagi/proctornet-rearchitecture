# PHASE 16 — WEBSOCKET REALTIME
## IMPLEMENTATION PLAN (REVISED)

> **Authoritative Specification & Architecture Contract**  
> Conforms strictly to:  
> 1. Notion Step 13 Final Re-Architecture (Sections 13.5, 13.7, 13.17)  
> 2. `docs/DEVELOPMENT_PLAN.md` (Phase 16)  
> 3. `docs/ARCHITECTURE.md` (Sections 2, 3, 4, 6, 8, 9)  
> 4. Existing Merged Repository Architecture (Phases 1–15, ADR-0001 through ADR-0005)  
> 5. Phase 16 Independent Plan Review Findings 1–7  

---

## 1. Executive Summary

Phase 16 introduces a secure, high-performance, bidirectional WebSocket realtime control plane to the ProctorNet examination platform. Its primary mission is to deliver low-latency server-to-client notifications (proctoring anomaly alerts, risk score updates, violation flag notifications, candidate presence changes, and session broadcasts) to authorized invigilators and candidates without periodic HTTP polling.

**Core Architectural Invariant**:  
WebSocket is strictly a **realtime delivery transport**; it **NEVER** becomes an authoritative source of persistent business state. PostgreSQL remains the sole authoritative source of truth for all business entities, transactions, and audit trails. REST remains the authoritative interface for commands, answers, submissions, proctoring event ingestion, and evidence metadata. Redis remains non-authoritative ephemeral infrastructure utilized strictly for multi-node event fan-out (Pub/Sub) and ephemeral presence caching.

**Key Correctness Guarantees Addressed**:
1. **Explicit Cross-Node Degradation**: In multi-instance deployments, Redis Pub/Sub failure does not silently produce cross-node split-brain; the system transitions to a `DEGRADED` realtime state, emits `system:realtime_degraded` to local sockets, and invigilator dashboards fall back to 10-second REST polling until Redis recovers.
2. **Credential Privacy**: Browser WebSocket handshakes use the `Sec-WebSocket-Protocol` header (`['proctornet', token]`), completely preventing JWT exposure in URLs, browser history, reverse proxy logs, and CloudWatch.
3. **Mathematically Consistent Presence Detection**: Distinguishes immediate graceful socket closures ($\le 1\text{ second}$ alert) from silent ungraceful drops (5-second client pulses, 15-second lapse threshold + 5-second sweep grace = $\le 20\text{ seconds}$ upper bound).
4. **Long-Lived Connection Token Management**: Decouples connection lifetime from 15-minute access token expiry, requiring proactive REST token refresh before expiration for seamless reconnects without tearing down valid active exam sockets.
5. **Frontend Singleton Multiplexing**: Enforces a single shared WebSocket connection per browser context via `RealtimeProvider` with room subscription reference counting, preventing connection limit exhaustion.
6. **Pre-Upgrade Defense**: Enforces IP-based sliding-window rate limiting on HTTP `/ws` upgrades before token validation or socket allocation.
7. **Post-Commit Error Isolation**: Domain services isolate realtime broadcast calls in non-blocking `try/catch` blocks post-commit, ensuring realtime transport failures can never fail committed business transactions.

---

## 2. Current Repository Baseline

As of the merge of Phase 15 (`main` branch):
- **Node.js**: 24 LTS, ES Modules (`"type": "module"`).
- **Backend Core**: Express 4.21.2 mounted on a native `node:http` server (`server = http.createServer(app)` in `backend/src/server.js`).
- **Authentication**: JWT Bearer tokens with 15-minute access expiry, Redis session blacklist fast-path with authoritative PostgreSQL fallback (`backend/src/middleware/authenticate.js`).
- **Authorization**: Role-Based Access Control (RBAC) querying PostgreSQL durable roles (`requireRole` in `authorize.js`) and Broken Object Level Authorization (BOLA) validation (`requireOwnership`, `requireResourceScope` in `resourceAuthorization.js`).
- **Database**: PostgreSQL with 17 executed migrations (`001` through `017_evidence_storage.js`). Connection pooling via `pg` pool (`DB_POOL_MAX = 10`).
- **Ephemeral State & Caching**: Redis (via `ioredis`) for session blacklists, sliding-window rate limiting (60 req/min for proctoring events, 30 req/min for evidence uploads), with graceful local fallback if Redis is down (ADR-0001).
- **Asynchronous Messaging**: RabbitMQ + Transactional Outbox for decoupled evaluations (Phase 12, ADR-0002).
- **Observability**: Prometheus metrics via `prom-client` with strictly bounded labels (ADR-0003), structured Pino logging, and immutable append-only audit logging (`audit_logs`).
- **Proctoring**: Phase 14 authoritative REST ingestion (`POST /api/v1/attempts/:attemptId/events`), server-side anomaly scoring (`anomalyScorer.js`), and flag lifecycle management (`violation_flags`).
- **Evidence Storage**: Phase 15 private S3 presigned direct uploads, PostgreSQL metadata lifecycle (`evidence_records`), and immutable S3 version pinning for playback (ADR-0005).
- **Frontend**: Vite 6, React 19 SPA, React Router 7. Invigilator dashboard (`SessionMonitorPage.jsx`) currently uses manual refresh; candidate workspace (`ExamTakingPage.jsx`) uses background REST telemetry (`useProctoringEvents.js`).

---

## 3. Architectural Intent

1. **Sub-Second Proctoring Alerts**: Deliver candidate anomaly flags and risk score spikes to assigned invigilator dashboards within $\le 500\text{ ms}$ of ingestion, replacing manual UI polling.
2. **Deterministic Candidate Presence**: Detect candidate disconnects immediately ($\le 1\text{s}$ for observable close) or within $\le 20\text{ seconds}$ for ungraceful network drops via bidirectional heartbeats and notify invigilators immediately.
3. **Strict State Authority**: No exam state transitions, answer saves, proctoring scores, or flag decisions are initiated or mutated over WebSocket. WebSockets push *notifications of committed state*.
4. **Resilient Reconnection & Resynchronization**: On network reconnection or socket reset, clients seamlessly re-query authoritative REST endpoints to guarantee zero lost updates or state divergence.
5. **Horizontal Scalability Ready**: Single-instance deployment uses efficient in-process pub/sub; horizontal multi-instance deployment leverages a pluggable Redis Pub/Sub adapter to broadcast events across nodes with explicit degraded-mode signaling if Redis fails.

---

## 4. REST vs. WebSocket Boundary

To eliminate architectural ambiguity, all platform capabilities are strictly partitioned:

| Concern / Capability | REST (HTTP) | WebSocket | Architectural Rationale |
| :--- | :---: | :---: | :--- |
| **User Authentication / Login** | **YES** | NO | Issues signed JWT tokens and refresh cookies over secure HTTP. |
| **Token Refresh** | **YES** | NO | Refreshes access token via `/api/v1/auth/refresh` before expiration. |
| **Exam State Mutations** (Start, Pause, Resume, Conclude) | **YES** | NO | Requires ACID transactional guarantees, state machine validation, and audit logs. |
| **Answer Autosave & Manual Save** | **YES** | NO | Requires optimistic concurrency control (`revision_id`) and durable disk commitment. |
| **Exam Submission** | **YES** | NO | Strictly atomic, idempotent HTTP POST with idempotency keys. |
| **Proctoring Telemetry Ingestion** | **YES** | NO | Batch HTTP POST with Redis rate limiting, row locks, and transactional outbox. |
| **Evidence Presigning & Confirmation** | **YES** | NO | SigV4 presigned URLs and HeadObject byte/version validation. |
| **Initial Screen / Dashboard State Query** | **YES** | NO | REST provides paginated, filtered, authoritative snapshots. |
| **Socket Connection & Handshake** | HTTP Upgrade | **YES** | HTTP `101 Switching Protocols` upgrades authenticated HTTP to WebSocket. |
| **Realtime Anomaly & Flag Alerts** | Optional Polling | **YES** | Low-latency push to invigilators when flags are raised/reviewed. |
| **Risk Score Change Notifications** | Optional Polling | **YES** | Instant live score update for candidate roster cards. |
| **Candidate Presence / Disconnect Alert** | NO | **YES** | Detected via socket close or missed ping/pong heartbeat. |
| **Exam Session Broadcasts / Announcements** | NO | **YES** | Invigilator/admin broadcast messages pushed instantly to candidates. |
| **Binary Evidence / Audio / Video Upload** | NO (S3 direct) | **NO** | Binary media over WebSocket is strictly prohibited; S3 handles binary storage. |
| **Live WebRTC Audio/Video Media Relays** | NO | **NO** | Deferred to Phase 17 dedicated SFU media plane. |

---

## 5. WebSocket Library Recommendation

### Evaluated Options

1. **Native `ws` (Recommended)**:
   - **Protocol**: Standard RFC 6455 WebSocket.
   - **Client**: Native browser `window.WebSocket` API (zero client library dependencies, zero frontend bundle bloat).
   - **Performance**: High throughput, minimal memory footprint (~25 KB per idle socket).
   - **Control**: Direct control over HTTP upgrade, headers, ping/pong frames, backpressure (`bufferedAmount`), and close codes.
   - **Subprotocol Support**: Built-in support for `Sec-WebSocket-Protocol` subprotocol negotiation for secure token transmission.
   - **Simplicity**: Integrates cleanly into Node's `http.Server` without proprietary abstractions.
   - **Horizontal Scaling**: Scales cleanly behind AWS ALB with standard Redis Pub/Sub cross-instance fan-out.

2. **Socket.IO (Rejected)**:
   - **Protocol**: Proprietary Engine.IO framing layer over HTTP long-polling and WebSocket.
   - **Client**: Requires `socket.io-client` frontend npm dependency (~45 KB minified).
   - **Complexity**: HTTP long-polling fallback requires sticky sessions on the load balancer, multiplexes packet types, and introduces complex dual-handshake state machines.
   - **Redundancy**: ProctorNet clients are modern evergreen desktop/laptop browsers taking proctored exams; HTTP long-polling fallback is completely unnecessary in an online examination environment.
   - **Overhead**: Unnecessary protocol translation overhead for WebRTC signaling in Phase 17.

### Recommendation: `ws`
Adopt `ws` (`^8.18.0`) on the backend, paired with the browser's native `WebSocket` API on the frontend.

---

## 6. Connection Lifecycle

```
Client (Browser)                           Node.js HTTP Server               WebSocket Gateway
       |                                            |                                |
       | --- HTTP GET /ws ------------------------> |                                |
       |     Upgrade: websocket                     |                                |
       |     Connection: Upgrade                    |                                |
       |     Origin: http://localhost:3000          |                                |
       |     Sec-WebSocket-Protocol: proctornet, <jwt>                               |
       |                                            | --- 1. Pre-Upgrade IP Limit -> | (Reject 429 if >30/min)
       |                                            | --- 2. Validate Origin & Path  | (Reject 403 if invalid)
       |                                            | --- 3. Verify JWT & Blacklist  | (Reject 401 if invalid)
       |                                            | --- 4. Resolve Durable Roles - |
       |                                            | --- 5. Check User Concurrency  | (Reject 403 if >3 sockets)
       |                                            | <--- Approve Upgrade --------- |
       | <--- HTTP 101 Switching Protocols -------- |                                |
       |      Sec-WebSocket-Protocol: proctornet     |                                |
       | [ WebSocket Connection Established (OPEN) ]                                 |
       |                                                                             |
       | <--- {"type": "connection:established", "connectionId": "..."} ------------ |
       |                                                                             |
       | <================ Bidirectional Transport Ping / Pong (every 30s) =========> |
       | <================ Application Heartbeat (every 5s from candidate) ========= |
       |                                                                             |
       | --- {"type": "subscribe", "room": "session:<id>"} ------------------------> |
       |                                                    --- Authorize Scope ---> |
       | <--- {"type": "subscribed", "room": "session:<id>"} ----------------------- |
       |                                                                             |
       | <--- {"type": "proctoring:flag_raised", ...} ------------------------------ |
       |                                                                             |
       | --- Close Frame (1000 Normal / 1001 Going Away) --------------------------> |
       | [ Connection Closed & Cleanup Rooms ]                                       |
```

### 1. Pre-Upgrade & Handshake Phase
- **Route**: `GET /ws`.
- **Layer 1: Pre-Upgrade IP Rate Limiting**: Verified via sliding-window counter in memory/Redis (max 30 requests/minute per source IP). Excess requests receive HTTP `429 Too Many Requests` and socket is immediately destroyed before token parsing.
- **Layer 2: Origin Validation**: `req.headers.origin` must match `config.CORS_ORIGIN`. Non-matching origins receive HTTP `403 Forbidden`.
- **Layer 3: Subprotocol Authentication**:
  - Browser passes `new WebSocket(url, ['proctornet', accessToken])`.
  - Server extracts token from `Sec-WebSocket-Protocol`.
  - If subprotocol is missing and query param `?token=` is present (fallback for CLI/tools), server extracts token and **redacts the query string from `req.url` before any logging occurs**.
  - Token is verified cryptographically via `verifyAccessToken`.
  - Session revocation is verified against Redis blacklist and PostgreSQL `user_sessions`.
  - Authoritative user roles are loaded from PostgreSQL `user_roles`.
- **Layer 4: User Concurrency Cap**: Active connections for `userId` are checked in `ChannelManager`. If already $\ge \text{WS\_MAX\_CONNECTIONS\_PER\_USER}$ (3), the oldest connection is closed with code `4429 (Too Many Connections)`.
- **Upgrade Completion**: `wss.handleUpgrade(req, socket, head, ...)` emits HTTP `101 Switching Protocols` with header `Sec-WebSocket-Protocol: proctornet`.

### 2. Connected Phase
- Server creates a `ConnectionContext` containing `{ connectionId, userId, roles, isAlive, lastHeartbeatAt, rooms: Set() }`.
- Server sends `connection:established` containing server timestamp and connection ID.

### 3. Heartbeat & Liveness Timing Model
The timing model is mathematically unified across transport and application layers:
- **Transport Liveness (Protocol Ping/Pong)**:
  - Server sends WebSocket protocol `ping` every 30 seconds (`WS_TRANSPORT_PING_INTERVAL_MS = 30000`).
  - Native browser WebSocket automatically responds with protocol `pong`.
  - If pong is missed before the next ping cycle (`isAlive === false`), server terminates socket with code `1006`.
- **Application Presence (Candidate Pulse)**:
  - Candidate client emits `{"type": "heartbeat", "payload": {"attemptId": "<id>"}}` every 5 seconds (`CANDIDATE_HEARTBEAT_INTERVAL_MS = 5000`).
  - Server updates `lastHeartbeatAt = Date.now()` and returns `heartbeat:ack`.
  - Server runs a presence sweep every 5 seconds (`WS_PRESENCE_SWEEP_INTERVAL_MS = 5000`).
- **Presence Loss Detection Bounds**:
  - **A. Observable / Graceful Close**: When candidate closes tab, navigates away, or socket fires `close`, server catches it immediately and emits `candidate:presence_changed` (`status: "OFFLINE"`) within $\le 1\text{ second}$.
  - **B. Silent / Ungraceful Loss (network pull, crash)**: Server flags candidate as offline when $\text{now} - \text{lastHeartbeatAt} > 15\text{ seconds}$ (3 consecutive missed heartbeats). With the 5-second sweep interval, worst-case detection upper bound is:
    $$\text{Detection Bound} = 15\text{s lapse threshold} + 5\text{s sweep interval} = 20\text{ seconds max (nominal 15s)}.$$
  - This timing is internally consistent, prevents false positives from transient 1–2s network jitter, and adheres to the proctoring detection target.

### 4. Disconnection & Cleanup
- Normal close (`1000`), tab close (`1001`), or abnormal drop (`1006`).
- Clears connection from room subscription indexes.
- Decrements Prometheus active connection gauge.
- Emits `candidate:presence_changed` to assigned session invigilators if candidate had an active attempt.

---

## 7. Authentication

### Subprotocol-First Authentication
1. **Primary Transport**: `Sec-WebSocket-Protocol: proctornet, <access_token>`.
   - Browser client: `new WebSocket(wsUrl, ['proctornet', token])`.
   - Leaves zero credentials in URL path, query string, or browser history.
2. **Fallback Transport (Tooling Only)**: Query parameter `?token=<access_token>`.
   - Permitted only for test harnesses and external CLI clients.
   - **Mandatory Redaction**: The upgrade request handler immediately strips `?token=...` from `req.url` and `req.originalUrl` prior to calling `requestLogger` or logging via Pino.
3. **Cryptographic Verification**: `verifyAccessToken(token)` validates signature and expiration against `JWT_ACCESS_SECRET`.
4. **Authoritative Revocation Verification**:
   - Step 1: Redis blacklist check via `isSessionBlacklisted(sessionId)`.
   - Step 2: Fallback to PostgreSQL `findSessionRevocationStatus(sessionId)`.
   - If revoked, returns HTTP `401 Unauthorized` and destroys raw TCP socket.
5. **Durable Role Hydration**: Fetches active roles from PostgreSQL `user_roles` via `getUserRoles(userId)` to ensure revoked privileges take immediate effect.

### Long-Lived Connection Token Management
- **Token Expiration vs. Socket Lifetime**: Access tokens have a 15-minute expiration (`JWT_ACCESS_EXPIRATION = '15m'`), whereas exams last 1–3 hours. Once established via a valid handshake, **the WebSocket TCP connection remains authenticated and open for the duration of the exam attempt**, subject to session revocation checks.
- **Proactive Client Refresh**: The client background timer proactively invokes REST `POST /api/v1/auth/refresh` at minute 12 (before the 15-minute token expires). The fresh access token is stored in client memory.
- **Seamless Reconnect**: If network interruption causes a socket reconnect after minute 15, the client initiates the new handshake using the *fresh, unexpired* access token obtained from the proactive REST refresh.
- **In-Flight Revocation Handling**:
  - If an administrator revokes a session or changes user roles during an active exam:
    - Redis blacklist is updated immediately.
    - Server-side sweeper or event listener terminates active sockets for that `sessionId` with code `4401 (Session Revoked)`.
  - Zero database tables are introduced to track transient socket token states.

---

## 8. Authorization / RBAC / BOLA

Every socket starts with **zero room subscriptions**. All subscriptions are verified server-side against PostgreSQL:

### Role Privileges
- **STUDENT**:
  - Permitted: `attempt:{attemptId}` (strictly where `attempt.student_id === user.userId`), `session:{sessionId}:candidate` (strictly where student is in `session_students`).
  - Prohibited: Any invigilator room (`session:{sessionId}`), other candidates' attempts, or system channels.
- **INVIGILATOR**:
  - Permitted: `session:{sessionId}` (strictly where invigilator is assigned in `session_invigilators` or role is ADMIN/FACULTY).
  - Prohibited: Candidate-only private channels, unassigned sessions.
- **FACULTY**:
  - Permitted: `session:{sessionId}` (for sessions belonging to exams created by the faculty member or assigned sessions).
- **ADMIN**:
  - Permitted: Global access to any session or attempt room.

### BOLA Defense
When a client sends `{"type": "subscribe", "room": "session:<sessionId>"}`, the server queries `session_invigilators` for `(sessionId, userId)`. If not assigned, the server emits `{"type": "error", "code": "SUBSCRIPTION_FORBIDDEN", "room": "session:<sessionId>"}` and refuses to register the socket.

---

## 9. Subscription Model

### Room Architecture & Reference Counting
In-process `ChannelManager` tracks:
- `roomToSockets`: `Map<string, Set<WebSocket>>`
- `socketToRooms`: `Map<WebSocket, Set<string>>`

### Frontend Subscription Multiplexing
To prevent multiple React components from opening duplicate sockets:
- A single shared WebSocket connection is managed by `RealtimeClient`.
- `ChannelManager` and frontend `RealtimeClient` implement **subscription reference counting**:
  - First subscriber to `session:123` $\to$ sends `subscribe` frame to server.
  - Second subscriber to `session:123` $\to$ increments local ref count; no redundant network frame sent.
  - One subscriber unmounts $\to$ decrements ref count.
  - Last subscriber unmounts (ref count = 0) $\to$ sends `unsubscribe` frame to server.
- Upon reconnection, `RealtimeClient` automatically re-subscribes to all active rooms with $\text{refCount} > 0$.

---

## 10. Event Envelope

All messages adhere to a strict Zod-validated JSON envelope:

```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "type": "proctoring:flag_raised",
  "version": "1.0",
  "timestamp": "2026-09-08T07:45:00.000Z",
  "room": "session:888e4567-e89b-12d3-a456-426614174888",
  "payload": {
    "flagId": "456e4567-e89b-12d3-a456-426614174111",
    "attemptId": "789e4567-e89b-12d3-a456-426614174222",
    "studentId": "321e4567-e89b-12d3-a456-426614174333",
    "flagType": "DEVTOOLS_DETECTED",
    "severity": "CRITICAL",
    "scoreDelta": 40,
    "details": { "reason": "DevTools opened during exam" }
  },
  "traceId": "c4b3a2-9876-4321"
}
```

---

## 11. Event Taxonomy

### Client $\to$ Server Commands
| Type | Purpose | Payload | Permitted Roles |
| :--- | :--- | :--- | :--- |
| `subscribe` | Request room subscription | `{ "room": "session:<id>" }` | Authenticated |
| `unsubscribe` | Leave room | `{ "room": "session:<id>" }` | Authenticated |
| `heartbeat` | Candidate liveness pulse | `{ "attemptId": "<id>" }` | STUDENT |

### Server $\to$ Client Notifications
| Type | Target Room | Purpose | Trigger Source |
| :--- | :--- | :--- | :--- |
| `connection:established` | Direct Socket | Acknowledge handshake and emit connection ID | WebSocket Gateway |
| `subscribed` | Direct Socket | Confirm authorized subscription | Channel Manager |
| `proctoring:risk_score_updated` | `session:{sessionId}` | Candidate anomaly risk score changed | `ingestCandidateEvents` |
| `proctoring:flag_raised` | `session:{sessionId}` | Anomaly flag raised (System or Staff) | `evaluateFlagsToRaise` / `createStaffFlag` |
| `proctoring:flag_reviewed` | `session:{sessionId}` | Anomaly flag marked REVIEWED/DISMISSED | `reviewFlag` |
| `candidate:presence_changed` | `session:{sessionId}` | Candidate connected, disconnected, or heartbeat timed out | Heartbeat Monitor |
| `attempt:state_changed` | `session:{sessionId}` | Attempt started, paused, resumed, or submitted | Attempts Service |
| `session:concluded` | `session:{sessionId}:candidate` | Exam session concluded or terminated | Sessions Service |
| `candidate:warning` | `attempt:{attemptId}` | Invigilator issued warning to candidate | Invigilator Action |
| `system:realtime_degraded` | Local Sockets | Warn that cross-node Redis synchronization is down | Broadcaster |
| `system:realtime_recovered` | Local Sockets | Notify that cross-node Redis synchronization is restored | Broadcaster |
| `heartbeat:ack` | Direct Socket | Heartbeat response with server time | Gateway |
| `error` | Direct Socket | Error notice (unauthorized, malformed) | Gateway |

---

## 12. Delivery Semantics & Degradation

1. **At-Most-Once Delivery**: Realtime WebSocket notifications are delivered on a best-effort basis. Network drops, temporary client disconnections, or browser tab suspensions may cause transient messages to be missed.
2. **Authoritative REST Backstop**: Clients **never** rely on receiving every WebSocket frame to maintain system correctness. Critical UI state is always reconstructible via REST APIs (`GET /api/v1/sessions/:sessionId/proctoring/summary`, `GET /api/v1/attempts/:attemptId`).
3. **Degraded Cross-Node Mode**: During a Redis partition in a multi-instance cluster, cross-node event delivery is interrupted. Sockets on Instance A will not receive events generated on Instance B. The system marks its status as `DEGRADED`, emits `system:realtime_degraded`, and invigilator dashboards activate 10-second REST polling until recovery.
4. **No Exactly-Once Network Delivery**: We explicitly disclaim exactly-once delivery over WebSockets. Idempotent business operations are strictly enforced at the database level via PostgreSQL transactions and unique constraints.

---

## 13. Ordering, Sequencing & Replay

- **Per-Socket Ordering**: The underlying TCP connection guarantees sequential delivery of frames sent to a single socket.
- **Cross-Socket Non-Determinism**: Order of arrival across multiple distinct client connections is subject to network latency variations.
- **Event Timestamps**: All event envelopes include authoritative server `timestamp`.
- **No Heavy In-Memory Replay Buffer**: WebSocket gateway does not buffer historic messages. When a client reconnects, it queries REST for the latest authoritative state snapshot.

---

## 14. Reconnection & Resynchronization

### Client Reconnection Strategy
- **Exponential Backoff with Jitter**:
  $$\text{delay} = \min(\text{maxDelay}, \text{baseDelay} \times 2^{\text{attempt}}) \pm \text{jitter}$$
  - $\text{baseDelay} = 1000\text{ ms}$
  - $\text{maxDelay} = 30000\text{ ms}$
  - $\text{jitter} = \pm 20\%$ (prevents thundering herd on server restarts)

### Resynchronization Workflow (Invigilator Dashboard)
1. WebSocket disconnects $\to$ UI displays "Connecting / Reconnecting" indicator.
2. Socket reconnects and completes handshake using fresh access token.
3. Client automatically re-subscribes to active rooms.
4. Client immediately triggers REST query `proctoringApi.getSessionProctoringSummary(sessionId)` to fetch any flags or score changes that occurred during disconnection.
5. If `system:realtime_degraded` was received, the dashboard continues polling REST every 10 seconds until `system:realtime_recovered` is received.

---

## 15. Backpressure & Queue Limits

To prevent memory leaks and server crashes from slow or stalled clients:
1. **Per-Connection Outbound Queue**: Max 100 pending messages.
2. **Buffer Threshold**: Check `ws.bufferedAmount`. If `ws.bufferedAmount > 1MB` (1,048,576 bytes) or outbound queue exceeds 100 items:
   - Drop lowest-priority transient messages (e.g. repeated heartbeats).
   - If buffer continues to grow, log warning and terminate connection (`1008 Policy Violation`).
3. **Client Inbound Message Size**: Maximum allowed incoming message size is **16 KB** (`maxPayload: 16384` in `ws.WebSocketServer`). Any client sending frames $>16\text{ KB}$ is immediately disconnected with close code `1009 Message Too Big`.

---

## 16. Multi-Tier Rate Limiting & Abuse Protection

The architecture enforces a strict 4-tier defense model:

```
[ Incoming Request ]
       │
       ▼
[ Tier 1: Pre-Upgrade Rate Limit ] ────> Exceeds 30/min/IP? ────> Destroy Socket (429)
       │
       ▼
[ Tier 2: Handshake Authentication ] ──> Invalid Token / CORS? ──> Destroy Socket (401/403)
       │
       ▼
[ Tier 3: User Concurrency Cap ] ──────> Exceeds 3 Sockets? ────> Close Oldest Socket (4429)
       │
       ▼
[ Tier 4: Connected Socket Limits ] ───> Exceeds 60 msg/min? ───> Throttle / Error Frame
                                    ───> Exceeds 16 KB Frame? ──> Terminate Socket (1009)
```

1. **Tier 1: Pre-Upgrade IP Rate Limiting**: Max 30 upgrade attempts per minute per source IP. Enforced using sliding-window rate limiter on the raw HTTP upgrade request before allocating any WebSocket resources.
2. **Tier 2: Handshake Authentication**: Origin check against `config.CORS_ORIGIN`, `Sec-WebSocket-Protocol` token validation, and Redis/PostgreSQL session revocation checks.
3. **Tier 3: User Concurrency Cap**: Maximum 3 concurrent active WebSocket connections per authenticated `userId`.
4. **Tier 4: Inbound Socket Message Rate Limit**: Maximum 60 client-to-server messages per minute per socket. Inbound frame size strictly limited to 16 KB.

---

## 17. Proctoring Integration & Error Isolation

Phase 16 seamlessly integrates with Phase 14 proctoring domain **without modifying proctoring business rules**:

```
[Candidate REST Ingestion] 
       │
       ▼
proctoring.service.js ──(PostgreSQL Transaction: lock attempt, score, insert flags, outbox)── Commit
       │
       ├─────────────────────────────────────────────────┐
       ▼                                                 ▼
[Outbox Dispatcher -> RabbitMQ]              [Post-Commit Realtime Dispatch]
(Phase 12 Asynchronous Workers)                          │
                                                         ▼
                                             try {
                                               await realtimeBroadcaster.notifyProctoringUpdate(...)
                                             } catch (broadcastErr) {
                                               logger.warn({ err }, 'Realtime broadcast failed');
                                               // Increment metric: proctornet_websocket_broadcast_errors_total
                                             }
                                             // REST Response returns 200 OK regardless of broadcast outcome
```

- **Strict Post-Commit Execution**: Broadcast occurs only after PostgreSQL transaction commits.
- **Isolated Error Boundary**: Broadcast calls in domain services are wrapped in non-blocking `try/catch` blocks. Broadcaster failures (e.g. Redis timeout, serialization glitch) log a structured warning and increment metrics, but **never** turn a committed HTTP 200 into an HTTP 500 response.

---

## 18. Evidence Integration Boundary

- **Zero Media Transport over WebSocket**: WebSockets **never** transport binary evidence (images, audio, video).
- **Direct-to-S3 Integrity**: Evidence uploads remain strictly direct-to-S3 via presigned PUT URLs with S3 version pinning (Phase 15).
- **Optional Metadata Notification**: When evidence is confirmed, the server may broadcast a lightweight metadata event `evidence:uploaded` (`{ attemptId, evidenceType, confirmedAt }`) to invigilators, but the media itself is retrieved on-demand via presigned playback GET URLs.

---

## 19. Redis Usage & Failure Semantics

### Multi-Instance vs. Single-Instance Architecture
1. **Single-Instance Mode (Local Development & Testing)**:
   - Operates entirely via in-process `ChannelManager`.
   - Zero Redis dependencies for realtime message dispatch.
2. **Multi-Instance Mode (Cluster behind ALB)**:
   - Uses dedicated Redis clients (`redisPub` and `redisSub`) on channel `proctornet:ws:events`.
   - Node A publishes to Redis; Node B receives from Redis and forwards to local sockets.

### Redis Failure & Split-Brain Mitigation
- **The Problem**: If Redis Pub/Sub crashes or disconnects in a multi-instance cluster, local in-process fallback alone would create silent split-brain where Node B never receives Node A's events.
- **The Solution**:
  1. Realtime distribution status is monitored. When Redis subscriber disconnects, distributor state transitions from `HEALTHY` to `DEGRADED`.
  2. Increments Prometheus counter `proctornet_websocket_redis_sync_errors_total`.
  3. Server broadcasts `{"type": "system:realtime_degraded", "payload": {"reason": "CROSS_NODE_SYNC_UNAVAILABLE"}}` to all local connected sockets.
  4. Invigilator dashboards receiving this event immediately activate **10-second REST background polling** to ensure no flags or risk scores are missed.
  5. When Redis reconnects, distributor state transitions to `HEALTHY`, broadcasts `system:realtime_recovered`, and dashboards stop background polling.
  6. **Non-Authoritative Invariant**: Redis failure never alters, delays, or fails PostgreSQL transactions or REST API responses.

---

## 20. RabbitMQ / Outbox Interaction

- **RabbitMQ**: Used for asynchronous, durable, decoupled worker tasks (e.g. exam submission evaluation, audit archival).
- **WebSocket**: Used for low-latency, ephemeral, transient UI notifications.
- **No Redundant Overhead**: Transient UI alerts (e.g. heartbeat acks, typing blur notice) do not pass through RabbitMQ or transactional outbox.
- **Decoupled Architecture**: RabbitMQ and WebSocket do not depend on each other.

---

## 21. PostgreSQL Interaction

- **Authoritative Entity Verification**: PostgreSQL provides the authoritative data for validating WebSocket upgrade and room subscriptions (`user_roles`, `exam_attempts`, `session_invigilators`, `session_students`).
- **Zero Socket Logging in PostgreSQL**: Transient WebSocket connections, pings, and frame receipts are **never written to PostgreSQL**. Doing so would rapidly exhaust the database connection pool (`DB_POOL_MAX = 10`).

---

## 22. Horizontal Scaling Strategy

```
                          [ AWS Application Load Balancer ]
                               /                     \
                      HTTP Upgrade               HTTP Upgrade
                             /                         \
           [ Backend Instance 1 ]                    [ Backend Instance 2 ]
             - ws server (Node 24)                     - ws server (Node 24)
             - Local ChannelManager                    - Local ChannelManager
                     │                                         │
                     └─── Publish / Subscribe via Redis ───────┘
                                   [ Redis Cluster ]
                              Channel: `proctornet:ws:events`
```

1. **ALB WebSocket Support**: AWS ALB natively supports WebSocket upgrades over HTTP/1.1 and HTTPS.
2. **Sticky Sessions (Not Required for WS)**: Once established, a WebSocket connection remains pinned to its target backend instance via TCP.
3. **Redis Pub/Sub Sync**: `realtimeBroadcaster.broadcastToRoom(room, event)` publishes to Redis; all cluster nodes receive the payload and dispatch to matching local sockets in their `roomToSockets` registry.
4. **Degraded State Awareness**: If Redis fails, all nodes notify connected clients to poll REST until Redis is restored.

---

## 23. Graceful Shutdown

Integrated with `backend/src/server.js`:
1. **Signal Received**: Server catches `SIGTERM` / `SIGINT`.
2. **Stop Accepting Upgrades**: Close HTTP upgrade listener on `http.Server`.
3. **Broadcast Shutdown Warning**: Send `{"type": "server_shutdown", "payload": {"message": "Server restarting"}}` to all connected sockets.
4. **Close Active Sockets**: Iterate through connected sockets and send clean close frame `1001 (Going Away)`.
5. **Drain Timeout**: Allow up to 3000ms for outbound frames to flush before terminating sockets.
6. **Close WS Server**: `wss.close()`.
7. **Proceed with Existing Shutdown Sequence**: Stop outbox poller $\to$ stop evaluation consumer $\to$ close RabbitMQ $\to$ close Redis $\to$ close DB pool $\to$ exit process.

---

## 24. Failure Scenarios

| Failure Scenario | Immediate System Behavior | Client Experience / Recovery |
| :--- | :--- | :--- |
| **Pre-Upgrade Flood (>30/min/IP)** | Server rejects upgrade with HTTP 429. Socket destroyed immediately. | Malicious or buggy client throttled without server memory exhaustion. |
| **Expired / Invalid JWT on Upgrade** | Server rejects upgrade with HTTP 401. Socket closed immediately. | Frontend triggers token refresh via REST `/auth/refresh` and retries WebSocket connection. |
| **Revoked Session on Upgrade** | Server rejects upgrade with HTTP 401. Socket destroyed. | Frontend redirects to login page. |
| **BOLA Unauthorized Subscription** | Gateway sends `error` frame: `SUBSCRIPTION_FORBIDDEN`. Subscription rejected. | Invigilator UI logs error; access denied. |
| **Oversized Inbound Payload (>16KB)** | Server terminates socket with code `1009`. | Malicious or buggy client disconnected immediately. |
| **Malformed Inbound JSON** | Server sends `error` frame: `MALFORMED_JSON` without crashing. | Connection preserved or terminated if repeated. |
| **Immediate Socket Close (Tab Close)** | Server catches socket `close` event immediately ($\le 1\text{s}$). | Assigned invigilators receive `candidate:presence_changed` (`status: "OFFLINE"`). |
| **Silent Drop (Cable Pull / Freeze)** | Candidate heartbeats lapse for $>15\text{s}$. Presence sweep marks offline ($\le 20\text{s}$). | Assigned invigilators receive `candidate:presence_changed` (`status: "OFFLINE"`). |
| **Multi-Node Redis Outage** | Distributor state becomes `DEGRADED`. Emits `system:realtime_degraded`. | Invigilator dashboards activate 10-second REST polling until Redis recovers. |
| **Post-Commit Broadcast Error** | Broadcaster catches error, logs warning, increments error metric. | HTTP response returns 200 OK. Client recovers state via REST. |
| **Server Restart / Deployment** | Server emits `server_shutdown` (1001) and drains sockets within 3s. | Clients reconnect to another instance using jittered backoff and resynchronize via REST. |

---

## 25. Security Model

1. **Subprotocol Authentication**: Tokens transmitted strictly in `Sec-WebSocket-Protocol: proctornet, <jwt>`, preventing token leakage into URL logs and browser history.
2. **Handshake Query String Redaction**: If `?token=` query param is used (fallback), it is stripped from `req.url` before `requestLogger` logs the request.
3. **Pre-Upgrade Rate Limiting**: 30 upgrade attempts/min per source IP prevents unauthenticated connection exhaustion attacks.
4. **Origin Verification**: Explicit check `req.headers.origin === config.CORS_ORIGIN` on upgrade prevents Cross-Site WebSocket Hijacking (CSWSH).
5. **Secure Transport**: WSS (TLS 1.3) required in production.
6. **No Sensitive Data in Payloads**: Zero passwords, secrets, raw clipboard text, keystrokes, answers, or raw media payloads transmitted.
7. **Strict Payload Size Limits**: Enforced 16 KB inbound frame limit.
8. **Authorization Enforcement**: Every room subscription is strictly verified against database ownership records.

---

## 26. Observability, Metrics & Audit

### Prometheus Metrics (`backend/src/infrastructure/metrics/registry.js`)
All labels are strictly bounded; zero UUIDs or high-cardinality values:
- `proctornet_websocket_connections_active` (Gauge, label: `role` [STUDENT, INVIGILATOR, FACULTY, ADMIN])
- `proctornet_websocket_connections_total` (Counter, labels: `role`, `status` [connected, rejected, closed])
- `proctornet_websocket_messages_received_total` (Counter, labels: `type`)
- `proctornet_websocket_messages_sent_total` (Counter, labels: `type`, `status` [delivered, dropped])
- `proctornet_websocket_heartbeat_timeouts_total` (Counter)
- `proctornet_websocket_redis_sync_errors_total` (Counter)
- `proctornet_websocket_broadcast_errors_total` (Counter)

### Structured Logging (Pino)
- Logged attributes: `connectionId`, `userId`, `role`, `room`, `eventType`.
- Strictly prohibited from logs: tokens, raw query strings containing credentials, sensitive payloads.

### Centralized Audit Trail
- Only auditable business actions trigger `recordAuditEvent` (e.g. `SESSION_ANNOUNCEMENT_BROADCAST`, `CANDIDATE_DISQUALIFIED`).
- Routine transient WebSocket frames (pings, heartbeats) are not recorded in audit logs.

---

## 27. Configuration & Environment

Additions to `backend/src/config/env.js`:
```javascript
WS_ENABLED: z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .default('true')
  .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1')),
WS_PRE_AUTH_RATE_LIMIT_PER_MIN: z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .default('30'),
WS_TRANSPORT_PING_INTERVAL_MS: z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .default('30000'),
WS_PRESENCE_SWEEP_INTERVAL_MS: z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .default('5000'),
WS_PRESENCE_LAPSE_THRESHOLD_MS: z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .default('15000'),
WS_MAX_PAYLOAD_BYTES: z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .default('16384'),
WS_MAX_CONNECTIONS_PER_USER: z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .default('3'),
```

---

## 28. Dependency Changes

### Backend (`backend/package.json`)
- **Add**: `ws: "^8.18.0"`
  - *Justification*: Industry-standard, RFC 6455-compliant native WebSocket server for Node.js. Zero superfluous dependencies.
- **Add (devDependencies)**: None required (standard Node test runner `node:test` and native `ws` client handles test mocks).

### Frontend (`frontend/package.json`)
- **Zero new dependencies**. Uses native browser `window.WebSocket`.

---

## 29. File-Level Change Plan

### New Backend Files
1. `backend/src/infrastructure/realtime/websocketServer.js`: Core WebSocket server setup, pre-upgrade rate limiting, subprotocol negotiation, connection lifecycle, and transport ping/pong runner.
2. `backend/src/infrastructure/realtime/channelManager.js`: In-process room subscription registry with reference tracking and user connection limits.
3. `backend/src/infrastructure/realtime/realtimeBroadcaster.js`: High-level domain broadcast abstraction with Redis Pub/Sub adapter and degraded state handling.
4. `backend/src/infrastructure/realtime/realtime.schemas.js`: Zod schemas for incoming and outgoing WebSocket envelopes and payloads.
5. `backend/src/infrastructure/realtime/index.js`: Clean public barrel export.

### Modified Backend Files
1. `backend/src/server.js`: Attach WebSocket upgrade listener to `http.Server` and include WebSocket draining in `gracefulShutdown`.
2. `backend/src/config/env.js`: Add WebSocket configuration parameters with Zod schema validation.
3. `backend/src/infrastructure/metrics/registry.js`: Add WebSocket Prometheus counters and gauges.
4. `backend/src/modules/proctoring/proctoring.service.js`: Hook `realtimeBroadcaster` post-commit with isolated `try/catch` error handling.
5. `backend/src/middleware/requestLogger.js`: Add sanitization logic to redact query-string tokens from logged URLs.
6. `backend/package.json`: Add `ws` dependency.

### New Frontend Files
1. `frontend/src/services/realtimeClient.js`: Resilient singleton WebSocket client with subprotocol authentication, automatic reconnection, and room subscription reference counting.
2. `frontend/src/context/RealtimeContext.jsx`: React Context provider (`<RealtimeProvider>`) managing the shared singleton `RealtimeClient` lifecycle.
3. `frontend/src/hooks/useRealtime.js`: React hook consuming `RealtimeContext` to subscribe/unsubscribe to rooms and event types.

### Modified Frontend Files
1. `frontend/src/App.jsx`: Wrap authenticated routes with `<RealtimeProvider>`.
2. `frontend/src/pages/invigilator/SessionMonitorPage.jsx`: Connect to session room via `useRealtime`, update candidate roster / flags dynamically, and activate 10s REST polling when `system:realtime_degraded` is active.
3. `frontend/src/pages/candidate/ExamTakingPage.jsx`: Connect to candidate room via `useRealtime` for announcements, warnings, and 5-second application presence pulses.

### Documentation Files
1. `docs/ADR/0006-websocket-realtime-control-plane-and-redis-pubsub-synchronization.md`: Architecture Decision Record for Phase 16.
2. `docs/ADR/README.md`: Update index with ADR-0006.
3. `docs/DEVELOPMENT_PLAN.md`: (Will be updated in implementation gate).

---

## 30. Database / Migration Decision

### Decision: NO DATABASE MIGRATION REQUIRED
- Transient WebSocket connections, heartbeats, and room memberships are strictly ephemeral and must not be stored in PostgreSQL.
- Business entities (`users`, `exams`, `exam_sessions`, `session_invigilators`, `session_students`, `exam_attempts`, `violation_events`, `violation_flags`, `audit_logs`) already exist from Migrations 001–017 and provide all required authorization and state data.
- Introducing a database table for WebSockets would rapidly exhaust connection pool resources and violate Step 13.5 state decoupling principles.

---

## 31. Frontend Implementation Plan

1. **`RealtimeContext.jsx` & `RealtimeProvider`**:
   - Manages single `RealtimeClient` instance tied to active user session.
   - Cleanly closes WebSocket connection when user logs out.
2. **`realtimeClient.js` (Singleton Service)**:
   - Uses native `new WebSocket(wsUrl, ['proctornet', token])`.
   - States: `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `RECONNECTING`.
   - Subscription reference counting: multiple components subscribing to `session:X` share one room subscription.
   - Event emitter pattern: `on(eventType, handler)`, `off(eventType, handler)`.
   - Reconnect with exponential backoff and $\pm 20\%$ jitter.
   - Uses proactive refreshed token on reconnects.
3. **`useRealtime` Hook**:
   - Calls `subscribe(room, handler)` on mount and `unsubscribe(room, handler)` on unmount.
   - Exposes `connectionStatus` and `isDegraded`.
4. **UI Integration**:
   - `SessionMonitorPage.jsx`: Dynamic updates to candidate risk scores, flags, and presence. Automatically switches to 10s REST polling if `isDegraded === true`.

---

## 32. Backend Implementation Plan

1. **Pre-Upgrade Rate Limiter**:
   - Intercepts raw `upgrade` event on `http.Server`.
   - Checks source IP against sliding-window counter. If $>30\text{ req/min}$, returns HTTP 429 and destroys socket.
2. **Subprotocol Authentication**:
   - Extracts token from `Sec-WebSocket-Protocol: proctornet, <token>`.
   - Validates JWT, verifies session revocation in Redis/PostgreSQL, loads authoritative roles.
   - Enforces max 3 connections per user.
3. **Presence & Heartbeat Sweeper**:
   - Evaluates `lastHeartbeatAt` every 5 seconds. If $>15\text{s}$, emits `candidate:presence_changed` (`status: "OFFLINE"`).
   - Sends protocol `ping` every 30 seconds to clean up zombie sockets.
4. **Broadcaster Integration**:
   - Provides clean API `broadcastToSession(sessionId, eventType, payload)`.
   - Dispatches locally and to Redis Pub/Sub (`proctornet:ws:events`).
   - If Redis Pub/Sub fails, marks state `DEGRADED` and notifies local clients.
   - Wraps calls in domain services with `try/catch` error isolation.

---

## 33. Testing Strategy

### 1. Unit Tests (`backend/tests/realtime/websocketUnit.test.js`)
- Message envelope Zod schema validation (valid and malformed).
- Subprotocol header token parsing and fallback query-string redaction.
- Origin header validation.
- Pre-upgrade IP rate limiting logic.
- ChannelManager reference counting and subscription tracking.
- Backpressure queue size enforcement.

### 2. Integration Tests (`backend/tests/realtime/websocketIntegration.test.js`)
- Full HTTP upgrade handshake using `Sec-WebSocket-Protocol`.
- Handshake rejection on invalid / expired / revoked token.
- Pre-upgrade rate limit rejection (HTTP 429 on $>30$ requests).
- Room subscription authorization for invigilator and candidate.
- Realtime event delivery from proctoring service to subscribed invigilator.
- Presence detection: immediate socket close ($\le 1\text{s}$) and ungraceful drop ($\le 20\text{s}$).
- Graceful shutdown socket drain.

### 3. Consistency & Failure Tests (`backend/tests/realtime/websocketConsistency.test.js`)
- Post-commit broadcast failure isolation (proctoring ingestion succeeds 200 OK even if broadcaster throws).
- Multi-node Redis Pub/Sub failure: state transitions to `DEGRADED`, emits `system:realtime_degraded`.
- Recovery: Redis reconnects, state transitions to `HEALTHY`, emits `system:realtime_recovered`.
- Long-lived connection: token refreshed via REST, socket reconnects successfully with new token.

### 4. Security / RBAC / BOLA Tests (`backend/tests/realtime/websocketSecurity.test.js`)
- Candidate attempting to subscribe to another candidate's room (rejected).
- Candidate attempting to subscribe to invigilator telemetry room (rejected).
- Invigilator attempting to subscribe to unassigned session room (rejected).
- Oversized payload rejection ($>16\text{ KB}$).
- User connection cap enforcement (4th connection closes oldest).
- Verification that query tokens are redacted from request logs.

### 5. Frontend Client Tests (`frontend/tests/services/realtimeClient.test.js`)
- Subprotocol negotiation in `RealtimeClient`.
- Shared singleton connection: multiple hooks multiplex over one socket.
- Subscription reference counting (only 1 subscribe frame sent for 2 hooks).
- Degraded mode fallback: component triggers 10s REST polling upon `system:realtime_degraded`.

### 6. Full Regression Suite
- Run entire backend suite (`npm test` — all 583+ tests across 141+ suites).
- Run entire frontend suite (`npm --prefix frontend test` — all 33+ tests).

---

## 34. Performance & Capacity Targets

*These metrics represent design SLO targets, not rigid CI unit test constraints:*

| Metric | Target / Design SLO | Architectural Rationale |
| :--- | :--- | :--- |
| **Max Concurrent Connections per Instance** | 2,000 active sockets | Node 24 event loop handles 2k sockets at ~50MB total heap. |
| **Alert Delivery Latency** | $< 100\text{ ms}$ (p95) | In-process dispatch from commit to socket write. |
| **Observable Socket Close Alert** | $\le 1\text{ second}$ | Immediate TCP close frame detection. |
| **Ungraceful Presence Drop Alert** | $\le 20\text{ seconds}$ | 15s lapse threshold (3 missed 5s pulses) + 5s sweep interval. |
| **Candidate Pulse Interval** | 5 seconds | Low overhead (~50 bytes/pulse) providing rapid cheat detection. |
| **Transport Ping Interval** | 30 seconds | Protocol-level zombie socket cleanup. |
| **Pre-Upgrade Rate Limit** | 30 requests/min/IP | Mitigates connection flood before authentication. |
| **Max Inbound Payload** | 16 KB | Prevents memory allocation abuse. |
| **Graceful Shutdown Drain** | $\le 3,000\text{ ms}$ | Closes sockets promptly during rolling deployments. |

---

## 35. ADR Decision

### Decision: ADR-0006 REQUIRED
- **Title**: `ADR-0006: WebSocket Realtime Control Plane, Subprotocol Authentication, and Redis Pub/Sub Synchronization`
- **Rationale**: Formalizes the adoption of `ws` over Socket.IO, `Sec-WebSocket-Protocol` token negotiation, multi-node degraded synchronization semantics, frontend singleton multiplexing, and REST/WebSocket separation.

---

## 36. Phase 17 / 18 Boundary

- **Phase 17 (WebRTC + SFU)**:
  - Phase 16 establishes the WebSocket control plane; Phase 17 will utilize this WebSocket gateway for WebRTC SDP offer/answer/ICE candidate signaling.
  - No media streaming or SFU relays are implemented in Phase 16.
- **Phase 18 (Security Hardening & Antivirus)**:
  - Advanced deep malware scanning, cryptographic evidence attestation, and infrastructure hardening are deferred to Phase 18.

---

## 37. Risks and Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Cross-Node Split-Brain on Redis Outage** | Proctors on Node B miss alerts generated on Node A. | Server transitions to `DEGRADED`, emits warning event, and invigilator dashboards activate 10s REST polling. |
| **JWT Credential Leakage in Logs** | Access tokens visible in proxy logs and browser history. | Subprotocol negotiation (`Sec-WebSocket-Protocol: proctornet, <token>`) used exclusively; query strings redacted. |
| **False Candidate Disconnect Alarms** | Transient 1-2s network hiccups trigger cheating alarms. | 15-second lapse threshold requires 3 consecutive missed pulses before flagging ungraceful drop. |
| **Pre-Auth Connection Exhaustion** | Bots flood `/ws` HTTP upgrades, crashing Node. | Pre-upgrade IP sliding-window rate limit (30 req/min/IP) rejects before socket allocation. |
| **Frontend Socket Explosion** | Multiple React components open multiple sockets, hitting user cap. | Single shared WebSocket managed via `RealtimeProvider` with subscription reference counting. |
| **Broadcaster Failure Breaking REST API** | Redis or serialization error turns candidate 200 OK into 500 error. | Domain service broadcast calls wrapped in non-blocking `try/catch` error isolation post-commit. |

---

## 38. Implementation Sequence

1. **Backend Infrastructure & Dependencies**: Add `ws` to `backend/package.json`.
2. **Configuration & Metrics**: Update `env.js` and `registry.js`.
3. **Core Realtime Engine**: Implement `websocketServer.js` (with pre-upgrade rate limit and subprotocol auth), `channelManager.js` (with ref counting), and `realtime.schemas.js`.
4. **Broadcaster & Redis Sync**: Implement `realtimeBroadcaster.js` with multi-node Redis Pub/Sub adapter and degraded-state handling.
5. **Server Integration**: Attach upgrade listener and graceful shutdown in `server.js`.
6. **Domain Hooks**: Connect `proctoring.service.js` flag creation/review to `realtimeBroadcaster` with `try/catch` error isolation.
7. **Frontend Core**: Build `realtimeClient.js`, `RealtimeContext.jsx`, and `useRealtime.js`.
8. **UI Integration**: Update `SessionMonitorPage.jsx` (with 10s degraded REST polling) and `ExamTakingPage.jsx` (with 5s presence pulse).
9. **ADR-0006**: Author `docs/ADR/0006-websocket-realtime-control-plane-and-redis-pubsub-synchronization.md`.
10. **Test Validation**: Unit, integration, consistency, security, and full regression test execution.

---

## 39. Acceptance Criteria

1. **Authority Preserved**: PostgreSQL remains the sole authoritative store; REST remains authoritative for all business state mutations.
2. **Library Selection**: Native `ws` is used on backend; native `window.WebSocket` is used on frontend with zero frontend npm dependencies.
3. **Subprotocol Authentication**: Handshake authenticates via `Sec-WebSocket-Protocol: proctornet, <jwt>`. Zero credentials logged in URLs or request logs.
4. **Pre-Upgrade Rate Limiting**: HTTP `/ws` upgrades exceeding 30 req/min per IP are rejected with HTTP 429 before WebSocket allocation.
5. **Authorized Subscriptions**: Students cannot subscribe to invigilator or peer attempt rooms; invigilators can only subscribe to assigned sessions.
6. **Realtime Proctoring Alerts**: Invigilators subscribed to `session:{sessionId}` receive `proctoring:flag_raised` and `proctoring:risk_score_updated` within $\le 500\text{ ms}$ of ingestion commit.
7. **Consistent Presence Monitoring**:
   - Immediate socket close triggers `candidate:presence_changed` alert within $\le 1\text{ second}$.
   - Ungraceful drop (missed heartbeats $>15\text{s}$) triggers alert within $\le 20\text{ seconds}$.
8. **Multi-Node Degraded Handling**: If Redis Pub/Sub fails in multi-instance mode, server transitions to `DEGRADED`, emits `system:realtime_degraded`, and invigilators fall back to 10-second REST polling.
9. **Error Isolation**: Broadcaster failures post-commit never impact the HTTP response status of a committed business transaction.
10. **Frontend Multiplexing**: Single shared WebSocket connection per browser context via `RealtimeProvider` with subscription reference counting.
11. **Bounded Queues & Frames**: Inbound payload capped at 16 KB; outbound per-socket queue capped at 100 messages with `bufferedAmount` protection.
12. **No Media Transport**: Zero binary evidence (images/audio/video) or WebRTC media transported over WebSocket.
13. **No Database Migration**: Zero new database tables or schema changes introduced.
14. **Graceful Shutdown**: All sockets cleanly closed with code 1001 within a 3000ms bounded drain window.
15. **Comprehensive Tests**: Unit, integration, consistency, security, and regression tests passing with 100% pass rate.

---

## 40. Plan Freeze Checklist

- [x] Precedence hierarchy followed: Notion Step 13 $\to$ `DEVELOPMENT_PLAN.md` $\to$ Existing repository $\to$ ADRs.
- [x] REST vs WebSocket boundary explicitly delineated.
- [x] Library choice (`ws`) thoroughly justified against alternatives.
- [x] Subprotocol authentication (`Sec-WebSocket-Protocol`) eliminates credential leakage in query parameters and logs (Finding 2).
- [x] Pre-upgrade IP rate limiting (30/min/IP) protects against unauthenticated socket flooding (Finding 6).
- [x] Multi-node Redis failure semantics explicitly defined with degraded state and 10s REST polling fallback (Finding 1).
- [x] Presence detection mathematically derived for both immediate close ($\le 1\text{s}$) and ungraceful drops ($\le 20\text{s}$) (Finding 3).
- [x] Long-lived connection token expiration decoupled from socket lifetime with proactive REST refresh (Finding 4).
- [x] Frontend socket multiplexing and subscription reference counting specified via `RealtimeProvider` (Finding 5).
- [x] Post-commit broadcast calls isolated in `try/catch` to guarantee REST transaction resilience (Finding 7).
- [x] Zero database migration confirmed.
- [x] Phase 17/18 scope boundaries strictly preserved.
