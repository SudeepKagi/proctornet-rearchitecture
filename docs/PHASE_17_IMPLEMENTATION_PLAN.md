# PHASE 17 — WEBRTC / SFU MEDIA ARCHITECTURE
## IMPLEMENTATION PLAN (CORRECTED — REVISION 3)

> **Authoritative Specification & Architecture Contract**  
> Conforms strictly to:  
> 1. Notion Step 13 Final Re-Architecture (Sections 13.5, 13.7, 13.17)  
> 2. `docs/DEVELOPMENT_PLAN.md` (Phase 17)  
> 3. `docs/ARCHITECTURE.md` (Media Plane Isolation, Realtime Monitoring)  
> 4. Existing Merged Repository Architecture (Phases 1–16, ADR-0001 through ADR-0006)  
> 5. Independent Plan Re-Review Corrections (Revision 3: Per-Worker Fencing, Batch Validation, Disconnect Cleanup, Production IP Topology)

---

## 1. Executive Summary

Phase 17 introduces the dedicated WebRTC media plane for live multi-candidate remote proctoring. It empowers authorized invigilators to passively monitor live candidate audio, webcam video, and desktop screen feeds in real time during active examination sessions, while strictly safeguarding candidate privacy, preventing cross-session media leakage, and enforcing complete isolation between real-time media forwarding and authoritative exam business state.

**Core Architectural Invariant**:  
WebRTC is strictly an **ephemeral media transport**; Selective Forwarding Units (SFUs) are strictly **media forwarders**. Neither WebRTC nor the SFU ever becomes an authoritative source of truth for examination, candidate, or business state. PostgreSQL remains the sole authoritative source of truth for persistent entities, session enrollment, invigilator assignments, and audit trails. REST APIs remain authoritative for business commands and state queries. The Phase 16 WebSocket control plane serves as the secure signaling transport. Live media packets (SRTP/SRTCP) flow directly between browsers and the SFU media server over dedicated UDP/TCP ports—the application server thread **never** proxies, decodes, or buffers media frames.

### Plan Revision 3 Highlights:
1. **Per-Worker Generation / Epoch Fencing (Finding 1)**: Replaces global generation counters with **per-worker generation contexts** (`workerContexts[i].generation`). When Worker $i$ dies, only Worker $i$ increments its generation ($N_i \to N_i+1$) and only its assigned sessions enter `RESETTING`; healthy workers $j \ne i$ continue operating at generation $N_j$ with **zero blast-radius disruption**.
2. **`consume_batch` Validation & Deduplication (Finding 2)**: Enforces `min(1).max(36)` on `producerIds` in Zod schemas and executes server-side deduplication (`[...new Set(producerIds)]`), preventing redundant consumer instantiation while preserving deterministic response ordering.
3. **Deterministic Socket Disconnect Teardown (Finding 3)**: Binds `ws.on('close')` directly to `defaultSfuManager.closeTransportsForConnection(context.connectionId)`, ensuring immediate, idempotent release of all sending/receiving transports, producers, and consumers upon tab close, network loss, or Phase 16 authoritative revocation sweeps.
4. **Production Network IP Architecture (Finding 4)**: Clarifies the dual-address topology: in development, `MEDIA_LISTEN_IP` defaults to `127.0.0.1`; in production, `MEDIA_LISTEN_IP` binds to `0.0.0.0` while `MEDIA_ANNOUNCED_IP` advertises the external public Elastic IP/NAT address in ICE candidates.
5. **Decoupled WebSocket Payload Sizing**: Preserves Phase 16's strict 16 KB limit for generic control messages while establishing a dedicated authenticated `WS_MEDIA_MAX_PAYLOAD_BYTES = 65536` (64 KB) ceiling for `media:*` frames; supplies `rtpCapabilities` once at root level.
6. **Batched Multi-Consumer Creation with Partial-Success Semantics**: Clarifies independent per-producer BOLA authorization and non-rollback partial failure behavior.
7. **Bounded Worker Pool Sizing & Deterministic Session Pinning**: Bounded `MEDIASOUP_NUM_WORKERS` (capped default 4); deterministic session-to-worker pinning via `crc32(sessionId) % numWorkers`.
8. **Redis Failure Resilience & In-Memory Authority**: In-memory SFU state is authoritative for local co-located sessions; Redis outage does not disrupt local streaming; active reconciliation purges stale keys upon reconnect.
9. **Eliminated Hardcoded Default Secret**: Replaces default `MEDIA_SIGNING_SECRET` with `z.string().min(32).optional()`, documenting that it is unused in co-located mode and required only if standalone distributed SFU mode is activated.
10. **Nominal Bitrate Envelopes & Congestion Ladder**: Budgeted within a $\le 1.0\text{ Mbps}$ nominal network envelope (Profile A: ~535 kbps net nominal; Profile B: ~1.0 Mbps net nominal, peak ~1.4 Mbps) with strict priority: Audio $\to$ Low Webcam $\to$ Drop High Webcam $\to$ Throttle Screen $\to$ Pause Screen.
11. **Invigilator Audio Policy & Visual VU Telemetry**: 12-candidate grid MUTED by default, single-candidate solo listening on focus, and non-audible visual RFC 6464 VU meter telemetry.
12. **Pre-Exam Hardware Lock Prevention**: Enforces explicit `track.stop()` cleanup across all unmount, navigation, success, and error paths in `PreExamReadinessPage` before `ExamTakingPage` acquires fresh production streams.

---

## 2. Current Repository Baseline

- **Backend Architecture**: Modular monolith built on Node.js (>=24) and Express, with PostgreSQL connection pooling (`pg`), Redis caching and pub/sub (`ioredis`), RabbitMQ outbox dispatching (`amqplib`), and S3 presigned evidence storage (`@aws-sdk/client-s3`).
- **Phase 16 WebSocket Control Plane**: Native RFC 6455 server (`ws`), subprotocol-first JWT authentication (`Sec-WebSocket-Protocol: proctornet, <jwt>`), CSWSH origin defense, pre-upgrade IP sliding-window rate limiting (`WS_TRUSTED_PROXY_COUNT`), reference-counted `ChannelManager`, periodic authoritative revocation sweeps, and per-socket Tier-4 inbound rate limiting.
- **Proctoring Domain (Phase 14)**: Automated anomaly scoring engine, violation event ingestion, outbox event generation, and post-commit realtime broadcast integration.
- **Evidence Storage (Phase 15)**: Direct-to-S3 presigned uploads for selective evidence snapshots and audio clips, backed by immutable metadata and cryptographic checksums in PostgreSQL.
- **Frontend Architecture**: React 19 SPA with React Router 7, Vite, and Vitest. Features a shared `RealtimeProvider` singleton multiplexing room subscriptions with automatic reconnection, jittered exponential backoff, and degraded REST polling fallback.
- **Media Stack Audit**: Exactly zero WebRTC, `getUserMedia`, `getDisplayMedia`, `RTCPeerConnection`, SFU, or STUN/TURN code currently exists. Phase 17 constructs the media plane cleanly on top of this stable foundation.

---

## 3. Architectural Intent

The primary objective of Phase 17 is to provide reliable, low-latency ($<300\text{ ms}$ glass-to-glass) media streaming from active candidate examination clients to authorized invigilator dashboards without:
1. Contending with the Node.js event loop or HTTP API request processing.
2. Compromising database connection pools or disk I/O.
3. Permitting unauthorized media publication or subscription (Broken Object Level Authorization / BOLA).
4. Persisting raw video/audio media to databases or local server filesystems.
5. Imposing unsustainable uplink bandwidth demands on candidates or downlink bottlenecks on invigilators.

---

## 4. Media Plane vs Control Plane vs Business Plane

To ensure maximum resilience and strict adherence to Step 13.5 state decoupling, ProctorNet partitions all runtime interactions into three isolated planes:

```
+-------------------------------------------------------------------------------+
|                             PROCTORNET ARCHITECTURE                           |
+-------------------------------------------------------------------------------+
|                                                                               |
|  1. BUSINESS PLANE (Authoritative)                                            |
|     - Protocol: HTTP / REST (JSON)                                            |
|     - Store: PostgreSQL (ACID transactions, Row-Level Locking)                 |
|     - Responsibilities: Auth, Exam lifecycle, Answers, Submissions, BOLA      |
|                                                                               |
|  2. CONTROL & SIGNALING PLANE (Near Real-Time)                                |
|     - Protocol: WebSocket RFC 6455 (WSS)                                      |
|     - Store: Redis Pub/Sub (Ephemeral, non-authoritative cross-node sync)      |
|     - Responsibilities: WebRTC SDP/ICE signaling, presence pulse, alerts      |
|                                                                               |
|  3. MEDIA PLANE (High-Throughput Real-Time)                                   |
|     - Protocol: WebRTC (SRTP/SRTCP over UDP/DTLS 1.2+)                        |
|     - Node: Selective Forwarding Unit (mediasoup C++ Worker Pool)             |
|     - Responsibilities: Zero-copy packet forwarding, simulcast layer routing  |
|                                                                               |
+-------------------------------------------------------------------------------+
```

| Dimension | Business Plane | Control & Signaling Plane | Media Plane |
| :--- | :--- | :--- | :--- |
| **Transport** | HTTPS / REST | WSS (RFC 6455) | WebRTC (SRTP over UDP/DTLS) |
| **Node** | Node.js Backend API | Node.js WebSocket Gateway | Dedicated mediasoup C++ Worker |
| **State Authority**| Authoritative (PostgreSQL)| Transient / Ephemeral | Pure Ephemeral Memory |
| **Payload** | JSON business data | JSON signaling & control | Encrypted Opus/VP8 RTP packets |
| **Packet Forwarding**| Application logic | Pub/Sub message routing | C++ libuv / epoll UDP socket relay |
| **Failure Impact** | HTTP error response | Degraded fallback to REST | Media freeze; exam state untouched |

---

## 5. SFU Technology Evaluation

We evaluate the three leading open-source SFU candidates against ProctorNet's operational and architectural requirements:

### Option 1: mediasoup (v3)
- **Architecture**: Minimalist, un-opinionated WebRTC SFU engine. Written in C++ (libuv, OpenSSL, usrsctp) with a first-class Node.js control API.
- **Node.js Integration**: Runs as child worker processes (`mediasoup-worker`) managed via Unix pipes/sockets by Node.js.
- **Signaling**: Completely un-opinionated. Has **zero** built-in signaling, requiring the application to provide its own signaling channel (perfect match for Phase 16 WebSocket).
- **Performance**: High multi-core throughput; C++ worker handles multi-gigabit RTP routing with epoll/kqueue.
- **Licensing**: ISC License (permissive open source).
- **Simulcast & SVC**: Native support for VP8/H.264 simulcast and dynamic spatial/temporal layer switching.
- **Client**: `mediasoup-client` provides ORTC-based `Device`, `sendTransport`, `recvTransport`, `produce()`, `consume()`.
- **Considerations**: Requires prebuilt worker binaries or native C++ compilation tools.

### Option 2: LiveKit
- **Architecture**: Modern, autonomous WebRTC server written in Go.
- **Node.js Integration**: Controlled via `livekit-server-sdk` over gRPC/REST.
- **Signaling**: Opinionated, built-in WebSocket signaling protocol running on port 7880 using Protocol Buffers.
- **Operational Model**: Standalone daemon process (`livekit-server`).
- **Licensing**: Apache 2.0.
- **Considerations**: Running LiveKit introduces a second, parallel WebSocket signaling connection alongside Phase 16 WebSocket, duplicating connection pools, heartbeat sweeps, and network sockets in client browsers.

