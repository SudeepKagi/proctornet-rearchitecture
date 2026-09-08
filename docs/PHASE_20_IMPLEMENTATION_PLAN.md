# Phase 20 Implementation Plan: AWS Infrastructure as Code Foundation (Revised)

> **Authoritative Source Precedence Hierarchy:**
> 1. Notion Step 13 Final Re-Architecture (Sections 13.5, 13.7, 13.17 — Infrastructure, Deployment Specifications, Decoupled State & Service Architecture)
> 2. `docs/DEVELOPMENT_PLAN.md` (Phase 20 — AWS Infrastructure; Phase 21 — Load Testing; Phase 22 — Failure / Chaos Testing)
> 3. Existing Merged Repository Baseline (Phases 1–19 Merged on `main` at `cbf3089`)
> 4. Existing Finalized Phase-Specific Plans & ADRs (ADR-0001 through ADR-0009)
> 5. Existing Tests & Documentation

---

## 1. Plan Metadata

- **Phase Identification**: Phase 20 — AWS Infrastructure
- **Target Specification Document**: `docs/PHASE_20_IMPLEMENTATION_PLAN.md`
- **Author**: Antigravity AI Engineering Team (Pair Programming with Core Architect)
- **Status**: `PLAN CORRECTED → READY FOR FINAL INDEPENDENT REVIEW`
- **Creation Date**: 2026-09-08 (Revised)
- **Git Commit Baseline**: `main` branch at `cbf3089` (tracking update at `981720e`)
- **Predecessor Phase**: Phase 19 (Containerization, Multi-Stage Builds, Host-Networked SFU, Production Docker Compose, CI/CD Delivery Pipeline, ADR-0009) — **COMPLETE & MERGED**
- **Successor Phase**: Phase 21 (Load Testing, Concurrency Benchmarking, Autosave Burst Validation, 1,000–10,000 Candidate Simulation) — **PENDING**
- **Mode**: **PLAN ONLY** (Strict prohibition on resource creation, Terraform files, AWS changes, application changes, git commits, or PR merges)

---

## 2. Authoritative Sources

The technical specifications and architectural constraints of this implementation plan are directly derived from the following canonical sources:

1. **Notion Step 13 Final Re-Architecture — ProctorNet Implementation Master**:
   - *Section 13.5 (Infrastructure & Deployment)*: Prescribes modular monolith on AWS EC2 initially, Docker multi-stage builds, production Docker Compose, Nginx edge, Let's Encrypt TLS, systemd daemonization, and S3 for private object storage.
   - *Section 13.7 (Decoupled State & Service Architecture)*: PostgreSQL as the authoritative relational source of truth, Redis for ephemeral caching/rate-limiting, RabbitMQ for asynchronous outbox worker dispatch, and mediasoup native workers for WebRTC SFU media routing.
   - *Section 13.17 (Scaling & Production Constraints)*: Explicitly commands "Modular monolith first", "AWS EC2 initially", "Kubernetes only if later justified", "Avoid premature microservices decomposition", and "Measure → optimize → scale".
2. **`docs/DEVELOPMENT_PLAN.md`**:
   - Phase 19 (Containerization & Deployment) completed baseline.
   - Phase 20 (AWS Infrastructure) objective, scope, and validation criteria.
   - Phase 21 (Load Testing) and Phase 22 (Failure / Chaos Testing) operational boundaries.
3. **`docs/ARCHITECTURE.md`**:
   - System purpose, non-negotiable architectural invariants, non-goals, security boundaries, and fail-closed operational rules.
4. **Existing Architecture Decision Records (ADR-0001 through ADR-0009)**:
   - Particularly `docs/ADR/0005-private-object-storage-architecture-direct-presigned-evidence-uploads-and-authoritative-postgresql-metadata-lifecycle.md` (defining application-authoritative evidence retention and version-aware destruction) and `docs/ADR/0009-containerization-topology-multistage-builds-host-networked-sfu-and-single-host-delivery.md` (defining hybrid networking topology, host-networked SFU/Coturn, unprivileged Nginx edge, and loopback persistence).
5. **Existing Production Delivery Assets (`infrastructure/`)**:
   - `infrastructure/docker-compose.prod.yml`, `infrastructure/deploy.sh`, `infrastructure/backup-db.sh`, `infrastructure/proctornet.service`, `infrastructure/README.md`.

---

## 3. Architectural Hierarchy

When technical sources, legacy documentation, or proposed patterns conflict, resolution follows this strict, non-negotiable authority order:

```
┌────────────────────────────────────────────────────────────────────────┐
│  1. Notion Step 13 Final Re-Architecture (Master Authority)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│  2. docs/DEVELOPMENT_PLAN.md                                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│  3. Existing Merged Repository Baseline (main @ cbf3089)               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│  4. Existing Finalized Phase-Specific Plans & Approved ADRs (0001–0009) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│  5. Existing Tests & Documentation                                     │
└────────────────────────────────────────────────────────────────────────┘
```

**Conflict Resolution Invariants**:
- Conflicts between historical roadmap phrasing and finalized architectural contracts must be **explicitly exposed and analyzed**.
- Silent reconciliation or arbitrary adoption of generic cloud patterns is strictly forbidden.
- Any deviation from the established baseline requires an explicit Architecture Decision Record (ADR).

---

## 4. Phase 20 Objective

The objective of Phase 20 is to construct a **reproducible, version-controlled, least-privilege, security-hardened Infrastructure-as-Code (IaC) foundation using HashiCorp Terraform on Amazon Web Services (AWS)**.

Specifically, Phase 20 must:
1. Declaratively model and provision the cloud networking, security, compute, storage, and IAM boundaries required to host the Phase 19 single-host production deployment (`infrastructure/docker-compose.prod.yml`).
2. Replace manual AWS management with declarative, version-controlled Terraform modules that can be reproducibly initialized, planned, applied, and destroyed.
3. Architect reusable, parameterized modules for managed AWS services (Amazon RDS PostgreSQL 16 and Amazon ElastiCache Redis 7) that remain feature-toggled off (`enable_rds = false`, `enable_elasticache = false`) during Phase 20, establishing a clean, zero-risk upgrade pathway for Phase 21 load testing and capacity benchmarking.
4. Establish remote state management with S3 encryption, versioning, and native S3 lockfile locking (`use_lockfile = true`), ensuring bootstrap isolation from environment states.
5. Integrate automated Terraform static analysis, linting, security scanning, and speculative plan generation into the CI/CD pipeline.
6. Ensure that all production secrets fail closed, zero secrets exist in Git, and zero external ingress is permitted to internal database, cache, broker, or backend ports.

---

## 5. Phase 19 Baseline

Phase 19 is 100% complete, verified, and merged into `main`. The existing deployment baseline provides:

1. **Modular Monolith Topology**: Single Node.js 24 runtime process encapsulating Express REST controllers, WebSocket realtime signaling gateway, in-process native C++ `mediasoup-worker` pool, transactional outbox dispatcher, and background exam evaluation worker.
2. **Containerization & Multi-Stage Builds**:
   - `backend/Dockerfile`: Debian-based (`node:24-bookworm-slim`) multi-stage compilation producing an unprivileged runtime image executing as `USER node` (UID 1000) with zero compilers or devDependencies (`vitest`, `supertest`, `c8` strictly excluded).
   - `frontend/Dockerfile`: Alpine-based multi-stage Vite production compilation served by `nginxinc/nginx-unprivileged:alpine` executing as `USER nginx` (UID 101).
3. **Hybrid Networking Topology (ADR-0009)**:
   - Frontend runs in Docker bridge mode (`80:8080`, `443:8443`), terminating TLS and proxying to backend via `http://host.docker.internal:4000`.
   - Backend and Coturn run in host networking mode (`network_mode: "host"`), guaranteeing line-rate WebRTC RTP/RTCP packet transport across 10,000 UDP ports (`40000–49999/udp`) and Coturn relay ports (`49152–49250/udp`).
   - Internal persistence services (PostgreSQL `5432`, Redis `6379`, RabbitMQ `5672`/`15672`) bind strictly to host loopback (`127.0.0.1`), physically preventing external network binding.
   - Backend port 4000 is internal only and must be blocked from `0.0.0.0/0` at the AWS Security Group and host firewall.
4. **Host-Level TLS Termination**:
   - Let's Encrypt certificates managed via Snap Certbot under `/etc/letsencrypt`.
   - Cryptographic key isolation: Private keys strictly enforce mode `0640` owned by `root:101`. World-readable mode `0644` is strictly prohibited.
5. **Database Migration State**:
   - Exactly 17 migrations (001 through 017) committed and sequentially verified.
   - Schema migrations execute via one-shot container `backend-migrate` before backend boot.
   - Automatic database rollback in deployment failure handlers is strictly prohibited. Zero migrations added in Phase 19; zero migrations allowed in Phase 20.
6. **Object Storage**:
   - S3 evidence bucket contract defined in Phase 15 and ADR-0005. Emulated via LocalStack in local/CI environments; production requires real AWS S3 with default credential provider chain (IAM instance profile).

---

## 6. Scope

Phase 20 is bounded strictly to declarative AWS Infrastructure as Code and deployment automation:

```
terraform/
├── bootstrap/                          # S3 state bucket bootstrap stack (native lockfile locking, temporary local state)
├── environments/
│   ├── production/                     # Production root configuration & state
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── versions.tf
│   │   ├── backend.tf
│   │   └── terraform.tfvars.example
│   └── staging/                        # Staging disposable root configuration
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       ├── versions.tf
│       ├── backend.tf
│       └── terraform.tfvars.example
└── modules/
    ├── vpc/                            # VPC, 2 public subnets, 2 private subnets, IGW, route tables
    ├── security_groups/                # EC2, RDS, ElastiCache security groups
    ├── iam/                            # EC2 instance role, instance profile, least-privilege policies
    ├── s3/                             # Private evidence bucket, backup bucket, lifecycle, BPA, CORS
    ├── ec2/                            # Ubuntu 24.04 LTS instance, encrypted EBS data volume, EIP, Cloud-Init
    ├── cloudwatch/                     # CloudWatch agent config, log groups, metric alarms
    ├── rds/                            # Scale-ready PostgreSQL 16 module (toggleable: enable_rds)
    ├── elasticache/                    # Scale-ready Redis 7 module (toggleable: enable_elasticache)
    └── alb/                            # Scale-ready ALB module (toggleable: enable_alb)
```

**Key Deliverables**:
1. Complete Terraform module library defining network, security, compute, IAM, storage, and monitoring.
2. Production environment root module provisioning the active Phase 19 single-host deployment on AWS.
3. Toggleable, scale-ready modules for managed RDS and ElastiCache.
4. Remote state management with S3 encryption, versioning, and native S3 lockfile locking (`use_lockfile = true`), initialized via an isolated bootstrap stack.
5. CI/CD automation workflow (`.github/workflows/terraform.yml`) enforcing format checks, linting (`tflint`), static security scanning (`checkov`), validation, and speculative pull-request plans.

---

## 7. Explicit Non-Goals

To maintain strict alignment with the Master Architecture Invariants, the following are **EXPLICIT NON-GOALS** for Phase 20:

- ❌ **No Kubernetes / EKS / Helm**: Premature distributed cluster orchestration is forbidden. Single-host EC2 is the authoritative foundation.
- ❌ **No Microservices Decomposition**: The backend modular monolith remains unified. No splitting into separate auth, exam, proctoring, or evaluation services.
- ❌ **No ECS / Fargate / App Runner Migration**: Stale roadmap phrasing. Fargate cannot support dynamic 10,000 UDP port ranges for WebRTC host networking.
- ❌ **No Day-One Mandatory Database Cutover to RDS**: PostgreSQL remains containerized on EC2 for the active Phase 20 baseline. RDS module is authored as toggleable (`enable_rds = false`).
- ❌ **No Day-One Mandatory Redis Cutover to ElastiCache**: Redis remains containerized on EC2 on loopback. ElastiCache module is toggleable (`enable_elasticache = false`).
- ❌ **No Amazon MQ / Managed Broker**: RabbitMQ remains containerized on EC2 with persistent EBS volume. Amazon MQ is rejected.
- ❌ **No Kafka / EventBridge / SQS**: RabbitMQ + Transactional Outbox remains the authoritative asynchronous transport.
- ❌ **No Multi-Region Replication / Global Active-Active**: Architecture is strictly single-region (`ap-south-1`).
- ❌ **No Database Sharding / Citus**: Relational consistency resides in a single database.
- ❌ **No GraphQL / gRPC**: REST and WebSocket remain the authoritative control protocols.
- ❌ **No Database Schema Migrations**: Zero schema changes permitted in Phase 20. Migration count remains exactly 17.
- ❌ **No Application Source Code Changes**: Backend and frontend codebases remain untouched.
- ❌ **No Speculative Autoscaling Group (ASG) Implementation**: Horizontal scaling triggers and policies are deferred to Phase 21 load testing.

---

## 8. Architecture Reconciliation

A critical responsibility of Phase 20 is reconciling the historical text in `docs/DEVELOPMENT_PLAN.md` with the finalized authoritative architecture (Notion Step 13.5, 13.7, 13.17 and ADR-0009).

### 8.1 Reconciliation of the 15 Foundational Questions

#### Question 1: What exactly is Phase 20 expected to provision?
**Resolution**: Phase 20 provisions declarative, version-controlled Infrastructure-as-Code via Terraform for:
1. S3 remote state backend with encryption, versioning, and native S3 lockfile locking (`use_lockfile = true`).
2. AWS VPC (`10.0.0.0/16`) in `ap-south-1` across 2 Availability Zones with 2 public subnets and 2 private subnets.
3. Internet Gateway (IGW) and public route tables.
4. Strict, least-privilege Security Groups establishing explicit trust boundaries.
5. IAM Role, Instance Profile, and least-privilege policies for EC2 (S3 evidence access, CloudWatch, SSM Parameter Store).
6. Private S3 Evidence Bucket conforming to Phase 15 / ADR-0005 specifications.
7. Primary production EC2 host (`var.instance_type`, default `c6i.xlarge` Ubuntu 24.04 LTS) with Elastic IP (EIP), encrypted gp3 root volume, encrypted gp3 data volume (`/opt/proctornet/data`), and Cloud-Init bootstrapping executing the Phase 19 Compose stack.
8. CloudWatch Agent telemetry, Log Group, Metric Filters, and host alarms.
9. Reusable, scale-ready modules for Amazon RDS PostgreSQL 16 and Amazon ElastiCache Redis 7, authored and validated but kept toggled off (`enable_rds = false`, `enable_elasticache = false`).

#### Question 2: Is Phase 20 declarative infrastructure around existing EC2, transition to managed services, or both in controlled stages?
**Resolution**: **Both, structured in two controlled stages**:
- **Stage 1 (Active Baseline)**: Declaratively encapsulates the Phase 19 single-host EC2 modular monolith architecture, achieving 100% functional parity, zero application risk, and immediate production readiness.
- **Stage 2 (Scale Readiness)**: Authors parameterized, reusable Terraform modules for RDS PostgreSQL and ElastiCache Redis. These modules are validated via static analysis and plan generation, but remain dormant until Phase 21 load testing provides empirical justification for migrating state off the EC2 host.

#### Question 3: Which AWS resources are mandatory in Phase 20?
**Resolution**: VPC, 2 Public Subnets, 2 Private Subnets, Internet Gateway, Public Route Table, EC2 Security Group, RDS Security Group, ElastiCache Security Group, EC2 IAM Role/Instance Profile/Policies, S3 Evidence Bucket, S3 State Bucket (with native lockfile locking), EC2 Instance, Attached EBS Data Volume, Elastic IP, CloudWatch Log Group, SSM Parameter Store secret declarations.

#### Question 4: Which resources are deliberately deferred to Phase 21+ or later?
**Resolution**:
- Application Load Balancer (ALB) and Target Groups: Deferred to Phase 21 multi-instance backend validation. (WebRTC SFU UDP media traffic will never route through an ALB).
- Auto Scaling Group (ASG) & Launch Templates: Deferred to Phase 21.
- Active RDS PostgreSQL live provisioning and data migration: Deferred to Phase 21.
- Active ElastiCache Redis cluster provisioning: Deferred to Phase 21.
- NAT Gateways: Deferred until private instances require outbound internet access (saving ~$64/month).
- Multi-Region replication: Deferred indefinitely (Non-Goal).

#### Question 5: Does Phase 20 provision one EC2 host first, or immediately introduce multiple instances?
**Resolution**: Provisions **ONE EC2 host first**.
*Rationale*: Notion Step 13.5 and ADR-0009 mandate "Modular monolith first", "AWS EC2 initially". The application runs in-process native C++ `mediasoup-worker` instances. Distributing media streams across multiple EC2 instances requires mediasoup pipe transports or a media cluster controller, which introduces substantial complexity. Phase 20 preserves single-host integrity; Phase 21 benchmarks single-host capacity before introducing multi-instance distribution.

#### Question 6: Does Phase 20 introduce an ALB now, or defer it until scaling validation?
**Resolution**: **Defers ALB to Phase 21**.
*Rationale*:
1. WebRTC SFU media traffic (`40000–49999/udp`) and Coturn STUN/TURN traffic (`3478`, `49152–49250/udp`) **cannot pass through an ALB** (ALB operates strictly on Layer 7 HTTP/HTTPS). Placing WebRTC behind an ALB completely breaks video streaming.
2. For a single EC2 host, Nginx on the host already performs microsecond TLS termination, ACME HTTP-01 challenge response, static React SPA serving, WebSocket upgrade proxying, and reverse proxying to backend port 4000. An ALB in front of a single host adds ~$25/month and network latency with zero HA benefit.
3. An ALB module is authored and maintained in `modules/alb/` for toggleable activation in Phase 21 when multiple backend HTTP/WebSocket replicas are introduced.

