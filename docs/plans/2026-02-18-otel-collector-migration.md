# OTel Collector Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Vector with otelcol-contrib using the canonical OTel-ClickHouse schema, unifying both OTLP events and JSONL session logs into a single `otel_logs` table.

**Architecture:** otelcol-contrib runs locally, receives OTLP on :4318 and tails JSONL files via filelog receiver. Both pipelines write to the canonical `otel_logs` table in ClickHouse (auto-created by the exporter). JSONL logs are distinguished by `ResourceAttributes['source'] = 'claude_jsonl'`. ClickHouse stays in Docker. Next.js queries use SQL aliases to map canonical columns back to the existing TypeScript interface.

**Tech Stack:** otelcol-contrib, ClickHouse, Next.js 16, @clickhouse/client, TypeScript

**Pre-existing bugs fixed by this migration:**
- `attributes['cost']` should be `attributes['cost_usd']` (wrong key name)
- `event_name = 'claude_code.api_request'` should be `event_name = 'api_request'` (prefix mismatch)
- Both caused zero results for cost/token stats in the dashboard

---

### Task 1: Install otelcol-contrib binary

**Files:**
- No files changed

**Step 1: Download and install otelcol-contrib**

Run:
```bash
curl --proto '=https' --tlsv1.2 -fOL \
  https://github.com/open-telemetry/opentelemetry-collector-releases/releases/latest/download/otelcol-contrib_0.120.0_darwin_arm64.tar.gz
tar -xvf otelcol-contrib_0.120.0_darwin_arm64.tar.gz
sudo mv otelcol-contrib /usr/local/bin/
rm otelcol-contrib_0.120.0_darwin_arm64.tar.gz
```

Note: Check https://github.com/open-telemetry/opentelemetry-collector-releases/releases for the latest version. Use `darwin_amd64` for Intel Macs.

**Step 2: Verify installation**

Run: `otelcol-contrib --version`
Expected: Version string output

---

### Task 2: Create OTel Collector config

**Files:**
- Create: `otelcol-config.yaml`

**Step 1: Write the collector config**

```yaml
receivers:
  # OTLP receiver for Claude Code telemetry
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

  # Filelog receiver for JSONL session logs
  filelog/sessions:
    include:
      - ${env:HOME}/.claude/projects/**/*.jsonl
    start_at: beginning
    include_file_path: true
    poll_interval: 1s
    operators:
      - type: json_parser
        parse_from: body
        parse_to: attributes
        timestamp:
          parse_from: attributes.timestamp
          layout: "%Y-%m-%dT%H:%M:%S.%L"
          layout_type: strptime

processors:
  batch:
    send_batch_size: 5000
    timeout: 5s

  # Tag JSONL logs with source attribute to distinguish from OTel events
  resource/sessions:
    attributes:
      - key: source
        value: claude_jsonl
        action: insert
      - key: service.name
        value: claude-jsonl
        action: insert

exporters:
  clickhouse:
    endpoint: tcp://127.0.0.1:9000?dial_timeout=10s
    username: ${env:CLICKHOUSE_USER:-claude}
    password: ${env:CLICKHOUSE_PASSWORD:-claude}
    database: claude_logs
    create_schema: true
    async_insert: true
    compress: lz4
    logs_table_name: otel_logs
    traces_table_name: otel_traces
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s

  debug:
    verbosity: basic

service:
  pipelines:
    logs/otel:
      receivers: [otlp]
      processors: [batch]
      exporters: [clickhouse]

    logs/sessions:
      receivers: [filelog/sessions]
      processors: [resource/sessions, batch]
      exporters: [clickhouse]

    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [clickhouse]

    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [clickhouse]

  telemetry:
    logs:
      level: info
```

**Step 2: Validate config syntax**

Run: `otelcol-contrib validate --config otelcol-config.yaml`
Expected: No errors

---

### Task 3: Create scripts/run-otelcol.sh

**Files:**
- Create: `scripts/run-otelcol.sh`

**Step 1: Write the startup script**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${REPO_DIR}/otelcol-config.yaml"

if ! command -v otelcol-contrib &>/dev/null; then
  echo "otelcol-contrib is not installed."
  echo ""
  echo "Install it with:"
  echo "  curl --proto '=https' --tlsv1.2 -fOL \\"
  echo "    https://github.com/open-telemetry/opentelemetry-collector-releases/releases/latest/download/otelcol-contrib_0.120.0_darwin_arm64.tar.gz"
  echo "  tar -xvf otelcol-contrib_*.tar.gz"
  echo "  sudo mv otelcol-contrib /usr/local/bin/"
  echo ""
  echo "  See: https://github.com/open-telemetry/opentelemetry-collector-releases/releases"
  exit 1
