# ProctorNet — Benchmark Methodology & Runbook
## Phase 21: Load Testing & Concurrency Benchmarking Specification

> **Governance Status:** RATIFIED ARCHITECTURAL SPECIFICATION  
> **Target Baseline:** AWS Single-Host EC2 `c6i.xlarge` (4 vCPUs, 8 GiB RAM, encrypted gp3 EBS volume)  
> **Toolchain:** Grafana k6, Artillery, Node.js Test Harness, PostgreSQL 16, Redis 7, RabbitMQ 3.13  

---

## 1. Overview & Objectives

The ProctorNet benchmarking framework is designed to empirically evaluate the performance, stability, and data integrity of the single-host modular monolith under realistic, production-scale candidate workloads.

### Primary Objectives
1. **Capacity Boundaries:** Establish empirical throughput and latency profiles across 5 progressive concurrency tiers (500, 1,000, 1,500, 2,000, and 2,500 concurrent examinees).
2. **Concurrency Correctness:** Validate Optimistic Concurrency Control (OCC) revision monotonicity, zero lost updates, and zero database deadlocks during high-frequency autosaves.
3. **Submission & Idempotency Hardening:** Validate synchronized end-of-exam submission spikes (2,500 examinees over 30s) and verify that network retries with identical `Idempotency-Key` headers return idempotent 200 responses with zero duplicate business effects.
4. **Transactional Outbox & Worker Drain:** Measure outbox claiming latency (`SELECT ... FOR UPDATE SKIP LOCKED`), RabbitMQ Quorum Queue buffering, and background evaluation scoring throughput.
5. **Phase 32 Scaling Triggers:** Produce objective, data-backed thresholds for when to activate AWS RDS PostgreSQL, AWS ElastiCache Redis, and AWS Application Load Balancer.

---

## 2. Concurrency Tiers

| Tier | Concurrent VUs | Autosave Rate (req/s) | Submission Window | Primary Evaluation Goal |
|---|---|---|---|---|
| **Smoke** | 10–25 VUs | ~5–25 req/s | 5s–30s | Fast CI/CD validation & script integrity |
| **Tier 1** | 500 VUs | ~50–100 req/s | 30s | Sustainable operational baseline |
| **Tier 2** | 1,000 VUs | ~100–200 req/s | 30s | Moderate load & connection pool profiling |
| **Tier 3** | 1,500 VUs | ~150–300 req/s | 30s | High load, Redis sliding window evaluation |
| **Tier 4** | 2,000 VUs | ~200–400 req/s | 30s | Saturation boundary identification |
| **Tier 5** | 2,500 VUs | ~250–500 req/s | 30s | Stress ceiling & recovery testing |

---

## 3. Workload Models & Scenarios

### A. Authentication Burst (`login-burst.js`)
- **Simulates:** Candidates logging into the testing portal prior to exam start.
- **Profile:** Ramping VUs over 2 minutes, holding for 1 minute, graceful ramp-down.
- **Thresholds:**
  - `http_req_duration p(95) < 2000ms`, `p(99) < 4000ms`
  - `login_success_rate > 99%`
  - `http_req_failed < 1%`

### B. High-Frequency Autosave Contention (`autosave-contention.js`)
- **Simulates:** Candidates actively selecting answers and autosaving progress every 5–10 seconds with simulated Poisson arrival jitter.
- **Cryptographic Security:** Each request computes client-side HMAC-SHA256 signature using attempt-derived signing key:
  $$\text{Key} = \text{HMAC-SHA256}(\text{ANTI\_TAMPER\_SECRET}, \, \text{attemptId} : \text{studentId} : \text{startedAtMs})$$
  $$\text{StringToSign} = \text{timestamp} . \text{nonce} . \text{method} . \text{path} . \text{SHA256}(\text{body})$$
- **OCC Logic:** Each autosave provides `expected_revision`. Unanswered questions provide revision 0 $\to$ inserts revision 1. Updates increment $K \to K+1$. Stale revisions receive `409 Conflict`.
- **Thresholds:**
  - `http_req_duration p(95) < 250ms`, `p(99) < 500ms`
  - `autosave_success_rate > 99%`
  - `autosave_conflict_rate < 1%` (for non-conflicting candidate streams)
  - `http_req_failed < 0.5%`

