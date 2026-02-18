#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${REPO_DIR}/vector.toml"

if ! command -v vector &>/dev/null; then
  echo "Vector is not installed."
  echo ""
  echo "Install it with one of:"
  echo "  macOS:   brew install vectordotdev/brew/vector"
  echo "  Linux:   curl --proto '=https' --tlsv1.2 -sSfL https://sh.vector.dev | bash"
  echo "  Other:   https://vector.dev/docs/setup/installation/"
  exit 1
fi

ulimit -n 65536 2>/dev/null || true

echo "Starting Vector with config: ${CONFIG}"
echo "ClickHouse: ${CLICKHOUSE_HOST:-localhost}:8123"
exec vector --config "${CONFIG}"