fi

echo "Starting OTel Collector with config: ${CONFIG}"
echo "OTLP endpoint: http://localhost:4318"
echo "ClickHouse: ${CLICKHOUSE_HOST:-localhost}:9000"
exec otelcol-contrib --config "${CONFIG}"
```

**Step 2: Make it executable**

Run: `chmod +x scripts/run-otelcol.sh`

---

### Task 4: Update ClickHouse init.sql

**Files:**
- Modify: `clickhouse/init.sql`

The OTel Collector auto-creates `otel_logs` and metric tables via `create_schema: true`. We only need the database creation in init.sql. Drop all three old tables.

**Step 1: Rewrite init.sql**

```sql
-- Database creation (tables auto-managed by OTel Collector exporter)
CREATE DATABASE IF NOT EXISTS claude_logs;

-- The following tables are auto-created by the OTel Collector ClickHouse exporter:
--   claude_logs.otel_logs         (canonical OTel log schema)
--   claude_logs.otel_metrics_*    (gauge, sum, histogram, summary, exp_histogram)
--   claude_logs.otel_traces       (if traces are sent)
--
-- JSONL session logs also go into otel_logs, distinguished by:
--   ResourceAttributes['source'] = 'claude_jsonl'
--
-- See otelcol-config.yaml for the full pipeline configuration.
```

**Step 2: Commit**

```bash
git add otelcol-config.yaml scripts/run-otelcol.sh clickhouse/init.sql
git commit -m "feat: add OTel Collector config, replace Vector pipeline"
```

---

### Task 5: Reset ClickHouse and verify pipeline

**Files:**
- No files changed

**Step 1: Stop existing services**

Run: `docker compose down -v`

**Step 2: Start ClickHouse**

Run: `docker compose up -d`
Wait for healthcheck: `docker compose exec clickhouse clickhouse-client --user claude --password claude -q "SELECT 1"`

**Step 3: Start OTel Collector**

Run: `./scripts/run-otelcol.sh` (in a separate terminal)
Expected: Logs show "Everything is ready" and tables created in ClickHouse

**Step 4: Verify tables were auto-created**

Run:
```bash
docker compose exec clickhouse clickhouse-client --user claude --password claude \
  -q "SHOW TABLES FROM claude_logs"
```
Expected: `otel_logs` and metric tables exist

**Step 5: Verify JSONL data is flowing**

Run:
```bash
docker compose exec clickhouse clickhouse-client --user claude --password claude \
  -q "SELECT count() FROM claude_logs.otel_logs WHERE ResourceAttributes['source'] = 'claude_jsonl'"
```
Expected: Count > 0 (filelog receiver reads existing .jsonl files)

**Step 6: Start a Claude Code session and verify OTel events**

Run: `./scripts/run-claude.sh` and send a prompt, then check:
```bash
docker compose exec clickhouse clickhouse-client --user claude --password claude \
  -q "SELECT Timestamp, LogAttributes['event.name'], Body FROM claude_logs.otel_logs WHERE ServiceName = 'claude-code' ORDER BY Timestamp DESC LIMIT 5"
```
Expected: OTel events visible with event names like `api_request`, `user_prompt`

**Step 7: Inspect canonical schema columns**

Run:
```bash
docker compose exec clickhouse clickhouse-client --user claude --password claude \
  -q "SELECT * FROM claude_logs.otel_logs LIMIT 1 FORMAT Vertical"
```
Expected: Canonical columns (Timestamp, Body, EventName, ServiceName, LogAttributes, ResourceAttributes, ScopeAttributes, etc.)

---

### Task 6: Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

The OtelEvent interface stays structurally the same — queries use SQL aliases to map canonical columns to these field names. Remove unused OtelMetric interface.

**Step 1: Remove OtelMetric, keep OtelEvent unchanged**

In `src/lib/types.ts`, delete the `OtelMetric` interface (lines ~24-38). Keep `OtelEvent` as-is since queries will alias canonical columns to match.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (unless OtelMetric is imported somewhere — check and remove any imports)

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "refactor: remove unused OtelMetric type"
```

---

### Task 7: Update OTel event queries in queries.ts

**Files:**
- Modify: `src/lib/queries.ts`

