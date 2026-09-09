# Phase 27: Developer Operations & Secure Management Plane — Implementation Plan

> **Authoritative Specification & Design Blueprint**  
> **Status**: PENDING REVIEW  
> **Consolidated Scope**: Old Phase 28 (Developer & System Operations Portal) + Old Phase 29 (WireGuard Secure Management Plane & Network Segmentation)  
> **Repository Branch**: `main` (clean baseline after Phase 26 merge `1a74308`)  
> **Authoritative Architecture Hierarchy**:  
> 1. Notion Step 13 Final Re-Architecture (13.5 Modular Monolith & State Decoupling, 13.7 Zero-Trust Threat Model, 13.17 Defensive Engineering & Audit Immutability)  
> 2. `docs/DEVELOPMENT_PLAN.md`  
> 3. Existing Merged Repository (`main`)  
> 4. Existing Finalized Phase Plans & Documentation (Phases 1–26, ADR-0001 through ADR-0010)  
> 5. Existing Tests & Verification Artifacts  

---

## 1. Executive Summary & Phase Objective

**Phase 27** establishes the dedicated **Developer Operations Technical Control Plane** and the **Secure WireGuard Management Network Plane** for ProctorNet. It consolidates two mission-critical administrative and infrastructure domains into a unified, dependency-safe implementation:

1. **Track 1 — Developer Operations Portal (Old Phase 28)**:
   - A dedicated, role-isolated web portal for Developers, DevOps Engineers, and System Operators providing full-stack technical observability, live subsystem health monitoring, centralized log stream inspection with automated PII masking, technical audit feeds, visual infrastructure topology mapping, and incident triage across **all 6 dedicated screens**.
   - Strict adherence to the **Principle of Least Privilege**: the `DEVELOPER` role receives comprehensive technical telemetry and diagnostic maintenance tools, but is **strictly DENIED access to candidate Personally Identifiable Information (PII), government ID documents, biometric images/embeddings, candidate exam answers, and scorecards**.

2. **Track 2 — WireGuard Secure Management Plane (Old Phase 29)**:
   - Establishment and operationalization of a dedicated, high-performance kernel-level VPN management network using the canonical static IP subnet **`10.100.0.0/24`** (gateway: `10.100.0.1`, peer pool: `10.100.0.2`–`10.100.0.254`).
   - Strict architectural network segmentation: Administrative SSH (port 22) and Developer/Admin operational management surfaces are completely blocked from the public internet (`0.0.0.0/0`) and accessible **strictly through active WireGuard VPN sessions** or authorized AWS SSM Session Manager paths (`var.admin_cidr`).
   - Candidate examination web traffic (HTTPS 443, WSS 443, WebRTC UDP 40000–49999) remains 100% public via Nginx edge reverse proxy with **zero WireGuard VPN dependency or interference**.

---

## 2. Source Hierarchy & Non-Negotiable Architecture

```
                               +--------------------------------------------+
                               |     Notion Step 13 Final Re-Architecture    |
                               |    (13.5 Monolith, 13.7 Zero-Trust, 13.17)  |
                               +--------------------------------------------+
                                                     |
                                                     v
                               +--------------------------------------------+
                               |          docs/DEVELOPMENT_PLAN.md          |
                               |      (Phase 27 Master Roadmap & Matrix)     |
                               +--------------------------------------------+
                                                     |
                                                     v
                               +--------------------------------------------+
                               |        Existing Merged Main Branch         |
                               |      (Commit df34c25, Migrations 001-021)   |
                               +--------------------------------------------+
                                                     |
                                                     v
                               +--------------------------------------------+
                               |   Approved ADRs (ADR-0001 thru ADR-0010)   |
                               |         Proposed Phase 27 ADR-0011         |
                               +--------------------------------------------+
```

### Non-Negotiable Architectural Principles:
1. **Modular Monolith Baseline**: Single-host Node.js 24 LTS application on AWS EC2 with in-process modular domain boundaries.
2. **PostgreSQL as Authoritative Source of Truth**: PostgreSQL remains the sole authoritative business state store. Redis is strictly non-authoritative (ephemeral cache, token blacklist, and Pub/Sub fan-out).
3. **No New Message Brokers or Search Engines**: Zero introduction of Elasticsearch, Kafka, Kubernetes, or multi-region infrastructure. All logging and search capabilities are implemented via high-performance in-memory circular ring buffers and PostgreSQL indexing.
4. **Canonical WireGuard Subnet**: Authoritative management subnet is **`10.100.0.0/24`**. Use of `10.8.0.0/24` is strictly prohibited.
5. **No Database Migration Required**: System incidents, operational events, and peer lifecycle events reuse the existing immutable `audit_logs` table (`prevent_audit_log_mutation()` trigger). **`DATABASE MIGRATION: NOT REQUIRED`**.

---

## 3. Scope Boundary

