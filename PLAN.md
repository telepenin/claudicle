# Claude Log Collection — Open Source

## Context

Open-source tool to collect and view Claude Code session telemetry. Users run a Docker Compose stack (3 services), configure Claude Code's built-in OTel export, and get a web UI to browse sessions. No auth, no custom backend — just Vector + ClickHouse + Next.js frontend.

### Two data sources

**1. OTel events & metrics** (via Claude Code's built-in OTel export):

Events (via `OTEL_LOGS_EXPORTER`):
- `claude_code.user_prompt` — prompt text (if `OTEL_LOG_USER_PROMPTS=1`), prompt length
- `claude_code.tool_result` — tool name, success, duration_ms, tool_parameters
- `claude_code.api_request` — model, cost_usd, input/output/cache tokens, duration_ms
- `claude_code.api_error` — model, error, status_code
- `claude_code.tool_decision` — tool name, accept/reject, source

Metrics (via `OTEL_METRICS_EXPORTER`):
- `claude_code.token.usage`, `claude_code.cost.usage`, `claude_code.session.count`, `claude_code.lines_of_code.count`, `claude_code.commit.count`, `claude_code.pull_request.count`, `claude_code.active_time.total`

All data carries `session.id`, `user.account_uuid`, `organization.id`, `terminal.type`.

**2. JSONL session logs** (from `~/.claude/projects/`):

Full conversation transcripts including Claude's text responses, thinking blocks, tool call inputs/outputs, file snapshots. Each session is a `.jsonl` file with linked events via `parentUuid`.

### Why both?

OTel provides structured operational data (costs, tokens, tool stats) suitable for analytics and monitoring. JSONL provides the full conversation content for session replay. Vector ingests both into ClickHouse through a single pipeline.

---

## Architecture

```
┌─────────────────┐
│   Claude Code    │  OTel env vars:
│   (developer's   │    OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
│    machine)      │    OTEL_EXPORTER_OTLP_PROTOCOL=http/json
└────────┬────────┘
         │
         │  OTLP HTTP/JSON          JSONL files
         │  POST /v1/logs           ~/.claude/projects/**/*.jsonl
         │  POST /v1/metrics
         ▼                          │
┌──────────────────────────────────────────────────┐
│  Docker Compose (3 services)                      │
│                                                    │
│  ┌───────────────┐    ┌──────────────┐            │
│  │    Vector      │───→│  ClickHouse  │            │
│  │  port 4318     │    │  port 9000   │            │
│  │  (OTLP source  │    │  (stores     │            │
│  │   + file source │    │   events,   │            │
│  │   for JSONL)   │    │   metrics,  │            │
│  └───────────────┘    │   sessions)  │            │
│                        └──────┬───────┘            │
│                               │                     │
│                               │ HTTP queries        │
│                               ▼                     │
│                        ┌──────────────┐            │
│                        │  Next.js App │            │
│                        │  port 3000   │            │
│                        │  (frontend + │            │
│                        │   API routes │            │
│                        │   that query │            │
│                        │   ClickHouse)│            │
│                        └──────────────┘            │
└──────────────────────────────────────────────────┘

Exposed ports:
  4318 — Vector (receives OTLP from Claude Code)
  3000 — Web UI (browse sessions)
```

### User setup (2 steps)

**Step 1**: Start the stack
```bash
git clone https://github.com/you/claude-log-collection
cd claude-log-collection
docker compose up -d
```

**Step 2**: Configure Claude Code
```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_LOG_USER_PROMPTS=1
export OTEL_LOG_TOOL_DETAILS=1
```

Then open `http://localhost:3000` to view sessions.

JSONL ingestion is optional — mount `~/.claude/projects/` into the Vector container to also get full conversation transcripts.

---

## Data Ingestion — How It Works

### Pipeline 1: OTel events & metrics

1. Claude Code's built-in OTel SDK sends OTLP HTTP/JSON to `http://localhost:4318/v1/logs` and `/v1/metrics`
2. Vector receives it via its `opentelemetry` source
3. Vector batches and sinks to ClickHouse via the `clickhouse` sink
4. ClickHouse stores events in `otel_events` table and metrics in `otel_metrics` table

### Pipeline 2: JSONL session logs

1. User mounts `~/.claude/projects/` into the Vector container
2. Vector tails `**/*.jsonl` files via its `file` source
3. Each line is parsed as JSON and sunk to ClickHouse `session_logs` table
4. Raw JSON stored as-is in a String column, queryable via ClickHouse JSON functions

### What Claude Code sends (OTLP JSON example)

```json
{
  "resourceLogs": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "claude-code"}},
        {"key": "service.version", "value": {"stringValue": "1.0.33"}},
        {"key": "os.type", "value": {"stringValue": "darwin"}}
      ]
    },
    "scopeLogs": [{
      "scope": {"name": "com.anthropic.claude_code"},
      "logRecords": [{
        "timeUnixNano": "1708185600000000000",
        "body": {"stringValue": ""},
        "attributes": [
          {"key": "event.name", "value": {"stringValue": "claude_code.tool_result"}},
          {"key": "session.id", "value": {"stringValue": "abc-123-def"}},
          {"key": "tool_name", "value": {"stringValue": "Bash"}},
          {"key": "success", "value": {"stringValue": "true"}},
          {"key": "duration_ms", "value": {"intValue": "1523"}}
        ]
      }]
    }]
  }]
}
```

### Vector config

```toml
# vector.toml

# --- Sources ---

[sources.otel]
type = "opentelemetry"
grpc.address = "0.0.0.0:4317"
http.address = "0.0.0.0:4318"

[sources.jsonl_logs]
type = "file"
include = ["/data/claude-projects/**/*.jsonl"]
read_from = "beginning"

# --- Sinks ---

[sinks.clickhouse_otel]
type = "clickhouse"
inputs = ["otel"]
endpoint = "http://clickhouse:8123"
database = "claude_logs"
table = "otel_events"

[sinks.clickhouse_sessions]
type = "clickhouse"
inputs = ["jsonl_logs"]
endpoint = "http://clickhouse:8123"
database = "claude_logs"
table = "session_logs"
```

### ClickHouse tables

**`otel_events`** — OTel events (from OTLP):
| Column | Type | Contents |
|--------|------|----------|
| timestamp | DateTime64(9) | Event time |
| event_name | String | `claude_code.user_prompt`, `claude_code.tool_result`, etc. |
| session_id | String | Session identifier |
| attributes | Map(String, String) | All event attributes |
| resource | Map(String, String) | `service.name`, `os.type`, etc. |

**`otel_metrics`** — OTel metrics (from OTLP):
| Column | Type | Contents |
|--------|------|----------|
| timestamp | DateTime64(9) | Metric time |
| metric_name | String | `claude_code.token.usage`, `claude_code.cost.usage`, etc. |
| value | Float64 | Metric value |
| attributes | Map(String, String) | `session.id`, `type`, `model` |

**`session_logs`** — full conversation logs (from JSONL):
| Column | Type | Contents |
|--------|------|----------|
| timestamp | DateTime64(3) | Insertion time |
| raw | String | Raw JSON line from JSONL file |
| file | String | Source file path |

Query JSONL data with ClickHouse JSON functions:
```sql
SELECT
  JSONExtractString(raw, 'type') AS msg_type,
  JSONExtractString(raw, 'sessionId') AS session_id,
  JSONExtractString(raw, 'timestamp') AS ts
FROM claude_logs.session_logs
WHERE JSONExtractString(raw, 'type') = 'assistant';
```

### How the frontend queries ClickHouse

Next.js API routes use `@clickhouse/client` to query directly:

```sql
-- Session list (from OTel events)
SELECT
  attributes['session.id'] AS session_id,
  min(timestamp) AS started_at,
  max(timestamp) AS last_activity,
  count() AS event_count,
  sumIf(toFloat64OrZero(attributes['cost_usd']),
    event_name = 'claude_code.api_request') AS total_cost,
  sumIf(toUInt64OrZero(attributes['input_tokens']),
    event_name = 'claude_code.api_request') AS total_input_tokens,
  anyIf(attributes['model'],
    event_name = 'claude_code.api_request') AS model
FROM claude_logs.otel_events
GROUP BY session_id
ORDER BY last_activity DESC
LIMIT 20 OFFSET 0;

-- Session detail (from OTel events)
SELECT timestamp, event_name, attributes
FROM claude_logs.otel_events
WHERE attributes['session.id'] = {session_id:String}
ORDER BY timestamp ASC;
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend + API | Next.js 16 (App Router), Tailwind CSS, shadcn/ui |
| Data pipeline | Vector (OTLP source + file source → ClickHouse sink) |
| Storage | ClickHouse |
| ClickHouse client | `@clickhouse/client` (Node.js) |
| Deployment | Docker Compose (3 services) |

No PostgreSQL, no auth, no custom backend.

---

## API Endpoints (Next.js API Routes)

| Endpoint | Description |
|----------|-------------|
| `GET /api/sessions` | Query ClickHouse `otel_events` grouped by `session.id`. Returns session list with stats. Query params: `page`, `limit`, `search`, `from`, `to`. |
| `GET /api/sessions/[id]` | All events for a session, ordered by timestamp. |
| `GET /api/stats` | Aggregate stats for dashboard: cost over time, tokens, session count. |

---

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard: recent sessions, cost/token summary charts |
| `/sessions` | Searchable, filterable session list table |
| `/sessions/[id]` | Session event timeline (the core view) |

### Session Event Timeline (core view)

Vertical timeline of events for a session:
- **User Prompt** — blue card with prompt text (or prompt_length if text not available)
- **Tool Result** — green/red card with tool name, parameters, duration, success/failure
- **API Request** — gray card with model, tokens (input/output/cache), cost, duration
- **API Error** — red card with error, status code
- **Tool Decision** — small inline badge showing accept/reject with source

Each card shows timestamp. Events ordered chronologically.

---

## Project Structure

```
claude-log-collection/
├── docker-compose.yml
├── vector.toml
├── Dockerfile                            # Next.js app
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                      # Dashboard
│   │   ├── sessions/
│   │   │   ├── page.tsx                  # Session list
│   │   │   └── [id]/page.tsx             # Session timeline
│   │   └── api/
│   │       ├── sessions/
│   │       │   ├── route.ts              # GET session list
│   │       │   └── [id]/route.ts         # GET session detail
│   │       └── stats/route.ts            # GET dashboard stats
│   ├── lib/
│   │   ├── clickhouse.ts                 # ClickHouse client singleton
│   │   └── types.ts                      # TypeScript types
│   └── components/
│       ├── ui/                           # shadcn/ui base components
│       ├── session-list.tsx
│       ├── event-timeline.tsx
│       ├── event-cards/
│       │   ├── user-prompt-card.tsx
│       │   ├── tool-result-card.tsx
│       │   ├── api-request-card.tsx
│       │   ├── api-error-card.tsx
│       │   └── tool-decision-badge.tsx
│       └── stats-charts.tsx
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## Implementation Phases

### Phase 1: Infrastructure + Pipeline
1. Init Next.js project (TypeScript, Tailwind, App Router)
2. Write `docker-compose.yml` (3 services: app, vector, clickhouse)
3. Write `vector.toml` (opentelemetry source + file source → clickhouse sink)
4. Write `Dockerfile` for Next.js app
5. Create ClickHouse tables (`otel_events`, `otel_metrics`, `session_logs`)
6. Implement `src/lib/clickhouse.ts` — ClickHouse client wrapper
7. Boot up, configure Claude Code, run a test session
8. Verify data in ClickHouse: `SELECT count() FROM claude_logs.otel_events`

### Phase 2: Session List
1. `GET /api/sessions` — query ClickHouse, group by session.id, aggregate stats
2. Session list page with table (columns: session ID, model, events, cost, tokens, timestamps)
3. Pagination + search by session ID

### Phase 3: Session Timeline
1. `GET /api/sessions/[id]` — fetch all events for a session
2. Event timeline component with typed cards per event kind
3. Event card components (UserPromptCard, ToolResultCard, ApiRequestCard, ApiErrorCard, ToolDecisionBadge)

### Phase 4: Dashboard + Polish
1. `GET /api/stats` — aggregate queries for charts
2. Dashboard page with cost/token/session summary
3. README with setup instructions, screenshots
4. Polish UI, loading states, empty states

---

## Docker Compose

```yaml
services:
  vector:
    image: timberio/vector:latest-alpine
    ports:
      - "4318:4318"     # OTLP HTTP — Claude Code sends data here
    volumes:
      - ./vector.toml:/etc/vector/vector.toml
      # Optional: mount JSONL logs for full conversation ingestion
      # - ~/.claude/projects:/data/claude-projects:ro
    depends_on:
      - clickhouse

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    volumes:
      - clickhouse_data:/var/lib/clickhouse
    # Internal only — queried by the app

  app:
    build: .
    ports:
      - "3000:3000"     # Web UI
    environment:
      CLICKHOUSE_URL: http://clickhouse:8123
    depends_on:
      - clickhouse

volumes:
  clickhouse_data:
```

---

## Verification

1. **Pipeline**: `docker compose up` → set Claude Code env vars → run a Claude session → check ClickHouse: `docker compose exec clickhouse clickhouse-client -q "SELECT count() FROM claude_logs.otel_events"`
2. **Session list**: Open `http://localhost:3000/sessions` → sessions appear with stats
3. **Session timeline**: Click a session → events render chronologically with correct details
4. **Multiple sessions**: Run 2-3 Claude sessions → all appear separately in the list

---

## Key Dependencies

- `@clickhouse/client` — ClickHouse Node.js client
- `tailwindcss` + `shadcn/ui` — UI components
- `recharts` — dashboard charts
- `timberio/vector` — Docker image (data pipeline with OTLP + file sources)
