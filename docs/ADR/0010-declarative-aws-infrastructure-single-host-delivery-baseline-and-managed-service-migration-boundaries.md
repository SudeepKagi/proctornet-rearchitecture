# ADR-0010: Declarative AWS Infrastructure, Single-Host EC2 Delivery Baseline, and Managed Service Migration Boundaries

## Status
Accepted

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
8. Terraform state uses S3 remote backend with native S3 lockfile locking (`use_lockfile = true`) and no DynamoDB locking.

## Consequences
- **Positive**: Zero risk of breaking Phase 19 modular monolith; WebRTC media achieves line-rate throughput; monthly cloud spend minimized ($140/mo in prod, $75/mo in staging); clear upgrade path for Phase 21.
- **Trade-offs**: Single-host EC2 represents a single failure domain (mitigated by automated EBS snapshots, S3 backup sync, and CloudWatch auto-recovery) until horizontal scaling is activated in Phase 21.
