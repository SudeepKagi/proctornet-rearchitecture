# Phase 21: AWS Least-Privilege IAM Access Requirements Specification (ARCHIVED)

> [!CAUTION]
> **STATUS: ARCHIVED / NOT IMPLEMENTED**
> AWS operations were permanently abandoned for Phase 21. No benchmark IAM roles or credentials are active. The temporary `ProctorNetBenchmarkSSMRole` and `proctornet-antigravity` AWS profile have been completely deleted.
> This specification is preserved solely for historical architecture reference.

**Phase:** Phase 21 — Load Testing & Concurrency Benchmarking  
**Milestone:** Stage 21C — AWS IAM Requirements (Archived)  
**Document Classification:** Security Governance & Access Control Specification  
**Status:** ARCHIVED / ABANDONED  
**Target AWS Account:** `8581****8489`  
**Target AWS Region:** `ap-south-1` (Mumbai)  

---

## 1. Executive Summary & Security Philosophy

This document defines the strict, least-privilege AWS Identity and Access Management (IAM) permissions required to execute Phase 21 Stage 21C load testing against an isolated AWS EC2 `c6i.xlarge` host.

### Core Governance Principles
1. **Zero Impact on Existing Credentials:** The existing `proctornet-evidence-dev` IAM user remains untouched. It was provisioned for Phase 15 S3 evidence storage and will NOT have its permissions expanded.
2. **Dedicated Temporary Role:** All Phase 21 operations must be performed using an assumed, temporary IAM role (`ProctorNetBenchmarkRole`) with a maximum session duration of 4–6 hours.
3. **Strict Tag Isolation:** Every mutating action (`RunInstances`, `TerminateInstances`, `DeleteVolume`, `DeleteSecurityGroup`) is gated by mandatory resource tags (`Phase=21`, `Project=ProctorNet`). Existing Phase 20 resources lack these tags and are cryptographically protected from modification or termination.
4. **No Wildcard Broad Permissions:** No `AdministratorAccess`, `PowerUserAccess`, `iam:*`, `rds:*` (write), `elasticache:*` (write), or unconstrained `ec2:*` permissions are granted.
5. **Budget & Cost Containment:** An explicit $10 warning and $25 hard limit safeguard the account's $100 available credit.

---

## 2. Mandatory Resource Tagging Standard

Every AWS resource created or managed for Phase 21 must carry the following immutable tags upon creation:

| Tag Key | Required Tag Value | Purpose |
| :--- | :--- | :--- |
| `Project` | `ProctorNet` | Attribution to ProctorNet examination system |
| `Phase` | `21` | Lifecycle gating and IAM conditional policy boundary |
| `Purpose` | `LoadTest` | Distinguishes benchmark nodes from production nodes |
| `Environment` | `Benchmark` | Prevents inclusion in production alerting/backup loops |
| `Owner` | `ProctorNet` | Resource accountability |

---

## 3. Comprehensive Permission Matrix

### Area 1: Read-Only Discovery (Pre-Flight Inventory Audit)

*Purpose:* Allows the benchmark operator to inspect existing infrastructure, confirm active VPC/subnets, verify no duplicate resources exist, and audit instance states without modifying any state.

