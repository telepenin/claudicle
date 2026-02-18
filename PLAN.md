# Claudicle — Open Source

## Context

Claudicle (Claude + Chronicle) — open-source tool to collect and view Claude Code session telemetry. OTel Collector runs locally (receives OTLP + tails JSONL files), exports to ClickHouse (Docker), and a Next.js app provides the web UI. No auth, no custom backend.

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

OTel provides structured operational data (costs, tokens, tool stats) suitable for analytics and monitoring. JSONL provides the full conversation content for session replay. The OTel Collector ingests both into ClickHouse through a single pipeline.

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
│  OTel Collector (local, otelcol-contrib)          │
│  port 4318 (receives OTLP + tails JSONL files)    │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────┐
│  Docker Compose                                    │
│                                                    │
│  ┌──────────────┐    ┌──────────────┐            │
│  │  ClickHouse  │    │  Next.js App │            │
│  │  port 8123   │◀───│  port 3000   │            │
│  │  (stores     │    │  (frontend + │            │
│  │   events,    │    │   API routes)│            │
│  │   sessions)  │    └──────────────┘            │
│  └──────────────┘                                 │
└──────────────────────────────────────────────────┘

Exposed ports:
  4318 — OTel Collector (receives OTLP from Claude Code)
  3000 — Web UI (browse sessions)
```

### User setup (2 steps)

**Step 1**: Start the stack
```bash
git clone https://github.com/telepenin/claudicle
cd claudicle
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

JSONL ingestion is optional — the OTel Collector tails `~/.claude/projects/` for full conversation transcripts.

---

## Data Ingestion — How It Works

### Pipeline 1: OTel events & metrics

1. Claude Code's built-in OTel SDK sends OTLP HTTP/JSON to `http://localhost:4318/v1/logs` and `/v1/metrics`
2. OTel Collector receives it via its `otlp` receiver
3. OTel Collector exports to ClickHouse via the `clickhouse` exporter
4. ClickHouse stores everything in the canonical `otel_logs` table

### Pipeline 2: JSONL session logs

1. OTel Collector tails `~/.claude/projects/**/*.jsonl` via its `filelog` receiver
2. Each line is parsed and exported to ClickHouse `otel_logs` table
3. Raw JSON stored in the `Body` column, queryable via ClickHouse JSON functions

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

### OTel Collector config

See `otelcol-config.yaml` — OTLP receiver + filelog receiver → ClickHouse exporter.

### ClickHouse tables

All data lives in the canonical OTel schema table `otel_logs` (auto-created by the ClickHouse exporter).

**OTel events** (`ServiceName = 'claude-code'`): `Timestamp`, `Body`, `SeverityText`, `LogAttributes` (map), `ResourceAttributes` (map), `ServiceName`.

**JSONL session logs** (`ResourceAttributes['source'] = 'claude_jsonl'`): full conversation transcripts. Message type in `LogAttributes['type']`, session ID in `LogAttributes['sessionId']`, raw JSON in `Body`.

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
| Data pipeline | OTel Collector (otelcol-contrib: OTLP + filelog → ClickHouse) |
| Storage | ClickHouse |
| ClickHouse client | `@clickhouse/client` (Node.js) |
| Deployment | Docker Compose (ClickHouse + Next.js) + local OTel Collector |

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
claudicle/
├── docker-compose.yml
├── otelcol-config.yaml
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
2. Write `docker-compose.yml` (ClickHouse + Next.js app)
3. Write `otelcol-config.yaml` (OTLP receiver + filelog receiver → ClickHouse exporter)
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
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - "8123:8123"
    volumes:
      - clickhouse_data:/var/lib/clickhouse

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

OTel Collector runs locally (not in Docker) via `./scripts/run-otelcol.sh`.

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
- `otelcol-contrib` — OTel Collector (data pipeline with OTLP + filelog receivers)
