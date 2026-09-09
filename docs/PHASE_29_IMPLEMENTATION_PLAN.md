# Phase 29 Implementation Plan — HA, Final Security, Compliance & Release

Status:
PLAN ONLY — READY FOR REVIEW

---

## 1. Executive Summary

Phase 29 represents the final planned engineering phase in the ProctorNet Re-Architecture roadmap. It consolidates the historical objectives of:
- **Old Phase 32**: Infrastructure Horizontal Scaling, High Availability & Managed Service Migration
- **Old Phase 33**: Final Security Hardening, Penetration Testing & Compliance Readiness
- **Old Phase 34**: Final Documentation, Operational Runbooks & Release Handover

The purpose of Phase 29 is to transition the fully functional, modular-monolith ProctorNet system (proven through Phases 0–28) into a resilient, highly available, secure, observable, and fully documented production release. This plan establishes the architectural specifications, managed AWS service activation, failure domains, security controls (OWASP Top 10, ASVS Level 2), privacy standards (FERPA, GDPR), disaster recovery procedures, operational runbooks, and multi-tier verification required for production handover.

In strict compliance with repository development governance, **this document is PLAN ONLY**. No source code, database migrations, or infrastructure changes are executed during this plan gate.

---

## 2. Current System Baseline & Gap Analysis

The ProctorNet repository on `main` contains a complete modular monolith backend (Node.js 24 LTS, Express, PostgreSQL, Redis, RabbitMQ, mediasoup SFU, Coturn STUN/TURN, S3 evidence storage) and frontend (React 19, Vite, responsive UI, client-side Web Worker screen AI inference).

### Comprehensive Baseline Matrix

| Component | Current State | Existing Resilience | Known Gap | Phase 29 Action | Validation Method |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | Single-host PostgreSQL 16.4 container on EC2 loopback (`127.0.0.1:5432`) with persistent EBS gp3 volume. | Docker restart policy, EBS daily snapshots, Phase 22 verified transaction rollbacks. | Single point of failure (AZ outage / host failure halts DB); connection pool ceiling (10–20 connections); non-SSL loopback. | Activate Terraform Multi-AZ Amazon RDS PostgreSQL 16 (`var.enable_rds = true`); configure client TLS (`DB_SSL=true`) matching `rds.force_ssl = 1`; evaluate connection pool tuning. | RDS Multi-AZ forced failover test (`reboot-db-instance --force-failover`); connection pool exhaustion test; client TLS handshake assertion. |
| **Redis Cache & Ephemeral Store** | Single-host Redis 7.4 container on EC2 loopback (`127.0.0.1:6379`) with AOF persistence. | Fail-open cache fallback to PostgreSQL; in-process memory fallback for sliding-window rate limiting; Phase 22 verified. | Single point of failure; cache flush clears rate-limit buckets; no multi-node replication; non-TLS. | Activate Terraform Amazon ElastiCache Redis 7 replication group (`var.enable_elasticache = true`, 2 nodes, multi-AZ, transit encryption). Update `client.js` for TLS auth (`REDIS_TLS=true`). | ElastiCache primary failover test; transit TLS connection assertion; fail-open fallback benchmark. |
| **RabbitMQ Broker** | Single-host RabbitMQ 3.13.7 container on EC2 loopback (`127.0.0.1:5672`) with persistent volume. | Quorum queues, publisher confirms, consumer ACKs, DLQ routing, transactional outbox buffer in PostgreSQL; Phase 22 verified. | Broker outage halts asynchronous background processing (buffered in outbox until recovery); single node. | Authoritative Baseline: Retain containerized RabbitMQ with Quorum Queues (`x-queue-type: quorum`) and transactional outbox in PostgreSQL. Amazon MQ documented as future alternative. | Pause broker container; verify transactional outbox buffering in PostgreSQL; verify zero message loss upon restoration. |
| **Backend API Monolith** | Single Node.js 24 process containerized on host network (`127.0.0.1:4000`), systemd/Docker supervised. | Graceful shutdown handler (SIGTERM/SIGINT drains WS, HTTP, outbox, consumers); cluster health probes (`/ready`, `/live`). | Host compute bound; no horizontal load balancing; rolling deployments cause brief connection disruption. | Activate Terraform AWS Application Load Balancer (`var.enable_alb = true`) with multi-AZ target groups; configure multi-container backend fleet with ALB connection draining. | ALB target group health check eviction test; rolling deployment traffic continuity test. |
| **WebSocket Control Plane** | In-process WebSocket server mounted on HTTP server; ChannelManager for room multiplexing; Redis Pub/Sub syncing. | Cross-node Redis Pub/Sub broadcast with `originInstanceId` deduplication; client reconnect with backoff; Phase 16/22 verified. | If Redis Pub/Sub degrades, falls back to local in-process broadcasting only (isolated rooms on multi-instance setups). | Harden Redis Pub/Sub reconnect resilience; document ALB sticky sessions as optional optimization; verify client reconnect state reconciliation. | Multi-instance WebSocket cross-node broadcast test; Redis severance fail-degraded test. |
| **WebRTC SFU Media Plane** | In-process mediasoup C++ worker pool (1–4 workers); deterministic session hashing; per-worker generation fencing. | Worker crash recovery isolates crashing worker, increments epoch, and signals connected clients to renegotiate ICE (ADR-0007). | SFU binds dynamic host UDP ports (`40000–49999`); cannot route through Layer 7 ALB; static single announced IP breaks multi-host setups. | Formalize direct Layer 4 UDP ingress topology bypassing ALB (ADR-0010); implement dynamic instance-specific announced IP resolution via AWS IMDSv2; implement mediasoup pipe transports. | mediasoup pipe transport inter-router media relay test; dynamic announced IP resolution verification; UDP line-rate stress test. |
| **Coturn STUN/TURN** | Single-host Coturn 4.6.2 container on host network (ports 3478, 49152–49250/udp). | Ephemeral short-lived credentials generated by API (`iceService.js`). | Single TURN relay point; NAT traversal bottleneck if candidate firewalls block direct WebRTC UDP. | Retain host-networked Coturn relay with multi-IP binding or evaluate dual-AZ TURN deployment behind Route 53 latency routing. | External TURN relay connectivity test from simulated symmetric NAT environment. |
| **AWS Infrastructure** | Terraform modules in `terraform/modules/` (vpc, security_groups, s3, iam, ec2, cloudwatch, rds, elasticache, alb). | Declarative IaC, remote S3 state backend with native S3 locking (`use_lockfile = true`), dual-AZ VPC. | Managed service modules (rds, elasticache, alb) toggled off; ALB module requires `certificate_arn` to be passed from production root. | Expose and wire `certificate_arn` from ACM in `terraform/environments/production/`; activate managed service modules; validate Checkov compliance. | `terraform plan` execution; Checkov security policy sweep; AWS dry-run validation. |
| **Network & Security Boundaries** | Dual-AZ VPC with 2 public, 2 private subnets; security groups restricting internal ports (5432, 6379, 5672) to loopback/VPC. | Strict ingress rules; public ports restricted to 80, 443, 51820, and UDP media ranges. | Management SSH currently relies on WireGuard or bastion; NAT Gateways currently omitted for cost savings. | Retain strict subnet boundaries; confirm private subnets house RDS and ElastiCache; verify zero public access to data tiers. | Port scanner / nmap ingress audit; AWS VPC flow log inspection. |
| **WireGuard Management Plane** | Dedicated WireGuard gateway (`wg0`) configured on canonical subnet `10.100.0.0/24`; port 51820/udp. | iptables drops port 22 on `eth0` and allows port 22 exclusively on `wg0` from `10.100.0.0/24`. | Manual peer generation via shell script; key rotation runbook unwritten. | Preserve canonical `10.100.0.0/24` subnet strictly (`10.8.0.0/24` prohibited); document AWS SSM Session Manager as redundant out-of-band access; author peer lifecycle runbook. | WireGuard handshake test; port 22 external drop assertion; peer revocation test. |
| **Object Storage (S3)** | Private S3 evidence bucket and backup bucket with SSE-S3/KMS, BPA, and versioning. | Direct pre-signed uploads (ADR-0005); application-authoritative retention sweeper. | S3 upload failure during active candidate exam can drop periodic snapshot evidence. | Retain application-authoritative retention; add strictly bounded client-side retry queue (max 5 snapshots, max 10MB, 10m drop timeout); verify Glacier transition rules. | Direct presigned upload integration test; S3 permission boundary assertion; retention sweeper verification. |
| **Secrets & Credentials** | `infrastructure/fetch-secrets.sh` retrieves secrets from AWS Secrets Manager / SSM; injected via `.env`. | Zero hardcoded credentials in repository; `.env.example` templates; CI secret scanning. | Secrets rotation requires manual container restart; automated rotation lambdas not configured. | Document secrets rotation runbook; verify zero credential leakage across logs, git, and Docker images. | Git secret scan (git-secrets / TruffleHog); structured log audit for PII / secrets. |
| **Observability & Telemetry** | Prometheus metrics endpoint (`/metrics`); Pino structured logging; 500-entry in-memory ring buffer for developer console. | Live health checks (`/ready`, `/live`); 13 subsystems functionally probed on `/developer/health`; PII masking on logs. | No centralized external log aggregator; alarms not tied to automated SNS paging. | Connect CloudWatch log groups to host agent; configure critical CloudWatch / SNS metric alarms (CPU, DB, 5XX, disk). | Synthetic threshold breach alarm test; developer log viewer latency benchmark. |
| **Security Controls & ASVS** | Helmet security headers, CORS whitelist, bcrypt (cost 12), JWT rotation, account lockout, anti-tamper signing, SQLSTATE 20000 audit immutability. | Defense-in-depth implemented across Phases 1–28; zero client score trust; server-authoritative scoring. | Formal OWASP ASVS Level 2 verification matrix uncompiled; formal DAST/SAST penetration testing report ungenerated. | Execute comprehensive SAST, DAST, dependency sweep (Trivy, npm audit), and compile formal ASVS Level 2 verification matrix (internal validation, no external certification). | Automated security regression suite; DAST scan (OWASP ZAP); npm audit / Trivy clean report. |
| **Privacy & Data Retention** | Authoritative database triggers (`audit_immutability`); separate retention columns across biometrics, documents, evidence, backups. | Purge sweepers for expired evidence; biometric template revoking; raw images unpersisted in continuous proctoring. | Automated retention purge sweepers run as ad-hoc scripts rather than scheduled systemd/cron timers in production. | Establish production systemd timer / scheduled task for `evidence.service.js` retention sweeper; compile FERPA/GDPR compliance control mapping. | Retention sweeper automated test; audit log immutability trigger assertion (`SQLSTATE 20000`). |
| **Disaster Recovery** | `infrastructure/backup-db.sh` executes daily pg_dump, compresses, and syncs to S3 backup bucket. | S3 versioning and Glacier Instant Retrieval transition after 30 days. | Restore procedure has not been verified via live disaster recovery drill; RPO/RTO targets unmeasured. | Single-region Multi-AZ recovery is authoritative for Phase 29; secondary-region rebuild is out of scope; author DR runbook and execute live restore drill. | Live restore walkthrough drill; RPO/RTO stopwatch measurement against targets. |
| **API Documentation** | Express routes with Zod validation schemas; Markdown API specifications in `docs/`. | Request schemas enforce strict validation and reject unauthorized parameters. | No machine-readable OpenAPI 3.1 specification for external client generation or API gateway integration. | Generate complete OpenAPI 3.1 specification (`docs/api/openapi.json`) covering 100% of REST routes across all 5 roles; verify mechanically against route tables. | Automated route comparison test (`expressRoutes` vs `openApiRoutes`); OpenAPI 3.1 schema validator test. |
| **Release & Rollback** | `infrastructure/deploy.sh` pulls Docker images, runs migrations, restarts containers. | Single-script deployment; Docker image rollback possible. | Rollback requires manual container tagging; blue/green or zero-downtime rolling deployment not automated behind ALB. | Implement ALB-aware rolling deployment and instant rollback script; establish immutable image tagging (git commit SHA); note zero schema DDL changes in Phase 29. | Automated rollback drill in staging; smoke test gate assertion. |

