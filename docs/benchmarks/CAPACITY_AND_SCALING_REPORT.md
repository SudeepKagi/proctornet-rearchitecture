# ProctorNet — Capacity & Scaling Assessment Report
## Phase 21: Empirical Benchmarking, Concurrency Profiling & Scaling Decision Matrix

> **Governance Status:** LIMITED LOCAL BENCHMARK COMPLETED (ABORTED AT 250 VUs DUE TO LOCAL HOST BOTTLENECK) — ZERO AWS OPERATIONS. RESULTS DO NOT ESTABLISH AWS c6i.xlarge CAPACITY.
> **Evaluation Date:** September 2026
> **Test Environment Baseline:** Local Development Machine (12th Gen Intel Core i5-12450H, 12 logical cores, 16 GiB RAM, Docker Desktop / WSL2)
> **Database:** PostgreSQL 16.4-alpine (`DB_POOL_MIN=2`, `DB_POOL_MAX=10`)
> **Cache / Ephemeral Store:** Redis 7.4-alpine
> **Message Transport:** RabbitMQ 3.13.7-management-alpine (Quorum Queues, transactional outbox)

---

## 1. Test Environment & Governance Safeguards

### Explicit Scope & Target Environment Boundary
> [!IMPORTANT]
> **Limited local 250-VU benchmark. Results are environment-specific and are not a capacity determination for the AWS c6i.xlarge deployment target. This local benchmark does not establish AWS c6i.xlarge capacity.**

All AWS operations for Phase 21 were abandoned. The AWS credentials profile (`proctornet-antigravity`) was revoked and removed from this development machine. All temporary AWS resources (security groups `sg-068f4aef5586b015f`, `sg-007ec66285b90ba6f`, IAM role `ProctorNetBenchmarkSSMRole`, instance profile `ProctorNetBenchmarkSSMProfile`) were verified and completely deleted. Zero EC2 instances and zero EBS volumes remain. Total AWS spend incurred for Phase 21 remains **$0.00**.

