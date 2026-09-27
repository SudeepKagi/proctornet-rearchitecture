# ProctorNet — Educational Online Examination & Remote Proctoring Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Academic Project](https://img.shields.io/badge/Status-Academic%20Capstone-emerald.svg)](#academic-project-notice)
[![Node.js](https://img.shields.io/badge/Node.js-24%20LTS-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20ACID-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7%20Cache-dc382d.svg)](https://redis.io/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.13%20Broker-ff6600.svg)](https://www.rabbitmq.com/)

> **ProctorNet** is an open, resilient, high-concurrency online examination and multi-modal proctoring platform developed as an **academic software engineering capstone project**. It demonstrates server-authoritative evaluation, zero-answer-loss transactional durability, and privacy-preserving client-side telemetry without commercial SaaS dependencies.

---

## Academic Project Notice & Non-Commercial Identity

ProctorNet is **strictly an academic software engineering demonstration**:
- **Non-Commercial**: Zero commercial SaaS offerings, zero subscriptions, zero enterprise billing, and zero paid licensing.
- **Educational Scope**: Designed to model the architectural challenges of high-stakes remote examinations—specifically race conditions under mass autosave, split-second submission bursts, network partitioning, and client-side anti-tampering.
- **Authentic Metrics**: All benchmark and throughput numbers published in this repository represent empirical measurements on specified local/cloud hardware configurations (`[MEASURED]`), not marketing estimations.
- **Privacy First**: Implements privacy-by-design. Audio/video streams run across an isolated media plane; client-side screen analysis runs in isolated Web Workers without streaming raw desktop pixels to centralized cloud servers.

---

## Key System Capabilities

### 1. High-Concurrency Examination Engine
- **Zero-Loss Autosave**: Optimistic Concurrency Control (OCC) with monotonic revision sequence numbers (`expected_revision`), preventing overwrite races during rapid network jitter.
- **Authoritative Server Timing**: Timeouts and question access windows are strictly enforced server-side. The client countdown timer is purely visual; late saves are rejected with HTTP `409 Conflict`.
- **Atomic Submissions**: Submissions are governed by a strict PostgreSQL state machine (`IN_PROGRESS` $\to$ `SUBMITTED`). Replay storms and network retries are deduplicated via `Idempotency-Key` tracking.
- **Transactional Outbox**: Examination submissions commit domain events atomically to PostgreSQL before asynchronous dispatch to RabbitMQ Quorum Queues, guaranteeing reliable downstream grading without distributed dual-write inconsistencies.

### 2. Multi-Modal Proctoring & Telemetry
- **Dual-Plane Separation**: Application control signals (HTTPS/REST and WebSockets) are strictly decoupled from the high-throughput WebRTC video/audio media plane.
- **Selective Forwarding Unit (SFU)**: Built on `mediasoup` v3 running host-networked UDP (`40000–49999/udp`), enabling multi-candidate camera feeds to be routed to invigilator dashboards with minimal latency.
- **Client-Side Screen AI Worker**: An in-browser Web Worker evaluates screen capture heuristics (DOM changes, developer tool detection, tab blur, rapid window resizing) and calculates localized anomaly scores ($0–100$) without transmitting sensitive desktop screen feeds to the backend.
- **Direct S3 Evidence Uploads**: Periodic webcam snapshots and flag evidence are uploaded directly to private object storage via short-lived AWS S3 pre-signed URLs, preventing application server memory exhaustion.

### 3. Developer Operations & Security Boundary
- **WireGuard Operational Perimeter**: Developer telemetry dashboards (`/developer/telemetry`), live metric endpoints, and system logs are isolated within a dedicated WireGuard VPN subnet (`10.100.0.0/24`).
- **Cryptographic Anti-Tampering**: High-stakes candidate API requests are validated with HMAC-SHA256 signatures derived from session-specific keys, detecting payload alteration and replay attacks.
- **Fail-Open Resilience**: Redis cache failures degrade gracefully to direct PostgreSQL queries; RabbitMQ downtime buffers messages in the database outbox table without interrupting active examinees.

---

## Architectural Topology

ProctorNet employs a **Modular Monolith** architecture to achieve high throughput and clean domain encapsulation without the operational friction or network latency of premature distributed microservices.

```
+-----------------------------------------------------------------------------------------+
|                                    Client Layer                                         |
|  [Student Portal]  [Faculty Console]  [Invigilator Matrix]  [Admin Ops]  [Developer Hub]|
+--------------------------------------------+--------------------------------------------+
                                             |
                   HTTPS (TLS 1.3) / WebSocket Control Plane
                                             |
+--------------------------------------------v--------------------------------------------+
|                             Nginx Reverse Proxy & Edge                                  |
|                 - Port 80 (HTTP redirect) / Port 443 (HTTPS TLS termination)            |
|                 - Static asset caching & rate-limited reverse proxy                     |
+--------------------------------------------+--------------------------------------------+
                                             |
                         Internal Docker Host Gateway (Port 3000)
                                             |
+--------------------------------------------v--------------------------------------------+
|                          ProctorNet Core Modular Monolith                               |
|  +-----------------------------------------------------------------------------------+  |
|  | Domain Modules: Auth | Users | Exams | Attempts | Answers | Proctoring | Audit     |  |
|  +-----------------------------------------------------------------------------------+  |
|  | Engines: State Machine Engine | Transactional Outbox | Anti-Tamper Verification   |  |
|  +-----------------------------------------------------------------------------------+  |
+---------+--------------------------+-----------------------+----------------------------+
          |                          |                       |
    ACID Transactions          Non-Authoritative       Asynchronous Outbox
          |                    Cache & Rate Limits           Worker Queues
+---------v----------+       +-------v--------+      +-------v----------------------------+
|     PostgreSQL     |       |     Redis      |      |              RabbitMQ              |
| Authoritative Store|       | Ephemeral Sync |      |  (Quorum Queues & Delayed Retries) |
+--------------------+       +----------------+      +-----------------+------------------+
                                                                       |
                                                              Evaluation Consumers
                                                                       |
                                                             +---------v------------------+
                                                             | Atomic Grading Worker Pool |
                                                             +----------------------------+

+-----------------------------------------------------------------------------------------+
|                                Isolated Media Plane                                     |
|    Webcam / Mic Streams   -------->   mediasoup SFU Gateway   -------->   Invigilators  |
|    (WebRTC / DTLS / SRTP)              (Host UDP 40000–49999)                           |
+-----------------------------------------------------------------------------------------+
```

---

## Technology Stack

| Component | Technology | Role & Justification |
| :--- | :--- | :--- |
| **Frontend UI** | React 19, React Router v7 | Responsive single-page application with accessible WCAG 2.1 AA components. |
| **Styling & Theme** | Vanilla CSS Tokens & Utilities | Custom Academic Design System with light/dark theme support and zero external CSS dependencies. |
| **Backend Monolith** | Node.js 24 LTS, Express, ES Modules | High-throughput asynchronous modular monolith (`.js` ES Modules). |
| **Primary Database** | PostgreSQL 16 | Single authoritative source of truth for exams, attempts, answers, and audit trails. |
| **Cache & State Sync** | Redis 7 | Ephemeral session tokens, sliding-window rate limiting, and WebSocket pub/sub fan-out. |
| **Message Broker** | RabbitMQ 3.13 | Transactional outbox event consumption, Quorum Queues, and dead-letter retries. |
| **Media SFU** | mediasoup v3 | Selective Forwarding Unit handling low-latency WebRTC streams on host-networked UDP. |
| **Object Storage** | AWS S3 / LocalStack | Encrypted evidence snapshots, audio snippets, and export storage. |
| **Network Boundary** | WireGuard VPN | Secure network segmentation (`10.100.0.0/24`) for internal developer telemetry portals. |
| **Containerization** | Docker, Docker Compose | Multi-stage production container builds and local development orchestration. |
| **Test Runners** | Vitest 5 | High-speed test suites across backend domain logic and frontend component/hook lifecycles. |

---

## Getting Started (Local Development)

### Prerequisites
- **Node.js**: `v24.0.0` or higher
- **npm**: `v10.0.0` or higher
- **Docker & Docker Compose**: Docker Engine v24+ with Docker Compose v2+

### 1. Clone & Configure Environment
```bash
git clone https://github.com/SudeepKagi/proctornet-rearchitecture.git
cd "Online Examination System"

# Copy environment configuration
cp .env.example .env
```

Review `.env` and verify database passwords, JWT secrets, and port bindings.

### 2. Start Supporting Services (Docker Compose)
Start the PostgreSQL, Redis, RabbitMQ, LocalStack (S3), and Coturn services:
```bash
docker compose up -d postgres redis rabbitmq localstack coturn
```

Verify service health:
```bash
docker compose ps
```

### 3. Run Database Migrations
Execute the automated database migration runner:
```bash
cd backend
npm install
npm run db:migrate
```

### 4. Launch Backend API Service
```bash
# In backend directory
npm run dev
```

The backend API initializes on `http://localhost:3000` (or `PORT` specified in `.env`).
- Health endpoint: `http://localhost:3000/health`
- Readiness check: `http://localhost:3000/ready`

### 5. Launch Frontend Application
In a separate terminal:
```bash
cd ../frontend
npm install
npm run dev
```
The React development server launches on `http://localhost:5173`.

### 6. Default Evaluation & Development Credentials
To seed pre-configured evaluation accounts across all 5 institutional roles:
```bash
# In backend directory
npm run seed:users
```

| Role | Email | Password | Accessible Portals |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | `admin@proctornet.edu` | `Admin#2026_SecureExams!` | `/admin/overview`, `/admin/users`, `/admin/verification`, `/admin/audit` |
| **`DEVELOPER`** | `developer@proctornet.edu` (or `dev@...`) | `Dev#2026_SecureExams!` | `/developer/overview`, `/developer/health`, `/developer/logs`, `/developer/topology` |
| **`FACULTY`** | `faculty@proctornet.edu` | `Faculty#2026_SecureExams!` | `/faculty/dashboard`, `/faculty/exams`, `/faculty/sessions`, `/faculty/grading` |
| **`INVIGILATOR`** | `invigilator@proctornet.edu` | `Invigilator#2026_SecureExams!` | `/invigilator`, `/invigilator/sessions/:sessionId` |
| **`STUDENT`** | `student@proctornet.edu` | `Student#2026_SecureExams!` | `/candidate/dashboard`, `/candidate/exams`, `/candidate/profile` |
| **`STUDENT (Enrolled)`** | `sudeep@proctornet.edu` | `Student#2026_SecureExams!` | `/candidate/dashboard`, `/candidate/exams`, `/candidate/profile` |

---

## Automated Testing Suite

ProctorNet enforces a comprehensive testing pyramid across all layers:

### Frontend Tests (Vitest & React Testing Library)
```bash
cd frontend
# Run all frontend tests (components, hooks, state boundaries, autosave OCC)
npm test
```

### Backend Tests (Vitest)
```bash
cd backend
# Run backend test suite (state machines, OCC autosave, RBAC, results release)
npm test
```

### Concurrency & Chaos Testing
```bash
# Execute candidate autosave & submission concurrency benchmark
npm run bench:run

# Execute resilience & chaos engineering test suite
node scripts/chaos/run-resilience-suite.js
```

---

## Production Deployment Overview

ProctorNet is packaged for single-host AWS EC2 delivery using Docker Compose with optimized container topologies:

- **Nginx Ingress**: Binds host ports `80` and `443`, terminating TLS and routing `/api/` traffic to the backend host-gateway.
- **Backend Host Networking**: Binds to `network_mode: "host"` to enable zero-copy UDP WebRTC throughput for `mediasoup-worker` without Docker bridge NAT overhead.
- **Security Group Isolation**: Backend port `3000` is strictly internal—inbound traffic from `0.0.0.0/0` on port 3000 is dropped at the firewall.
- **Deployment Script**: Zero-downtime container replacement with automated health verification:
  ```bash
  cd infrastructure
  ./deploy.sh
  ```

For full disaster recovery runbooks, AWS IAM setup, and operations guides, refer to [infrastructure/README.md](infrastructure/README.md) and [docs/runbooks/](docs/runbooks/).

---

## Authoritative Documentation (`docs/`)

The `docs/` directory contains complete technical documentation describing the implemented system:

| Document / Directory | Focus Area |
| :--- | :--- |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Master architecture specification, modular monolith boundaries, and state consistency rules. |
| **[docs/ADR/](docs/ADR/)** | Index of 15 Architectural Decision Records covering caching, brokers, SFU, WireGuard, and dual invigilation. |
| **[docs/DEVELOPMENT_RULES.md](docs/DEVELOPMENT_RULES.md)** | Engineering standards, branch workflows, Conventional Commits, and security governance. |
| **[docs/api/openapi.json](docs/api/openapi.json)** | Complete OpenAPI 3.0 specification for all REST API endpoints. |
| **[docs/runbooks/](docs/runbooks/)** | Operational runbooks for disaster recovery, database failover, broker outages, and security triage. |
| **[docs/DATABASE/](docs/DATABASE/)** | Database schema, relational models, index strategies, and transactional outbox table designs. |
| **[docs/EXAMS/](docs/EXAMS/)** | Examination lifecycle, question banks, blueprint schemas, and access authorization. |
| **[docs/ATTEMPTS/](docs/ATTEMPTS/)** | Candidate attempt state machine, time limits, and resumption logic. |
| **[docs/ANSWERS/](docs/ANSWERS/)** | Optimistic concurrency control (OCC) answer autosaving and revision conflict handling. |
| **[docs/SUBMISSIONS/](docs/SUBMISSIONS/)** | Idempotent exam submission, duplicate prevention, and atomic grade calculation. |
| **[docs/AUTH/](docs/AUTH/)** | Role-based access control (RBAC), JWT rotation, and authentication endpoints. |
| **[docs/TESTING/](docs/TESTING/)** | Quality assurance standards, test pyramids, and validation methodologies. |
| **[docs/benchmarks/](docs/benchmarks/)** | Empirical concurrency benchmarks, capacity profiling, and scaling decision matrices. |
| **[docs/resilience/](docs/resilience/)** | Fault injection, chaos engineering reports, and failure recovery findings. |

---

## License & Attribution

This project is licensed under the terms of the [MIT License](LICENSE).  
Developed as an open-source academic demonstration by the ProctorNet Project Team.