---

## 3. Scope / Out of Scope

### 3.1 In Scope
1. **Managed AWS Infrastructure Activation**: Activating Terraform modules for Multi-AZ RDS PostgreSQL 16, Multi-AZ ElastiCache Redis 7, and Application Load Balancer with ACM TLS 1.3 certificate wiring.
2. **High Availability & Fault Tolerance**: Multi-instance backend deployment behind ALB with connection draining and health-check eviction; Multi-AZ database failover; Redis replication group failover.
3. **Application & WebSocket Scaling**: Stateless backend scaling; Redis Pub/Sub cross-node event distribution with deduplication; WebSocket connection persistence and reconnection reconciliation.
4. **SFU Media Plane Scaling & Resilience**: Dedicated media routing topology; session pinning; worker crash recovery; dynamic instance-specific announced IP resolution via AWS IMDSv2; mediasoup pipe transport inter-router clustering design.
5. **Database Resilience**: Managed RDS Multi-AZ automatic failover; continuous automated WAL archiving and Point-in-Time Recovery (PITR); client-side TLS connection pooling (`DB_SSL=true`); automated daily S3 backup lifecycle; zero DDL schema migrations.
6. **Redis & RabbitMQ Resilience**: Fail-open/fail-closed degradation behavior matrix; RabbitMQ containerized baseline with quorum queues, publisher confirms, DLQ routing, and transactional outbox durability in PostgreSQL.
7. **Comprehensive Security Hardening**: OWASP Top 10 and ASVS Level 2 control validation; full audit of authentication, authorization (RBAC/ABAC), token lifecycle, account lockout, cryptographic anti-tampering, security headers, CSP, and supply chain.
8. **WireGuard Management Boundary**: Strict enforcement of `10.100.0.0/24` management subnet; isolation of SSH port 22; AWS SSM Session Manager redundancy; key rotation and peer revocation runbooks.
9. **Privacy & Compliance Readiness**: FERPA and GDPR control mapping; separate data retention schedules; automated retention purge sweeper operationalization; audit log immutability verification.
10. **Disaster Recovery**: Single-region Multi-AZ operational recovery; backup validation; live restore walkthrough drill; empirical RPO and RTO measurement against targets.
11. **Observability & Incident Response**: CloudWatch metrics and alarm thresholds; structured log aggregation; 12 production incident triage runbooks.
12. **OpenAPI 3.1 Specification**: Complete machine-readable API definition covering all 5 roles, request/response schemas, error codes, and authentication methods, mechanically verified against Express route registration.
13. **Release Engineering & Rollback**: Immutable container artifact pipeline; pre-deployment gates; health check smoke tests; rolling deployment and automated rollback procedures.
14. **Full System E2E & Load Regression**: End-to-end journey suites across all 5 roles (Student, Invigilator, Faculty, Admin, Developer); multi-tier concurrency benchmarking (100, 250, 500, 1,000 candidates); chaos engineering re-verification.

### 3.2 Out of Scope (Explicit Non-Goals)
- **No Premature Microservices**: The ProctorNet backend remains an authoritative modular monolith.
- **No Kubernetes (EKS/K8s)**: Kubernetes is not required or justified for the current scale; deployment targets EC2, Docker Compose, and ALB.
- **No Multi-Region Active-Active**: Architecture operates within a single primary AWS region (`ap-south-1`) across multiple Availability Zones.
- **Secondary-Region Cold Rebuild is OUT OF SCOPE**: Multi-region disaster recovery requires S3 Cross-Region Replication (CRR), KMS multi-region key replication, secondary-region Terraform environments, and DNS failover routing, all of which are deferred beyond Phase 29.
- **No Database Sharding**: Single PostgreSQL cluster with Multi-AZ standby provides ample capacity.
- **No Alternate Databases or Message Brokers**: PostgreSQL and RabbitMQ remain exclusive authoritative engines; Kafka or MongoDB are strictly excluded.
- **No New Product Feature Development**: Phase 29 focuses strictly on hardening, reliability, compliance, documentation, and release.
- **No Phase 30**: Phase 29 is the final engineering phase in the project plan.

---

## 4. Architecture Constraints & Invariants

All Phase 29 designs must strictly adhere to the established architectural invariants:

1. **Modular Monolith**: Clean domain boundaries (Auth, Users, Exams, Sessions, Attempts, Answers, Evaluation, Proctoring, Audit, Developer) within a unified codebase.
2. **PostgreSQL Authoritative Business Store**: Single source of truth for all business-critical state. Durable write on disk before HTTP `200/201` acknowledgement.
3. **Redis Non-Authoritative**: Ephemeral caching, rate-limiting, and WebSocket Pub/Sub only. Total Redis failure must never corrupt or lose candidate answers or submission state.
4. **RabbitMQ Asynchronous Transport**: Decoupled worker queueing for asynchronous evaluation and notifications. Outbox pattern ensures at-least-once message delivery.
5. **Transactional Outbox Durability**: Domain events committed in the same database transaction as entity mutations; outbox poller guarantees delivery.
6. **Server-Authoritative Security Model**: All timings, eligibility, question randomization, scoring, and proctoring risk calculations are computed server-side.
7. **Media Plane Isolation**: WebRTC SFU traffic (UDP line-rate) is decoupled from HTTP/WebSocket control plane. Continuous proctoring is screen-only (Phase 28 client Web Worker AI); continuous camera/microphone AI is strictly excluded.
8. **WireGuard Canonical Management Subnet**: Management network is strictly `10.100.0.0/24`. `10.8.0.0/24` is prohibited. Port 22 is unreachable from `0.0.0.0/0`.
9. **Five Authoritative Roles**: `ADMIN`, `DEVELOPER`, `FACULTY`, `INVIGILATOR`, `STUDENT`. Strict RBAC/ABAC on every route. Developer role has zero candidate PII access.
10. **Runtime & Language Baseline**: Backend strictly Node.js 24 LTS, Express, ES Modules. Frontend strictly React 19, Vite, JavaScript. No TypeScript.

---

## 5. High Availability Architecture

### 5.1 Definitional Rigor
To avoid ambiguity, operational terms are strictly delineated:
- **FAILOVER**: Automatic or manual redirection of traffic from a failed primary component to a pre-provisioned standby component (e.g. RDS Multi-AZ failover, ElastiCache replica promotion). Involves brief transient connection termination and DNS propagation ($60–120\text{ s}$ [TARGET]). It is an availability and disaster-mitigation mechanism, **NOT zero-downtime**.
- **HIGH AVAILABILITY (HA)**: Redundant system topology spanning independent failure domains (Dual Availability Zones) capable of absorbing single-component outages without human intervention or platform-wide service failure.
- **ZERO-DOWNTIME**: Reserved strictly for stateless application rolling deployments behind an Application Load Balancer with connection draining, where empirical testing proves zero dropped requests during instance recycling.

```
                                    AWS Cloud (ap-south-1)
                     +---------------------------------------------------+
                     |           Route 53 DNS (exam.proctornet.com)      |
                     +-------------------------+-------------------------+
                                               |
                   +---------------------------+---------------------------+
                   | (HTTPS / Port 443)                                    | (Direct WebRTC UDP)
                   v                                                       v
     +---------------------------+                           +---------------------------+
     |  Application Load Balancer|                           |   Direct Host Elastic IP  |
     | (Dual-AZ: Subnet 1a / 1b) |                           |  (Bypasses Layer 7 ALB)   |
     +-------------+-------------+                           +-------------+-------------+
                   |                                                       |
        +----------+----------+                                            |
        |                     |                                            |
        v                     v                                            v
+---------------+     +---------------+                            +---------------+
| Backend App 1 |     | Backend App 2 |                            | Coturn / SFU  |
|  (AZ1: 1a)    |     |  (AZ2: 1b)    | <========================> | Media Nodes   |
| Node.js 24    |     | Node.js 24    |     mediasoup Pipe         | UDP 40000-    |
| Port 4000     |     | Port 4000     |     Transport Relay        | 49999 / 3478  |
+-------+-------+     +-------+-------+                            +---------------+
        |                     |
        +----------+----------+
                   |
     +-------------+-------------+
     |                           |
     v                           v
+-------------------------+ +-------------------------+
|   Amazon RDS PostgreSQL | |  Amazon ElastiCache     |
|   16 Multi-AZ (Primary) | |  Redis 7 (Primary)      |
|   AZ 1a (Synchronous)   | |  AZ 1a (Multi-AZ)       |
+------------+------------+ +------------+------------+
             |                           |
             | Synchronous               | Asynchronous
             | Replication               | Replication
             v                           v
+-------------------------+ +-------------------------+
|   Amazon RDS PostgreSQL | |  Amazon ElastiCache     |
|   16 Multi-AZ (Standby) | |  Redis 7 (Replica)      |
|   AZ 1b (Standby Host)  | |  AZ 1b (Auto-Failover)  |
+-------------------------+ +-------------------------+
```

