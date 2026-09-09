# Runbook RB-10: Suspected Security Intrusion & Incident Isolation

## 1. Overview & Classification
- **Identifier**: `RB-10-SECURITY-INCIDENT`
- **Subsystem**: Security, Threat Mitigation & Forensics
- **Severity**: SEV-1 (Critical Security Event)
- **Target RTO**: $< 5\text{ minutes}$ for threat isolation [TARGET]
- **Target RPO**: N/A

## 2. Triggering Conditions
- Repeated unauthorized privilege escalation attempts (`FORBIDDEN_ROLE_BOUNDARY`).
- Detection of signature tampering attacks (`INVALID_PAYLOAD_SIGNATURE`).
- SSH brute force attempts or connection requests outside canonical WireGuard subnet `10.100.0.0/24`.
- Unexplained high-volume data export queries or unexpected API key usage.

## 3. Immediate Containment & Isolation Procedure
### Step A: Isolate Host / Suspected Instance
1. Remove suspected EC2 instance from ALB target group immediately:
   ```bash
   aws elbv2 deregister-targets \
     --target-group-arn $ALB_TARGET_GROUP_ARN \
     --targets Id=$SUSPECT_INSTANCE_ID
   ```
2. Attach isolation security group (blocks all outbound and inbound except WireGuard forensics):
   ```bash
   aws ec2 modify-instance-attribute \
     --instance-id $SUSPECT_INSTANCE_ID \
     --groups $ISOLATION_SECURITY_GROUP_ID
   ```

### Step B: Terminate Compromised User Sessions
1. Revoke active sessions in PostgreSQL:
   ```bash
   UPDATE auth_sessions
   SET is_revoked = true, updated_at = NOW()
   WHERE user_id = '$COMPROMISED_USER_ID';
   ```
2. Blacklist user tokens in Redis:
   ```bash
   docker exec -it proctornet-redis redis-cli SET "user:lockout:$COMPROMISED_USER_ID" "SUSPENDED" EX 86400
   ```
3. Suspend user account:
   ```bash
   UPDATE users SET status = 'SUSPENDED' WHERE user_id = '$COMPROMISED_USER_ID';
   ```

### Step C: Capture Forensic Memory & Ephemeral Disk Snapshot
```bash
# Capture EBS volume snapshot for post-mortem forensic analysis
aws ec2 create-snapshot \
  --volume-id $SUSPECT_VOLUME_ID \
  --description "Forensic snapshot of security incident on $SUSPECT_INSTANCE_ID"
```

## 4. Audit Trail Integrity Verification
- In accordance with Phase 13 & Migration 015, all academic and administrative activities are recorded in append-only `audit_logs` protected by database trigger `SQLSTATE 20000`.
- Verify audit log continuity:
  ```bash
  SELECT id, action, user_id, timestamp
  FROM audit_logs
  WHERE timestamp > NOW() - INTERVAL '6 hours'
  ORDER BY timestamp DESC
  LIMIT 50;
  ```
- Confirm zero deletions or mutations were possible.

## 5. Post-Incident Review
1. Author formal Security Incident Report following `docs/SECURITY_AUDIT_EXCEPTIONS.md`.
2. Update firewall rules and rate limiter rules if novel attack vector identified.