#### Question 7: Does PostgreSQL remain on the existing EC2/container deployment, or move to RDS in Phase 20?
**Resolution**: **Remains containerized on EC2 for the active Phase 20 baseline**, with a fully specified RDS PostgreSQL 16 module authored with `enable_rds = false`.
*Rationale*: Containerized PostgreSQL 16 with EBS persistence and automated daily backup scripts (`backup-db.sh`) satisfies all current requirements. Migrating production data to RDS involves schema export, data dump/restore, connection string re-pointing, and failover validation. Performing this live cutover in Phase 20 without empirical load testing violates "measure → optimize → scale". The RDS module is ready for instant activation in Phase 21.

#### Question 8: Does Redis remain containerized on EC2, or move to ElastiCache in Phase 20?
**Resolution**: **Remains containerized on EC2 for the active Phase 20 baseline**, with an ElastiCache module authored with `enable_elasticache = false`.
*Rationale*: Redis is strictly non-authoritative (ADR-0001). On a single EC2 host, loopback Redis (`127.0.0.1:6379`) provides sub-millisecond latency without VPC networking overhead or managed node costs. ElastiCache is authored for multi-instance pub/sub synchronization in Phase 21.

#### Question 9: Does RabbitMQ remain containerized on EC2?
**Resolution**: **Remains containerized on EC2**. Amazon MQ is explicitly rejected. Containerized RabbitMQ 3.13 on loopback with persistent EBS volume meets all ADR-0002 requirements at zero additional cloud cost.

#### Question 10: Does S3 remain the existing production evidence bucket architecture from Phase 15?
**Resolution**: **YES**. Fully preserves the private bucket posture, Block Public Access, server-side encryption, versioning, and application-authoritative retention lifecycle defined in ADR-0005. S3 bucket lifecycle does NOT silently delete active evidence objects; retention is governed by PostgreSQL metadata and application purge sweepers.

#### Question 11: Is ECS/Fargate actually required by the finalized architecture, or is it stale roadmap language?
**Resolution**: **ECS/Fargate is STALE ROADMAP LANGUAGE and is REJECTED**.
*Rationale*: AWS Fargate does NOT support host networking mode, nor does it support publishing a dynamic range of 10,000 UDP ports (`40000–49999`) for mediasoup WebRTC media. Furthermore, running multi-container stacks with loopback persistence bindings on Fargate introduces extreme operational friction. EC2 is the authoritative compute platform.

#### Question 12: Is Terraform used only to model/provision current architecture, or also future scalable architecture?
**Resolution**: **Both**. Terraform models and provisions the current single-host architecture as the default root configuration, while encapsulating future scalable components (RDS, ElastiCache, ALB) in parameterized modules with feature toggles.

#### Question 13: What should Phase 20 intentionally defer to Phase 21 Load Testing?
**Resolution**: Concurrency benchmarking (1,000–10,000 candidates), autosave burst throughput validation, database connection pool saturation tests, empirical evaluation of single-host limits vs RDS/ElastiCache offloading, and horizontal autoscaling thresholds.

#### Question 14: What should Phase 20 intentionally defer to Phase 22 Failure/Chaos Testing?
**Resolution**: Multi-AZ RDS failover validation, simulated EC2 node termination recovery, Redis failover cache-miss degradation verification, simulated network partitions, and empirical disaster recovery benchmarking (measuring actual RTO and RPO against engineering targets).

#### Question 15: What should remain deferred to later architectural phases?
**Resolution**: Kubernetes/EKS/Helm (only if later justified after monolithic scaling limits are reached), microservices decomposition, database sharding/Citus, multi-region replication, and service mesh.

---

## 9. AWS Target Architecture

The ProctorNet AWS Infrastructure is structured in two distinct topological stages:

### Stage 1: Active Production Baseline (Phase 20)
- **VPC**: `10.0.0.0/16` across 2 Availability Zones (`ap-south-1a`, `ap-south-1b`).
- **Compute**: Single EC2 instance (instance type configurable via `var.instance_type`, default `c6i.xlarge` in production, `t3.large`/`t3.xlarge` in staging) located in Public Subnet `10.0.1.0/24`.
- **Addressing**: Dedicated Elastic IP (EIP) bound to EC2 instance, providing static public IPv4 for DNS A-record, WebRTC ICE announced IP (`MEDIA_ANNOUNCED_IP`), and Coturn announced host (`TURN_ANNOUNCED_HOST`).
- **Storage**:
  - 50 GiB gp3 encrypted root volume.
  - 100 GiB gp3 encrypted data volume mounted at `/opt/proctornet/data` housing persistent Docker named volumes (`pg_data`, `redis_data`, `rmq_data`, backups).
  - Private S3 Evidence Bucket (`proctornet-evidence-production-<account_id>`) with Versioning, BPA, SSE-S3/KMS, and application-authoritative retention lifecycle (no destructive expiration of active objects).
  - Private S3 Backup Bucket (`proctornet-backups-production-<account_id>`) receiving daily database backups from the scheduled backup service.
- **Security & Networking**:
  - Internet Gateway providing direct ingress/egress.
  - Security Group admitting TCP 80, 443 (Nginx edge), UDP 40000–49999 (mediasoup WebRTC RTP), TCP/UDP 3478 & UDP 49152–49250 (Coturn STUN/TURN), and restricted TCP 22 / SSM Session Manager.
  - Backend port 4000 and persistence ports 5432, 6379, 5672 have NO external ingress rules and bind strictly to `127.0.0.1`.
- **Identity**: IAM Instance Profile granting scoped access to S3, CloudWatch Logs/Metrics, and SSM Parameter Store.

### Stage 2: Scale-Ready Architecture (Toggleable for Phase 21+)
- **Private Subnets**: `10.0.10.0/24` and `10.0.20.0/24` housing DB Subnet Group and ElastiCache Subnet Group across both AZs.
- **Managed Database**: Amazon RDS PostgreSQL 16.4 Multi-AZ cluster in private subnets, security-group-isolated to accept ingress on port 5432 only from the EC2 security group.
- **Managed Cache**: Amazon ElastiCache Redis 7.1 replication group in private subnets, accepting ingress on port 6379 only from the EC2 security group.
- **Application Load Balancer**: Multi-AZ public ALB terminating TLS for HTTP/HTTPS REST and WebSocket connections, proxying to multiple EC2 backend instances while WebRTC UDP media traffic bypasses the ALB directly to host instances.