### 5.2 Application Tier High Availability
- **Multi-Instance Deployment**: Dual active backend container instances deployed across two separate EC2 instances residing in distinct Availability Zones (`ap-south-1a` and `ap-south-1b`).
- **Load Balancing**: AWS Application Load Balancer distributes HTTP/HTTPS traffic across backend instances using round-robin distribution.
- **Health Checks & Automatic Eviction**: ALB probes `GET /ready` on port 4000 at 15-second intervals. An instance failing 3 consecutive probes is automatically marked unhealthy and evicted from the target pool.
- **Connection Draining**: ALB connection draining set to 15 seconds [CONFIGURED]. During container deployment, in-flight HTTP requests complete before the container terminates.
- **Graceful Shutdown**: The backend `gracefulShutdown` function traps `SIGTERM`, drains WebSocket connections with code 1001 (Going Away), halts HTTP listener, drains the transactional outbox poller and evaluation consumers (up to 5s), and safely closes database connection pools.

### 5.3 WebSocket Tier High Availability
- **Cross-Node Event Fan-Out**: RealtimeBroadcaster utilizes Redis Pub/Sub (`proctornet:ws:events`). When an event is emitted on Instance A, it publishes to Redis. Instance B receives the payload and delivers it to local sockets subscribed to that session room.
- **Message Deduplication**: Every event contains `originInstanceId` and `eventId`. Sockets ignore re-broadcasts originating from their own instance, preventing message loops.
- **ALB Sticky Sessions (Optional Optimization)**: May be enabled on the ALB target group (`stickiness { type = "lb_cookie", cookie_duration = 86400 }`) as an optional transport optimization to reduce socket reconnect frequency during rolling updates. **It is NOT required for business logic correctness**, because Redis Pub/Sub already externalizes room broadcasting across all instances.
- **Client Reconnection Protocol**: Frontend `useWebSocket` hook implements exponential backoff reconnection (500ms, 1s, 2s, 4s, max 10s). Upon reconnection, client fetches active attempt state via REST (`GET /attempts/:id`) to reconcile missed events.

### 5.4 SFU Media Plane Scaling & Resilience
- **Direct Layer 4 UDP Ingress**: WebRTC media traffic (UDP ports `40000–49999`) and Coturn STUN/TURN traffic (UDP ports `3478`, `49152–49250`) cannot be processed by Layer 7 ALBs. Media traffic connects directly to host Elastic IPs via security group rules (ADR-0010).
- **Dynamic Instance-Specific Announced IP**: In a multi-node topology, each EC2 instance possesses a distinct public Elastic IP. `sfuManager.js` must resolve its announced public IP dynamically via AWS IMDSv2 (`curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4`) or accept an instance-specific environment variable injected during deployment. A single global static IP is strictly prohibited.
- **Session Pinning**: All candidates and invigilators assigned to a specific examination session are pinned to the same SFU worker or media node using deterministic session hashing (`deterministicHash(sessionId) % numWorkers`).
- **mediasoup Pipe Transports**: When invigilator monitoring exceeds single-router capacity, mediasoup pipe transports (`router.createPipeTransport()`) route media producers across routers and worker processes with $< 2\text{ ms}$ IPC latency [TARGET].
- **Worker Crash Recovery**: Implemented via ADR-0007. If a C++ `mediasoup-worker` process crashes, the `SfuManager` isolates the fault, marks only affected sessions as `RESETTING`, spawns a replacement worker with an incremented generation epoch, and broadcasts an ICE restart notification to affected clients. Unaffected workers continue uninterrupted.

---

## 6. AWS Infrastructure Finalization

### 6.1 VPC & Subnet Topology
- **VPC**: `10.0.0.0/16` in region `ap-south-1`.
- **Public Subnets**:
  - `Subnet-Public-1a`: `10.0.1.0/24` (ALB, Frontend Nginx, Coturn, WireGuard, SFU)
  - `Subnet-Public-1b`: `10.0.2.0/24` (ALB Standby, Secondary Media Node)
- **Private Subnets**:
  - `Subnet-Private-1a`: `10.0.10.0/24` (RDS Primary, ElastiCache Primary, Internal Compute)
  - `Subnet-Private-1b`: `10.0.11.0/24` (RDS Standby, ElastiCache Replica)
- **Database Subnet Group**: Composed of `Subnet-Private-1a` and `Subnet-Private-1b`.
- **ElastiCache Subnet Group**: Composed of `Subnet-Private-1a` and `Subnet-Private-1b`.

### 6.2 Security Group Trust Boundaries
1. **ALB Security Group (`sg-alb`)**:
   - Ingress: TCP 80 (`0.0.0.0/0`), TCP 443 (`0.0.0.0/0`).
   - Egress: TCP 8080 / TCP 4000 to `sg-backend`.
2. **Backend / EC2 Security Group (`sg-backend`)**:
   - Ingress: TCP 8080 from `sg-alb`.
   - Ingress: TCP 4000 from `sg-alb` (internal API).
   - Ingress: UDP 40000–49999 from `0.0.0.0/0` (mediasoup WebRTC line-rate media).
   - Ingress: UDP 3478, 49152–49250 from `0.0.0.0/0` (Coturn STUN/TURN).
   - Ingress: UDP 51820 from `0.0.0.0/0` (WireGuard management tunnel).
   - Ingress: TCP 22 strictly from WireGuard subnet `10.100.0.0/24`.
   - Ingress: TCP 5432, 6379, 5672 strictly from `sg-backend` (internal loopback/inter-node).
3. **RDS Security Group (`sg-rds`)**:
   - Ingress: TCP 5432 strictly from `sg-backend`. Zero ingress from `0.0.0.0/0`.
4. **ElastiCache Security Group (`sg-elasticache`)**:
   - Ingress: TCP 6379 strictly from `sg-backend`. Zero ingress from `0.0.0.0/0`.

### 6.3 Managed Service Activation Configuration & ACM Wiring
In `terraform/modules/alb/main.tf`, the HTTPS listener requires `var.certificate_arn != ""`.
Therefore, Phase 29 implementation must:
1. Declare `variable "certificate_arn"` in `terraform/environments/production/variables.tf`.
2. Pass `certificate_arn = var.certificate_arn` into `module.alb` in `terraform/environments/production/main.tf`.
3. Provision/validate an AWS Certificate Manager (ACM) TLS certificate for `exam.proctornet.com` prior to setting `enable_alb = true`.

In `terraform/environments/production/terraform.tfvars`:
```hcl
enable_rds         = true
enable_elasticache = true
enable_alb         = true
certificate_arn    = "arn:aws:acm:ap-south-1:ACCOUNT_ID:certificate/CERT_UUID"

# RDS Configuration
instance_class          = "db.t4g.medium" # 2 vCPU, 4GB RAM (ARM-based Graviton3)
allocated_storage       = 50
max_allocated_storage   = 200
multi_az                = true
backup_retention_period = 30 # 30 days continuous backup (PITR)

# ElastiCache Configuration
node_type          = "cache.t4g.small" # 2 vCPU, 1.37GB RAM
num_cache_clusters = 2
```

---

## 7. Application Scaling

### 7.1 Statelessness Requirements
- The Node.js application process maintains **zero durable in-memory state**.
- User sessions are tracked via stateless cryptographic JWT access tokens (15m expiry [CONFIGURED]) signed with `JWT_ACCESS_SECRET`.
- Revoked sessions and tokens are recorded in Redis blocklist with TTL matching token expiration.
- Exam configurations, blueprints, questions, attempts, answers, and scores reside exclusively in PostgreSQL.

### 7.2 Scaling Triggers & Thresholds
| Metric | Measurement Source | Scale-Out Trigger | Scale-In Trigger |
| :--- | :--- | :--- | :--- |
| **CPU Utilization** | CloudWatch EC2 / Container | $> 70\%$ for 3 consecutive minutes [TARGET] | $< 30\%$ for 10 consecutive minutes [TARGET] |
| **Memory Utilization** | CloudWatch Agent (`mem_used_percent`) | $> 80\%$ for 3 consecutive minutes [TARGET] | $< 40\%$ for 10 consecutive minutes [TARGET] |
| **Database Pool Wait Time** | Prometheus `db_query_duration_seconds` | $p95 > 500\text{ ms}$ [TARGET] | $p95 < 50\text{ ms}$ [TARGET] |
| **Active WebSocket Connections** | Prometheus `ws_connections_active` | $> 1,000$ connections per instance [TARGET] | $< 300$ connections per instance [TARGET] |

---

## 8. WebSocket/SFU Scaling

### 8.1 Multi-Instance WebSocket Room Synchronization
```
[Candidate A] ===> (WS to Node 1) ===> Publishes to Redis Channel ('proctornet:ws:events')
                                                        |
                                                        v
[Invigilator B] <== (WS from Node 2) <=== Node 2 Subscriber Dispatches to Room Session
```
- RealtimeBroadcaster uses Redis Pub/Sub to synchronize room events (`session:<id>`, `attempt:<id>`) across any number of backend nodes.
- Reconnection backoff: Initial delay 500ms, multiplier 2.0, jitter $\pm 20\%$, max delay 10s [CONFIGURED].

### 8.2 SFU Scaling Architecture & Terminology Rigor
To avoid ambiguity, media scaling units are strictly distinguished:
- **Candidate**: 1 human test taker taking an exam.
- **Producer**: 1 media track published by a candidate (in continuous proctoring: exactly 1 screen-video producer per candidate; camera/mic continuous producers are excluded).
- **Consumer**: 1 media track forwarded to an invigilator (if 12 candidates are monitored by 1 invigilator, that invigilator has 12 consumers).
- **WebRTC Transport**: 1 bidirectional network abstraction carrying RTP/RTCP packets over 1–2 UDP ports (via BUNDLE).
- **SFU Worker**: 1 single-threaded native C++ `mediasoup-worker` process pinned to 1 CPU core.

**Capacity Targets**:
- **Port Allocation**: 10,000 UDP ports (`40000–49999`) provide theoretical address space for up to 5,000 WebRTC transports per host (2 ports per transport) [ESTIMATED / TARGET].
- **Inter-Router Relays**: Multi-router pipe transports allow media from one worker to be consumed by clients connected to another worker process with $< 2\text{ ms}$ internal loopback latency [TARGET].

