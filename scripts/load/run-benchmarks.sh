#!/usr/bin/env bash
# run-benchmarks.sh
# Shell launcher for ProctorNet Phase 21 Benchmark Suite

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"

cd "$ROOT_DIR"
node "$DIR/run-benchmarks.js" "$@"
