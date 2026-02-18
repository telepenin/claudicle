#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${REPO_DIR}/otelcol-config.yaml"

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