---

## 9. Database Resilience

### 9.1 Multi-AZ RDS Failover Mechanics
- Primary database resides in `Subnet-Private-1a`.
- Standby replica resides in `Subnet-Private-1b` with **synchronous physical replication**.
- Failover is classified as **HIGH AVAILABILITY / AUTOMATED FAILOVER**, not zero-downtime.
- When AWS detects primary failure (hardware, network, or OS crash):
  1. Standby is automatically promoted to primary.
  2. RDS updates Route 53 DNS record for the DB endpoint (`*.rds.amazonaws.com`) to point to the new primary.
  3. Failover duration: $60–120\text{ seconds}$ [TARGET].
  4. Client queries in-flight during DNS swap encounter connection severance; `pg.Pool` retry logic reconnects once DNS resolves to the new primary.

### 9.2 Point-in-Time Recovery (PITR) vs Application Backups
The database recovery strategy strictly separates AWS-managed continuous archiving from application-level dumps:
1. **AWS-Managed RDS Continuous Backups & PITR**:
   - AWS RDS continuously captures transaction logs (WALs) and automatically captures daily storage volume snapshots with a 30-day retention period.
   - Allows restoration of a new RDS instance to **any specific second** within the 30-day window (down to the provider-managed WAL flushing threshold, typically $< 5\text{ minutes}$ [TARGET]).
2. **Application-Level Backups (`infrastructure/backup-db.sh`)**:
   - Scheduled logical dumps via `pg_dump -Fc` compressed and synchronized to the private S3 backup bucket (`proctornet-backups-*`).
   - Retained for 90 days in S3 (transitioning to Glacier Instant Retrieval after 30 days) for independent cold-storage disaster recovery.
3. **Recovery Objectives**:
   - Recovery Point Objective (RPO): $< 5\text{ minutes}$ (RDS PITR WAL window) [TARGET].
   - Recovery Time Objective (RTO): $< 15\text{ minutes}$ (RDS automated snapshot restoration) [TARGET].

### 9.3 Database Connection Pool Hardening & Client TLS
- Client configuration in `backend/src/infrastructure/postgres/pool.js` must be updated to inject SSL configuration when `DB_SSL=true`:
  ```javascript
  const poolConfig = {
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    min: config.DB_POOL_MIN,
    max: config.DB_POOL_MAX,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
    ssl: config.DB_SSL ? {
      rejectUnauthorized: true,
      ca: config.DB_SSL_CA // AWS RDS global CA bundle
    } : false
  };
  ```
- Pool parameters:
  - `DB_POOL_MIN`: 2 connections per instance [CONFIGURED].
  - `DB_POOL_MAX`: 20 connections per instance [CONFIGURED].
  - `DB_CONNECTION_TIMEOUT_MS`: 5,000 ms [CONFIGURED].
  - `DB_IDLE_TIMEOUT_MS`: 30,000 ms [CONFIGURED].
- At 2 backend instances $\times$ 20 connections = 40 total connections, well below RDS PostgreSQL parameter group `max_connections = 200` [CONFIGURED].

### 9.4 Database Migration Safety & Categorization
- **DATABASE SCHEMA MIGRATION**: **NOT REQUIRED**.
  - Migrations `001` through `021` are complete, tested, and authoritative. Zero new DDL schema migrations (`022+`) are needed for Phase 29.
- **DATABASE PLATFORM / DATA MIGRATION**: **REQUIRED**.
  - Moving existing operational data from the single-host containerized PostgreSQL on EC2 to Amazon RDS PostgreSQL 16 Multi-AZ during a scheduled maintenance window via:
    ```bash
    pg_dump -h 127.0.0.1 -U postgres -d proctornet -Fc -f proctornet_prod.dump
    pg_restore -h <rds_endpoint> -U postgres -d proctornet -v proctornet_prod.dump
    ```

---

## 10. Redis & RabbitMQ Resilience

### 10.1 Redis Non-Authoritative Degradation Matrix
Redis failure must never result in data loss or broken examination submissions.

| Feature | Redis Normal State | Redis Failure State | Recovery Action |
| :--- | :--- | :--- | :--- |
| **Exam Config Cache** | Cache hit (sub-millisecond) | Fail-open: Transparent query to PostgreSQL | Warm cache on next read upon Redis reconnect |
| **Rate Limiting** | Distributed sliding window in Redis | Fail-open: In-memory sliding window per instance | In-memory buckets expire naturally; Redis resumes tracking |
| **Token Revocation** | Blacklist set in Redis | Fallback to PostgreSQL session status check | Reconnect to Redis |
| **WebSocket Sync** | Cross-node fan-out via Pub/Sub | RealtimeBroadcaster transitions to `DEGRADED` state; alerts sockets | Auto-transitions to `HEALTHY` upon Redis `ready` event |

### 10.2 RabbitMQ Resilience & Durability
- **Production Baseline**: **Option A (Containerized RabbitMQ 3.13 on EC2 with Quorum Queues + Persistent Volume + Transactional Outbox in PostgreSQL)** is the authoritative Phase 29 design. Option B (Amazon MQ) is documented as an alternative future option.
- **Quorum Queues**: Evaluation and notification queues use quorum queue architecture (Raft consensus) with `x-queue-type: quorum`.
- **Publisher Confirms**: Outbox dispatcher only marks an event `PUBLISHED` after RabbitMQ acknowledges persistent write (`channel.waitForConfirms()`).
- **Dead-Letter Handling**: Messages failing processing after 3 retry attempts with exponential backoff are routed to `evaluation.dlq` for operator triage.
- **Consumer Recovery**: Consumers automatically reconnect with backoff upon broker reconnection (`registerReconnectHook`).
- **Exactly-Once Business Effect**: Worker consumers maintain business idempotency:
  - Evaluation results enforce database unique constraint `unique_attempt_result` on `results(attempt_id)`.
  - Duplicate messages trigger no-op resolution.

---

## 11. Final Security Hardening

### 11.1 OWASP Top 10 & ASVS Level 2 Verification Matrix
The security posture is evaluated against **OWASP ASVS v4.0.3 Level 2** requirements as an internal control validation and audit framework (does not represent external third-party legal certification).

| ASVS Category | Requirement & System Control | Implementation File | Verification Method |
| :--- | :--- | :--- | :--- |
| **V1: Architecture** | Modular monolith with strict domain boundaries, authoritative PostgreSQL state, untrusted client state. | `docs/ARCHITECTURE.md` | Architecture invariant audit. |
| **V2: Authentication** | Secure password hashing (bcrypt, cost 12); account lockout after 5 consecutive failed attempts (15m window); secure HttpOnly SameSite cookies. | `backend/src/modules/auth/auth.service.js` | Automated password brute-force test; lockout trigger test. |
| **V3: Session Mgmt** | Dual JWT lifecycle (15m access token, 7d rotating refresh token); server-side session revocation in DB and Redis. | `backend/src/modules/auth/session.service.js` | Token rotation test; revoked token reuse rejection test. |
| **V4: Access Control** | Strict RBAC across 5 roles; resource-level ownership validation on 100% of endpoints (BOLA/IDOR prevention); Developer zero-PII boundary. | `backend/src/middleware/authenticate.js`, `roleGate.js` | Cross-role privilege escalation tests; BOLA attempt access tests. |
| **V5: Validation** | Strict Zod schema validation on 100% of request bodies, query parameters, and route params; parameterized SQL queries (`pg.query(text, params)`). | `backend/src/modules/**/*.schemas.js`, `pool.js` | SQL injection fuzzing test; invalid payload rejection tests. |
| **V6: Cryptography** | Cryptographic anti-tampering signing (`HMAC-SHA256`) on candidate mutations; TLS 1.3 enforced; AES-256-GCM for sensitive fields. | `backend/src/middleware/antiTamper.js` | Anti-tamper signature tampering rejection test. |
| **V7: Error & Logging** | Structured Pino logging; zero PII / secrets logged; circular log ring buffer (500 entries) with automated PII masking for developer console. | `backend/src/utils/logger.js`, `ringBuffer.js` | Log output secret scan; developer log viewer PII leak audit. |
| **V8: Data Protection** | Sensitive documents in private S3 bucket; short-lived pre-signed URLs (15m); database-level audit immutability trigger (`SQLSTATE 20000`). | `backend/src/infrastructure/storage/s3Client.js`, `migrations/015` | S3 direct public access denial test; audit log mutation rejection test. |
| **V9: Comm Security** | HTTPS strictly enforced (HTTP 301 redirect); TLS 1.3 (`ELBSecurityPolicy-TLS13-1-2-2021-06`); HSTS header with preloading. | `terraform/modules/alb/main.tf`, `nginx.conf` | SSL Labs test simulation; TLS protocol audit. |
| **V10: Malicious Code** | Minimal Alpine Linux base images; zero devDependencies in production runtime image; automated Trivy container vulnerability scanning in CI. | `backend/Dockerfile`, `.github/workflows/ci.yml` | Container vulnerability scan; devDependency leak assertion test. |
| **V11: Business Logic** | Strict examination state machine (`CREATED -> SCHEDULED -> IN_PROGRESS -> SUBMITTED -> EVALUATED -> PUBLISHED`); double-submit protection. | `backend/src/modules/attempts/attempts.service.js` | Concurrency race test; double-submit idempotency test. |
| **V12: File & Upload** | Pre-signed direct upload to S3; MIME type whitelist; file size caps (5MB images, 20MB docs); zero executable uploads. | `backend/src/modules/evidence/evidence.schemas.js` | Malicious file extension upload test; oversized upload rejection test. |
| **V13: API Security** | Distributed rate limiting (sliding window); CORS whitelist restricted to trusted domain; HTTP method whitelist. | `backend/src/middleware/rateLimiter.js`, `cors` | Rate limit breach test; CORS preflight cross-origin test. |
| **V14: Configuration** | Zero secrets in git; `.env.example` templates; least-privilege IAM instance roles; WireGuard management plane (`10.100.0.0/24`). | `terraform/modules/iam/main.tf`, `infrastructure/wireguard/` | AWS IAM policy simulator; git-secrets scan. |

