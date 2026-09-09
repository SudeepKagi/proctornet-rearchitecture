#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ProctorNet EC2 Host Deployment Script
# Executes targeted container replacement workflow:
# pull -> migrate -> replace frontend (--no-deps) -> replace backend (--no-deps) -> verify readiness
# ==============================================================================

COMPOSE_FILE="${COMPOSE_FILE:-/opt/proctornet/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/opt/proctornet/.env}"
STATE_DIR="${STATE_DIR:-/opt/proctornet}"
LAST_TAG_FILE="${STATE_DIR}/.last_successful_tag"

if [[ "${1:-}" == "--rollback" ]]; then
  echo "==> [ROLLBACK] Initiating instant application container rollback..."
  if [[ ! -f "$LAST_TAG_FILE" ]]; then
    echo "==> [ERROR] No previous successful tag record found at $LAST_TAG_FILE."
    exit 1
  fi
  PREV_TAG=$(cat "$LAST_TAG_FILE")
  echo "==> [ROLLBACK] Reverting container images to previously verified tag: $PREV_TAG"
  export PROCTORNET_IMAGE_TAG="$PREV_TAG"
  docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps frontend
  docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps backend
  
  echo "==> [ROLLBACK] Verifying rollback readiness probe..."
  for i in {1..30}; do
    if curl -sf http://127.0.0.1:4000/ready | grep -q '"status":"READY"'; then
      echo "==> [ROLLBACK SUCCESS] Application rolled back and verified READY."
      exit 0
    fi
    sleep 2
  done
  echo "==> [ROLLBACK FAILED] Rolled-back container failed readiness."
  exit 1
fi

# Standard deployment
CURRENT_TAG="${PROCTORNET_IMAGE_TAG:-latest}"
RUNNING_TAG=$(docker inspect --format='{{.Config.Image}}' proctornet-backend 2>/dev/null | cut -d':' -f2 || echo "")
if [[ -n "$RUNNING_TAG" && "$RUNNING_TAG" != "latest" ]]; then
  mkdir -p "$STATE_DIR"
  echo "$RUNNING_TAG" > "$LAST_TAG_FILE"
fi

echo "==> [1/5] Pulling latest production container images..."
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" pull

echo "==> [2/5] Executing database schema migrations..."
# Schema migrations run to completion before backend replacement to prevent runtime schema mismatches.
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm backend-migrate

echo "==> [3/5] Executing stateless frontend container replacement..."
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps frontend

echo "==> [4/5] Executing graceful single-instance backend replacement..."
docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps backend

echo "==> [5/5] Verifying system readiness probe..."
for i in {1..30}; do
  if curl -sf http://127.0.0.1:4000/ready | grep -q '"status":"READY"'; then
    echo "==> Deployment SUCCESS: ProctorNet backend is READY."
    if [[ "$CURRENT_TAG" != "latest" ]]; then
      mkdir -p "$STATE_DIR"
      echo "$CURRENT_TAG" > "$LAST_TAG_FILE"
    fi
    exit 0
  fi
  echo "Waiting for readiness probe (attempt $i/30)..."
  sleep 2
done

echo "==> Deployment FAILED: Backend failed to achieve readiness."
echo "==> Execute './deploy.sh --rollback' to revert to previous verified container image."
exit 1