| AWS API Action | Type | Resource Scope | Tag/Condition Gate | Rationale & Wildcard Justification |
| :--- | :--- | :--- | :--- | :--- |
| `ec2:DescribeInstances` | Read-Only | `*` | None | AWS EC2 API requirement: `DescribeInstances` does not support resource-level ARNs. Required to verify if instances exist. |
| `ec2:DescribeInstanceStatus` | Read-Only | `*` | None | AWS EC2 API requirement. Required to confirm instance health. |
| `ec2:DescribeVolumes` | Read-Only | `*` | None | AWS EC2 API requirement. Checks existing EBS volumes. |
| `ec2:DescribeAddresses` | Read-Only | `*` | None | AWS EC2 API requirement. Audits Elastic IP allocations. |
| `ec2:DescribeSecurityGroups` | Read-Only | `*` | None | AWS EC2 API requirement. Discovers existing network ingress rules. |
| `ec2:DescribeVpcs` | Read-Only | `*` | None | AWS EC2 API requirement. Discovers Phase 20 VPC (`10.0.0.0/16`). |
| `ec2:DescribeSubnets` | Read-Only | `*` | None | AWS EC2 API requirement. Discovers target public/private subnets. |
| `ec2:DescribeRouteTables` | Read-Only | `*` | None | AWS EC2 API requirement. Audits subnet routing tables. |
| `ec2:DescribeInternetGateways` | Read-Only | `*` | None | AWS EC2 API requirement. Verifies outbound internet egress path. |
| `ec2:DescribeNatGateways` | Read-Only | `*` | None | AWS EC2 API requirement. Verifies zero accidental NAT Gateways exist. |
| `elasticloadbalancing:DescribeLoadBalancers` | Read-Only | `*` | None | AWS ELB API requirement. Audits load balancer state (ensures none running). |
| `rds:DescribeDBInstances` | Read-Only | `*` | None | AWS RDS API requirement. Confirms whether managed RDS is running. |
| `elasticache:DescribeCacheClusters` | Read-Only | `*` | None | AWS ElastiCache API requirement. Confirms whether managed Redis is running. |
| `s3:GetBucketLocation` | Read-Only | `arn:aws:s3:::proctornet-evidence-dev-01` | Specific ARN | Checks region of project evidence bucket. |
| `sts:GetCallerIdentity` | Read-Only | `*` | None | AWS STS requirement. Confirms current authenticated IAM identity. |

---

### Area 2: Temporary Benchmark Infrastructure (EC2 & EBS Lifecycle)

*Purpose:* Launch, administer, and terminate strictly the `c6i.xlarge` benchmark application host and the temporary load-generator host.

| AWS API Action | Type | Resource Scope | Tag/Condition Gate | Rationale & Wildcard Justification |
| :--- | :--- | :--- | :--- | :--- |
| `ec2:RunInstances` | Write (Launch) | `arn:aws:ec2:ap-south-1:858109978489:instance/*`<br>`arn:aws:ec2:ap-south-1:858109978489:volume/*` | `ec2:InstanceType` IN `["c6i.xlarge", "c6i.large"]`<br>`aws:RequestTag/Phase: "21"`<br>`aws:RequestTag/Project: "ProctorNet"` | Constrains launches strictly to `c6i.xlarge` or `c6i.large` in `ap-south-1`. Mandatory `Phase=21` tag on creation. |
| `ec2:RunInstances` (Subnet/SG/AMI) | Write (Reference) | `arn:aws:ec2:ap-south-1::image/*`<br>`arn:aws:ec2:ap-south-1:858109978489:subnet/*`<br>`arn:aws:ec2:ap-south-1:858109978489:security-group/*`<br>`arn:aws:ec2:ap-south-1:858109978489:key-pair/*` | None | AWS requirement: referencing standard Ubuntu AMIs and VPC subnets during launch. |
| `ec2:CreateTags` | Write (Tagging) | `*` | `ec2:CreateAction: "RunInstances"` | Required to apply mandatory `Phase=21` tags during instance provisioning. Cannot tag existing resources. |
| `ec2:StartInstances` | Write (State) | `arn:aws:ec2:ap-south-1:858109978489:instance/*` | `ec2:ResourceTag/Phase: "21"`<br>`ec2:ResourceTag/Project: "ProctorNet"` | Can only start instances created for Phase 21. |
| `ec2:StopInstances` | Write (State) | `arn:aws:ec2:ap-south-1:858109978489:instance/*` | `ec2:ResourceTag/Phase: "21"`<br>`ec2:ResourceTag/Project: "ProctorNet"` | Can only stop instances created for Phase 21. |
| `ec2:TerminateInstances` | Write (Destroy) | `arn:aws:ec2:ap-south-1:858109978489:instance/*` | `ec2:ResourceTag/Phase: "21"`<br>`ec2:ResourceTag/Project: "ProctorNet"` | **Protects Phase 20.** Can ONLY terminate instances with tag `Phase=21`. Attempts to terminate any other instance will return `AccessDenied`. |
| `ec2:CreateSecurityGroup` | Write | `arn:aws:ec2:ap-south-1:858109978489:security-group/*` | `aws:RequestTag/Phase: "21"` | Allows creating a benchmark-only security group. |
| `ec2:AuthorizeSecurityGroupIngress` | Write | `arn:aws:ec2:ap-south-1:858109978489:security-group/*` | `ec2:ResourceTag/Phase: "21"` | Restricts ingress rule edits strictly to Phase 21 security groups (e.g. port 4000). |
| `ec2:DeleteSecurityGroup` | Write (Destroy) | `arn:aws:ec2:ap-south-1:858109978489:security-group/*` | `ec2:ResourceTag/Phase: "21"` | Can only clean up benchmark security groups. |
| `ec2:DeleteVolume` | Write (Destroy) | `arn:aws:ec2:ap-south-1:858109978489:volume/*` | `ec2:ResourceTag/Phase: "21"` | Can only delete EBS volumes tagged with `Phase=21`. |