### 11.2 WireGuard Management Boundary Hardening
- Canonical Management Subnet: `10.100.0.0/24` (Gateway: `10.100.0.1/24`). `10.8.0.0/24` is strictly prohibited.
- Firewall rule on host:
  ```bash
  iptables -A INPUT -p tcp --dport 22 -i wg0 -s 10.100.0.0/24 -j ACCEPT
  iptables -A INPUT -p tcp --dport 22 -i eth0 -j DROP
  ```
- SSH port 22 is completely unreachable from public internet (`0.0.0.0/0`).
- Candidate traffic (HTTP/WebSocket/WebRTC) has zero visibility into or routability to `10.100.0.0/24`.
- **Out-of-Band Redundancy**: AWS SSM Session Manager is configured via the IAM instance profile as an independent, zero-open-port management channel if an AZ failure disrupts the primary WireGuard bastion host.

---

## 12. Compliance & Privacy Readiness

### 12.1 Regulatory Scope & Positioning
> [!IMPORTANT]
> The platform achieves **COMPLIANCE READINESS** and **CONTROL VALIDATION** against FERPA and GDPR standards. In accordance with legal engineering ethics, ProctorNet does not claim external legal certification without an independent audit body.

### 12.2 FERPA Control Validation (Student Educational Record Privacy)
- **Role-Based Access**: Faculty can view only attempts for examinations they authored or supervise.
- **Zero Developer PII**: The Developer Operations plane (`/developer/*`) is strictly decoupled from candidate PII. Log viewers display masked student identifiers (`usr_****_1234`).
- **Student Ownership**: Candidates can only inspect their own attempts, scores, and feedback (`user_id = req.user.id`).
- **Audit Immutability**: All access to educational records is recorded in append-only audit logs protected by PostgreSQL trigger `SQLSTATE 20000`.

### 12.3 GDPR Control Validation (Data Minimization & Privacy)
- **Data Minimization**: Continuous video/audio is NOT recorded or stored. Single-frame snapshots are captured periodically (30s intervals) and client-side screen AI emits metadata telemetry only (Phase 28).
- **Separate Retention Schedules (Existing Repository Policy)**:
  - Raw Facial Biometric Images: Purged within **7 days** post-verification [EXISTING POLICY - Phase 25 §19].
  - Biometric Embedding Templates: Nulled/zeroed immediately upon account revocation (`BIOMETRIC_TEMPLATE_REVOKED`) [EXISTING POLICY - Phase 25 §19].
  - Liveness Challenge Artifacts: Purged **immediately** upon verification session completion [EXISTING POLICY - Phase 25 §19].
  - Exam Evidence Snapshots: Purged after **90 days** (configurable via `EVIDENCE_RETENTION_DAYS`) by application sweeper [CONFIGURED - Phase 20 §20.3].
  - Candidate Verification Documents: Purged **180 days** post-verification [EXISTING POLICY - Phase 24 §22].
  - Database Backups: Retained **90 days** in S3 (transitioning to Glacier after 30 days) in production, 14 days in staging [CONFIGURED].
  - Audit Trail: Permanently retained for academic integrity compliance [EXISTING POLICY - Phase 13 / Migration 015].
- **Right to Erasure (Article 17) vs Immutable Audit Logs**:
  - Under GDPR Article 17(3)(b) (compliance with legal obligation / academic integrity), academic audit logs are legally exempt from hard deletion.
  - In `audit_logs`, trigger `SQLSTATE 20000` strictly prevents `UPDATE`, `DELETE`, or `TRUNCATE`.
  - When an erasure request is executed, candidate personal identifiers (name, email, phone) are pseudonymized in `users` (`user_xxxx@deleted.local`, `Anonymous User`), breaking the link between PII and audit records while preserving referential integrity and audit trail continuity.

---

## 13. Disaster Recovery

### 13.1 Failure Domains & Recovery Strategy
The authoritative Phase 29 disaster recovery strategy is strictly **Single-Region Multi-AZ Operational Recovery** within AWS region `ap-south-1`. Secondary-region cold rebuild is explicitly classified as **[FUTURE / OUT OF SCOPE FOR PHASE 29 / REQUIRES SEPARATE ADR + S3 CRR + KMS REPLICATION]**.

| Failure Domain | Architectural Defense | Target RPO | Target RTO |
| :--- | :--- | :--- | :--- |
| **Container Crash** | Docker daemon `restart: unless-stopped` | $0\text{ seconds}$ [TARGET] | $< 5\text{ seconds}$ [TARGET] |
| **Host Instance Crash** | CloudWatch EC2 Status Check Auto-Recovery | $0\text{ seconds}$ [TARGET] | $< 3\text{ minutes}$ [TARGET] |
| **Single AZ Outage** | Multi-AZ RDS failover + ALB multi-AZ routing | $< 5\text{ minutes}$ [TARGET] | $< 2\text{ minutes}$ [TARGET] |
| **Catastrophic DB Corruption** | Point-In-Time Recovery (PITR) from AWS S3 WALs | $< 5\text{ minutes}$ [TARGET] | $< 15\text{ minutes}$ [TARGET] |
| **Secondary-Region Loss** | Multi-region DR / S3 Cross-Region Replication | *Out of Scope for Phase 29* | *Out of Scope for Phase 29* |

### 13.2 Live Restore Walkthrough Drill & Objective Success Criteria
Phase 29 includes an operational restore drill validating that backups are genuinely restorable.
**Objective Restore Verification Criteria**:
1. **Schema Validity**: All 21 database migrations (`001` through `021`) verified present and identical.
2. **Row Count Parity**: Exact row counts verified across core business tables (`users`, `exams`, `sessions`, `attempts`, `answers`, `results`, `audit_logs`).
3. **Foreign Key Integrity**: Zero orphan records detected via `scripts/load/verify-data-integrity.js`.
4. **ACID Invariant Verification**: All 8/8 invariants pass via `scripts/chaos/verify-resilience-invariants.js`.
5. **Archive Checksum**: SHA-256 hash parity verified between exported backup and restored file.
6. **Application Liveness**: Standalone backend container boots and reports `200 READY` against restored database.

---

## 14. Observability & Incident Response

### 14.1 Subsystem Health Matrix
The 13 subsystems monitored on the Developer Health dashboard (`/developer/health`) are functionally probed with bounded timeouts (2,000ms):
1. `database`: Active query execution (`SELECT 1 AS healthy`), connection pool availability.
2. `redis`: Ping response, connection readiness.
3. `rabbitmq`: Broker channel readiness, queue reachability.
4. `outbox`: Transactional outbox backlog query, pending event count.
5. `storage`: AWS S3 evidence bucket head bucket probe.
6. `websocket`: Active socket connection count, channel manager state.
7. `media`: SFU worker status, active transports, producer/consumer counts.
8. `coturn`: STUN/TURN port bind and relay status.
9. `auth`: Token signing key status, lockout tracker cache.
10. `system_metrics`: Host CPU, memory usage, heap allocation.
11. `wireguard`: Management interface `wg0` status, active peer count.
12. `alb`: Target group health, healthy host count.
13. `audit_log`: Trigger `SQLSTATE 20000` protection status, sequence continuity.

### 14.2 CloudWatch Alarms & Alerting Thresholds
- **High CPU**: EC2 CPUUtilization $> 80\%$ for 2 consecutive 5-minute periods $\to$ SNS Alert [TARGET].
- **High Memory**: CloudWatch Agent `mem_used_percent > 85%` for 2 consecutive periods $\to$ SNS Alert [TARGET].
- **Disk Saturation**: CloudWatch Agent `disk_used_percent > 85%` for 1 period $\to$ Critical SNS Alert [TARGET].
- **RDS Storage**: FreeStorageSpace $< 5\text{ GB}$ $\to$ Critical SNS Alert [TARGET].
- **ALB 5XX Errors**: HTTPCode_Target_5XX_Count $> 10$ in 1 minute $\to$ Critical SNS Alert [TARGET].

### 14.3 Production Incident Runbooks
12 standard operating runbooks authored in `docs/runbooks/`:
1. `RB-01-APP-OUTAGE.md`: Application container failure and rolling restart.
2. `RB-02-DB-FAILOVER.md`: Database primary failure, RDS failover, and pool reconnection.
3. `RB-03-REDIS-OUTAGE.md`: Redis degradation, cache bypass, and in-memory rate-limit fallback.
4. `RB-04-RABBITMQ-OUTAGE.md`: Broker disconnection, outbox backlog triage, and consumer recovery.
5. `RB-05-SFU-CRASH.md`: mediasoup worker crash, epoch fence reset, and ICE renegotiation.
6. `RB-06-SCREEN-STREAM-DEGRADED.md`: Network packet loss, bandwidth throttling, and stream recovery.
7. `RB-07-AUTH-OUTAGE.md`: Token verification failure, key rotation, and session recovery.
8. `RB-08-S3-OUTAGE.md`: Evidence upload failure, pre-signed URL expiration, and client retry.
9. `RB-09-AZ-OUTAGE.md`: AWS Availability Zone failure, DNS rerouting, and traffic draining.
10. `RB-10-SECURITY-INCIDENT.md`: Suspected intrusion, account lockdown, and audit trail isolation.
11. `RB-11-PII-LEAK-TRIAGE.md`: Suspected PII exposure, log scrubber execution, and notification.
12. `RB-12-DEPLOYMENT-ROLLBACK.md`: Failed deployment, health gate breach, and instant version rollback.

---

## 15. CI/CD & Release Engineering

### 15.1 Release Pipeline Architecture
```
[Git Push Tag: v1.0.0]
         │
         ▼
[Lint & Engine Validation] (Node 24+, migration sequence, env coverage)
         │
         ▼
[Parallel Unit & Integration Test Suites]
  ├─ test-frontend (Vitest, React 19 component suites)
  └─ test-backend (Node test runner, live Postgres, Redis, RabbitMQ, S3)
         │
         ▼
[Docker Multi-Stage Build & Security Scan]
  ├─ Multi-stage build (runner stage: production dependencies only)
  ├─ devDependency leak audit
  ├─ Trivy container image scan (zero CRITICAL; HIGH exceptions governed by policy)
  └─ npm audit (--omit=dev --audit-level=high)
         │
         ▼
[Automated Compose Integration & Health Gate]
  ├─ docker compose up -d
  ├─ Wait for /ready (200 OK)
  ├─ Verify database migration container exit code 0
  └─ Verify frontend index.html served
         │
         ▼
[OpenAPI 3.1 Route Coverage Validation]
  └─ Programmatic comparison of Express routes against openapi.json
         │
         ▼
[Artifact Promotion & Release Tagging]
  └─ Tag immutable container images with Git commit SHA and SemVer
```