### Machine Characteristics (Local Development Workstation)
- **Processor:** 12th Gen Intel(R) Core(TM) i5-12450H (8 physical cores, 12 logical processors)
- **Host Memory:** 15.71 GiB Physical RAM (Baseline free RAM: 1.50–1.81 GiB; peak free RAM: 6.60 GiB after system memory reclamation)
- **Storage:** 72.21 GiB available SSD storage on `C:\`
- **Operating System / Container Runtime:** Windows 11 64-bit with Docker Desktop v4.x (WSL2 Linux VM container runtime)
- **Host CPU Baseline:** ~23%–32% idle/development load

---

## 2. Limited Local Staged Benchmark (25 to 250 VUs)

In accordance with strict workstation safety directives, load was applied sequentially in a staged ramp: **25 VUs $\to$ 50 VUs $\to$ 100 VUs $\to$ 150 VUs $\to$ 250 VUs**.

### Staged Concurrency Execution Matrix

| Stage | Target VUs | Actual Completed VUs | Throughput (Lifecycle) | Lifecycle p50 | Lifecycle p95 | Autosave p95 | Submission p95 | HTTP Error Rate | ACID Invariant Audit | Local Health / Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Stage 1** | **25 VUs** | **25 VUs** | 61.93 req/s | 13.98 ms | 210.89 ms | 70.74 ms | 436.53 ms | **0.00%** | **7/7 PASSED** (0 deadlocks) | **SUSTAINABLE** |
| **Stage 2** | **50 VUs** | **50 VUs** | 104.69 req/s | 12.92 ms | 481.28 ms | 159.93 ms | 913.64 ms | **0.00%** | **7/7 PASSED** (0 deadlocks) | **DEGRADED** (Submit p95 > 500ms) |
| **Stage 3** | **100 VUs** | **100 VUs** | 181.80 req/s | 17.12 ms | 936.54 ms | 153.12 ms | 1,566.64 ms | **0.00%** | **7/7 PASSED** (0 deadlocks) | **DEGRADED** (Submit p95 > 1.5s) |
| **Stage 4** | **150 VUs** | **150 VUs** | 230.11 req/s | 15.43 ms | 1,404.52 ms | 277.07 ms | 2,238.90 ms | **0.00%** (0.19% login) | **7/7 PASSED** (0 deadlocks) | **SATURATION** (p95 > 1.0s) |
| **Stage 5** | **250 VUs** | **Aborted** | — | — | — | — | — | Socket Error | N/A (Load aborted) | **LOCAL BOTTLENECK** (Docker/Host freeze) |

---

## 3. Workload Details & Stage Execution Summaries

### A. Stage 1 — 25 VUs (SUSTAINABLE Baseline)
- **Login Burst:** 529 requests, 17.22 rps, 0% errors, $p50 = 75.79\text{ ms}$, $p95 = 114.70\text{ ms}$.
- **Autosave Contention:** 550 requests, 26.16 rps, 0% errors, $p50 = 37.15\text{ ms}$, $p95 = 70.74\text{ ms}$.
- **Pool Saturation:** 1,791 requests, 117.87 rps, 0% errors, $p50 = 6.74\text{ ms}$, $p95 = 31.89\text{ ms}$.
- **Submission Surge:** 75 requests, 72.00 rps, 0% errors, $p50 = 15.81\text{ ms}$, $p95 = 436.53\text{ ms}$.
- **Full Candidate Lifecycle:** 250 requests, 61.93 rps, 0% errors, $p50 = 13.98\text{ ms}$, $p95 = 210.89\text{ ms}$.
- **ACID Invariant Audit:** 7/7 passed (0 orphan attempts, 0 orphan answers, 0 duplicate submissions, 0 engine deadlocks, monotonic OCC revisions).

### B. Stage 2 — 50 VUs (DEGRADED — Burst Submission Queueing)
- **Login Burst:** 1,067 requests, 34.85 rps, 0% errors, $p50 = 69.57\text{ ms}$, $p95 = 110.17\text{ ms}$.
- **Autosave Contention:** 1,059 requests, 50.90 rps, 0% errors, $p50 = 20.87\text{ ms}$, $p95 = 159.93\text{ ms}$.
- **Pool Saturation:** 3,349 requests, 219.87 rps, 0% errors, $p50 = 15.81\text{ ms}$, $p95 = 57.52\text{ ms}$.
- **Submission Surge:** 150 requests, 93.70 rps, 0% errors, $p50 = 21.44\text{ ms}$, $p95 = 913.64\text{ ms}$.
- **Full Candidate Lifecycle:** 500 requests, 104.69 rps, 0% errors, $p50 = 12.92\text{ ms}$, $p95 = 481.28\text{ ms}$.
- **ACID Invariant Audit:** 7/7 passed.

### C. Stage 3 — 100 VUs (DEGRADED — Elevated Latency Under Contention)
- **Login Burst:** 1,628 requests, 52.81 rps, 0% errors, $p50 = 498.27\text{ ms}$, $p95 = 663.96\text{ ms}$.
- **Autosave Contention:** 2,104 requests, 101.05 rps, 0% errors, $p50 = 18.73\text{ ms}$, $p95 = 153.12\text{ ms}$.
- **Pool Saturation:** 6,734 requests, 441.78 rps, 0% errors, $p50 = 9.24\text{ ms}$, $p95 = 46.56\text{ ms}$.
- **Submission Surge:** 300 requests, 127.37 rps, 0% errors, $p50 = 13.19\text{ ms}$, $p95 = 1,566.64\text{ ms}$.
- **Full Candidate Lifecycle:** 1,000 requests, 181.80 rps, 0% errors, $p50 = 17.12\text{ ms}$, $p95 = 936.54\text{ ms}$.
- **ACID Invariant Audit:** 7/7 passed.

### D. Stage 4 — 150 VUs (SATURATION — Maximum Successfully Completed Local Tier)
- **Login Burst:** 1,606 requests, 52.40 rps, 0.19% transient errors (3/1,606), $p50 = 1,484.03\text{ ms}$, $p95 = 1,608.93\text{ ms}$.
- **Autosave Contention:** 3,016 requests, 144.72 rps, 0% errors, $p50 = 41.85\text{ ms}$, $p95 = 277.07\text{ ms}$.
- **Pool Saturation:** 9,462 requests, 622.26 rps, 0% errors, $p50 = 10.93\text{ ms}$, $p95 = 73.33\text{ ms}$.
- **Submission Surge:** 450 requests, 139.10 rps, 0% errors, $p50 = 13.08\text{ ms}$, $p95 = 2,238.90\text{ ms}$.
- **Full Candidate Lifecycle:** 1,500 requests, 230.11 rps, 0% errors, $p50 = 15.43\text{ ms}$, $p95 = 1,404.52\text{ ms}$ (threshold crossed).
- **ACID Invariant Audit:** 7/7 passed (zero data corruption across 150 concurrent lifecycle completions).

### E. Stage 5 — 250 VUs (UNSUSTAINABLE — Aborted per Safety Limits)
- **Outcome:** Aborted immediately pursuant to Hard Safety Limits (Section 5).
- **Observed Behavior:** When attempting to initialize and stream 250 concurrent VUs on the local PC, the co-located load generator (k6 goroutines) combined with the Docker engine container stack saturated local network socket allocations and virtualization bridge capacity. The Windows Docker Desktop daemon pipe (`//./pipe/dockerDesktopLinuxEngine`) encountered socket exhaustion, resulting in connection resets and UI unresponsiveness.
- **Action Taken:** The test task was killed immediately. No further load was applied to protect the workstation.
- **Capacity Conclusion:** The local development workstation reaches SATURATION at 150 VUs (the maximum successfully completed local tier) and becomes unstable at 250 VUs (aborted due to local workstation/Docker socket exhaustion).