### Visual Architecture Diagram: AWS Target Topology

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 540" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="vpcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0369a1" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#0284c7" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="ec2Grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e40af"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <linearGradient id="pubSubGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#065f46" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#059669" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="privSubGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#78350f" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0.05"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="920" height="540" rx="12" fill="url(#bgGrad)" stroke="#334155" stroke-width="1.5"/>

  <!-- Header -->
  <text x="30" y="38" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700">ProctorNet AWS Infrastructure Topology (Phase 20 Baseline &amp; Scale-Ready)</text>
  <text x="30" y="58" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12">Region: ap-south-1 (Mumbai) | Dual-AZ VPC Foundation with Single-Host EC2 &amp; Toggleable Managed Services</text>

  <!-- AWS Cloud Boundary -->
  <rect x="25" y="75" width="870" height="440" rx="8" fill="none" stroke="#475569" stroke-width="1.5" stroke-dasharray="6,4"/>
  <text x="40" y="95" fill="#cbd5e1" font-family="sans-serif" font-size="11" font-weight="600">AWS Cloud Boundary (Account ID: &lt;account_id&gt;)</text>

  <!-- External Clients / Internet -->
  <rect x="45" y="115" width="130" height="70" rx="6" fill="#1e293b" stroke="#64748b" stroke-width="1.5"/>
  <text x="110" y="142" fill="#f1f5f9" font-family="sans-serif" font-size="12" font-weight="600" text-anchor="middle">Candidate &amp; Proctor</text>
  <text x="110" y="160" fill="#38bdf8" font-family="sans-serif" font-size="10" text-anchor="middle">HTTPS / WSS / WebRTC</text>
  <text x="110" y="174" fill="#94a3b8" font-family="sans-serif" font-size="9" text-anchor="middle">exam.proctornet.com</text>

  <!-- Internet Gateway -->
  <rect x="215" y="125" width="70" height="50" rx="6" fill="#0284c7" stroke="#38bdf8" stroke-width="1.5"/>
  <text x="250" y="148" fill="#ffffff" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle">AWS IGW</text>
  <text x="250" y="163" fill="#e0f2fe" font-family="sans-serif" font-size="9" text-anchor="middle">0.0.0.0/0</text>

  <!-- Arrow Client to IGW -->
  <path d="M 175 150 L 215 150" stroke="#38bdf8" stroke-width="2" fill="none"/>

  <!-- VPC Boundary -->
  <rect x="315" y="100" width="560" height="400" rx="8" fill="url(#vpcGrad)" stroke="#0284c7" stroke-width="1.5"/>
  <text x="330" y="122" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="700">VPC: proctornet-vpc (10.0.0.0/16)</text>

  <!-- Public Subnet AZ 1a -->
  <rect x="330" y="135" width="265" height="235" rx="6" fill="url(#pubSubGrad)" stroke="#059669" stroke-width="1.5"/>
  <text x="345" y="155" fill="#34d399" font-family="sans-serif" font-size="11" font-weight="600">Public Subnet (ap-south-1a)</text>
  <text x="345" y="170" fill="#a7f3d0" font-family="sans-serif" font-size="9">CIDR: 10.0.1.0/24 | Route: IGW</text>

  <!-- Arrow IGW to EC2 -->
  <path d="M 285 150 L 330 150 L 330 220 L 350 220" stroke="#38bdf8" stroke-width="2" fill="none"/>

  <!-- EC2 Instance Box -->
  <rect x="350" y="185" width="225" height="170" rx="6" fill="url(#ec2Grad)" stroke="#60a5fa" stroke-width="1.5"/>
  <text x="462" y="206" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="700" text-anchor="middle">EC2: proctornet-prod-ec2</text>
  <text x="462" y="222" fill="#bfdbfe" font-family="sans-serif" font-size="10" text-anchor="middle">var.instance_type (c6i.xlarge prod)</text>
  <text x="462" y="236" fill="#fbbf24" font-family="sans-serif" font-size="9" text-anchor="middle">Elastic IP: 13.x.x.x (Static)</text>

  <!-- Containers inside EC2 -->
  <rect x="360" y="245" width="100" height="42" rx="4" fill="#1e293b" stroke="#94a3b8" stroke-width="1"/>
  <text x="410" y="262" fill="#f8fafc" font-family="sans-serif" font-size="9" font-weight="600" text-anchor="middle">frontend (Nginx)</text>
  <text x="410" y="276" fill="#38bdf8" font-family="sans-serif" font-size="8" text-anchor="middle">Ports: 80, 443 (TLS)</text>

  <rect x="468" y="245" width="100" height="42" rx="4" fill="#1e293b" stroke="#94a3b8" stroke-width="1"/>
  <text x="518" y="262" fill="#f8fafc" font-family="sans-serif" font-size="9" font-weight="600" text-anchor="middle">backend (Node 24)</text>
  <text x="518" y="276" fill="#38bdf8" font-family="sans-serif" font-size="8" text-anchor="middle">host-net | 4000 (int)</text>

  <rect x="360" y="295" width="100" height="48" rx="4" fill="#1e293b" stroke="#94a3b8" stroke-width="1"/>
  <text x="410" y="312" fill="#f8fafc" font-family="sans-serif" font-size="9" font-weight="600" text-anchor="middle">coturn (STUN/TURN)</text>
  <text x="410" y="325" fill="#38bdf8" font-family="sans-serif" font-size="8" text-anchor="middle">3478, 49152-49250u</text>
  <text x="410" y="336" fill="#34d399" font-family="sans-serif" font-size="7" text-anchor="middle">host networking</text>

  <rect x="468" y="295" width="100" height="48" rx="4" fill="#0f172a" stroke="#cbd5e1" stroke-width="1"/>
  <text x="518" y="312" fill="#cbd5e1" font-family="sans-serif" font-size="9" font-weight="600" text-anchor="middle">loopback persistence</text>
  <text x="518" y="325" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">PG 5432 | Redis 6379</text>
  <text x="518" y="336" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">RMQ 5672 (127.0.0.1)</text>

  <!-- EBS Storage Block -->
  <rect x="350" y="380" width="225" height="50" rx="5" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="462" y="401" fill="#fbbf24" font-family="sans-serif" font-size="10" font-weight="700" text-anchor="middle">Encrypted gp3 EBS Volume (/opt/proctornet/data)</text>
  <text x="462" y="418" fill="#cbd5e1" font-family="sans-serif" font-size="9" text-anchor="middle">Named Volumes: pg_data, redis_data, rmq_data | Backups</text>

  <!-- Public Subnet AZ 1b -->
  <rect x="610" y="135" width="250" height="90" rx="6" fill="url(#pubSubGrad)" stroke="#059669" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="625" y="155" fill="#34d399" font-family="sans-serif" font-size="11" font-weight="600">Public Subnet (ap-south-1b)</text>
  <text x="625" y="170" fill="#a7f3d0" font-family="sans-serif" font-size="9">CIDR: 10.0.2.0/24 | Scale-Ready for Phase 21+ ALB / ASG</text>
  <rect x="625" y="180" width="220" height="35" rx="4" fill="#1e293b" stroke="#475569" stroke-width="1"/>
  <text x="735" y="202" fill="#94a3b8" font-family="sans-serif" font-size="9" text-anchor="middle">[Deferred: ALB Target Group in Phase 21]</text>

  <!-- Private Subnets (Stage 2 Managed Services) -->
  <rect x="610" y="240" width="250" height="240" rx="6" fill="url(#privSubGrad)" stroke="#d97706" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="625" y="260" fill="#fbbf24" font-family="sans-serif" font-size="11" font-weight="600">Private Subnets (Dual AZ: 10.0.10.0/24, 10.0.20.0/24)</text>
  <text x="625" y="275" fill="#fde68a" font-family="sans-serif" font-size="9">No Public IPs | Isolated Route Table (Local VPC only)</text>

  <!-- Toggleable RDS Module Box -->
  <rect x="625" y="290" width="220" height="85" rx="5" fill="#1e293b" stroke="#f59e0b" stroke-width="1.2"/>
  <text x="735" y="310" fill="#fbbf24" font-family="sans-serif" font-size="10" font-weight="700" text-anchor="middle">Amazon RDS PostgreSQL 16 (Module)</text>
  <text x="735" y="325" fill="#94a3b8" font-family="sans-serif" font-size="9" text-anchor="middle">Multi-AZ | db.t4g.medium | Encrypted gp3</text>
  <text x="735" y="342" fill="#ef4444" font-family="sans-serif" font-size="9" font-weight="600" text-anchor="middle">Status: Toggled OFF (enable_rds = false)</text>
  <text x="735" y="360" fill="#38bdf8" font-family="sans-serif" font-size="8" text-anchor="middle">Ready for activation in Phase 21 Load Testing</text>

  <!-- Toggleable ElastiCache Box -->
  <rect x="625" y="385" width="220" height="80" rx="5" fill="#1e293b" stroke="#f59e0b" stroke-width="1.2"/>
  <text x="735" y="405" fill="#fbbf24" font-family="sans-serif" font-size="10" font-weight="700" text-anchor="middle">Amazon ElastiCache Redis 7 (Module)</text>
  <text x="735" y="420" fill="#94a3b8" font-family="sans-serif" font-size="9" text-anchor="middle">cache.t4g.small | In-Transit &amp; Rest Encryption</text>
  <text x="735" y="437" fill="#ef4444" font-family="sans-serif" font-size="9" font-weight="600" text-anchor="middle">Status: Toggled OFF (enable_elasticache = false)</text>
  <text x="735" y="453" fill="#38bdf8" font-family="sans-serif" font-size="8" text-anchor="middle">Ready for activation in Phase 21 Load Testing</text>

  <!-- External AWS Services (S3, CloudWatch, SSM) -->
  <rect x="45" y="240" width="240" height="240" rx="6" fill="#1e293b" stroke="#818cf8" stroke-width="1.5"/>
  <text x="60" y="262" fill="#a5b4fc" font-family="sans-serif" font-size="11" font-weight="700">AWS Managed Control &amp; Storage</text>

  <!-- S3 Evidence -->
  <rect x="55" y="275" width="220" height="55" rx="4" fill="#0f172a" stroke="#6366f1" stroke-width="1"/>
  <text x="65" y="293" fill="#e0e7ff" font-family="sans-serif" font-size="10" font-weight="600">S3 Evidence Bucket (ADR-0005)</text>
  <text x="65" y="308" fill="#94a3b8" font-family="sans-serif" font-size="8">BPA Enabled | Versioning | App-Authoritative Retention</text>
  <text x="65" y="321" fill="#34d399" font-family="sans-serif" font-size="8">IAM Instance Profile (Zero Long-Lived Keys)</text>

  <!-- SSM Parameter Store -->
  <rect x="55" y="340" width="220" height="50" rx="4" fill="#0f172a" stroke="#6366f1" stroke-width="1"/>
  <text x="65" y="358" fill="#e0e7ff" font-family="sans-serif" font-size="10" font-weight="600">SSM Parameter Store</text>
  <text x="65" y="373" fill="#94a3b8" font-family="sans-serif" font-size="8">/proctornet/${var.environment}/* (SecureString KMS)</text>
  <text x="65" y="384" fill="#34d399" font-family="sans-serif" font-size="8">Injected on EC2 boot | Mode 0600 root:root</text>

  <!-- CloudWatch -->
  <rect x="55" y="400" width="220" height="65" rx="4" fill="#0f172a" stroke="#6366f1" stroke-width="1"/>
  <text x="65" y="418" fill="#e0e7ff" font-family="sans-serif" font-size="10" font-weight="600">CloudWatch Agent (CWAgent)</text>
  <text x="65" y="433" fill="#94a3b8" font-family="sans-serif" font-size="8">Log Group: /aws/ec2/proctornet/${environment}</text>
  <text x="65" y="446" fill="#94a3b8" font-family="sans-serif" font-size="8">Metrics: mem_used_percent, disk_used_percent</text>
  <text x="65" y="458" fill="#38bdf8" font-family="sans-serif" font-size="8">Alarms: CPU, RAM, Disk, StatusCheckFailed</text>

  <!-- Arrows from EC2 to External Services -->
  <path d="M 350 280 L 285 280" stroke="#818cf8" stroke-width="1.5" stroke-dasharray="3,3" fill="none"/>
  <path d="M 350 365 L 285 365" stroke="#818cf8" stroke-width="1.5" stroke-dasharray="3,3" fill="none"/>
  <path d="M 350 420 L 285 420" stroke="#818cf8" stroke-width="1.5" stroke-dasharray="3,3" fill="none"/>

</svg>

---

## 10. VPC Design

- **VPC CIDR Block**: `10.0.0.0/16` (Provides 65,536 private IPv4 addresses, accommodating extensive future subnetting).
- **AWS Region**: `ap-south-1` (Mumbai, India), ensuring lowest latency for target examination candidates.
- **Availability Zones**: Multi-AZ topology utilizing `ap-south-1a` and `ap-south-1b`.
- **DNS Hostnames & Support**:
  - `enable_dns_hostnames = true` (Mandatory for internal AWS service endpoint discovery and RDS hostname resolution).
  - `enable_dns_support = true` (Enables AWS Route 53 resolver at `10.0.0.2`).
- **VPC Flow Logs**:
  - Flow logs enabled on the VPC to capture all accepted and rejected IP traffic.
  - Destination: CloudWatch Log Group `/aws/vpc/proctornet-flow-logs`.
  - Retention: 14 days.
  - Justification: Essential for security auditability, verifying that external traffic to port 4000 or database ports is dropped, and troubleshooting WebRTC UDP connection drops.

---

## 11. Subnet Design

The VPC is partitioned into four subnets across two Availability Zones, enforcing strict physical network isolation between public ingress and private persistence layers:

| Subnet Name | CIDR Block | AZ | Type | Auto-Assign Public IP | Purpose |
|---|---|---|---|---|---|
| `proctornet-public-1a` | `10.0.1.0/24` | `ap-south-1a` | Public | Yes (`map_public_ip_on_launch = true`) | Primary EC2 production host, Nginx edge, WebRTC SFU, Coturn relay |
| `proctornet-public-1b` | `10.0.2.0/24` | `ap-south-1b` | Public | Yes (`map_public_ip_on_launch = true`) | Multi-AZ spare, ready for future ALB / secondary EC2 host |
| `proctornet-private-1a` | `10.0.10.0/24` | `ap-south-1a` | Private | No (`map_public_ip_on_launch = false`) | DB Subnet Group & ElastiCache Subnet Group (AZ a) |
| `proctornet-private-1b` | `10.0.20.0/24` | `ap-south-1b` | Private | No (`map_public_ip_on_launch = false`) | DB Subnet Group & ElastiCache Subnet Group (AZ b) |

**Subnet Groups Defined**:
- `aws_db_subnet_group.proctornet_rds_subnet_group`: Encompasses `proctornet-private-1a` and `proctornet-private-1b`. Meets AWS requirement that RDS Multi-AZ subnet groups span at least 2 distinct Availability Zones.
- `aws_elasticache_subnet_group.proctornet_redis_subnet_group`: Encompasses `proctornet-private-1a` and `proctornet-private-1b`.

---

## 12. Route Tables

1. **Public Route Table (`proctornet-public-rt`)**:
   - Route `10.0.0.0/16` -> `local` (VPC internal traffic).
   - Route `0.0.0.0/0` -> `aws_internet_gateway.proctornet_igw.id` (Direct internet access for public subnets).
   - Associations: Explicitly associated with `proctornet-public-1a` and `proctornet-public-1b`.
2. **Private Route Table (`proctornet-private-rt`)**:
   - Route `10.0.0.0/16` -> `local` (VPC internal traffic only).
   - Associations: Explicitly associated with `proctornet-private-1a` and `proctornet-private-1b`.
   - **Zero Outbound Internet Route**: In Phase 20, private subnets have no default route (`0.0.0.0/0`). This guarantees that instances placed in private subnets are physically incapable of communicating with or being reached from the public internet.

---

## 13. Internet & NAT Gateway Design

### 13.1 Internet Gateway (IGW)
- An `aws_internet_gateway` resource (`proctornet-igw`) is attached to `proctornet-vpc`.
- Provides bidirectional network address translation for instances in the public subnets that possess public IP addresses or Elastic IPs.

### 13.2 NAT Gateway Evaluation & Deliberate Deferral
- **Decision**: **DO NOT provision AWS NAT Gateways in Phase 20**.
- **Technical Rationale**:
  1. The primary production EC2 host resides in `proctornet-public-1a` and communicates directly via the Internet Gateway. It does not require a NAT Gateway.
  2. The private subnets (`proctornet-private-1a` and `proctornet-private-1b`) contain only the DB Subnet Group and ElastiCache Subnet Group. Neither RDS PostgreSQL nor ElastiCache Redis requires outbound internet access.
  3. NAT Gateways incur a fixed cost of ~$32.85 per month per Availability Zone ($65.70/mo for 2 AZs) plus data processing fees ($0.045/GB). Provisioning NAT Gateways when zero private instances require outbound internet routing would violate the core architectural rule: *Measure → optimize → scale* and waste operational expenditure.
  4. NAT Gateways will be introduced if and when private compute workers (e.g. isolated AI background workers) requiring external API access are placed in private subnets in later phases.

---

## 14. Security Groups & Trust Boundaries

Security groups enforce default-deny egress/ingress boundaries at the virtual network interface layer.

### Visual Architecture Diagram: Security Group Trust Boundaries

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 480" width="100%" height="100%">
  <defs>
    <linearGradient id="sgBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1329"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>

  <rect width="920" height="480" rx="12" fill="url(#sgBg)" stroke="#334155" stroke-width="1.5"/>

  <text x="30" y="38" fill="#f8fafc" font-family="sans-serif" font-size="18" font-weight="700">ProctorNet Security Group Trust Boundaries</text>
  <text x="30" y="58" fill="#94a3b8" font-family="sans-serif" font-size="12">Default-Deny Ingress Architecture with Physical Port Isolation</text>

  <!-- Internet Source -->
  <rect x="40" y="100" width="160" height="340" rx="8" fill="#1e293b" stroke="#64748b" stroke-width="1.5"/>
  <text x="120" y="130" fill="#f8fafc" font-family="sans-serif" font-size="14" font-weight="700" text-anchor="middle">Internet / Public</text>
  <text x="120" y="150" fill="#94a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">CIDR: 0.0.0.0/0</text>
  <circle cx="120" cy="200" r="30" fill="#334155" stroke="#94a3b8" stroke-width="1"/>
  <text x="120" y="205" fill="#38bdf8" font-family="sans-serif" font-size="11" font-weight="600" text-anchor="middle">Clients</text>
  <text x="120" y="270" fill="#cbd5e1" font-family="sans-serif" font-size="10" text-anchor="middle">Examiners &amp; Students</text>
  <text x="120" y="310" fill="#f87171" font-family="sans-serif" font-size="10" text-anchor="middle">Untrusted Traffic</text>
  <text x="120" y="380" fill="#fbbf24" font-family="sans-serif" font-size="10" font-weight="600" text-anchor="middle">Admin CIDR (VPN)</text>

  <!-- EC2 Security Group -->
  <rect x="270" y="90" width="340" height="360" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="2"/>
  <text x="440" y="118" fill="#60a5fa" font-family="sans-serif" font-size="13" font-weight="700" text-anchor="middle">proctornet-ec2-sg (Public Ingress Boundary)</text>

  <!-- Allowed Ingress Rules -->
  <rect x="290" y="135" width="300" height="40" rx="4" fill="#065f46" stroke="#10b981" stroke-width="1"/>
  <text x="300" y="155" fill="#a7f3d0" font-family="sans-serif" font-size="10" font-weight="700">TCP 80 &amp; 443 (HTTP/HTTPS Edge)</text>
  <text x="300" y="168" fill="#d1fae5" font-family="sans-serif" font-size="9">From: 0.0.0.0/0 -> Terminated by Nginx unprivileged container</text>

  <rect x="290" y="185" width="300" height="40" rx="4" fill="#065f46" stroke="#10b981" stroke-width="1"/>
  <text x="300" y="205" fill="#a7f3d0" font-family="sans-serif" font-size="10" font-weight="700">UDP 40000–49999 (mediasoup WebRTC)</text>
  <text x="300" y="218" fill="#d1fae5" font-family="sans-serif" font-size="9">From: 0.0.0.0/0 -> Line-rate RTP/RTCP media streams</text>

  <rect x="290" y="235" width="300" height="40" rx="4" fill="#065f46" stroke="#10b981" stroke-width="1"/>
  <text x="300" y="255" fill="#a7f3d0" font-family="sans-serif" font-size="10" font-weight="700">TCP/UDP 3478 &amp; UDP 49152–49250 (Coturn)</text>
  <text x="300" y="268" fill="#d1fae5" font-family="sans-serif" font-size="9">From: 0.0.0.0/0 -> STUN binding &amp; TURN relay allocation</text>

  <rect x="290" y="285" width="300" height="40" rx="4" fill="#1e3a8a" stroke="#3b82f6" stroke-width="1"/>
  <text x="300" y="305" fill="#bfdbfe" font-family="sans-serif" font-size="10" font-weight="700">TCP 22 (SSH Management Access)</text>
  <text x="300" y="318" fill="#dbeafe" font-family="sans-serif" font-size="9">From: var.admin_cidr (WireGuard / Admin IP only)</text>

  <!-- Blocked Internal Ports -->
  <rect x="290" y="335" width="300" height="95" rx="4" fill="#450a0a" stroke="#ef4444" stroke-width="1"/>
  <text x="300" y="355" fill="#fca5a5" font-family="sans-serif" font-size="10" font-weight="700">STRICTLY BLOCKED FROM 0.0.0.0/0:</text>
  <text x="300" y="372" fill="#fecaca" font-family="sans-serif" font-size="9">• Port 4000 (Backend API): Host Loopback / Nginx internal only</text>
  <text x="300" y="388" fill="#fecaca" font-family="sans-serif" font-size="9">• Port 5432 (PostgreSQL): Binds 127.0.0.1 / Zero external ingress</text>
  <text x="300" y="404" fill="#fecaca" font-family="sans-serif" font-size="9">• Port 6379 (Redis): Binds 127.0.0.1 / Zero external ingress</text>
  <text x="300" y="420" fill="#fecaca" font-family="sans-serif" font-size="9">• Port 5672/15672 (RabbitMQ): Binds 127.0.0.1 / Zero external ingress</text>

  <!-- Internal RDS Security Group -->
  <rect x="670" y="90" width="220" height="150" rx="8" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="780" y="115" fill="#fbbf24" font-family="sans-serif" font-size="12" font-weight="700" text-anchor="middle">proctornet-rds-sg</text>
  <text x="780" y="132" fill="#94a3b8" font-family="sans-serif" font-size="10" text-anchor="middle">(Private Subnets)</text>
  <rect x="685" y="145" width="190" height="75" rx="4" fill="#0f172a" stroke="#d97706" stroke-width="1"/>
  <text x="695" y="165" fill="#fde68a" font-family="sans-serif" font-size="10" font-weight="700">Ingress: TCP 5432</text>
  <text x="695" y="180" fill="#cbd5e1" font-family="sans-serif" font-size="9">Source: proctornet-ec2-sg</text>
  <text x="695" y="195" fill="#ef4444" font-family="sans-serif" font-size="8" font-weight="600">All other ingress: DENIED</text>
  <text x="695" y="208" fill="#94a3b8" font-family="sans-serif" font-size="8">Egress: None (No outbound)</text>

  <!-- Internal ElastiCache Security Group -->
  <rect x="670" y="270" width="220" height="150" rx="8" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="780" y="295" fill="#fbbf24" font-family="sans-serif" font-size="12" font-weight="700" text-anchor="middle">proctornet-elasticache-sg</text>
  <text x="780" y="312" fill="#94a3b8" font-family="sans-serif" font-size="10" text-anchor="middle">(Private Subnets)</text>
  <rect x="685" y="325" width="190" height="75" rx="4" fill="#0f172a" stroke="#d97706" stroke-width="1"/>
  <text x="695" y="345" fill="#fde68a" font-family="sans-serif" font-size="10" font-weight="700">Ingress: TCP 6379</text>
  <text x="695" y="360" fill="#cbd5e1" font-family="sans-serif" font-size="9">Source: proctornet-ec2-sg</text>
  <text x="695" y="375" fill="#ef4444" font-family="sans-serif" font-size="8" font-weight="600">All other ingress: DENIED</text>
  <text x="695" y="388" fill="#94a3b8" font-family="sans-serif" font-size="8">Egress: None (No outbound)</text>

  <!-- Connectors -->
  <path d="M 200 155 L 290 155" stroke="#10b981" stroke-width="1.5" fill="none"/>
  <path d="M 200 205 L 290 205" stroke="#10b981" stroke-width="1.5" fill="none"/>
  <path d="M 200 255 L 290 255" stroke="#10b981" stroke-width="1.5" fill="none"/>
  <path d="M 200 305 L 290 305" stroke="#3b82f6" stroke-width="1.5" fill="none"/>

  <path d="M 610 180 L 670 180" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3" fill="none"/>
  <path d="M 610 360 L 670 360" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3" fill="none"/>
</svg>

### 14.1 Detailed Security Group Rule Definitions

#### 1. `proctornet-ec2-sg` (EC2 Instance Security Group)
- **Ingress Rules**:
  - `tcp/80`: `cidr_blocks = ["0.0.0.0/0"]` — Nginx HTTP (ACME challenge & HTTPS 301 redirect).
  - `tcp/443`: `cidr_blocks = ["0.0.0.0/0"]` — Nginx HTTPS (TLS termination for SPA, REST API, WebSocket).
  - `udp/40000-49999`: `cidr_blocks = ["0.0.0.0/0"]` — mediasoup native WebRTC RTP/RTCP audio/video traffic.
  - `tcp/3478` and `udp/3478`: `cidr_blocks = ["0.0.0.0/0"]` — Coturn STUN/TURN signaling.
  - `udp/49152-49250`: `cidr_blocks = ["0.0.0.0/0"]` — Coturn TURN relayed media traffic.
  - `tcp/22`: `cidr_blocks = [var.admin_cidr]` — Restricted SSH administration. (Set to administrator's WireGuard endpoint or specific office IP; NEVER `0.0.0.0/0`).
- **Explicit Blocked Ports (NO Ingress Rules)**:
  - `tcp/4000` (Backend REST/WS internal port): Dropped at security group. Accessible only locally via Nginx reverse proxy.
  - `tcp/5432` (PostgreSQL): Dropped at security group. Binds strictly to `127.0.0.1`.
  - `tcp/6379` (Redis): Dropped at security group. Binds strictly to `127.0.0.1`.
  - `tcp/5672` & `tcp/15672` (RabbitMQ): Dropped at security group. Binds strictly to `127.0.0.1`.
- **Egress Rules**:
  - `all/all`: `cidr_blocks = ["0.0.0.0/0"]` — Outbound access for OS package security patches, Docker Hub image pulls, S3 evidence uploads, Let's Encrypt ACME verification, and CloudWatch/SSM API calls.

#### 2. `proctornet-rds-sg` (RDS PostgreSQL Security Group — Scale Ready)
- **Ingress Rules**:
  - `tcp/5432`: `security_groups = [aws_security_group.proctornet_ec2_sg.id]` — Permits PostgreSQL connection ONLY from the EC2 security group. Zero CIDR ingress.
- **Egress Rules**:
  - `none` — RDS does not initiate outbound connections.

#### 3. `proctornet-elasticache-sg` (ElastiCache Redis Security Group — Scale Ready)
- **Ingress Rules**:
  - `tcp/6379`: `security_groups = [aws_security_group.proctornet_ec2_sg.id]` — Permits Redis commands ONLY from the EC2 security group. Zero CIDR ingress.
- **Egress Rules**:
  - `none` — Cache nodes do not initiate outbound connections.

---

## 15. IAM Architecture & Least Privilege

The architecture completely eliminates static, long-lived AWS IAM User access keys in application runtime environments.

### 15.1 EC2 IAM Instance Profile
- An `aws_iam_instance_profile` (`proctornet-ec2-instance-profile`) is attached to the EC2 host.
- Backed by an `aws_iam_role` (`proctornet-ec2-role`) with `AssumeRole` trusted entity: `ec2.amazonaws.com`.

### 15.2 Attached Least-Privilege IAM Policies

#### 1. S3 Evidence Storage Policy (`ProctorNetS3EvidenceAccess`)
Conforms strictly to Phase 15 and ADR-0005:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EvidenceBucketObjectOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion"
      ],
      "Resource": "arn:aws:s3:::proctornet-evidence-production-${account_id}/*"
    },
    {
      "Sid": "EvidenceBucketListingOperations",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:ListBucketVersions"
      ],
      "Resource": "arn:aws:s3:::proctornet-evidence-production-${account_id}"
    }
  ]
}
```

#### 2. S3 Database Backup Policy (`ProctorNetS3BackupAccess`)
Permits the scheduled backup service to upload and restore compressed daily SQL dumps to/from the private backup bucket:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BackupBucketWriteOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::proctornet-backups-production-${account_id}/postgres/*"
    }
  ]
}
```

#### 3. SSM Parameter Store Secret Access Policy (`ProctorNetSSMParameterAccess`)
Allows the EC2 secret materialization script to securely retrieve production secrets without committing them to version control:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SSMProductionSecretRead",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": "arn:aws:ssm:ap-south-1:${account_id}:parameter/proctornet/production/*"
    },
    {
      "Sid": "SSMKMSDecrypt",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:ap-south-1:${account_id}:alias/aws/ssm"
    }
  ]
}
```

#### 4. CloudWatch Agent & Observability Policy (`ProctorNetCloudWatchAccess`)
Explicit least-privilege policy scoped to the CloudWatch Agent namespace and application log groups:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudWatchMetricsPut",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudwatch:namespace": "CWAgent"
        }
      }
    },
    {
      "Sid": "CloudWatchLogsDelivery",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:ap-south-1:${account_id}:log-group:/aws/ec2/proctornet/production:*"
    }
  ]
}
```

### 15.3 CI/CD & Terraform IAM Roles
- CI/CD execution (GitHub Actions) authenticates via **OpenID Connect (OIDC)** using `aws-actions/configure-aws-credentials` against an IAM Role `proctornet-ci-terraform-role`.
- **Zero static AWS Access Keys** are stored in GitHub repository secrets.
- Pull request workflows assume a read-only role capable of `terraform plan` and state reading.
- Deployment workflows on `main` assume an apply-capable role protected by GitHub Environment approval gates.

---

## 16. Compute Architecture

### 16.1 Instance Sizing & Configurable Environment Selection
The EC2 compute instance type is parameterized via the Terraform input variable `var.instance_type`. It is **NOT** a universal architectural invariant, but an explicit environment configuration decision declared in `environments/*/terraform.tfvars`:

```hcl
# terraform/modules/ec2/variables.tf
variable "instance_type" {
  type        = string
  description = "EC2 instance type (e.g. c6i.xlarge for production, t3.large or t3.xlarge for staging)"
  default     = "c6i.xlarge"
}
```

#### Environment-Specific Sizing Strategy:
- **Staging Environment (`var.instance_type = "t3.large"` or `"t3.xlarge"`)**:
  - *Purpose*: Disposable integration and validation environment for testing Terraform automation, Cloud-Init bootstrapping, Docker Compose startup, forward-only migrations, and network connectivity.
  - *Media & Networking Behavior*: **100% reproduces production hybrid networking** (host networking for backend and Coturn, bridge for frontend edge, direct UDP port ranges).
  - *Cost & Capacity Expectations*: Reduced capacity requirements. Uses burstable instances (e.g. `t3.large` [2 vCPU, 8 GiB] or `t3.xlarge` [4 vCPU, 16 GiB]) to minimize idle cloud spend when candidate load is absent, while maintaining full functional compatibility.
- **Production Environment (`var.instance_type = "c6i.xlarge"` or `"c6i.2xlarge"`)**:
  - *Purpose*: High-concurrency live examination delivery.
  - *Compute Rationale*: `mediasoup` native workers execute C++ thread loops processing high-frequency UDP RTP audio/video packet serialization. Dedicated compute-optimized instances (`c6i` based on 3rd Gen Intel Xeon Scalable processors) provide consistent high single-core IPC and dedicated network bandwidth (up to 12.5 Gbps), avoiding CPU credit exhaustion and packet jitter inherent in burstable `t3` instances during synchronized exam streaming peaks.

### 16.2 Operating System & Kernel
- **AMI**: Ubuntu Server 24.04 LTS (Noble Numbat), 64-bit (x86_64), dynamically located via `aws_ami` data source filtered by canonical owner ID (`099720109477`).
- **Kernel**: Linux 6.8+ HVM with standard `glibc` (resolving native `mediasoup-worker` compatibility without thread scheduling anomalies).

### 16.3 Storage Architecture
1. **Root EBS Volume**:
   - Size: 50 GiB gp3 (3,000 baseline IOPS, 125 MB/s throughput).
   - Encryption: Encrypted at rest via AWS-managed KMS key (`aws/ebs`).
   - Purpose: OS, Docker daemon, container images, log files.
2. **Persistent Data EBS Volume**:
   - Size: 100 GiB gp3 (3,000 IOPS, 125 MB/s throughput, expandable dynamically).
   - Encryption: Encrypted at rest via AWS-managed KMS key (`aws/ebs`).
   - Device Attachment: `/dev/xvdf` attached to EC2 instance and formatted as `ext4`.
   - Mount Point: `/opt/proctornet/data`.
   - Safety Lifecycle: Configured with `lifecycle { prevent_destroy = true }` to prevent catastrophic data loss during environment teardown.
   - Persistence Mapping: Docker Compose named volumes (`pg_data`, `redis_data`, `rmq_data`) and database backup archives are stored on this persistent mount point.

### 16.4 Cloud-Init Bootstrapping (`user_data`)
The EC2 instance is bootstrapped automatically via a declarative Cloud-Init script:
1. Mounts the persistent EBS data volume at `/opt/proctornet/data`.
2. Installs Docker CE, Docker Buildx, and Docker Compose v2 from the official Docker repository.
3. Installs Snap Certbot and provisions initial Let's Encrypt certificate for `${var.domain_name}` using the webroot plugin.
4. Enforces strict cryptographic permissions on `/etc/letsencrypt/live` and `/etc/letsencrypt/archive` (mode `0640` owned by `root:101`).
5. Configures `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` to reload Nginx on renewal.
6. Installs and configures the Amazon CloudWatch Agent (`amazon-cloudwatch-agent`) with memory and disk metrics.
7. Executes `/opt/proctornet/bin/fetch-secrets.sh` to retrieve production secrets from SSM Parameter Store and materializes `/opt/proctornet/.env` with mode `0600` owned by `root:root`.
8. Deploys `infrastructure/docker-compose.prod.yml`, `infrastructure/deploy.sh`, and `infrastructure/backup-db.sh`.
9. Configures the systemd timer for automated backups (`proctornet-backup.timer`).
10. Registers and enables `proctornet.service` under systemd, booting the stack on system initialization.

---

## 17. Database Architecture

### 17.1 Active Phase 20 Baseline: Containerized PostgreSQL 16
- Runs as `proctornet-postgres` container (`postgres:16.4-alpine`) in `infrastructure/docker-compose.prod.yml`.
- Bound strictly to host loopback: `127.0.0.1:5432`.
- Persistence: Data directory mounted to `/opt/proctornet/data/pg_data` on the encrypted gp3 EBS volume.
- Backups: Scheduled daily logical backups via `backup-db.sh` using `pg_dump`, compressed with gzip, retained locally for 30 days, and synced to `s3://proctornet-backups-production-${account_id}`.