---

### Area 3: AWS Systems Manager (SSM Session Administration)

*Purpose:* Prefer AWS Systems Manager Session Manager over opening SSH (port 22) to the internet. Eliminates private SSH key management and provides auditable shell access.

| AWS API Action | Type | Resource Scope | Tag/Condition Gate | Rationale & Wildcard Justification |
| :--- | :--- | :--- | :--- | :--- |
| `ssm:StartSession` | Write (Interactive) | `arn:aws:ec2:ap-south-1:858109978489:instance/*` | `ssm:resourceTag/Phase: "21"` | Starts interactive shell sessions strictly on Phase 21 benchmark instances. |
| `ssm:StartSession` (Document) | Write (Reference) | `arn:aws:ssm:ap-south-1::document/SSM-SessionProcess` | None | AWS SSM standard session document. |
| `ssm:TerminateSession` | Write | `arn:aws:ssm:ap-south-1:858109978489:session/*` | None | Closes active SSM management sessions. |
| `ssm:ResumeSession` | Write | `arn:aws:ssm:ap-south-1:858109978489:session/*` | None | Resumes interrupted SSM sessions. |
| `ssm:DescribeInstanceInformation` | Read-Only | `*` | None | Required by SSM CLI/console to list connected instances. |
| `ssm:GetConnectionStatus` | Read-Only | `arn:aws:ec2:ap-south-1:858109978489:instance/*` | `ssm:resourceTag/Phase: "21"` | Verifies SSM agent connectivity on the benchmark host. |

---

### Area 4: CloudWatch Telemetry & Metrics

*Purpose:* Collect OS and application telemetry (CPU, memory, connection counts, latency) during benchmark runs, and inspect benchmark-specific alarms.

| AWS API Action | Type | Resource Scope | Tag/Condition Gate | Rationale & Wildcard Justification |
| :--- | :--- | :--- | :--- | :--- |
| `cloudwatch:PutMetricData` | Write | `*` | `cloudwatch:namespace: "ProctorNet/Benchmark"` | Publishes custom benchmark metrics strictly into isolated namespace `ProctorNet/Benchmark`. Cannot pollute production metrics. |
| `cloudwatch:GetMetricData` | Read-Only | `*` | None | Retrieves telemetry data for report generation. |
| `cloudwatch:GetMetricStatistics` | Read-Only | `*` | None | Retrieves summary percentiles (p50, p95, p99). |
| `cloudwatch:ListMetrics` | Read-Only | `*` | None | Lists available metrics. |
| `cloudwatch:DescribeAlarms` | Read-Only | `*` | None | Inspects active alarms to verify system alerts. |

---

### Area 5: AWS Budgets & Billing Protection

*Purpose:* Inspect and configure project-specific spending guardrails ($10 warning, $25 operational ceiling) to safeguard the account's $100 credit.

| AWS API Action | Type | Resource Scope | Tag/Condition Gate | Rationale & Wildcard Justification |
| :--- | :--- | :--- | :--- | :--- |
| `budgets:ViewBudget` | Read-Only | `arn:aws:budgets::858109978489:budget/proctornet-*` | Specific ARN prefix | Inspects existing ProctorNet budgets/alarms. |
| `budgets:ModifyBudget` | Write | `arn:aws:budgets::858109978489:budget/proctornet-phase21-*` | Specific ARN prefix | Permits configuring the $10 warning and $25 ceiling budget for Phase 21. |