### Option 3: Janus WebRTC Server
- **Architecture**: General-purpose C gateway using a plugin architecture (`videoroom`).
- **Signaling**: REST or WebSocket plugin API with proprietary JSON protocol.
- **Operational Model**: Standalone C daemon with separate configuration files.
- **Licensing**: GPLv3 (presents significant licensing friction for proprietary enterprise educational platforms).
- **Considerations**: Complex configuration, legacy C architecture, non-permissive license.

---

## 6. SFU Recommendation

**Recommended Selection: mediasoup (v3)**

### Rationale:
1. **Architectural Cohesion with Phase 16**: Mediasoup is intentionally designed without an opinionated signaling layer. It seamlessly adopts ProctorNet's Phase 16 WebSocket control plane as its native signaling transport. Clients maintain **exactly one** WebSocket connection that multiplexes proctoring events, presence heartbeats, official warnings, and WebRTC media signaling.
2. **Strict Media/Application Separation**: The Node.js application process coordinates signaling, authorization, and room topology via the `mediasoup` Node.js API, while the underlying `mediasoup-worker` C++ child process handles high-bandwidth RTP/RTCP packet forwarding in isolated worker threads. The Node.js event loop never touches media packets.
3. **Fine-Grained BOLA Authorization**: Every signaling action (`createWebRtcTransport`, `connectWebRtcTransport`, `produce`, `consume`, `consume_batch`) is a discrete JavaScript method invocation in Node.js, allowing ProctorNet to evaluate PostgreSQL authorization rules directly before creating or exposing media tracks.
4. **Permissive Licensing**: Permissive ISC license with zero commercial or closed-source restrictions.
5. **Simulcast & Bandwidth Management**: Native support for multi-stream simulcast, dynamic spatial layer switching, and consumer pausing/resuming.

---

## 7. WebRTC Topology

ProctorNet implements an asymmetric, unidirectional **Star SFU Topology**:

```
[Candidate Client]
  │  (Uplink: Webcam Video + Mic Audio + Screen Share Video)
  ▼
[mediasoup SFU Router]
  │
  ├──────> [Invigilator A] (Downlink: 12-Grid or Focused View)
  │
  ├──────> [Invigilator B] (Downlink: 12-Grid or Focused View)
  │
  └──────> [Faculty / Admin] (Downlink: Passive Audit View)
```

- **Uplink (Publishing)**:
  - The candidate establishes **one** sending WebRTC transport (`sendTransport`).
  - Publishes up to 3 media tracks:
    1. `webcam` (Video track, VP8 simulcast: High & Low layers)
    2. `microphone` (Audio track, Opus mono speech)
    3. `screen` (Video track, VP8 high-res low-framerate, conditional)
  - The candidate uploads exactly **one** copy of each track to the SFU, independent of how many invigilators are viewing.
- **Downlink (Subscription)**:
  - Authorized invigilators establish **one** receiving WebRTC transport (`recvTransport`).
  - Invigilators consume the producer tracks of candidates enrolled in their assigned session.
  - Media flow is strictly **one-way** (Candidate $\rightarrow$ Invigilator). Invigilators do **not** transmit media back to candidates, preserving candidate bandwidth and eliminating distraction.

---

## 8. Signaling Architecture

Signaling utilizes the established Phase 16 WebSocket connection over secure WebSocket (`wss://<host>/ws`).

### Core Signaling Workflow (with Batched Consumption & Per-Worker Epoch Fencing):
```
Candidate Browser               ProctorNet WebSocket             mediasoup Worker (i)
       │                                  │                              │
       │─── media:get_router_caps ───────>│                              │
       │<── media:router_caps ────────────│ (loads Device)               │
       │                                  │                              │
       │─── media:create_transport ──────>│─── router.createTransport ──>│
       │<── media:transport_created ──────│<── { id, ice, dtls } ────────│
       │                                  │                              │
       │─── media:connect_transport ─────>│─── transport.connect ────────>│
       │<── media:transport_connected ────│                              │
       │                                  │                              │
       │─── media:produce (track) ───────>│─── transport.produce ────────>│
       │<── media:produced { id } ────────│<── producerId ───────────────│
       │                                  │                              │
       │                                  │══ Redis Pub/Sub =============│
       │                                  │ (Broadcasts new producer)     │
       │                                  │                              │
Invigilator Browser                       │                              │
       │                                  │                              │
       │<── media:producer_added ─────────│                              │
       │─── media:create_transport ──────>│─── router.createTransport ──>│
       │<── media:transport_created ──────│<── { id, ice, dtls } ────────│
       │─── media:consume_batch ─────────>│─── [Batch BOLA auth] ────────│
       │    (rtpCaps once at root,        │─── transport.consume x N ────>│
       │     deduped producerIds)         │                              │
       │<── media:consumed_batch ─────────│<── [{ prodId, consId, rtp }]─│
       │                                  │                              │
       │<================== WebRTC SRTP Media Stream ===================>│
```

---

## 9. Phase 16 WebSocket Integration, Rate Limits & Payload Sizing

### 9.1 Signaling Traffic Analysis & Derivation
Under normal proctoring operations, media signaling exhibits characteristic burst patterns:

- **Candidate Client**:
  - Initial connection burst: `get_router_capabilities` (1), `create_transport` (1), `connect_transport` (1), `produce` webcam (1), `produce` microphone (1), `produce` screen if enabled (1), trickled ICE candidates (4–8) = **10–14 messages in first 10 seconds**.
  - Steady state: Heartbeats (2/min), periodic ICE/transport health stats (1/min) = **2–4 messages/min**.
  - Transient network events (ICE restart): `restart_ice` (1), `connect_transport` (1), candidate trickling (3–5) = **5–7 messages**.

- **Invigilator Client (12-Candidate Grid Monitoring)**:
  - Initial connection burst: `get_router_capabilities` (1), `create_transport` (1), `connect_transport` (1).
  - Batched track consumption for 12 candidates $\times$ 3 tracks = **1 message** via `media:consume_batch`.
  - Layer switching for grid tiles = **0–4 messages** (simulcast low layer is auto-assigned on consume).
  - ICE trickling = **4–8 messages**.
  - Total invigilator burst with batching: **8–14 messages within first 15 seconds**, operating safely within token allowances.

### 9.2 Two-Tier Inbound Rate-Limiting Architecture
Phase 17 establishes a strict **Two-Tier Rate-Limiting Architecture**:

```
Incoming WebSocket Message Frame
              │
              ▼
   [Is Socket Authenticated?]
        │               │
      No│               │Yes
        ▼               ▼
 [Pre-Auth IP Drop]   [Examine Command Type]
                        │               │
       Non-Media Command│               │`media:*` Command
                        ▼               ▼
              [Tier-4 Generic Bucket] [Dedicated Media Token Bucket]
              - Scope: per-socket     - Scope: per-socket
              - Rate: 60 msgs/min     - Baseline: 240 msgs/min (4 tokens/sec)
              - Window: 60s sliding   - Burst Capacity: 60 tokens
              - Action: Close 1008    - Action: Rate limit error response
```

1. **Bucket Identity & Scope**:
   - Every authenticated WebSocket connection maintains two independent in-memory rate-limiting structures attached to its session context:
     - `context._inboundMsgCount` (Tier-4 Generic Control Limiter).
     - `context._mediaTokenBucket` (Tier-4 Media Signaling Limiter).
2. **Media Signaling Token Bucket (`_mediaTokenBucket`)**:
   - **Baseline Rate**: 240 messages/minute (continuous refill of 4.0 tokens per second).
   - **Burst Capacity**: 60 tokens (accommodates initial transport setup, track production, and dynamic layer promotions).
   - **Refill Algorithm**: Standard lazy-token replenishment based on high-resolution timestamp delta (`Date.now()`).
3. **Message Separation & Routing**:
   - Messages prefixed with `media:` consume tokens **exclusively** from `_mediaTokenBucket` and do **not** increment `_inboundMsgCount`.
   - General application messages (`subscribe`, `unsubscribe`, `presence:pulse`, `heartbeat`) consume tokens **exclusively** from `_inboundMsgCount` and do **not** affect `_mediaTokenBucket`.
   - Protocol-level WebSocket ping/pong frames (RFC 6455 opcodes `0x9` and `0xA`) are handled at the transport layer and consume zero tokens from either bucket.
4. **Abuse Behavior & Escalation**:
   - If `_mediaTokenBucket` is exhausted ($< 1$ token available):
     - The server rejects the individual command immediately with `{ type: 'error', code: 'MEDIA_RATE_LIMIT_EXCEEDED', message: 'Media signaling rate limit exceeded. Please throttle requests.' }`.
     - The underlying WebSocket connection is **preserved** to prevent interrupting active answer autosaves or exam timers.
     - **Severe Malicious Flooding Escalation**: If a socket emits $>120$ excess media messages while exhausted within a 10-second window, the connection is deemed hostile and terminated immediately with close code `1008 (Policy Violation)`.
5. **Lifecycle & Cleanup**:
   - The token bucket exists strictly in server memory attached to the `ws` context object.
   - When the socket closes or terminates, the bucket is garbage collected immediately with zero lingering state.
   - Redis is **not** used for per-socket media message rate limiting, eliminating Redis network roundtrips on microsecond signaling loops.
   - On reconnect, a new authenticated socket receives an initialized token bucket.

### 9.3 Batched Multi-Consumer Creation with Partial-Success Semantics
To minimize signaling frame volume and optimize 12-candidate grid loading, Phase 17 implements `media:consume_batch`:

- **Command**: `media:consume_batch`
- **Request Schema**:
  ```json
  {
    "type": "media:consume_batch",
    "payload": {
      "transportId": "UUID",
      "rtpCapabilities": { ... },
      "producerIds": ["UUID1", "UUID2", "..."]
    }
  }
  ```
  *(Finding 1 optimization: `rtpCapabilities` is supplied **once at the root**, eliminating redundant 3–5 KB capability copies per producer).*
- **Validation & Deduplication Constraints**:
  - `producerIds`: `z.array(z.string().uuid()).min(1, 'At least one producerId required').max(36, 'Maximum 36 producerIds per batch')`.
  - Zero-item batch: Rejected immediately by schema validation with error code `INVALID_COMMAND`.
  - Duplicate IDs: Sanitized in `mediaSignaling.js` via `const uniqueProducerIds = [...new Set(payload.producerIds)];` before evaluation, preserving deterministic ordering and preventing redundant mediasoup consumers.
  - Maximum inbound request frame size: Bounded to `WS_MEDIA_MAX_PAYLOAD_BYTES` (64 KB).
- **Independent Per-Item Authorization & Partial-Success Semantics**:
  - The request constitutes **one signaling operation**, evaluated in a single event-loop turn.
  - Authorization is evaluated **independently per producer** against PostgreSQL session assignments.
  - **No All-or-Nothing Rollback**: Valid producers succeed and produce live `Consumer` instances. Invalid, missing, or unauthorized producers return explicit error objects in the result array. One failing item does **not** cancel or roll back valid sibling subscriptions.
- **Server Response Schema**:
  ```json
  {
    "type": "media:consumed_batch",
    "payload": {
      "transportId": "UUID",
      "results": [
        { "producerId": "UUID1", "consumerId": "UUID_C1", "kind": "video", "rtpParameters": { ... } },
        { "producerId": "UUID2", "error": "FORBIDDEN", "message": "Invigilator not assigned to candidate session" },
        { "producerId": "UUID3", "error": "PRODUCER_NOT_FOUND", "message": "Producer closed or does not exist" }
      ]
    }
  }
  ```

### 9.4 WebSocket Payload Sizing & Frame Limit Decoupling
Phase 17 explicitly separates payload guards between generic control traffic and authenticated media signaling:

