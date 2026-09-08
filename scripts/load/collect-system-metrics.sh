#!/usr/bin/env bash
# collect-system-metrics.sh
# Telemetry collector wrapper for Linux/EC2 environments.

set -euo pipefail

DURATION=${1:-60}
OUTPUT=${2:-"benchmarks/reports/metrics-snapshot.json"}

echo "[Telemetry] Launching runtime metrics collector for ${DURATION}s..."
node "$(dirname "$0")/collect-metrics.js" --duration="${DURATION}" --output="${OUTPUT}"
