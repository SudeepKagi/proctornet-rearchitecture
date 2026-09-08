# Phase 19 Implementation Plan: Infrastructure, Containerization & Delivery Foundation (Revised)

> **Authoritative Source Precedence:**
> 1. Notion Step 13 Final Re-Architecture (Sections 13.5, 13.7, 13.17 — Infrastructure, Deployment Specifications, Decoupled State & Service Architecture)
> 2. `docs/DEVELOPMENT_PLAN.md` (Phase 19 — Containerization & Deployment)
> 3. Existing Merged Repository Baseline (Phases 1–18 Merged on `main`)
> 4. Existing Architecture Decision Records (ADR-0001 through ADR-0008)
> 5. `docs/ARCHITECTURE.md` (System Purpose, Non-Goals, Modular Monolith Invariants)

---

## 1. Phase Objective

Phase 19 establishes a production-grade, secure, multi-stage containerization foundation, local development orchestration stack, automated Continuous Integration (CI) pipeline, and single-instance AWS EC2 delivery architecture for the ProctorNet platform.

The core objective is to operationalize the existing modular monolith application without introducing premature microservice decomposition, Kubernetes overhead, or managed cloud abstractions. It encapsulates the Node.js 24 backend (including native C++ `mediasoup` SFU workers), the React 19 Single Page Application (SPA), and supporting infrastructure (PostgreSQL 16, Redis 7, RabbitMQ 3.13, LocalStack S3, and Coturn TURN) into reproducible, non-root, hardened Docker containers orchestrated via Docker Compose and validated via GitHub Actions.

---

## 2. Exact Authoritative Scope

1. **Multi-Stage Container Images**:
   - `backend/Dockerfile`: Multi-stage build compiling native `mediasoup` C++ workers in a Debian-based build environment (`node:24-bookworm-slim`), producing a minimal, unprivileged, non-root (`USER node`) production runtime image.
   - `frontend/Dockerfile`: Multi-stage build executing Vite production compilation, producing an ultra-lightweight static image served by an unprivileged Nginx instance (`nginxinc/nginx-unprivileged:alpine`) on ports 8080 (HTTP redirect & ACME) and 8443 (HTTPS TLS termination).
   - Associated `.dockerignore` files for backend and frontend excluding dev artifacts, tests, documentation, and local storage.
2. **Local & Integration Orchestration (`docker-compose.yml`)**:
   - Declarative multi-container orchestration for the complete platform stack in local development and CI (8 service definitions total: 7 long-running runtime services and 1 one-shot migration runner):
     - Long-running runtime services: `postgres`, `redis`, `rabbitmq`, `localstack` (S3 mock), `coturn` (TURN relay), `backend` (API, Realtime WebSocket, SFU, Outbox, Evaluation Worker), and `frontend` (SPA + Nginx Reverse Proxy).
     - One-shot initialization service: `backend-migrate` (executes schema migrations prior to API boot).
   - Strict service readiness dependencies using `depends_on` with `condition: service_healthy` and `condition: service_completed_successfully`.
   - Named persistent volumes for PostgreSQL, Redis, RabbitMQ, and LocalStack.
   - Dedicated internal Docker bridge network (`proctornet-net`) for application and persistence services, combined with host networking for Coturn.
3. **Continuous Integration Pipeline (`.github/workflows/ci.yml`)**:
   - Automated GitHub Actions workflow triggered on Pull Requests to `main` and pushes to `main`.
   - Parallel, cached execution stages:
     - `lint-and-validate`: Syntax, configuration validation, schema checks.
     - `backend-tests`: Full regression suite (750 tests) against containerized PostgreSQL, Redis, and RabbitMQ services, running the full committed migration chain.
     - `frontend-tests`: Full Vitest regression suite (63 tests).
     - `frontend-build`: Production bundle compilation validation (`npm run build`).
     - `docker-build-verify`: Build validation for backend and frontend Dockerfiles, followed by a Compose integration smoke test against `docker-compose.yml` verifying that all 7 long-running runtime services achieve healthy state and the backend-migrate one-shot service completes successfully with exit code 0.
     - `security-audit`: Vulnerability scanning for dependencies and container images.