| Traffic Class | Inbound Max Payload | Outbound Max Payload | Enforcement Point | Violation Action |
| :--- | :--- | :--- | :--- | :--- |
| **Generic Control** (`chat`, `subscribe`, `pulse`) | **16 KB** (16,384 B) | **16 KB** (16,384 B) | Pre-auth & general router | Close `1009 (Message Too Big)` |
| **Media Signaling** (`media:*`) | **64 KB** (65,536 B) | **64 KB** (65,536 B) | Authenticated media router | Inbound: Close `1009`<br>Outbound: Error response |

- **Security Rule**: Pre-upgrade requests and unauthenticated sockets remain strictly bound to the 16 KB payload guard (`WS_INBOUND_PAYLOAD_LIMIT_BYTES`). The 64 KB limit (`WS_MEDIA_MAX_PAYLOAD_BYTES`) is accessible **only after** successful JWT subprotocol authentication and applies **strictly** to messages in the `media:*` namespace.
- **Worst-Case Serialized Payload Math**:
  - Root `rtpCapabilities`: ~4 KB.
  - 36 Consumer results in `media:consumed_batch`: $36 \times \approx 1.1\text{ KB} \approx 39.6\text{ KB}$.
  - Envelope JSON overhead: ~0.5 KB.
  - **Total Worst-Case Outbound Frame**: $\approx \mathbf{44.1\text{ KB}}$, safely within the 64 KB limit ($68.9\%$ utilization).

---

## 10. Media Session Lifecycle & State Machine Ownership

The media session follows a deterministic, observable state machine with explicit component ownership:

```
[IDLE] 
  │  (candidate enters exam / invigilator opens monitor)
  ▼
[PERMISSIONS_REQUESTED]  <-- Purely Client-Side React UI State
  │  (browser hardware prompt approved)
  ▼
[SIGNALING]              <-- Client mediasoup-client + Ephemeral Server Socket Context
  │  (capabilities exchanged, transports created under current worker generation)
  ▼
[CONNECTING]             <-- Client WebRTC / DTLS + Ephemeral Server Context
  │  (ICE gathering, DTLS handshake completed)
  ▼
[ACTIVE] ◄────────────────────────┐  <-- Active Streaming + Server Ephemeral State
  │                               │ (ICE restart / network recovered)
  ├──► [DEGRADED] ────────────────┘  <-- Client Health Telemetry + Ephemeral Server Context
  │      (packet loss > 15%, RTT > 400ms, or track muted)
  │
  │  (exam submitted, window closed, or authorization revoked)
  ▼
[CLOSING]                <-- Transient Teardown State
  │  (transports closed, consumers/producers closed)
  ▼
[TERMINATED]             <-- Clean Teardown Complete
```

### State Ownership & Authority Invariant:
1. **`PERMISSIONS_REQUESTED`**: Exists purely in React component state (`PreExamReadinessPage` and `useMediaCapture`).
2. **`SIGNALING` / `CONNECTING`**: Managed by `mediasoup-client` in the browser, mirrored ephemerally in server connection memory (`context.mediaStatus`).
3. **`ACTIVE` / `DEGRADED`**: Reflects client WebRTC health stats (`RTCPeerConnection.getStats()`), mirrored ephemerally in server context to update invigilator tile badges.
4. **`CLOSING` / `TERMINATED`**: Transient teardown states during socket disconnect or exam submission.
5. **Database Authority Invariant**: Media lifecycle states are **100% ephemeral in memory** and **never written to PostgreSQL**. The authoritative business state `exam_attempts.status` (`ACTIVE`, `SUBMITTED`, `TIMED_OUT`) is governed strictly by the exam engine and is **never mutated** by media lifecycle transitions.

---

## 11. Room / Participant Model

### Naming Conventions:
- **SFU Router / Room**: Bound 1:1 to an authoritative `sessionId` from `exam_sessions`:
  `media:session:<sessionId>`
- **Participant Identity**:
  - Candidate: `candidate:<studentId>:<attemptId>`
  - Invigilator: `invigilator:<userId>`
  - Faculty / Admin: `observer:<userId>`

### Room Scoping Invariant:
An SFU Router is dynamically allocated when the first participant joins an exam session and is pruned when the session terminates. Candidates from Session A and Session B reside in completely separate mediasoup Routers, making cross-session media leaking physically impossible at the transport level.

---

## 12. Authentication Model

Signaling commands are authenticated using the existing Phase 16 handshake authentication:
1. Browser handshakes via `Sec-WebSocket-Protocol: proctornet, <jwt>`.
2. Sockets store verified `connectionId`, `userId`, `roles`, and `authSessionId`.
3. Sockets failing authentication cannot connect to the WebSocket server and therefore cannot emit media signaling commands.

---

## 13. Media Authorization / RBAC / BOLA

Every signaling request is validated against authoritative PostgreSQL relationships before execution:

### Strict Rule Matrix:
1. **Candidate Publishing**:
   - Must hold the `STUDENT` role.
   - Must own the `attemptId` (`exam_attempts.student_id = user.userId`).
   - The attempt must be in `ACTIVE` status.
   - The attempt must belong to the requested `sessionId`.
   - Candidates are **forbidden** from creating receiving transports (`direction: 'recv'`) or consuming streams.
2. **Invigilator Subscription**:
   - Must hold the `INVIGILATOR` role.
   - Must be assigned to the session (`session_invigilators.session_id = sessionId AND user_id = user.userId`).
   - Invigilators are **forbidden** from creating sending transports (`direction: 'send'`) or producing media.
3. **Faculty Subscription**:
   - Must hold the `FACULTY` role.
   - Must be the creator of the exam associated with this session (`exams.created_by = user.userId`).
4. **Admin Subscription**:
   - Must hold the `ADMIN` role. Global read-only subscription permitted.

Any attempt to produce or consume outside these bounds triggers an immediate `403 Forbidden` signaling error, terminates the unauthorized transport, logs a warning, and emits an auditable security event.

---

## 14. Token Architecture: Co-Located Authority vs Future Distributed SFU

### 14.1 Phase 17 Co-Located Deployment Model
In the Phase 17 co-located architecture:
- Mediasoup worker processes run co-located on the same server host as the Node.js backend application.
- All media signaling occurs over the authenticated Phase 16 WebSocket connection (`Sec-WebSocket-Protocol: proctornet, <jwt>`).
- Every media signaling command (`createTransport`, `produce`, `consume`, `consume_batch`) invokes `mediaSignaling.js`, which directly verifies caller authorization against PostgreSQL and active session context.
- **Architectural Decision**: A separate Media Grant Token (MGT) HTTP request/response cycle is **NOT required** for the co-located architecture. Introducing a separate token creates duplicate validation code, synchronization race conditions, and unnecessary REST round-trips without providing security benefit over the authenticated WebSocket context.

### 14.2 Future-Optional Distributed SFU Specification
If ProctorNet later scales to an external distributed cluster of standalone SFU instances (e.g. dedicated Go/C++ media nodes without Node.js co-location), an ephemeral Media Grant Token (MGT) will be introduced:
- **Issuer**: ProctorNet Backend API (`POST /api/v1/sessions/:sessionId/media-token`).
- **Algorithm**: HMAC-SHA256 (`HS256`) signed with `MEDIA_SIGNING_SECRET`.
- **Secret Hygiene**: `MEDIA_SIGNING_SECRET` has **no hardcoded default** in the codebase. It is configured via environment variable with a minimum length of 32 characters (`z.string().min(32).optional()`). It is unused in Phase 17 co-located mode.
- **TTL**: 10 minutes (600 seconds), refreshed proactively via background interval.
- **Claims**: `{ sub, role, sessionId, attemptId, canPublish, canSubscribe, allowedTracks, exp }`.
- **Validation**: Independent SFU edge nodes validate the signature using the shared secret without querying the central PostgreSQL database.

---

## 15. Browser Media Capture & Hardware Lock Prevention

### 15.1 Hardware Lock Problem Statement
Browsers and operating systems (particularly Windows Camera subsystem and DirectShow drivers) enforce exclusive locks on video capture devices. If `PreExamReadinessPage` acquires a camera or microphone stream and navigates to `ExamTakingPage` without explicitly invoking `track.stop()`, the camera remains locked, causing `ExamTakingPage` to fail with `NotReadableError` or produce black video frames.

### 15.2 Mandatory Track Cleanup Protocol
To guarantee that media hardware is completely released before entering an exam, `PreExamReadinessPage` enforces the following cleanup lifecycle:

```javascript
/**
 * Stops all active tracks on a MediaStream and releases underlying OS hardware handles.
 * @param {MediaStream | null} stream
 */
export function stopMediaStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      track.stop();
      track.enabled = false;
    });
  } catch (err) {
    console.warn('Error releasing media track:', err);
  }
}
```

### 15.3 Cleanup Matrix across All Lifecycle Paths:
1. **Successful Verification Completion**: When the candidate clicks "Proceed to Exam", all preview streams (webcam, microphone, screen) are immediately stopped via `stopMediaStream()`, and video element `srcObject` is cleared (`null`) before route navigation commences.
2. **Navigation Away / Route Change**: In `PreExamReadinessPage.jsx`, the primary `useEffect` hook returns an explicit cleanup function that invokes `stopMediaStream()` on all active preview streams.
3. **Component Unmount**: Handled automatically by the `useEffect` cleanup hook.
4. **Hardware Check Retries / Device Switching**: Before requesting a new stream with `getUserMedia`, any previously acquired stream is fully stopped.
5. **Browser Permission Denial**: If a candidate denies permission or encounters `NotAllowedError`, any partially acquired audio or video tracks are immediately stopped.
6. **Window Close / Refresh**: Binds a `beforeunload` event listener that halts all active tracks.

### 15.4 Fresh Production Stream Acquisition
`ExamTakingPage` **never** reuses or inherits `MediaStream` references from `PreExamReadinessPage`. Upon mounting, `ExamTakingPage` requests fresh production media streams with production constraints, ensuring completely independent hardware lifecycles.

---

## 16. Bitrate Profiles & Uplink Bandwidth Budget

### 16.1 Network Protocol Overhead & Wire Realities
Configured codec targets represent raw payload bitrates. Every WebRTC packet sent over UDP incurs protocol encapsulation overhead:
- **RTP Header**: 12 bytes
- **SRTP Authentication Tag**: 4–10 bytes
- **UDP Header**: 8 bytes
- **IP Header (IPv4/IPv6)**: 20–40 bytes
- **DTLS / SRTP Encryption Framing**: Variable
- **Total Protocol Overhead**: Typically **8% to 12%** above raw codec bitrates.
- **Physical Wire Throughput Statement**: Configured encoder and transport bandwidth is budgeted within a $\le 1.0\text{ Mbps}$ nominal network envelope; measured instantaneous physical throughput on the wire may temporarily exceed nominal targets due to protocol overhead, packet retransmissions (RTX), keyframe generation (PLI/FIR), and congestion control ramp-up.

### 16.2 Explicit Bitrate Profiles

#### PROFILE A: Standard Remote Proctoring (Webcam Simulcast + Audio, No Screen)
Intended for standard exams where screen recording is not mandated by the institution:
- **Webcam High Layer (r0)**: 640x480 @ 20 fps — Target Codec: **350 kbps** (Max: 450 kbps)
- **Webcam Low Layer (r1)**: 320x240 @ 10 fps — Target Codec: **100 kbps** (Max: 150 kbps)
- **Microphone Track (Opus)**: 48 kHz mono speech — Target Codec: **40 kbps** (Max: 48 kbps)
- **Total Codec Bitrate**: $350 + 100 + 40 = \mathbf{490\text{ kbps}}$
- **Expected Protocol Overhead (~9%)**: ~45 kbps
- **Target Physical Network Bitrate**: $\mathbf{\approx 535\text{ kbps}}$ nominal
- **Peak Burst Network Bitrate (Keyframe/Motion)**: $\mathbf{\approx 680\text{ kbps}}$
- **Budget Envelope**: **Configured bandwidth ceiling strictly budgeted within a $\le 1.0\text{ Mbps}$ nominal network envelope.**

