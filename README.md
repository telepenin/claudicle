# Claudicle

The chronicles of Claude. Open-source tool to collect and visualize [Claude Code](https://claude.ai/code) session telemetry. Run a Docker Compose stack, point Claude Code's built-in OpenTelemetry export at it, and browse your sessions in a web UI.

## Architecture

```
                   ┌──OTLP HTTP──▶  OTel Collector (:4318) ──────────────────────────────┐
Claude Code ───────┤                                                                       ├──▶  ClickHouse  ──▶  Next.js App (:3000)
                   └──JSONL──▶  ~/.claude/projects/*.jsonl  ──▶  OTel Collector (filelog) ┘
```

- **OTel Collector** (local install, otelcol-contrib) — receives OTLP on port 4318 + tails JSONL files, exports both to ClickHouse
- **ClickHouse** (Docker) — stores OTel events and full session logs
- **Next.js App** (Docker) — web UI and API routes that query ClickHouse

## Quick Start

### 1. Start the stack

```bash
git clone https://github.com/telepenin/claudicle
cd claudicle
cp .env.example .env   # edit credentials if needed
docker compose up -d
```

### 2. Configure Claude Code

Add the following to your `~/.claude/settings.json` to enable telemetry and set your dashboard dimensions:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
    "OTEL_LOG_USER_PROMPTS": "1",
    "OTEL_LOG_TOOL_DETAILS": "1",
    "OTEL_RESOURCE_ATTRIBUTES": "project=my-project,developer=nikolay"
  }
}
```

The `OTEL_RESOURCE_ATTRIBUTES` value is a comma-separated list of `key=value` pairs used as filter dimensions in the dashboard:

| Key | Description | Example |
|-----|-------------|---------|
| `project` | Project name | `claudicle` |
| `environment` | Environment | `dev`, `ci` |
| `team` | Team name | `platform`, `frontend` |
| `developer` | Developer name | `nikolay` |

Once saved, just run `claude` — no wrapper script needed.

### 3. (Optional) Enable full session logs

Run the OTel Collector locally to get full conversation transcripts including Claude's responses:

```bash
./scripts/run-otelcol.sh
```

### 4. Browse sessions

Open [http://localhost:3000](http://localhost:3000).

## What Gets Collected

**OTel events:**

| Event | Data |
|-------|------|
| `claude_code.user_prompt` | prompt text/length |
| `claude_code.tool_result` | tool name, success, duration, parameters |
| `claude_code.api_request` | model, cost, input/output/cache tokens, duration |
| `claude_code.api_error` | model, error, status code |
| `claude_code.tool_decision` | tool name, accept/reject, source |

**OTel metrics:** token usage, cost, session count, lines of code, commits, pull requests, active time.

**JSONL session logs** (optional): full conversation transcripts — user prompts, Claude's text responses, thinking blocks, tool call inputs/outputs.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with cost/token charts and dimension filters |
| `/sessions` | Searchable session list with stats |
| `/sessions/[id]` | Session event timeline with typed event cards |

## Tech Stack

- **Next.js 16** (App Router) — frontend and API routes
- **ClickHouse** — event, metric, and session storage
- **OTel Collector** (otelcol-contrib) — OTLP receiver + filelog receiver → ClickHouse exporter
- **Tailwind CSS** + **shadcn/ui** — UI components
- **recharts** — dashboard charts
- **@clickhouse/client** — ClickHouse queries from Node.js

## Verify the Pipeline

```bash
curl "http://localhost:8123/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=claude_logs" \
  --data-binary 'SELECT count() FROM otel_logs'
```

## License

MIT