4. **AWS EC2 Single-Host Deployment Architecture**:
   - Production Docker Compose topology (`infrastructure/docker-compose.prod.yml`) tailored for a single AWS EC2 instance (e.g. `t3.xlarge` / `c6i.xlarge` running Ubuntu 24.04 LTS), defining 7 total services (6 long-running runtime services and 1 one-shot migration runner; LocalStack is excluded because production uses real AWS S3).
   - Nginx reverse proxy configuration handling full TLS termination (Certbot / Let's Encrypt), static file serving, API routing (`/api/v1`), and WebSocket upgrades (`/ws`) via bridge networking with host-gateway routing to the backend.
   - Explicit separation of local bridge networking from production hybrid edge/media configuration (bridge frontend with host-gateway, host-networked backend and coturn, loopback-isolated persistence).
   - Graceful single-instance backend replacement and stateless frontend container replacement workflow (`infrastructure/deploy.sh`).
5. **Systemd Host Service (`infrastructure/proctornet.service`)**:
   - Production systemd unit file managing Docker Compose lifecycle on system boot, reboot, and unexpected daemon failure.
6. **Architecture Decision Record (ADR-0009)**:
   - Authored and indexed in `docs/ADR/`: *ADR-0009: Containerization Topology, Multi-Stage Builds, Host-Networked SFU Media Plane, and Single-Host Delivery Architecture*.

---

## 3. Explicit Out-of-Scope Items

To preserve strict compliance with Notion Step 13.17 and `docs/ARCHITECTURE.md` Section 9, the following are strictly **OUT OF SCOPE** for Phase 19:
- **No Kubernetes / EKS / Helm**: Premature distributed cluster orchestration is an explicit non-goal. Single-host Docker Compose on EC2 provides sufficient scale for target concurrency.
- **No Microservices Decomposition**: The backend modular monolith remains a unified Node.js process containing REST controllers, WebSocket gateway, in-process mediasoup SFU worker pool, outbox poller, and evaluation consumer.
- **No Terraform / AWS Infrastructure as Code**: Declarative AWS cloud provisioning (VPC, Subnets, Security Groups, IAM, Route53, ALB) belongs strictly to **Phase 20 — AWS Infrastructure**.
- **No Multi-Region Deployment**: Single-region architecture is preserved.
- **No Database Sharding or Read-Replicas**: Single primary PostgreSQL cluster architecture remains authoritative.
- **No Kafka / GraphQL**: RabbitMQ and RESTful HTTP APIs remain the sole standards.
- **No Database Migrations**: Zero PostgreSQL schema changes are permitted in Phase 19.
- **No Multi-Instance Overlapping Replicas or External Load Balancing for Zero-Downtime Deployments**: Production operates as a single EC2 host with single-container frontend and backend deployments. Stateless single-container frontend replacement (via `deploy.sh`: `docker compose up -d --no-deps frontend`) may introduce a brief serving interruption during container recreation; the interruption duration is environment-dependent and must be measured during deployment verification. True zero-downtime frontend replacement requires overlapping container replicas or an external load-balancing layer (e.g., AWS ALB), which is outside Phase 19 scope and deferred to Phase 20.

---

## 4. Current Repository & Deployment State Assessment

- **Git Baseline**: Merged `main` branch at commit `ce63b29`, clean working tree.
- **Backend State**:
  - Node.js 24 LTS, ES modules (`"type": "module"`).
  - Configured via `backend/src/config/env.js` using Zod validation with strict production constraints.
  - Native C++ dependency: `mediasoup` v3.26.0 requires compiler tools (`python3`, `make`, `g++`) to build its native worker binary on Linux architectures.
  - Health endpoints: `GET /health` (liveness) and `GET /ready` (readiness with PG, Redis, RabbitMQ deep checks) implemented in `backend/src/routes/health.routes.js`.
  - Prometheus metrics: `GET /metrics` with optional token protection via `METRICS_AUTH_TOKEN`.
  - Graceful shutdown: Handles `SIGTERM` and `SIGINT` with a 10s drain window closing WebSockets, SFU workers, HTTP listener, outbox poller, evaluation consumer, RabbitMQ, Redis, and PG connection pool.
  - Test suite: 750 / 750 passing tests across 185 suites (`npm test -- --test-concurrency=1`).
- **Frontend State**:
  - React 19 SPA built with Vite 6.
  - Relative API routing: fetches `/api/v1/...` and connects WebSocket via `window.location.host/ws`, designed specifically for reverse-proxy fronting.
  - Production build: `npm run build` compiles cleanly into `dist/` (HTML, JS, CSS) in ~4 seconds.
  - Test suite: 63 / 63 passing tests across 18 files (`npm test`).
- **Infrastructure Directory**:
  - `infrastructure/` currently contains only a placeholder `README.md`.
  - Zero Dockerfiles, zero Compose files, zero GitHub Actions workflows exist in the repository.

---

## 5. Architecture Invariants

Every proposal in this plan strictly preserves the established architectural baseline:

1. **PostgreSQL Business Authority**: PostgreSQL is the sole authoritative source of truth. The containerized environment must never bypass or compromise database transactional integrity.
2. **Redis Non-Authoritative Role**: Redis remains an ephemeral cache and pub/sub transport. If Redis is down, system falls back to PostgreSQL (or fails closed for anti-tamper nonces in production as mandated by Phase 18).
3. **RabbitMQ Asynchronous Only**: Live media and synchronous REST calls bypass RabbitMQ; RabbitMQ is consumed solely by background workers.
4. **In-Process Mediasoup SFU**: The SFU media plane runs within the modular monolith backend process via native C++ child processes; it is not broken out into a separate microservice.
5. **Phase 15 S3 Evidence Boundary**: Evidence objects are uploaded directly to S3 via presigned URLs. LocalStack simulates S3 in local/CI environments using `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE`.
6. **Phase 18 Security Controls**: Helmet headers, CSP, CORS allowlisting, input sanitization, dynamic SQL allowlisting, cryptographic request signing, replay defense, and magic bytes verification remain fully active and enforced.
7. **Zero Database Migrations**: Phase 19 introduces exactly 0 database migrations.

---

## 6. Proposed Container Topologies

To eliminate ambiguity between development and production networking, Phase 19 explicitly defines two separate container topologies.

### 6.1 Local Development Topology (Hybrid Bridge-First with Host-Networked Coturn)

In local development, simplicity, port predictability, and developer ergonomics take precedence. The local environment utilizes a **hybrid bridge-first topology**:
- **Application & Data Services (`proctornet-net`)**: `frontend`, `backend`, `backend-migrate`, `postgres`, `redis`, `rabbitmq`, and `localstack` reside on the user-defined Docker bridge network (`proctornet-net`), utilizing container name DNS resolution (`http://backend:4000`, `postgres:5432`, `redis:6379`, `rabbitmq:5672`, `http://localstack:4566`).
- **Backend Media Port Forwarding**: WebRTC media UDP ports for `backend` are constrained to a restricted local development range (`40000–40050/udp`) mapped via Docker bridge port forwarding (`ports: - "40000-40050:40000-40050/udp"`), avoiding Docker userland bridge proxy exhaustion on developer workstations.
- **Host-Networked Coturn Media Relay**: `coturn` intentionally runs in host networking mode (`network_mode: "host"`). It binds directly to port `3478` (TCP/UDP) for STUN/TURN signaling and allocates relay ports in the range `49152–49250` (UDP). Coturn is not attached to `proctornet-net`, maintaining consistent daemon configuration between local development and production.
  - *Cross-Platform Host Networking Semantics & Caveats*: Host networking behavior differs between operating systems. Native Linux supports true host-network semantics where the container directly shares the host network namespace. On Docker Desktop (macOS and Windows/WSL2), Docker runs inside a virtualized Linux VM, meaning `network_mode: "host"` binds to the VM's network namespace rather than the host OS directly. For browser and client reachability, developers on macOS or Windows/WSL2 may require platform-specific host reachability configuration, and the documented `TURN_ANNOUNCED_HOST` and `MEDIA_ANNOUNCED_IP` overrides remain the standard mechanism for advertising reachable IP addresses or hostnames to WebRTC client browsers. This is a development-environment reachability caveat across virtualized Docker Desktop runtimes, not an architectural change; host-networked Coturn remains the authoritative Phase 19 architecture.
- **TURN ICE Endpoint Resolution & Client Reachability**: The backend Node.js process does not initiate network connections to Coturn; it generates ephemeral HMAC-SHA1 TURN credentials offline using the shared secret `TURN_STATIC_AUTH_SECRET`. The backend advertises `TURN_SERVER_URL` (`turn:${TURN_ANNOUNCED_HOST:-127.0.0.1}:3478`) to WebRTC client browsers during signaling for TURN relay discovery. For same-machine development where the browser runs on the host, `127.0.0.1` allows the browser to connect directly to the host-networked Coturn daemon on port 3478. When testing from external devices or remote browsers across a local area network (LAN), `127.0.0.1` is not remotely reachable; developers must configure `TURN_ANNOUNCED_HOST` in `.env` to the host machine's LAN IP address or resolvable hostname so the client browser can reach Coturn.
- **Mediasoup SFU ICE Media Endpoint Resolution & Client Reachability**: Direct WebRTC media transmission between client browsers and the backend's in-process mediasoup SFU worker pool occurs over direct UDP sockets published on the host (`40000–40050/udp`). The backend advertises `MEDIA_ANNOUNCED_IP` (`${MEDIA_ANNOUNCED_IP:-127.0.0.1}`) in ICE candidates sent to client browsers. For same-machine development where the browser runs on the development host, `127.0.0.1` allows the browser to route direct media packets to published host ports `40000–40050`. When testing from external devices or remote browsers across a local area network (LAN), `127.0.0.1` cannot be used to reach the development host; developers must configure `MEDIA_ANNOUNCED_IP` in `.env` to the development host machine's LAN IP address or resolvable hostname, and ensure the host firewall permits inbound UDP traffic across ports `40000–40050`. Both `TURN_SERVER_URL` (TURN relay discovery via `TURN_ANNOUNCED_HOST`) and `MEDIA_ANNOUNCED_IP` (direct SFU media transport) are client-advertised endpoints, and their loopback (`127.0.0.1`) defaults function strictly when the browser is executing on the same host as the Docker containers. The bridge-networked backend reaches database, cache, broker, and mock storage services directly via `proctornet-net` container names.

```
+----------------------------------------------------------------------------------------------------+
|                          LOCAL HOST (Hybrid Bridge-First Topology)                                 |
|                                                                                                    |
|   Local HTTP Ingress: :8080   Direct Media: 40000-40050/udp (${MEDIA_ANNOUNCED_IP}:40000-40050)   |
|          |                                                                        |                |
|   +------v------------------------------------------------------------------------+                |
|   |                       frontend Container (Nginx Unprivileged :8080)           |                |
|   |   - Serves React SPA static build (/usr/share/nginx/html)                     |                |
|   |   - Proxies /api/v1/*  --> http://backend:4000/api/v1/*                       |                |
|   |   - Proxies /ws        --> http://backend:4000/ws (HTTP/1.1 Upgrade)          |                |
|   +---------------------------------------+---------------------------------------+                |
|                                           |                                                        |
|                       (Internal Bridge Network: proctornet-net)                                    |
|                                           |                                                        |
|   +---------------------------------------v---------------------------------------+                |
|   |                       backend Container (Node.js 24 LTS :4000)                | <--------------+
|   |   - Express REST API & WebSocket Signaling Engine                             |  Bridge Port   |
|   |   - Outbox Poller & Background Evaluation Consumer Worker                     |  Forwarding:   |
|   |   - In-Process mediasoup SFU Worker Processes (C++ child procs)               |  40000-40050   |
|   |   - Advertised SFU Endpoint: ${MEDIA_ANNOUNCED_IP:-127.0.0.1}:40000-40050     |  (UDP Direct)  |
|   +-------+-----------------------+-----------------------+-----------------------+                |
|           |                       |                       |                       |                |
|   +-------v-------+       +-------v-------+       +-------v-------+       +-------v-------+        |
|   |   postgres    |       |     redis     |       |   rabbitmq    |       |  localstack   |        |
|   | (Postgres 16) |       |   (Redis 7)   |       |  (RabbitMQ)   |       |  (S3 Storage) |        |
|   |  Port: 5432   |       |  Port: 6379   |       |  Port: 5672   |       |  Port: 4566   |        |
|   +---------------+       +---------------+       +---------------+       +---------------+        |
|   (Named Volume:          (Named Volume:          (Named Volume:          (Named Volume:           |
|      pg_data)                redis_data)             rmq_data)               ls_data)              |
|                                                                                                    |
|   HOST-NETWORKED TURN RELAY (Independent of proctornet-net):                                       |
|   +--------------------------------------------------------------------------------------------+   |
|   |                         coturn Container (network_mode: "host")                            |   |
|   |   - STUN/TURN Signaling: 3478 TCP/UDP (Direct Host Socket Binding)                         |   |
|   |   - Relayed WebRTC RTP: 49152–49250 UDP (Direct Host Socket Allocation)                    |   |
|   |   - Protocol Healthcheck: turnutils_stunclient 127.0.0.1                                   |   |
|   |   - Client Advertised Endpoint: turn:${TURN_ANNOUNCED_HOST:-127.0.0.1}:3478                |   |
|   +--------------------------------------------------------------------------------------------+   |
+----------------------------------------------------------------------------------------------------+
```

### 6.2 Production AWS EC2 Topology (Bridge-Frontend with Host-Networked Media Backend)

In production on AWS EC2, the networking architecture balances high-throughput WebRTC media delivery with strict least-privilege container isolation:
- **Frontend / Nginx**: Runs on the dedicated Docker bridge network (`proctornet-net`). It publishes host ports `80:8080` (HTTP) and `443:8443` (HTTPS) via Docker bridge port forwarding. Inside the container, unprivileged Nginx (UID 101) binds to unprivileged ports `8080` and `8443`. The host Docker daemon handles binding to privileged ports `80` and `443` without granting root permissions to the container. It configures `extra_hosts: ["host.docker.internal:host-gateway"]` to route reverse-proxied traffic to the backend.
- **Backend (Modular Monolith)**: Runs with `network_mode: "host"`. This provides zero-overhead, line-rate UDP throughput for native `mediasoup-worker` processes across the 10,000 UDP port range (`40000–49999/udp`), eliminating Docker userland bridge proxy CPU/memory exhaustion.
- **Frontend -> Backend Connectivity Path**:
  The bridge-networked Nginx container reaches the host-networked backend via `http://host.docker.internal:4000/api/` and `http://host.docker.internal:4000/ws`. Docker maps `host.docker.internal` to the host's bridge gateway IP (e.g. `172.17.0.1` or `172.20.0.1`). The backend listens on port 4000, accepting incoming traffic from the bridge interface.
- **Backend Port 4000 Ingress Isolation (Strictly Internal)**:
  Port 4000 is **completely blocked from the public internet**:
  1. *AWS EC2 Security Group*: Has NO inbound rule for port 4000. All incoming packets from `0.0.0.0/0` targeting port 4000 are dropped at the AWS hypervisor firewall edge.
  2. *Host Firewall Defense-in-Depth (`iptables` / `ufw`)*: Inbound connections on port 4000 are rejected on the external public interface (`eth0`), permitting traffic only from `127.0.0.1` and the Docker bridge subnet (`172.16.0.0/12`).
- **Coturn**: Runs with `network_mode: "host"`. It binds public signaling port `3478` (TCP/UDP) and public media relay ports `49152–49250` (UDP).
- **Auxiliary Persistence (PostgreSQL, Redis, RabbitMQ)**: Run in isolated bridge containers (`proctornet-net`), with ports published **STRICTLY TO LOOPBACK**: `127.0.0.1:5432:5432`, `127.0.0.1:6379:6379`, `127.0.0.1:5672:5672`, `127.0.0.1:15672:15672`. The host-networked backend reaches them at `127.0.0.1:<port>`, while external ingress from `0.0.0.0/0` is physically blocked.

```
+----------------------------------------------------------------------------------------------------+
|                               PRODUCTION AWS EC2 HOST (Hybrid Topology)                            |
|                                                                                                    |
|  PUBLIC INGRESS:                                                                                   |
|  - TCP 80, 443                    (Nginx Edge via Bridge Port Forwarding 80:8080, 443:8443)        |
|  - TCP/UDP 3478                   (Coturn STUN/TURN Signaling via Host Mode)                       |
|  - UDP 40000–49999                (Mediasoup Direct WebRTC RTP Media Plane via Host Mode)          |
|  - UDP 49152–49250                (Coturn Relayed WebRTC RTP Media Plane via Host Mode)            |
|                                                                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  |             frontend Container (Nginx Unprivileged :8080 / :8443 on proctornet-net)          |  |
|  |   - Docker bridge maps Host 80 -> 8080 (HTTP redirect & ACME) & Host 443 -> 8443 (HTTPS)     |  |
|  |   - Terminates TLS via mounted Let's Encrypt certificates (/etc/letsencrypt)                 |  |
|  |   - Serves React SPA static assets (/usr/share/nginx/html)                                   |  |
|  |   - Proxies /api/v1/*  --> http://host.docker.internal:4000/api/v1/*                        |  |
|  |   - Proxies /ws        --> http://host.docker.internal:4000/ws (HTTP/1.1 Upgrade)            |  |
|  +----------------------------------------------+-----------------------------------------------+  |
|                                                 | (Docker host-gateway: bridge -> host:4000)       |
|  +----------------------------------------------v-----------------------------------------------+  |
|  |                      backend Service (Node.js 24 Host Network)                               |  |
|  |   - Listens on port 4000 (BLOCKED FROM PUBLIC INTERNET via SG & host firewall)                |  |
|  |   - Binds WebRTC Media Plane to 0.0.0.0:40000-49999/udp (Zero-copy native UDP)               |  |
|  |   - Outbox Poller & Background Evaluation Consumer Worker                                    |  |
|  |   - Spawns in-process mediasoup C++ worker pool                                              |  |
|  +------------------+---------------------------+---------------------------+-------------------+  |
|                     |                           |                           |                      |
|                     | (127.0.0.1 Loopback)      | (127.0.0.1 Loopback)      | (127.0.0.1 Loopback) |
|                     |                           |                           |                      |
|  +------------------v-----+   +-----------------v-----+   +-----------------v-----+                |
|  |       postgres         |   |         redis         |   |       rabbitmq        |                |
|  | (PostgreSQL 16 Alpine) |   |    (Redis 7 Alpine)   |   |   (RabbitMQ 3.13)     |                |
|  | Binds: 127.0.0.1:5432  |   | Binds: 127.0.0.1:6379 |   | Binds: 127.0.0.1:5672 |                |
|  | BLOCKED from 0.0.0.0   |   | BLOCKED from 0.0.0.0  |   | BLOCKED from 0.0.0.0  |                |
|  +------------------------+   +-----------------------+   +-----------------------+                |
|  (EBS Volume: pg_data)        (EBS Volume: redis_data)    (EBS Volume: rmq_data)                   |
+----------------------------------------------------------------------------------------------------+
```

---

## 7. Service Inventory

The platform defines distinct service manifests for Local/CI and Production AWS EC2 environments:
- **Local Development & CI Stack (`docker-compose.yml`)**: Defines **8 total Compose services** comprising **7 long-running runtime services** (`postgres`, `redis`, `rabbitmq`, `localstack`, `coturn`, `backend`, `frontend`) and **1 one-shot initialization runner** (`backend-migrate`). Each long-running service runs continuously and reaches its verified `healthy` state, while `backend-migrate` executes the complete committed migration chain and exits with code 0 (`service_completed_successfully`).
- **Production AWS EC2 Stack (`infrastructure/docker-compose.prod.yml`)**: Defines **7 total Compose services** comprising **6 long-running runtime services** (`postgres`, `redis`, `rabbitmq`, `coturn`, `backend`, `frontend`) and **1 one-shot initialization runner** (`backend-migrate`). `localstack` is excluded because production targets real AWS S3 via EC2 IAM credentials. Each of the 6 long-running production services reaches its verified `healthy` state, while `backend-migrate` executes the complete committed migration chain and exits with code 0 before `backend` boots.

| Service Name | Container Image | Base Image | Run User | Network Mode (Prod) | Exposed Ports (Prod) | Persistent Storage | Purpose & Startup Contract |
|---|---|---|---|---|---|---|---|
| **`frontend`** | `proctornet-frontend:<tag>` | `nginxinc/nginx-unprivileged:alpine` | `nginx` (UID 101) | Bridge (`proctornet-net`) | Public: `80:8080`, `443:8443` | None (Stateless) | Serves React SPA; terminates TLS (443); redirects HTTP (80->443); reverse proxies to backend via host-gateway. Starts and routes traffic only after `backend` is `healthy`. |
| **`backend`** | `proctornet-backend:<tag>` | `node:24-bookworm-slim` | `node` (UID 1000) | `host` | Internal: `4000` (host-gateway/loopback; BLOCKED from `0.0.0.0/0`)<br>Public: `40000-49999/udp` | None (Stateless) | Monolith API, WebSockets, Outbox, Evaluation Worker, Mediasoup SFU. Starts ONLY after `backend-migrate` completes successfully (`condition: service_completed_successfully`). |
| **`backend-migrate`** | `proctornet-backend:<tag>` | `node:24-bookworm-slim` | `node` (UID 1000) | `host` | None | None | One-shot init container executing `node src/infrastructure/postgres/migrate.js up` against committed migration chain. Starts ONLY after `postgres` is `healthy`; exits with code 0 before `backend` boots. |
| **`postgres`** | `postgres:16.4-alpine` | Alpine Linux | `postgres` (UID 70) | Bridge (`proctornet-net`) | Internal: `127.0.0.1:5432:5432` | `pg_data:/var/lib/postgresql/data` | Authoritative transactional relational database. Core dependency for `backend-migrate`. |
| **`redis`** | `redis:7.4-alpine` | Alpine Linux | `redis` (UID 999) | Bridge (`proctornet-net`) | Internal: `127.0.0.1:6379:6379` | `redis_data:/data` | Ephemeral session cache, rate-limiting tokens, pub/sub. Core dependency for `backend`. |
| **`rabbitmq`** | `rabbitmq:3.13.7-management-alpine`| Alpine Linux | `rabbitmq` (UID 100) | Bridge (`proctornet-net`) | Internal: `127.0.0.1:5672:5672`, `127.0.0.1:15672:15672` | `rmq_data:/var/lib/rabbitmq` | Asynchronous worker message broker and dead-letter queues. Core dependency for `backend`. |
| **`localstack`** | `localstack/localstack:3.7` | Linux | `localstack` | Bridge (`proctornet-net`) | Internal: `127.0.0.1:4566:4566` (local only) | `ls_data:/var/lib/localstack` | Local/CI AWS S3 emulation for evidence upload/playback. Core dependency for `backend` in local/CI. Excluded in production. |
| **`coturn`** | `coturn/coturn:4.6.2-alpine` | Alpine Linux | `turnserver` | `host` | Public: `3478:3478/tcp+udp`, `49152-49250:49152-49250/udp` | None | STUN/TURN media relay server for NAT traversal. Runs in host mode with continuous protocol health check (`turnutils_stunclient 127.0.0.1`). |

---

## 8. Dockerfile Strategy

### 8.1 Backend Dockerfile (`backend/Dockerfile`)

**Rationale for Base Image (`node:24-bookworm-slim`)**:
`mediasoup` compiles native C++ binaries targeting `libuv` and native Linux network primitives. Alpine's `musl` libc introduces intermittent compatibility and performance issues with C++ multithreading in `mediasoup-worker`. `node:24-bookworm-slim` uses GNU `glibc`, providing 100% native stability while maintaining a compact image footprint (~180 MB).

**Deterministic Dependency & Native Build Strategy**:
To guarantee that devDependencies (such as test frameworks, linters, and mocking utilities) never leak into the production runtime image while preserving compiled native C++ `mediasoup-worker` binaries:
1. **Dependency Installation**: `RUN npm ci` is executed in the `builder` stage, installing all dependencies against the locked `package-lock.json`.
2. **Native Mediasoup Compilation**: During `npm ci`, `mediasoup`'s install script compiles the native C++ binary (`mediasoup-worker`) inside the `builder` stage where `python3`, `make`, and `g++` are installed.
3. **Deterministic DevDependency Pruning**: Immediately following build/compilation, `RUN npm prune --omit=dev` is executed in the `builder` stage. This removes all `devDependencies` from `node_modules` while leaving pre-compiled native binaries and production modules completely intact.
4. **Runtime Copy**: The `runner` stage copies strictly the pruned `node_modules` directory from the `builder` stage: `COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules`. No compiler tools (`g++`, `make`, `python3`) are copied or installed into the runtime stage.
5. **CI Verification**: CI executes a deterministic gate verifying that dev-only packages (`vitest`, `supertest`, `c8`) fail to resolve inside the runtime image:
   `docker run --rm <image> node -e "const devPkgs=['vitest','supertest','c8']; for (const p of devPkgs) { try { require(p); console.error('DEV DEP LEAK:', p); process.exit(1); } catch (e) {} } process.exit(0);"`

```dockerfile
# ==============================================================================
# Stage 1: Build Stage (compiles native dependencies and mediasoup C++ worker)
# ==============================================================================
FROM node:24-bookworm-slim AS builder

WORKDIR /usr/src/app

# Install native build tools required for mediasoup-worker compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (triggers mediasoup C++ worker native compilation)
RUN npm ci

# Deterministically prune devDependencies, keeping only production dependencies
# and the compiled native mediasoup-worker binary in node_modules
RUN npm prune --omit=dev

# ==============================================================================
# Stage 2: Production Runtime Stage (minimal, secure, unprivileged)
# ==============================================================================
FROM node:24-bookworm-slim AS runner

WORKDIR /usr/src/app

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=4000

# Install runtime dependencies if necessary and clean apt cache
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests and strictly pruned production dependencies
COPY --chown=node:node package*.json ./
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node src ./src
COPY --chown=node:node migrations ./migrations

# Enforce non-root execution
USER node

# Expose HTTP API / WebSocket port and WebRTC UDP media port range
EXPOSE 4000
EXPOSE 40000-49999/udp

# Node-native lightweight health check (avoids installing curl in production image)
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Start the application server
CMD ["node", "src/server.js"]
```

### 8.2 Frontend Dockerfile (`frontend/Dockerfile`)

**Rationale for Multi-Stage Architecture**:
The React frontend requires Node.js only at build time. Serving the pre-compiled static assets via `nginxinc/nginx-unprivileged:alpine` yields an immutable container image of ~25 MB, zero Node.js runtime vulnerabilities, and high-performance static asset caching. The unprivileged Nginx process runs as UID 101 (`nginx`), binding to non-privileged ports `8080` (HTTP) and `8443` (HTTPS) inside the container. Docker bridge port mapping binds host ports `80` and `443` to container ports `8080` and `8443` without requiring root privileges or Linux capabilities.

```dockerfile
# ==============================================================================
# Stage 1: Frontend Build Stage
# ==============================================================================
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency manifests
COPY package*.json ./
RUN npm ci

# Copy source code and build config
COPY . .

# Compile production bundle into dist/
RUN npm run build

# ==============================================================================
# Stage 2: Static Delivery & TLS Reverse Proxy via Unprivileged Nginx
# ==============================================================================
FROM nginxinc/nginx-unprivileged:alpine AS runner

# Create mount points for Let's Encrypt certificates and Certbot ACME webroot
USER root
RUN mkdir -p /etc/letsencrypt /var/www/certbot /usr/share/nginx/html && \
    chown -R nginx:nginx /var/www/certbot /usr/share/nginx/html
USER nginx

# Copy custom Nginx configuration
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder
COPY --from=builder --chown=nginx:nginx /usr/src/app/dist /usr/share/nginx/html

# Expose unprivileged HTTP (8080) and HTTPS (8443) ports
EXPOSE 8080 8443

# Healthcheck verifying Nginx is responsive on HTTP/HTTPS
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8080/.well-known/acme-challenge/ || wget -q -O /dev/null --no-check-certificate https://localhost:8443/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

### 8.3 Frontend Nginx Reverse Proxy & TLS Configuration (`frontend/nginx/default.conf`)

The Nginx configuration defines two complete virtual hosts:
1. **HTTP Listener (Port 8080)**: Handles Let's Encrypt ACME HTTP-01 challenge requests, and permanently redirects (HTTP 301) all other traffic to HTTPS.
2. **HTTPS Listener (Port 8443)**: Terminates TLS using Let's Encrypt certificates mounted read-only from the host, enforces modern TLS ciphers and HSTS, serves React SPA static assets, and proxies `/api/` and `/ws` to `http://host.docker.internal:4000`.

```nginx
# ==============================================================================
# 1. HTTP Listener — ACME Challenge & Permanent HTTPS Redirect
# ==============================================================================
server {
    listen 8080;
    server_name _;

    # ACME HTTP-01 Challenge handling for Certbot
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        allow all;
    }

    # Redirect all other HTTP traffic to HTTPS permanently
    location / {
        return 301 https://$host$request_uri;
    }
}

# ==============================================================================
# 2. HTTPS Listener — TLS Termination & Application Reverse Proxy
# ==============================================================================
server {
    listen 8443 ssl;
    server_name _;

    # TLS Certificates (mounted read-only from host /etc/letsencrypt)
    ssl_certificate /etc/letsencrypt/live/proctornet/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proctornet/privkey.pem;

    # Modern TLS Protocols & Cipher Suite (Intermediate Profile)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # HSTS (Strict-Transport-Security, 1 year)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Security Headers (Defense-in-depth matching Phase 18)
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()" always;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
    gzip_min_length 1024;

    # SPA Client Routing: fallback all non-file routes to index.html
    location / {
        try_files $uri $uri/ /index.html;
        expires -1;
    }

    # Static Assets Caching (immutable Vite chunks)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # REST API Reverse Proxy (routed to backend on host via Docker host-gateway)
    location /api/ {
        proxy_pass http://host.docker.internal:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # WebSocket Realtime Gateway Reverse Proxy (routed to backend on host via host-gateway)
    location /ws {
        proxy_pass http://host.docker.internal:4000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

---

## 9. Compose / Local Integration Strategy

### 9.1 Root `docker-compose.yml` (Local Development)

```yaml
version: '3.8'

networks:
  proctornet-net:
    driver: bridge

volumes:
  pg_data:
  redis_data:
  rmq_data:
  localstack_data:

services:
  postgres:
    image: postgres:16.4-alpine
    container_name: proctornet-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      POSTGRES_DB: ${DB_NAME:-proctornet}
    ports:
      - "${DB_PORT:-5432}:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - proctornet-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres} -d ${DB_NAME:-proctornet}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7.4-alpine
    container_name: proctornet-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data
    networks:
      - proctornet-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  rabbitmq:
    image: rabbitmq:3.13.7-management-alpine
    container_name: proctornet-rabbitmq
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-guest}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:-guest}
    ports:
      - "${RABBITMQ_PORT:-5672}:5672"
      - "15672:15672"
    volumes:
      - rmq_data:/var/lib/rabbitmq
    networks:
      - proctornet-net
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  localstack:
    image: localstack/localstack:3.7
    container_name: proctornet-localstack
    restart: unless-stopped
    environment:
      - SERVICES=s3
      - DEFAULT_REGION=ap-south-1
      - AWS_DEFAULT_REGION=ap-south-1
    ports:
      - "4566:4566"
    volumes:
      - localstack_data:/var/lib/localstack
      - ./infrastructure/localstack/init-s3.sh:/etc/localstack/init/ready.d/init-s3.sh
    networks:
      - proctornet-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4566/_localstack/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  coturn:
    image: coturn/coturn:4.6.2-alpine
    container_name: proctornet-coturn
    restart: unless-stopped
    network_mode: "host"
    command:
      - -n
      - --log-file=stdout
      - --lt-cred-mech
      - --fingerprint
      - --no-tls
      - --no-dtls
      - --realm=proctornet.local
      - --static-auth-secret=${TURN_STATIC_AUTH_SECRET:-proctornet-static-turn-secret-32-chars}
      - --listening-port=3478
      - --min-port=49152
      - --max-port=49250
    healthcheck:
      test: ["CMD-SHELL", "turnutils_stunclient 127.0.0.1 > /dev/null 2>&1 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s

  backend-migrate:
    build:
      context: ./backend
      target: runner
    container_name: proctornet-migrate
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      DATABASE_URL: postgresql://${DB_USER:-postgres}:${DB_PASSWORD:-postgres}@postgres:5432/${DB_NAME:-proctornet}
    command: ["node", "src/infrastructure/postgres/migrate.js", "up"]
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - proctornet-net

  backend:
    build:
      context: ./backend
      target: runner
    container_name: proctornet-backend
    restart: unless-stopped
    init: true
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      PORT: 4000
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME:-proctornet}
      DB_USER: ${DB_USER:-postgres}
      DB_PASSWORD: ${DB_PASSWORD:-postgres}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      RABBITMQ_HOST: rabbitmq
      RABBITMQ_PORT: 5672
      RABBITMQ_USER: ${RABBITMQ_USER:-guest}
      RABBITMQ_PASSWORD: ${RABBITMQ_PASSWORD:-guest}
      S3_ENDPOINT: http://localstack:4566
      S3_FORCE_PATH_STYLE: "true"
      S3_BUCKET_NAME: ${S3_BUCKET_NAME:-proctornet-evidence-dev-01}
      AWS_REGION: ap-south-1
      AWS_ACCESS_KEY_ID: test
      AWS_SECRET_ACCESS_KEY: test
      MEDIA_LISTEN_IP: "0.0.0.0"
      MEDIA_ANNOUNCED_IP: ${MEDIA_ANNOUNCED_IP:-127.0.0.1}
      MEDIA_MIN_PORT: 40000
      MEDIA_MAX_PORT: 40050
      TURN_SERVER_URL: "turn:${TURN_ANNOUNCED_HOST:-127.0.0.1}:3478"
      TURN_STATIC_AUTH_SECRET: ${TURN_STATIC_AUTH_SECRET:-proctornet-static-turn-secret-32-chars}
      ANTI_TAMPER_SECRET: ${ANTI_TAMPER_SECRET:-proctornet-dev-jwt-access-secret-32-chars-long}
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:-proctornet-dev-jwt-access-secret-32-chars-long}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-proctornet-dev-jwt-refresh-secret-32-chars-long}
      CORS_ALLOWED_ORIGINS: "http://localhost:8080,http://localhost:3000,http://localhost:5173"
    ports:
      - "4000:4000"
      - "40000-40050:40000-40050/udp"
    depends_on:
      backend-migrate:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
      localstack:
        condition: service_healthy
    networks:
      - proctornet-net
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:4000/ready', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"]
      interval: 10s
      timeout: 5s
      retries: 5

  frontend:
    build:
      context: ./frontend
      target: runner
    container_name: proctornet-frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT:-8080}:8080"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - proctornet-net
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://localhost:8080/"]
      interval: 10s
      timeout: 3s
      retries: 3