> [!IMPORTANT]
> **Billing API Note:** `aws-portal:*`, `ce:*` (Cost Explorer Admin), and root billing permissions are explicitly EXCLUDED. Only scoped budget viewing and modification are permitted.

---

## 4. Protected Existing Resources (Explicitly Shielded)

The following resources already exist or represent baseline Phase 20 architecture and **MUST NEVER** be altered, stopped, or deleted:

1. **Phase 15 S3 Evidence Bucket:** `arn:aws:s3:::proctornet-evidence-dev-01`
   - *Protection:* Write permissions are not requested; only `GetBucketLocation` is included.
2. **Phase 15 IAM User:** `arn:aws:iam::858109978489:user/proctornet-evidence-dev`
   - *Protection:* No `iam:PutUserPolicy`, `iam:AttachUserPolicy`, or user alteration permissions are requested.
3. **Phase 20 VPC Foundation:** VPC `10.0.0.0/16`, public subnets `10.0.1.0/24`, `10.0.2.0/24`, and private subnets `10.0.10.0/24`, `10.0.20.0/24`.
   - *Protection:* `ec2:DeleteVpc`, `ec2:DeleteSubnet`, and `ec2:DeleteRouteTable` are explicitly forbidden.
4. **Phase 20 Untagged EC2 / RDS / ElastiCache Nodes:**
   - *Protection:* `ec2:TerminateInstances`, `ec2:StopInstances`, and `ec2:DeleteVolume` require `ec2:ResourceTag/Phase: "21"`. Any resource lacking this tag cannot be modified.

---

## 5. Explicitly Excluded Dangerous & Broad Permissions

The following permissions are strictly **PROHIBITED** from inclusion in the Phase 21 policy:

| Forbidden Permission | Risk / Vulnerability Prevented |
| :--- | :--- |
| `*:*` (`AdministratorAccess`) | Total account compromise and unconstrained cost exposure. |
| `PowerUserAccess` | Allows creating unmanaged, high-cost resources (e.g. SageMaker, EKS, Redshift). |
| `iam:*` (Create/Attach Policy, CreateUser) | Privilege escalation; an agent or script could grant itself full admin. |
| `ec2:DeleteVpc`, `ec2:DeleteSubnet` | Accidental destruction of the Phase 20 VPC foundation. |
| `rds:CreateDBInstance`, `rds:DeleteDBInstance` | Expensive managed database costs ($50–$200/mo) outside benchmark scope. |
| `elasticache:CreateCacheCluster` | Unnecessary managed Redis costs outside single-host architecture. |
| `elasticloadbalancing:CreateLoadBalancer` | Unnecessary Application Load Balancer costs ($20+/mo baseline). |
| `ec2:ModifyInstanceAttribute` | Prevents unauthorized instance-type resizing to larger, costly families. |
| `kms:DeleteKey`, `kms:ScheduleKeyDeletion` | Destruction of cryptographic master keys. |
| `secretsmanager:GetSecretValue` (unscoped) | Exposure of unrelated application or database secrets. |

---

## 6. Recommended Temporary Role Implementation