#### PROFILE B: Comprehensive Remote Proctoring (Webcam Simulcast + Audio + Screen Share)
Intended for high-stakes examinations requiring full desktop screen surveillance:
- **Webcam High Layer (r0)**: 640x480 @ 15 fps — Target Codec: **300 kbps** (Max: 400 kbps)
- **Webcam Low Layer (r1)**: 320x240 @ 10 fps — Target Codec: **80 kbps** (Max: 120 kbps)
- **Microphone Track (Opus)**: 48 kHz mono speech — Target Codec: **40 kbps** (Max: 48 kbps)
- **Screen Share Track (VP8)**: 1280x720 @ 5–10 fps (`detail`) — Target Codec: **500 kbps** (Max: 700 kbps)
- **Total Codec Bitrate**: $300 + 80 + 40 + 500 = \mathbf{920\text{ kbps}}$
- **Expected Protocol Overhead (~9%)**: ~85 kbps
- **Target Physical Network Bitrate**: $\mathbf{\approx 1.0\text{ Mbps}}$ (1005 kbps) nominal
- **Peak Burst Network Bitrate (Motion / Screen Transitions)**: $\mathbf{\approx 1.35\text{ Mbps}}$
- **Budget Envelope**: **Nominal 1.0 Mbps network envelope; bounded peak envelope $\le 1.4\text{ Mbps}$.**

### 16.3 Dynamic Congestion Adaptation Ladder
When a candidate experiences network degradation, high packet loss ($>5\%$), or round-trip time spikes ($>300\text{ ms}$), the client capture and mediasoup layer controllers adapt along a strict priority ladder:

```
[Available Uplink Drops]
           │
           ▼
[Step 1: Preserve Audio at All Costs]
  - Opus audio (40 kbps) is NEVER paused or degraded.
  - DTX (Discontinuous Transmission) suppresses silent intervals.
           │
           ▼
[Step 2: Preserve Low Webcam Layer]
  - Low spatial layer (320x240 @ 80-100 kbps) remains active.
  - Guarantees invigilator visual confirmation of candidate presence.
           │
           ▼
[Step 3: Drop Webcam High Layer]
  - Automatically drop/pause the high simulcast layer (saves 300–350 kbps).
  - Invigilator grid view remains completely unaffected.
           │
           ▼
[Step 4: Throttle Screen Share Framerate / Bitrate]
  - Throttle screen share framerate from 10 fps down to 5 fps, then 2 fps.
  - Throttles screen bitrate from 500 kbps down to 200 kbps.
  - `contentHint: 'detail'` maintains text legibility even at 2 fps.
           │
           ▼
[Step 5: Pause Screen Share Track]
  - If available uplink drops below 250 kbps, pause the screen share track.
  - Emits UI warning: `UPLINK_CONGESTED_SCREEN_PAUSED`.
  - Candidate audio and low-res webcam feed remain streaming continuously.
```

---

## 17. STUN / TURN / ICE & Network IP Topology

### 17.1 Network Traversal Topology:
- **Direct UDP (Host/Srflx)**: Works for ~80% of residential candidate connections using STUN.
- **Relay UDP/TCP (TURN)**: Mandatory for ~15–20% of candidates on symmetric corporate NATs, university eduroam networks, and cellular hotspots where outbound UDP is blocked.

### 17.2 Development vs Production Configuration Policy:
- **Local Development / Test Environments (`NODE_ENV !== 'production'`)**:
  - `STUN_SERVER_URL`: Defaults to Google's public STUN server (`stun:stun.l.google.com:19302`).
  - `TURN_SERVER_URL` and `TURN_STATIC_AUTH_SECRET`: Optional. Local loopback / LAN testing functions without TURN relay.
  - `MEDIA_LISTEN_IP`: Defaults to `127.0.0.1`.
- **Production Environment (`NODE_ENV === 'production'`)**:
  - When `MEDIA_ENABLED === true`, `TURN_SERVER_URL` and `TURN_STATIC_AUTH_SECRET` are **MANDATORY**.
  - Zod schema validation in `backend/src/config/env.js` fails fast during server boot if production media is enabled without Coturn relay credentials.
  - **TURN Allocation Failure Behavior**: If the candidate browser cannot reach the TURN relay during ICE gathering, the client transitions to `CONNECTING_FAILED` and emits an explicit error: `{ code: 'RELAY_UNAVAILABLE', message: 'Proctoring relay server unreachable; please contact exam support or switch networks' }`.

### 17.3 Production IP Binding vs Announced Address Architecture:
- In mediasoup, `WebRtcTransportOptions.listenIps` distinguishes between local socket binding and remote candidate routing:
  - **`MEDIA_LISTEN_IP`**: Controls the local network interface to which mediasoup binds its UDP/TCP sockets (`bind(2)`). In production, this must be set to `'0.0.0.0'` (listen on all host interfaces) or the specific private VPC IP address (e.g. `10.0.x.x`).
  - **`MEDIA_ANNOUNCED_IP`**: The public, externally routable IPv4 address (e.g. AWS Elastic IP) injected into the SDP/ICE candidates sent to candidate and invigilator browsers.
  - **NAT & Firewall Invariant**: Remote clients outside the VPC transmit UDP packets directly to `MEDIA_ANNOUNCED_IP` over the configured port range (40000–49999). Mediasoup never advertises internal RFC 1918 addresses to public clients.

### 17.4 Credential Architecture:
- Uses Coturn ephemeral credentials generated via the HMAC-SHA1 REST API standard (RFC 5766):
  - `username`: `<timestamp + ttl>:<userId>`
  - `password`: `Base64(HMAC-SHA1(turnSecret, username))`
  - `TTL`: 900 seconds (15 minutes).
- **Endpoint**: `GET /api/v1/sessions/:sessionId/ice-servers` returns short-lived ICE server configurations to authenticated clients.
- **Security Rule**: TURN shared secrets are stored strictly in environment variables (`TURN_STATIC_AUTH_SECRET`) and are **never** committed or exposed to frontend code.

---

## 18. SDP / ICE Signaling Validation & Payload Guards

All signaling parameters passing between the client and mediasoup are strictly validated:
1. **Zod Validation**: `dtlsParameters`, `iceParameters`, `iceCandidates`, and `rtpParameters` are validated against strict structural schemas in `media.schemas.js`.
2. **Payload Size Guard**:
   - Generic WebSocket frames exceeding 16 KB are rejected with close code `1009`.
   - Authenticated `media:*` signaling frames exceeding `WS_MEDIA_MAX_PAYLOAD_BYTES` (64 KB) are rejected with close code `1009`.
3. **DTLS Fingerprint Verification**: mediasoup cryptographically validates DTLS fingerprints during the handshake.
4. **ICE Candidate Trickling**: Candidates are trickled via `media:connect_transport` and sanitized to prevent SSRF against internal cluster IP ranges.

---

## 19. Codec Strategy

- **Video**: VP8 (`video/VP8`) is the primary codec due to universal support across Chrome, Firefox, Safari, and Edge, zero licensing encumbrances, and deterministic simulcast handling in mediasoup. H.264 (`video/H264`) Constrained Baseline is configured as fallback.
- **Audio**: Opus (`audio/opus`, 48,000 Hz, 2 channels) is standard WebRTC audio, configured with mono recording and voice-optimized DTX.

---

## 20. Simulcast / Adaptive Quality

To support invigilator grid monitoring without saturating invigilator downlink bandwidth, candidate webcam video is published with **2 simulcast spatial layers**:

```
[Candidate Webcam]
       │
       ├── High Layer (r0): 640x480 @ 15-20 fps (300-350 kbps)  --> Consumed in Focused View (spatialLayer: 1)
       └── Low Layer  (r1): 320x240 @ 10 fps    (80-100 kbps)   --> Consumed in Grid View (spatialLayer: 0, Default)
```

- When an invigilator views a grid of 12 candidates:
  - SFU automatically routes the **Low Layer** (`spatialLayer: 0`, 100 kbps $\times$ 12 = 1.2 Mbps downlink).
- When an invigilator clicks on a candidate to inspect them:
  - Invigilator client sends `media:consumer_set_layers { consumerId, spatialLayer: 1 }`.
  - SFU immediately promotes the stream to the **High Layer** (350 kbps).

---

## 21. Bitrate / Resolution / FPS Targets

| Profile | Track | Layer | Resolution | Framerate | Codec Target | Net Bitrate (Est) | Max Bitrate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Profile A** | Webcam | High | 640x480 | 20 fps | 350 kbps | ~385 kbps | 450 kbps |
| **Profile A** | Webcam | Low | 320x240 | 10 fps | 100 kbps | ~110 kbps | 150 kbps |
| **Profile A** | Audio | Single | N/A | Speech | 40 kbps | ~45 kbps | 48 kbps |
| **Profile B** | Webcam | High | 640x480 | 15 fps | 300 kbps | ~330 kbps | 400 kbps |
| **Profile B** | Webcam | Low | 320x240 | 10 fps | 80 kbps | ~90 kbps | 120 kbps |
| **Profile B** | Audio | Single | N/A | Speech | 40 kbps | ~45 kbps | 48 kbps |
| **Profile B** | Screen | Single | 1280x720 | 5–10 fps | 500 kbps | ~545 kbps | 700 kbps |

---

## 22. Candidate Publishing

1. Candidate connects to `/ws` and authenticates.
2. Candidate fetches router RTP capabilities via `media:get_router_capabilities`.
3. Client initializes `mediasoupClient.Device`.
4. Client sends `media:create_transport { direction: 'send' }`.
5. Server creates `WebRtcTransport`, returns transport parameters.
6. Client invokes `device.createSendTransport(params)`.
7. Client calls `sendTransport.produce({ track, simulcastEncodings })`.
8. Mediasoup worker binds the producer; server stores producer in memory and broadcasts `media:producer_added` to assigned invigilators via Redis Pub/Sub.

---

## 23. Invigilator Subscription & Audio Policy

### 23.1 Default Audio Policy for 12-Candidate Grid
In a standard monitoring session, an invigilator oversees up to 12 candidates simultaneously on a grid dashboard.
- **Audio Muted by Default**: While audio consumers are negotiated to allow instantaneous audio inspection, all 12 candidate audio streams are **strictly MUTED by default** (`<audio muted />` or paused consumers). Playing 12 simultaneous audio streams results in acoustic feedback, unintelligible cacophony, and browser audio rendering distortion.
- **Solo / Focused Audio Inspection**:
  - Only **one** candidate stream may be unmuted and audible at any given time.
  - When an invigilator clicks a candidate tile to open the focused inspector view or clicks an explicit **"Listen In"** toggle, that specific candidate's audio track is unmuted.
  - If the invigilator switches focus to a different candidate, the previous candidate's audio is immediately muted, and the new candidate's audio is unmuted.
  - Closing the focused view immediately returns all candidate audio to the default muted state.

### 23.2 Visual Audio Activity (VU Meters & RFC 6464)
To allow invigilators to perceive candidate vocal activity without listening to audible sound:
- **RFC 6464 Audio Level Telemetry**: Mediasoup utilizes the WebRTC `urn:ietf:params:rtp-hdrext:ssrc-audio-level` RTP header extension.
- **Server-Side AudioLevelObserver**: Mediasoup's `AudioLevelObserver` periodically samples candidate audio levels. When audio energy exceeds a threshold (e.g. speaking voice $> -40\text{ dBov}$), an ephemeral `media:audio_level` notification is emitted over the session WebSocket channel.
- **UI VU Meter Display**: Each candidate tile renders an animated multi-segment green/yellow/red VU meter bar that pulses in response to sound energy.
- **Privacy & Storage Invariant**: Visual VU meter telemetry is strictly a transient perceptual indicator; raw audio signals and decibel readings are **never** persisted to PostgreSQL.