```

### 9.2 Production Compose (`infrastructure/docker-compose.prod.yml`)

The production Compose file enforces strict fail-closed credentials (zero development fallbacks) and host networking:

```yaml
version: '3.8'

networks:
  proctornet-net:
    driver: bridge

volumes:
  pg_data:
  redis_data:
  rmq_data:

services:
  postgres:
    image: postgres:16.4-alpine
    container_name: proctornet-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER:?DB_USER is required}
      POSTGRES_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD is required}
      POSTGRES_DB: ${DB_NAME:?DB_NAME is required}
    ports:
      - "127.0.0.1:5432:5432" # Bind strictly to loopback
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - proctornet-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7.4-alpine
    container_name: proctornet-redis
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD:?REDIS_PASSWORD is required}", "--appendonly", "yes"]
    ports:
      - "127.0.0.1:6379:6379" # Bind strictly to loopback
    volumes:
      - redis_data:/data
    networks:
      - proctornet-net
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  rabbitmq:
    image: rabbitmq:3.13.7-management-alpine
    container_name: proctornet-rabbitmq
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:?RABBITMQ_USER is required}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:?RABBITMQ_PASSWORD is required}
    ports:
      - "127.0.0.1:5672:5672" # Bind strictly to loopback
      - "127.0.0.1:15672:15672"
    volumes:
      - rmq_data:/var/lib/rabbitmq
    networks:
      - proctornet-net
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  coturn:
    image: coturn/coturn:4.6.2-alpine
    container_name: proctornet-coturn
    restart: unless-stopped
    network_mode: "host"
    command:
      - -n
      - --log-file=stdout
      - --lt-cred-mech
      - --fingerprint
      - --realm=${DOMAIN_NAME:?DOMAIN_NAME is required}
      - --static-auth-secret=${TURN_STATIC_AUTH_SECRET:?TURN_STATIC_AUTH_SECRET is required}
      - --listening-port=3478
      - --min-port=49152
      - --max-port=49250
      - --external-ip=${MEDIA_ANNOUNCED_IP:?MEDIA_ANNOUNCED_IP is required}
    healthcheck:
      test: ["CMD-SHELL", "turnutils_stunclient 127.0.0.1 > /dev/null 2>&1 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s

  backend-migrate:
    image: ${BACKEND_IMAGE:?BACKEND_IMAGE is required}
    container_name: proctornet-migrate
    network_mode: "host"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
    command: ["node", "src/infrastructure/postgres/migrate.js", "up"]
    depends_on:
      postgres:
        condition: service_healthy

  backend:
    image: ${BACKEND_IMAGE:?BACKEND_IMAGE is required}
    container_name: proctornet-backend
    restart: unless-stopped
    network_mode: "host"
    init: true
    stop_grace_period: 15s
    depends_on:
      backend-migrate:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 4000
      DB_HOST: 127.0.0.1
      DB_PORT: 5432
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS_HOST: 127.0.0.1
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      RABBITMQ_HOST: 127.0.0.1
      RABBITMQ_PORT: 5672
      RABBITMQ_USER: ${RABBITMQ_USER}
      RABBITMQ_PASSWORD: ${RABBITMQ_PASSWORD}
      S3_BUCKET_NAME: ${S3_BUCKET_NAME:?S3_BUCKET_NAME is required}
      AWS_REGION: ${AWS_REGION:-ap-south-1}
      MEDIA_LISTEN_IP: "0.0.0.0"
      MEDIA_ANNOUNCED_IP: ${MEDIA_ANNOUNCED_IP:?MEDIA_ANNOUNCED_IP is required}
      MEDIA_MIN_PORT: 40000
      MEDIA_MAX_PORT: 49999
      TURN_SERVER_URL: "turn:${MEDIA_ANNOUNCED_IP}:3478"
      TURN_STATIC_AUTH_SECRET: ${TURN_STATIC_AUTH_SECRET}
      ANTI_TAMPER_SECRET: ${ANTI_TAMPER_SECRET:?ANTI_TAMPER_SECRET is required}
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:?JWT_ACCESS_SECRET is required}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET is required}
      METRICS_AUTH_TOKEN: ${METRICS_AUTH_TOKEN:?METRICS_AUTH_TOKEN is required}
      CORS_ALLOWED_ORIGINS: "https://${DOMAIN_NAME}"
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:4000/ready', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"]
      interval: 10s
      timeout: 5s
      retries: 5

  frontend:
    image: ${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}
    container_name: proctornet-frontend
    restart: unless-stopped
    networks:
      - proctornet-net
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "80:8080"
      - "443:8443"
    depends_on:
      backend:
        condition: service_healthy
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/www/certbot:/var/www/certbot:ro
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://localhost:8080/.well-known/acme-challenge/ || wget -q -O /dev/null --no-check-certificate https://localhost:8443/ || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 3
```

---

## 10. CI Pipeline Design (`.github/workflows/ci.yml`)

The CI pipeline runs automatically on all Pull Requests and pushes to `main`. It enforces strict quality, correctness, and security gates.

```
+---------------------------------------------------------------------------------------------+
|                                    GitHub Actions CI Pipeline                               |
|                                                                                             |
|   +-----------------------+     +-----------------------+     +-----------------------+     |
|   |   lint-and-validate   |     |    test-frontend      |     |    build-frontend     |     |
|   |   - Schema checks     |     |    - Vitest (63/63)   |     |    - Vite compile     |     |
|   |   - Env validations   |     |                       |     |    - Bundle bounds    |     |
|   +-----------+-----------+     +-----------+-----------+     +-----------+-----------+     |
|               |                             |                             |                 |
|   +-----------v-----------------------------v-----------------------------v-----------+     |
|   |                                   test-backend                                    |     |
|   |   - Services: PostgreSQL 16.4, Redis 7.4, RabbitMQ 3.13, LocalStack S3            |     |
|   |   - Run complete committed migration chain: npm run db:migrate                    |     |
|   |   - Node.js test runner: npm test (750/750 tests pass)                            |     |
|   +---------------------------------------+-------------------------------------------+     |
|                                           |                                                 |
|   +---------------------------------------v-------------------------------------------+     |
|   |                               docker-build-verify                                 |     |
|   |   - Build backend & frontend Docker images via Buildx                             |     |
|   |   - Spin up local docker-compose stack (7 runtime services + 1 migration service) |     |
|   |   - Poll /ready healthcheck until 200 OK                                          |     |
|   |   - Graceful docker compose down                                                  |     |
|   +---------------------------------------+-------------------------------------------+     |
|                                           |                                                 |
|   +---------------------------------------v-------------------------------------------+     |
|   |                                 security-audit                                    |     |
|   |   - Dependency audit: npm audit --omit=dev (0 vulnerabilities)                    |     |
|   |   - Trivy container image security scan (Deterministic policy)                    |     |
|   +-----------------------------------------------------------------------------------+     |
+---------------------------------------------------------------------------------------------+
```

### Detailed CI Workflow Steps:

1. **`lint-and-validate`**:
   - Checks node engine compatibility (`>=24.0.0`).
   - Validates that zero migrations have duplicate numeric prefixes.
   - Validates `.env.example` contains all variables declared in `backend/src/config/env.js`.
2. **`test-frontend`**:
   - Node 24 on `ubuntu-latest`.
   - Caches `~/.npm`.
   - Runs `npm ci` in `frontend/`.
   - Runs `npm test` (asserts all 63 Vitest tests pass).
3. **`build-frontend`**:
   - Runs `npm run build` in `frontend/`.
   - Validates generated `dist/index.html` exists and assets are properly fingerprinted.
4. **`test-backend`**:
   - GitHub Actions service containers:
     - `postgres:16.4-alpine` with health check.
     - `redis:7.4-alpine` with health check.
     - `rabbitmq:3.13.7-management-alpine` with health check.
     - `localstack/localstack:3.7` with health check.
   - Executes `npm run db:migrate` to verify clean schema instantiation across the complete committed migration chain.
   - Executes `npm test` (`node --test --test-concurrency=1`) asserting all 750 tests pass with 0 failures.
5. **`docker-build-verify`**:
   - Validates multi-stage builds on `ubuntu-latest` using `docker buildx`.
   - Executes `docker compose -f docker-compose.yml up -d` against the local development stack.
   - Verifies that all 7 long-running runtime services (`postgres`, `redis`, `rabbitmq`, `localstack`, `coturn`, `backend`, `frontend`) achieve `healthy` status and `backend-migrate` completes successfully with exit code 0 before `backend` starts.
   - Polls `http://localhost:4000/ready` for up to 60s until status `READY` (HTTP 200).
   - Validates `http://localhost:8080/` returns HTTP 200 with React bundle HTML.
   - Executes `docker compose down -v`.
