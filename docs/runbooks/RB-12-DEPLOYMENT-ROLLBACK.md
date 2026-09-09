# Runbook RB-12: Deployment Failure & Instant Version Rollback

## 1. Overview & Classification
- **Identifier**: `RB-12-DEPLOYMENT-ROLLBACK`
- **Subsystem**: Release Engineering, CI/CD Pipeline & Deployment Orchestration
- **Severity**: SEV-1 (Failed Release Deployment)
- **Target RTO**: $< 5\text{ minutes}$ for application rollback [TARGET]
- **Target RPO**: $0\text{ seconds}$ (Zero data loss, database schema remains backward-compatible)

## 2. Triggering Conditions
- Health check gate `/ready` fails to report HTTP 200 within 60 seconds post-deployment.
- Error rate on ALB spikes $> 1\%$ immediately following a production deployment.
- Critical regression detected in synthetic smoke test or examination taking flow.

## 3. Compatibility Boundaries & Rollback Domains
ProctorNet isolates rollback across 3 independent domains:
1. **Application Container Tier**:
   - Every release image is immutable and tagged with its Git commit SHA (`proctornet-backend:sha-<commit>`).
   - Rollback is executed by updating the container image tag or checking out the previous commit SHA and redeploying.
2. **Database Schema Tier**:
   - Phase 29 introduces **zero DDL schema changes (Database Schema Migration: NOT REQUIRED)**.
   - The PostgreSQL schema (migrations 001-021) is 100% backward-compatible with Phase 28 and Phase 29 codebases alike. No schema rollback or data loss occurs.
3. **Infrastructure Tier**:
   - Terraform configuration is tracked in Git. Infrastructure toggles are reverted via version-controlled `.tfvars`.

## 4. Execution Procedure
### Step A: Trigger Automated Deployment Rollback Script
Execute rollback script on the deployment host:
```bash
cd /opt/proctornet
./infrastructure/deploy.sh --rollback
```
This script:
1. Inspects `.last_successful_commit` pointer.
2. Pulls the previous verified container image tag.
3. Restarts container services with previous immutable image.
4. Waits for `/ready` synthetic probe to return HTTP 200.

### Step B: Manual Rollback via Docker Compose (Fallback)
If `deploy.sh` is unavailable:
```bash
# Set image tag to previous known-good commit SHA
export PROCTORNET_IMAGE_TAG="sha-prev12345"
docker compose -f docker-compose.prod.yml up -d proctornet-backend
```

### Step C: ALB Target Group Immediate Traffic Swap
If blue/green deployment was utilized:
```bash
aws elbv2 modify-listener \
  --listener-arn $HTTPS_LISTENER_ARN \
  --default-actions Type=forward,TargetGroupArn=$PREVIOUS_TARGET_GROUP_ARN
```
Traffic shifts back to previous healthy targets instantly ($< 5\text{ seconds}$).

## 5. Post-Rollback Verification
1. Verify synthetic health endpoint:
   ```bash
   curl -i https://exam.proctornet.com/ready
   # Must return HTTP 200 OK
   ```
2. Verify API version header:
   ```bash
   curl -s https://exam.proctornet.com/api/v1 | jq .
   ```
3. Run automated regression smoke test:
   ```bash
   npm --prefix backend run test:smoke
   ```
4. Confirm ALB error rate drops to $0.00\%$.