---

## 24. Device Switching

- If a candidate selects a new microphone or webcam in settings:
  1. Frontend obtains the new track via `getUserMedia`.
  2. Invokes `producer.replaceTrack({ track })` on the existing `mediasoup-client` producer.
  3. WebRTC renegotiates seamlessly without closing the transport or disrupting the invigilator's feed.

---

## 25. Reconnect / ICE Restart

1. **Transient Network Hiccup**:
   - WebRTC automatically attempts internal ICE reconnection.
2. **Prolonged Disconnect (ICE Connection State `failed`)**:
   - Client sends `media:restart_ice { transportId }`.
   - Server invokes `transport.restartIce()`, returning new `iceParameters`.
   - Client invokes `transport.restartIce({ iceParameters })`, recovering the media stream without recreating the session.
3. **Full Socket Disconnect**:
   - Phase 16 WebSocket reconnects with fresh JWT.
   - Client re-joins media room and restores media transports.

---

## 26. SFU Worker Crash Recovery & Per-Worker Generation Fencing

### 26.1 Crash Dynamics & Ephemeral State Destruction
When a mediasoup C++ worker process crashes or terminates unexpectedly:
- All C++ memory managed by that worker is instantly destroyed.
- All associated `Router`, `WebRtcTransport`, `Producer`, and `Consumer` instances become invalid.
- All client-side `RTCPeerConnection` transports transition to state `failed`.
- An ICE restart **cannot** recover from a worker crash because the underlying transport and router IDs no longer exist on the server. Recovery requires an authoritative, fenced session reset.

### 26.2 Per-Worker Generation / Epoch Fencing Architecture
To isolate the failure blast radius and prevent race conditions without impacting healthy workers:
1. **Per-Worker Context in `sfuManager`**:
   `sfuManager` maintains an array of worker contexts:
   ```javascript
   workerContexts = [
     {
       workerId: 0,
       worker: mediasoupWorkerInstance,
       generation: 1, // Monotonically increasing per-worker epoch
       status: 'ACTIVE', // 'ACTIVE' | 'RESETTING' | 'DEAD' | 'STARTING'
       assignedSessions: Set<string> // Set of sessionIds pinned to this worker
     },
     // ... up to MEDIASOUP_NUM_WORKERS
   ];
   ```
2. **Tagging Transports & Routers**:
   Every in-memory `Router`, `WebRtcTransport`, `Producer`, and `Consumer` records:
   - `workerId: number` (the owning worker index)
   - `workerGeneration: number` (the generation under which it was instantiated)
   - `sessionId: string`
3. **State Transition on Worker Death (`worker.on('died')`)**:
   When Worker $i$ crashes:
   - **ONLY Worker $i$ enters `RESETTING`**.
   - **ONLY Worker $i$'s generation increments**: `generation_i = generation_i + 1`.
   - **ONLY sessions in `workerContexts[i].assignedSessions` transition to `RESETTING`**.
   - **Healthy Worker Isolation**: Workers $j \ne i$ and all sessions pinned to them remain in `ACTIVE` state at their current generation $N_j$, continuing live media streaming and signaling with **zero interruption**.
4. **Fencing Stale Operations**:
   - Any incoming signaling command (`connect_transport`, `produce`, `consume`, `consume_batch`, `restart_ice`, `close_producer`) targeting a session pinned to Worker $i$ that:
     - references a transport created under generation $N_i < \text{currentGeneration}_i$, OR
     - arrives while Worker $i$ or the session is `RESETTING`,
     is immediately rejected with:
     ```json
     {
       "type": "error",
       "code": "MEDIA_SESSION_RESETTING",
       "workerId": i,
       "epoch": generation_i,
       "message": "Media worker reset in progress; please await session reset announcement"
     }
     ```
   - Commands for unaffected sessions on healthy workers continue to be authorized and processed normally.
   - Stale Redis producer notifications carrying `workerId === i` and generation $< generation_i$ are discarded immediately.
5. **Rebuilding Affected Sessions**:
   - Spawns a fresh `mediasoup.createWorker()` process to replace Worker $i$ at index $i$.
   - Recreates Routers **only** for sessions in `assignedSessions` under the new `generation_i`.
   - Broadcasts `media:session_reset` with `{ sessionId, workerId: i, epoch: generation_i }` to affected session sockets.
   - Once initialization is complete, Worker $i$ and its assigned sessions transition back to `ACTIVE`.

### 26.3 Comprehensive 11-Step Reset Sequence:
```
[mediasoup Worker (i) Dies]
          │
          ▼
[Step 1: Event Detection]
  - Node.js catches `workerContexts[i].worker.on('died', ...)`
          │
          ▼
[Step 2: Generation Increment & Session Fencing]
  - workerContexts[i].generation increments (N_i -> N_i+1); assignedSessions marked `RESETTING`
  - Workers j != i remain ACTIVE and completely untouched
          │
          ▼
[Step 3: Structured Failure Logging & Metrics]
  - Logs `SFU_WORKER_DIED` with { workerId: i, newEpoch: N_i+1 }; increments `wsMediaFailuresTotal`
          │
          ▼
[Step 4: Memory Reference Scrubbing]
  - Scrubs only generation N_i objects (routers, transports) from memory for worker i
          │
          ▼
[Step 5: Worker Respawn]
  - Spawns fresh `mediasoup.createWorker()` replacing worker i at index i
          │
          ▼
[Step 6: Router Recreation]
  - Recreates Routers only for assignedSessions of worker i under generation N_i+1
          │
          ▼
[Step 7: Clear Stale Redis Registry]
  - Evicts stale producer IDs for affected sessions from Redis hash `proctornet:media:session:<sessionId>`
          │
          ▼
[Step 8: Broadcast Session Reset]
  - Broadcasts `media:session_reset` over Phase 16 WebSocket to affected sessions:
    `{ type: 'media:session_reset', payload: { sessionId, workerId: i, epoch: N_i+1 } }`
          │
          ▼
[Step 9: Candidate Client Recovery]
  - Candidate destroys old device; fetches fresh capabilities; recreates send transport under epoch N_i+1
          │
          ▼
[Step 10: Invigilator Client Recovery]
  - Invigilator destroys old recv transport; executes `media:consume_batch` for new tracks
          │
          ▼
[Step 11: Re-Authorization Enforcement]
  - Server re-authorizes EVERY newly created transport, produce, and consume command
    against PostgreSQL. Zero bypass; stale IDs rejected with 403 Forbidden.
```

### 26.4 Failure Semantics & Circuit Breaker
- **Temporary Media Freeze**: Recovery incurs a brief, non-zero media disruption of approximately **1.5 to 3.0 seconds** while the worker respawns and transports re-negotiate.
- **Client Backoff**: Clients apply jittered exponential backoff (1s, 2s, 4s) before initiating re-publication.
- **Circuit Breaker**: If a single worker crashes $>3$ times within a 60-second window:
  - That specific worker pool slot enters a degraded circuit-breaker state.
  - Server emits `MEDIA_SFU_UNAVAILABLE` to affected clients.
  - Candidates and invigilators receive a non-blocking UI alert informing them that live video is temporarily suspended.
  - **Exam State Isolation**: The examination timer, question navigation, answer autosaves, and submission APIs **remain 100% operational** throughout any media failure.

---

## 27. Recording / Evidence Policy

### Explicit Decision: Server-Side Continuous Media Recording is OUT OF SCOPE
- **ProctorNet does NOT perform continuous 3-hour video recording on the SFU server.**
- Rationale: Storing hundreds of continuous high-resolution video streams creates massive storage costs, high disk I/O contention, and privacy liability.
- **Evidence Model**: ProctorNet uses **selective, event-triggered evidence capture** (Phase 15):
  - When Phase 14 anomaly scoring detects a violation (e.g. `MULTIPLE_FACES`, `SUSPICIOUS_AUDIO`), the candidate client captures a discrete snapshot image or 5-second audio snippet.
  - The snippet is uploaded directly to Amazon S3 via Phase 15 presigned URLs.
  - Live video remains strictly an in-memory ephemeral transit for live invigilator observation.

---

## 28. Media Privacy

1. **Cross-Session Isolation**: Mediasoup routers are strictly scoped to `sessionId`. Candidates in Session 1 cannot be observed by Session 2 invigilators.
2. **Candidate Anonymity**: Video feeds display candidate display names/seat numbers; sensitive student database records are not embedded in media packets.
3. **No Inter-Candidate Media**: Candidates never receive or consume fellow candidates' media streams.
4. **Hardware Indicator**: Frontend displays a persistent red recording/streaming indicator in the candidate interface whenever camera, microphone, or screen tracks are active.

---

## 29. PostgreSQL Interaction

- **Migration Required? NO.**
  - Transient media connections, producer IDs, consumer IDs, and ICE states are **never** stored in PostgreSQL.
  - Persisting per-second WebRTC events in PostgreSQL would overwhelm database connection pools and degrade answer autosaves.
- **Authoritative Reads Only**:
  - PostgreSQL is queried strictly to authorize participants:
    - Candidate enrollment: `exam_attempts`
    - Invigilator assignment: `session_invigilators`
    - Exam ownership: `exams`
- **Audit Logging**: Major security events (`MEDIA_SESSION_JOINED`, `MEDIA_UNAUTHORIZED_ATTEMPT`) are written to `audit_logs` using the Phase 13 `recordAuditEvent` helper.

---

## 30. Redis Interaction, Degradation & Reconciliation

Redis is used strictly as an ephemeral, non-authoritative distributed coordinator:
1. **Producer Registry Metadata**:
   `HSET proctornet:media:session:<sessionId> <producerId> <json_metadata>`
   Stores active producer metadata formatted as:
   ```json
   {
     "producerId": "UUID",
     "trackType": "webcam" | "microphone" | "screen",
     "kind": "video" | "audio",
     "workerId": 0,
     "workerGeneration": 1,
     "createdAt": "2026-09-08T11:00:00.000Z"
   }
   ```
   Set with a 6-hour TTL matching exam session lifetime.
2. **Cross-Node Event Notification**:
   Publishes `media:producer_added` and `media:producer_removed` on channel `proctornet:media:events` so all backend API instances notify their connected invigilators.
3. **Authoritative In-Memory Fallback**:
   - For co-located single-instance deployments, the in-process `sfuManager` Router registry is **authoritative**.
   - If Redis is unreachable, local media routing, producer creation, and local invigilator subscriptions continue **completely uninterrupted**. Only cross-node multi-instance broadcast is degraded.
4. **Reconciliation & Purge on Reconnect**:
   - When Redis connectivity is restored after an outage, `sfuManager` executes an active reconciliation sweep:
     - Iterates active local Router producers and repopulates missing keys in Redis.
     - Performs a diff against Redis entries; any producer ID present in Redis that no longer exists in mediasoup memory (or carries an expired `workerGeneration`) is immediately purged.
5. **Authorization Invariant**:
   - A Redis producer record **NEVER** confers authorization to consume.
   - When an invigilator issues `media:consume` or `media:consume_batch`, the server validates the producer against the live mediasoup Router and checks PostgreSQL session assignment. If the producer is stale or absent, the request is rejected with `PRODUCER_NOT_FOUND` and the stale Redis key is evicted.
