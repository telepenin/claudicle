#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${REPO_DIR}/configs/otelcol-config.yaml"

# Load credentials from .env if present and vars not already set
if [[ -f "${REPO_DIR}/.env" ]]; then
  set -a
  source "${REPO_DIR}/.env"
  set +a
fi

: "${CLICKHOUSE_USER:?Missing CLICKHOUSE_USER — set it in .env or export it}"
: "${CLICKHOUSE_PASSWORD:?Missing CLICKHOUSE_PASSWORD — set it in .env or export it}"

if ! command -v otelcol-contrib &>/dev/null; then
  echo "Error: otelcol-contrib not found on PATH."
  echo "Install the OpenTelemetry Collector Contrib distribution:"
  echo "  https://github.com/open-telemetry/opentelemetry-collector-releases/releases"
  exit 1
fi

echo "Starting OTel Collector with config: ${CONFIG}"
echo "OTLP endpoint: http://localhost:4318"
echo "ClickHouse: ${CLICKHOUSE_HOST:-localhost}:9000"

exec otelcol-contrib --config "${CONFIG}"