### 15.2 Rollback Strategy & Compatibility Boundaries
- **Distinction of Rollback Domains**:
  1. **Application Rollback**: Instant container redeployment to previous commit SHA (`./infrastructure/deploy.sh --rollback`). Target duration: $< 5\text{ minutes}$ [TARGET].
  2. **Database Migration Rollback**: Because Phase 29 introduces **zero DDL schema changes (Database Migration: NOT REQUIRED)**, the database schema remains 100% backward-compatible with Phase 28 code, eliminating migration rollback risk.
  3. **Infrastructure Rollback**: Terraform state changes can be rolled back via version-controlled `.tfvars` toggles.
- **ALB Target Group Swap**: If blue/green target groups are active, ALB listener rules swap immediately to green target group.

---

## 16. Final E2E, Load, Security & Chaos Validation

### 16.1 Full System E2E User Journey Suites
Automated Playwright journey tests executed across all 5 roles:
1. **Student Journey**: Login $\to$ Account Setup $\to$ Document Upload $\to$ Biometric Verification $\to$ Exam Room Entry $\to$ System Readiness Check $\to$ Question Delivery $\to$ Answer Autosave $\to$ Screen AI Telemetry Streaming $\to$ Exam Submission $\to$ Result Inspection.
2. **Invigilator Journey**: Login $\to$ Session Monitor $\to$ Multi-Stream Video Matrix $\to$ Candidate Detail Drawer $\to$ Real-Time Telemetry Badge Triage (`[BROWSER]`, `[SCREEN AI]`, `[TECHNICAL]`) $\to$ Direct Interventions (Warn / Pause / Resume / Terminate) $\to$ Flag Dismissal with Audit Trail.
3. **Faculty Journey**: Login $\to$ Question Bank Creation $\to$ Blueprint Rules Definition $\to$ Exam Authoring & Publishing $\to$ Room Scheduling $\to$ Manual Subjective Grading $\to$ Results Publication.
4. **Admin Journey**: Login $\to$ User Lifecycle Management $\to$ Institutional Settings $\to$ Biometric Verification Override $\to$ Immutable Audit Log Inspection $\to$ System Health Oversight.
5. **Developer Journey**: Login $\to$ System Overview $\to$ Subsystem Health Matrix (13 subsystems) $\to$ Log Ring Buffer Viewer (Zero PII) $\to$ Technical Audit Feed $\to$ Infrastructure Topology Map $\to$ Incident Triage Simulator.

### 16.2 Concurrency & Capacity Benchmarks (Strict Classification)

| Concurrency Tier | Throughput (Lifecycle) | Lifecycle p95 | Autosave p95 | Submission p95 | Error Rate | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **25 Candidates** | $61.93\text{ req/s}$ | $210.89\text{ ms}$ | $70.74\text{ ms}$ | $436.53\text{ ms}$ | $0.00\%$ | **[MEASURED]** (Phase 21 Local Baseline) |
| **50 Candidates** | $104.69\text{ req/s}$ | $481.28\text{ ms}$ | $159.93\text{ ms}$ | $913.64\text{ ms}$ | $0.00\%$ | **[MEASURED]** (Phase 21 Local Degraded) |
| **100 Candidates** | $181.80\text{ req/s}$ | $936.54\text{ ms}$ | $153.12\text{ ms}$ | $1,566.64\text{ ms}$ | $0.00\%$ | **[MEASURED]** (Phase 21 Local Degraded) |
| **150 Candidates** | $230.11\text{ req/s}$ | $1,404.52\text{ ms}$ | $277.07\text{ ms}$ | $2,238.90\text{ ms}$ | $0.00\%$ | **[MEASURED]** (Phase 21 Local Saturation) |
| **250 Candidates** | $\sim 350\text{ req/s}$ | $< 800\text{ ms}$ | $< 150\text{ ms}$ | $< 1,000\text{ ms}$ | $< 0.1\%$ | **[TARGET]** (Multi-Instance / RDS Target) |
| **500 Candidates** | $\sim 650\text{ req/s}$ | $< 1,000\text{ ms}$ | $< 200\text{ ms}$ | $< 1,500\text{ ms}$ | $< 0.1\%$ | **[TARGET]** (Scale Target) |
| **1,000 Candidates**| $\sim 1,200\text{ req/s}$ | $< 1,500\text{ ms}$ | $< 250\text{ ms}$ | $< 2,000\text{ ms}$ | $< 0.5\%$ | **[ESTIMATED / TARGET]** (Design Envelope) |

### 16.3 Chaos & Failure Re-Verification
Verified exact scenario identifiers from `scripts/chaos/run-resilience-suite.js`:
- `CH-01`: Redis outage during active autosave $\to$ Zero data loss (Recovery 84ms) [MEASURED in Phase 22].
- `CH-02`: RabbitMQ outage during submission surge $\to$ Atomic DB commit and outbox buffering [MEASURED in Phase 22].
- `CH-03`: RabbitMQ restoration & outbox drain $\to$ Zero duplicate delivery (Recovery 75ms) [MEASURED in Phase 22].
- `CH-04`: Evaluation worker crash $\to$ DLQ routing and idempotent deduping (Recovery 48ms) [MEASURED in Phase 22].
- `CH-05`: Database pool saturation $\to$ Clean timeout without process crash (Recovery 11ms) [MEASURED in Phase 22].
- `CH-06`: Abrupt socket severance $\to$ Transaction rollback (Recovery 3ms) [MEASURED in Phase 22].
- `CH-07`: Container restart $\to$ Volume data persistence (Recovery 182ms) [MEASURED in Phase 22].
- `CH-08`: WebSocket severance $\to$ Reconnect and state reconciliation (Recovery 120ms) [MEASURED in Phase 22].
- `CH-09`: Network latency jitter $\to$ Idempotent submission deduping [MEASURED in Phase 22].
- `CH-10`: Dependency boot order independence $\to$ Clean readiness transition [MEASURED in Phase 22].
- `CH-L5`: Compound dual outage (Redis + RabbitMQ) $\to$ Complete data preservation and recovery in 317ms [MEASURED in Phase 22].

---

## 17. Operational Runbooks & Documentation

The final release deliverables include 5 comprehensive documentation artifacts:
1. `docs/api/openapi.json`: OpenAPI 3.1 specification covering 100% of REST API routes across all 5 roles.
2. `docs/runbooks/OPERATIONS_RUNBOOK.md`: System operations, scaling guides, monitoring alarm responses, and incident triage.
3. `docs/runbooks/WIREGUARD_RUNBOOK.md`: WireGuard management plane administration, peer onboarding, key rotation, and revocation.
4. `docs/runbooks/DISASTER_RECOVERY_RUNBOOK.md`: Disaster recovery runbook, backup verification, and live restore procedure.
5. `docs/DEVELOPER_GUIDE.md`: Developer onboarding, local environment setup, architecture standards, and contribution guide.

---

## 18. ADR Review & Candidate Architecture Decision Records

### 18.1 Existing ADR Status
- **ADR-0001 through ADR-0012**: All remain **ACCEPTED** and authoritative.

### 18.2 Proposed New Architecture Decision Records for Phase 29 (Status: PROPOSED)

#### Candidate ADR-0013: Managed AWS Multi-AZ Infrastructure Migration, Layer 7 Application Load Balancing, and Direct WebRTC Media Plane Ingress Topology
- **Status**: PROPOSED
- **Context**: Transitioning single-host baseline (ADR-0010) to high-availability multi-instance architecture.
- **Decision**: Activate Terraform AWS ALB for Layer 7 HTTPS and WebSocket traffic; pass ACM `certificate_arn` into ALB module; route Layer 4 WebRTC media directly to host Elastic IPs via security group rules, bypassing ALB; resolve media announced IP dynamically per host via AWS IMDSv2.
- **Consequences**: Zero ALB serialization bottlenecks on media; automated failover across dual AZs for HTTP/WebSocket traffic.

#### Candidate ADR-0014: Production Database High Availability, Automated Point-in-Time Recovery (PITR), and Connection Pool Resilience Architecture
- **Status**: PROPOSED
- **Context**: Securing enterprise database durability, automated failover, and high-concurrency connection pooling.
- **Decision**: Migrate containerized PostgreSQL to Amazon RDS PostgreSQL 16 Multi-AZ with synchronous replication; enforce TLS (`rds.force_ssl = 1`) and client TLS (`DB_SSL=true`); enable 30-day continuous WAL archiving (PITR); tune application connection pools (`DB_POOL_MAX = 20`).
- **Consequences**: Multi-AZ failover target $< 120\text{ s}$ [TARGET]; RPO $< 5\text{ min}$ [TARGET]; RTO $< 15\text{ min}$ [TARGET]; zero DDL schema migration required.

#### Candidate ADR-0015: Media Plane Session-Pinning Resilience, SFU Node Fault Isolation, and Inter-Router Media Routing Strategy
- **Status**: PROPOSED
- **Context**: Scaling mediasoup SFU across multi-worker and multi-instance topologies while maintaining crash resilience.
- **Decision**: Enforce session pinning via deterministic room hashing; retain per-worker generation fencing (ADR-0007); leverage mediasoup pipe transports for cross-worker media routing.
- **Consequences**: Fault isolation prevents single worker crash from affecting other exam rooms; seamless media scaling across available CPU cores.

---

## 19. Workstream Breakdown

```
Workstream A: Baseline, Environment Scaffolding & Release Governance
         │
         ├───────────────────────────────┬───────────────────────────────┐
         ▼                               ▼                               ▼
Track 1: Infrastructure & HA    Track 2: Security & Privacy     Track 3: Observability & DR
  ├─ WS-B: AWS Managed Services   ├─ WS-G: Security Hardening     ├─ WS-I: Disaster Recovery
  ├─ WS-C: Application Scaling    └─ WS-H: Compliance & Retention ├─ WS-J: Observability & Runbooks
  ├─ WS-D: SFU Media Scaling                                      └─ WS-K: OpenAPI 3.1 Spec
  ├─ WS-E: RDS Database HA
  └─ WS-F: Redis/RabbitMQ HA
         │                               │                               │
         └───────────────────────────────┴───────────────────────────────┘
                                         │
                                         ▼
                         Workstream L: Full System E2E, Load & Security Validation
                                         │
                                         ▼
                         Workstream M: Production Go-Live & Release Handover
```

