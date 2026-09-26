#!/usr/bin/env bash
set -eo pipefail

# Initialize LocalStack S3 evidence storage bucket for local development and CI
BUCKET_NAME="${S3_BUCKET_NAME:-proctornet-evidence-dev-01}"
REGION="${DEFAULT_REGION:-ap-south-1}"

cat << 'EOF' > /tmp/cors-init.json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag", "x-amz-version-id"]
    }
  ]
}
EOF

for BUCKET in "${BUCKET_NAME}" "proctornet-evidence"; do
  echo "==> [LocalStack Init] Creating S3 bucket: ${BUCKET} in region ${REGION}..."
  awslocal s3 mb "s3://${BUCKET}" --region "${REGION}" || true

  echo "==> [LocalStack Init] Configuring CORS on bucket: ${BUCKET}..."
  awslocal s3api put-bucket-cors --bucket "${BUCKET}" --cors-configuration file:///tmp/cors-init.json
done

echo "==> [LocalStack Init] S3 initialization complete."

