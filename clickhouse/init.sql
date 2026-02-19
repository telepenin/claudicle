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
--
-- NOTE: MVs only capture rows inserted AFTER creation. Use POPULATE to backfill
-- existing data, or run the migration script (clickhouse/migrate-views.sql).

-- MV 1: JSONL conversation messages — fast fetch by session_id
-- Extracts typed columns from Map so queries avoid map deserialization.
-- Includes ALL message types (noise filtering is done by the frontend).
CREATE MATERIALIZED VIEW IF NOT EXISTS claude_logs.mv_jsonl_messages
ENGINE = MergeTree
ORDER BY (session_id, msg_timestamp)
POPULATE
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

-- MV 2: JSONL session summaries — pre-aggregated stats for session list page.
-- Uses AggregatingMergeTree so new inserts merge incrementally.
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
  anyState(ResourceAttributes['log.file.path'])      AS project_path
FROM claude_logs.otel_logs
WHERE ResourceAttributes['source'] = 'claude_jsonl'
  AND LogAttributes['sessionId'] != ''
  AND LogAttributes['type'] IN ('user', 'assistant', 'system')
GROUP BY LogAttributes['sessionId'];