---

## 4. Local Machine Bottleneck Breakdown

At 250 VUs, the local development environment reached saturation due to the following specific constraints:
1. **Co-Located Workstation Resource Contention:** Running the load generator (k6 with 250 concurrent virtual users) on the exact same physical CPU cores and operating system as the application under test (Node.js monolith, PostgreSQL, Redis, RabbitMQ, LocalStack) induces severe context-switching overhead, CPU cache thrashing, and Windows thread scheduling contention.
2. **Windows / WSL2 Named Pipe Socket Exhaustion:** Under heavy connection bursts across 250 virtual users, Windows named pipes communicating with the WSL2 Linux VM become saturated, leading to `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`.
3. **Database Connection Pool Bottleneck:** The local default pool size of `DB_POOL_MAX = 10` forces high-concurrency requests into a FIFO acquisition wait queue, inflating burst submission p95 latency to $2.2\text{s}$ at 150 VUs.
4. **Proctoring Telemetry Nested Pool Acquisition:** In proctoring telemetry ingestion (`ingestCandidateEvents`), concurrent batch processing requires simultaneous attempt locking and violation flag querying, which starves the default 10-connection pool under burst conditions.

---

## 5. Explicit Limitations & Scope Declaration

1. **Not an AWS Determination:** This local benchmark was executed exclusively on a Windows development laptop. It does **not** establish or represent capacity for the production target (AWS EC2 `c6i.xlarge` with Nitro hypervisor, dedicated EBS gp3 IOPS, and separate network-isolated load generators).
2. **No Claim of 250 VU Capacity:** The system completed official benchmark tiers up to **150 VUs (classified as SATURATION; the maximum successfully completed local tier)**. At 250 VUs, the local host machine became unresponsive and the test was safely aborted due to local workstation/Docker socket exhaustion. The system does **not** claim to support 250 VUs on this local development environment, does not claim that the system supports 150 VUs in production, and establishes no Safe Operating Capacity from these local results.
3. **Product Code Integrity:** Zero architectural changes were made to backend logic, PostgreSQL schemas, Redis authority models, or RabbitMQ quorum queues during this benchmark.