6. **Abrupt Process Termination Handling**:
   - If a backend node terminates abruptly without executing graceful shutdown hooks, its orphaned producer keys in Redis naturally expire via their 6-hour TTL, and are immediately evicted upon the first consumer query that detects their absence from the live SFU router.

---

## 31. RabbitMQ Interaction

- RabbitMQ does **not** participate in the live media transport or signaling path.
- Rationale: Media streaming requires sub-second real-time delivery; message brokers introduce queuing latency.
- If a media drop triggers a proctoring flag (e.g. `SCREEN_SHARE_STOPPED`), the violation event is written to `violation_events` and queued to the transactional `outbox` table, which RabbitMQ subsequently processes asynchronously.

---

## 32. S3 Interaction

- Live media streaming **never** routes to or from S3.
- S3 is reserved exclusively for Phase 15 discrete evidence artifacts (presigned URLs).

---

## 33. Worker Pool Sizing, Session Pinning & Capacity Model

### 33.1 Bounded Worker Pool Configuration
Rather than blindly relying on `os.cpus().length` (which reports host machine cores in containerized Docker/ECS environments rather than container CPU limits), the worker count is bounded and configurable:
- **Configuration Parameter**: `MEDIASOUP_NUM_WORKERS: z.string().regex(/^\d+$/).transform(Number).optional()` in `backend/src/config/env.js`.
- **Safe Bounded Default**:
  ```javascript
  const detectedCores = os.availableParallelism?.() || os.cpus().length || 1;
  const defaultWorkers = Math.min(Math.max(detectedCores, 1), 4);
  ```
  Caps the default worker pool at **4 workers** for local and standard container environments, unless explicitly configured otherwise via environment variable.

### 33.2 Deterministic Session-to-Worker Pinning
In mediasoup, a `Router` belongs to exactly one `Worker`. All candidate producers and invigilator consumers for an examination session must reside on the same Router to avoid inter-worker `PipeTransport` complexity:
- **Pinning Formula**:
  ```javascript
  const workerIndex = Math.abs(crc32(sessionId)) % workers.length;
  const assignedWorker = workers[workerIndex];
  ```
- **Session Isolation & Reallocation**:
  - One session has exactly one owning worker.
  - When Worker $i$ crashes, its respawned replacement process is slotted back at index $i$. Thus, `crc32(sessionId) % workers.length` continues to deterministically route to worker index $i$, allowing seamless Router recreation under the new generation $N_i + 1$.
  - A participant never creates a transport on a worker different from their assigned session's worker.
- **Worker Overload Protection**: `sfuManager` tracks active Routers and Transports per worker. If an assigned worker reaches its hard capacity limit (e.g., 250 active WebRtcTransports), new session router allocations reject with `SERVER_BUSY` rather than degrading existing streams.

### 33.3 Mathematical Capacity & Network Model (Design Assumptions)
*(Explicit Label: DESIGN TARGET / PLANNING ASSUMPTION — REQUIRES EMPIRICAL LOAD VALIDATION)*

The target workload is **50 concurrent candidate publishers** monitored by **4 invigilator dashboards** (12 candidates each = 48 subscribed feeds):

#### A. Ingress Bandwidth (Candidates $\rightarrow$ SFU):
- **Profile A (Webcam Simulcast + Audio, No Screen)**:
  - 50 candidates $\times$ 490 kbps codec ($\approx 535\text{ kbps}$ net) = **26.8 Mbps physical ingress**.
- **Profile B Mixed (Webcam + Audio on 50 candidates, Screen Share on 25 candidates)**:
  - Base: 26.8 Mbps + (25 $\times$ 545 kbps net screen) = **40.4 Mbps physical ingress**.
- **Profile B Worst-Case (100% Screen Share on all 50 candidates)**:
  - 50 candidates $\times$ 920 kbps codec ($\approx 1005\text{ kbps}$ net) = **54.0 Mbps physical ingress**.

#### B. Egress Bandwidth (SFU $\rightarrow$ Invigilator Dashboards):
- 4 Invigilators viewing 12 candidate tiles each = 48 subscribed streams.
- **Grid View (Low Webcam Layer @ 100 kbps codec $\approx 110\text{ kbps}$ net, Audio Muted)**:
  - $48 \times 110\text{ kbps} = \mathbf{5.3\text{ Mbps physical egress}}$.
- **Grid View with Screen Tiles Included**:
  - $48 \times (110\text{ kbps webcam} + 545\text{ kbps screen}) = \mathbf{31.4\text{ Mbps physical egress}}$.
- **Focused View Delta**:
  - When 4 invigilators focus 1 candidate each on High Layer (350 kbps codec $\approx 385\text{ kbps}$ net):
  - Delta: $4 \times (385 - 110) = \mathbf{+1.1\text{ Mbps egress}}$.
  - Focused Grid Egress = **6.4 Mbps** (webcam only) or **32.5 Mbps** (with screen).

#### C. Aggregate Server Network I/O:
- **Baseline Profile A**: $26.8\text{ Mbps in} + 5.3\text{ Mbps out} \approx \mathbf{32.1\text{ Mbps aggregate}}$.
- **Comprehensive Profile B Worst-Case**: $54.0\text{ Mbps in} + 32.5\text{ Mbps out} \approx \mathbf{86.5\text{ Mbps aggregate}}$.
- **Hardware Headroom**: Standard AWS EC2 instances with 1 Gbps to 10 Gbps network interfaces provide $>10\times$ headroom for this 87 Mbps aggregate stream.
- **CPU Budget Target**: $<15\%$ CPU utilization on a 4-core modern compute-optimized node under 25–50 concurrent video streams.

---

## 34. Admission Control / Resource Limits

1. **Max Producers Per Candidate**: Hard cap of 3 tracks (1 webcam, 1 mic, 1 screen). Additional produce requests are rejected.
2. **Max Viewers Per Candidate**: Hard cap of 5 simultaneous invigilator consumers per candidate stream.
3. **Session Concurrency Cap**: Maximum 100 active media participants per backend node.
4. **Overload Protection**: If server CPU exceeds 80%, new media join requests receive a `SERVER_BUSY` error, falling back to audio-only or reduced framerate.

---

## 35. Security Model

1. **Transport Encryption**: Mandatory DTLS-SRTP encryption (AES-GCM-128 or AES-CTR-128) on all RTP streams. Plain RTP is rejected.
2. **Origin Defense**: WebSocket upgrade checks CORS origin against `config.CORS_ORIGIN`.
3. **BOLA Enforcement**: All participant join, produce, consume, and batch consume requests verified against PostgreSQL tables.
4. **Signaling Payload Sanitization**: Zod schema validation on all inbound messages; 16 KB limit for generic messages, 64 KB limit for authenticated media messages.
5. **No Client-Controlled IDs**: Room IDs and transport IDs are cryptographically generated UUIDs.
6. **No Token Replay / Stale Re-use**: Reset broadcasts invalidate all previous ephemeral identifiers; reconnection requires complete re-authentication.

---

## 36. Observability

Prometheus metrics registered in `backend/src/infrastructure/metrics/registry.js` with **strictly bounded label cardinality (zero UUIDs)**:

```javascript
// Active WebRTC transports
export const wsMediaTransportsActive = new promClient.Gauge({
  name: 'proctornet_media_transports_active',
  help: 'Current active WebRTC media transports',
  labelNames: ['direction'], // 'send' | 'recv'
  registers: [register]
});

// Active media producers
export const wsMediaProducersActive = new promClient.Gauge({
  name: 'proctornet_media_producers_active',
  help: 'Current active WebRTC media producers',
  labelNames: ['track_type', 'kind'], // track_type: 'webcam'|'microphone'|'screen', kind: 'audio'|'video'
  registers: [register]
});

// Active media consumers
export const wsMediaConsumersActive = new promClient.Gauge({
  name: 'proctornet_media_consumers_active',
  help: 'Current active WebRTC media consumers',
  labelNames: ['track_type'],
  registers: [register]
});

// Media lifecycle failures
export const wsMediaFailuresTotal = new promClient.Counter({
  name: 'proctornet_media_failures_total',
  help: 'Total media transport, produce, consume, or worker failures',
  labelNames: ['reason'], // 'TRANSPORT_FAILED' | 'BOLA_REJECTED' | 'WORKER_DIED' | 'RATE_LIMITED' | 'PERMISSION_DENIED' | 'TIMEOUT'
  registers: [register]
});

// ICE restarts
export const wsMediaIceRestartsTotal = new promClient.Counter({
  name: 'proctornet_media_ice_restarts_total',
  help: 'Total ICE restarts executed on media transports',
  registers: [register]
});
```

---

## 37. Audit

The centralized audit service (`recordAuditEvent`) logs the following security events:
- `MEDIA_SESSION_JOINED`: Logged when an authorized candidate or invigilator establishes media signaling.
- `MEDIA_UNAUTHORIZED_ACCESS_BLOCKED`: Logged when an unauthorized user attempts to join or consume media.
- `MEDIA_STREAM_STARTED`: Logged when a candidate publishes a media track.
- `MEDIA_STREAM_STOPPED`: Logged when a candidate stops publishing or disconnects.
- `MEDIA_SFU_WORKER_CRASHED`: Logged when an SFU worker dies and triggers session reset.

---

## 38. Configuration / Secrets

Environment variables added to `backend/src/config/env.js`:

```javascript
// WebRTC / SFU Media Configuration (Phase 17)
MEDIA_ENABLED: z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .default('true')
  .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1')),

// Network Interface & IP Configuration
MEDIA_LISTEN_IP: z.string().default('127.0.0.1'), // '0.0.0.0' in production
MEDIA_ANNOUNCED_IP: z.string().optional(), // Mandatory public Elastic IP in production
MEDIA_MIN_PORT: z.string().regex(/^\d+$/).transform(Number).default('40000'),
MEDIA_MAX_PORT: z.string().regex(/^\d+$/).transform(Number).default('49999'),

// Configurable Worker Pool
MEDIASOUP_NUM_WORKERS: z.string().regex(/^\d+$/).transform(Number).optional(),

// TURN / STUN Configuration
STUN_SERVER_URL: z.string().default('stun:stun.l.google.com:19302'),
TURN_SERVER_URL: z.string().optional(),
TURN_STATIC_AUTH_SECRET: z.string().optional(),
TURN_CREDENTIAL_TTL_SEC: z.string().regex(/^\d+$/).transform(Number).default('900'),

// Media Rate Limiting & Sizing
WS_MEDIA_RATE_LIMIT_PER_MIN: z.string().regex(/^\d+$/).transform(Number).default('240'),
WS_MEDIA_BURST_CAPACITY: z.string().regex(/^\d+$/).transform(Number).default('60'),
WS_MEDIA_MAX_PAYLOAD_BYTES: z.string().regex(/^\d+$/).transform(Number).default('65536'),

// Optional Future Distributed SFU Secret (No default secret)
MEDIA_SIGNING_SECRET: z.string().min(32).optional(),
```

### Production Validation Guard:
In `env.js`, a superRefine validation rule enforces that when `process.env.NODE_ENV === 'production'` and `MEDIA_ENABLED === true`:
- `TURN_SERVER_URL` must be non-empty.
- `TURN_STATIC_AUTH_SECRET` must be non-empty (minimum 16 characters).
- `MEDIA_ANNOUNCED_IP` must be configured with a valid public IP address (not loopback or RFC 1918).
- `MEDIA_LISTEN_IP` must be `'0.0.0.0'` or an explicit host private interface address.

---

## 39. Dependency Changes

### Backend (`backend/package.json`):
- `mediasoup` (`^3.26.0`): The WebRTC SFU engine. ISC License. Provides the C++ worker pool and Node.js control APIs.

### Frontend (`frontend/package.json`):
- `mediasoup-client` (`^3.23.1`): Client-side WebRTC ORTC wrapper. ISC License. Handles browser `RTCPeerConnection`, SDP negotiation, and simulcast track binding.

