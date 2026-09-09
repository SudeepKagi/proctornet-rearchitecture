# Operational Runbook: Disaster Recovery & Restore Operations

## 1. Disaster Recovery Strategy & Scope Boundaries
- **Authoritative Architecture**: Single primary AWS Region: `ap-south-1`.
- **High Availability**: Multi-AZ redundant deployment (`ap-south-1a`, `ap-south-1b`).
- **Scope Boundary**: Secondary-region cross-region disaster recovery, S3 Cross-Region Replication (CRR), and multi-region active-active deployments are **EXPLICITLY OUT OF SCOPE** for Phase 29.
- **Quantitative Baselines**:
  - **RTO (Recovery Time Objective)**: Target $< 15\text{ minutes}$ [TARGET]; Measured isolated drill restore: $5.51\text{ seconds}$ [MEASURED].
  - **RPO (Recovery Point Objective)**: Target $< 5\text{ minutes}$ [TARGET]; Measured drill RPO: $1,178.43\text{ seconds}$ [MEASURED].

## 2. Recovery Tiers & Failure Modes
| Failure Tier | Primary Defense | Recovery Mechanism | Target RTO | Target RPO |
|---|---|---|---|---|
| **Tier 1: Container Crash** | Docker auto-restart | `restart: unless-stopped` | $< 5\text{ s}$ [TARGET] | $0\text{ s}$ |
| **Tier 2: Host Instance Crash** | CloudWatch Auto-Recovery | EC2 status check recovery | $< 3\text{ m}$ [TARGET] | $0\text{ s}$ |
| **Tier 3: AZ Outage** | ALB multi-AZ + RDS Multi-AZ | Traffic rerouting to surviving AZ | $< 2\text{ m}$ [TARGET] | $< 5\text{ m}$ [TARGET] |
| **Tier 4: Catastrophic DB Loss**| S3 WALs + RDS automated snapshots | Point-in-Time Recovery (PITR) | $< 15\text{ m}$ [TARGET] | $< 5\text{ m}$ [TARGET] |

## 3. Step-by-Step Point-in-Time Recovery (PITR) Execution
If database corruption or catastrophic failure requires point-in-time recovery:
1. Identify target recovery timestamp (e.g., 5 minutes prior to incident):
   ```bash
   RECOVERY_TIME="2026-09-09T06:00:00Z"
   ```
2. Initiate RDS Point-in-Time Recovery via AWS CLI:
   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier proctornet-production-rds \
     --target-db-instance-identifier proctornet-production-rds-restored \
     --restore-time $RECOVERY_TIME \
     --db-subnet-group-name proctornet-production-db-subnets \
     --multi-az
   ```
3. Monitor restore progress until status is `available`:
   ```bash
   aws rds wait db-instance-available \
     --db-instance-identifier proctornet-production-rds-restored
   ```
4. Verify restored database using automated verification script:
   ```bash
   DB_HOST="proctornet-production-rds-restored.cxxxx.ap-south-1.rds.amazonaws.com" \
   DB_NAME="proctornet" \
   node scripts/db/verify-platform-migration.js
   ```
   *Must verify 21/21 migrations, 39 tables, immutability trigger `SQLSTATE 20000`, and zero orphan records.*
5. Update DNS CNAME or application environment variable to point to restored database endpoint.
6. Restart backend application containers:
   ```bash
   ./infrastructure/deploy.sh
   ```

## 4. Periodic Isolated Restore Drill Procedure
To run the automated isolated restore drill on demand:
```bash
node scripts/db/run-isolated-restore-drill.js
```
The script validates:
1. Schema continuity (21/21 migrations).
2. Row count parity across 10 core tables.
3. 8/8 ACID and resilience invariants.
4. Checksum parity.
5. Application liveness.
6. Emits measured RTO and RPO metrics.