### In-Scope (Committed Capabilities):
- **Workstream A (Control Plane Foundation & RBAC)**: Backend developer router (`/api/v1/developer/*`), strict RBAC gating (`DEVELOPER` role), zero-PII data sanitization middleware, frontend routing, and Developer AppLayout.
- **Workstream B (Subsystem Health Monitor)**: Aggregator querying **13 live component probes** (Node API, PostgreSQL Primary, PostgreSQL Replica/Lag, Redis, RabbitMQ, WebSocket Gateway, WebRTC SFU, Coturn, Outbox Poller, Evaluation Consumer, S3 Storage, Automated Backup, WireGuard Daemon) with standardized states (`UP`, `DEGRADED`, `DOWN`, `UNKNOWN`).
- **Workstream C (Centralized System Logs Viewer)**: High-performance in-memory circular ring buffer (`LogBuffer`) capturing recent structured log records, sub-second query filter (traceId, requestId, level, service, timestamp), and multi-layer PII/credential redaction.
- **Workstream D (Technical Audit Feed)**: Developer-scoped audit stream filtering operational, authentication, deployment, security, and WireGuard events without student PII leakage.
- **Workstream E (Infrastructure Topology Map)**: Interactive, accessible SVG-based service mesh diagram visualizing live components, health overlays, and database replication lag.
- **Workstream F (Incident Triage & Alerts Board)**: Active degradation detector, failure timeline, acknowledgment, and resolution workflow backed immutably by `audit_logs`.
- **Workstream G (WireGuard Network Gateway)**: WireGuard daemon setup on static subnet `10.100.0.0/24`, UDP port 51820 listener, and `wg0` network interface configuration.
- **Workstream H (Peer Management CLI & Key Lifecycle)**: Automated peer management utility (`infrastructure/wireguard/manage-peers.sh`) supporting Curve25519 key generation, IP allocation, client `.conf`/QR export, key rotation, and instant revocation.
- **Workstream I (Firewall Rules, Ingress Restrictions & SSH Isolation)**: `iptables`/`ufw` host firewall rules, Terraform security group rules restricting port 22 and management web endpoints to `10.100.0.0/24` or `var.admin_cidr`.
- **Workstream J (Boundary & Security Verification)**: Automated verification suite asserting zero public exposure of port 22, non-VPN access rejection for management portals, peer revocation enforcement, and strict developer PII denial.

### Explicitly Out-of-Scope:
- **Phase 28 Universal UX & Continuous Client AI**: Global WCAG 2.1 AA token overhaul, Playwright 5-role journeys, in-browser Web Worker gaze/face AI models.
- **Phase 29 Multi-AZ & Final Release**: Managed AWS RDS Multi-AZ migration, ElastiCache replication groups, ALB clustering, ASVS Level 2 penetration testing, and final runbook handover.

---

## 4. Repository Audit Findings

An exhaustive inspection of the merged `main` codebase reveals the following component readiness:

| Layer / Component | Existing Merged Capability | Reusability in Phase 27 | Phase 27 Delta / Required Extension |
| :--- | :--- | :--- | :--- |
| **RBAC / User Domain** | `userRoles.js` defines `DEVELOPER` role; Migration 018 check constraint includes `DEVELOPER`. | 100% Reusable | Add `/api/v1/developer/*` route mounting gated by `requireRole('DEVELOPER')`. |
| **Audit Log Service** | `audit.service.js` already allows `ADMIN` and `DEVELOPER` in `queryAuditLogs`. Table is append-only via Migration 015 trigger. | 100% Reusable | Add technical-only filter presets (`TECHNICAL_ONLY`) to prevent business metadata leakage to developers. |
| **Health Endpoints** | `health.routes.js` provides basic `/health` (liveness) and `/ready` (Postgres, Redis, RabbitMQ probes). | 80% Reusable | Expand into Comprehensive Health Aggregator covering all 13 subsystems with connection pool gauges and worker status. |
| **Logging Infrastructure** | `logger.js` uses Pino v9 with redaction paths (`sensitiveKeys`) and ISO timestamps. | 85% Reusable | Integrate in-memory circular ring buffer (`LogBuffer`) capturing the last 5,000 logs for sub-second developer log search. |
| **Trace Context** | `traceContext.js` and `requestId.js` generate and propagate W3C `traceparent`, `traceId`, and `spanId`. | 100% Reusable | Expose `traceId` search filter in `/api/v1/developer/logs` and frontend trace viewer. |
| **Frontend Routing** | `App.jsx` handles `RoleRoute`, `ProtectedRoute`, and navbar links for Candidate, Faculty, Invigilator, Admin. | 90% Reusable | Add `/developer/*` route group, Developer navigation in `Navbar.jsx`, and root redirect logic for `DEVELOPER` role. |
| **AWS Terraform IaC** | `terraform/modules/security_groups/` defines `ec2_ssh_admin` with `var.admin_cidr`. | 90% Reusable | Add UDP 51820 ingress rule for WireGuard VPN gateway; parameterize `admin_cidr` to `10.100.0.0/24`. |
| **Docker Compose** | `docker-compose.yml` (local) and `docker-compose.prod.yml` (EC2) orchestrate the runtime services. | 95% Reusable | Add local WireGuard network helper / mock daemon and host firewall configuration template. |

---

## 5. Architecture Diagrams