6. **`security-audit`**:
   - Executes `npm audit --omit=dev` in `backend` and `frontend`.
   - Executes `aquasecurity/trivy-action` scanning backend and frontend images under the deterministic vulnerability policy.
7. **`runtime-image-dependency-verify`**:
   - Executes an automated assertion verifying that devDependencies are strictly excluded from the built production backend image:
     ```bash
     docker run --rm proctornet-backend:ci-test node -e "const devOnly=['vitest','supertest','c8']; for (const p of devOnly) { try { require(p); console.error('DEV DEP LEAK IN PROD IMAGE:', p); process.exit(1); } catch (e) {} } process.exit(0);"
     ```
   - Fails the build immediately if any development or test module is resolvable in the runtime container.

---

## 11. Continuous Delivery & Deployment Design

### 11.1 Deployment Artifact Packaging & Image Identity Model

- **Git-Commit-Addressed Deployment Tags**:
  Release images are tagged with the Git commit SHA:
  - `proctornet-backend:sha-<commit>`
  - `proctornet-frontend:sha-<commit>`
- **Precise Image Identity vs Tag Mutability**:
  - *Git Commit SHA Tag*: Serves as a human-traceable deployment label establishing provenance between the runtime artifact and the source repository revision. By default in OCI registries, tags are mutable pointers unless registry tag immutability is configured as an operational policy (e.g. AWS ECR Tag Immutability).
  - *Image Digest*: The SHA-256 content-addressable hash (`proctornet-backend@sha256:...`) is the actual, cryptographically immutable identity of the image manifest.
  - *Registry Tag Immutability*: Operational policy enforced at the container registry level (GHCR / AWS ECR) to prevent overwriting tags once published.

### 11.2 Host Deployment Workflow & Script (`infrastructure/deploy.sh`)

#### Startup Dependency Ordering vs. Deployment Replacement Workflow
The platform strictly distinguishes between the stack's **initial Compose startup dependency chain** and the host's **deployment replacement sequence**:
- **Initial Compose Startup Dependency Order**:
  Enforced by Compose `depends_on` conditions when bootstrapping the stack from a cold stop:
  ```
  postgres (service_healthy) → backend-migrate (service_completed_successfully / exit code 0) → backend (service_healthy on /ready) → frontend (running)
  ```
- **Deployment Replacement Workflow (`deploy.sh`)**:
  Executed when updating an already-running single-host production stack with newly pulled container images:
  ```
  pull images → execute schema migrations (backend-migrate) → replace frontend container → replace backend container → verify backend readiness probe
  ```
  The script intentionally invokes `docker compose up -d --no-deps frontend` and `docker compose up -d --no-deps backend`. The `--no-deps` flag prevents Docker Compose from re-evaluating or restarting upstream dependency containers (`postgres`, `redis`, `rabbitmq`), ensuring targeted, isolated container replacement.
  - **Migration-before-backend replacement**: Schema migrations run to completion via `backend-migrate` before the backend container is recreated, preventing runtime schema mismatches.
  - **Stateless frontend replacement**: Replaces the static Nginx/SPA container. Single-container recreation may introduce a brief serving interruption; the interruption duration is environment-dependent and must be measured during deployment verification.
  - **Graceful backend replacement & readiness verification**: Replaces the backend container and continuously polls `http://127.0.0.1:4000/ready` until confirmed ready.

```bash
#!/usr/bin/env bash
set -euo pipefail

# ProctorNet EC2 Host Deployment Script
COMPOSE_FILE="/opt/proctornet/docker-compose.prod.yml"
ENV_FILE="/opt/proctornet/.env"

echo "==> [1/5] Pulling latest production container images..."
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" pull

echo "==> [2/5] Executing database schema migrations..."
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm backend-migrate

echo "==> [3/5] Executing stateless frontend container replacement..."
# Note: On a single EC2 host without multiple active serving instances or an external load balancer,
# single-container frontend replacement may introduce a brief serving interruption during container recreation.
# The interruption duration is environment-dependent and must be measured during deployment verification.
# True zero-downtime frontend replacement requires overlapping container replicas or an external load balancer, which is outside Phase 19 scope.
# The --no-deps flag is intentionally used so Compose startup dependencies are not re-executed during targeted replacement.
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps frontend

echo "==> [4/5] Executing graceful single-instance backend replacement..."
# Note: On a single EC2 host without multiple active serving instances, backend container
# replacement causes a graceful restart (~2-5s) while client WebSocket/media connections reconnect.
# The --no-deps flag is intentionally used so Compose startup dependencies are not re-executed during targeted replacement.
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps backend

echo "==> [5/5] Verifying system readiness probe..."
for i in {1..30}; do
  if curl -sf http://127.0.0.1:4000/ready | grep -q '"status":"READY"'; then
    echo "==> Deployment SUCCESS: ProctorNet backend is READY."
    exit 0
  fi
  echo "Waiting for readiness probe (attempt $i/30)..."
  sleep 2
done

echo "==> Deployment FAILED: Backend failed to achieve readiness."
exit 1
```

