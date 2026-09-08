#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ProctorNet PostgreSQL Database Backup Script
# Executes pg_dump against the containerized PostgreSQL service and compresses output
# ==============================================================================

BACKUP_DIR="${BACKUP_DIR:-/opt/proctornet/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/proctornet_db_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "==> [Backup] Initiating PostgreSQL backup to ${BACKUP_FILE}..."

docker compose -f /opt/proctornet/docker-compose.prod.yml exec -T postgres \
  pg_dump -U "${DB_USER:-postgres}" "${DB_NAME:-proctornet}" | gzip > "${BACKUP_FILE}"

echo "==> [Backup] Backup completed successfully: $(du -h "${BACKUP_FILE}")"

# Retention: Delete backups older than 30 days
find "${BACKUP_DIR}" -name "proctornet_db_*.sql.gz" -mtime +30 -delete
echo "==> [Backup] Retention policy applied (purged backups older than 30 days)."