### C. Synchronized Submission Surge (`submission-surge.js`)
- **Simulates:** Exam timer expiring, triggering simultaneous submission requests from all candidates within a 30-second window.
- **Idempotency Verification:** Each candidate immediately replays the identical submission request with the same `Idempotency-Key` header to test duplicate rejection and idempotent cached replay.
- **Thresholds:**
  - `http_req_duration p(95) < 500ms`, `p(99) < 1000ms`
  - `submission_success_rate > 99%`
  - `idempotent_replay_success > 99%`
  - `http_req_failed < 1%`

### D. End-to-End Exam Lifecycle (`full-exam-lifecycle.js`)
- **Simulates:** Composite candidate journey: Login $\to$ Question fetching $\to$ Multi-question autosaves with anti-tamper signing $\to$ Telemetry event posting $\to$ Final submission.

### E. PostgreSQL Connection Pool Stress (`pool-saturation.js`)
- **Simulates:** Heavy read concurrency stressing `pg.Pool` connection acquisition, measuring wait times and transaction queuing under high concurrency.

---

## 4. Execution Workflow & Runbook

### Step 1: Pre-Flight Verification
Ensure all infrastructure services (PostgreSQL, Redis, RabbitMQ) and backend application server are running and ready:
```bash
curl http://localhost:4000/ready
```
Expected response:
```json
{
  "status": "READY",
  "database": { "status": "UP" },
  "redis": { "status": "UP" },
  "rabbitmq": { "status": "UP" }
}
```

### Step 2: Seed Benchmark Fixtures
Deterministic creation of isolated benchmark entities with `bench_` prefix:
```bash
node scripts/load/seed-benchmark-data.js --count=2500
```
This writes `scripts/load/fixtures/benchmark-fixtures.json` containing JWT tokens, attempt IDs, question IDs, and derived anti-tamper HMAC keys.

### Step 3: Run Telemetry Collector (Optional Background)
```bash
node scripts/load/collect-metrics.js --duration=300 --output=benchmarks/reports/metrics.json &
```

### Step 4: Execute Benchmark Suite
Execute complete benchmark harness (automated or smoke):
```bash
# Full benchmark run (all stages)
node scripts/load/run-benchmarks.js

# Smoke validation (< 60 seconds)
node scripts/load/run-benchmarks.js --smoke
```

Or execute individual k6 scenarios:
```bash
# Autosave contention scenario
k6 run -e VUS=500 -e DURATION=2m scripts/load/k6/autosave-contention.js

# Submission surge scenario
k6 run -e VUS=500 -e DURATION=30s scripts/load/k6/submission-surge.js
```

### Step 5: Post-Benchmark Data Integrity Audit
```bash
node scripts/load/verify-data-integrity.js
```
Validates the following invariants:
1. Zero orphan attempt questions.
2. Zero orphan answer rows.
3. Zero duplicate idempotency keys.
4. Outbox event completeness (`ATTEMPT_SUBMITTED` count $\equiv$ submitted attempts count).
5. Zero engine deadlocks (`pg_stat_database.deadlocks` delta $\equiv 0$).
6. Answer revision monotonicity (all stored revisions $\ge 1$).

### Step 6: Cascading Cleanup
Deletes all `bench_*` entities and restores database to pre-test baseline:
```bash
node scripts/load/cleanup-benchmark-data.js
```

---

## 5. Capacity State Definitions

```
+-----------------------------------------------------------------------------------+
| CAPACITY STATE       | LATENCY (p95) | ERROR RATE | POOL WAIT | SYSTEM INDICATORS |
+-----------------------------------------------------------------------------------+
| 1. Sustainable       | < 200 ms      | < 0.01%    | = 0 ms    | CPU < 70%, 0 lag  |
| 2. Degraded          | 200 - 500 ms  | < 0.1%     | < 100 ms  | CPU 70-85%, lag<50|
| 3. Saturation Point  | 500 - 2000 ms | < 1.0%     | > 100 ms  | Pool queue builds |
| 4. Failure Point     | > 2000 ms / TO| > 1.0%     | Timeout   | 5xx errs, deadlocks|
+-----------------------------------------------------------------------------------+
```

Safe Operating Capacity formula:
$$\text{Safe Operating Capacity} = \min\left(\text{Sustainable Concurrency}, \, 0.80 \times \text{Saturation Concurrency}\right)$$