### 11.3 Production TLS Certificate Lifecycle (Certbot & Let's Encrypt)

1. **ACME Protocol & CA**:
   TLS certificates are issued by Let's Encrypt using the standard ACME HTTP-01 challenge protocol.
2. **Certbot Execution Model (Native EC2 Host)**:
   Certbot runs natively on the EC2 host (installed via `snap install --classic certbot`), avoiding circular container dependencies during initial bootstrapping.
3. **Initial Certificate Issuance**:
   Prior to initial HTTPS launch, the host provisions the certificate using the webroot plugin:
   ```bash
   sudo certbot certonly --webroot -w /var/www/certbot \
     -d "${DOMAIN_NAME}" \
     --agree-tos -m "${ADMIN_EMAIL}" --non-interactive
   ```
4. **ACME HTTP-01 Challenge Handling**:
   - Certbot writes validation tokens to `/var/www/certbot/.well-known/acme-challenge/`.
   - The `frontend` container mounts `/var/www/certbot:/var/www/certbot:ro`.
   - Nginx serves the challenge path directly from disk on port 8080 (mapped from host port 80).
5. **Certificate Storage & Container Mounts**:
   - Host stores certificates at `/etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem` and `privkey.pem`.
   - Mounted read-only into the Nginx container: `/etc/letsencrypt:/etc/letsencrypt:ro`.
6. **Strict File Ownership & Non-World-Readable Key Permissions**:
   - **Root Ownership**: All certificate files and directories under `/etc/letsencrypt` are created and owned by `root`.
   - **Dedicated Nginx Group (GID 101)**: The unprivileged Nginx container runs as UID 101 with primary GID 101 (`nginx`). On the EC2 host, GID 101 (or group `proctornet-certs` with GID 101) is assigned group ownership of the certificate archive directory and private keys.
   - **Private Key Mode 0640 (`-rw-r-----`)**: Private keys (`privkey*.pem`) are strictly set to mode `0640`, readable only by `root` and members of GID 101 (`nginx`).
   - **Prohibition of World-Readable Mode 0644**: Setting private keys to mode `0644` (`-rw-r--r--`) is **strictly prohibited**. World-readable private keys expose cryptographic identity to any unprivileged process, adjacent container, or local user on the host system, violating core security hardening invariants.
   - **Public Certificate Permissions**: Public certificate chains (`fullchain*.pem`, `cert*.pem`, `chain*.pem`) contain non-sensitive public material and use mode `0644`.
   - **Host Setup Commands**:
     ```bash
     sudo chown -R root:101 /etc/letsencrypt/archive /etc/letsencrypt/live
     sudo chmod 0750 /etc/letsencrypt/archive /etc/letsencrypt/live
     sudo chmod 0644 /etc/letsencrypt/archive/*/fullchain*.pem /etc/letsencrypt/archive/*/cert*.pem
     sudo chmod 0640 /etc/letsencrypt/archive/*/privkey*.pem
     ```
7. **Automated Certificate Renewal & In-Memory Nginx Reload**:
   - Managed via the host `certbot.timer` systemd unit running twice daily.
   - To guarantee that renewed private keys inherit the secure `0640` / GID 101 permission model upon renewal, the automated renewal deploy hook at `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` enforces permissions before reloading Nginx:
     ```bash
     #!/bin/sh
     # Re-assert secure group ownership and 0640 mode on newly written key files
     chown -R root:101 /etc/letsencrypt/archive /etc/letsencrypt/live
     chmod 0750 /etc/letsencrypt/archive /etc/letsencrypt/live
     chmod 0640 /etc/letsencrypt/archive/*/privkey*.pem
     chmod 0644 /etc/letsencrypt/archive/*/fullchain*.pem
     # Gracefully reload Nginx workers in-memory without connection drops
     docker compose -f /opt/proctornet/docker-compose.prod.yml exec -T frontend nginx -s reload
     ```
8. **TLS Deployment Verification Tests**:
   - Verify private key is readable by unprivileged Nginx:
     `docker compose -f /opt/proctornet/docker-compose.prod.yml exec -T frontend test -r /etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem` (asserts exit code 0).
   - Verify private key is NOT world-readable on host:
     `stat -c %a /etc/letsencrypt/archive/*/privkey1.pem | grep -q "^640$"` (asserts exact 0640 mode; fails if world-readable).
   - Verify HTTP-to-HTTPS redirect:
     `curl -Iv http://${DOMAIN_NAME}/` -> asserts `HTTP/1.1 301 Moved Permanently` with `Location: https://${DOMAIN_NAME}/`.
   - Verify HTTPS termination & cipher negotiation:
     `curl -Iv https://${DOMAIN_NAME}/` -> asserts `HTTP/2` or `HTTP/1.1 200 OK`, valid TLS 1.3 handshake, and presence of `Strict-Transport-Security`.
   - Verify ACME challenge directory accessibility:
     `curl -f http://${DOMAIN_NAME}/.well-known/acme-challenge/test.txt`.

---

## 12. AWS EC2 Deployment Topology

### 12.1 Target Host Sizing & OS
- **Instance Type**: `t3.xlarge` (4 vCPUs, 16 GB RAM) for staging/low concurrency; `c6i.xlarge` (4 vCPUs, 8 GB RAM, compute optimized) or `c6i.2xlarge` (8 vCPUs, 16 GB RAM) for high-stakes exam delivery.
- **Operating System**: Ubuntu 24.04 LTS x86_64.
- **Disk Storage**: 50 GB General Purpose SSD (gp3) EBS root volume; 100 GB gp3 data volume mounted at `/opt/proctornet/data` for persistent PostgreSQL, Redis, and RabbitMQ container mounts.

### 12.2 Host Port & Security Group Layout

| Port Range | Protocol | Source | Destination | Purpose | Exposure Classification |
|---|---|---|---|---|---|
| **`80`** | TCP | `0.0.0.0/0` | Host (Docker bridge maps 80:8080) | HTTP ingress (ACME challenge & permanent HTTPS redirect). | **Public** |
| **`443`** | TCP | `0.0.0.0/0` | Host (Docker bridge maps 443:8443) | HTTPS ingress (TLS terminated by unprivileged Nginx). | **Public** |
| **`3478`** | TCP/UDP | `0.0.0.0/0` | Host / Coturn | Coturn STUN/TURN signaling & allocation binding. | **Public** |
| **`40000–49999`** | UDP | `0.0.0.0/0` | Host / Backend Mediasoup | Direct candidate & proctor WebRTC RTP media streams. | **Public** |
| **`49152–49250`** | UDP | `0.0.0.0/0` | Host / Coturn Relay | Coturn relayed WebRTC RTP media packets for firewalled candidates. | **Public** |
| **`22`** | TCP | Admin Bastion / VPN Only | Host SSH | Administrative access. | **Restricted Admin** |
| **`4000`** | TCP | **BLOCKED** | Host / Backend (via host-gateway) | Backend HTTP REST API and WebSocket gateway. Reachable ONLY via Nginx proxy over host-gateway / loopback. | **Internal Only (Blocked from Public)** |
| **`5432`** | TCP | **BLOCKED** | Host Loopback (`127.0.0.1`) | PostgreSQL database connection pool. | **Internal Loopback Only** |
| **`6379`** | TCP | **BLOCKED** | Host Loopback (`127.0.0.1`) | Redis session cache & pub/sub. | **Internal Loopback Only** |
| **`5672`** | TCP | **BLOCKED** | Host Loopback (`127.0.0.1`) | RabbitMQ AMQP broker port. | **Internal Loopback Only** |

---

## 13. Runtime Configuration Strategy

ProctorNet adheres to the **Twelve-Factor App methodology (Config)**:

1. **Build-Time vs Runtime Decoupling**:
   - **Frontend**: The Vite production build generates relative paths (`/api/v1` and `window.location.host/ws`). Zero backend hostnames or IP addresses are hardcoded into compiled JS bundles. The same frontend image is 100% portable across local dev, staging, and production.
   - **Backend**: All configuration parameters are read dynamically from `process.env` at boot and validated by Zod in `backend/src/config/env.js`.
2. **Configuration Sources**:
   - Local Development: `.env` file in workspace root (ignored in Git).
   - Local Compose: `.env` loaded via Docker Compose `env_file`.
   - Production EC2: Environment file securely mounted at `/opt/proctornet/.env` with `chmod 600` owned by root.
3. **Strict Fail-Closed Production Stance**:
   - In production (`NODE_ENV=production`), `env.js` and Compose strictly require non-empty, strong secrets. Any missing production secret terminates execution immediately on startup.
4. **Template Provided**:
   - `.env.example` in repository root containing all declared environment variables, clearly demarcating local development defaults (including `MEDIA_ANNOUNCED_IP=127.0.0.1` for direct SFU media and `TURN_ANNOUNCED_HOST=127.0.0.1` for Coturn TURN relay discovery during same-machine testing) from production-required secrets. Explicit comments explain that both `MEDIA_ANNOUNCED_IP` and `TURN_ANNOUNCED_HOST` must be changed to the development host's LAN IP address or resolvable hostname for multi-device LAN testing (and that inbound UDP ports 40000–40050 and UDP/TCP 3478 must be permitted by the host firewall).

---

## 14. Secret Management Strategy

1. **Zero Hardcoded Secrets**:
   - No secrets, API keys, passwords, or tokens in Dockerfiles, Git commits, or image layers.
2. **Required Production Secrets (Strict Fail-Closed Validation)**:
   In production (`NODE_ENV=production`), the application and Compose configurations fail fast if any of the following are absent or violate minimum strength:
   - `JWT_ACCESS_SECRET` ($\ge 32$ characters)
   - `JWT_REFRESH_SECRET` ($\ge 32$ characters)
   - `ANTI_TAMPER_SECRET` ($\ge 32$ characters; Phase 18 anti-tamper signing)
   - `DB_PASSWORD` (PostgreSQL user password)
   - `REDIS_PASSWORD` (Redis authentication token)
   - `RABBITMQ_PASSWORD` (RabbitMQ user password)
   - `TURN_STATIC_AUTH_SECRET` ($\ge 16$ characters; Coturn HMAC-SHA1 secret)
   - `METRICS_AUTH_TOKEN` (Prometheus scraper bearer token)
   - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (Only if IAM roles are unavailable; IAM instance profiles preferred).
3. **Secret Injection**:
   - In local Compose: populated from local `.env`.
   - On EC2: Injected via systemd environment or AWS Systems Manager (SSM) Parameter Store during host provisioning.

---

## 15. Healthcheck, Readiness & Liveness Design

The container healthchecks integrate with the existing dual-probe health endpoints in `backend/src/routes/health.routes.js`:

1. **Liveness Probe (`GET /health`)**:
   - Returns `200 OK` with `{ status: "UP", uptimeSeconds }`.
   - Used by container engines (`HEALTHCHECK`) to determine if the Node.js event loop is responsive.
   - If unresponsive for 3 consecutive probes (15s interval, 5s timeout), Docker restarts the container.
2. **Readiness Probe (`GET /ready`)**:
   - Checks deep connectivity:
     - PostgreSQL: Mandatory. If down, returns `503 Service Unavailable` with `{ status: "NOT_READY" }`.
     - Redis & RabbitMQ: Monitored and reported.
   - Used by reverse proxies, deployment scripts, and Compose `depends_on` to hold traffic until PostgreSQL migrations and connections are healthy.
3. **Startup Ordering & Service State Lifecycle Contract**:
   The platform strictly distinguishes between long-running daemon services and the one-shot initialization runner:
   - **Local / CI Environment (`docker-compose.yml`)**: **7 Long-Running Runtime Services** (`postgres`, `redis`, `rabbitmq`, `localstack`, `coturn`, `backend`, and `frontend`) implement continuous healthcheck probes (`test: ...`), remaining running indefinitely and transitioning from `starting` to `healthy`.
   - **Production AWS EC2 Environment (`infrastructure/docker-compose.prod.yml`)**: **6 Long-Running Runtime Services** (`postgres`, `redis`, `rabbitmq`, `coturn`, `backend`, and `frontend`) implement continuous healthcheck probes (`test: ...`), remaining running indefinitely and transitioning from `starting` to `healthy`. `localstack` is excluded because production uses real AWS S3.
   - **One-Shot Initialization Service (`backend-migrate`)**: In both environments, `backend-migrate` does not implement a recurring healthcheck daemon. Instead, it executes `node src/infrastructure/postgres/migrate.js up` against the complete committed migration chain and exits with code 0. Its health lifecycle is governed strictly by successful completion (`condition: service_completed_successfully`).
   - **Enforced Startup Dependency Chain**:
     ```
     postgres (service_healthy)
         ↓
     backend-migrate (service_completed_successfully / exit code 0)
         ↓
     backend (service_healthy on /ready)
         ↓
     frontend (accepts external HTTP 80 / HTTPS 443 traffic)
     ```
   - **Fail-Fast Invariant**: If database schema migration fails, `backend-migrate` exits with a non-zero code, and Docker Compose immediately halts startup, preventing `backend` from ever launching against an invalid database state. Phase 19 introduces exactly zero new migrations.

