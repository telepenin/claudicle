---
name: clickhouse-analysis
description: Use when needing to query, debug, or analyze data in this project's ClickHouse database — connection issues, data exploration, writing queries against otel_logs, checking pipeline health, or investigating session/event data
---

# ClickHouse Analysis

## Overview

This project stores all Claude Code telemetry in a single ClickHouse table `otel_logs` using the canonical OTel schema. Two data sources share this table, distinguished by attributes.

## Connection

```bash
# Preferred: curl via HTTP interface (~200x faster than docker exec)
curl 'http://localhost:8123/?user=claude&password=claude&database=claude_logs' \
  --data-binary 'SELECT count() FROM otel_logs'

# For multi-line / complex queries, use a heredoc:
curl 'http://localhost:8123/?user=claude&password=claude&database=claude_logs' \
  --data-binary @- <<'SQL'
SELECT session_id, count() AS cnt
FROM mv_jsonl_messages
GROUP BY session_id
ORDER BY cnt DESC
LIMIT 5
SQL
```

**Defaults:** user=`claude`, password=`claude`, database=`claude_logs`, HTTP port=`8123`.

> **Why not `docker exec`?** Spawning a process inside the container adds ~2s overhead per query. curl to localhost:8123 hits ClickHouse's HTTP interface directly — same results in ~10ms.

## Schema: `otel_logs`

Auto-created by the OTel Collector ClickHouse exporter. Key columns:

| Column | Type | Description |
|--------|------|-------------|
| `Timestamp` | DateTime64(9) | Event timestamp (nanosecond precision) |
| `Body` | String | Event body / raw JSON |
| `SeverityText` | String | Log severity level |
| `ServiceName` | String | `claude-code` (OTel) or `claude-jsonl` (JSONL) |
| `ScopeName` | String | OTel scope name |
| `LogAttributes` | Map(String, String) | Event-level attributes (flat key-value) |
| `ResourceAttributes` | Map(String, String) | Resource-level attributes |

## Two Data Sources

```
OTel events:  ServiceName = 'claude-code'
JSONL logs:   ResourceAttributes['source'] = 'claude_jsonl'
```

### OTel Events (structured telemetry)

Event type in `LogAttributes['event.name']`:

| event.name | Description | Key attributes |
|------------|-------------|----------------|
| `user_prompt` | User message | `message` |
| `api_request` | LLM API call | `model`, `cost_usd`, `input_tokens`, `output_tokens`, `duration_ms` |
| `api_error` | API failure | `error`, `status_code` |
| `tool_decision` | Tool selection | `tool_name` |
| `tool_result` | Tool execution | `tool_name`, `duration_ms`, `error` |

Other useful OTel LogAttributes: `session.id`, `event.sequence`, `user.account_uuid`, `organization.id`, `terminal.type`.

ResourceAttributes: `service.version`, `os.type`, `host.arch`.

### JSONL Session Logs (full conversation transcripts)

| LogAttribute | Description |
|--------------|-------------|
| `sessionId` | Session identifier |
| `type` | Message type: `user`, `assistant`, `tool_use`, `tool_result`, etc. |

ResourceAttributes: `source` = `claude_jsonl`, `service.name` = `claude-jsonl`.

LogAttributes also contains `log.file.path` = original JSONL file path (set by filelog receiver, also copied to ResourceAttributes via transform processor).

Full message JSON is in `Body`.

## Common Queries

### Health check — is data flowing?

```sql
SELECT ServiceName, count(), max(Timestamp)
FROM otel_logs
GROUP BY ServiceName;
```

### Recent sessions with cost

```sql
SELECT
  LogAttributes['session.id'] AS session_id,
  min(Timestamp) AS started,
  max(Timestamp) AS ended,
  count() AS events,
  sum(toFloat64OrZero(LogAttributes['cost_usd'])) AS cost_usd,
  sum(toFloat64OrZero(LogAttributes['input_tokens'])) AS input_tok,
  sum(toFloat64OrZero(LogAttributes['output_tokens'])) AS output_tok
FROM otel_logs
WHERE ServiceName = 'claude-code'
  AND LogAttributes['session.id'] != ''
GROUP BY session_id
ORDER BY started DESC
LIMIT 10;
```