### 5.1 Comprehensive System Architecture & Network Boundary (SVG)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 580" width="100%" height="580" style="background:#0f172a; border-radius:8px;">
  <defs>
    <linearGradient id="grad-mgmt" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="grad-box-blue" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <linearGradient id="grad-box-green" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#064e3b"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
    <linearGradient id="grad-box-amber" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#78350f"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <linearGradient id="grad-box-purple" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#581c87"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>

  <!-- Title & Header -->
  <text x="480" y="35" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="18" font-weight="700" text-anchor="middle">ProctorNet Phase 27: Developer Operations &amp; Secure Management Plane</text>
  <text x="480" y="55" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">Network Boundary, WireGuard Subnet 10.100.0.0/24 &amp; Role-Isolated Developer Portal</text>

  <!-- PUBLIC INTERNET TRAFFIC ZONE (LEFT) -->
  <rect x="30" y="80" width="260" height="470" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
  <rect x="30" y="80" width="260" height="32" rx="6" fill="#334155"/>
  <text x="160" y="101" fill="#f1f5f9" font-family="system-ui, sans-serif" font-size="13" font-weight="600" text-anchor="middle">Public Client Zone (0.0.0.0/0)</text>

  <rect x="50" y="130" width="220" height="55" rx="4" fill="#0f172a" stroke="#475569" stroke-width="1"/>
  <text x="160" y="152" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="12" font-weight="600" text-anchor="middle">Candidate Exam Clients</text>
  <text x="160" y="170" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">HTTPS / WSS / WebRTC Edge</text>

  <rect x="50" y="200" width="220" height="55" rx="4" fill="#0f172a" stroke="#475569" stroke-width="1"/>
  <text x="160" y="222" fill="#a7f3d0" font-family="system-ui, sans-serif" font-size="12" font-weight="600" text-anchor="middle">Faculty &amp; Invigilators</text>
  <text x="160" y="240" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Standard Web App / Dashboard</text>

  <rect x="50" y="280" width="220" height="95" rx="4" fill="#2d1215" stroke="#e11d48" stroke-width="1"/>
  <text x="160" y="302" fill="#f43f5e" font-family="system-ui, sans-serif" font-size="12" font-weight="700" text-anchor="middle">PUBLIC ACCESS BLOCKED</text>
  <text x="160" y="322" fill="#fca5a5" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Port 22 (SSH) - REJECTED (403/Drop)</text>
  <text x="160" y="338" fill="#fca5a5" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">/developer/* - REJECTED (403)</text>
  <text x="160" y="354" fill="#fca5a5" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Internal DB/Redis/MQ - UNREACHABLE</text>

  <!-- WIREGUARD VPN MANAGEMENT PLANE (CENTER-TOP) -->
  <rect x="330" y="80" width="280" height="220" rx="6" fill="#1e293b" stroke="#7c3aed" stroke-width="2"/>
  <rect x="330" y="80" width="280" height="32" rx="6" fill="#6d28d9"/>
  <text x="470" y="101" fill="#ffffff" font-family="system-ui, sans-serif" font-size="13" font-weight="600" text-anchor="middle">WireGuard Management Network</text>
  <text x="470" y="130" fill="#c4b5fd" font-family="system-ui, sans-serif" font-size="11" font-weight="700" text-anchor="middle">Subnet: 10.100.0.0/24 (Port 51820 UDP)</text>

  <rect x="350" y="145" width="240" height="40" rx="4" fill="#0f172a" stroke="#8b5cf6" stroke-width="1"/>
  <text x="470" y="162" fill="#ede9fe" font-family="system-ui, sans-serif" font-size="11" font-weight="600" text-anchor="middle">Peer Client: 10.100.0.2 - 10.100.0.254</text>
  <text x="470" y="176" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">Curve25519 Keypair + PSK Auth</text>

  <rect x="350" y="195" width="240" height="40" rx="4" fill="#0f172a" stroke="#8b5cf6" stroke-width="1"/>
  <text x="470" y="212" fill="#ede9fe" font-family="system-ui, sans-serif" font-size="11" font-weight="600" text-anchor="middle">WireGuard Gateway: 10.100.0.1 (wg0)</text>
  <text x="470" y="226" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">manage-peers.sh (Lifecycle Automation)</text>

  <rect x="350" y="245" width="240" height="45" rx="4" fill="#14532d" stroke="#22c55e" stroke-width="1"/>
  <text x="470" y="262" fill="#bbf7d0" font-family="system-ui, sans-serif" font-size="11" font-weight="700" text-anchor="middle">PERMITTED INGRESS</text>
  <text x="470" y="278" fill="#86efac" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">SSH (Port 22) + Developer Portal (/developer/*)</text>

  <!-- AWS EC2 HOST TRUST BOUNDARY (RIGHT & BOTTOM) -->
  <rect x="650" y="80" width="280" height="470" rx="6" fill="#1e293b" stroke="#3b82f6" stroke-width="2"/>
  <rect x="650" y="80" width="280" height="32" rx="6" fill="#1d4ed8"/>
  <text x="790" y="101" fill="#ffffff" font-family="system-ui, sans-serif" font-size="13" font-weight="600" text-anchor="middle">ProctorNet EC2 Host Boundary</text>

  <!-- NGINX EDGE REVERSE PROXY -->
  <rect x="670" y="125" width="240" height="50" rx="4" fill="url(#grad-box-blue)"/>
  <text x="790" y="146" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700" text-anchor="middle">Nginx Edge Reverse Proxy</text>
  <text x="790" y="162" fill="#bfdbfe" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">TLS 1.3 Termination (80 -> 443 / 8443)</text>

  <!-- NODE.JS MODULAR MONOLITH -->
  <rect x="670" y="190" width="240" height="135" rx="4" fill="url(#grad-box-purple)"/>
  <text x="790" y="210" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700" text-anchor="middle">Node.js Backend &amp; Telemetry</text>
  <text x="790" y="226" fill="#e9d5ff" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">- /api/v1/developer/* (requireRole DEVELOPER)</text>
  <text x="790" y="240" fill="#e9d5ff" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">- Health Aggregator (13 Probes)</text>
  <text x="790" y="254" fill="#e9d5ff" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">- LogBuffer Ring (5,000 logs, PII Masked)</text>
  <text x="790" y="268" fill="#e9d5ff" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">- Technical Audit Feed (Immutable)</text>
  <text x="790" y="282" fill="#e9d5ff" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">- Topology Generator (Interactive SVG)</text>
  <text x="790" y="296" fill="#e9d5ff" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">- Incident Triage State Machine</text>

  <!-- INTERNAL ISOLATED DATA PLANE -->
  <rect x="670" y="340" width="240" height="195" rx="4" fill="#0f172a" stroke="#475569" stroke-width="1.5"/>
  <text x="790" y="360" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="11" font-weight="700" text-anchor="middle">Internal Data Services (Loopback Only)</text>
  
  <rect x="685" y="375" width="210" height="30" rx="3" fill="#1e293b" stroke="#334155" stroke-width="1"/>
  <text x="790" y="394" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">PostgreSQL 16: 127.0.0.1:5432 (Sole Authority)</text>

  <rect x="685" y="415" width="210" height="30" rx="3" fill="#1e293b" stroke="#334155" stroke-width="1"/>
  <text x="790" y="434" fill="#f87171" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Redis 7: 127.0.0.1:6379 (Cache &amp; PubSub)</text>

  <rect x="685" y="455" width="210" height="30" rx="3" fill="#1e293b" stroke="#334155" stroke-width="1"/>
  <text x="790" y="474" fill="#fbbf24" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">RabbitMQ 3.13: 127.0.0.1:5672 (Queues)</text>

  <rect x="685" y="495" width="210" height="30" rx="3" fill="#1e293b" stroke="#334155" stroke-width="1"/>
  <text x="790" y="514" fill="#34d399" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Mediasoup SFU &amp; Coturn (Media Plane)</text>

  <!-- DEVELOPER PORTAL WORKSPACES (CENTER-BOTTOM) -->
  <rect x="330" y="320" width="280" height="230" rx="6" fill="#1e293b" stroke="#059669" stroke-width="2"/>
  <rect x="330" y="320" width="280" height="32" rx="6" fill="#047857"/>
  <text x="470" y="341" fill="#ffffff" font-family="system-ui, sans-serif" font-size="13" font-weight="600" text-anchor="middle">Developer Portal (6 Workspaces)</text>

  <text x="350" y="375" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="11" font-weight="500">1. /developer/overview (Telemetry KPIs)</text>
  <text x="350" y="398" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="11" font-weight="500">2. /developer/health (13-Component Matrix)</text>
  <text x="350" y="421" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="11" font-weight="500">3. /developer/logs (Masked Stream &amp; Trace)</text>
  <text x="350" y="444" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="11" font-weight="500">4. /developer/audit (Technical Event Feed)</text>
  <text x="350" y="467" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="11" font-weight="500">5. /developer/topology (Live Service Mesh)</text>
  <text x="350" y="490" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="11" font-weight="500">6. /developer/incidents (Degradation Triage)</text>

  <rect x="350" y="505" width="240" height="32" rx="4" fill="#064e3b" stroke="#10b981" stroke-width="1"/>
  <text x="470" y="525" fill="#a7f3d0" font-family="system-ui, sans-serif" font-size="10" font-weight="700" text-anchor="middle">ROLE: DEVELOPER (Strict Zero-PII Gating)</text>

  <!-- CONNECTING ARROWS & LABELS -->
  <line x1="270" y1="155" x2="670" y2="150" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4"/>
  <text x="310" y="148" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="9">Public HTTPS</text>

  <line x1="610" y1="190" x2="670" y2="170" stroke="#a78bfa" stroke-width="2"/>
  <text x="625" y="175" fill="#c4b5fd" font-family="system-ui, sans-serif" font-size="9">10.100.0.0/24</text>

  <line x1="610" y1="435" x2="670" y2="250" stroke="#10b981" stroke-width="2"/>
  <text x="618" y="325" fill="#34d399" font-family="system-ui, sans-serif" font-size="9">REST /api/v1/dev</text>