4. **Coturn Protocol-Level Healthcheck Probe**:
   - `coturn` runs in `network_mode: "host"` and does not expose an HTTP endpoint.
   - Both local and production Compose configurations define an explicit protocol-level Docker healthcheck using the native `turnutils_stunclient` utility provided within the `coturn/coturn:4.6.2-alpine` image (`/usr/bin/turnutils_stunclient`):
     ```yaml
     healthcheck:
       test: ["CMD-SHELL", "turnutils_stunclient 127.0.0.1 > /dev/null 2>&1 || exit 1"]
       interval: 10s
       timeout: 5s
       retries: 3
       start_period: 5s
     ```
   - **Protocol Verification**: `turnutils_stunclient 127.0.0.1` executes an RFC 5389 STUN Binding Request against loopback port 3478. Coturn answers with a STUN Binding Response within milliseconds, causing the utility to exit with code 0. If the daemon is unstarted or deadlocked, the probe times out or exits non-zero, marking the container `unhealthy`.
   - **Alternative Host Check**: During deployment or host diagnostics, TCP port connectivity can additionally be verified via `nc -z 127.0.0.1 3478`.

---

## 16. Graceful Shutdown Strategy

The backend container lifecycle is aligned with `server.js`'s built-in graceful shutdown handler:

1. **Signal Processing**:
   - Docker daemon issues `SIGTERM` when stopping or restarting containers.
   - `server.js` catches `SIGTERM` and initiates sequential teardown:
     1. Closes and drains WebSocket connections (3000ms drain window).
     2. Closes mediasoup SFU worker subprocess pool.
     3. Stops accepting new HTTP connections via `server.close()`.
     4. Stops the transactional outbox poller.
     5. Stops the evaluation consumer and drains in-flight jobs (up to 5000ms).
     6. Closes RabbitMQ channels and connections.
     7. Closes Redis client connections.
     8. Drains and closes the PostgreSQL connection pool.
2. **Container Stop Grace Period**:
   - `server.js` enforces a 10s maximum timeout before forcing exit (`process.exit(1)`).
   - The Docker Compose configuration specifies `stop_grace_period: 15s`. This provides a 5s safety margin, ensuring Node.js finishes its 10s graceful shutdown cleanly before the Docker daemon issues a non-negotiable `SIGKILL`.
3. **Orphan / Zombie Process Reaping**:
   - `mediasoup` spawns native C++ worker subprocesses.
   - If Node.js runs as PID 1 in a container, it may fail to reap zombie child processes when workers exit.
   - **Mandate**: In Compose, `init: true` is configured on the `backend` service, activating Docker's built-in `tini` init process as PID 1 to properly reap child processes and forward signals.

---

## 17. Networking & Port Model

To eliminate any ambiguity between development and production environments, the platform's networking architecture is explicitly specified across the following 10 dimensions:

1. **Frontend Network Mode (Production)**:
   - Runs in Docker bridge network mode (`proctornet-net`).
   - Enables standard Docker port isolation and avoids root capability requirements for Nginx.
2. **Backend Network Mode (Production)**:
   - Runs in host network mode (`network_mode: "host"`).
   - Grants native, zero-overhead kernel access to network interfaces, which is essential for high-throughput WebRTC UDP streaming.
3. **Frontend Host Port Mapping**:
   - Host port `80` is mapped to container port `8080` (`80:8080`).
   - Host port `443` is mapped to container port `8443` (`443:8443`).
   - Unprivileged Nginx inside the container binds strictly to non-privileged ports (`8080`, `8443`), while Docker on the host handles privileged port listening.
4. **Backend API Binding**:
   - The Node.js Express server binds to port `4000` (`PORT=4000`).
   - In host network mode, listening on port 4000 accepts traffic from the host's loopback interface and Docker bridge gateway interface (`host.docker.internal`).
   - Inbound connections from external networks (`0.0.0.0/0`) are strictly blocked by the AWS Security Group and host firewall.
5. **Backend SFU UDP Binding**:
   - `mediasoup-worker` processes bind their WebRTC RTP listeners to `0.0.0.0:40000-49999/udp`.
   - Native host networking eliminates the Docker userland bridge proxy (`docker-proxy`), avoiding memory exhaustion and packet serialization bottlenecks across 10,000 ports.
6. **Exact Frontend -> Backend Connectivity Path**:
   - Step 1: External client initiates an HTTPS request to `https://${DOMAIN_NAME}/api/v1/auth/me` on host port 443.
   - Step 2: Docker bridge forwards the packet from host port 443 to `frontend` container port 8443.
   - Step 3: Nginx terminates TLS using mounted Let's Encrypt certificates.
   - Step 4: Nginx matches `/api/` and reverse-proxies the request to `http://host.docker.internal:4000/api/v1/auth/me`.
   - Step 5: Docker's host-gateway mechanism routes the packet through the bridge gateway (e.g. `172.17.0.1:4000`) directly to the backend process listening on the host.
   - Step 6: Backend processes the request, issues the response back through the bridge gateway to Nginx, and Nginx encrypts and returns the response to the client over TLS.
   - (WebSocket connections follow the identical path on `/ws` with HTTP/1.1 Upgrade headers).
7. **Public Ports (Internet Accessible via AWS Security Group)**:
   - `80/tcp`: HTTP ingress (Certbot ACME challenge and permanent 301 redirect to HTTPS).
   - `443/tcp`: HTTPS ingress (TLS-terminated client application and API traffic).
   - `3478/tcp+udp`: Coturn STUN/TURN signaling and allocation port.
   - `40000–49999/udp`: Mediasoup SFU direct WebRTC RTP media stream range.
   - `49152–49250/udp`: Coturn relayed WebRTC RTP media stream range.
8. **Internal-Only Ports (Strictly Blocked from Public Internet)**:
   - `4000/tcp`: Backend API/WebSocket server. Accessible only via `host.docker.internal` / host loopback; dropped by AWS Security Group.
   - `5432/tcp`: PostgreSQL database. Published strictly to loopback (`127.0.0.1:5432:5432`); inaccessible externally.
   - `6379/tcp`: Redis cache. Published strictly to loopback (`127.0.0.1:6379:6379`); inaccessible externally.
   - `5672/tcp`: RabbitMQ AMQP message broker. Published strictly to loopback (`127.0.0.1:5672:5672`).
   - `15672/tcp`: RabbitMQ Management UI. Published strictly to loopback (`127.0.0.1:15672:15672`).
9. **Docker Host-Gateway Configuration Requirement**:
   - **REQUIRED**. In `infrastructure/docker-compose.prod.yml`, the `frontend` service must declare:
     ```yaml
     extra_hosts:
       - "host.docker.internal:host-gateway"
     ```
   - On Linux Docker engines, this injects an `/etc/hosts` entry resolving `host.docker.internal` to the host's bridge interface IP, enabling the bridge container to reach host-networked services without hardcoding host IP addresses.
10. **Preservation of Modular Monolith & Security Boundaries**:
    - *Modular Monolith Preserved*: All backend subsystems (REST API, WebSockets, in-process mediasoup SFU worker pool, transactional outbox poller, evaluation consumer) remain unified within a single Node.js process and container image. No microservice fragmentation or separate media services are created.
    - *Security Boundary Hardened*: External callers cannot bypass Nginx to hit port 4000 directly. Nginx acts as the mandatory TLS terminator, request sanitization edge, and static file shield, while unprivileged container execution ensures that compromised processes cannot gain host root privileges.

---

## 18. WebRTC / SFU Deployment Constraints

1. **Docker UDP Bridge NAT Limitation**:
   - Docker's default userland proxy (`docker-proxy`) experiences severe CPU/memory exhaustion when mapping wide port ranges (e.g. 10,000 UDP ports) via bridge port forwarding.
2. **Architecture Solution**:
   - **Local Development (`docker-compose.yml`)**: Restrict the active media port range in development to 51 ports (`MEDIA_MIN_PORT=40000`, `MEDIA_MAX_PORT=40050`). This allows standard bridge mapping without straining the Docker daemon.
   - **AWS EC2 Production (`docker-compose.prod.yml`)**: Use `network_mode: "host"` for the `backend` container. This eliminates Docker proxy overhead and allows zero-copy UDP throughput for full WebRTC streaming across ports 40000–49999.
3. **Announced IP Configuration & Client Reachability Model**:
   - `MEDIA_LISTEN_IP`: Configured as `0.0.0.0` in containers so `mediasoup-worker` binds to all container interfaces.
   - `MEDIA_ANNOUNCED_IP`: Injected via environment variable and advertised to WebRTC clients in ICE candidates. It adheres to the same local reachability model as `TURN_ANNOUNCED_HOST`:
     - **Same-machine browser on the development host**: Defaults to `MEDIA_ANNOUNCED_IP=127.0.0.1` in local Compose, routing media over loopback to host-published UDP ports `40000–40050`.
     - **Browser/device on another machine on the LAN**: Configured as `MEDIA_ANNOUNCED_IP=<development-host-LAN-IP-or-resolvable-hostname>`. Loopback (`127.0.0.1`) is strictly local to each device and is never remotely reachable across the network. For remote devices or mobile testing on the LAN, developers must override `MEDIA_ANNOUNCED_IP` with the development host's LAN IP address, and the host firewall must permit inbound UDP traffic across ports `40000–40050`.
     - **AWS EC2 Production**: Configured to the EC2 Elastic IP address (`${MEDIA_ANNOUNCED_IP:?MEDIA_ANNOUNCED_IP is required}`) so candidate and proctor browsers globally can route UDP media directly.

---

## 19. TURN / Coturn Deployment Considerations

1. **Role of TURN in Production**:
   - WebRTC peer-to-peer and SFU direct UDP traffic is blocked by institutional firewalls, symmetric NATs, and campus network filters in ~15–20% of remote examination sessions.
   - Coturn relays RTP packets over standard UDP/TCP port 3478 and allocates relay ports in the range `49152–49250/udp`.
2. **Container Deployment**:
   - Coturn is deployed as a dedicated container in the Compose topology running version-pinned `coturn/coturn:4.6.2-alpine`.
   - Configured with `--lt-cred-mech`, `--fingerprint`, `--static-auth-secret`, `--min-port=49152`, and `--max-port=49250`.
   - Shared secret matches `backend`'s `TURN_STATIC_AUTH_SECRET`, allowing the existing `iceService.js` to issue ephemeral HMAC-SHA1 tokens with 900s TTL.
   - In both local development and production environments, Coturn intentionally runs in host networking mode (`network_mode: "host"`) to bind directly to port `3478` and allocate relay ports `49152–49250` without bridge NAT translation overhead (with true host network namespace binding on native Linux / production EC2, and virtualized VM network namespace binding on Docker Desktop for macOS and Windows/WSL2 where `TURN_ANNOUNCED_HOST` facilitates client reachability).
3. **Continuous Health Verification**:
   - Both local and production Compose configurations define a continuous Docker healthcheck using the native `turnutils_stunclient 127.0.0.1` command, verifying that STUN/TURN binding requests are actively processed on port 3478.
   - For host-level diagnostics, TCP connectivity can additionally be validated via `nc -z 127.0.0.1 3478`.
4. **TURN ICE Server & SFU Media Endpoint Configuration & Client Reachability**:
   - `TURN_SERVER_URL` and `MEDIA_ANNOUNCED_IP` are separate configuration concerns governing different WebRTC network paths:
     - `TURN_SERVER_URL` controls Coturn STUN/TURN server discovery for relayed candidate allocation.
     - `MEDIA_ANNOUNCED_IP` controls the host address advertised in ICE candidates for direct mediasoup SFU media transport (`40000–40050/udp` locally, `40000–49999/udp` in production).
     - The backend Node.js process does not initiate outbound network connections to Coturn; rather, it uses `TURN_STATIC_AUTH_SECRET` to mint ephemeral HMAC-SHA1 credentials offline and delivers them alongside both endpoints to client browsers via WebSocket signaling.
   - **Local Development Client Reachability**:
     - Configured as `TURN_SERVER_URL: "turn:${TURN_ANNOUNCED_HOST:-127.0.0.1}:3478"` and `MEDIA_ANNOUNCED_IP: ${MEDIA_ANNOUNCED_IP:-127.0.0.1}`.
     - For **same-machine development** (where the browser runs on the development host), `127.0.0.1` resolves directly to the host's Coturn daemon on port 3478 and published SFU media ports 40000–40050.
     - For **multi-device LAN testing** (testing from external devices, mobile browsers, or other machines on the local network), `127.0.0.1` is not remotely reachable. Developers must configure both `TURN_ANNOUNCED_HOST` and `MEDIA_ANNOUNCED_IP` in `.env` to the development host's LAN IP address or resolvable hostname, and verify the host firewall permits inbound UDP `40000–40050` (direct media) and TCP/UDP `3478` (Coturn signaling).
   - **Production AWS EC2**:
     - Configured as `MEDIA_ANNOUNCED_IP: ${MEDIA_ANNOUNCED_IP:?MEDIA_ANNOUNCED_IP is required}` and `TURN_SERVER_URL: "turn:${MEDIA_ANNOUNCED_IP}:3478"`, advertising the public Elastic IP address so candidates and proctors globally can route direct and relayed media packets.

---

## 20. PostgreSQL, Redis & RabbitMQ Operational Boundaries