All queries referencing `otel_events` change to `otel_logs` with canonical column names. SQL aliases map back to the existing TypeScript interfaces. Also fixes pre-existing bugs (wrong attribute keys, wrong event name prefix).

**Step 1: Update getSessionList**

Change the count query (line 47):
```sql
SELECT count(DISTINCT LogAttributes['session.id']) as total
FROM otel_logs
WHERE ServiceName = 'claude-code'
  AND LogAttributes['session.id'] != ''
```

Change the main query (lines 55-83):
```sql
SELECT
  LogAttributes['session.id'] as session_id,
  min(Timestamp) as started_at,
  max(Timestamp) as last_activity,
  count() as event_count,
  sumIf(
    toFloat64OrZero(LogAttributes['cost_usd']),
    LogAttributes['event.name'] = 'api_request'
  ) as total_cost,
  sumIf(
    toFloat64OrZero(LogAttributes['input_tokens']),
    LogAttributes['event.name'] = 'api_request'
  ) as total_input_tokens,
  sumIf(
    toFloat64OrZero(LogAttributes['output_tokens']),
    LogAttributes['event.name'] = 'api_request'
  ) as total_output_tokens,
  anyIf(
    LogAttributes['model'],
    LogAttributes['event.name'] = 'api_request' AND LogAttributes['model'] != ''
  ) as model
FROM otel_logs
WHERE ServiceName = 'claude-code'
  AND LogAttributes['session.id'] != ''
GROUP BY session_id
ORDER BY started_at DESC
LIMIT {limit:UInt32}
OFFSET {offset:UInt32}
```

Update WHERE clause builders:
- `session_id` references → `LogAttributes['session.id']`
- `timestamp` references → `Timestamp`

**Step 2: Update getSessionDetail**

Events query (lines 97-106):
```sql
SELECT
  Timestamp as timestamp,
  LogAttributes['event.name'] as event_name,
  LogAttributes['session.id'] as session_id,
  SeverityText as severity_text,
  Body as message,
  ScopeName as scope_name,
  toUInt64OrZero(LogAttributes['event.sequence']) as event_sequence,
  LogAttributes['user.account_uuid'] as user_account_uuid,
  LogAttributes['organization.id'] as organization_id,
  LogAttributes['terminal.type'] as terminal_type,
  LogAttributes as attributes,
  ServiceName as service_name,
  ResourceAttributes['service.version'] as service_version,
  ResourceAttributes['os.type'] as os_type,
  ResourceAttributes['host.arch'] as host_arch
FROM otel_logs
WHERE LogAttributes['session.id'] = {sessionId:String}
  AND ServiceName = 'claude-code'
ORDER BY Timestamp ASC
```

Summary query (lines 107-136): same pattern as getSessionList main query but filtered by session_id.

**Step 3: Update getStats**

Update all six parallel queries — replace:
- `otel_events` → `otel_logs`
- `session_id` → `LogAttributes['session.id']`
- `attributes['cost']` → `LogAttributes['cost_usd']`
- `attributes['input_tokens']` → `LogAttributes['input_tokens']`
- `attributes['output_tokens']` → `LogAttributes['output_tokens']`
- `attributes['model']` → `LogAttributes['model']`
- `attributes['tool_name']` → `LogAttributes['tool_name']`
- `attributes['duration_ms']` → `LogAttributes['duration_ms']`
- `event_name = 'claude_code.api_request'` → `LogAttributes['event.name'] = 'api_request'`
- `event_name = 'claude_code.tool_result'` → `LogAttributes['event.name'] = 'tool_result'`
- `event_name` (in GROUP BY) → `LogAttributes['event.name']`
- Add `WHERE ServiceName = 'claude-code'` to all queries

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat: update OTel queries for canonical otel_logs schema

Fixes pre-existing bugs: wrong attribute key (cost vs cost_usd)
and wrong event name prefix (claude_code.api_request vs api_request)."
```

---

### Task 8: Update JSONL session log queries

**Files:**
- Modify: `src/lib/queries.ts`

Session logs now come from `otel_logs` filtered by `ResourceAttributes['source'] = 'claude_jsonl'`.

**Step 1: Update getLogSessionList**

Change count query:
```sql
SELECT count(DISTINCT LogAttributes['sessionId']) as total
FROM otel_logs
WHERE ResourceAttributes['source'] = 'claude_jsonl'
  AND LogAttributes['sessionId'] != ''
