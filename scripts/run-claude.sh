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

# Build OTEL_RESOURCE_ATTRIBUTES from CLAUDE_* dimension env vars for dashboard filtering.
_dims=""
[ -n "${CLAUDE_PROJECT:-}" ]     && _dims="${_dims:+$_dims,}project=${CLAUDE_PROJECT}"
[ -n "${CLAUDE_ENVIRONMENT:-}" ] && _dims="${_dims:+$_dims,}environment=${CLAUDE_ENVIRONMENT}"
[ -n "${CLAUDE_TEAM:-}" ]        && _dims="${_dims:+$_dims,}team=${CLAUDE_TEAM}"
[ -n "${CLAUDE_DEVELOPER:-}" ]   && _dims="${_dims:+$_dims,}developer=${CLAUDE_DEVELOPER}"

if [ -n "$_dims" ]; then
  export OTEL_RESOURCE_ATTRIBUTES="${OTEL_RESOURCE_ATTRIBUTES:+$OTEL_RESOURCE_ATTRIBUTES,}${_dims}"
fi

echo "OTel endpoint: $OTEL_EXPORTER_OTLP_ENDPOINT"
echo "Project:     ${CLAUDE_PROJECT:-<not set>}"
echo "Environment: ${CLAUDE_ENVIRONMENT:-<not set>}"
echo "Team:        ${CLAUDE_TEAM:-<not set>}"
echo "Developer:   ${CLAUDE_DEVELOPER:-<not set>}"
exec claude "$@"