### Workstream A: Baseline, Environment Scaffolding & Release Governance
- **Objective**: Establish release governance, branch protection, CI/CD validation gates, and pre-flight environment checks.
- **Dependencies**: None.
- **Repository Areas**: `.github/workflows/`, `package.json`, `docs/`.
- **Deliverables**: Release branch scaffolding, CI workflow validation, Node 24 engine lock assertions.
- **Validation**: CI lint and schema validation passes.
- **Security**: Strict branch protection rules; zero credential leakage.
- **Rollback**: Non-destructive documentation/config revert.
- **Completion Criteria**: CI pipeline verifies all repository invariants before workstreams begin.

### Workstream B: AWS Managed Services Activation & Multi-AZ Infrastructure
- **Objective**: Wire ACM `certificate_arn` in `production/variables.tf` and activate Terraform managed service modules for RDS, ElastiCache, and ALB in production environment.
- **Dependencies**: Workstream A.
- **Repository Areas**: `terraform/environments/production/`, `terraform/modules/`.
- **Deliverables**: Updated `terraform.tfvars`, dry-run `terraform plan`, Checkov policy compliance verification.
- **Validation**: `terraform validate` and `terraform plan` succeed with zero errors.
- **Security**: Security group trust boundaries strictly enforced; zero public database or cache access.
- **Rollback**: Revert `enable_*` toggles to `false`.
- **Completion Criteria**: Terraform plan demonstrates clean provisioning of managed services without resource destruction.

### Workstream C: Application Statelessness & ALB Horizontal Scaling
- **Objective**: Configure backend for multi-instance deployment behind ALB with health check eviction and connection draining.
- **Dependencies**: Workstream B.
- **Repository Areas**: `backend/src/server.js`, `backend/src/infrastructure/realtime/`, `infrastructure/`.
- **Deliverables**: ALB target group attachment, health probe tuning, graceful shutdown verification.
- **Validation**: ALB health check eviction simulation; rolling update zero-downtime test.
- **Security**: Ingress restricted to ALB security group; HTTPS termination with TLS 1.3.
- **Rollback**: Revert ALB listener routing to single host.
- **Completion Criteria**: Multiple backend instances serve traffic concurrently with automatic unhealthy host removal.

### Workstream D: SFU Media Plane Scaling, Session Pinning & Fault Isolation
- **Objective**: Operationalize mediasoup pipe transports, dynamic announced IP resolution via IMDSv2, and direct Layer 4 UDP media routing for multi-worker scaling.
- **Dependencies**: Workstream C.
- **Repository Areas**: `backend/src/infrastructure/media/sfuManager.js`, `iceService.js`.
- **Deliverables**: IMDSv2 public IP resolution, pipe transport inter-router clustering, session pinning verification, worker crash recovery assertions.
- **Validation**: mediasoup worker crash recovery test; multi-router media relay test; dynamic IP announcement verification.
- **Security**: Ephemeral TURN credentials; media traffic isolated from API traffic.
- **Rollback**: Revert to single-worker pool configuration.
- **Completion Criteria**: SFU handles multi-stream candidate video without packet loss or cross-worker fault propagation.

### Workstream E: Database Managed RDS Migration & Connection Resilience
- **Objective**: Migrate data to Amazon RDS PostgreSQL 16 Multi-AZ; configure client TLS (`DB_SSL=true`) with RDS CA bundle in `pool.js`; tune connection pooling.
- **Dependencies**: Workstream B.
- **Repository Areas**: `backend/src/infrastructure/postgres/pool.js`, `backend/src/config/env.js`.
- **Deliverables**: Client TLS support in `pool.js`, RDS data migration script, Multi-AZ failover drill.
- **Validation**: Forced RDS failover test; continuous WAL archiving assertion; zero data loss verification.
- **Security**: Enforce `rds.force_ssl = 1` and client-side TLS verification; database in private subnet; automated encryption at rest.
- **Rollback**: Fail back to local PostgreSQL container with EBS persistence.
- **Completion Criteria**: Zero data loss migration; sub-120s failover recovery [TARGET]; passing ACID invariant audit.

### Workstream F: Redis & RabbitMQ High Availability & Graceful Degradation
- **Objective**: Connect to ElastiCache Redis 7 replication group with transit encryption (`REDIS_TLS=true`); verify containerized RabbitMQ quorum queue baseline and non-authoritative degradation.
- **Dependencies**: Workstream B.
- **Repository Areas**: `backend/src/infrastructure/redis/client.js`, `backend/src/infrastructure/rabbitmq/client.js`.
- **Deliverables**: TLS configuration for ioredis, fail-open cache assertion, RabbitMQ quorum queue tuning.
- **Validation**: ElastiCache primary failover test; broker outage outbox buffering test.
- **Security**: Redis transit encryption enabled; AUTH token injected via AWS SSM.
- **Rollback**: Fall back to local containerized Redis.
- **Completion Criteria**: Platform absorbs Redis and RabbitMQ outages with zero candidate answer or submission data loss.

### Workstream G: Final Security Hardening, Cryptographic Integrity & ASVS Level 2
- **Objective**: Execute comprehensive security audit across all 14 ASVS Level 2 categories; verify cryptographic anti-tampering.
- **Dependencies**: Workstreams C, E.
- **Repository Areas**: `backend/src/middleware/`, `backend/src/modules/auth/`, `infrastructure/wireguard/`.
- **Deliverables**: Formal ASVS Level 2 compliance verification report, Trivy vulnerability scan clean report, npm audit resolution.
- **Validation**: Automated security penetration test suites; anti-tamper signature fuzzing; WireGuard port 22 drop audit.
- **Security**: Zero CRITICAL vulnerabilities; HIGH vulnerabilities governed strictly by `docs/SECURITY_AUDIT_EXCEPTIONS.md`; 100% anti-tamper mutation coverage.
- **Rollback**: Revert security policy modifications if functional regression occurs.
- **Completion Criteria**: Zero unmitigated vulnerabilities; full ASVS Level 2 checklist verification.

### Workstream H: Compliance Readiness, Privacy Auditing & Data Retention Purging
- **Objective**: Validate FERPA and GDPR controls; operationalize automated data retention purge sweepers; verify pseudonymized erasure without mutating immutable audit logs.
- **Dependencies**: Workstream E.
- **Repository Areas**: `backend/src/modules/evidence/evidence.service.js`, `backend/src/modules/biometrics/`.
- **Deliverables**: Scheduled retention sweeper timer, compliance verification matrix, audit immutability assertion.
- **Validation**: Retention purge sweeper test; biometric template revoking test; `SQLSTATE 20000` trigger test.
- **Security**: Automated destruction of expired PII and evidence; immutable audit trail.
- **Rollback**: Disable scheduled retention sweeper timer.
- **Completion Criteria**: All 5 artifact categories follow explicit retention schedules with full audit logging.

### Workstream I: Backup Automation, Disaster Recovery & Live Restore Drills
- **Objective**: Execute live disaster recovery drill from S3 daily backup to isolated verification instance; measure RPO/RTO against objective criteria.
- **Dependencies**: Workstreams B, E.
- **Repository Areas**: `infrastructure/backup-db.sh`, `docs/runbooks/DISASTER_RECOVERY_RUNBOOK.md`.
- **Deliverables**: Disaster Recovery Runbook, empirical RPO/RTO report, automated S3 backup verification script.
- **Validation**: Live database restore walkthrough; data integrity check on restored database (exact row counts, foreign keys, 8/8 invariants).
- **Security**: Encrypted backup storage with Glacier archival; access restricted to IAM backup role.
- **Rollback**: Non-destructive to active database (executed in isolated container).
- **Completion Criteria**: RTO $< 15\text{ minutes}$ [TARGET] and RPO $< 5\text{ minutes}$ [TARGET] verified through live drill.

### Workstream J: Observability Telemetry, CloudWatch Alarms & Production Runbooks
- **Objective**: Establish CloudWatch alarms, structured logging aggregation, and author 12 operational runbooks.
- **Dependencies**: Workstreams C, E, F.
- **Repository Areas**: `docs/runbooks/`, `backend/src/infrastructure/metrics/`, `terraform/modules/cloudwatch/`.
- **Deliverables**: 12 incident triage runbooks (`RB-01` through `RB-12`), CloudWatch alarm configuration.
- **Validation**: Synthetic metric threshold breach test; runbook procedure walkthrough.
- **Security**: Automated PII masking in structured logs; developer console zero-PII boundary.
- **Rollback**: Revert alarm threshold configurations.
- **Completion Criteria**: Complete runbook suite covering all 12 critical operational failure modes.

### Workstream K: Complete OpenAPI 3.1 Specification & API Documentation
- **Objective**: Author complete machine-readable OpenAPI 3.1 specification covering 100% of REST API routes across all 5 roles; establish mechanical verification test.
- **Dependencies**: Workstream A.
- **Repository Areas**: `docs/api/openapi.json`, `backend/src/routes/`.
- **Deliverables**: OpenAPI 3.1 JSON/YAML specification, mechanical route comparison test.
- **Validation**: Mechanical script traverses Express route tables and asserts 100% match against `openapi.json`; schema validator passes.
- **Security**: All authentication schemes, role gates, and error codes documented.
- **Rollback**: Non-destructive documentation revert.
- **Completion Criteria**: Every registered route across all 5 roles is fully documented and validated.

### Workstream L: Full System E2E, Load, Chaos & Security Penetration Validation
- **Objective**: Execute full system regression across all 5 roles, load benchmarks (100, 250, 500, 1,000 VUs), and 11-scenario chaos suite.
- **Dependencies**: Workstreams C, D, E, F, G, H, I, J, K.
- **Repository Areas**: `tests/`, `scripts/chaos/`, `scripts/load/`.
- **Deliverables**: Concurrency benchmark report, chaos verification report, E2E journey test results.
- **Validation**: 100% passing E2E suites; 8/8 passing ACID invariants; zero committed data loss.
- **Security**: Full penetration test suite execution against authentication, BOLA, and anti-tampering.
- **Rollback**: Isolate and patch any failing invariant before release sign-off.
- **Completion Criteria**: All 5 user roles validated end-to-end; load targets categorized (Measured / Estimated / Target).

