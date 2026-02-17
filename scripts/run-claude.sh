#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

echo "OTel endpoint: $OTEL_EXPORTER_OTLP_ENDPOINT"
exec claude "$@"
