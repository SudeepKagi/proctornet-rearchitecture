# ADR-0009: Containerization Topology, Multi-Stage Builds, Host-Networked SFU Media Plane, and Single-Host Delivery Architecture

## Status
Accepted

## Date
2026-09-08

## Context & Problem Statement

ProctorNet Re-Architecture requires a reproducible, secure, production-grade containerization foundation and automated deployment delivery pipeline (Phase 19). The platform encapsulates:
1. A unified Node.js 24 modular monolith backend containing REST APIs, WebSocket realtime signaling, in-process native C++ `mediasoup-worker` processes, transactional outbox poller, and background evaluation worker.
2. A React 19 Single Page Application (SPA) built with Vite 6.
3. Supporting data and transport services: PostgreSQL 16, Redis 7, RabbitMQ 3.13, LocalStack S3 emulation (local/CI), and Coturn STUN/TURN relay.

The deployment model must respect core architectural boundaries established in `docs/ARCHITECTURE.md` and Notion Step 13 (specifically 13.5, 13.7, 13.17):
- Strict preservation of the modular monolith (no premature microservices decomposition, no Kubernetes/EKS/Helm, no multi-region complexity).
- High-throughput WebRTC media transport without kernel or userland proxy CPU/memory bottlenecks across 10,000 UDP ports (`40000–49999/udp`).
- NAT/firewall traversal via Coturn running with host networking semantics.
- Non-root, hardened execution for both application and edge proxy layers.
- Production TLS termination using automated Let's Encrypt certificates with strict file permission guarantees (`0640` owned by `root:101`; world-readable mode `0644` prohibited).
- Safe database migration lifecycle preventing runtime schema corruption.

## Decision Drivers

1. **Native C++ Stability**: `mediasoup` native worker processes require GNU `glibc` and a standard GNU toolchain (`python3`, `make`, `g++`). Alpine Linux's `musl` libc exhibits thread scheduling anomalies with `mediasoup-worker`.
2. **Minimal Runtime Attack Surface**: DevDependencies (`vitest`, `supertest`, `c8`, compilers) must never leak into production runtime images.
3. **WebRTC Media Throughput**: Docker userland bridge proxy (`docker-proxy`) suffers severe memory exhaustion and serialization latency when binding wide UDP port ranges (10,000 ports) under heavy WebRTC streaming load.
4. **Automated Zero-Root TLS Termination**: Production requires automated ACME HTTP-01 renewals via Certbot while running Nginx as an unprivileged user (UID 101).
5. **Cold-Start Ordering vs Targeted Replacement**: Distinct operational semantics between stack bootstrapping (`postgres` -> `backend-migrate` -> `backend` -> `frontend`) and targeted image replacement (`pull` -> `migrate` -> `frontend` -> `backend` -> `readiness`).
6. **Operational Simplicity**: Single-instance AWS EC2 topology managed via Docker Compose v2 and systemd.

## Considered Options

### Option 1: Full Bridge Networking for All Services
- Place backend, frontend, database, and Coturn on a standard Docker bridge network.
- *Discarded*: Docker's userland proxy cannot map 10,000 UDP ports efficiently, causing host memory exhaustion and dropped RTP packets during WebRTC examination streaming. Coturn also suffers double-NAT packet degradation on bridge networks.

### Option 2: Full Host Networking for All Services
- Run all containers with `network_mode: "host"`.
- *Discarded*: Eliminates network namespace isolation for internal persistence services (`postgres`, `redis`, `rabbitmq`), exposing database ports directly on host network interfaces unless manually firewalled, and causes port collision risks.

### Option 3: Hybrid Topology (Bridge Frontend + Host Backend & Coturn + Loopback Persistence)
- **Local Development (`docker-compose.yml`)**: Hybrid bridge-first stack (8 services). Coturn uses host networking; backend publishes a restricted media range (`40000–40050/udp`); frontend proxies locally on port 8080 via `default.local.conf`.
- **Production EC2 (`infrastructure/docker-compose.prod.yml`)**: Frontend runs in bridge mode (`80:8080`, `443:8443`) terminating TLS and proxying to backend via Docker host-gateway (`http://host.docker.internal:4000`). Backend and Coturn run with `network_mode: "host"`. Persistence ports (`5432`, `6379`, `5672`) bind strictly to `127.0.0.1`. Backend port 4000 is blocked from external CIDRs (`0.0.0.0/0`) via AWS Security Group and host firewall.

## Decision Outcome

**Chosen Option: Option 3 (Hybrid Topology with Host-Networked SFU & Coturn, Bridge Frontend Edge, and Loopback Persistence)**.

### Key Architectural Specifications:

1. **Multi-Stage Backend Dockerfile (`backend/Dockerfile`)**:
   - Base image: `node:24-bookworm-slim` (Debian GNU glibc).
   - Builder stage: Installs `python3`, `make`, `g++`, runs `npm ci` (compiling `mediasoup-worker` C++ native binary), and executes `npm prune --omit=dev`.
   - Runner stage: Minimal unprivileged runtime image executing as `USER node` (UID 1000). Copies only pruned `node_modules`. Excludes compilers and devDependencies.
   - Negative CI assertion: Asserts `require('vitest')`, `require('supertest')`, and `require('c8')` fail to resolve inside the runtime image.

