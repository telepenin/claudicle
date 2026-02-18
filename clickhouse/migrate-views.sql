-- Migration: Create materialized views for JSONL data
-- Run with: curl 'http://localhost:8123/?user=claude&password=claude&database=claude_logs' --data-binary @clickhouse/migrate-views.sql
--
-- Safe to re-run — uses IF NOT EXISTS. If views already exist and you want
-- to recreate them (e.g. after schema change), DROP first:
--   DROP TABLE IF EXISTS claude_logs.mv_jsonl_messages;
--   DROP TABLE IF EXISTS claude_logs.mv_jsonl_sessions;

-- MV 1: Conversation messages sorted by (session_id, timestamp)
-- Extracts typed columns from Map. Includes all message types.
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

-- MV 2: Session summaries (incremental aggregation)
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
