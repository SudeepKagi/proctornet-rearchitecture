# Operational Master Runbook: ProctorNet Production Operations

## 1. Overview & Operational Model
This master operational runbook defines daily operations, monitoring checklists, deployment gates, and emergency incident handling for ProctorNet.

ProctorNet runs as a **modular monolith** with:
- **Authoritative Data Store**: Amazon RDS PostgreSQL 16 Multi-AZ (`ap-south-1`).
- **Cache / Ephemeral Layer**: ElastiCache Redis 7.4.
- **Message Broker**: Containerized RabbitMQ 3.13 Quorum Queues + PostgreSQL Transactional Outbox.
- **Real-Time Control Plane**: WebSocket (`ws://` / `wss://`) over Redis Pub/Sub.
- **Media Plane**: mediasoup v3 SFU with dynamic announced IP + Coturn TURN relays.
- **Object Storage**: Private Amazon S3 with pre-signed upload URLs.
- **Network Boundaries**: WireGuard management plane (`10.100.0.0/24`), zero SSH from `0.0.0.0/0`.

## 2. Standard Operating Procedures (SOPs) & Runbook Directory
| Code | Runbook Title | Subsystem | Target RTO |
|---|---|---|---|
| `RB-01` | [Application Outage & Rolling Recovery](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-01-APP-OUTAGE.md) | Core Express Monolith | $< 2\text{ m}$ [TARGET] |
| `RB-02` | [Database Primary Failure & RDS Failover](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-02-DB-FAILOVER.md) | RDS PostgreSQL Multi-AZ | $< 2\text{ m}$ [TARGET] |
| `RB-03` | [Redis Outage & Fallback Operations](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-03-REDIS-OUTAGE.md) | Redis Cache & Ephemeral | $< 1\text{ m}$ [TARGET] |
| `RB-04` | [RabbitMQ Broker Outage & Outbox Triage](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-04-RABBITMQ-OUTAGE.md) | RabbitMQ Quorum Queues | $< 3\text{ m}$ [TARGET] |
| `RB-05` | [Mediasoup SFU Worker Crash & Session Recovery](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-05-SFU-CRASH.md) | SFU WebRTC Media Plane | $< 30\text{ s}$ [TARGET] |
| `RB-06` | [Screen Stream Packet Loss & Degraded Media](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-06-SCREEN-STREAM-DEGRADED.md) | Client Screen AI & SFU | $< 15\text{ s}$ [TARGET] |
| `RB-07` | [Authentication & Dual-JWT Lifecycle Outage](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-07-AUTH-OUTAGE.md) | Auth & Session Mgmt | $< 2\text{ m}$ [TARGET] |
| `RB-08` | [AWS S3 Storage Outage & Upload Failures](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-08-S3-OUTAGE.md) | Private S3 Evidence Bucket | $< 5\text{ m}$ [TARGET] |
| `RB-09` | [AWS AZ Outage & Traffic Draining](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-09-AZ-OUTAGE.md) | AWS Multi-AZ Infrastructure | $< 2\text{ m}$ [TARGET] |
| `RB-10` | [Suspected Intrusion & Incident Isolation](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-10-SECURITY-INCIDENT.md) | Threat Mitigation & Forensics | $< 5\text{ m}$ [TARGET] |
| `RB-11` | [Suspected PII Exposure & Log Scrubbing](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-11-PII-LEAK-TRIAGE.md) | Privacy & Compliance | $< 15\text{ m}$ [TARGET] |
| `RB-12` | [Deployment Failure & Instant Rollback](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/RB-12-DEPLOYMENT-ROLLBACK.md) | Release Engineering | $< 5\text{ m}$ [TARGET] |
| `RB-WG` | [WireGuard Management Boundary](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/WIREGUARD_RUNBOOK.md) | Network Isolation & Bastion | N/A |
| `RB-DR` | [Disaster Recovery & Restore Operations](file:///c:/Projects/Online%20Examination%20System/docs/runbooks/DISASTER_RECOVERY_RUNBOOK.md) | Single-Region DR & PITR | $< 15\text{ m}$ [TARGET] |

## 3. Daily Health Checklist (Operator Console)
1. **Developer Health Matrix (`/developer/health`)**:
   - Check all 13 subsystems: `database`, `redis`, `rabbitmq`, `outbox`, `storage`, `websocket`, `media`, `coturn`, `auth`, `system_metrics`, `wireguard`, `alb`, `audit_log`.
   - Confirm all report `OK`.
2. **Transactional Outbox Backlog**:
   - Confirm `PENDING` outbox events $< 50$.
3. **Dead Letter Queue**:
   - Confirm `evaluation.dlq` has 0 messages.
4. **Data Retention Sweeper Verification**:
   - Run dry-run sweeper: `node scripts/retention/run-retention-sweepers.js --dry-run`.
   - Confirm audit log immutability trigger `SQLSTATE 20000` is active.

## 4. Production Release Gates
Before tagging or deploying any production release:
1. `npm audit --omit=dev --audit-level=high` $\to$ 0 vulnerabilities.
2. Check `docs/SECURITY_AUDIT_EXCEPTIONS.md` for any expired exceptions.
3. Verify OpenAPI 3.1 100% route coverage: `node --test backend/tests/openapiRouteCoverage.test.js`.
4. Verify database platform migration checks: `node scripts/db/verify-platform-migration.js`.
5. Execute full system test suite: Unit, integration, invariant suites.
