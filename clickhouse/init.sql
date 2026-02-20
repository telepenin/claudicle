-- Database creation
CREATE DATABASE IF NOT EXISTS claude_logs;

-- Pre-create otel_logs so materialized views below can reference it.
-- Schema matches what the OTel Collector ClickHouse exporter auto-creates
-- (create_schema: true), so the collector will reuse this table.
CREATE TABLE IF NOT EXISTS claude_logs.otel_logs (
     Timestamp DateTime64(9) CODEC(Delta, ZSTD(1)),
     TimestampTime DateTime DEFAULT toDateTime(Timestamp),
     TraceId String CODEC(ZSTD(1)),
     SpanId String CODEC(ZSTD(1)),
     TraceFlags UInt32 CODEC(ZSTD(1)),
     SeverityText LowCardinality(String) CODEC(ZSTD(1)),
     SeverityNumber Int32 CODEC(ZSTD(1)),
     ServiceName LowCardinality(String) CODEC(ZSTD(1)),
     Body String CODEC(ZSTD(1)),
     ResourceSchemaUrl String CODEC(ZSTD(1)),
     ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
     ScopeSchemaUrl String CODEC(ZSTD(1)),
     ScopeName String CODEC(ZSTD(1)),
     ScopeVersion String CODEC(ZSTD(1)),
     ScopeAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
     LogAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1))
) ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (ServiceName, SeverityText, toUnixTimestamp(Timestamp), TraceId)
TTL toDateTime(Timestamp) + toIntervalDay(180)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;

-- JSONL session logs also go into otel_logs, distinguished by:
--   ResourceAttributes['source'] = 'claude_jsonl'
--
-- See otelcol-config.yaml for the full pipeline configuration.

-- ─── Materialized Views ──────────────────────────────────────────────────
--
-- The OTel Collector auto-creates otel_logs with ORDER BY (ServiceName, TimestampTime, Timestamp).
-- That primary key is wrong for our access patterns — we filter by sessionId, not ServiceName.
-- These MVs extract typed columns and re-order data for the actual query paths.

-- ─── JSONL Messages ─────────────────────────────────────────────────────
-- Explicit target table with ngrambf skip index on file_path for substring
-- searches (getSessionFiles uses LIKE '%uuid%'). Partitioned by date.
CREATE TABLE IF NOT EXISTS claude_logs.jsonl_messages (
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
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS claude_logs.mv_jsonl_messages
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
  AND LogAttributes['sessionId'] != '';

-- ─── JSONL Session Summaries ────────────────────────────────────────────
-- Pre-aggregated stats for the session list page.
-- Includes subagent, error, and MCP tool counts so the fast path needs
-- only one query instead of a separate full scan.
-- No type filter — counts ALL messages for accurate totals.
CREATE MATERIALIZED VIEW IF NOT EXISTS claude_logs.mv_jsonl_sessions
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
  -- Subagent count: unique agent IDs from sidechain messages
  uniqIfState(LogAttributes['agentId'],
    LogAttributes['isSidechain'] = 'true' AND LogAttributes['agentId'] != '') AS subagent_count,
  -- Error count: user messages on main chain with is_error flag
  countIfState(
    LogAttributes['type'] = 'user'
    AND LogAttributes['isSidechain'] != 'true'
    AND (position(Body, '"is_error":true') > 0 OR position(Body, '"is_error": true') > 0)
  ) AS error_count,
  -- MCP tool count: assistant messages containing mcp__ tool calls
  countIfState(
    LogAttributes['type'] = 'assistant'
    AND position(Body, '"name":"mcp__') > 0
  ) AS mcp_tool_count
FROM claude_logs.otel_logs
WHERE ResourceAttributes['source'] = 'claude_jsonl'
  AND LogAttributes['sessionId'] != ''
GROUP BY LogAttributes['sessionId'];

-- ─── OTel Events (dashboard) ───────────────────────────────────────────
-- Typed columns extracted from the generic Map fields for dashboard queries.
-- Avoids Map deserialization on every read.
CREATE TABLE IF NOT EXISTS claude_logs.otel_events (
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
  -- dimension attributes for filtering
  project       LowCardinality(String),
  environment   LowCardinality(String),
  team          LowCardinality(String),
  developer     LowCardinality(String)
) ENGINE = MergeTree
PARTITION BY toDate(ts)
ORDER BY (event_name, ts)
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS claude_logs.mv_otel_events
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
WHERE ServiceName = 'claude-code';