*(No other dependencies required. Zero changes to databases, system drivers, or external frameworks.)*

---

## 40. Backend File-Level Change Plan

1. **`backend/package.json`**:
   - Add `mediasoup: "^3.26.0"`.
2. **`backend/src/config/env.js`**:
   - Add media configuration variables with production TURN and IP validation guards, plus `WS_MEDIA_MAX_PAYLOAD_BYTES`.
3. **`backend/src/infrastructure/media/sfuManager.js` [NEW]**:
   - Initializes bounded worker pool (`MEDIASOUP_NUM_WORKERS`).
   - Implements deterministic session-to-worker pinning (`crc32(sessionId) % numWorkers`).
   - Maintains per-worker generation contexts (`workerContexts[i].generation`) and implements per-worker epoch fencing on worker death.
   - Binds `worker.on('died')` and coordinates the 11-step worker crash recovery sequence for affected sessions only.
   - Exposes idempotent `closeTransportsForConnection(connectionId)` to tear down all send/recv transports, producers, and consumers for a socket.
4. **`backend/src/infrastructure/media/mediaSignaling.js` [NEW]**:
   - Processes `media:*` commands with per-worker generation epoch verification.
   - Enforces BOLA checks against PostgreSQL session relationships.
   - Implements `media:consume_batch` with deduplication (`[...new Set(producerIds)]`) and partial-success semantics.
5. **`backend/src/infrastructure/media/iceService.js` [NEW]**:
   - Generates ephemeral HMAC-SHA1 TURN credentials for authorized session participants.
6. **`backend/src/infrastructure/media/media.schemas.js` [NEW]**:
   - Zod validation schemas for all media signaling messages, enforcing `producerIds: z.array(z.string().uuid()).min(1).max(36)` with root-level `rtpCapabilities`.
7. **`backend/src/infrastructure/media/index.js` [NEW]**:
   - Public facade exporting `defaultSfuManager`, `handleMediaSignaling`, and `getIceServers`.
8. **`backend/src/infrastructure/realtime/websocketServer.js`**:
   - Implement Two-Tier Inbound Rate Limiting: route `media:*` commands through `_mediaTokenBucket`.
   - Implement decoupled payload guards: 16 KB for generic messages, 64 KB (`WS_MEDIA_MAX_PAYLOAD_BYTES`) for authenticated `media:*`.
   - Dispatch validated `media:*` commands to `handleMediaSignaling`.
   - **Socket Disconnect Teardown**: In `ws.on('close')`, invoke `defaultSfuManager.closeTransportsForConnection(context.connectionId)` to cleanly and idempotently destroy all associated media transports and evict ephemeral producer entries upon tab close, network loss, or Phase 16 authoritative revocation sweeps.
9. **`backend/src/infrastructure/metrics/registry.js`**:
   - Register WebRTC metrics (`wsMediaTransportsActive`, `wsMediaProducersActive`, `wsMediaConsumersActive`, `wsMediaFailuresTotal`, `wsMediaIceRestartsTotal`).
10. **`backend/src/modules/sessions/sessions.routes.js` & `sessions.controller.js`**:
    - Add `GET /api/v1/sessions/:sessionId/ice-servers` (returns STUN/TURN credentials for assigned session).
11. **`backend/src/server.js`**:
    - Initialize `defaultSfuManager.init()` on startup; close workers during graceful shutdown.

---

## 41. Frontend File-Level Change Plan

1. **`frontend/package.json`**:
   - Add `mediasoup-client: "^3.23.1"`.
2. **`frontend/src/services/mediaClient.js` [NEW]**:
   - Singleton client managing `mediasoupClient.Device`, media transports, and signaling exchange over `RealtimeClient`.
   - Handles `media:session_reset` by destroying local device state and re-establishing transports under the new epoch.
   - Dispatches `media:consume_batch` with root-level `rtpCapabilities`.
3. **`frontend/src/hooks/useMediaCapture.js` [NEW]**:
   - Hook for candidate camera, microphone, and screen capture with permissions handling and VU meter telemetry.
   - Exposes `stopTracks()` utility ensuring hardware handles are cleanly released.
4. **`frontend/src/hooks/useMediaSubscription.js` [NEW]**:
   - Hook for invigilator multi-stream consumption, grid pagination, layer switching, consumer pausing, and `media:consume_batch` invocation.
5. **`frontend/src/components/media/VideoPlayer.jsx` [NEW]**:
   - High-performance video component with quality badge, audio indicator, and offline fallback placeholder.
   - Cleans `srcObject = null` on unmount.
6. **`frontend/src/components/media/CandidateMediaGrid.jsx` [NEW]**:
   - Grid layout for `SessionMonitorPage` displaying live video tiles with pagination, solo audio listening logic, and focused-view modal.
7. **`frontend/src/pages/candidate/PreExamReadinessPage.jsx`**:
   - Integrate pre-exam hardware verification step with mandatory `stopMediaStream()` cleanup on unmount, navigation, completion, or error.
8. **`frontend/src/pages/candidate/ExamTakingPage.jsx`**:
   - Mount `useMediaCapture` acquiring fresh production media tracks; render minimized floating camera preview.
9. **`frontend/src/pages/invigilator/SessionMonitorPage.jsx`**:
   - Add "Live Media Monitor" tab embedding `CandidateMediaGrid`.

---

## 42. Database Migration Decision

**Decision: NO DATABASE MIGRATION REQUIRED.**
- Rationale: WebRTC media streaming is strictly ephemeral. RTP packets, transports, and stream states exist exclusively in memory.
- Exam attempts, sessions, enrollments, audit logs, and violation events already have authoritative tables.
- Adding database tables for WebSockets or WebRTC would severely degrade database performance during peak exams.

---

## 43. ADR-0007 Decision

**Decision: Architecture Decision Record ADR-0007 MUST be authored:**
- **Title**: `ADR-0007: WebRTC SFU Media Plane Architecture, mediasoup Integration, and Dual-Plane Separation`
- **Scope**:
  - Mediasoup selection, child worker process model, bounded pool sizing, and deterministic session pinning.
  - Phase 16 WebSocket signaling reuse with Two-Tier Inbound Rate Limiting and decoupled 64 KB payload guards.
  - Batched Multi-Consumer Creation with Partial-Success Semantics (`media:consume_batch`) with deduplication.
  - Bitrate Profile A ($\le 1.0\text{ Mbps}$ nominal) and Profile B (~1.0 Mbps nominal) with dynamic congestion adaptation ladder.
  - 12-candidate grid mute-by-default audio policy with single-candidate solo listening and RFC 6464 VU meter telemetry.
  - 11-step SFU worker crash recovery sequence with Per-Worker Generation Epoch Fencing and PostgreSQL re-authorization.
  - Deterministic socket close teardown hook releasing SFU transports upon client disconnect or revocation sweeps.
  - Pre-exam hardware lock prevention lifecycle (`track.stop()` cleanup).
  - Co-located WebSocket JWT authentication model with future-optional distributed MGT specification.
  - Mandatory production TURN configuration policy and public announced IP topology.
  - Ephemeral zero-database media persistence, Redis auxiliary role, and selective Phase 15 evidence decoupling.

---

## 44. Testing Strategy

### Unit Tests (`backend/tests/media/`):
- `mediaSchemas.test.js`:
  - Validates all Zod media command schemas.
  - Enforces `producerIds: min(1).max(36)`. Rejects empty batch (`[]`) and oversized batch (>36).
  - Validates root-level `rtpCapabilities`.
- `iceService.test.js`: Verifies HMAC-SHA1 TURN credential generation, TTL calculation, secret isolation, and production validation failure when TURN or announced IP is missing.
- `mediaAuthorization.test.js`: Exhaustive BOLA test suite verifying candidate own-attempt gating, invigilator assigned-session gating, faculty ownership gating, and admin override.
- `mediaPayloadSizing.test.js`:
  - Generic non-media messages $>16\text{ KB}$ are rejected with close code `1009`.
  - Authenticated media messages up to 64 KB are accepted and processed.
  - Authenticated media messages $>64\text{ KB}$ are rejected with close code `1009`.
  - Serialized worst-case `media:consumed_batch` response for 36 tracks is verified to stay under 64 KB (~44 KB).
- `mediaRateLimiting.test.js`:
  - Candidate normal signaling does not trip limits.
  - Invigilator 12-candidate batch consumption operates within token allowance.
  - Rate limit exhaustion returns `MEDIA_RATE_LIMIT_EXCEEDED` without closing socket.
  - Severe flood (>120 over limit) triggers close code 1008.

### Integration Tests (`backend/tests/media/`):
- `sfuManager.test.js`: Verifies bounded worker pool initialization (`MEDIASOUP_NUM_WORKERS`), deterministic session pinning (`crc32(sessionId) % numWorkers`), and port allocation.
- `sfuCrashRecovery.test.js`:
  - Simulates Worker $i$ dying (`workerContexts[i].worker.emit('died')`).
  - Verifies ONLY Worker $i$'s generation increments ($N_i \to N_i + 1$) and ONLY its assigned sessions enter `RESETTING`.
  - Verifies that sessions on Worker $j \ne i$ remain `ACTIVE` and continue processing media signaling without interruption.
  - Verifies rejection of lagging signaling commands carrying stale generation with `MEDIA_SESSION_RESETTING`.
  - Verifies structured logging and `wsMediaFailuresTotal` increment.
  - Verifies `media:session_reset` broadcast with new epoch.
  - Verifies candidate re-publication and invigilator re-consumption.
  - Verifies that re-created transports are strictly re-authorized against PostgreSQL.
- `mediaDisconnectTeardown.test.js`:
  - Verifies that `ws.on('close')` invokes `closeTransportsForConnection`.
  - Confirms send transports, recv transports, producers, and consumers are closed immediately.
  - Confirms cleanup is idempotent when called repeatedly.
- `mediaRedisDegradation.test.js`:
  - Verifies local media routing and subscription continue when Redis is offline.
  - Verifies that querying a stale Redis producer evicts the key and returns `PRODUCER_NOT_FOUND` without granting unauthorized access.
  - Verifies producer reconciliation upon Redis reconnect.
- `mediaSignaling.test.js`: Tests full signaling lifecycle (caps $\to$ createTransport $\to$ connectTransport $\to$ produce $\to$ consume $\to$ close) over mock WebSocket.
- `mediaBatching.test.js`:
  - Tests `media:consume_batch` with valid, partial invalid, and unauthorized producer IDs, confirming independent evaluation and partial success.
  - Verifies deduplication of duplicate IDs in `producerIds`.

### Frontend Tests (`frontend/tests/media/`):
- `mediaClient.test.js`: Verifies device loading, transport creation, root-level `rtpCapabilities` in batch requests, and `media:session_reset` handling with per-worker epoch updates.
- `useMediaCapture.test.js`:
  - Verifies hardware lock prevention: confirms all tracks invoke `track.stop()` on unmount, route change, and navigation.
  - Verifies permission denial and hardware error states.
- `CandidateMediaGrid.test.jsx`:
  - Verifies all 12 candidate audio elements are muted on mount.
  - Verifies focusing candidate X unmutes only candidate X.
  - Verifies switching focus to candidate Y mutes candidate X and unmutes candidate Y.
  - Verifies unmounting pauses consumers and closes audio contexts.
- `VideoPlayer.test.jsx`: Renders stream tiles, handles muted/paused states, and cleans video element `srcObject`.

### Regression Verification:
- Complete backend suite (`npm test`): Must maintain 647/647 passing tests.
- Complete frontend suite (`npm --prefix frontend test -- --run`): Must maintain 37/37 passing tests.