```

Change main query:
```sql
SELECT
  LogAttributes['sessionId'] as session_id,
  min(Timestamp) as first_timestamp,
  max(Timestamp) as last_timestamp,
  count() as message_count,
  countIf(LogAttributes['type'] = 'user') as user_count,
  countIf(LogAttributes['type'] = 'assistant') as assistant_count,
  countIf(LogAttributes['type'] NOT IN ('user', 'assistant')) as tool_count,
  any(ResourceAttributes['log.file.path']) as project_path
FROM otel_logs
WHERE ResourceAttributes['source'] = 'claude_jsonl'
  AND LogAttributes['sessionId'] != ''
GROUP BY session_id
ORDER BY first_timestamp DESC
LIMIT {limit:UInt32}
OFFSET {offset:UInt32}
```

Update WHERE clause builders:
- `session_id` → `LogAttributes['sessionId']`
- `file` → `ResourceAttributes['log.file.path']`
- `msg_timestamp` → `Timestamp`

**Step 2: Update getLogConversation**

```sql
SELECT
  LogAttributes['sessionId'] as session_id,
  LogAttributes['type'] as msg_type,
  Timestamp as msg_timestamp,
  Body as raw,
  ResourceAttributes['log.file.path'] as file
FROM otel_logs
WHERE ResourceAttributes['source'] = 'claude_jsonl'
  AND LogAttributes['sessionId'] = {sessionId:String}
ORDER BY Timestamp ASC
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat: migrate JSONL session log queries to otel_logs table"
```

---

### Task 9: Fix event card components

**Files:**
- Modify: `src/components/event-cards/api-request-card.tsx`
- Modify: `src/components/event-timeline.tsx`

**Step 1: Fix cost attribute key in api-request-card.tsx**

Line 11: change `event.attributes["cost"]` → `event.attributes["cost_usd"]`

```tsx
const cost = Number(event.attributes["cost_usd"] || 0);
```

**Step 2: Fix event name switch cases in event-timeline.tsx**

Lines 12-21: remove `claude_code.` prefix from all cases:

```tsx
switch (event.event_name) {
  case "user_prompt":
    return <UserPromptCard event={event} />;
  case "tool_result":
    return <ToolResultCard event={event} />;
  case "api_request":
    return <ApiRequestCard event={event} />;
  case "api_error":
    return <ApiErrorCard event={event} />;
  case "tool_decision":
    return <ToolDecisionBadge event={event} />;
  default:
    return <GenericEventCard event={event} />;
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/event-cards/api-request-card.tsx src/components/event-timeline.tsx
git commit -m "fix: correct attribute key (cost_usd) and event name matching (no prefix)"
```

---

### Task 10: Clean up old files and update docs

**Files:**
- Delete: `vector.toml`
- Delete: `scripts/run-vector.sh`
- Modify: `CLAUDE.md`
- Modify: `PLAN.md`

**Step 1: Remove Vector files**

```bash
git rm vector.toml scripts/run-vector.sh
```

**Step 2: Update CLAUDE.md**

Replace Vector references with OTel Collector:
- Architecture diagram: `Vector (:4318)` → `otelcol-contrib (:4318)`
- Commands section: `./scripts/run-vector.sh` → `./scripts/run-otelcol.sh`
- Tech stack: `Vector` → `otelcol-contrib`
- Key data model: update table names and column references
- Key source locations: `vector.toml` → `otelcol-config.yaml`, `scripts/run-vector.sh` → `scripts/run-otelcol.sh`

**Step 3: Update PLAN.md**

Update architecture section to reflect otelcol-contrib instead of Vector.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Vector, update docs for OTel Collector migration"
```

---

### Task 11: End-to-end verification

**Files:**
- No files changed

**Step 1: Start full stack**

```bash
docker compose up -d
./scripts/run-otelcol.sh  # in separate terminal
npm run dev               # in separate terminal
```

**Step 2: Verify dashboard loads at http://localhost:3000**

Expected: Dashboard page loads, charts render (may be empty if no OTel data yet)

**Step 3: Verify JSONL sessions page**

Navigate to the logs/sessions page.
Expected: Session list populated from JSONL data, conversations viewable.

**Step 4: Generate OTel data**

Run: `./scripts/run-claude.sh` and send a test prompt.
Expected: After the prompt completes, new session appears on sessions page with cost, tokens, model info.

**Step 5: Verify stats**

Navigate to the stats/dashboard page.
Expected: Cost, token, model, tool charts show data from the test session.
