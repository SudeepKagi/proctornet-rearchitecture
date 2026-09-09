# Runbook RB-01: Application Outage & Rolling Recovery

## 1. Overview & Classification
- **Identifier**: `RB-01-APP-OUTAGE`
- **Subsystem**: Application Core (Node.js Express Modular Monolith)
- **Severity**: SEV-1 (Critical)
- **Target RTO**: $< 2\text{ minutes}$ [TARGET]
- **Target RPO**: $0\text{ seconds}$ (Stateless container tier)

## 2. Triggering Conditions
- CloudWatch Alarm: `ALB-HTTPCode_Target_5XX_Count > 10` for 1 minute.
- Synthetic Health Probe `/ready` fails with HTTP 503 or timeout.
- Multiple application containers in Docker/ECS reporting unhealthy status.

## 3. Triage & Root Cause Identification
1. Connect to production management plane via WireGuard:
   ```bash
   wg-quick up wg0
   ssh -i ~/.ssh/proctornet_prod.pem ec2-user@10.100.0.10
   ```
2. Check container health status:
   ```bash
   docker ps --filter "name=proctornet-backend"
   docker inspect --format='{{json .State.Health}}' proctornet-backend | jq .
   ```
3. Inspect recent error logs from ring buffer / stdout:
   ```bash
   docker logs --tail 100 --timestamps proctornet-backend
   ```
4. Check host resource metrics:
   ```bash
   free -h
   top -b -n 1 | head -n 20
   df -h /
   ```

## 4. Remediation Procedure
### Step A: Graceful In-Place Restart
```bash
docker restart proctornet-backend
```
Wait 15 seconds for startup probes:
```bash
curl -f -s http://localhost:4000/ready | jq .
```

### Step B: Cold Recreation (if unresponsive or zombie state)
```bash
cd /opt/proctornet
docker compose -f docker-compose.prod.yml down --timeout 30 proctornet-backend
docker compose -f docker-compose.prod.yml up -d proctornet-backend
```

### Step C: Multi-Instance Rolling Restart (ALB Target Group)
1. Deregister instance from ALB target group to drain active connections (30s).
2. Restart container on drained host.
3. Verify `/ready` returns HTTP 200.
4. Re-register instance with ALB target group.
5. Repeat for remaining instances.

## 5. Verification & Validation
1. Verify synthetic health endpoint:
   ```bash
   curl -i https://exam.proctornet.com/ready
   # Must return HTTP 200 OK
   ```
2. Check Developer Health Matrix:
   - Navigate to `/developer/health` on operator console.
   - Confirm all 13 subsystems report `OK`.
3. Monitor ALB 5XX error count:
   - Confirm metric drops to 0.

## 6. Escalation Path
- If restart fails due to memory exhaustion: Increase container memory limit or horizontally scale instance count.
- If root cause is a bad release: Execute `RB-12-DEPLOYMENT-ROLLBACK.md`.