---

## 45. Manual Verification Plan

1. **Pre-Exam Readiness Hardware Cleanup Flow**:
   - Candidate verifies camera and microphone on `PreExamReadinessPage`.
   - Candidate proceeds to exam; verify camera LED turns off briefly and no `NotReadableError` occurs on `ExamTakingPage`.
2. **Active Exam Streaming & Indicator**: Candidate launches exam; verify persistent red/green streaming indicator and local preview.
3. **Invigilator Multi-View & Audio Policy**:
   - Invigilator opens `SessionMonitorPage` with 12 candidate tiles.
   - Verify all tiles render smoothly at low-simulcast resolution ($320\times240$).
   - Verify zero candidate audio is audible in grid view.
   - Verify VU meters pulse visually when candidates speak.
   - Click Candidate 4 "Listen In"; verify only Candidate 4 is audible.
   - Switch to Candidate 8; verify Candidate 4 mutes immediately and Candidate 8 is audible.
4. **Worker Crash & Per-Worker Fencing Recovery**:
   - Manually kill mediasoup Worker 1 (`kill -9 <workerPid1>`).
   - Verify sessions on Worker 1 reset and recover within 3 seconds.
   - Simultaneously verify that a session running on Worker 0 experiences **zero lag, zero reset, and zero interruption**.
5. **Dynamic Congestion Adaptation**:
   - Throttle candidate uplink using Chrome DevTools network throttling.
   - Verify webcam high layer is dropped first, followed by screen framerate reduction, while audio remains uninterrupted.
6. **Clean Teardown & Socket Disconnect**: Candidate submits exam or closes browser; verify all media tracks terminate immediately, camera LED turns off, and backend transports are cleaned instantly.

---

## 46. Performance / Capacity Targets

- **Media Latency**: Glass-to-glass latency $<300\text{ ms}$ under normal network conditions.
- **Candidate Uplink Budget**:
  - Profile A (Standard): Configured bandwidth ceiling budgeted for $\le 1.0\text{ Mbps}$ nominal network envelope (nominal ~535 kbps, peak ~680 kbps).
  - Profile B (Comprehensive): Nominal ~1.0 Mbps network envelope, peak $\le 1.4\text{ Mbps}$.
- **Invigilator Downlink Budget**: 12-candidate grid view $\le 1.5\text{ Mbps}$ aggregate (100 kbps $\times$ 12 + overhead).
- **CPU Utilization Target**: SFU worker CPU $<15\%$ on an 8-core server under 25–50 simultaneous candidate video streams.
- **Signaling Latency**: Complete transport negotiation (getRouterCaps $\to$ connectTransport $\to$ produce) completes in $<150\text{ ms}$.

---

## 47. Phase 18 Boundary

Phase 17 strictly avoids implementing Phase 18 scope:
- **No deep penetration testing or security header hardening** (Helmet CSP policies for WebRTC are strictly limited to allowing `wss:` and media endpoints).
- **No automated malware scanning or container security hardening**.
- **No machine learning / AI facial recognition or gaze tracking** (Phase 17 routes video for human invigilator inspection only).

---

## 48. Risks and Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Symmetric NATs Blocking UDP** | Media fails to connect (~15–20% of users) | Mandatory Coturn TURN relay in production with fallback alert `RELAY_UNAVAILABLE`. |
| **High Candidate Uplink Contention** | Video lag, packet loss | Strict VP8 simulcast; Dynamic Congestion Adaptation Ladder prioritizing audio and low webcam. |
| **Invigilator Downlink / Audio Overload** | Browser tab crashes; acoustic feedback | Grid view limited to 12 candidates; audio muted by default; off-screen streams paused. |
| **Camera Hardware Lock by Other Apps or Preview** | `NotReadableError` on exam start | Mandatory `stopMediaStream()` cleanup in `PreExamReadinessPage` on unmount and navigation. |
| **SFU Worker Crash & Stale Command Race** | Active streams dropped; signaling races | 11-step worker crash recovery protocol with Per-Worker Generation Epoch Fencing (`MEDIA_SESSION_RESETTING`). |
| **Signaling Payload Limit Tripping** | Frame size violation `1009` on batch consume | Dedicated 64 KB media signaling limit (`WS_MEDIA_MAX_PAYLOAD_BYTES`) + root-level `rtpCapabilities`. |
| **Signaling Rate-Limit False Positives** | Legitimate signaling terminated (1008) | Two-Tier Rate Limiting (`ws:media` token bucket: 240/min, burst 60) + `media:consume_batch`. |
| **Redis Outage / Partition** | Cross-node notifications dropped | In-memory SFU authoritative fallback; reconciliation and stale key eviction upon reconnect. |
| **Unclosed Transports on Disconnect** | Memory & UDP port exhaustion | Explicit `closeTransportsForConnection` hook in `websocketServer.js` on `ws.on('close')`. |

---

## 49. Implementation Sequence

1. **Phase 17 Foundation & Dependencies**: Add `mediasoup` to backend and `mediasoup-client` to frontend; configure environment variables including `WS_MEDIA_MAX_PAYLOAD_BYTES`, `MEDIA_LISTEN_IP`, `MEDIA_ANNOUNCED_IP`, and production TURN validation.
2. **SFU Infrastructure Layer**: Implement `sfuManager.js`, bounded worker pool initialization, deterministic session pinning, per-worker generation epoch fencing, and `worker.on('died')` recovery.
3. **Signaling & Authorization Layer**: Implement `mediaSignaling.js`, `media.schemas.js`, and `iceService.js`; integrate Two-Tier Rate Limiting, 64 KB media payload guard, `media:consume_batch` with deduplication, and socket disconnect teardown into `websocketServer.js`.
4. **Backend REST Endpoints**: Implement `GET /api/v1/sessions/:sessionId/ice-servers`.
5. **Observability & Audit**: Register media Prometheus metrics; wire `recordAuditEvent` for media lifecycle.
6. **Frontend Media Client**: Implement `mediaClient.js` integrating with `RealtimeClient`, per-worker epoch tracking, and `media:session_reset`.
7. **Frontend Candidate Capture**: Implement `useMediaCapture` and pre-exam readiness verification with strict track cleanup.
8. **Frontend Invigilator Monitor**: Implement `useMediaSubscription`, `VideoPlayer.jsx`, and `CandidateMediaGrid.jsx` with solo audio listening.
9. **Testing & Verification**: Author comprehensive unit, integration, payload sizing, disconnect cleanup, and security test suites; run regression checks.
10. **Documentation**: Author `ADR-0007` and update documentation indices.

---

## 50. Acceptance Criteria

1. **Media Plane Isolation**: Media forwarding is handled by `mediasoup-worker`; the Node.js API thread never proxies or buffers RTP packets.
2. **Two-Tier Signaling Rate Limiting & Decoupled Payloads**: Media signaling operates over Phase 16 WebSocket using a dedicated `ws:media` token bucket (240 msgs/min, burst 60) and 64 KB media payload ceiling (`WS_MEDIA_MAX_PAYLOAD_BYTES`), while generic messages remain strictly limited to 16 KB.
3. **Batched Multi-Consumer Creation with Partial-Success**: `media:consume_batch` supplies `rtpCapabilities` once at root, validates `producerIds` (`min: 1, max: 36`), deduplicates IDs, evaluates producers independently, and returns partial successes without all-or-nothing rollback.
4. **Strict BOLA Enforcement**: Only authorized enrolled candidates can publish; only assigned invigilators and exam-owning faculty can subscribe.
5. **Bandwidth Compliance**: Profile A configured bandwidth ceiling budgeted within a $\le 1.0\text{ Mbps}$ nominal network envelope; Profile B nominal ~1.0 Mbps; dynamic congestion adaptation ladder drops high layers before audio.
6. **Invigilator Audio Control**: 12-candidate grid audio muted by default; single-candidate solo listening on focus; visual RFC 6464 VU meters.
7. **Per-Worker Crash Recovery & Generation Fencing**: Worker crash increments only the affected worker's generation epoch, fences stale signaling with `MEDIA_SESSION_RESETTING`, respawns the worker, clears stale Redis keys, and triggers client rebuild with full PostgreSQL re-authorization within 3 seconds, leaving healthy workers completely unaffected.
8. **Worker Pool Sizing & Session Pinning**: Worker count is bounded via `MEDIASOUP_NUM_WORKERS` (default capped at 4); sessions are deterministically pinned to workers via `crc32(sessionId) % numWorkers`.
9. **Deterministic Socket Disconnect Teardown**: Closing a WebSocket connection (tab close, network drop, or session revocation) immediately and idempotently invokes `closeTransportsForConnection`, releasing all associated transports, producers, and consumers.
10. **Redis Failure Resilience**: In-memory SFU state is authoritative for local co-located sessions; Redis outage does not disrupt local streaming; reconciliation purges stale keys upon reconnect.
11. **Hardware Lock Prevention**: Pre-exam preview tracks stopped completely on unmount/proceed; zero `NotReadableError` on exam launch.
12. **Production TURN & IP Topology Enforcement**: Mandatory `TURN_SERVER_URL` and `TURN_STATIC_AUTH_SECRET` in production; `MEDIA_LISTEN_IP` binds to `0.0.0.0` while `MEDIA_ANNOUNCED_IP` advertises the public external IP.
13. **Zero Database Migrations**: WebRTC state remains 100% ephemeral; zero persistent schema migrations added.
14. **Passing Test Suites**: 100% passing backend, frontend, media, payload sizing, disconnect cleanup, and regression test suites.

---

## 51. Plan Freeze Checklist

- [x] Precedence hierarchy followed: Notion Step 13 $\to$ `DEVELOPMENT_PLAN.md` $\to$ Existing repository $\to$ ADRs.
- [x] Per-Worker Generation Epoch Fencing (`workerContexts[i].generation`, `MEDIA_SESSION_RESETTING`) specified; healthy workers isolated.
- [x] `media:consume_batch` validated (`min: 1, max: 36`) and deduplicated (`[...new Set(producerIds)]`).
- [x] Socket disconnect teardown (`defaultSfuManager.closeTransportsForConnection`) specified in `websocketServer.js`.
- [x] Production network topology specified (`0.0.0.0` listen IP + public announced IP).
- [x] Generic 16 KB preserved; dedicated `WS_MEDIA_MAX_PAYLOAD_BYTES` (64 KB) specified; root-level `rtpCapabilities` defined.
- [x] Renamed to "Batched Multi-Consumer Creation with Partial-Success Semantics"; independent BOLA and non-rollback partial failure documented.
- [x] Bounded `MEDIASOUP_NUM_WORKERS` (capped default 4) and deterministic session pinning (`crc32(sessionId) % numWorkers`) specified.
- [x] In-memory authoritative SFU fallback, Redis degradation, and reconciliation mechanics specified.
- [x] Removed hardcoded default secret; made `MEDIA_SIGNING_SECRET` optional (`z.string().min(32).optional()`).
- [x] Corrected physical network throughput language to nominal budgeted envelope.
- [x] Mandatory production TURN policy and `RELAY_UNAVAILABLE` fallback specified.
- [x] Client UI vs client WebRTC vs ephemeral server socket context ownership explicitly documented; PostgreSQL business authority confirmed.
- [x] Explicit mathematical ingress (26.8–54.0 Mbps) and egress (5.3–32.6 Mbps) capacity model incorporated and labeled as unverified design assumptions.
- [x] Secondary review completed across all 23 architectural dimensions.
- [x] ADR-0007 scope updated in plan requirements.
- [x] Phase 18 boundaries preserved (no ML/CV, malware scanning, or premature k8s).

---

PHASE 17 — PLAN CORRECTED, READY FOR FRESH INDEPENDENT PLAN RE-REVIEW
