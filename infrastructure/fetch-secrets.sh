#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ProctorNet SSM Secret Materialization Script
# Fetches SecureString parameters from AWS SSM Parameter Store and
# securely materializes /opt/proctornet/.env with mode 0600 (root:root)
# Fail-closed: Exits non-zero if required production secrets cannot be fetched
# ==============================================================================

ENV_FILE="${ENV_FILE:-/opt/proctornet/.env}"
ENVIRONMENT="${ENVIRONMENT:-production}"
AWS_REGION="${AWS_REGION:-ap-south-1}"

echo "==> [SSM] Fetching parameters from path /proctornet/${ENVIRONMENT}/..."
UMASK_ORIG=$(umask)
umask 077

PARAMS=$(aws ssm get-parameters-by-path \
  --path "/proctornet/${ENVIRONMENT}/" \
  --with-decryption \
  --region "${AWS_REGION}" \
  --query "Parameters[*].{Name:Name,Value:Value}" \
  --output json)

PARAM_COUNT=$(echo "$PARAMS" | jq '. | length')
if [ "$PARAM_COUNT" -eq 0 ]; then
  echo "ERROR: [SSM] No parameters found under /proctornet/${ENVIRONMENT}/."
  echo "Fail-closed: Refusing to proceed with uninitialized credentials."
  umask "$UMASK_ORIG"
  exit 1
fi

TMP_ENV=$(mktemp "${ENV_FILE}.tmp.XXXXXX")
echo "# Auto-generated from AWS SSM Parameter Store at $(date -u)" > "$TMP_ENV"

echo "$PARAMS" | jq -r '.[] | "\(.Name | split("/") | last | ascii_upcase)=\(.Value)"' >> "$TMP_ENV"

chmod 0600 "$TMP_ENV"
mv "$TMP_ENV" "$ENV_FILE"
chmod 0600 "$ENV_FILE"
chown root:root "$ENV_FILE" 2>/dev/null || true
umask "$UMASK_ORIG"

echo "==> [SSM] Materialized ${ENV_FILE} successfully with mode 0600."
