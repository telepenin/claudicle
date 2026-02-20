#!/usr/bin/env bash
# Migration: Recreate materialized views with performance improvements
#
# Usage: ./clickhouse/migrate-views.sh
#
# Requires CLICKHOUSE_USER and CLICKHOUSE_PASSWORD env vars (or source .env).
# Safe to re-run — drops and recreates all MVs and target tables, then backfills.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

CH="http://localhost:8123/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=claude_logs"

run() {
  local desc="$1"; shift
  printf "  %-45s" "$desc..."
  local out
  if out=$(curl -sf "$CH" --data-binary "$1" 2>&1); then
    echo "OK"
  else
    echo "FAIL"
    echo "$out" >&2
    exit 1
  fi
}

echo "=== Step 1: Drop old views and tables ==="
run "Drop mv_jsonl_messages"  'DROP TABLE IF EXISTS claude_logs.mv_jsonl_messages'
run "Drop mv_jsonl_sessions"  'DROP TABLE IF EXISTS claude_logs.mv_jsonl_sessions'
run "Drop mv_otel_events"     'DROP TABLE IF EXISTS claude_logs.mv_otel_events'
run "Drop jsonl_messages"     'DROP TABLE IF EXISTS claude_logs.jsonl_messages'
run "Drop otel_events"        'DROP TABLE IF EXISTS claude_logs.otel_events'

echo ""
echo "=== Step 2: Create JSONL messages table + MV ==="
run "Create jsonl_messages" '
CREATE TABLE claude_logs.jsonl_messages (
  session_id   String,
  msg_type     LowCardinality(String),
  msg_timestamp DateTime64(9) CODEC(Delta, ZSTD(1)),
  raw          String CODEC(ZSTD(1)),
  file_path    String CODEC(ZSTD(1)),
  is_sidechain UInt8,
  agent_id     String CODEC(ZSTD(1)),
  INDEX idx_file_path file_path TYPE ngrambf_v1(3, 512, 2, 0) GRANULARITY 4
) ENGINE = MergeTree
PARTITION BY toDate(msg_timestamp)
ORDER BY (session_id, msg_timestamp)
SETTINGS index_granularity = 8192'

run "Create mv_jsonl_messages" "
CREATE MATERIALIZED VIEW claude_logs.mv_jsonl_messages
TO claude_logs.jsonl_messages
AS SELECT
  LogAttributes['sessionId']           AS session_id,
  LogAttributes['type']                AS msg_type,
  Timestamp                            AS msg_timestamp,
  Body                                 AS raw,
  ResourceAttributes['log.file.path']  AS file_path,
  LogAttributes['isSidechain'] = 'true' AS is_sidechain,
  LogAttributes['agentId']             AS agent_id
FROM claude_logs.otel_logs
WHERE ResourceAttributes['source'] = 'claude_jsonl'
  AND LogAttributes['sessionId'] != ''"

run "Backfill jsonl_messages" "
INSERT INTO claude_logs.jsonl_messages
SELECT
  LogAttributes['sessionId']           AS session_id,
  LogAttributes['type']                AS msg_type,
  Timestamp                            AS msg_timestamp,
  Body                                 AS raw,
  ResourceAttributes['log.file.path']  AS file_path,
  LogAttributes['isSidechain'] = 'true' AS is_sidechain,
  LogAttributes['agentId']             AS agent_id
FROM claude_logs.otel_logs
WHERE ResourceAttributes['source'] = 'claude_jsonl'
  AND LogAttributes['sessionId'] != ''"

echo ""
echo "=== Step 3: Create JSONL session summaries MV ==="
run "Create mv_jsonl_sessions (with POPULATE)" "
CREATE MATERIALIZED VIEW claude_logs.mv_jsonl_sessions
ENGINE = AggregatingMergeTree
ORDER BY (session_id)
POPULATE
AS SELECT
  LogAttributes['sessionId']          AS session_id,
  minState(Timestamp)                 AS first_ts,
  maxState(Timestamp)                 AS last_ts,
  countState()                        AS message_count,
  countIfState(LogAttributes['type'] = 'user')      AS user_count,
  countIfState(LogAttributes['type'] = 'assistant')  AS assistant_count,
  countIfState(LogAttributes['type'] NOT IN ('user', 'assistant')) AS other_count,
  anyState(ResourceAttributes['log.file.path'])      AS project_path,
  uniqIfState(LogAttributes['agentId'],
    LogAttributes['isSidechain'] = 'true' AND LogAttributes['agentId'] != '') AS subagent_count,
  countIfState(
    LogAttributes['type'] = 'user'
    AND LogAttributes['isSidechain'] != 'true'
    AND (position(Body, '\"is_error\":true') > 0 OR position(Body, '\"is_error\": true') > 0)
  ) AS error_count,
  countIfState(
    LogAttributes['type'] = 'assistant'
    AND position(Body, '\"name\":\"mcp__') > 0
  ) AS mcp_tool_count