1. **PostgreSQL**:
   - Image: `postgres:16.4-alpine`.
   - Persistent volume: `pg_data` mounted at `/var/lib/postgresql/data`.
   - Configuration parameters tuned for single-host concurrency: `max_connections = 100`, `shared_buffers = 256MB`.
2. **Redis**:
   - Image: `redis:7.4-alpine`.
   - Persistence: Append-Only File (AOF) enabled (`--appendonly yes`) for ephemeral session continuity across restarts.
   - Fail-closed behavior: In production (`NODE_ENV=production`), if Redis crashes, anti-tamper middleware immediately fails closed (HTTP 503 `ERR_REPLAY_SERVICE_UNAVAILABLE`) preserving Phase 18 replay defense.
3. **RabbitMQ**:
   - Image: `rabbitmq:3.13.7-management-alpine`.
   - Topology durability: Outbox queues, evaluation queues, and dead-letter exchanges configured as quorum/durable per ADR-0002.

---

## 21. S3 Integration Boundary

1. **Local & CI Emulation (LocalStack)**:
   - Uses version-pinned `localstack/localstack:3.7` simulating AWS S3 on port 4566.
   - An initialization script (`infrastructure/localstack/init-s3.sh`) creates the default bucket `proctornet-evidence-dev-01` on startup.
   - Backend configured with `S3_ENDPOINT=http://localstack:4566` and `S3_FORCE_PATH_STYLE=true`.
2. **Production AWS S3**:
   - In production on EC2, `S3_ENDPOINT` is left undefined, automatically defaulting the AWS SDK to real AWS S3 endpoints.
   - IAM EC2 Instance Profile is utilized, avoiding static credentials in environment variables.

---

## 22. Security Hardening for Images & Runtime

1. **Non-Root Execution**:
   - Backend: Runs as unprivileged system user `node` (UID 1000).
   - Frontend: Runs as unprivileged system user `nginx` (UID 101) on port 8080.
2. **Capability Dropping**:
   - Compose configurations drop all unnecessary Linux capabilities:
     ```yaml
     cap_drop:
       - ALL
     cap_add:
       - NET_BIND_SERVICE
     ```
3. **Filesystem Protections**:
   - Container root filesystems configured read-only where feasible, using dedicated `tmpfs` mounts for `/tmp`.
4. **No Compiler Tools in Production**:
   - Multi-stage builds ensure that `gcc`, `g++`, `make`, and `python3` remain strictly inside the builder stage and are never copied to the runtime image.
5. **Strict TLS Private Key Access & Non-World-Readable Hardening**:
   - On the host, the TLS private key is owned by `root:101` (matching Nginx container primary GID 101) with strict permissions `0640` (`-rw-r-----`).
   - World-readable mode (`0644`) is **strictly prohibited**, preventing unprivileged processes, adjacent containers, or non-admin host users from accessing private keys.
   - Mounted into the frontend container as read-only (`/etc/letsencrypt:/etc/letsencrypt:ro`), guaranteeing that container processes cannot modify or delete certificates.

---

## 23. Image Versioning & Reproducibility Strategy

1. **Strict Dependency Locking**:
   - Every Docker build executes `npm ci` (never `npm install`) against committed `package-lock.json` files.
2. **Version-Pinned Base Images**:
   - Dockerfiles and Compose configurations pin specific major and minor versions (e.g. `node:24-bookworm-slim`, `nginxinc/nginx-unprivileged:alpine`, `postgres:16.4-alpine`, `redis:7.4-alpine`, `rabbitmq:3.13.7-management-alpine`, `localstack/localstack:3.7`, `coturn/coturn:4.6.2-alpine`).
   - *Clarification*: SHA-256 image digest pinning (`image@sha256:...`) is a future hardening step; Phase 19 enforces strict version-pinned base images and eliminates all mutable `:latest` tags.
3. **Artifact Identity & Tagging Model**:
   - **Git-Commit-Addressed Deployment Tags**: Release images are tagged with the Git commit SHA: `proctornet-backend:sha-$(git rev-parse --short HEAD)`. This establishes clear deployment provenance tracing each container back to its source revision.
   - **Registry Tag Immutability as an Operational Policy**: In standard OCI registries, tags are technically mutable references unless the registry explicitly enforces tag immutability (e.g., AWS ECR Image Tag Mutability setting enabled, or GHCR immutability policies).
   - **Image Digest as the True Immutable Identity**: The SHA-256 image manifest digest (`image@sha256:...`) is the only cryptographically immutable artifact identity. Deployment workflows record the image digest alongside the Git SHA tag for auditing and reproducible verification.

---

## 24. Vulnerability Scanning Policy

1. **Automated CI Scans**:
   - Integrated `aquasecurity/trivy-action` scanning both container images for OS package and Node.js dependency vulnerabilities.
2. **Deterministic Security Gate Thresholds**:
   - **Blocking Severity**: Any **CRITICAL** severity vulnerability with an **available vendor fix** fails the CI pipeline (`exit-code: 1`).
   - **Non-Blocking Warnings**: HIGH severity vulnerabilities are logged in CI output for engineering review.
   - **Documented Exception Procedure**: If a vulnerability cannot be remediated immediately (e.g., upstream base OS package without available upstream patch), it must be documented in `docs/SECURITY_AUDIT_EXCEPTIONS.md` with:
     - CVE Identifier
     - Affected package and image layer
     - Justification and mitigating compensating controls
     - Expiration date (maximum 30 days)
     - Assigned engineer owner

---

## 25. Observability, Logging & Metrics Integration

1. **Logging**:
   - All backend logs output structured JSON to `stdout` via Pino.
   - Nginx logs request metadata in combined JSON format to `stdout`.
   - Docker daemon configures log rotation via `json-file` driver (`max-size: "50m"`, `max-file: "5"`) to prevent host disk exhaustion.
2. **Metrics**:
   - Backend exposes Prometheus metrics on `GET /metrics` on port 4000.
   - Token authentication enforced via `METRICS_AUTH_TOKEN`.
   - External Prometheus scrapers can query the endpoint directly or via reverse proxy.

---

## 26. Backup & Restore Considerations

1. **PostgreSQL Persistence**:
   - Named volume `pg_data` stored on persistent EBS storage.
   - Backup script (`infrastructure/backup-db.sh`) executing `pg_dump` with gzip compression, writing to `/opt/proctornet/backups/`.
2. **Restoration Verification**:
   - Documented procedure to restore backups into a clean `postgres` container using `pg_restore` / `psql`.

---

## 27. Rollback Strategy

1. **Image / Application Rollback Only**:
   - If a new deployment fails its `/ready` healthcheck probe in `deploy.sh`:
     1. The script immediately halts promotion.
     2. Reverts the image tag in Compose to the previous known-good commit SHA (`PREVIOUS_BACKEND_IMAGE`).
     3. Re-executes `docker compose up -d`.
2. **Database Rollback Separation**:
   - Database rollbacks are **NOT automatic**.
   - Phase 19 introduces exactly zero new database migrations, so application rollbacks in Phase 19 never require schema rollbacks.
   - Any future schema rollbacks must be executed via an explicit, tested, human-supervised procedure (`migrate.js down`) rather than an automated script.

---

## 28. Failure Scenarios & Recovery Behavior

| Failure Scenario | Immediate System Effect | Automated Recovery Mechanism | Impact on Active Exams |
|---|---|---|---|
| **Backend Process Crash** | Node.js process exits. | Docker `restart: unless-stopped` re-spawns container. | Candidates experience transient WebSocket reconnect (~2s); answers persisted in PostgreSQL remain 100% safe. |
| **Mediasoup Worker Crash** | Native C++ worker process crashes. | In-process `sfuManager` catches `worker.on('died')`, increments generation epoch, isolates reset to assigned sessions, and spawns replacement worker. | Only sessions on crashed worker reconnect media; other sessions experience zero disruption. |
| **PostgreSQL Transient Outage** | Backend `/ready` probe returns 503. | Node.js `pg` pool automatically retries connections with exponential backoff. | Active submissions queue or retry; zero corrupted state due to ACID transactions. |
| **Redis Crash** | Ephemeral cache unavailable. | Anti-tamper fails closed (HTTP 503); session checks fall back to PostgreSQL database. | Mutating answers pause for seconds until Redis restarts; no data loss. |
| **RabbitMQ Crash** | Async evaluation worker disconnected. | `client.js` reconnect hook retries connection; outbox events accumulate safely in PostgreSQL `outbox_events` table. | Exam submissions complete normally; automated grading evaluates once RabbitMQ reconnects. |

---

## 29. Resource & Capacity Benchmark Assumptions

- **Host Specifications**: 4 vCPUs, 16 GB RAM (AWS EC2 `t3.xlarge` or `c6i.xlarge`).
- **Container Memory Limits**:
  - `backend`: 4 GB RAM limit, 2 vCPUs reservation.
  - `frontend`: 256 MB RAM limit, 0.5 vCPUs.
  - `postgres`: 4 GB RAM limit, 1 vCPU.
  - `redis`: 1 GB RAM limit, 0.5 vCPUs.
  - `rabbitmq`: 2 GB RAM limit, 0.5 vCPUs.
  - `coturn`: 1 GB RAM limit, 0.5 vCPUs.
- **Benchmark Target Assumption (250 Concurrent Candidates)**:
  - The capacity target of **250 concurrent candidates** is an engineering benchmark assumption (not an unverified absolute claim).
  - **Required Validation Conditions**:
    1. *Candidate Producers*: 1 webcam video (VP8, 640x360 @ 15–20 fps, 300–500 kbps) + 1 audio stream (Opus, 32 kbps).
    2. *Proctor Consumers*: Invigilators monitor via 12-candidate paginated grid receiving low-bitrate thumbnail simulcast layers (~100 kbps per video tile).
    3. *TURN Relay Fraction*: Assumes $\le 20\%$ of candidate streams require Coturn relaying; remaining $80\%$ route directly via SFU UDP.
    4. *Answer Autosave Frequency*: Average 1 autosave every 15–30 seconds per active candidate.
    5. *Performance Thresholds*: Packet loss $< 2\%$, round-trip time (RTT) $< 250$ ms, HTTP REST API P95 latency $< 100$ ms.
    6. *Verification*: Must be empirically validated during Phase 20/21 load testing before production accreditation.

---

## 30. Development Environment Impact

- Developers can spin up the entire ProctorNet ecosystem with a single command:
  ```bash
  docker compose up -d
  ```
- Local code changes in `backend/` and `frontend/` can be tested natively or by rebuilding containers.
- Zero local PostgreSQL, Redis, or RabbitMQ manual installations required on host machines.

---

## 31. Test Strategy

1. **Docker Build Correctness**:
   - Validate both Dockerfiles build without warnings or caching issues on clean runners.
2. **Compose Up Smoke Test & Lifecycle Verification**:
   - Automated script spins up the complete Compose stack, validating the deterministic startup ordering and service lifecycle contracts:
     - `postgres` achieves `healthy` status via `pg_isready`.
     - `backend-migrate` starts only after `postgres` is `healthy`, executes the complete committed migration chain, and terminates successfully with exit code 0 (`service_completed_successfully`).
     - `backend` starts only after `backend-migrate` exits with code 0, achieving `healthy` status on `/ready`.
     - In local/CI Compose testing (`docker-compose.yml`), all 7 long-running services (`postgres`, `redis`, `rabbitmq`, `localstack`, `coturn`, `backend`, `frontend`) achieve verified `healthy` status.
     - In production Compose testing (`infrastructure/docker-compose.prod.yml`), all 6 long-running services (`postgres`, `redis`, `rabbitmq`, `coturn`, `backend`, `frontend`) achieve verified `healthy` status (`localstack` is excluded).
     - `backend-migrate` remains in `Exited (0)` completed state.
     - Nginx serves frontend assets and proxies API/WS traffic.
3. **TLS Permission Verification**:
   - Automated check validates that the production TLS private key on the host is set to mode `0640` owned by `root:101`, is readable by unprivileged Nginx container (UID 101), and is strictly NOT world-readable.
4. **Regression Preservation**:
   - Backend test suite: 750 / 750 tests pass inside CI environment against the complete committed migration chain.
   - Frontend test suite: 63 / 63 tests pass inside CI environment.
   - Frontend production build: Vite build succeeds with 0 errors.

---

## 32. CI Acceptance Criteria

- All GitHub Actions workflow jobs (`lint-and-validate`, `backend-tests`, `frontend-tests`, `frontend-build`, `docker-build-verify`, `security-audit`, and `runtime-image-dependency-verify`) pass with green checkmarks.
- Docker image build validation executes in under 5 minutes using GitHub Actions cache.
- Compose smoke test verifies that all 7 long-running local/CI services (`postgres`, `redis`, `rabbitmq`, `localstack`, `coturn`, `backend`, `frontend`) reach `healthy` state, and `backend-migrate` completes successfully with exit code 0 before `backend` starts.
- Security audit passes: zero CRITICAL vulnerabilities with available vendor fixes detected by Trivy; any documented exceptions adhere to the formal exception procedure.
- Automated dependency assertion verifies that development-only packages (`vitest`, `supertest`, `c8`) are strictly excluded from the built backend production image.

---

## 33. Deployment Acceptance Criteria