### 17.2 Scale-Ready Module: Amazon RDS PostgreSQL 16 (`modules/rds`)
The RDS module is fully declared in Terraform but feature-toggled via `var.enable_rds = false`.

#### Specifications:
- **Engine**: PostgreSQL 16.4.
- **Instance Class**: `db.t4g.medium` (2 vCPUs, 4 GiB RAM, AWS Graviton3).
- **Allocated Storage**: 50 GiB gp3 with storage autoscaling up to 200 GiB.
- **Storage Encryption**: KMS encrypted.
- **Multi-AZ**: Parameterized (`var.rds_multi_az`, defaults to `true` in production).
- **Subnet Placement**: `aws_db_subnet_group` across `proctornet-private-1a` and `proctornet-private-1b`.
- **Security**: Security group accepts ingress on port 5432 exclusively from `proctornet-ec2-sg`.
- **Automated Backups**: 7-day retention (configurable up to 35 days); automated point-in-time recovery (PITR).
- **Maintenance Window**: `Sun:04:30-Sun:05:30 UTC`. Backup window: `03:00-04:00 UTC`.
- **Parameter Group**: Custom parameter group enforcing:
  - `rds.force_ssl = 1` (Enforces TLS encryption for all client connections).
  - `max_connections = 200`.
  - `shared_preload_libraries = "pgcrypto,pg_stat_statements"`.
- **Lifecycle & Safety**: `deletion_protection = true`, `skip_final_snapshot = false`, `final_snapshot_identifier = "proctornet-rds-final-snapshot"`.

### 17.3 Phase 21 Database Migration Runbook
When Phase 21 load testing indicates the need to activate RDS:
1. Enable the RDS module: `enable_rds = true` in `terraform.tfvars`. Run `terraform apply`.
2. Stop application write traffic on the EC2 host: `docker compose stop backend frontend`.
3. Take a final consistent logical dump: `docker compose exec postgres pg_dump -U postgres proctornet > cutover.sql`.
4. Restore data to RDS: `psql -h <rds_endpoint> -U postgres -d proctornet < cutover.sql`.
5. Update `/opt/proctornet/.env` on the EC2 host: Set `DB_HOST=<rds_endpoint>` and `DB_PORT=5432`.
6. Restart application: `docker compose up -d backend frontend`.
7. Verify health and deep readiness: `curl -sf http://127.0.0.1:4000/ready`.

---

## 18. Redis Architecture

### 18.1 Active Phase 20 Baseline: Containerized Redis 7
- Runs as `proctornet-redis` container (`redis:7.4-alpine`).
- Bound strictly to host loopback: `127.0.0.1:6379`.
- Non-authoritative model (ADR-0001): Used for sliding-window rate limiting, token blacklist caching, and realtime pub/sub.
- Persistence: Append-only file (`--appendonly yes`) stored on the encrypted EBS volume.

### 18.2 Scale-Ready Module: Amazon ElastiCache Redis 7 (`modules/elasticache`)
- Feature-toggled via `var.enable_elasticache = false`.
- **Engine**: Redis 7.1.
- **Node Type**: `cache.t4g.small` (AWS Graviton2).
- **Subnet Placement**: Private subnets `proctornet-private-1a` and `proctornet-private-1b`.
- **Security**: Security group accepts ingress on port 6379 exclusively from `proctornet-ec2-sg`.
- **Encryption**: `transit_encryption_enabled = true` (TLS), `at_rest_encryption_enabled = true`, `auth_token` enabled via SSM Parameter Store.

---

## 19. RabbitMQ Architecture

- **Deployment Model**: Containerized on the EC2 host (`rabbitmq:3.13.7-management-alpine`).
- **Network Binding**: Bound strictly to host loopback (`127.0.0.1:5672` for AMQP, `127.0.0.1:15672` for management).
- **Storage**: Persistent volume mounted at `/opt/proctornet/data/rmq_data`.
- **Operational Invariants**:
  - Transactional outbox polling guarantees message reliability (ADR-0002).
  - Quorum queues enforce broker-side durability.
  - Amazon MQ is **explicitly rejected**: Unnecessary cloud cost ($75+/mo) and proprietary overhead without any scalability advantage over containerized RabbitMQ for the modular monolith's event volume.

---

## 20. S3 Storage & Retention Architecture

The S3 configuration in Phase 20 adheres strictly to the evidence-storage contract established in Phase 15 and documented in `docs/ADR/0005-private-object-storage-architecture-direct-presigned-evidence-uploads-and-authoritative-postgresql-metadata-lifecycle.md`.

### 20.1 Bucket Declarations
1. **Evidence Storage Bucket**: `proctornet-evidence-${var.environment}-${account_id}`
2. **Database Backup Bucket**: `proctornet-backups-${var.environment}-${account_id}`

### 20.2 Non-Negotiable Security Controls
- **Block Public Access (BPA)**: All four AWS S3 BPA settings are explicitly set to `true`:
  - `block_public_acls = true`
  - `block_public_policy = true`
  - `ignore_public_acls = true`
  - `restrict_public_buckets = true`
- **Object Ownership**: `BucketOwnerEnforced` (ACLs disabled entirely).
- **Server-Side Encryption**: SSE-S3 (`AES256`) or AWS KMS customer-managed key.
- **TLS Transport Enforcement**: Bucket policy includes an explicit `Deny` statement for any request where `aws:SecureTransport == false`.
- **Versioning**: Enabled (`status = "Enabled"`). Guarantees tamper-evident audit trails. Deleting an object creates a delete marker; permanent deletion requires specific `s3:DeleteObjectVersion` permissions mediated by the backend.

### 20.3 Reconciled Evidence Retention & Lifecycle Architecture
In strict compliance with ADR-0005 and institutional examination governance, **active evidence retention is server-authoritative and managed by PostgreSQL metadata, NOT by blind S3 cloud lifecycle rules**:

1. **Active Evidence Retention (Application-Authoritative)**:
   - S3 bucket lifecycle rules **DO NOT perform destructive expiration on current object versions**.
   - Setting a blind 90-day expiration on active S3 objects would prematurely destroy evidence for exams under academic appeal, flagged sessions, or legal dispute, causing database-vs-storage desynchronization.
   - Deletion of active evidence occurs exclusively through the backend maintenance worker `runRetentionPurgeSweeper` (`backend/src/modules/evidence/evidence.service.js`), which claims records where `retention_expires_at <= NOW()`, invokes version-aware S3 deletion (`DeleteObjectsCommand`), and authoritatively marks the database record as `PURGED`.
2. **Old Object-Version Cleanup (Non-Current Versions)**:
   - To prevent indefinite storage accumulation of overwritten or deleted object versions resulting from re-uploads or delete markers, non-current versions are managed via a parameterized S3 lifecycle rule:
   - Variable `var.evidence_noncurrent_version_expiration_days` (default `null` / disabled; configurable via institutional governance).
   - When enabled, non-current versions transition to Glacier Instant Retrieval after 30 days and expire after the configured number of days.
3. **Incomplete Multipart Upload Cleanup**:
   - S3 lifecycle safely aborts incomplete multipart uploads after 7 days (`abort_incomplete_multipart_upload_days = 7`), preventing orphan upload accumulation.
4. **Backup Bucket Retention**:
   - Distinct from evidence storage. Managed in `proctornet-backups-${var.environment}-${account_id}`:
   - Daily backups are retained locally on the EBS data volume for 30 days.
   - S3 backup bucket lifecycle transitions backups to Glacier Instant Retrieval after 30 days and expires backups after 90 days (configurable via `var.backup_retention_days`).

### 20.4 Cross-Origin Resource Sharing (CORS)
Configured to allow candidate browsers to upload directly to S3 via presigned PUT URLs:
```hcl
cors_rule {
  allowed_headers = ["*"]
  allowed_methods = ["PUT", "GET", "HEAD"]
  allowed_origins = ["https://${var.domain_name}"]
  expose_headers  = ["ETag", "x-amz-version-id"]
  max_age_seconds = 3600
}
```

---

## 21. Application Load Balancer & Edge Architecture

### 21.1 Phase 20 Edge Architecture (Active Baseline)
- **Edge Reverse Proxy**: Unprivileged Nginx container (`frontend`) running in Docker bridge mode on host ports 80 and 443.
- **Port 80 (8080 internal)**: Responds to ACME HTTP-01 challenges under `/.well-known/acme-challenge/` and issues HTTP 301 redirects to HTTPS.
- **Port 443 (8443 internal)**: Terminates TLS, serves static React SPA assets with caching headers, and reverse-proxies API (`/api/v1`) and WebSocket (`/ws`) traffic to `http://host.docker.internal:4000`.

### 21.2 Why ALB is Deferred to Phase 21
1. **Incompatible Media Protocol**: WebRTC SFU media (`40000–49999/udp`) and Coturn (`3478`, `49152–49250/udp`) operate on UDP. AWS Application Load Balancers operate exclusively on Layer 7 (HTTP/HTTPS/gRPC) and **cannot proxy UDP packets**. Placing WebRTC media behind an ALB completely breaks video streaming.
2. **Single-Host Topology**: With a single EC2 host, an ALB introduces an extra network serialization hop, latency, and cost ($25+/month) while providing zero high-availability redundancy (if the EC2 host goes down, the ALB returns HTTP 502).
3. **Scale-Ready ALB Module (`modules/alb`)**: Authored in Terraform with `var.enable_alb = false`. It defines a Multi-AZ public ALB with ACM certificate integration, target groups for port 8080/8443, and sticky WebSocket routing, ready for activation when multiple backend instances are deployed in Phase 21.

---

## 22. TLS & Domain Name Architecture

1. **DNS Management**: Amazon Route 53 Public Hosted Zone.
   - An A-record maps `${var.domain_name}` (e.g. `exam.proctornet.com`) directly to the EC2 Elastic IP.
2. **TLS Certificate Management in Phase 20**:
   - Host-level Snap Certbot with automated Let's Encrypt certificates.
   - Cryptographic security constraint: Private keys in `/etc/letsencrypt/live` and `/etc/letsencrypt/archive` strictly enforce mode `0640` owned by `root:101`. World-readable mode `0644` is prohibited.
   - Automated renewal hook at `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` triggers in-memory Nginx worker reload (`nginx -s reload`).
3. **Future Scale TLS (Phase 21+)**:
   - AWS Certificate Manager (ACM) public certificate with DNS validation via Route 53, attached to the ALB when multi-instance load balancing is activated.

---

## 23. SFU & TURN AWS Networking

The WebRTC media plane requires specialized cloud networking to avoid packet loss, jitter, and proxy serialization bottlenecks:

```
[Candidate Browser] ─────────── WebRTC Media (UDP 40000–49999) ───────────► [EC2 Elastic IP] ──► [mediasoup-worker]
        │                                                                           ▲
        └────────────────────── STUN/TURN Relay (UDP 3478, 49152–49250) ────────────┘
```

1. **Direct Host Networking**:
   - The backend container runs with `network_mode: "host"`.
   - Native C++ `mediasoup-worker` processes bind directly to the host's physical network interface.
   - Bypasses the Docker bridge userland proxy (`docker-proxy`), which exhausts host memory and introduces packet latency when mapping 10,000 UDP ports.
2. **Public IP Announcement**:
   - `MEDIA_ANNOUNCED_IP` is configured to the **EC2 Elastic IP**.
   - Mediasoup injects this Elastic IP into ICE candidates returned to candidate and proctor browsers during WebRTC transport negotiation.
