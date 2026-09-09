# Runbook RB-09: AWS Availability Zone Outage & Traffic Rerouting

## 1. Overview & Classification
- **Identifier**: `RB-09-AZ-OUTAGE`
- **Subsystem**: AWS Infrastructure Multi-AZ HA (`ap-south-1a`, `ap-south-1b`)
- **Severity**: SEV-1 (Critical Infrastructure Failure)
- **Target RTO**: $< 2\text{ minutes}$ [TARGET]
- **Target RPO**: $< 5\text{ minutes}$ [TARGET]

## 2. Triggering Conditions
- AWS Service Health Dashboard reporting major disruption in an availability zone (e.g. `ap-south-1a`).
- ALB Target Group reporting all targets in AZ-a `unhealthy`.
- RDS initiating automatic failover to standby replica in AZ-b.

## 3. Automated Resilience Architecture
- **Stateless Application Layer**: EC2 / Docker instances deployed across both AZ-a and AZ-b behind Application Load Balancer.
- **ALB Health Checks**: ALB continuously probes `/ready` on port 4000. When AZ-a instances fail health checks, ALB stops routing traffic to AZ-a immediately ($< 10\text{ seconds}$).
- **RDS Multi-AZ**: Synchronously replicated standby in AZ-b is automatically promoted to primary.
- **Single-Region Boundary**: All recovery takes place strictly within `ap-south-1`. Secondary-region recovery is out of scope.

## 4. Operator Verification & Incident Actions
### Step A: Verify ALB Routing Health
```bash
aws elbv2 describe-target-health \
  --target-group-arn $ALB_TARGET_GROUP_ARN \
  --query 'TargetHealthDescriptions[*].[Target.Id,Target.AvailabilityZone,TargetHealth.State]' \
  --output table
```

### Step B: Verify RDS Multi-AZ Failover State
```bash
aws rds describe-db-instances \
  --db-instance-identifier proctornet-production-rds \
  --query 'DBInstances[0].[DBInstanceStatus,AvailabilityZone]' \
  --output table
```
Confirm active DB has switched to surviving AZ (e.g. `ap-south-1b`).

### Step C: Scale Surviving AZ Application Instances
If capacity in surviving AZ is insufficient for peak candidate load:
```bash
# Launch extra standby instance in surviving AZ
aws ec2 run-instances \
  --launch-template LaunchTemplateName=proctornet-app-template \
  --subnet-id $SUBNET_AZ_B_ID \
  --count 2
```

### Step D: WireGuard Bastion Out-of-Band Fallback
If the primary WireGuard bastion host was located in the degraded AZ:
- Use AWS Systems Manager (SSM) Session Manager to securely connect to surviving instances without opening SSH port 22:
```bash
aws ssm start-session --target $SURVIVING_INSTANCE_ID
```

## 5. Verification
1. Verify synthetic end-to-end user request:
   ```bash
   curl -i https://exam.proctornet.com/ready
   ```
2. Verify candidate session continuity on surviving instances.
3. Confirm zero orphan attempts and 8/8 invariants pass via `scripts/chaos/verify-resilience-invariants.js`.