### A. Role Trust Policy (`TrustPolicy.json`)
Allows an authorized administrator or current development session to assume the temporary role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAssumeBenchmarkRole",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::858109978489:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:DurationSeconds": "14400"
        }
      }
    }
  ]
}
```

### B. Consolidated Least-Privilege IAM Policy (`ProctorNetBenchmarkPolicy.json`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOnlyDiscovery",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "ec2:DescribeVolumes",
        "ec2:DescribeAddresses",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeRouteTables",
        "ec2:DescribeInternetGateways",
        "ec2:DescribeNatGateways",
        "elasticloadbalancing:DescribeLoadBalancers",
        "rds:DescribeDBInstances",
        "elasticache:DescribeCacheClusters",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ScopedS3Discovery",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::proctornet-evidence-dev-01"
    },
    {
      "Sid": "LaunchBenchmarkInstancesWithTagGating",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": [
        "arn:aws:ec2:ap-south-1:858109978489:instance/*",
        "arn:aws:ec2:ap-south-1:858109978489:volume/*"
      ],
      "Condition": {
        "StringEquals": {
          "ec2:InstanceType": ["c6i.xlarge", "c6i.large"],
          "aws:RequestTag/Phase": "21",
          "aws:RequestTag/Project": "ProctorNet"
        }
      }
    },
    {
      "Sid": "RunInstancesDependencies",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": [
        "arn:aws:ec2:ap-south-1::image/*",
        "arn:aws:ec2:ap-south-1:858109978489:subnet/*",
        "arn:aws:ec2:ap-south-1:858109978489:security-group/*",
        "arn:aws:ec2:ap-south-1:858109978489:key-pair/*"
      ]
    },
    {
      "Sid": "TaggingOnCreationOnly",
      "Effect": "Allow",
      "Action": "ec2:CreateTags",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ec2:CreateAction": "RunInstances"
        }
      }
    },
    {
      "Sid": "Phase21TaggedInstanceLifecycleOnly",
      "Effect": "Allow",
      "Action": [
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:TerminateInstances"
      ],
      "Resource": "arn:aws:ec2:ap-south-1:858109978489:instance/*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Phase": "21",
          "ec2:ResourceTag/Project": "ProctorNet"
        }
      }
    },
    {
      "Sid": "Phase21BenchmarkSecurityGroupLifecycle",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:DeleteSecurityGroup"
      ],
      "Resource": "arn:aws:ec2:ap-south-1:858109978489:security-group/*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Phase": "21"
        }
      }
    },
    {
      "Sid": "Phase21TaggedVolumeCleanup",
      "Effect": "Allow",
      "Action": "ec2:DeleteVolume",
      "Resource": "arn:aws:ec2:ap-south-1:858109978489:volume/*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Phase": "21",
          "ec2:ResourceTag/Project": "ProctorNet"
        }
      }
    },
    {
      "Sid": "SSMAdministrationTaggedInstances",
      "Effect": "Allow",
      "Action": [
        "ssm:StartSession",
        "ssm:GetConnectionStatus"
      ],
      "Resource": "arn:aws:ec2:ap-south-1:858109978489:instance/*",
      "Condition": {
        "StringEquals": {
          "ssm:resourceTag/Phase": "21"
        }
      }
    },
    {
      "Sid": "SSMGeneralOperations",
      "Effect": "Allow",
      "Action": [
        "ssm:DescribeInstanceInformation",
        "ssm:TerminateSession",
        "ssm:ResumeSession"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchBenchmarkMetrics",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudwatch:namespace": "ProctorNet/Benchmark"
        }
      }
    },
    {
      "Sid": "CloudWatchMetricsRead",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "cloudwatch:DescribeAlarms"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ScopedBudgetSafetyGuardrail",
      "Effect": "Allow",
      "Action": [
        "budgets:ViewBudget",
        "budgets:ModifyBudget"
      ],
      "Resource": "arn:aws:budgets::858109978489:budget/proctornet-*"
    }
  ]
}
```

---

## 7. Cost Safety Verification Summary

| Metric | Threshold | Verification Mechanism |
| :--- | :--- | :--- |
| **Available Account Credit** | $\approx \$100$ | Baseline context |
| **Desired Phase 21 Target Spend** | $< \$10$ | 2–3 hour session estimated at **$1.20–$1.60** |
| **Operational Warning Threshold** | $\$10$ | Triggered via `budgets:ModifyBudget` alarm |
| **Hard Session Operational Ceiling** | $\$25$ | Automated teardown trigger; instance type locked to `c6i.xlarge` |
| **Idle Resource Prevention** | Mandatory Cleanup | `cleanup-benchmark-data.js` + `ec2:TerminateInstances` immediately post-test |

---

## 8. Governance Verdict & Next Steps

1. **Safety Confirmation:** This policy grants zero permissions to modify or delete existing Phase 20 infrastructure. It isolates Phase 21 via mandatory tags, locks instance launches to `c6i.xlarge`/`c6i.large`, and excludes all broad administrative permissions.
2. **Current Action:** The specification is fully documented in `docs/benchmarks/PHASE_21_AWS_IAM_REQUIREMENTS.md`.
3. **Execution Gate:** No AWS resources have been provisioned or modified. Execution is halted pending user review and explicit authorization.
