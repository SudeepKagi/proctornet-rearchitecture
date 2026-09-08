#!/usr/bin/env bash
set -eo pipefail

# Initialize LocalStack S3 evidence storage bucket for local development and CI
BUCKET_NAME="${S3_BUCKET_NAME:-proctornet-evidence-dev-01}"
REGION="${DEFAULT_REGION:-ap-south-1}"

echo "==> [LocalStack Init] Creating S3 bucket: ${BUCKET_NAME} in region ${REGION}..."
awslocal s3 mb "s3://${BUCKET_NAME}" --region "${REGION}" || true

echo "==> [LocalStack Init] Verifying bucket creation..."
awslocal s3 ls

echo "==> [LocalStack Init] S3 initialization complete."
