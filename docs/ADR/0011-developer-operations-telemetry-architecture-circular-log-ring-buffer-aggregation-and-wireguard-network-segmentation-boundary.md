# ADR-0011: Developer Operations Telemetry Architecture, Circular Log Ring Buffer Aggregation, and WireGuard Network Segmentation Boundary

## Status
Accepted

## Date
2026-09-09

## Context & Problem Statement
ProctorNet requires an engineering observability portal and a dedicated administrative network management plane (Phase 27). Previously planned across two distinct milestones (Old Phase 28: Developer Portal and Old Phase 29: WireGuard Management Plane), these concerns have been consolidated into a unified Developer Operations & Secure Management Plane.

Key operational and architectural requirements:
1. **Zero-PII Developer Operations Isolation**: Developers require deep system visibility (structured logs, live subsystem health, telemetry KPIs, infrastructure topology, operational incident triage) without accessing sensitive candidate data, student PII, facial embeddings, uploaded identity documents, exam question text, or subjective grading scorecards.
2. **Sub-Second Log Telemetry Without Ingestion Penalties**: Developers debugging real-time production anomalies require sub-second query latency across live log streams without taxing persistent disk I/O, flooding PostgreSQL with high-velocity write volume, or requiring an expensive, external managed logging cluster (e.g. OpenSearch/Datadog) in early development stages.
3. **Canonical Management Plane Segmentation**: Administrative SSH (port 22) must never be publicly exposed to `0.0.0.0/0`. Operational access, debugging tools, and node management must execute over an encrypted WireGuard VPN tunnel isolated from candidate traffic.
4. **Canonical Subnet Specification**: Legacy references in early drafts mentioned `10.8.0.0/24`. The authoritative subnet for ProctorNet management is strictly `10.100.0.0/24`.
5. **Zero Interference with Public Candidate Traffic**: VPN segmentation must strictly govern developer management; public candidate exam sessions (HTTPS port 443, WebSockets, WebRTC UDP ports 40000–49999, Coturn UDP 3478) must have zero VPN dependency and zero routing interference.

## Decision Drivers
1. **Data Privacy & Legal Compliance**: Strict role isolation prevents developer accounts from viewing candidate biometric embeddings or personal data.
2. **Deterministic Memory Footprint**: In-memory log aggregation must be bounded to avoid memory exhaustion (OOM).
3. **Sub-Second Search Latency**: In-memory ring buffer search must respond in under 50ms for 5,000 entries.
4. **Zero-Trust Network Perimeter**: Eliminate public port 22 exposure and route SSH strictly over WireGuard `10.100.0.0/24`.
5. **Architectural Simplicity & No Schema Changes**: No database migrations required; operational state uses existing tables (`audit_logs`, `users`, `user_roles`) and memory buffers.

## Considered Options

### Option 1: External Managed Observability & Public Bastion Host
- Forward all logs to Datadog/CloudWatch Logs; provision a public EC2 bastion host with port 22 open to developer IPs.
- *Discarded*: Incurs recurring monthly SaaS overhead; requires complex external IAM; maintains public port 22 exposure on the bastion host.

### Option 2: Database-Backed Persistent Logging Table
- Create an `app_logs` table in PostgreSQL and write all Pino logs via batch insertions.
- *Discarded*: Introduces massive write amplification on PostgreSQL primary; conflicts with zero database migration rule; search queries over millions of rows require heavy indexing and query maintenance.

### Option 3: In-Memory Circular Log Ring Buffer with Pino Multistream & WireGuard Network Segmentation (Chosen Option)
- Implement a 5,000-entry in-memory circular ring buffer (`LogBuffer`) in the Node.js monolith with pre-ingestion PII scrubbing (`developerPiiSanitizer`).
- Tee Pino logs via `pino.multistream` into stdout and the circular buffer.
- Provide sub-second REST search across the circular buffer filtered by severity, traceId, requestId, and text regex.
- Construct a 13-subsystem health telemetry aggregator (`healthAggregator`) executing parallel, non-blocking probes with 5-second caching and 2,000ms timeouts.
- Segment operations onto a WireGuard VPN gateway (`10.100.0.1/24`, UDP 51820) with automated peer lifecycle CLI (`manage-peers.sh`) and restrict port 22 SSH ingress in Terraform strictly to `10.100.0.0/24`.

## Decision Outcome
Chosen Option: **Option 3**.

### Key Architectural Contracts:
1. **Log Ring Buffer Capacity**: The `LogBuffer` maintains a strict upper bound of 5,000 log entries in memory. When capacity is reached, the oldest entries are evicted in FIFO order.
2. **Multi-Layer PII Scrubbing**: Pre-ingestion sanitizer redacts JWTs, Bearer tokens, emails, USNs, IP octets, passwords, cookies, biometric embeddings, and candidate exam answers before storing logs in the buffer or exposing audit events.
3. **Subsystem Health Probes**: Live telemetry checks cover all 13 subsystems: `node_api`, `postgres_primary`, `postgres_replica`, `redis`, `rabbitmq`, `websocket`, `sfu`, `coturn`, `outbox_poller`, `evaluation_consumer`, `s3_storage`, `backup_service`, and `wireguard`.
4. **Operational Incidents State Machine**: Technical incidents transition `TRIGGERED` → `ACKNOWLEDGED` → `RESOLVED` and record non-blocking immutable events in `audit_logs` table with `resourceType: 'SYSTEM_INCIDENT'`.
5. **Canonical WireGuard Subnet**: WireGuard network operates exclusively on `10.100.0.0/24` (gateway `10.100.0.1`, listen port UDP `51820`, MTU `1420`). The legacy `10.8.0.0/24` subnet is strictly prohibited.
6. **Firewall Invariant**: Security groups in Terraform prohibit `0.0.0.0/0` on port 22. SSH ingress is restricted to `var.admin_cidr` (`10.100.0.0/24`). Public port 51820 UDP is allowed for WireGuard gateway ingress.
7. **Role Isolation**: The `DEVELOPER` role has read-only access to engineering telemetry, health, logs, audit feed, and topology, and write access to technical incident acknowledgement/resolution. Developer accounts are strictly denied access to candidate identity records, facial verification tables, and exam question databases.

## Consequences
- **Positive**: Sub-second log search and telemetry without external dependencies; total memory consumption strictly capped under 25MB; port 22 completely isolated from the public internet; zero migration required; 100% compliance with data privacy mandates.
- **Trade-offs**: Circular buffer retains the most recent 5,000 log events in memory (older logs are persisted to stdout and standard Docker container logs).
