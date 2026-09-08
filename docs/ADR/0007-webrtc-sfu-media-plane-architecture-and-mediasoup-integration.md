# ADR-0007: WebRTC SFU Media Plane Architecture and mediasoup Integration

## Status
Accepted (Phase 17)

## Date
2026-09-08

## Context & Problem Statement
The Online Examination System requires real-time video, audio, and optional screen sharing proctoring streams from candidates to invigilators during active exam sessions. To support exam integrity, invigilators must monitor grids of up to 12 active candidates simultaneously, with audio muted by default and single-candidate solo listening on focus.

Prior to Phase 17, the system established an authoritative PostgreSQL transactional persistence model, a Redis caching/pub-sub layer (ADR-0001), an asynchronous RabbitMQ worker queue (ADR-0002), Prometheus metrics & audit logging (ADR-0003), server-authoritative proctoring event ingestion (ADR-0004), presigned S3 evidence capture (ADR-0005), and an authenticated WebSocket real-time control plane (ADR-0006).

Live media streaming presents distinct performance, bandwidth, and architectural challenges:
1. Candidate client devices have limited upstream bandwidth and CPU.
2. Direct peer-to-peer (Mesh) connections between candidates and invigilators scale quadratically $O(N \times M)$, overwhelming candidate uplinks and failing under institutional NAT/firewalls.
3. Media processing requires native C++ performance (RTP packet forwarding, SRTP encryption, DTLS negotiation) without stalling the single-threaded Node.js event loop.
4. Worker crashes must be isolated with strict epoch fencing to prevent cross-worker or cross-session blast radiuses.

## Decision Drivers
- **Bandwidth Efficiency**: Candidates must upload at most one webcam, one microphone, and one screen stream ($O(1)$ uplink), while invigilators receive lightweight thumbnail layers with on-demand spatial simulcast.
- **Process Isolation & CPU Scalability**: Media forwarding must run in dedicated native worker processes isolated from the Node.js event loop.
- **Architectural Separation of Concerns**:
  - PostgreSQL remains the authoritative business source of truth (authorization, attempt lifecycle, session memberships).
  - PostgreSQL must **NEVER** persist ephemeral WebRTC transport IDs, producer IDs, consumer IDs, or worker generations.
  - Redis acts solely as an ephemeral auxiliary registry and pub-sub cache, never as an authoritative access gate.
  - RabbitMQ is excluded entirely from the live media path.
- **Reliability & Crash Isolation**: A crash of an SFU native worker must only reset sessions pinned to that worker. Generation fencing must invalidate stale signaling and Redis events without affecting healthy workers.
- **Signaling Integration**: Media signaling must leverage the existing Phase 16 WebSocket connection without starving generic control messages or violating strict payload guards.

## Considered Options
1. **Peer-to-Peer Full Mesh**:
   - *Pros*: No server media processing infrastructure required.
   - *Cons*: Candidate upload bandwidth scales linearly with the number of invigilators; NAT traversal failures are high; simulcast and adaptive layer switching cannot be centrally coordinated; unacceptable for high-stakes proctoring.
2. **Janus / Kurento / LiveKit External Daemons**:
   - *Pros*: Powerful standalone media servers.
   - *Cons*: Introduces external system dependencies, complex IPC/REST bridging, separate operational deployment lifecycles, and synchronization overhead out of alignment with the modular monolith architecture.
3. **mediasoup v3 Selective Forwarding Unit (SFU) (Chosen)**:
   - *Pros*: Node.js module wrapping native C++ worker subprocesses via Unix socket IPC. Zero-copy RTP forwarding, native simulcast, strict per-worker event loop isolation, and full control over router and transport lifecycles directly within the backend codebase.

## Decision Outcome
Chosen option: **mediasoup v3 Selective Forwarding Unit (SFU)** integrated directly into the backend modular monolith.

### Key Architectural Decisions:

1. **Dedicated Bounded Worker Pool & Deterministic Pinning**:
   - Number of workers is configurable via `MEDIASOUP_NUM_WORKERS`, bounded by `Math.min(os.cpus().length, 4)` by default.
   - Sessions are pinned to workers deterministically using a Murmur/FNV-style hash: `deterministicHash(sessionId) % workerContexts.length`.
   - All candidate producers and invigilator consumers for a session reside on that session's assigned worker router, avoiding inter-worker pipe transport complexity.

2. **Per-Worker Generation Context & Crash Isolation**:
   - Each worker maintains its own isolated lifecycle context:
     ```javascript
     workerContexts[workerId] = { workerId, generation, status, assignedSessions }
     ```
   - Generation starts at 1. If worker $K$ crashes:
     - Worker $K$ generation increments to $G_{K} + 1$.
     - Only sessions assigned to Worker $K$ enter `RESETTING`.
     - Stale signaling commands bearing old generations are rejected with `MEDIA_SESSION_RESETTING`.
     - Healthy workers continue forwarding media with zero interruption.
     - Worker $K$ is respawned, its routers are recreated, stale Redis producer keys are purged, and a `media:session_reset` event triggers client re-negotiation.