</svg>
```

---

## 6. Detailed Workstream Breakdown

### Track 1: Developer Operations Portal (Workstreams A–F)

#### Workstream A: Control Plane / Portal Foundation & RBAC
- **Objective**: Establish the core backend developer module (`backend/src/modules/developer/`), developer routes, RBAC authorization middleware, and frontend shell layout.
- **Key Files**:
  - `backend/src/modules/developer/developer.routes.js`: Routes for `/api/v1/developer/*` gated by `authenticate` and `requireRole('DEVELOPER')`.
  - `backend/src/modules/developer/developer.controller.js`: Request handlers and response envelope normalization.
  - `backend/src/modules/developer/developer.schemas.js`: Zod schemas validating queries and payload inputs.
  - `backend/src/modules/developer/developerPiiSanitizer.js`: Strict sanitizer filtering out student names, emails, USNs, answers, and biometrics.
  - `frontend/src/api/developerApi.js`: Centralized API client for all developer operations.
  - `frontend/src/components/layout/DeveloperLayout.jsx`: Dedicated developer navigation shell with sidebar/tabs.
- **Security & Authorization**:
  - Explicit 403 Forbidden for any non-`DEVELOPER` user trying to call `/api/v1/developer/*`.
  - Developer role attempting to access `/api/v1/candidate/identity/*` or `/api/v1/exams/:id/grading` is rejected with 403.
- **Testing**:
  - Unit tests for Zod schemas.
  - RBAC integration tests asserting 401 on missing token, 403 on `STUDENT`, `FACULTY`, `INVIGILATOR` calling developer endpoints, and 200 for `DEVELOPER`.

#### Workstream B: Subsystem Health Monitor & Telemetry Aggregator
- **Objective**: Build the live subsystem health aggregator querying **13 component probes** across all layers of the platform.
- **13 Probes Specification**:
  1. `api`: Node.js process uptime, RSS/heap memory, event loop latency (`libuv`).
  2. `postgres_primary`: Pool status (total, idle, active, waiting), ping latency via `SELECT 1`.
  3. `postgres_replica`: Standby status and replication lag via `pg_last_wal_receive_lsn()` (reports `STANDALONE` on single-host EC2).
  4. `redis`: Ping latency, memory consumption, connected clients, hit/miss counter.
  5. `rabbitmq`: Connection state, channel status, queues (`evaluation.jobs`, `retry.1`, `retry.2`, `dlq`).
  6. `websocket`: Connected sockets count, authenticated sockets, active rooms.
  7. `sfu`: Mediasoup worker status, active routers, audio/video transports, producers/consumers.
  8. `coturn`: Listener health, allocation count, socket responsiveness.
  9. `outbox_poller`: Poller active status, pending outbox events count, oldest pending event age in seconds.
  10. `evaluation_consumer`: Worker active status, in-flight jobs count, consumer tag.
  11. `s3_storage`: Evidence bucket accessibility via head request, endpoint latency.
  12. `backup_service`: Last backup timestamp, status (`SUCCESS`/`FAILED`), backup size from status file.
  13. `wireguard`: Interface `wg0` status, listening port 51820, active peer count, latest handshake timestamp.
- **State Classification**:
  - `UP`: Response within normal thresholds (latency < 500ms, queues clear, zero critical errors).
  - `DEGRADED`: Transient slowness (latency 500ms–2000ms, queue depth > 10, or backup delayed > 24h).
  - `DOWN`: Probe timed out (>2000ms), connection refused, or unhandled exception.
  - `UNKNOWN`: Probe disabled or unconfigured in current environment.
- **Performance & Safety**:
  - 2,000ms hard timeout per probe via `Promise.allSettled`.
  - 5-second in-memory cache TTL for health matrix to prevent denial-of-service from rapid refreshes.
  - `?force=true` parameter permits authenticated immediate bypass.

#### Workstream C: Centralized System Logs Viewer
- **Objective**: Implement sub-second structured log search and streaming with robust multi-layer PII and credential masking.
- **Log Ring Buffer (`LogBuffer`)**:
  - In-memory circular buffer storing the last 5,000 log records in-process.
  - Integrated directly with Pino stream in `backend/src/utils/logger.js`.
  - Memory footprint: ~5,000 JSON entries * 500 bytes ≈ 2.5 MB (negligible).
- **Log Query API (`GET /api/v1/developer/logs`)**:
  - Query parameters: `level` (`debug`, `info`, `warn`, `error`, `fatal`), `service` (string), `search` (substring/regex match on message), `traceId`, `requestId`, `startTime`, `endTime`, `limit` (default 50, max 200).
- **Automated PII & Credential Masking Engine**:
  - Pre-persistence: Pino `redact.paths` already strips tokens, passwords, and secrets.
  - Pre-serialization: `developerPiiSanitizer.js` inspects log payloads and applies regex masks:
    - Email: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` -> `user-***@masked.domain`
    - USN / Roll Number: `[0-9]{1,2}[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}` -> `USN-***-MASKED`
    - IP Address: `(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}` -> `$1.***.***`
    - Bearer tokens, passwords, cookies -> `[REDACTED]`

#### Workstream D: Technical Audit Feed & Event Stream
- **Objective**: Provide a developer-facing feed of technical, operational, and security audit events.
- **Target Event Categories**:
  - `AUTH_*`: Login success, failure, lockout, session revocation.
  - `SYSTEM_*`: Incident triggered, acknowledged, resolved, failover, backup complete/failed.
  - `OUTBOX_*`: Dispatch failure, dead-letter quarantine.
  - `SECURITY_*`: Tamper attempt detected, prototype pollution sanitized, rate limit exceeded.
  - `WIREGUARD_*`: Peer provisioned, revoked, rotated.
- **Data Protection**:
  - Excludes candidate submission bodies, answers, grades, and identity documents.
  - Queries `audit_logs` table directly using existing index `idx_audit_logs_timestamp`.

#### Workstream E: Infrastructure Topology Map
- **Objective**: Render an interactive, SVG-based visual service mesh of ProctorNet's live components.
- **Visualization**:
  - Nodes: Public Ingress, Nginx Edge, Node.js Backend, WireGuard Gateway, PostgreSQL, Redis, RabbitMQ, Worker Consumer, SFU/Coturn, S3.
  - Edges: Port labels, protocols (HTTPS, WSS, TCP, UDP, AMQP, SQL).
  - Dynamic Overlays: Real-time health badges on each node pulled from Workstream B.
  - Click Interaction: Selecting a node reveals connection metrics, active ports, and probe latency in a side drawer.

#### Workstream F: Incident Triage & Alerts Board
- **Objective**: Track, triage, and resolve operational degradations and component failures.
- **Data Model**:
  - Backed by the immutable `audit_logs` table using action types:
    - `SYSTEM_INCIDENT_TRIGGERED`
    - `SYSTEM_INCIDENT_ACKNOWLEDGED`
    - `SYSTEM_INCIDENT_RESOLVED`
- **Triage Workflow**:
  - Alert triggered automatically by health probe failure or manual developer filing.
  - Developer acknowledges incident: records developer user ID, timestamp, and acknowledgment note.
  - Developer resolves incident: records resolution root cause and resolution timestamp.
  - 100% audit immutability enforced by PostgreSQL trigger `prevent_audit_log_mutation()`.

---

### Track 2: WireGuard Secure Management Plane (Workstreams G–J)

#### Workstream G: WireGuard Gateway & Network Daemon
- **Objective**: Deploy and configure the WireGuard kernel interface on static subnet **`10.100.0.0/24`**.
- **Network Parameters**:
  - Interface: `wg0`
  - Gateway Address: `10.100.0.1/24`
  - Listening Port: `51820` (UDP)
  - MTU: `1420`
  - AllowedIPs: `10.100.0.0/24`
- **Server Configuration (`infrastructure/wireguard/wg0.conf.template`)**:
  ```ini
  [Interface]
  Address = 10.100.0.1/24
  ListenPort = 51820
  PrivateKey = ${WIREGUARD_SERVER_PRIVATE_KEY}
  PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT
  PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT

  # Peers dynamically appended below by manage-peers.sh
  ```

#### Workstream H: Peer CLI & Key Lifecycle Management
- **Objective**: Author the automated peer lifecycle management script `infrastructure/wireguard/manage-peers.sh`.
- **Peer States**:
  - `CREATED`: Keypair generated, IP reserved, profile exported.
  - `ACTIVE`: Added to live interface and permitted handshake.
  - `REVOKED`: Key removed from `wg0` interface; handshake dropped immediately.
  - `ROTATED`: Existing key revoked, new keypair and PSK issued.
- **CLI Commands**:
  - `./manage-peers.sh init`: Generates server keys and base configuration.
  - `./manage-peers.sh add <peer-name> [ip]`: Generates peer keypair, adds to `wg0.conf` and live interface (`wg set wg0 peer ...`), exports `<peer-name>.conf` and ASCII/ANSI QR code.
  - `./manage-peers.sh list`: Lists all peers, allocated IPs, public keys, and last handshake.
  - `./manage-peers.sh revoke <peer-name>`: Removes peer from live interface and marks revoked.
  - `./manage-peers.sh rotate <peer-name>`: Regenerates keypair, updates live interface, exports new configuration.
- **Key Storage Security**:
  - Private keys stored with `chmod 600` under `infrastructure/wireguard/keys/`.
  - Added to `.gitignore`; never committed to git repository.
  - AWS SSM Parameter Store sync utility for production environments.

#### Workstream I: Firewall Rules, Ingress Restrictions & SSH Isolation
- **Objective**: Configure network-level firewall boundaries restricting management ports.
- **Host Firewall Rules (`iptables` / `ufw`)**:
  - `iptables -A INPUT -p udp --dport 51820 -j ACCEPT` (WireGuard UDP tunnel)
  - `iptables -A INPUT -i wg0 -p tcp --dport 22 -j ACCEPT` (SSH from WireGuard subnet)
  - `iptables -A INPUT -p tcp --dport 22 -j DROP` (Block public SSH on eth0)
  - `iptables -A INPUT -i eth0 -s 10.100.0.0/24 -j DROP` (Anti-spoofing drop on external interface)
- **AWS Terraform Security Group Updates (`terraform/modules/security_groups/`)**:
  - Add `aws_vpc_security_group_ingress_rule.ec2_wireguard_udp`: Port 51820 UDP from `var.admin_cidr` (or `0.0.0.0/0` with WireGuard cryptographic auth).
  - Verify `ec2_ssh_admin`: Port 22 TCP restricted strictly to `var.admin_cidr` (never `0.0.0.0/0`).

#### Workstream J: Network Boundary & Security Verification
- **Objective**: Author automated tests asserting network boundaries and access rejection.
- **Test Matrix**:
  1. Rejection of public connections to port 22.
  2. Non-WireGuard IP calling `/api/v1/developer/*` receives 403 Forbidden.
  3. Revoked WireGuard peer cannot establish handshake.
  4. Candidate client traffic has zero access to management interfaces.
  5. Developer role cannot access student identity documents or exams even when connected via WireGuard.

---

## 7. Operational API Specifications

Mounted under `/api/v1/developer/*`:

| Endpoint | Method | Role | Request Payload | Response Data | Error Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/developer/overview` | `GET` | `DEVELOPER` | None | `{ status, uptime, kpis, componentsSummary, activeIncidentsCount }` | 401, 403 |
| `/api/v1/developer/health` | `GET` | `DEVELOPER` | Query: `force` (bool) | `{ timestamp, overallStatus, probes: [13 subsystem probes with metrics] }` | 401, 403, 500 |
| `/api/v1/developer/logs` | `GET` | `DEVELOPER` | Query: `level, service, search, traceId, requestId, startTime, endTime, limit` | `{ logs: [...], count, totalBuffered, piiMasked: true }` | 400, 401, 403 |
| `/api/v1/developer/audit` | `GET` | `DEVELOPER` | Query: `action, resourceType, traceId, page, limit` | `{ audit_logs: [...], pagination: { page, limit, total } }` | 400, 401, 403 |
| `/api/v1/developer/topology` | `GET` | `DEVELOPER` | None | `{ nodes: [...], edges: [...], liveStatus: {...} }` | 401, 403 |
| `/api/v1/developer/incidents` | `GET` | `DEVELOPER` | Query: `status, severity, page, limit` | `{ incidents: [...], pagination }` | 400, 401, 403 |
| `/api/v1/developer/incidents/:id/ack` | `POST` | `DEVELOPER` | Body: `{ note: string }` | `{ incidentId, status: 'ACKNOWLEDGED', acknowledgedAt, acknowledgedBy }` | 400, 401, 403, 404 |
| `/api/v1/developer/incidents/:id/resolve` | `POST` | `DEVELOPER` | Body: `{ rootCause: string, note: string }` | `{ incidentId, status: 'RESOLVED', resolvedAt, resolvedBy }` | 400, 401, 403, 404 |

---

## 8. Database Impact Analysis

### Verdict: **`DATABASE MIGRATION: NOT REQUIRED`**

**Technical Justification**:
1. The authoritative `user_roles` check constraint already includes `DEVELOPER` (added in Migration 018).
2. The `audit_logs` table (Migrations 001, 015) already supports `actor_user_id`, `action`, `resource_type`, `resource_id`, `request_id`, and `metadata` (JSONB), protected by append-only triggers.
3. System incidents and operational lifecycle transitions map directly to immutable audit actions (`SYSTEM_INCIDENT_TRIGGERED`, `SYSTEM_INCIDENT_ACKNOWLEDGED`, `SYSTEM_INCIDENT_RESOLVED`).
4. Log search queries are served from the high-performance in-memory ring buffer (`LogBuffer`), eliminating any need for database logging tables.
5. WireGuard peer configurations are stored in the host filesystem under `infrastructure/wireguard/peers/` with mode `0600`.

---

## 9. Local Development vs. AWS Production Split

| Capability | Local Development Environment | AWS Production EC2 Deployment |
| :--- | :--- | :--- |
| **WireGuard Daemon** | Simulated via user-space helper or mock script (`mock-wireguard.js`) for cross-platform Windows/macOS testing. | Native Linux kernel `wg0` interface managed via `systemd` (`wg-quick@wg0`). |
| **SSH Boundary** | Port 22 disabled or mapped to local container for testing. | Port 22 restricted strictly to `var.admin_cidr` (WireGuard IP pool) in AWS SG; SSM Session Manager as primary. |
| **Firewall Rules** | Application-level IP filter middleware enforcing subnet checks on `/api/v1/developer/*`. | Kernel `iptables` / `ufw` rules + AWS VPC Security Group rules. |
| **Log Ring Buffer** | In-process buffer in Node.js backend container. | In-process buffer + stdout routed to CloudWatch Logs agent. |
| **Secret Management** | Local `.env` file and mock keys in `infrastructure/wireguard/keys/` (`.gitignored`). | AWS Systems Manager (SSM) Parameter Store (`/proctornet/production/wireguard/*`) fetched via `fetch-secrets.sh`. |

---

## 10. Comprehensive Threat Model & Mitigations

| Threat | Impact | Mitigation Strategy | Verification / Test |
| :--- | :--- | :--- | :--- |
| **Compromised Developer Credential** | Unauthorized access to technical telemetry. | Developer role has zero access to student PII, exam answers, or biometrics. Session revocation via Redis blacklist. | Automated test asserting developer cannot read candidate identity or exam answers. |
| **Compromised WireGuard Peer Key** | Unauthorized access to management network. | Instant peer revocation via `./manage-peers.sh revoke <peer>`, dropping handshake within seconds. | Test asserting revoked peer public key is rejected by `wg0`. |
| **Public API Port 22 Scanning** | Brute-force SSH attacks. | Port 22 completely unreachable from `0.0.0.0/0`; dropped at AWS Security Group and `iptables`. | Nmap / port-scan test confirming port 22 is closed/filtered from public IP. |
| **Log-Based PII Leakage** | Candidate data exposed in developer logs. | Dual-layer masking: Pino `redact.paths` at source + regex sanitizer in `developerPiiSanitizer.js` before serialization. | Unit tests asserting emails, USNs, and tokens are replaced with masked placeholders. |
| **SSRF toward Management Services** | Attacker pivoting through candidate upload. | Management plane runs on dedicated `10.100.0.0/24` subnet with anti-spoofing `iptables` drop rules on external interface. | Security integration test verifying candidate endpoint cannot route to `10.100.0.1`. |
| **BOLA / IDOR on Developer Endpoints** | Cross-tenant telemetry tampering. | Developer endpoints do not accept candidate IDs; all incident actions log actor user ID immutably. | BOLA automated test suite on developer routes. |

---

## 11. Tiered Testing Strategy & Verification Plan

### Level 1: Static Analysis & Schema Checks
- `eslint` and `prettier` passes with 0 errors across new developer backend and frontend files.
- Zod schema validation tests for all developer query parameters.
- `terraform fmt -check` and `tflint` across updated security group files.

### Level 2: Targeted Unit Tests
- `developerSchemas.test.js`: Validates all request query/body validators.
- `developerPiiSanitizer.test.js`: Asserts 100% redaction of emails, USNs, passwords, tokens, and IP octets.
- `healthProbes.test.js`: Mocks individual probes asserting correct `UP`/`DEGRADED`/`DOWN` classification.
- `logBuffer.test.js`: Validates circular ring buffer FIFO eviction, search filtering, and sub-second execution.
- `DeveloperPages.test.jsx`: Vitest component tests for all 6 developer screens.

### Level 3: Subsystem Integration Tests
- `developerApi.test.js`: Integration tests querying `/api/v1/developer/*` with valid and invalid developer JWTs.
- `incidentLifecycle.test.js`: Verifies incident triggering, acknowledgment, resolution, and immutable audit logging.
- `healthAggregator.test.js`: Real integration queries across live Postgres, Redis, and RabbitMQ.

### Level 4: Security & Network Boundary Tests
- `developerRbac.test.js`: Asserts strict 403 Forbidden for non-developer roles on developer routes.
- `developerPiiIsolation.test.js`: Asserts developer role is denied from reading candidate PII, ID documents, answers, and biometrics.
- `wireguardBoundary.test.js`: Asserts management endpoints reject requests without authorized management IP headers.
- `peerLifecycle.test.sh`: Automated shell test creating, listing, rotating, and revoking WireGuard peers.

### Level 5: Full Regression Gate
- Full backend test suite passing (`npm test`).
- Full frontend test suite passing (`npm test -- --run`).
- Clean production frontend build (`npm run build`).

---

## 12. Complete Traceability Matrix

| Source Requirement | Requirement Description | Phase 27 Workstream | Implementing Modules | Verification Method | Acceptance Criteria |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Req-F** / Old 28.1 | Developer Role in RBAC | A | `backend/src/domain/user/userRoles.js` | `developerRbac.test.js` | Role `DEVELOPER` authenticated and isolated; denied business PII. |
| **Req-F** / Old 28.2 | Developer Overview Screen | A | `frontend/src/pages/developer/DeveloperOverviewPage.jsx` | `DeveloperPages.test.jsx` | Renders telemetry summary, subsystem status counts, and KPIs. |
| **Req-F** / Old 28.3 | Subsystem Health Monitor | B | `backend/src/modules/developer/healthAggregator.js`, `DeveloperHealthPage.jsx` | `healthAggregator.test.js` | Live telemetry for all 13 subsystems; status badges, latency gauges. |
| **Req-F** / Old 28.4 | Central System Logs Viewer | C | `backend/src/modules/developer/logBuffer.js`, `DeveloperLogsPage.jsx` | `developerPiiSanitizer.test.js` | Sub-second log search with traceId filter and automated PII masking. |
| **Req-F** / Old 28.5 | Technical Audit Stream | D | `backend/src/modules/developer/developer.service.js`, `DeveloperAuditPage.jsx` | `developerApi.test.js` | Immutable audit feed for operational/security events; zero student PII. |
| **Req-F** / Old 28.6 | Infrastructure Topology Map | E | `DeveloperTopologyPage.jsx` | `DeveloperPages.test.jsx` | Interactive SVG service mesh with live health indicators and replication lag. |
| **Req-F** / Old 28.7 | Incident Triage & Alerts | F | `backend/src/modules/developer/incidentService.js`, `DeveloperIncidentsPage.jsx` | `incidentLifecycle.test.js` | Surfaces service degradations; supports Acknowledge & Resolve workflows. |
| **Req-G** / Old 29.1 | WireGuard Service Deployment | G | `infrastructure/wireguard/wg0.conf.template` | `wireguardBoundary.test.js` | Interface `wg0` listening on UDP 51820 with static subnet `10.100.0.0/24`. |
| **Req-G** / Old 29.2 | Peer Key Management & CLI | H | `infrastructure/wireguard/manage-peers.sh` | `peerLifecycle.test.sh` | Generates keys, allocates IPs, exports `.conf` and QR codes, instant revocation. |
| **Req-G** / Old 29.3 | Management Plane Isolation | I | `terraform/modules/security_groups/main.tf`, `iptables` | Security Group audit | Port 22 unreachable from `0.0.0.0/0`; management restricted to WireGuard. |
| **Req-G** / Old 29.4 | Candidate Traffic Separation | J | `frontend/nginx/default.conf` | Network integration test | Public candidates use HTTPS/WSS/WebRTC edge with zero WireGuard access. |

---

## 13. Proposed Architecture Decision Record: ADR-0011

```markdown
# ADR-0011: Developer Operations Telemetry Architecture, Circular Log Ring-Buffer Aggregation, and WireGuard Network Segmentation Boundary

## Status: PROPOSED (Pending Plan Approval)
## Date: 2026-09-09

## Context & Problem Statement
Phase 27 requires an operational control plane for developers and a secure management network plane without introducing heavy external infrastructure (such as Elasticsearch or Kubernetes). Developers require sub-second log inspection, real-time health telemetry across 13 subsystems, and remote administrative access, while candidate PII, biometric data, and examination state must remain strictly protected.

## Decision Drivers
1. Zero addition of complex distributed search infrastructure (Elasticsearch/OpenSearch).
2. Strict non-negotiable WireGuard management subnet: `10.100.0.0/24`.
3. Complete elimination of public SSH port 22 exposure (`0.0.0.0/0`).
4. Strict least-privilege role isolation preventing developer access to candidate business data.
5. Zero new database migrations (`DATABASE MIGRATION: NOT REQUIRED`).

## Decision Outcome
1. Implement high-performance in-memory circular ring buffer (`LogBuffer`) in backend capturing recent 5,000 structured logs with multi-layer PII redaction.
2. Structure 13 comprehensive subsystem health probes with 2,000ms timeout and 5s cache TTL.
3. Model technical incidents directly upon the immutable `audit_logs` table.
4. Deploy WireGuard on subnet `10.100.0.0/24` with automated peer management CLI (`manage-peers.sh`).
5. Enforce dual-layer boundary: AWS Security Group + Host Firewall for SSH and management web interfaces.

## Consequences & Trade-offs
- Positive: Zero external dependencies; sub-second log search; ironclad PII isolation; append-only audit immutability; total elimination of public SSH attack surface.
- Trade-off: In-memory log buffer retains recent 5,000 entries (older historical logs reside in CloudWatch / log files).
```

---

## 14. Workstream Decomposition & Dependency-Safe Parallelization

```
[TRACK 1: DEVELOPER PORTAL]                 [TRACK 2: WIREGUARD MANAGEMENT]

  Workstream A: Portal Foundation & RBAC       Workstream G: WireGuard Gateway (10.100.0.0/24)
           │                                                │
           ├──────────────────────────────┐                 │
           ▼                              ▼                 ▼
  Workstream B: Health Monitor   Workstream C: Logs    Workstream H: Peer CLI & Key Lifecycle
           │                              │                 │
           ├──────────────────────────────┤                 │
           ▼                              ▼                 ▼
  Workstream D: Audit Feed       Workstream E: Topology Workstream I: Firewall & Ingress Rules
           │                              │                 │
           └──────────────┬───────────────┘                 │
                          ▼                                 │
                 Workstream F: Incidents                    │
                          │                                 │
                          └────────────────┬────────────────┘
                                           ▼
                            Workstream J: Boundary Verification
                                           │
                                           ▼
                               Level 5 Full Regression Gate
```

### Shared File Serialization Rules:
- `backend/src/routes/index.js`: Mount developer routes once during Workstream A.
- `frontend/src/App.jsx`: Mount developer routes once during Workstream A.
- `terraform/modules/security_groups/`: Modified strictly in Workstream I.
- Independent files (individual developer pages, health probes, CLI scripts) execute in parallel without conflict.

---

## 15. Plan Quality Gate Checklist

- [x] Current repository audited across backend, frontend, infrastructure, and documentation.
- [x] Phase 26 verified as 100% complete and merged.
- [x] WireGuard authoritative subnet confirmed as `10.100.0.0/24` (NOT `10.8.0.0/24`).
- [x] All Old Phase 28 requirements covered across 6 screens and backend telemetry APIs.
- [x] All Old Phase 29 requirements covered across WireGuard gateway, peer CLI, and firewall.
- [x] No Phase 28 (UX/AI) or Phase 29 (Multi-AZ/HA) scope pulled forward prematurely.
- [x] Strict developer PII isolation model specified (zero candidate PII, IDs, or biometrics).
- [x] Multi-layer log masking architecture specified (source redaction + API regex sanitization).
- [x] Database migration explicitly declared **`NOT REQUIRED`**.
- [x] Architecture diagrams rendered in clean SVG only (no Mermaid, no ASCII).
- [x] Tiered Level 1–5 test inventory specified.
- [x] Proposed ADR-0011 formulated.
- [x] Plan-only mode strictly respected: zero application code or infrastructure modified.