3. **Coturn STUN/TURN Relay**:
   - Runs with `network_mode: "host"`.
   - `TURN_ANNOUNCED_HOST` is configured to the Elastic IP or domain name.
   - Listens on port 3478 and allocates relay sockets across `49152–49250/udp`.
   - Ephemeral TURN credentials generated via HMAC-SHA1 using `TURN_STATIC_AUTH_SECRET`.
4. **Security Group Ingress**:
   - `udp/40000-49999` and `udp/49152-49250` are opened from `0.0.0.0/0` directly to the EC2 instance.
   - Completely bypasses ALB.

---

## 24. WireGuard & Management Boundary

Administrative access to the production EC2 host is secured through a layered, defense-in-depth model:

1. **Zero Public SSH (Default)**:
   - Port 22 has **NO ingress rule from `0.0.0.0/0`**.
   - Primary administrative access is conducted via **AWS Systems Manager (SSM) Session Manager**.
   - SSM Session Manager requires zero inbound ports, establishes TLS-encrypted shell sessions authenticated via IAM, and logs all commands to CloudWatch.
2. **Restricted SSH (Secondary / WireGuard Boundary)**:
   - If direct SSH is required, security group ingress on port 22 is restricted strictly to `var.admin_cidr`.
   - `var.admin_cidr` corresponds to an internal corporate WireGuard VPN gateway or dedicated bastion host.

---

## 25. Secrets Management & Operational Materialization

Production secrets management follows a strict fail-closed protocol with zero plaintext secrets in source repositories or Terraform state:

### 25.1 Parameter Store Hierarchy
Secrets are declared as `SecureString` parameters under the hierarchical path `/proctornet/${var.environment}/*`, encrypted with KMS key `alias/aws/ssm`:
- `/proctornet/${var.environment}/db_password`
- `/proctornet/${var.environment}/redis_password`
- `/proctornet/${var.environment}/rabbitmq_password`
- `/proctornet/${var.environment}/jwt_access_secret` (>= 32 chars)
- `/proctornet/${var.environment}/jwt_refresh_secret` (>= 32 chars)
- `/proctornet/${var.environment}/anti_tamper_secret` (>= 32 chars)
- `/proctornet/${var.environment}/turn_static_auth_secret` (>= 16 chars)
- `/proctornet/${var.environment}/metrics_auth_token` (>= 32 chars)

### 25.2 Operational Materialization Path
The exact lifecycle by which SSM parameters become runtime environment variables consumed by the Phase 19 Docker Compose deployment is defined as follows:

```
[SSM Parameter Store (SecureString)]
                 │
                 │ 1. IAM Authenticated API Call (EC2 Instance Profile)
                 ▼
[/opt/proctornet/bin/fetch-secrets.sh]
                 │
                 │ 2. Materializes file with mode 0600 (root:root)
                 ▼
[/opt/proctornet/.env]
                 │
                 │ 3. Docker Compose --env-file /opt/proctornet/.env
                 ▼
[Private Container Namespaces (backend, frontend, postgres, redis, coturn)]
```

1. **Who Retrieves Them**:
   - Initial Boot: Executed by the Cloud-Init bootstrapping script.
   - Ongoing / Rotations: Executed by a dedicated root helper script `/opt/proctornet/bin/fetch-secrets.sh` (or invoked as a systemd `ExecStartPre` hook in `proctornet.service`).
2. **When Retrieval Occurs**:
   - At instance cold boot before `docker compose up` is invoked.
   - During release deployment in `infrastructure/deploy.sh` before restarting application containers.
   - On-demand whenever secrets are rotated in SSM.