### Cost by model (last 7 days)

```sql
SELECT
  LogAttributes['model'] AS model,
  count() AS requests,
  sum(toFloat64OrZero(LogAttributes['cost_usd'])) AS total_cost,
  avg(toFloat64OrZero(LogAttributes['duration_ms'])) AS avg_latency_ms
FROM otel_logs
WHERE ServiceName = 'claude-code'
  AND LogAttributes['event.name'] = 'api_request'
  AND Timestamp >= now() - INTERVAL 7 DAY
GROUP BY model
ORDER BY total_cost DESC;
```

### Top tools by usage

```sql
SELECT
  LogAttributes['tool_name'] AS tool,
  count() AS invocations,
  avg(toFloat64OrZero(LogAttributes['duration_ms'])) AS avg_ms,
  countIf(LogAttributes['error'] != '') AS errors
FROM otel_logs
WHERE ServiceName = 'claude-code'
  AND LogAttributes['event.name'] = 'tool_result'
GROUP BY tool
ORDER BY invocations DESC
LIMIT 20;
```

### API errors

```sql
SELECT
  Timestamp,
  LogAttributes['session.id'] AS session_id,
  LogAttributes['error'] AS error,
  LogAttributes['status_code'] AS status,
  LogAttributes['model'] AS model
FROM otel_logs
WHERE ServiceName = 'claude-code'
  AND LogAttributes['event.name'] = 'api_error'
ORDER BY Timestamp DESC
LIMIT 20;
```

### Daily cost trend

```sql
SELECT
  toDate(Timestamp) AS day,
  count() AS api_calls,
  sum(toFloat64OrZero(LogAttributes['cost_usd'])) AS cost
FROM otel_logs
WHERE ServiceName = 'claude-code'
  AND LogAttributes['event.name'] = 'api_request'
  AND Timestamp >= now() - INTERVAL 30 DAY
GROUP BY day
ORDER BY day;
```

### JSONL session conversation

```sql
SELECT
  LogAttributes['type'] AS msg_type,
  Timestamp,
  substring(Body, 1, 200) AS preview
FROM otel_logs
WHERE ResourceAttributes['source'] = 'claude_jsonl'
  AND LogAttributes['sessionId'] = '{SESSION_ID}'
ORDER BY Timestamp ASC;
```

### JSONL sessions by project

```sql
SELECT
  LogAttributes['sessionId'] AS session_id,
  any(ResourceAttributes['log.file.path']) AS project,
  count() AS messages,
  min(Timestamp) AS first_msg,
  max(Timestamp) AS last_msg
FROM otel_logs
WHERE ResourceAttributes['source'] = 'claude_jsonl'
GROUP BY session_id
ORDER BY first_msg DESC
LIMIT 20;
```

## Query Patterns

- **Map access:** `LogAttributes['key']` — all values are strings, cast with `toFloat64OrZero()`, `toUInt64OrZero()`, etc.
- **Parameterized queries** (in `@clickhouse/client`): use `{name:Type}` syntax, e.g. `{sessionId:String}`, `{limit:UInt32}`.
- **Filter OTel events:** `WHERE ServiceName = 'claude-code' AND LogAttributes['event.name'] = '...'`
- **Filter JSONL logs:** `WHERE ResourceAttributes['source'] = 'claude_jsonl'`
- **Costs/tokens are strings** in the map — always wrap: `toFloat64OrZero(LogAttributes['cost_usd'])`.

## Common Mistakes

- Querying without `ServiceName` filter — mixes OTel events and JSONL logs unintentionally.
- Forgetting `toFloat64OrZero()` on numeric LogAttributes — they're stored as strings in the Map.
- Using `LogAttributes['sessionId']` for OTel events — OTel uses `LogAttributes['session.id']` (with dot). JSONL uses `LogAttributes['sessionId']` (no dot).
- Reading `log.file.path` from `ResourceAttributes` — the filelog receiver stores it in `LogAttributes['log.file.path']`. A transform processor copies it to ResourceAttributes, but prefer `LogAttributes` for reliability.
- Using `docker compose exec clickhouse clickhouse-client` for ad-hoc queries — adds ~2s overhead per query. Use `curl localhost:8123` instead.
