# Runbook RB-08: AWS S3 Storage Outage & Pre-Signed Upload Failures

## 1. Overview & Classification
- **Identifier**: `RB-08-S3-OUTAGE`
- **Subsystem**: Evidence & Document Object Storage (Amazon S3 Private Bucket)
- **Severity**: SEV-2 (High Degradation, Take-Exam Continues)
- **Target RTO**: $< 5\text{ minutes}$ [TARGET]
- **Target RPO**: $0\text{ seconds}$

## 2. Triggering Conditions
- CloudWatch / Backend Metric: `evidence_storage_operations_total{operation="head_object", status="error"} > 5`.
- Student document upload or snapshot upload emitting HTTP 500 or CORS error against S3 pre-signed URL.
- Developer Health Matrix `/developer/health/storage` reporting `DEGRADED` or `DOWN`.

## 3. Architecture & Graceful Fallback
- **Pre-Signed Direct Upload**:
  - The client uploads evidence snapshots and documents directly to Amazon S3 via short-lived pre-signed URLs (15m expiration).
- **Zero Take-Exam Blocking**:
  - If snapshot upload fails, the candidate's exam session is **NOT interrupted**. Answers are autosaved in PostgreSQL. Failed snapshot uploads trigger localized client retry with exponential backoff.
- **Confirmation Step**:
  - Backend verifies version ID and file size via `HeadObject` before marking record `AVAILABLE`.

## 4. Triage & Diagnostics
1. Check S3 bucket reachability using AWS CLI via IAM role:
   ```bash
   aws s3 ls s3://proctornet-production-evidence-ap-south-1/
   ```
2. Inspect bucket CORS configuration:
   ```bash
   aws s3api get-bucket-cors --bucket proctornet-production-evidence-ap-south-1
   ```
   *Must allow origin `https://exam.proctornet.com` with `PUT` and headers `Content-Type`, `x-amz-*`.*
3. Verify backend IAM role permissions:
   - Ensure instance profile has `s3:PutObject`, `s3:GetObject`, `s3:HeadObject`, `s3:DeleteObject`, `s3:DeleteObjectVersion`.

## 5. Remediation Procedure
### Step A: Fix CORS Policy Mismatch
If pre-signed URL upload fails with client CORS rejection:
```bash
aws s3api put-bucket-cors \
  --bucket proctornet-production-evidence-ap-south-1 \
  --cors-configuration file://terraform/modules/s3/cors.json
```

### Step B: Reset IAM Instance Profile Credential Cache
```bash
# Force AWS SDK to refresh EC2 instance metadata credentials
docker restart proctornet-backend
```

## 6. Verification
1. Run evidence upload integration probe:
   ```bash
   curl -s -H "Authorization: Bearer $DEV_TOKEN" http://localhost:4000/api/v1/developer/health/storage | jq .
   ```
2. Confirm `status: "OK"` and head bucket latency $< 50\text{ ms}$.