3. **How Values Are Materialized**:
   The `fetch-secrets.sh` script executes:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   
   ENV_FILE="/opt/proctornet/.env"
   UMASK_ORIG=$(umask)
   umask 077
   
   echo "==> Fetching production parameters from AWS SSM..."
   PARAMS=$(aws ssm get-parameters-by-path \
     --path "/proctornet/production/" \
     --with-decryption \
     --region "ap-south-1" \
     --query "Parameters[*].{Name:Name,Value:Value}" \
     --output json)
   
   # Parse and render into .env
   node -e '
     const params = JSON.parse(process.argv[1]);
     const fs = require("fs");
     let content = fs.readFileSync("/opt/proctornet/.env.template", "utf8");
     for (const p of params) {
       const key = p.Name.split("/").pop().toUpperCase();
       content = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${p.Value}`);
     }
     fs.writeFileSync("/opt/proctornet/.env", content, { mode: 0o600 });
   ' "$PARAMS"
   
   umask "$UMASK_ORIG"
   chmod 0600 "$ENV_FILE"
   chown root:root "$ENV_FILE"
   ```
4. **File Permissions**:
   - Materialized strictly at `/opt/proctornet/.env` on the encrypted persistent EBS volume.
   - Permissions: Strictly mode `0600` owned by `root:root`. Group access and world access are strictly prohibited (`chmod 0600`).
5. **Runtime Injection**:
   - Docker Compose loads the file via `--env-file /opt/proctornet/.env`.
   - Variables are passed directly into the container's isolated Linux environment namespace.
6. **Process Listing & Log Protection**:
   - Secrets are **never passed as command-line arguments** (e.g. `-e KEY=VALUE` in `docker run`), preventing exposure in `ps aux`, `pstree`, or `/proc/$PID/cmdline`.
   - Backend logging middleware redacts passwords, tokens, and authorization headers (conforming to ADR-0008).
7. **Secret Rotation Workflow**:
   - Update parameter in SSM Parameter Store.
   - Run `/opt/proctornet/bin/fetch-secrets.sh`.
   - Execute targeted container recreation without dropping database connections:
     `docker compose -f /opt/proctornet/docker-compose.prod.yml up -d --no-deps backend frontend`.
8. **Fail-Closed Behavior**:
   - If any required production secret is missing from SSM, `fetch-secrets.sh` exits with a non-zero status code, and `proctornet.service` halts startup immediately, preventing the platform from booting with uninitialized credentials.

---

## 26. Observability & Telemetry

Phase 20 establishes comprehensive telemetry by combining AWS-native infrastructure metrics with the Prometheus application metrics established in Phase 13 and ADR-0003.

### 26.1 CloudWatch Agent Host Telemetry
Arbitrary CPU and instance status metrics provided by default EC2 hypervisor monitoring are insufficient to monitor system memory and disk utilization. To establish authoritative telemetry, the **Amazon CloudWatch Agent (`amazon-cloudwatch-agent`)** is installed and configured on the EC2 host.

#### 1. Agent Configuration (`/opt/aws/amazon-cloudwatch-agent/bin/config.json`):
```json
{
  "agent": {
    "metrics_collection_interval": 60,
    "run_as_user": "root"
  },
  "metrics": {
    "namespace": "CWAgent",
    "metrics_collected": {
      "mem": {
        "measurement": [
          "mem_used_percent"
        ]
      },
      "disk": {
        "measurement": [
          "disk_used_percent"
        ],
        "resources": [
          "/",
          "/opt/proctornet/data"
        ]
      }
    },
    "append_dimensions": {
      "InstanceId": "${aws:InstanceId}"
    }
  }
}
```

#### 2. Agent Lifecycle & Startup:
- The agent is installed via Cloud-Init: `apt-get install -y amazon-cloudwatch-agent`.
- Configured and registered under systemd:
  ```bash
  /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json
  systemctl enable amazon-cloudwatch-agent.service
  ```
- Systemd automatically restarts the agent on unexpected failure (`Restart=always`).

### 26.2 CloudWatch Log Group
- **Log Group**: `/aws/ec2/proctornet/${var.environment}`.
- **Retention**: 30 days.
- **Streams**:
  - `docker-compose`: Captures stdout/stderr from `backend`, `frontend`, `postgres`, `redis`, and `coturn`.
  - `systemd-journal`: Captures host system events, Certbot renewals, and backup executions.

### 26.3 CloudWatch Alarm Definitions
The Terraform `modules/cloudwatch` module provisions four critical infrastructure alarms:

1. **`ProctorNet-High-CPU`**:
   - Metric: `CPUUtilization` | Namespace: `AWS/EC2`
   - Evaluation: Average >= 80% for 2 consecutive 5-minute periods (10 minutes sustained).
2. **`ProctorNet-High-Memory`**:
   - Metric: `mem_used_percent` | Namespace: `CWAgent`
   - Dimension: `InstanceId = aws_instance.proctornet_ec2.id`
   - Evaluation: Average >= 85% for 2 consecutive 5-minute periods.
3. **`ProctorNet-High-Disk-DataVolume`**:
   - Metric: `disk_used_percent` | Namespace: `CWAgent`
   - Dimensions: `InstanceId = aws_instance.proctornet_ec2.id`, `path = "/opt/proctornet/data"`
   - Evaluation: Average >= 85% for 1 5-minute period.
4. **`ProctorNet-StatusCheckFailed`**:
   - Metric: `StatusCheckFailed` | Namespace: `AWS/EC2`
   - Evaluation: Maximum >= 1 for 1 1-minute period (triggers immediate operator alert).

### 26.4 Application Metrics Boundary
- Backend `/metrics` endpoint continues to serve in-process Prometheus metrics, protected by Bearer token (`METRICS_AUTH_TOKEN`). It is scraped internally without exposing metrics publicly.

---

## 27. Backup, Restore & Disaster Recovery

### 27.1 Complete Backup Operational Chain
To avoid vague assertions of "daily automated backups", Phase 20 explicitly defines the complete, automated end-to-end backup operational chain:

```
[systemd timer (proctornet-backup.timer)]
                 │
                 │ 1. Triggers daily at 02:00 UTC
                 ▼
[systemd service (proctornet-backup.service)]
                 │
                 │ 2. Executes /opt/proctornet/backup-db.sh
                 ▼
[docker compose exec postgres pg_dump]
                 │
                 │ 3. Consistent logical schema & data dump
                 ▼
[gzip compression (/opt/proctornet/backups/proctornet_db_YYYYMMDD_HHMMSS.sql.gz)]
                 │
                 │ 4. Local retention check: purge dumps older than 30 days
                 ▼
[Encrypted AWS S3 Upload (aws s3 cp --sse AES256)]
                 │
                 │ 5. Syncs to s3://proctornet-backups-production-<account_id>/postgres/
                 ▼
[Failure Reporting / Alerting (OnFailure= -> CloudWatch Log / Metric Alarm)]
```

#### 1. Scheduler Mechanism & Configuration:
- Managed via systemd timer `/etc/systemd/system/proctornet-backup.timer`:
  ```ini
  [Unit]
  Description=ProctorNet Scheduled Daily Database Backup Timer
  
  [Timer]
  OnCalendar=*-*-* 02:00:00 UTC
  Persistent=true
  
  [Install]
  WantedBy=timers.target
  ```
- Service definition `/etc/systemd/system/proctornet-backup.service`:
  ```ini
  [Unit]
  Description=ProctorNet Database Backup Service
  After=docker.service
  OnFailure=proctornet-backup-alert.service
  
  [Service]
  Type=oneshot
  ExecStart=/opt/proctornet/backup-db.sh
  User=root
  ```

#### 2. Backup Execution (`backup-db.sh`):
- Preserves the existing Phase 19 backup script (`infrastructure/backup-db.sh`) and augments it with S3 sync:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  
  BACKUP_DIR="${BACKUP_DIR:-/opt/proctornet/backups}"
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  BACKUP_FILE="${BACKUP_DIR}/proctornet_db_${TIMESTAMP}.sql.gz"
  BACKUP_BUCKET="${BACKUP_BUCKET:-proctornet-backups-production}"
  
  mkdir -p "${BACKUP_DIR}"
  
  echo "==> [Backup] Initiating PostgreSQL backup to ${BACKUP_FILE}..."
  docker compose -f /opt/proctornet/docker-compose.prod.yml exec -T postgres \
    pg_dump -U "${DB_USER:-postgres}" "${DB_NAME:-proctornet}" | gzip > "${BACKUP_FILE}"
  
  echo "==> [Backup] Backup created successfully: $(du -h "${BACKUP_FILE}")"
  
  # Local Retention: Purge local backups older than 30 days
  find "${BACKUP_DIR}" -name "proctornet_db_*.sql.gz" -mtime +30 -delete
  echo "==> [Backup] Local retention policy applied."
  
  # S3 Sync: Upload compressed dump with server-side encryption
  echo "==> [Backup] Uploading backup to S3 bucket ${BACKUP_BUCKET}..."
  aws s3 cp "${BACKUP_FILE}" "s3://${BACKUP_BUCKET}/postgres/$(basename "${BACKUP_FILE}")" --sse AES256
  echo "==> [Backup] S3 upload completed successfully."
  ```

#### 3. IAM Permissions:
- Policy `ProctorNetS3BackupAccess` explicitly grants `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::proctornet-backups-${var.environment}-${account_id}/postgres/*`.

#### 4. S3 Lifecycle & Retention:
- Local copies retained for 30 days on the persistent EBS data volume.
- S3 backup bucket transitions backups to Glacier Instant Retrieval after 30 days and expires backups after 90 days.

#### 5. Failure Behavior & Reporting:
- `backup-db.sh` runs with `set -euo pipefail`. If `pg_dump`, `gzip`, or `aws s3 cp` fails, the script exits immediately with a non-zero status code.
- Systemd triggers `proctornet-backup-alert.service`, which writes an error entry to the journal.
- A CloudWatch Metric Filter on log group `/aws/ec2/proctornet/production` matching `"[Backup] ERROR"` increments metric `BackupFailureCount` and triggers a high-severity operator alarm.

### 27.2 Restore Workflow & Verification Runbook

#### 1. Restore Execution Procedure:
```bash
# Step 1: Halt application write traffic
docker compose -f /opt/proctornet/docker-compose.prod.yml stop backend frontend

# Step 2: Retrieve target backup from S3 (if not present locally)
aws s3 cp "s3://${BACKUP_BUCKET}/postgres/proctornet_db_<TARGET_TIMESTAMP>.sql.gz" /tmp/restore_target.sql.gz

# Step 3: Stream restore through PostgreSQL client container
gunzip < /tmp/restore_target.sql.gz | \
  docker compose -f /opt/proctornet/docker-compose.prod.yml exec -T postgres \
  psql -U "${DB_USER}" -d "${DB_NAME}"

# Step 4: Restart application services
docker compose -f /opt/proctornet/docker-compose.prod.yml up -d backend frontend
```

#### 2. Restore Verification Procedure:
Following any restore, operators must execute three mandatory verification assertions:
1. **Relational Sanity Query**:
   ```sql
   SELECT count(*) FROM users;
   SELECT count(*) FROM exams;
   SELECT count(*) FROM exam_attempts;
   ```
2. **Deep System Readiness Probe**:
   ```bash
   curl -sf http://127.0.0.1:4000/ready | grep -q '"status":"READY"'
   ```
3. **Audit Log Monotonicity Check**:
   ```sql
   SELECT MAX(timestamp) FROM audit_logs;
   ```

### 27.3 Recovery Objectives: Engineering Targets vs Measured Benchmarks

In compliance with rigorous architectural standards, **RTO and all RPO metrics are defined as engineering targets, NOT proven production guarantees**, until empirically benchmarked in Phase 22. Two distinct recovery dimensions are documented separately below to prevent conflation.

#### RTO Engineering Target: < 30 Minutes
- *Definition*: Target elapsed clock time from disaster declaration to successful HTTP 200 response on `http://127.0.0.1:4000/ready` following full recovery procedures.
- *Recovery Dependencies*:
  1. AWS EC2 and EBS API availability in the target Availability Zone.
  2. Route 53 DNS propagation if Elastic IP re-association is required.
  3. Docker Hub / registry availability for container image pulls.
  4. S3 availability for backup retrieval (if logical restore is required).
  5. SSM Parameter Store availability for secret materialization.
- *Caveat*: **CloudWatch instance auto-recovery alone DOES NOT establish an RTO guarantee**. Auto-recovery responds only to underlying hypervisor or hardware degradation. It cannot remediate EBS filesystem corruption, detached storage volumes, or container configuration failures.
- *Measurement*: RTO will be measured in Phase 22 by clocking a simulated disaster recovery drill from instance termination to a verified healthy `/ready` probe response.

#### RPO Engineering Target A — PostgreSQL Logical Backup Recovery
- *Mechanism*: Daily logical `pg_dump` backup, compressed with gzip, stored locally on the EBS data volume for 30 days and synced to `s3://proctornet-backups-production-<account_id>` with SSE-AES256 encryption. Executed by `proctornet-backup.timer` at `02:00 UTC` daily.
- *Engineering Target*: **< 24 Hours**. The maximum data loss window is bounded by the interval between consecutive daily backups. Depending on failure time within the 24-hour cycle, up to 24 hours of committed transaction data may not be recoverable from a logical dump restore.
- *Caveats*:
  - This is an engineering target, NOT a guarantee. If the daily backup job fails (monitored by CloudWatch `BackupFailureCount` alarm), the effective RPO degrades beyond 24 hours until the next successful backup.
  - Phase 20 does **not** provision PostgreSQL streaming replication, WAL archiving, or any continuous data protection (CDP) mechanism. There are no pre-failure replication logs in Phase 20. References to replication logs in earlier drafts were incorrect and are removed.
- *Measurement*: PostgreSQL logical backup RPO is measured by comparing: (a) the latest committed transaction timestamp recoverable from the restored dump (`SELECT MAX(timestamp) FROM audit_logs;`) against (b) the timestamp encoded in the backup filename (`proctornet_db_YYYYMMDD_HHMMSS.sql.gz`). The difference between the failure event time and the backup timestamp represents the data loss window.

#### RPO Engineering Target B — EBS Data-Volume Storage Recovery
- *Mechanism*: The persistent gp3 EBS data volume (`/opt/proctornet/data`, 100 GiB, AES-256 encrypted) stores Docker named volumes for PostgreSQL, Redis, and RabbitMQ. In failure scenarios where the EC2 instance fails but the EBS volume remains intact (e.g., underlying hypervisor failure without data corruption), the volume can be re-attached to a replacement instance.
- *Characteristic*: EBS volume re-attach provides file-system state up to the moment of instance failure. This is a **storage-layer recoverability mechanism**, not a PostgreSQL logical backup RPO, and does not define a scheduled recovery window.
- *Distinction from Logical Backup RPO*: EBS recovery restores raw file-system state. PostgreSQL WAL crash recovery replays any incomplete transactions on restart, restoring transactional consistency. This is complementary to, not a replacement for, the S3 logical backup restore path.
- *Limitation*: EBS volume re-attach is only viable when the data volume itself is not corrupted. Volume corruption, AZ-level storage failure, or accidental volume deletion all require restoration from the S3 logical backup. The EBS data volume is protected by `prevent_destroy = true` in Terraform.

#### Phase 22 Failure / Chaos Testing Gate
- Actual measured RTO and PostgreSQL logical backup RPO will be empirically validated under simulated failure conditions in **Phase 22 (Failure / Chaos Testing)**, including a full timed restore drill from S3 backup to a clean replacement environment.

---

## 28. Terraform Repository Structure

The Terraform codebase is structured for strict separation of concerns, modularity, and environment isolation:

```
terraform/
├── bootstrap/                          # Independent one-time bootstrap stack (temporary local state)
│   ├── main.tf                         # Provisions S3 state bucket (native lockfile locking)
│   ├── variables.tf
│   └── outputs.tf
├── environments/
│   ├── production/
│   │   ├── main.tf                     # Calls modules with production variables
│   │   ├── variables.tf                # Environment-specific input variables (var.instance_type)
│   │   ├── outputs.tf                  # Outputs EC2 EIP, S3 bucket names, CloudWatch links
│   │   ├── backend.tf                  # Configures S3 backend (use_lockfile = true)
│   │   ├── versions.tf                 # Pins Terraform >= 1.9.0, AWS provider ~> 5.60
│   │   └── terraform.tfvars.example    # Template variable values
│   └── staging/
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       ├── backend.tf
│       ├── versions.tf
│       └── terraform.tfvars.example
└── modules/
    ├── vpc/
    │   ├── main.tf                     # VPC, public/private subnets, IGW, route tables
    │   ├── variables.tf
    │   └── outputs.tf
    ├── security_groups/
    │   ├── main.tf                     # EC2 SG, RDS SG, ElastiCache SG
    │   ├── variables.tf
    │   └── outputs.tf
    ├── iam/
    │   ├── main.tf                     # EC2 instance role, policies, instance profile
    │   ├── variables.tf
    │   └── outputs.tf
    ├── s3/
    │   ├── main.tf                     # Evidence bucket, backup bucket, BPA, lifecycle, CORS
    │   ├── variables.tf
    │   └── outputs.tf
    ├── ec2/
    │   ├── main.tf                     # EC2 instance, encrypted EBS data volume, EIP, user_data
    │   ├── variables.tf
    │   └── outputs.tf
    ├── cloudwatch/
    │   ├── main.tf                     # CloudWatch agent config, log group, metric alarms
    │   ├── variables.tf
    │   └── outputs.tf
    ├── rds/
    │   ├── main.tf                     # PostgreSQL 16 module (conditional count: var.enable_rds)
    │   ├── variables.tf
    │   └── outputs.tf
    ├── elasticache/
    │   ├── main.tf                     # Redis 7 module (conditional count: var.enable_elasticache)
    │   ├── variables.tf
    │   └── outputs.tf
    └── alb/
        ├── main.tf                     # ALB module (conditional count: var.enable_alb)
        ├── variables.tf
        └── outputs.tf
```

### Visual Architecture Diagram: Terraform Module Hierarchy

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 440" width="100%" height="100%">
  <defs>
    <linearGradient id="tfBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>

  <rect width="920" height="440" rx="12" fill="url(#tfBg)" stroke="#334155" stroke-width="1.5"/>

  <text x="30" y="38" fill="#f8fafc" font-family="sans-serif" font-size="18" font-weight="700">ProctorNet Terraform Module Dependency &amp; Structure</text>
  <text x="30" y="58" fill="#94a3b8" font-family="sans-serif" font-size="12">Root Environment Calling Reusable Infrastructure Modules with Toggleable Managed Services</text>

  <!-- Bootstrap Box -->
  <rect x="35" y="90" width="180" height="70" rx="6" fill="#1e293b" stroke="#8b5cf6" stroke-width="1.5"/>
  <text x="125" y="115" fill="#c4b5fd" font-family="sans-serif" font-size="12" font-weight="700" text-anchor="middle">terraform/bootstrap/</text>
  <text x="125" y="132" fill="#94a3b8" font-family="sans-serif" font-size="9" text-anchor="middle">Temporary Local State</text>
  <text x="125" y="145" fill="#34d399" font-family="sans-serif" font-size="9" text-anchor="middle">Provisions S3 State Bucket</text>

  <!-- Root Environment Box -->
  <rect x="250" y="85" width="400" height="80" rx="8" fill="#1e3a8a" stroke="#60a5fa" stroke-width="2"/>
  <text x="450" y="112" fill="#ffffff" font-family="sans-serif" font-size="14" font-weight="700" text-anchor="middle">Root: environments/production/</text>
  <text x="450" y="130" fill="#bfdbfe" font-family="sans-serif" font-size="10" text-anchor="middle">main.tf | variables.tf | outputs.tf | versions.tf | backend.tf</text>
  <text x="450" y="148" fill="#fbbf24" font-family="sans-serif" font-size="9" text-anchor="middle">Initialized against remote S3 backend (use_lockfile = true)</text>

  <!-- State Connector -->
  <path d="M 215 125 L 250 125" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="4,3" fill="none"/>

  <!-- Mandatory Core Modules (Phase 20 Baseline) -->
  <rect x="35" y="195" width="530" height="220" rx="8" fill="#064e3b" fill-opacity="0.3" stroke="#059669" stroke-width="1.5"/>
  <text x="45" y="218" fill="#34d399" font-family="sans-serif" font-size="12" font-weight="700">Mandatory Active Baseline Modules (Phase 20 Baseline)</text>

  <!-- Module: VPC -->
  <rect x="50" y="235" width="155" height="75" rx="5" fill="#1e293b" stroke="#10b981" stroke-width="1"/>
  <text x="127" y="255" fill="#a7f3d0" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle">modules/vpc</text>
  <text x="127" y="272" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">VPC 10.0.0.0/16</text>
  <text x="127" y="285" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">2 Public &amp; 2 Private Subnets</text>
  <text x="127" y="298" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">IGW &amp; Route Tables</text>

  <!-- Module: Security Groups -->
  <rect x="220" y="235" width="160" height="75" rx="5" fill="#1e293b" stroke="#10b981" stroke-width="1"/>
  <text x="300" y="255" fill="#a7f3d0" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle">modules/security_groups</text>
  <text x="300" y="272" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">EC2 SG (80, 443, 3478, 40000+)</text>
  <text x="300" y="285" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">RDS SG (5432 from EC2)</text>
  <text x="300" y="298" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">ElastiCache SG (6379 from EC2)</text>

  <!-- Module: IAM -->
  <rect x="395" y="235" width="155" height="75" rx="5" fill="#1e293b" stroke="#10b981" stroke-width="1"/>
  <text x="472" y="255" fill="#a7f3d0" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle">modules/iam</text>
  <text x="472" y="272" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">EC2 Instance Role</text>
  <text x="472" y="285" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">S3 Evidence &amp; Backup</text>
  <text x="472" y="298" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">SSM &amp; CloudWatch Policies</text>

  <!-- Module: EC2 -->
  <rect x="50" y="325" width="155" height="75" rx="5" fill="#1e293b" stroke="#10b981" stroke-width="1"/>
  <text x="127" y="345" fill="#a7f3d0" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle">modules/ec2</text>
  <text x="127" y="362" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">Ubuntu 24.04 (var.instance_type)</text>
  <text x="127" y="375" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">Encrypted EBS Data Volume</text>
  <text x="127" y="388" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">EIP &amp; Cloud-Init Bootstrapping</text>

  <!-- Module: S3 -->
  <rect x="220" y="325" width="160" height="75" rx="5" fill="#1e293b" stroke="#10b981" stroke-width="1"/>
  <text x="300" y="345" fill="#a7f3d0" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle">modules/s3</text>
  <text x="300" y="362" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">Evidence (App Retention)</text>
  <text x="300" y="375" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">Backup Bucket (DB Dumps)</text>
  <text x="300" y="388" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">BPA, Versioning, Lifecycle, CORS</text>

  <!-- Module: CloudWatch -->
  <rect x="395" y="325" width="155" height="75" rx="5" fill="#1e293b" stroke="#10b981" stroke-width="1"/>
  <text x="472" y="345" fill="#a7f3d0" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle">modules/cloudwatch</text>
  <text x="472" y="362" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">CWAgent (mem/disk metrics)</text>
  <text x="472" y="375" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">Log Group: /aws/ec2/proctornet</text>
  <text x="472" y="388" fill="#94a3b8" font-family="sans-serif" font-size="8" text-anchor="middle">Alarms: CPU, RAM, Disk, Status</text>

  <!-- Scale-Ready Toggleable Modules (Phase 21+) -->
  <rect x="585" y="195" width="305" height="220" rx="8" fill="#78350f" fill-opacity="0.3" stroke="#d97706" stroke-width="1.5"/>
  <text x="595" y="218" fill="#fbbf24" font-family="sans-serif" font-size="12" font-weight="700">Scale-Ready Toggleable Modules (Phase 21+)</text>

  <!-- Module: RDS -->
  <rect x="600" y="235" width="275" height="50" rx="5" fill="#1e293b" stroke="#f59e0b" stroke-width="1"/>
  <text x="737" y="255" fill="#fde68a" font-family="sans-serif" font-size="10" font-weight="700" text-anchor="middle">modules/rds (PostgreSQL 16 Multi-AZ)</text>
  <text x="737" y="272" fill="#ef4444" font-family="sans-serif" font-size="9" font-weight="600" text-anchor="middle">count = var.enable_rds ? 1 : 0 (Default: false)</text>

  <!-- Module: ElastiCache -->
  <rect x="600" y="295" width="275" height="50" rx="5" fill="#1e293b" stroke="#f59e0b" stroke-width="1"/>
  <text x="737" y="315" fill="#fde68a" font-family="sans-serif" font-size="10" font-weight="700" text-anchor="middle">modules/elasticache (Redis 7 Cluster)</text>
  <text x="737" y="332" fill="#ef4444" font-family="sans-serif" font-size="9" font-weight="600" text-anchor="middle">count = var.enable_elasticache ? 1 : 0 (Default: false)</text>

  <!-- Module: ALB -->
  <rect x="600" y="355" width="275" height="50" rx="5" fill="#1e293b" stroke="#f59e0b" stroke-width="1"/>
  <text x="737" y="375" fill="#fde68a" font-family="sans-serif" font-size="10" font-weight="700" text-anchor="middle">modules/alb (Application Load Balancer)</text>
  <text x="737" y="392" fill="#ef4444" font-family="sans-serif" font-size="9" font-weight="600" text-anchor="middle">count = var.enable_alb ? 1 : 0 (Default: false)</text>

  <!-- Arrows from Root to Modules -->
  <path d="M 450 165 L 450 185 L 300 185 L 300 195" stroke="#60a5fa" stroke-width="1.5" fill="none"/>
  <path d="M 450 165 L 450 185 L 737 185 L 737 195" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3" fill="none"/>

</svg>

---

## 29. Module Boundaries & Contracts

Modules maintain strict input/output boundaries without direct cross-module coupling:

1. **`modules/vpc`**:
   - Inputs: `cidr_block`, `availability_zones`, `environment`.
   - Outputs: `vpc_id`, `public_subnet_ids`, `private_subnet_ids`, `db_subnet_group_name`, `elasticache_subnet_group_name`.
2. **`modules/security_groups`**:
   - Inputs: `vpc_id`, `admin_cidr`, `environment`.
   - Outputs: `ec2_security_group_id`, `rds_security_group_id`, `elasticache_security_group_id`.
3. **`modules/iam`**:
   - Inputs: `evidence_bucket_name`, `backup_bucket_name`, `environment`.
   - Outputs: `ec2_instance_profile_name`, `ec2_role_arn`.
4. **`modules/s3`**:
   - Inputs: `domain_name`, `environment`, `evidence_noncurrent_version_expiration_days`, `backup_retention_days`.
   - Outputs: `evidence_bucket_name`, `evidence_bucket_arn`, `backup_bucket_name`.
5. **`modules/ec2`**:
   - Inputs: `vpc_id`, `subnet_id`, `security_group_id`, `instance_profile_name`, `instance_type`, `key_name`, `domain_name`, `admin_email`.
   - Outputs: `instance_id`, `public_ip`, `elastic_ip`.
6. **`modules/cloudwatch`**:
   - Inputs: `environment`, `instance_id`.
   - Outputs: `log_group_name`, `alarm_arns`.
7. **`modules/rds` (Toggleable)**:
   - Inputs: `vpc_id`, `db_subnet_group_name`, `security_group_id`, `instance_class`, `db_name`, `db_user`, `db_password`, `multi_az`.
   - Outputs: `rds_endpoint`, `rds_address`, `rds_port`.
8. **`modules/elasticache` (Toggleable)**:
   - Inputs: `elasticache_subnet_group_name`, `security_group_id`, `node_type`, `auth_token`.
   - Outputs: `redis_endpoint`, `redis_port`.
9. **`modules/alb` (Toggleable)**:
   - Inputs: `vpc_id`, `public_subnet_ids`, `security_group_id`, `certificate_arn`, `target_instance_ids`.
   - Outputs: `alb_dns_name`, `alb_zone_id`.

---

## 30. Environment Strategy

1. **Physical Directory Isolation**:
   - `environments/production`: Production infrastructure root.
   - `environments/staging`: Staging disposable test environment root.
2. **Distinct State Keys in S3**:
   - Production state: `key = "proctornet/production/terraform.tfstate"`
   - Staging state: `key = "proctornet/staging/terraform.tfstate"`
3. **Resource Naming Conventions**:
   - All provisioned AWS resources follow the deterministic naming schema:
     `proctornet-${environment}-${resource_type}` (e.g. `proctornet-production-ec2`, `proctornet-staging-ec2`).
4. **Tagging Convention**:
   - Every resource enforces standard AWS tags:
     - `Project = "ProctorNet"`
     - `Environment = var.environment` (`production` / `staging`)
     - `ManagedBy = "Terraform"`
     - `Phase = "20"`

---

## 31. Terraform State Architecture & Bootstrap Lifecycle

### 31.1 Resolving the Bootstrap Circular Dependency
To avoid the circular dependency inherent in using Terraform to provision the S3 state bucket that stores Terraform's own remote state, Phase 20 implements an isolated two-phase bootstrap lifecycle:

```
[Phase 1: terraform/bootstrap/]
       │
       │ Uses Temporary Local State (terraform.tfstate)
       ▼
[Provisions Remote Infrastructure: S3 State Bucket (native lockfile locking, no DynamoDB)]
       │
       │ Outputs: bucket_name
       ▼
[Phase 2: terraform/environments/production & staging]
       │
       │ backend.tf points to provisioned remote backend (use_lockfile = true)
       ▼
[terraform init -> State stored in S3 with native lockfile locking]
```

1. **Bootstrap Stack (`terraform/bootstrap/`)**:
   - Executed **once** per AWS account using **temporary local state** (`terraform.tfstate` stored locally).
   - Provisions:
     - S3 State Bucket: `proctornet-terraform-state-${account_id}` with AES256 KMS encryption, Versioning enabled, and all 4 Block Public Access settings enabled.
     - Native S3 lockfile locking is enabled on the state bucket via `use_lockfile = true`. No DynamoDB table is provisioned for state locking.
   - The local bootstrap state is committed to a secure offline administrative vault or dedicated credential store. It is **never mixed** with operational infrastructure state.
2. **Operational Environment Backend (`backend.tf`)**:
   - Configured in `environments/production/backend.tf` and `environments/staging/backend.tf`:
     ```hcl
     terraform {
       backend "s3" {
         bucket       = "proctornet-terraform-state-<account_id>"
         key          = "proctornet/production/terraform.tfstate"
         region       = "ap-south-1"
         encrypt      = true
         use_lockfile = true
       }
     }
     ```
   - `use_lockfile = true` enables native S3 backend state locking, managing lock state as a `.tflock` object alongside the state file in the same S3 bucket. This is the current Terraform-recommended approach; DynamoDB-based locking is deprecated in the Terraform S3 backend.
   - Running `terraform init` connects directly to the pre-existing remote backend.
   - S3 Versioning on the state bucket guarantees that state files can be rolled back if corrupted by concurrent edits or network drops.

---

## 32. CI/CD Integration

Phase 20 introduces an automated GitHub Actions pipeline `.github/workflows/terraform.yml` to govern all Infrastructure-as-Code changes:

```
[Pull Request Created / Updated]
        ↓
1. Format Check: terraform fmt -check -recursive
        ↓
2. Linter: tflint --recursive
        ↓
3. Security Scanner: checkov -d terraform/ (CIS AWS Foundations Benchmark)
        ↓
4. Static Analysis: tfsec terraform/
        ↓
5. Validation: terraform validate (staging & production)
        ↓
6. Speculative Plan: terraform plan (Posted as automated PR comment)
        ↓
[Merge to main]
        ↓
7. Manual Approval Gate (GitHub Environment: "production-infrastructure")
        ↓
8. Controlled Apply: terraform apply -auto-approve
```

**Guardrails**:
- Direct `terraform apply` from unreviewed pull requests is **strictly blocked**.
- Automated destructive changes (`prevent_destroy` on EBS volumes and S3 buckets) prevent accidental resource deletion.
- AWS credentials assumed via GitHub OIDC without long-lived keys.

---

## 33. Security Validation & Static Analysis

Phase 20 infrastructure definitions are subjected to rigorous automated security static analysis:

1. **`tflint`**:
   - Enforces AWS provider best practices, verifies valid AMI filters, instance types, and naming rules.
2. **`checkov`**:
   - Verifies adherence to CIS AWS Foundations Benchmark.
   - Specific checks enforced:
     - `CKV_AWS_18`: S3 bucket access logging or justified suppression.
     - `CKV_AWS_19`: S3 bucket server-side encryption enabled.
     - `CKV_AWS_21`: S3 bucket versioning enabled.
     - `CKV_AWS_53`: S3 block public policy enabled.
     - `CKV_AWS_54`: S3 block public ACLs enabled.
     - `CKV_AWS_55`: S3 ignore public ACLs enabled.
     - `CKV_AWS_56`: S3 restrict public buckets enabled.
     - `CKV_AWS_135`: EBS root and data volumes encrypted.
     - `CKV_AWS_260`: No security group allows ingress from `0.0.0.0/0` to ports 22, 4000, 5432, 6379, 5672.
3. **Secret Scanning**:
   - Scanned via `git-secrets` and Trufflehog to guarantee zero API tokens, passwords, or private keys exist in Terraform definitions.

---

## 34. Cost & Complexity Analysis

In strict compliance with the core architectural principle: **Measure → optimize → scale**, Phase 20 evaluates operational complexity and cloud expenditure across configurable instance sizes:

| Architecture Topology | Monthly Compute Cost | Monthly Storage Cost | Monthly Networking Cost | Monthly Managed DB / Cache | Total Estimated Monthly Cost | Complexity Score (1-10) |
|---|---|---|---|---|---|---|
| **Phase 20 Staging (t3.large / t3.xlarge)** | ~$60 (`t3.large`) / ~$120 (`t3.xlarge`) | ~$15 (50GB root + 100GB data gp3 + S3) | ~$0 (EIP free with instance; IGW zero fixed cost) | $0 (Containerized Postgres, Redis, RMQ) | **~$75 – $135 / month** | **2 / 10** (Low cost, disposable validation) |
| **Phase 20 Production Baseline (c6i.xlarge)** | ~$125 (`c6i.xlarge`) | ~$15 (50GB root + 100GB data gp3 + S3) | ~$0 (EIP free with instance; IGW zero fixed cost) | $0 (Containerized Postgres, Redis, RMQ) | **~$140 / month** | **2 / 10** (High single-core IPC, line-rate WebRTC) |
| **Premature Managed Stack (c6i.xlarge + Multi-AZ RDS + ElastiCache + ALB + 2 NAT GWs)** | ~$125 (`c6i.xlarge`) | ~$25 (EBS + RDS storage) | ~$89.70 ($25 ALB + $64.70 2x NAT Gateways) | ~$130 ($105 RDS Multi-AZ + $25 ElastiCache) | **~$369.70 / month** | **8 / 10** (High: Multi-subnet routing, DB cutover, multi-service failure domains) |

**Architectural Verdict**:
The Phase 20 baseline delivers **$140/month cost efficiency** in production and down to **$75/month** in staging. Provisioning the premature managed stack immediately would increase costs by **264%** ($370 vs $140) without any empirical traffic justifying it. Authoring RDS and ElastiCache as toggleable modules gives ProctorNet instant scaling capability with zero premature financial waste.

---

## 35. Failure Boundaries & Single-Host Resilience Analysis

### 35.0 Terminology Definitions

Phase 20 explicitly distinguishes the following terms to prevent architectural conflation:

| Term | Definition | Phase 20 Status |
|---|---|---|
| **Durability** | Guarantee that written data is not silently lost under normal operating conditions. Achieved via EBS gp3 AES-256 encryption, S3 11-nines durability, and daily backup archival with S3 sync. | ✅ Phase 20 |
| **Recoverability** | The ability to restore a system to a known-good state after a failure event, bounded by defined RTO and RPO engineering targets. | ✅ Phase 20 (targets defined; empirical validation in Phase 22) |
| **Single-Host Resilience** | A deployment posture that survives transient hardware failures and process crashes via CloudWatch auto-recovery, `restart: unless-stopped` container policies, and persistent EBS storage — but does **not** eliminate the EC2 host as a single failure domain. | ✅ Phase 20 baseline |
| **Availability** | The fraction of time the system is operational and serving requests. Higher availability requires eliminating single points of failure. | ⚠️ Phase 20 has one EC2 failure domain; no SLA-guaranteed uptime target at this phase |
| **High Availability (HA)** | Requires redundant compute across multiple EC2 instances and/or AZs with automatic failover, eliminating the EC2 single point of failure. | ❌ Not in Phase 20 — explicitly deferred to Phase 21+ (Multi-AZ ASG + ALB) |

> [!IMPORTANT]
> **Phase 20 is a single-host resilience baseline, not a high-availability deployment.** The Phase 20 architecture intentionally acknowledges the single EC2 host as a failure domain. True HA (multi-instance, multi-AZ) belongs to Phase 21+ and is encoded in the toggleable scale-ready modules.

ProctorNet avoids hand-waving claims of "high availability". The exact failure domains and recovery behaviors for Phase 20 are explicitly documented:

| Failure Domain | Phase 20 Baseline Impact | Mitigation / Recovery Mechanism in Phase 20 | Scale-Ready Upgrade Path (Phase 21+) |
|---|---|---|---|
| **EC2 Host Hardware Failure** | Application downtime until instance is recovered | CloudWatch instance auto-recovery automatically launches replacement instance on healthy hardware; persistent data attached via EBS. Note: Auto-recovery addresses only hardware degradation; it does not replace disaster recovery | Multi-instance Auto Scaling Group behind ALB |
| **Availability Zone Outage** | Downtime if AZ `ap-south-1a` fails | VPC foundation possesses public and private subnets in `ap-south-1b`. Re-pointing Terraform to AZ 1b and restoring from EBS snapshot recovers service | Multi-AZ RDS automatic failover + Multi-AZ EC2 ASG |
| **PostgreSQL Process Crash** | Brief container downtime | Docker daemon `restart: unless-stopped` reboots container; `proctornet.service` re-executes cold-start check | RDS Multi-AZ standby replica promotion |
| **Redis Process Crash** | Cache miss latency; zero data loss | Non-authoritative model (ADR-0001); container automatically restarts; DB serves truth | ElastiCache Redis replication group with automatic failover |
| **RabbitMQ Crash** | Outbox polling pauses | Container automatically restarts; outbox table in PostgreSQL buffers pending messages; zero event loss | Quorum queues on multi-node broker |
| **S3 Outage** | Direct evidence upload temporary pause | S3 standard 99.99% availability SLA; backend buffers metadata; clients retry upload | Multi-Region S3 Cross-Region Replication (if justified) |

---

## 36. Phase 21 Boundary: Load Testing & Capacity Validation

Phase 20 intentionally defers the following activities to **Phase 21**:

1. **Load Generation**: Simulating 1,000 to 10,000 concurrent examination candidates using k6 and Artillery.
2. **Autosave Burst Validation**: Simulating 1 answer autosave every 5–10 seconds per candidate (100–2,000 requests/sec).
3. **Database Pool Saturation**: Benchmarking PostgreSQL connection pool (`DB_POOL_MAX`) on EC2 vs RDS PostgreSQL 16.
4. **Empirical Offloading Decision**: Activating `enable_rds = true` and `enable_elasticache = true` only when single-host EC2 CPU, RAM, or disk IOPS hit empirical thresholds (> 75% sustained utilization).
5. **WebRTC SFU Capacity**: Measuring maximum concurrent audio/video streams sustainable by a single `c6i.xlarge` instance before packet jitter degrades examination monitoring.

---

## 37. Phase 22 Boundary: Failure & Chaos Testing

Phase 20 intentionally defers the following activities to **Phase 22**:

1. **Simulated RDS Multi-AZ Failover**: Forcing an RDS primary failover during active examination sessions to verify zero answer data loss.
2. **EC2 Node Termination Recovery**: Terminating active instances to measure actual RTO against the < 30-minute target.
3. **Network Partition Injection**: Simulating packet loss and latency spikes on the WebRTC media plane and validating Coturn fallback.
4. **Redis Hard Failure Injection**: Validating that database-backed sliding window rate limiters degrade gracefully without locking out legitimate students.
5. **Disaster Recovery Benchmark**: Full restore of PostgreSQL from S3 backups to a clean environment to measure actual RTO/RPO against documented engineering targets.

---

## 38. Risks & Mitigations

| Risk | Severity | Technical Impact | Mitigation Strategy in Phase 20 |
|---|---|---|---|
| **mediasoup Port Range SG Limits** | Medium | Large port ranges (10,000 ports) in security groups could exceed AWS limits if defined individually | Define as a single contiguous CIDR rule: `from_port = 40000`, `to_port = 49999`, `protocol = "udp"`. AWS counts this as exactly 1 rule |
| **Accidental Public Exposure of Port 4000** | Critical | External attackers could bypass Nginx rate limiting and security headers | Checkov static analysis rule strictly asserts that port 4000 has zero ingress rules in `proctornet-ec2-sg` |
| **Plaintext Secrets in Terraform State** | High | Leaking database or JWT credentials via `terraform.tfstate` | Store secrets in SSM Parameter Store with `SecureString` KMS encryption; EC2 pulls secrets at boot time via `fetch-secrets.sh`; zero secrets in `.tfvars` |
| **State File Chicken-and-Egg Bootstrap** | Medium | S3 backend cannot store state before S3 bucket exists | Dedicated `terraform/bootstrap/` stack with local state initializes the remote S3 state bucket (with native `use_lockfile = true` locking) before environment stacks run. No DynamoDB table is provisioned. |
| **EBS Detachment / Data Loss on Destroy** | Critical | Accidental `terraform destroy` could wipe persistent PostgreSQL exam data | Set `prevent_destroy = true` on the persistent data EBS volume resource in Terraform |
| **Premature Destruction of Evidence on Hold** | Critical | Automatic S3 lifecycle deletion could destroy evidence under active appeal | Omit destructive expiration on active S3 objects; evidence retention is authoritatively governed by PostgreSQL metadata and application sweeper |

---

## 39. Architectural Decisions & ADRs

### Summary of Required Decisions (AD-20-1 through AD-20-12)

#### AD-20-1: AWS Compute Model for Phase 20
- **Decision**: Single AWS EC2 instance (`var.instance_type`, default `c6i.xlarge` in production, `t3.large`/`t3.xlarge` in staging, Ubuntu 24.04 LTS) executing the Phase 19 production Compose stack.
- **Rationale**: Preserves modular monolith invariants; guarantees glibc stability for native `mediasoup-worker`; enables host-networked line-rate WebRTC. ECS/Fargate is rejected due to lack of dynamic wide UDP port range support.
- **ADR Required**: Yes (Drafted below as ADR-0010).

#### AD-20-2: Whether ALB is Phase 20 or Later
- **Decision**: Deferred to Phase 21 horizontal scaling.
- **Rationale**: WebRTC SFU and Coturn UDP media cannot traverse an HTTP ALB. Nginx on the host already provides full reverse proxying, TLS termination, and SPA serving for the single host. ALB module is authored as toggleable.
- **ADR Required**: Yes (Covered in ADR-0010).

#### AD-20-3: Whether PostgreSQL Moves to RDS in Phase 20
- **Decision**: Remains containerized on EC2 for the active Phase 20 baseline; RDS PostgreSQL 16 module authored as toggleable (`enable_rds = false`).
- **Rationale**: Adheres to "measure → optimize → scale". Avoids premature data migration risks before Phase 21 load testing benchmarks capacity.
- **ADR Required**: Yes (Covered in ADR-0010).

#### AD-20-4: Whether Redis Moves to ElastiCache in Phase 20
- **Decision**: Remains containerized on EC2 for the active Phase 20 baseline; ElastiCache Redis 7 module authored as toggleable (`enable_elasticache = false`).
- **Rationale**: Redis is non-authoritative. Loopback container on EC2 provides lowest latency and zero extra cost.
- **ADR Required**: Yes (Covered in ADR-0010).

#### AD-20-5: RabbitMQ Deployment Model
- **Decision**: Containerized RabbitMQ on EC2 host loopback with persistent EBS volume.
- **Rationale**: Amazon MQ is rejected as unnecessary operational complexity and cloud cost. Quorum queues on EC2 meet all ADR-0002 requirements.
- **ADR Required**: Yes (Covered in ADR-0010).

#### AD-20-6: Terraform State Architecture
- **Decision**: S3 Remote State Backend (`proctornet-terraform-state-${account_id}`) with KMS encryption, Versioning, and Block Public Access, initialized via an independent local-state bootstrap stack. State locking uses native S3 lockfile support (`use_lockfile = true`). No DynamoDB table is provisioned.
- **Rationale**: Native S3 lockfile locking is the current Terraform-recommended approach for S3 backend concurrency control. DynamoDB-based locking is deprecated in current Terraform S3 backend documentation. Using `use_lockfile = true` eliminates the DynamoDB dependency, reduces bootstrap complexity, and removes an additional AWS service from the infrastructure surface area.
- **ADR Required**: Yes (Covered in ADR-0010).

#### AD-20-7: Production Secret-Management System
- **Decision**: AWS Systems Manager (SSM) Parameter Store (`SecureString`) with KMS encryption, materialized on EC2 into `/opt/proctornet/.env` with mode `0600` owned by `root:root`.
- **Rationale**: Zero static secrets in Git or Terraform code. Secure runtime injection without command-line argument leakage.
- **ADR Required**: Yes (Covered in ADR-0010).

#### AD-20-8: TLS Termination Model
- **Decision**: Host-level Snap Certbot with Let's Encrypt certificates; Nginx unprivileged container terminates TLS. Private keys enforce mode `0640` owned by `root:101`.
- **Rationale**: Direct parity with Phase 19; zero architectural churn. ACM public certificate deferred to ALB activation in Phase 21.
- **ADR Required**: Yes (Covered in ADR-0010).

#### AD-20-9: SFU & TURN AWS Networking Model
- **Decision**: Direct host-networked binding on EC2 with Elastic IP announced in WebRTC ICE candidates (`MEDIA_ANNOUNCED_IP`) and Coturn (`TURN_ANNOUNCED_HOST`). Ingress opened for UDP 40000–49999 and UDP 3478 / 49152–49250.
- **Rationale**: Guarantees zero-copy, line-rate UDP throughput bypassing HTTP load balancers.
- **ADR Required**: Yes (Covered in ADR-0010).

#### AD-20-10: WireGuard & Management Boundary Model
- **Decision**: Primary administrative access via AWS SSM Session Manager (zero open inbound ports). Secondary SSH access restricted strictly to WireGuard VPN / Admin CIDR (`var.admin_cidr`).
- **Rationale**: Eliminates public SSH attack surface from `0.0.0.0/0`.
- **ADR Required**: Yes (Covered in ADR-0010).

#### AD-20-11: Phase 20 Single-Host Resilience Scope
- **Decision**: Phase 20 establishes a **single-host resilience baseline** — not high availability. Durability mechanisms: gp3 encrypted EBS persistence, S3 11-nines durability, daily logical `pg_dump` backup at 02:00 UTC synced to S3, CloudWatch auto-recovery for hardware failures. Engineering targets: RTO < 30 min; PostgreSQL logical backup RPO < 24 hrs (bounded by daily backup interval). EBS data-volume re-attach documented separately as a storage-layer recoverability characteristic (§27.3 RPO-B). All targets empirically benchmarked in Phase 22. True multi-instance HA deferred to Phase 21/22.
- **Rationale**: Prevents premature multi-instance cluster complexity before Phase 21 load testing establishes empirical capacity limits. Correctly separates durability and single-host recoverability from high availability.
- **ADR Required**: Yes (Covered in ADR-0010).

#### AD-20-12: Scaling Capabilities Deliberately Deferred to Phase 21+
- **Decision**: ALB HTTP/WS balancing, Auto Scaling Groups, RDS Multi-AZ live cutover, ElastiCache Redis replication, and mediasoup multi-instance pipe transports deferred to Phase 21.
- **Rationale**: Strict compliance with "measure → optimize → scale".
- **ADR Required**: Yes (Covered in ADR-0010).

---

### Formal Draft: Architecture Decision Record (ADR-0010)

```markdown
# ADR-0010: Declarative AWS Infrastructure, Single-Host EC2 Delivery Baseline, and Managed Service Migration Boundaries

## Status
Proposed (Drafted in Phase 20 Plan)

## Date
2026-09-08

## Context & Problem Statement
ProctorNet Re-Architecture requires a declarative, version-controlled Infrastructure-as-Code (IaC) foundation on Amazon Web Services (AWS) using HashiCorp Terraform (Phase 20).

Historical roadmap phrasing in `docs/DEVELOPMENT_PLAN.md` suggested immediately provisioning a fully managed multi-AZ cloud architecture including VPC, public/private subnets, NAT gateways, RDS PostgreSQL Multi-AZ, ElastiCache Redis, S3, ALB, and ECS/Fargate/App Runner.

However, the finalized authoritative architecture (Notion Step 13.5, 13.7, 13.17 and ADR-0009) establishes:
1. "Modular monolith first", "AWS EC2 initially", "Kubernetes only if later justified", and "Measure → optimize → scale".
2. The media plane relies on native C++ `mediasoup-worker` processes requiring wide dynamic UDP port ranges (10,000 ports: `40000–49999`) and Coturn STUN/TURN relay (`49152–49250/udp`) executing with host networking semantics. AWS Application Load Balancers (ALBs) operate exclusively on Layer 7 and cannot route UDP media packets.
3. AWS Fargate does not support host networking with dynamic wide UDP port ranges.
4. Containerized PostgreSQL 16 and Redis 7 on EC2 loopback with EBS persistence provide proven stability and sub-millisecond latency. Forcing a live production database migration to RDS without empirical load testing violates established development rules.
5. Evidence retention is server-authoritative and managed by PostgreSQL metadata (ADR-0005); blind S3 bucket expiration must not destroy active evidence under academic appeal.

## Decision Drivers
1. **Preservation of Phase 19 Baseline**: Maintain 100% operational parity with the modular monolith Docker Compose stack.
2. **Line-Rate WebRTC Media Throughput**: Preserve direct UDP transport without userland proxy or load balancer serialization bottlenecks.
3. **Cost & Operational Simplicity**: Eliminate premature cloud expenditure (NAT Gateways, idle Multi-AZ RDS, idle ElastiCache) while traffic remains within single-host capacity.
4. **Scale Readiness**: Ensure the Terraform codebase contains fully declared, reusable modules for managed services (RDS, ElastiCache, ALB) that can be activated instantly via feature toggles during Phase 21 load testing.

## Considered Options

### Option 1: Premature Managed Cloud Cutover
- Immediately migrate compute to ECS/Fargate, database to RDS Multi-AZ, cache to ElastiCache, and edge to ALB.
- *Discarded*: Fargate breaks mediasoup UDP port binding; ALB breaks WebRTC media; forces risky database migration prior to load testing; increases monthly cloud cost by 264%.

### Option 2: Pure EC2 Terraform Wrapper Without Managed Service Readiness
- Write Terraform strictly for the single EC2 host, VPC, and S3, completely ignoring RDS, ElastiCache, and ALB.
- *Discarded*: Leaves future scaling unplanned; requires a complete rewrite of Terraform in Phase 21.

### Option 3: Two-Stage Hybrid Architecture (Chosen Option)
- **Stage 1 (Active Baseline)**: Declarative VPC (2 public, 2 private subnets across 2 AZs), Security Groups, IAM Instance Profile, S3 Evidence Bucket, and single EC2 production host (`var.instance_type`, default `c6i.xlarge` in prod) with Elastic IP and persistent EBS volume running the Phase 19 Compose stack.
- **Stage 2 (Scale Readiness)**: Reusable, parameterized Terraform modules for Amazon RDS PostgreSQL 16, Amazon ElastiCache Redis 7, and ALB authored in `modules/`, controlled by feature toggles (`enable_rds = false`, `enable_elasticache = false`, `enable_alb = false`).

## Decision Outcome
Chosen Option: **Option 3 (Two-Stage Hybrid Architecture)**.

### Key Architectural Contracts:
1. Compute executes on a single AWS EC2 instance in Public Subnet 1a.
2. Direct UDP ingress for WebRTC (`40000–49999`) and Coturn (`3478`, `49152–49250`) is permitted directly to the EC2 security group, bypassing any ALB.
3. Ingress to port 4000, 5432, 6379, and 5672 is physically denied from `0.0.0.0/0`.
4. PostgreSQL and Redis remain containerized on EC2 loopback for the active baseline.
5. RDS and ElastiCache modules are authored, validated, and ready for activation in Phase 21.
6. Zero NAT Gateways are provisioned in Phase 20, saving ~$65/month.
7. Active evidence retention is governed authoritatively by PostgreSQL metadata; S3 bucket lifecycle omits destructive expiration on current objects.

## Consequences
- **Positive**: Zero risk of breaking Phase 19 modular monolith; WebRTC media achieves line-rate throughput; monthly cloud spend minimized ($140/mo in prod, $75/mo in staging); clear upgrade path for Phase 21.
- **Trade-offs**: Single-host EC2 represents a single failure domain (mitigated by automated EBS snapshots, S3 backup sync, and CloudWatch auto-recovery) until horizontal scaling is activated in Phase 21.
```

---

## 40. Implementation Sequence

When approved, Phase 20 implementation will proceed in 11 strictly ordered, verifiable steps:

```
Step 1: Bootstrap Remote State via Local State (S3 State Bucket, native lockfile locking)
    ↓
Step 2: VPC, Subnets (2 Public, 2 Private across 2 AZs), IGW & Route Tables
    ↓
Step 3: Security Groups (EC2 Trust Boundary, RDS Internal SG, ElastiCache SG)
    ↓
Step 4: IAM Roles, Policies & Instance Profile (S3 Evidence/Backup, CloudWatch, SSM)
    ↓
Step 5: S3 Storage Buckets (BPA, SSE, Versioning, App-Authoritative Lifecycle, CORS)
    ↓
Step 6: SSM Parameter Store Secrets Schema & Hierarchical Definitions
    ↓
Step 7: EC2 Compute, Encrypted EBS Data Volume, Elastic IP & Cloud-Init
    ↓
Step 8: CloudWatch Agent Installation, Telemetry Config, Log Groups & Host Alarms
    ↓
Step 9: Scale-Ready Toggleable Modules (RDS PostgreSQL, ElastiCache, ALB)
    ↓
Step 10: CI/CD Pipeline Integration (.github/workflows/terraform.yml)
    ↓
Step 11: End-to-End Infrastructure Smoke Testing & Verification
```

---

## 41. Testing & Validation Strategy

Phase 20 implementation will be validated against a comprehensive 20-point verification suite:

1. **`terraform fmt`**: Enforces strict canonical formatting across all `.tf` files (`terraform fmt -check -recursive`).
2. **`terraform validate`**: Verifies internal syntactic correctness and schema validity across all modules and environments.
3. **`tflint`**: Lints Terraform code against AWS ruleset, checking instance types, AMI filters, and deprecated syntax.
4. **`checkov`**: Runs static security analysis against CIS AWS Foundations Benchmark; zero high/critical violations.
5. **`tfsec`**: Secondary static analysis verifying security group rules and encryption settings.
6. **Security Group Rule Verification**: Automated assertion that ports 4000, 5432, 6379, 5672 have NO ingress rules from `0.0.0.0/0`.
7. **IAM Least-Privilege Verification**: Confirms IAM instance profile contains zero wildcard `*` resource permissions on S3 or SSM.
8. **Secret Scanning**: Confirms zero plaintext secrets, passwords, or keys in `.tf` or `.tfvars` files.
9. **Terraform Dependency Graph Review**: Validates DAG (`terraform graph`) for circular dependencies.
10. **AWS Resource Smoke Test (Staging)**: Provisions disposable staging environment to verify clean execution.
11. **Network Connectivity Verification**: Verifies TCP 80/443 reachability and confirms port 4000 is rejected from external hosts.
12. **Application Readiness Verification**: Asserts `curl -sf http://127.0.0.1:4000/ready` returns `"status":"READY"` on bootstrapped EC2 instance.
13. **S3 Evidence Access Verification**: Asserts backend can upload, sign, and retrieve evidence objects using IAM instance profile credentials without static AWS keys.
14. **Database Persistence Verification**: Verifies PostgreSQL container reads/writes to mounted EBS volume at `/opt/proctornet/data/pg_data`.
15. **Redis Connectivity Verification**: Asserts `redis-cli ping` succeeds over loopback.
16. **RabbitMQ Connectivity Verification**: Asserts RabbitMQ accepts connections over `127.0.0.1:5672`.
17. **SFU & TURN Reachability Verification**: Validates UDP connectivity across `40000–49999` and Coturn STUN probe via `turnutils_stunclient`.
18. **TLS & DNS Verification**: Confirms Let's Encrypt certificate is valid and serves HTTPS with mode `0640` private key permissions.
19. **Backup Chain Verification**: Triggers `proctornet-backup.service`, confirms local dump creation, S3 upload, and executes restore verification on test database.
20. **Destroy & Recreate Validation**: Executes `terraform destroy` in staging environment, confirming clean teardown of all non-persistent resources while persistent data volume respects `prevent_destroy`.

---

## 42. Definition of Done

Phase 20 will be formally complete ONLY when all of the following criteria are satisfied:

1. All Terraform definitions in `terraform/` pass `terraform fmt`, `terraform validate`, `tflint`, and `checkov` with zero errors.
2. S3 remote state backend with native lockfile locking (`use_lockfile = true`) is operational and decoupled from bootstrap state. No DynamoDB table is provisioned for state management.
3. Dual-AZ VPC with 2 public subnets and 2 private subnets is declaratively managed.
4. Least-privilege Security Groups physically block external ingress to internal ports (4000, 5432, 6379, 5672).
5. IAM Instance Profile grants scoped access to S3, SSM, and CloudWatch without static AWS credentials.
6. S3 Evidence Bucket enforces all 4 BPA controls, SSE-S3/KMS, Versioning, and application-authoritative retention lifecycle per ADR-0005.
7. Primary production EC2 instance (`var.instance_type`) bootstraps the Phase 19 production Compose stack cleanly.
8. Elastic IP is associated and successfully announced for WebRTC ICE and Coturn TURN.
9. Persistent gp3 EBS data volume is mounted at `/opt/proctornet/data` with `prevent_destroy = true`.
10. Scale-ready modules for RDS PostgreSQL 16, ElastiCache Redis 7, and ALB are authored, validated, and default to disabled (`false`).
11. CI/CD workflow `.github/workflows/terraform.yml` is active and enforcing quality gates.
12. Zero database migrations added (migration count remains exactly 17).
13. ADR-0010 is formally accepted and indexed in `docs/ADR/README.md`.
14. Implementation reviewed, committed, and merged into `main`.

---

## 43. Mandatory Global Contradiction Audit Results

A comprehensive audit was executed across all authoritative sources (`docs/DEVELOPMENT_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/ADR/0009-*.md`, `infrastructure/docker-compose.prod.yml`, and this plan).

| Search Term / Topic | Historical Text Phrasing | Finalized Architecture Baseline | Plan Resolution & Contradiction Audit Result |
|---|---|---|---|
| **"EC2 initially" vs "ECS / Fargate"** | Mentioned ECS / Fargate / App Runner in Phase 20 roadmap | Notion 13.5 & ADR-0009 prescribe "Modular monolith on AWS EC2 initially" | **Resolved**: ECS/Fargate is identified as stale roadmap language and rejected. Fargate cannot support dynamic 10,000 UDP port ranges for WebRTC. EC2 is the sole compute model. |
| **"Single EC2" vs "Multiple Instances"** | Phase 20 roadmap mentions "highly available infrastructure" | ADR-0009 and Phase 19 establish single-host EC2 deployment with host networking | **Resolved**: Single EC2 host is the active Phase 20 baseline. Multi-instance scaling is explicitly deferred to Phase 21 load testing. |
| **"ALB" vs "Direct WebRTC UDP"** | Phase 20 roadmap mentions Application Load Balancer | Mediasoup SFU requires direct UDP 40000–49999; Coturn requires UDP 3478/49152–49250 | **Resolved**: ALB is deferred to Phase 21 for HTTP/WebSocket only. Direct UDP traffic bypasses ALB directly to EC2 Elastic IP. |
| **"RDS PostgreSQL" vs "Containerized DB"** | Phase 20 roadmap mentions "Terraform for Amazon RDS PostgreSQL multi-AZ" | Phase 19 containerized PostgreSQL 16 with EBS persistence and backup-db.sh | **Resolved**: Containerized PostgreSQL remains active baseline. RDS module authored as toggleable (`enable_rds = false`) for Phase 21 activation. |
| **"ElastiCache Redis" vs "Containerized Redis"** | Phase 20 roadmap mentions "Terraform for Amazon ElastiCache Redis" | Redis is non-authoritative (ADR-0001) and containerized on EC2 loopback | **Resolved**: Containerized Redis remains active baseline. ElastiCache module authored as toggleable (`enable_elasticache = false`). |
| **"NAT Gateway" vs Cost Optimization** | Phase 20 roadmap mentions "NAT gateways" | Private subnets have no instances requiring internet egress in Phase 20 | **Resolved**: NAT Gateways deferred, saving ~$65/month. Private subnets isolated with local routing only. |
| **"WireGuard Boundary"** | Management plane access requirements | Port 22 must never be open to `0.0.0.0/0` | **Resolved**: AWS SSM Session Manager is primary zero-port management plane; SSH restricted strictly to WireGuard / Admin CIDR. |
| **"Phase 21 / Phase 22 Boundaries"** | Historical roadmap blends scaling and chaos into infra | Phase 21 is Load Testing; Phase 22 is Failure/Chaos Testing | **Resolved**: Boundaries strictly preserved. Concurrency benchmarks deferred to Phase 21; failover drills and empirical RTO/RPO measurement deferred to Phase 22. |
| **"RTO / RPO Targets vs Guarantees"** | Early drafting implied proven guarantees; "< 1 Hour (EBS)" label conflated storage-layer recovery with logical backup RPO; "pre-failure replication logs" referenced a non-existent Phase 20 mechanism | Recovery benchmarks must use actual Phase 20 artifacts; EBS and logical backup recovery must be documented separately | **Resolved**: RTO (< 30 min) and PostgreSQL logical backup RPO (< 24 hrs, bounded by daily backup interval) defined as engineering targets. EBS data-volume recoverability documented separately as a storage-layer mechanism (§27.3 RPO-B). All replication log references removed. Phase 22 performs empirical benchmarking. |
| **"Backup Automation Chain"** | Referred to automated daily backups without operational chain | Phase 19 provided backup-db.sh; scheduler and S3 transport needed specification | **Resolved**: Complete operational chain defined (systemd timer -> backup-db.sh -> pg_dump -> gzip -> S3 SSE-S3 upload -> local 30d purge -> S3 lifecycle -> OnFailure alert -> restore runbook & verification). |
| **"CloudWatch Memory / Disk Metrics"** | Generic claims of memory/disk monitoring | Hypervisor EC2 metrics do not capture OS memory/disk | **Resolved**: Amazon CloudWatch Agent (`amazon-cloudwatch-agent`) explicitly specified with CWAgent namespace JSON config, mem_used_percent, disk_used_percent, and scoped IAM permissions. |
| **"S3 Evidence Retention Policy"** | Proposed 90-day S3 lifecycle expiration | Phase 15 / ADR-0005 establish server-authoritative retention in PostgreSQL | **Resolved**: S3 bucket lifecycle omits destructive expiration on active objects; deletion is handled by PostgreSQL metadata and application purge sweepers. Non-current versions and backups are explicitly distinguished. |
| **"SSM Secret Materialization"** | Unspecified injection path from SSM to Docker Compose | Production secrets must fail closed without command-line leaking | **Resolved**: `fetch-secrets.sh` retrieves parameters on cold boot/deploy, renders `/opt/proctornet/.env` with mode 0600 root:root, Docker Compose consumes via `--env-file`, zero command-line argument leakage. |
| **"Terraform Bootstrap Lifecycle"** | S3 remote backend declared without explaining initial creation | Chicken-and-egg circular dependency between remote state and state bucket | **Resolved**: Two-phase bootstrap: `terraform/bootstrap/` uses temporary local state to provision the S3 state bucket (native `use_lockfile = true` locking, no DynamoDB table); operational environments initialize against remote S3 state. |
| **"Staging vs Production Instance Sizing"** | Hardcoded t3.xlarge / c6i.xlarge | Sizing should be configurable per environment | **Resolved**: Parameterized via `var.instance_type`. Staging reproduces full hybrid networking at lower cost (`t3.large`/`t3.xlarge`), production utilizes compute-optimized `c6i.xlarge`. |
| **"DynamoDB State Locking vs Native S3 Lockfile"** | Plan proposed DynamoDB table for Terraform state locking throughout all sections | Current Terraform S3 backend documentation deprecates DynamoDB locking in favor of native `use_lockfile = true` | **Resolved**: All DynamoDB state lock table references removed from objectives, scope, key deliverables, mandatory resource list, code-block diagrams, SVG diagrams, bootstrap provisions, backend.tf configuration, risks table, AD-20-6, implementation sequence Step 1, and Definition of Done. Native S3 lockfile locking (`use_lockfile = true`) consistently documented. No DynamoDB table provisioned. |
| **"High Availability vs Single-Host Resilience"** | "HA" and "High Availability" terminology applied to Phase 20 single-host baseline | Phase 20 is intentionally a single compute failure domain; true HA requires multi-instance/multi-AZ redundancy | **Resolved**: Section 35 renamed "Single-Host Resilience Analysis". Terminology table (§35.0) added explicitly defining durability, recoverability, single-host resilience, availability, and high availability. "HA ALB / ASG" subnet SVG label corrected to "Phase 21+ ALB / ASG". AD-20-11 renamed "Phase 20 Single-Host Resilience Scope". True HA explicitly deferred to Phase 21+. |
| **"RPO Measurement vs Backup Artifacts"** | RPO measurement referenced "pre-failure replication logs" absent from Phase 20 and conflated EBS volume recovery with PostgreSQL logical backup RPO under a single "< 24 Hours (Logical) / < 1 Hour (EBS)" label | Phase 20 has no PostgreSQL replication; EBS recovery and logical backup are distinct mechanisms with separate measurement methodologies | **Resolved**: Section 27.3 restructured with two separate targets — RPO-A (PostgreSQL logical backup, < 24 hrs, daily cycle, measured by comparing backup filename timestamp against restored `MAX(audit_logs.timestamp)`) and RPO-B (EBS data-volume storage-layer recovery, documented as a complementary mechanism, not a backup RPO). All replication log references removed. |

**Audit Conclusion**: Zero architectural contradictions remain. All historical conflicts and five correction-pass findings (RTO/RPO guarantees framing; EBS vs. logical backup RPO conflation; DynamoDB state locking deprecated by Terraform; HA terminology on single-host baseline; RPO measurement artifact inconsistency) have been completely identified, reconciled against the authoritative hierarchy, and documented.