3. **Two-Tier Signaling Rate Limiting & Decoupled Payloads**:
   - Media signaling flows through the authenticated Phase 16 WebSocket server.
   - **Payload Limits**: Unauthenticated frames and generic control frames are strictly capped at 16 KB. Authenticated media signaling (`media:*`) is allowed up to 64 KB (`WS_MEDIA_MAX_PAYLOAD_BYTES`), accommodating SDP parameters, ICE candidates, and batch consume requests.
   - **Rate Limiting**: Generic control frames continue using the 60/min sliding window limiter. Authenticated media frames utilize a dedicated in-memory Token Bucket (240 msgs/min refill rate, burst capacity of 60). Excessive flooding closes the socket with code `1008`.

4. **Batched Consumer Acquisition (`media:consume_batch`)**:
   - Invigilators subscribe to candidate feeds via `media:consume_batch` with root-level `rtpCapabilities` and a validated array of 1 to 36 `producerIds`.
   - Request deduplicates producer IDs server-side while preserving deterministic ordering.
   - Employs **partial-success semantics**: consumer creation failure for one producer does not abort or roll back valid sibling consumers in the batch.

5. **Strict PostgreSQL BOLA Authorization**:
   - Media operations strictly validate authorization against PostgreSQL on every transport creation, publish, and consume request:
     - **Candidates (STUDENT)**: Must own an `ACTIVE` attempt belonging to the target session. Publish-only (cannot consume).
     - **Invigilators (INVIGILATOR)**: Must have an active assignment in `session_invigilators`. Receive-only (cannot publish).
     - **Faculty (FACULTY)**: Must own the parent exam. Receive-only.
     - **Admins (ADMIN)**: Global read-only observation. Receive-only.
   - Redis metadata and client-supplied IDs are never trusted for authorization.

6. **Network & ICE/TURN Topology**:
   - Dual IP configuration: `MEDIA_LISTEN_IP` binds the socket interface (e.g. `0.0.0.0`), while `MEDIA_ANNOUNCED_IP` advertises the public/reachable IP in ICE candidates.
   - In production, static TURN server credentials are required (`TURN_SERVER_URL` and `TURN_STATIC_AUTH_SECRET`), and ephemeral HMAC-SHA1 credentials with a 24-hour TTL are issued via `GET /api/v1/sessions/:id/ice-servers`.
   - TURN secrets are never sent to frontend clients.

7. **Hardware Lock Prevention**:
   - `PreExamReadinessPage` rigorously releases all MediaStream tracks and nullifies `video.srcObject` on proceed, retry, navigation, unmount, and `beforeunload`.
   - `ExamTakingPage` acquires completely fresh media tracks upon entering the exam.

8. **Connection Teardown**:
   - When a WebSocket disconnects, `defaultSfuManager.closeTransportsForConnection(connectionId)` idempotently closes all associated send/recv transports, producers, and consumers, and deregisters ephemeral Redis keys.

## Positive Consequences
- **Minimal Upstream Bandwidth**: Candidates stream one video, audio, and screen track regardless of how many proctors observe.
- **Robust Crash Recovery**: Worker crashes are isolated; healthy sessions remain undisturbed; clients recover automatically via `media:session_reset`.
- **Zero Database Bloat**: Ephemeral WebRTC state leaves zero footprint in PostgreSQL.
- **Security Invariants Maintained**: Strict role-based BOLA checks prevent candidate eavesdropping and unauthorized stream injection.

## Negative Consequences / Trade-offs
- **Server Memory & CPU**: The backend server must host C++ mediasoup worker processes, requiring adequate container CPU allocation and UDP port ranges (default `10000-10100`).
- **Simulcast Complexity**: Client devices must support WebRTC simulcast encoding profiles and handle layer switching.

## Compliance & Validation
- **Automated Schemas & Sizing Tests**: Verified with Vitest/Jest covering 16 KB vs 64 KB limits, root-level `rtpCapabilities`, and 1..36 producer limits.
- **Authorization Tests**: Validated that students cannot consume, unauthorized users cannot access session media, and BOLA checks query PostgreSQL.
- **SFU Worker & Crash Tests**: Validated deterministic pinning, isolated worker death, generation incrementing, and recovery.
- **Disconnect & Batching Tests**: Verified idempotent cleanup and non-rollback partial-success semantics.
- **Regression Suite**: Must maintain 100% passing status across all existing backend and frontend test suites.