### Workstream M: Production Release Engineering, Go-Live Verification & Rollback Readiness
- **Objective**: Execute release handover, build immutable production container artifacts, and verify rollback procedures.
- **Dependencies**: Workstream L.
- **Repository Areas**: `infrastructure/deploy.sh`, `docs/DEVELOPER_GUIDE.md`, `README.md`.
- **Deliverables**: Release tag `v1.0.0`, Developer Onboarding Guide, final release handover sign-off.
- **Validation**: Deployment smoke test gate; simulated rollback drill.
- **Security**: Immutable image digests; release signed by maintainer.
- **Rollback**: Documented automated rollback execution tested and ready.
- **Completion Criteria**: Project maintainer sign-off on production readiness; master plan marked Complete.

---

## 20. Dependency Graph & Execution Order

```
PHASE 29 EXECUTION ORDER:
=========================

Step 1: Workstream A (Baseline, CI/CD Gates & Release Governance)
  │
  ├─────────────────────────────────────────┐
  ▼                                         ▼
Step 2: Workstream B (AWS Managed IaC)    Step 3: Workstream K (OpenAPI 3.1 Specification)
  │                                         │
  ├───────────────────┬───────────────────┐ │
  ▼                   ▼                   ▼ │
Step 4: WS-C (App)  Step 5: WS-E (RDS)  Step 6: WS-F (Redis/RabbitMQ)
  │                   │                   │
  └─────────┬─────────┴─────────┬─────────┘
            │                   │
            ▼                   ▼
Step 7: WS-D (SFU Media)  Step 8: WS-G (Security Hardening & ASVS)
            │                   │
            │                   ▼
            │             Step 9: WS-H (Compliance & Retention Purge)
            │                   │
            └─────────┬─────────┘
                      │
                      ├───────────────────┐
                      ▼                   ▼
Step 10: WS-I (Disaster Recovery Drill)  Step 11: WS-J (Observability & Runbooks)
                      │                   │
                      └─────────┬─────────┘
                                │
                                ▼
Step 12: Workstream L (Full System E2E, Load, Chaos & Security Validation)
                                │
                                ▼
Step 13: Workstream M (Production Go-Live, Rollback Verification & Handover)
```

---

## 21. Verification Matrix

| Verification Level | Scope & Description | Target Workstreams | Pass / Fail Criteria |
| :--- | :--- | :--- | :--- |
| **LEVEL 1: Static & Build** | Syntax, linting, engine version, migration sequence, environment schema coverage, Terraform formatting, Checkov IaC scanning. | WS-A, WS-B, WS-K | 0 syntax errors, 0 lint warnings, 100% env variable coverage, 0 Checkov high/critical issues. |
| **LEVEL 2: Unit & Component** | Isolated logic tests: Zod schemas, auth token generation, password hashing, anomaly scoring, channel management, media codecs. | WS-C, WS-E, WS-F, WS-G | 100% unit tests passing across backend and frontend. |
| **LEVEL 3: Integration** | Subsystem integration: REST API endpoints, WebSocket event distribution, S3 presigned uploads, database pool failover, outbox dispatch. | WS-C, WS-D, WS-E, WS-H | 100% integration tests passing with live local services. |
| **LEVEL 4: Security & Resilience** | ASVS Level 2 penetration testing, BOLA access attempts, anti-tamper HMAC verification, Phase 22 chaos harness, forced RDS failover drill. | WS-E, WS-F, WS-G, WS-I, WS-L | 0 data loss, 0 duplicate records, 8/8 ACID invariants passing, sub-120s failover recovery [TARGET]. |
| **LEVEL 5: Full E2E & Production** | Automated Playwright journeys across all 5 roles, multi-tier concurrency load testing, live backup restore drill, production smoke test gate. | WS-L, WS-M | 100% E2E test pass rate; measured RTO/RPO meeting targets; clean release smoke test. |

---

## 22. Security & Privacy Release Blockers

The production release must be immediately **BLOCKED** if any of the following conditions occur:
1. **Critical Vulnerability**: Any unresolved **CRITICAL** vulnerability in application code, dependencies, or container base images. Any **HIGH** vulnerability without an approved, documented 30-day exception under `docs/SECURITY_AUDIT_EXCEPTIONS.md`.
2. **Privilege Escalation**: Any breach of role boundaries (e.g. Student accessing faculty endpoints, or Developer accessing candidate PII).
3. **Broken Data Durability**: Any committed candidate answer or exam submission lost during simulated infrastructure failure or failover.
4. **Audit Immutability Failure**: Any scenario where database trigger `SQLSTATE 20000` fails to prevent `UPDATE`, `DELETE`, or `TRUNCATE` on `audit_logs`.
5. **Anti-Tampering Failure**: Any candidate mutation endpoint accepting requests with missing, invalid, or forged HMAC signatures.
6. **Failed Backup Restoration**: Failure of the live restore drill to satisfy the objective criteria (exact row counts, foreign key integrity, 8/8 invariants).
7. **Unencrypted Data Transmission**: Any unencrypted HTTP or WebSockets permitted in production; TLS version $< 1.3$.
8. **WireGuard Boundary Deviation**: Management network deviating from canonical `10.100.0.0/24` or SSH port 22 exposed to `0.0.0.0/0`.
9. **Failed Release Rollback**: Inability of the automated deployment script to roll back to the previous stable release within 5 minutes [TARGET].

---

## 23. Production Go-Live Checklist

- [ ] **Infrastructure**:
  - [ ] Multi-AZ VPC provisioned across 2 Availability Zones (`ap-south-1a`, `ap-south-1b`).
  - [ ] Application Load Balancer active with valid ACM TLS 1.3 certificate passed via `certificate_arn`.
  - [ ] Amazon RDS PostgreSQL 16 Multi-AZ active with automated backups and encryption.
  - [ ] Amazon ElastiCache Redis 7 replication group active with transit encryption (`REDIS_TLS=true`).
  - [ ] Private S3 evidence bucket configured with Block Public Access and SSE-S3/KMS.
- [ ] **Security & Networking**:
  - [ ] Security groups deny all public ingress to ports 5432, 6379, 5672, and 4000.
  - [ ] WireGuard management plane operational on `10.100.0.0/24`; SSH restricted to `wg0`.
  - [ ] Zero unmitigated critical or high vulnerabilities in npm dependencies and Docker container scans.
  - [ ] Cryptographic anti-tampering verified on 100% of candidate mutation endpoints.
- [ ] **Database & Resilience**:
  - [ ] Database migrations 001–021 verified intact (zero DDL schema changes).
  - [ ] Client connection pool configured with AWS RDS CA bundle (`DB_SSL=true`, `DB_POOL_MAX = 20`).
  - [ ] Live database restore drill executed; RPO $< 5\text{ min}$ [TARGET] and RTO $< 15\text{ min}$ [TARGET] verified.
  - [ ] Audit log trigger `SQLSTATE 20000` immutability verified.
- [ ] **Operations & Observability**:
  - [ ] 13 subsystems reporting UP on Developer dashboard (`/developer/health`).
  - [ ] CloudWatch alarms active for CPU, memory, disk, RDS storage, and ALB 5XX rate.
  - [ ] 12 standard operating runbooks compiled and verified.
  - [ ] WireGuard peer management and key rotation runbook verified.
- [ ] **Application & Verification**:
  - [ ] End-to-end journey suites passing across all 5 roles (Student, Invigilator, Faculty, Admin, Developer).
  - [ ] Complete OpenAPI 3.1 specification generated and mechanically verified against route tables.
  - [ ] Automated deployment and rollback script tested in staging environment.

---

## 24. Completion Criteria (Definition of Done)

Phase 29 and the entire ProctorNet re-architecture roadmap will be officially complete when:
1. **HA Infrastructure**: Multi-AZ RDS PostgreSQL 16, Multi-AZ ElastiCache Redis 7, and dual-AZ ALB are fully operational and verified through automated failover tests.
2. **Zero Data Loss**: Database resilience proves 100% answer durability under failure injection and compound outages.
3. **Security Standards**: ASVS Level 2 control validation verified; zero high/critical vulnerabilities without documented exceptions across application, dependencies, and container images.
4. **Privacy Governance**: FERPA and GDPR controls validated; separate data retention schedules enforced; audit logs immutably protected.
5. **Operational Excellence**: All 12 production incident runbooks, WireGuard runbook, and Disaster Recovery runbook verified through drills.
6. **API Specification**: Authoritative OpenAPI 3.1 documentation generated covering 100% of system endpoints and mechanically verified.
7. **E2E Validation**: All 5 user roles execute end-to-end flawlessly in automated journey test suites.
8. **Release Handover**: Final production release artifacts built, tagged, and ready for deployment; master plan marked Complete.

---

## 25. Phase 29 Quality Gate

Before Phase 29 implementation can begin, this plan must be reviewed and approved.

```
========================================================================================
PHASE 29 PLAN GATE CHECKLIST:
[x] Phase 28 remains COMPLETE and merged on main
[x] Phase 29 remains PENDING (implementation not started)
[x] No Phase 30 introduced
[x] No Old Phase 30/31 reactivation (consolidated into Phase 28)
[x] No source code modified
[x] No infrastructure code modified
[x] No database migration created (Database Schema Migration: NOT REQUIRED)
[x] Single-region Multi-AZ HA scope is explicit; secondary-region DR marked future/out-of-scope
[x] ALB certificate_arn wiring requirement explicitly documented
[x] Client DB_SSL TLS connection pool configuration documented
[x] SFU announced IP is instance-specific/dynamic via IMDSv2
[x] High Availability scope is evidence-based and distinguishes Failover vs HA vs Zero-Downtime
[x] Security blocker aligned with docs/SECURITY_AUDIT_EXCEPTIONS.md
[x] RabbitMQ production baseline resolved to containerized quorum queues + transactional outbox
[x] WebSocket ALB stickiness clarified as optional optimization
[x] Client evidence upload retry queue strictly bounded (max 5 snapshots, 10MB, 10m drop)
[x] Media scaling units strictly distinguished (Candidate, Producer, Consumer, Transport, Worker)
[x] Chaos scenario references (CH-01 to CH-10, CH-L5) verified in repository
[x] Backup restore success criteria objectively defined
[x] WireGuard 10.100.0.0/24 preserved; SSM Session Manager out-of-band redundancy documented
[x] OpenAPI route coverage mechanically verifiable against Express route tables
[x] Measured / Estimated / Target discipline strictly maintained across all metrics
[x] Every workstream contains exact deliverables, tests, and completion criteria
========================================================================================
STATUS: PLAN ONLY — READY FOR REVIEW
```
