# Runbook RB-02: Database Primary Failure & Multi-AZ RDS Failover

## 1. Overview & Classification
- **Identifier**: `RB-02-DB-FAILOVER`
- **Subsystem**: Relational Database Storage (Amazon RDS PostgreSQL 16 Multi-AZ)
- **Severity**: SEV-1 (Critical)
- **Target RTO**: $< 2\text{ minutes}$ [TARGET]
- **Target RPO**: $< 5\text{ minutes}$ [TARGET]

## 2. Triggering Conditions
- CloudWatch Alarm: `RDS-Status != available` or `DatabaseConnections == 0`.
- Application logs flooded with `ECONNREFUSED` or `ETIMEDOUT` on port 5432.
- Subsystem health check `/developer/health/database` reporting `DOWN`.

## 3. Architecture & Automated Behavior
- In Amazon RDS Multi-AZ deployments, failover is **automated by AWS**:
  1. Primary DB instance detects hardware or network failure.
  2. Standby replica in alternate AZ is promoted to primary.
  3. CNAME endpoint (`proctornet-prod-db.xxxxxx.ap-south-1.rds.amazonaws.com`) updates DNS record to point to the new primary.
  4. Typical AWS automated failover window: $60 - 120\text{ seconds}$.
- **Application Pool Resilience**:
  - `backend/src/infrastructure/postgres/pool.js` handles idle connection termination and reconnects upon DNS propagation.

## 4. Operational Triage & Manual Triggering
### Step A: Verify RDS Status
```bash
aws rds describe-db-instances \
  --db-instance-identifier proctornet-production-rds \
  --query 'DBInstances[0].[DBInstanceStatus,AvailabilityZone,MultiAZ]' \
  --output table
```

### Step B: Manual Failover (if primary degraded without auto-failover)
```bash
aws rds reboot-db-instance \
  --db-instance-identifier proctornet-production-rds \
  --force-failover
```

### Step C: Flush Application Connection Pool
If application instances retain stale socket connections post-DNS update:
```bash
# Via WireGuard management bastion:
ssh ec2-user@10.100.0.10 "docker restart proctornet-backend"
ssh ec2-user@10.100.0.11 "docker restart proctornet-backend"
```

## 5. Verification & Data Integrity Audit
1. Query database engine and current AZ:
   ```bash
   psql -h proctornet-production-rds.cxxxx.ap-south-1.rds.amazonaws.com \
        -U proctornet_admin -d proctornet \
        -c "SELECT inet_server_addr(), NOW();"
   ```
2. Run data integrity and invariant suite:
   ```bash
   node scripts/chaos/verify-resilience-invariants.js
   ```
   Confirm all 8/8 invariants pass cleanly.
3. Check transactional outbox status:
   ```bash
   SELECT status, COUNT(*) FROM outbox_events GROUP BY status;
   ```
   Ensure pending events resume processing.