- `docker compose -f infrastructure/docker-compose.prod.yml up -d` executes the enforced startup sequence:
  1. `postgres` reaches `healthy` state.
  2. `backend-migrate` executes the complete committed migration chain and exits with code 0 (`service_completed_successfully`).
  3. `backend` starts only after `backend-migrate` completes with code 0 and achieves `healthy` state on `/ready`.
  4. `frontend` starts only after `backend` is `healthy`.
- All 6 long-running production services (`postgres`, `redis`, `rabbitmq`, `coturn`, `backend`, `frontend`) reach verified `healthy` state; `backend-migrate` terminates with exit code 0.
- Coturn STUN/TURN protocol healthcheck (`turnutils_stunclient 127.0.0.1`) achieves verified `healthy` state.
- A failed migration test verifies that `backend` is strictly prevented from starting if `backend-migrate` exits non-zero.
- `GET http://127.0.0.1:4000/ready` returns HTTP 200 with status `READY`.
- `GET http://localhost:80/` returns `HTTP 301` redirecting to `https://${DOMAIN_NAME}/`.
- `GET https://localhost:443/` serves the React Single Page Application over TLS with valid certificates.
- Production TLS private key on host has mode `0640` owned by `root:101`, is readable by Nginx container, and is NOT world-readable (mode `0644` is strictly prohibited).
- Port 4000 is verified to be unreachable from external interfaces (`0.0.0.0/0`), accessible only via Nginx reverse proxy across `host.docker.internal` / host loopback.
- Mediasoup worker pool initializes with detected host vCPUs.
- Coturn STUN/TURN port (3478) and relay range (49152–49250) are exposed and responsive.

---

## 34. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Mediasoup C++ compilation failure on Linux** | Backend container build fails during `npm ci`. | Build uses Debian `node:24-bookworm-slim` with `build-essential` and `python3`, ensuring standard GNU toolchain compatibility. |
| **UDP Port exhaustion with Docker bridge network** | Media plane latency or dropped video streams. | Compose uses restricted port range (40000–40050) locally and `network_mode: "host"` on production EC2. |
| **Zombie processes from mediasoup child workers** | Container PID exhaustion over time. | `init: true` enabled in Compose to invoke `tini` as PID 1 for proper signal forwarding and child reaping. |
| **Race condition or failure in DB migrations during deployment** | Backend boots against unmigrated or corrupted database schema. | Production Compose enforces strict dependency contract: `backend-migrate` depends on `postgres: { condition: service_healthy }`, and `backend` depends on `backend-migrate: { condition: service_completed_successfully }`. If any migration fails, `backend-migrate` exits non-zero and Compose prevents `backend` from booting. |
| **Accidental public exposure of backend or database ports** | Security boundary breach. | Auxiliary persistence (`5432`, `6379`, `5672`) binds strictly to `127.0.0.1`. Backend port `4000` is accessible internally via Docker host-gateway and loopback, and is strictly blocked from external CIDRs (`0.0.0.0/0`) via AWS Security Group and host firewall rules. |
| **Insecure permissions on TLS private keys** | Private key exposed to local users or compromised processes. | Host setup runbook and Certbot renewal deploy hook strictly enforce mode `0640` owned by `root:101`. Mode `0644` is prohibited and deployment verification asserts non-world-readability. |
| **DevDependencies leaking into production backend image** | Attack surface increase and image bloat. | Builder stage executes `npm prune --omit=dev` prior to copying to runner; CI includes an automated negative assertion for test/dev packages. |
| **Single-container frontend replacement interruption** | Potential brief serving interruption during frontend container recreation. | Frontend is a stateless static React SPA; single-container replacement may introduce a brief serving interruption during container recreation. Interruption duration is environment-dependent and must be measured during deployment verification. True zero-downtime frontend replacement requires overlapping container replicas or an external load balancer, which is explicitly outside Phase 19 single-host scope and deferred to Phase 20. |
| **Coturn host-networking reachability on Docker Desktop (WSL2/macOS)** | WebRTC clients unable to connect to Coturn on virtualized development runtimes. | Developers configure `TURN_ANNOUNCED_HOST` and `MEDIA_ANNOUNCED_IP` in `.env` to the development host's LAN IP address or resolvable hostname, bridging the virtualized Docker VM network namespace to external/local clients. |

---

## 35. Open Questions

1. **Container Registry Selection**:
   - *Recommendation*: Configure GitHub Container Registry (GHCR) in Phase 19 CI for automated image artifact packaging; defer AWS ECR setup to Phase 20 Terraform provisioning.
2. **LocalStack vs MinIO for S3 Mocking**:
   - *Resolution*: LocalStack is chosen as it simulates the full AWS S3 API signature format, header structure, and error envelopes identically to real AWS S3.

---

## 36. Required ADRs

- **ADR-0009**: `docs/ADR/0009-containerization-topology-multistage-builds-host-networked-sfu-and-single-host-delivery.md`
  - Documents multi-stage Docker architecture and deterministic dependency pruning.
  - Documents single-host Docker Compose deployment on AWS EC2 with bridge frontend and host-networked backend.
  - Documents WebRTC UDP media port routing and Coturn relay port range.
  - Documents unprivileged Nginx reverse proxy architecture, TLS termination with 0640 key permissions, and host-gateway connectivity.

---

## 37. Explicit Architectural Decisions

1. **AD-19-1: Multi-Stage Debian-Based Backend Container**:
   - *Decision*: Use `node:24-bookworm-slim` rather than Alpine for backend image, compiling native `mediasoup-worker` in builder and running `npm prune --omit=dev` before copying to runner.
   - *Rationale*: Guarantees reliable compilation and execution of `mediasoup-worker` C++ native binaries without `musl` libc compatibility issues, while strictly eliminating devDependencies from the production image.
2. **AD-19-2: Unprivileged Nginx Reverse Proxy for Frontend with TLS Termination**:
   - *Decision*: Serve React SPA and terminate TLS via `nginxinc/nginx-unprivileged:alpine` on ports 8080/8443 (mapped to host 80/443), reverse-proxying `/api/v1` and `/ws` to `http://host.docker.internal:4000`. Private keys are mounted read-only with mandatory 0640 mode owned by `root:101`.
   - *Rationale*: Completely decouples frontend build from backend origin; eliminates CORS issues; reduces image size to ~25 MB; provides high-performance static asset caching and automated Let's Encrypt TLS termination without requiring root container privileges or world-readable keys.
3. **AD-19-3: Dedicated Migration Init Container & Startup Contract**:
   - *Decision*: Execute schema migrations in a dedicated one-shot container (`backend-migrate`) prior to API launch, enforcing `backend` startup only upon `service_completed_successfully`.
   - *Rationale*: Eliminates migration race conditions across horizontal instances; ensures clean database state before traffic arrives; immediately fails fast if migrations fail.
4. **AD-19-4: Single-Host EC2 Compose Hybrid Orchestration**:
   - *Decision*: Deploy the stack via Docker Compose on a single AWS EC2 instance with bridge networking for frontend (with host-gateway), host networking for backend and Coturn, loopback bindings for internal database ports, and stateless single-container replacement (`up -d --no-deps frontend`).
   - *Rationale*: Strictly adheres to modular monolith architecture and avoids premature Kubernetes complexity while supporting high-throughput WebRTC media traffic and strict network isolation. Single-container frontend replacement is sufficient for single-host operations; true zero-downtime blue/green frontend replacement requiring overlapping replicas or an external load balancer is outside Phase 19 scope.

---

## 38. Implementation Sequence

The implementation of Phase 19 will follow this sequential order:

1. **Step 1 — Create Configuration & Ignore Files**:
   - Create `backend/.dockerignore` and `frontend/.dockerignore`.
   - Create root `.env.example` documenting all required variables (clearly isolating development defaults such as `MEDIA_ANNOUNCED_IP=127.0.0.1` and `TURN_ANNOUNCED_HOST=127.0.0.1` for same-host testing, with documentation on LAN IP overrides for multi-device testing, from production requirements).
2. **Step 2 — Author Dockerfiles**:
   - Author `backend/Dockerfile` (multi-stage, non-root, mediasoup build, deterministic `npm prune --omit=dev`).
   - Author `frontend/nginx/default.conf` (Nginx dual HTTP/HTTPS listener, ACME challenge, TLS termination, and host-gateway reverse proxy config).
   - Author `frontend/Dockerfile` (multi-stage, Nginx unprivileged, cert mount directories).
3. **Step 3 — Author Docker Compose Stack**:
   - Create `infrastructure/localstack/init-s3.sh` for evidence bucket initialization.
   - Author root `docker-compose.yml` orchestrating all 8 services for local development (hybrid bridge-first topology with host-networked Coturn) with strict dependency ordering.
   - Author `infrastructure/docker-compose.prod.yml` with production overrides (bridge frontend with host-gateway, host networking for backend/coturn, loopback bindings, fail-closed secrets, and `backend-migrate: { condition: service_completed_successfully }`).
4. **Step 4 — Author Deployment & Systemd Scripts**:
   - Author `infrastructure/deploy.sh` (deployment script executing the replacement workflow: pull images → migration-before-backend replacement via `backend-migrate` → stateless frontend replacement using `--no-deps` → graceful single-instance backend replacement using `--no-deps` → backend `/ready` probe verification; using `--no-deps` intentionally so Compose startup dependencies are not re-executed during targeted replacement, explicitly distinguishing this replacement workflow from Compose's initial startup dependency chain `postgres → backend-migrate → backend → frontend`).
   - Author `infrastructure/proctornet.service` (systemd host service unit preserving Compose dependency ordering).
   - Update `infrastructure/README.md` with complete operational runbooks (including Certbot webroot issuance, mandatory 0640 key permissions for group 101, and renewal deploy hook setup).
5. **Step 5 — Author GitHub Actions CI Pipeline**:
   - Author `.github/workflows/ci.yml` with parallel stages, dynamic migration validation, and runtime devDependency exclusion checks.
6. **Step 6 — Author and Index ADR-0009**:
   - Create `docs/ADR/0009-containerization-topology-multistage-builds-host-networked-sfu-and-single-host-delivery.md`.
   - Update `docs/ADR/README.md`.
7. **Step 7 — Local & CI Verification**:
   - Validate Docker builds for backend and frontend.
   - Verify `docker compose up -d` brings up all 7 long-running local/CI services to healthy status, and `backend-migrate` completes successfully with exit code 0 before backend starts.
   - Verify production Compose brings up all 6 long-running services to healthy status with `backend-migrate` completing successfully with exit code 0.
   - Verify full test regression passes cleanly.

---

## 39. Definition of Done

Phase 19 is complete when:
1. `backend/Dockerfile` and `frontend/Dockerfile` build successfully with zero errors.
2. Root `docker-compose.yml` and production Compose enforce the startup dependency chain: `postgres` reaches `healthy`, `backend-migrate` runs the complete committed migration chain and exits with code 0 (`service_completed_successfully`), all long-running runtime services reach verified `healthy` state (all 7 in local/CI: `postgres`, `redis`, `rabbitmq`, `localstack`, `coturn`, `backend`, `frontend`; all 6 in production: `postgres`, `redis`, `rabbitmq`, `coturn`, `backend`, `frontend`), and `backend-migrate` remains in `Exited (0)` completed state.
3. A failed migration test verifies that `backend` is strictly prevented from starting if `backend-migrate` exits non-zero.
4. Exactly zero database migrations are created by Phase 19.
5. `curl -f http://localhost:4000/ready` returns HTTP 200 with `{ "status": "READY" }`.
6. `curl -f http://localhost:8080/` serves the compiled React application in local development.
7. In production Compose, port 4000 is verified to be internal-only (accessible to Nginx via host-gateway/loopback; blocked from external ingress), and database ports bind strictly to `127.0.0.1`.
8. Production Nginx configuration defines complete TLS termination on 8443 (mapped to 443), ACME challenge handling, and HTTP-to-HTTPS redirect on 8080 (mapped to 80).
9. Host TLS private key permissions are verified to be strictly `0640` owned by `root:101` (readable by unprivileged Nginx, NOT world-readable; mode `0644` is strictly prohibited).
10. Runtime backend image is verified to contain zero development dependencies (`vitest`, `supertest`, `c8`).
11. GitHub Actions workflow `.github/workflows/ci.yml` is defined and validated.
12. ADR-0009 is written, accepted, and indexed in `docs/ADR/README.md`.
13. All 750 backend tests and 63 frontend tests continue to pass with zero regressions.
14. Independent code review approves the implementation with verdict `APPROVE — SAFE TO COMMIT`.

---

## 40. Governance & Phase Completion Criteria

1. **Plan Review Gate**: This implementation plan must be independently reviewed and approved before any implementation code or files are created.
2. **Implementation Gate**: Code implementation proceeds strictly according to the approved sequence.
3. **Testing Gate**: Verification must prove that Docker builds succeed, Compose smoke tests pass, and full regression test suites pass without error.
4. **Code Review Gate**: An independent code review report (`phase19_code_review.md`) must be authored with verdict `APPROVE — SAFE TO COMMIT`.
5. **PR & Merge Gate**: Feature branch `feature/phase-19-containerization` committed, pushed, PR created, reviewed, and merged into `main`.
6. **Development Plan Gate**: `docs/DEVELOPMENT_PLAN.md` updated with completion details and merge commit hash.
