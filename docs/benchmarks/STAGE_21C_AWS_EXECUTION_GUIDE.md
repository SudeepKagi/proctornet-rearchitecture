# Stage 21C: AWS c6i.xlarge Staging Benchmark Execution Guide (ABANDONED)

> [!CAUTION]
> **STATUS: ABANDONED / SUPERSEDED BY LIMITED LOCAL BENCHMARK**
> AWS execution was permanently abandoned for Phase 21. All AWS access profiles (`proctornet-antigravity`) and temporary resources (security groups, IAM roles) were deleted. Phase 21 was concluded using a limited local benchmark on the development workstation.
> **DO NOT USE THIS GUIDE TO EXECUTE AWS BENCHMARKS.**

**Phase:** Phase 21 — Load Testing & Concurrency Benchmarking  
**Stage:** Stage 21C — AWS Staging Benchmark (Abandoned)  
**Security Posture:** Zero Persistent Secrets, Ephemeral Token Generation at Runtime  

---

## 1. Architectural Architecture for Stage 21C

To prevent client-side generator CPU/socket bottlenecks from distorting server capacity observations, and to safeguard local development machines from resource saturation, Stage 21C utilizes an **isolated two-tier architecture**:

```
+------------------------------------+          +------------------------------------+
|     Load Generator Machine         |          |       AWS Benchmark Host           |
|  (Separate EC2/Container/Runner)   |          |      (EC2 c6i.xlarge instance)     |
|                                    |          |                                    |
|  - k6 v0.57+ (load generator)      |  WAN /   |  - Docker Compose Stack            |
|  - run-official-tier.js orchestrator|  VPC     |    * proctornet-backend (Node.js)  |
|  - Scenarios:                      |  HTTPS   |    * proctornet-postgres (PG 16)   |
|    * login-burst.js                | -------> |    * proctornet-redis (Redis 7)    |
|    * autosave-contention.js        |          |    * proctornet-rabbitmq (RMQ 3.13)|
|    * pool-saturation.js            |          |  - Host Telemetry Collector        |
|    * submission-surge.js           |          |    * collect-metrics.js            |
|    * full-exam-lifecycle.js        |          |    * Linux dstat / vmstat / htop   |
+------------------------------------+          +------------------------------------+
```

---

## 2. Environment Preparation

### A. AWS Benchmark Host (`c6i.xlarge`)

1. **Provision Instance:**
   - AMI: Ubuntu 22.04 LTS or Amazon Linux 2023
   - Instance Type: `c6i.xlarge` (4 vCPUs, 8 GiB RAM)
   - Storage: 50 GiB gp3 (3,000 IOPS, 125 MB/s baseline throughput)
   - Security Group: Inbound port `4000` (HTTP) from Load Generator IP; Inbound `22` (SSH)

2. **System Tuning:**
   ```bash
   # Increase file descriptor and socket limits
   sudo sysctl -w fs.file-max=2097152
   sudo sysctl -w net.core.somaxconn=65535
   sudo sysctl -w net.ipv4.tcp_max_syn_backlog=65535
   sudo sysctl -w net.ipv4.ip_local_port_range="1024 65535"
   ulimit -n 65535
   ```

3. **Deploy Application Stack:**
   ```bash
   git clone https://github.com/SudeepKagi/proctornet-rearchitecture.git
   cd proctornet-rearchitecture
   git checkout feature/phase-21-load-testing

   # Configure staging environment
   cp .env.example .env
   # Start production compose stack
   docker compose -f infrastructure/docker-compose.prod.yml up -d
   ```

4. **Verify Application Readiness:**
   ```bash
   curl -s http://localhost:4000/ready | jq .
   # Verify all subsystems (database, redis, rabbitmq) return "UP" and overall status is "READY"
   ```

---

### B. Load Generator Host (Separate Machine or Container)

1. **Install Prerequisites:**
   - Node.js `v22.x` or `v24.x`
   - k6 `v0.57+` (`sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69; sudo apt update; sudo apt install k6`)
   - Ensure network route to AWS Benchmark Host on port 4000.

2. **Clone & Dry-Run Validation:**
   ```bash
   git clone https://github.com/SudeepKagi/proctornet-rearchitecture.git
   cd proctornet-rearchitecture
   git checkout feature/phase-21-load-testing

   # Validate runner configuration against remote host without generating load
   node scripts/load/run-official-tier.js --base-url=http://<AWS_HOST_IP>:4000 --dry-run
   ```

---

## 3. Official Concurrency Tier Execution Sequence

Execute each concurrency tier sequentially with a 60-second cooldown period between tiers.

### Tier 1: 500 Virtual Users
```bash
export BASE_URL=http://<AWS_HOST_IP>:4000
export DB_HOST=<AWS_HOST_IP>
# Set your secure benchmark password in the environment at runtime (never commit secrets)
export BENCHMARK_PASSWORD="${BENCHMARK_PASSWORD:-<INJECT_AT_RUNTIME>}"

node scripts/load/run-official-tier.js --vus=500 --base-url=$BASE_URL
```

### Tier 2: 1,000 Virtual Users
```bash
node scripts/load/run-official-tier.js --vus=1000 --base-url=$BASE_URL
```

### Tier 3: 1,500 Virtual Users
```bash
node scripts/load/run-official-tier.js --vus=1500 --base-url=$BASE_URL
```

### Tier 4: 2,000 Virtual Users
```bash
node scripts/load/run-official-tier.js --vus=2000 --base-url=$BASE_URL
```

### Tier 5: 2,500 Virtual Users
```bash
node scripts/load/run-official-tier.js --vus=2500 --base-url=$BASE_URL
```

---

## 4. Real-Time Resource Monitoring on the AWS Host

Run on the AWS host during each tier:

1. **Automated Resource Sampler:**
   ```bash
   node scripts/load/collect-metrics.js --duration=600 --output=benchmarks/reports/remote-metrics.json
   ```

2. **System CPU & Disk I/O Monitoring:**
   ```bash
   # In a separate terminal on AWS host:
   dstat -tcmnd --disk-util 1
   ```

3. **PostgreSQL Pool & Transaction Health:**
   ```bash
   docker exec -it proctornet-postgres psql -U postgres -d proctornet -c \
     "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
   ```

---

## 5. Artifact Collection & Zero-Secret Assurance

1. **Artifact Transfer:**
   ```bash
   # Copy report artifacts from generator host to local repository:
   scp -r <LOAD_GENERATOR>:proctornet-rearchitecture/benchmarks/reports/* benchmarks/reports/
   ```

2. **Zero-Secret Verification:**
   ```bash
   # Ensure no tokens or passwords exist in captured reports:
   grep -E -i "token|password|secret|bearer" benchmarks/reports/*.json
   # Only expected metric keys or benchmark metadata must appear; no plain credentials.
   ```

3. **Safe Operating Capacity (SOC) Derivation:**
   Following completion of Tiers 1–5 on AWS, update `docs/benchmarks/CAPACITY_AND_SCALING_REPORT.md` with measured empirical values and establish the official Safe Operating Capacity (SOC).