FROM claude_logs.otel_logs
WHERE ResourceAttributes['source'] = 'claude_jsonl'
  AND LogAttributes['sessionId'] != ''
GROUP BY LogAttributes['sessionId']"

echo ""
echo "=== Step 4: Create OTel events table + MV ==="
run "Create otel_events" '
CREATE TABLE claude_logs.otel_events (
  ts            DateTime64(9) CODEC(Delta, ZSTD(1)),
  event_name    LowCardinality(String),
  session_id    String,
  model         LowCardinality(String),
  tool_name     LowCardinality(String),
  cost_usd      Float64,
  input_tokens  Float64,
  output_tokens Float64,
  duration_ms   Float64,
  success       LowCardinality(String),
  project       LowCardinality(String),
  environment   LowCardinality(String),
  team          LowCardinality(String),
  developer     LowCardinality(String)
) ENGINE = MergeTree
PARTITION BY toDate(ts)
ORDER BY (event_name, ts)
SETTINGS index_granularity = 8192'

run "Create mv_otel_events" "
CREATE MATERIALIZED VIEW claude_logs.mv_otel_events
TO claude_logs.otel_events
AS SELECT
  Timestamp                                    AS ts,
  LogAttributes['event.name']                  AS event_name,
  LogAttributes['session.id']                  AS session_id,
  LogAttributes['model']                       AS model,
  LogAttributes['tool_name']                   AS tool_name,
  toFloat64OrZero(LogAttributes['cost_usd'])   AS cost_usd,
  toFloat64OrZero(LogAttributes['input_tokens'])  AS input_tokens,
  toFloat64OrZero(LogAttributes['output_tokens']) AS output_tokens,
  toFloat64OrZero(LogAttributes['duration_ms'])   AS duration_ms,
  LogAttributes['success']                     AS success,
  if(ResourceAttributes['project'] = '', 'default', ResourceAttributes['project'])       AS project,
  if(ResourceAttributes['environment'] = '', 'default', ResourceAttributes['environment']) AS environment,
  if(ResourceAttributes['team'] = '', 'default', ResourceAttributes['team'])             AS team,
  if(ResourceAttributes['developer'] = '', 'default', ResourceAttributes['developer'])   AS developer
FROM claude_logs.otel_logs
WHERE ServiceName = 'claude-code'"

run "Backfill otel_events" "
INSERT INTO claude_logs.otel_events
SELECT
  Timestamp                                    AS ts,
  LogAttributes['event.name']                  AS event_name,
  LogAttributes['session.id']                  AS session_id,
  LogAttributes['model']                       AS model,
  LogAttributes['tool_name']                   AS tool_name,
  toFloat64OrZero(LogAttributes['cost_usd'])   AS cost_usd,
  toFloat64OrZero(LogAttributes['input_tokens'])  AS input_tokens,
  toFloat64OrZero(LogAttributes['output_tokens']) AS output_tokens,
  toFloat64OrZero(LogAttributes['duration_ms'])   AS duration_ms,
  LogAttributes['success']                     AS success,
  if(ResourceAttributes['project'] = '', 'default', ResourceAttributes['project'])       AS project,
  if(ResourceAttributes['environment'] = '', 'default', ResourceAttributes['environment']) AS environment,
  if(ResourceAttributes['team'] = '', 'default', ResourceAttributes['team'])             AS team,
  if(ResourceAttributes['developer'] = '', 'default', ResourceAttributes['developer'])   AS developer
FROM claude_logs.otel_logs
WHERE ServiceName = 'claude-code'"

echo ""
echo "=== Done! Verifying tables ==="
curl -s "$CH" --data-binary "SELECT name, engine FROM system.tables WHERE database='claude_logs' AND name IN ('jsonl_messages','mv_jsonl_messages','mv_jsonl_sessions','otel_events','mv_otel_events') ORDER BY name FORMAT Pretty"