2. **Multi-Stage Frontend Dockerfile (`frontend/Dockerfile`) & Dual Nginx Configs**:
   - Builder stage: `node:24-alpine` runs `npm ci && npm run build`.
   - Runner stage: `nginxinc/nginx-unprivileged:alpine` executing as `USER nginx` (UID 101).
   - Local Configuration (`frontend/nginx/default.local.conf`): Listens on unprivileged port 8080, serves React SPA static build, and proxies `/api/` and `/ws` to `http://backend:4000` without TLS redirection, enabling out-of-the-box local developer testing on `http://localhost:8080/`.
   - Production Configuration (`frontend/nginx/default.conf`): Listens on 8080 for ACME challenge and 301 HTTPS redirect; listens on 8443 (SSL) terminating TLS and reverse-proxying to `http://host.docker.internal:4000`.

3. **Strict TLS Private Key Permissions**:
   - Host-level Snap Certbot manages certificates under `/etc/letsencrypt`.
   - Private keys are set to mode `0640` owned by `root:101` (group readable by Nginx container UID/GID 101).
   - World-readable mode (`0644`) is **strictly prohibited**.
   - Automated renewal hook at `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` re-applies `0640` / GID 101 permissions before reloading Nginx workers in-memory.

4. **Service Count & Inventory Contract**:
   - **Local / CI (`docker-compose.yml`)**: Exactly 8 services (7 long-running: `postgres`, `redis`, `rabbitmq`, `localstack`, `coturn`, `backend`, `frontend`; 1 one-shot runner: `backend-migrate`).
   - **Production (`infrastructure/docker-compose.prod.yml`)**: Exactly 7 services (6 long-running: `postgres`, `redis`, `rabbitmq`, `coturn`, `backend`, `frontend`; 1 one-shot runner: `backend-migrate`). LocalStack is excluded.

5. **Cold-Start Startup Ordering vs Deployment Replacement**:
   - **Initial Cold-Start Boot**:
     `postgres (healthy)` -> `backend-migrate (completed 0)` -> `backend (healthy /ready)` -> `frontend (running)`.
   - **Targeted Deployment Replacement (`deploy.sh`)**:
     `pull images` -> `run backend-migrate` -> `up -d --no-deps frontend` -> `up -d --no-deps backend` -> `poll /ready`.
     `--no-deps` prevents restarting persistent dependencies during targeted application updates.

6. **WebRTC Media & TURN Client Reachability**:
   - Direct SFU media: Advertised ICE IP `${MEDIA_ANNOUNCED_IP:-127.0.0.1}` across UDP range 40000–40050 locally, 40000–49999 in production.
   - Coturn TURN relay: Advertised TURN URL `turn:${TURN_ANNOUNCED_HOST:-127.0.0.1}:3478` across relay range 49152–49250/udp.
   - For same-host testing, loopback `127.0.0.1` connects browser to host ports. For LAN testing, setting `MEDIA_ANNOUNCED_IP` and `TURN_ANNOUNCED_HOST` to the host LAN IP allows remote devices to connect.

7. **Database Migration Safety & No Automatic Rollbacks**:
   - Migrations are strictly forward-only in CI/CD.
   - Automatic database down-migrations (`migrate.js down`) are forbidden in deployment failure handlers. Rollback in `deploy.sh` is strictly limited to container image tags.

## Consequences

### Positive
- **Deterministic Compilation**: Native `mediasoup-worker` compiles reliably in Debian glibc environment.
- **Zero devDependency Leakage**: Pruned production node_modules eliminate test frameworks and build tools from runtime containers.
- **Line-Rate Media Streaming**: Host networking eliminates bridge NAT serialization for WebRTC UDP packets.
- **Unprivileged Execution**: Both Node.js and Nginx run as non-root users (UID 1000 and UID 101).
- **Cryptographic Isolation**: TLS private keys are restricted to mode `0640` owned by `root:101`.
- **Database Safety**: `backend-migrate` guarantees schema integrity before the backend API ever boots.

### Negative / Trade-offs
- **Host Network Coupling on Production EC2**: Backend and Coturn share the host network namespace in production, requiring port 4000 to be firewalled via AWS Security Group and host firewall.
- **Brief Serving Interruption on Frontend Replacement**: Single-container frontend replacement in `deploy.sh` may introduce a brief serving interruption during container recreation; true zero-downtime requires overlapping container replicas or an external load-balancing layer (Phase 20).
- **Virtualization Caveat on Windows/macOS**: Docker Desktop runs containers inside a Linux VM, requiring `MEDIA_ANNOUNCED_IP` and `TURN_ANNOUNCED_HOST` overrides for multi-device LAN testing.

## Compliance & Validation

1. **Image Validation**: CI pipeline validates `docker buildx` builds for backend and frontend.
2. **Negative Dependency Check**: CI validates that `vitest`, `supertest`, and `c8` cannot be required in the production backend image.
3. **Integration Smoke Test**: CI boots the 8-service local stack, verifying all 7 long-running services achieve `healthy` status, `backend-migrate` exits with code 0, `/ready` probe returns HTTP 200, and frontend serves HTML.
4. **Security Audit**: Trivy blocks CI on CRITICAL vulnerabilities with available vendor fixes.
5. **Zero Regression**: All 750 backend tests and 63 frontend tests pass with zero errors.
