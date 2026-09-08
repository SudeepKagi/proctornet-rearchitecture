#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ProctorNet EC2 Host Deployment Script
# Executes targeted container replacement workflow:
# pull -> migrate -> replace frontend (--no-deps) -> replace backend (--no-deps) -> verify readiness
# ==============================================================================

COMPOSE_FILE="${COMPOSE_FILE:-/opt/proctornet/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/opt/proctornet/.env}"

echo "==> [1/5] Pulling latest production container images..."
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" pull

echo "==> [2/5] Executing database schema migrations..."
# Schema migrations run to completion before backend replacement to prevent runtime schema mismatches.
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm backend-migrate

echo "==> [3/5] Executing stateless frontend container replacement..."
# Note: On a single EC2 host without multiple active serving instances or an external load balancer,
# single-container frontend replacement may introduce a brief serving interruption during container recreation.
# The interruption duration is environment-dependent and must be measured during deployment verification.
# True zero-downtime frontend replacement requires overlapping container replicas or an external load balancer, which is outside Phase 19 scope.
# The --no-deps flag is intentionally used so Compose startup dependencies are not re-executed during targeted replacement.
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps frontend

echo "==> [4/5] Executing graceful single-instance backend replacement..."
# Note: On a single EC2 host without multiple active serving instances, backend container
# replacement causes a graceful restart (~2-5s) while client WebSocket/media connections reconnect.
# The --no-deps flag is intentionally used so Compose startup dependencies are not re-executed during targeted replacement.
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps backend

echo "==> [5/5] Verifying system readiness probe..."
for i in {1..30}; do
  if curl -sf http://127.0.0.1:4000/ready | grep -q '"status":"READY"'; then
    echo "==> Deployment SUCCESS: ProctorNet backend is READY."
    exit 0
  fi
  echo "Waiting for readiness probe (attempt $i/30)..."
  sleep 2
done

echo "==> Deployment FAILED: Backend failed to achieve readiness."
exit 1
