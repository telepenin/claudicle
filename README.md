# Claude Log Collection

Open-source tool to collect and visualize [Claude Code](https://claude.ai/code) session telemetry. Run a Docker Compose stack, point Claude Code's built-in OpenTelemetry export at it, and browse your sessions in a web UI.

## Architecture

```
Claude Code  ──OTLP HTTP/JSON──▶  Vector (:4318)  ──▶  ClickHouse  ──▶  Next.js App (:3000)
~/.claude/projects/*.jsonl  ──▶  Vector (file source)  ──▶  ClickHouse
```

Three services via Docker Compose:

- **Vector** — receives OTLP on port 4318 + tails JSONL session logs, sinks both to ClickHouse
- **ClickHouse** — stores OTel events, metrics, and full session logs
- **Next.js App** — web UI and API routes that query ClickHouse

## Quick Start

### 1. Start the stack

```bash
git clone https://github.com/you/claude-log-collection
cd claude-log-collection
docker compose up -d
```

### 2. Configure Claude Code

Add these environment variables before starting Claude Code:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_LOG_USER_PROMPTS=1
export OTEL_LOG_TOOL_DETAILS=1
```

### 3. (Optional) Enable full session logs

Mount your Claude Code session logs into the Vector container to get full conversation transcripts including Claude's responses:

```yaml
# In docker-compose.yml, uncomment:
volumes:
  - ~/.claude/projects:/data/claude-projects:ro
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
| `/` | Dashboard with recent sessions, cost and token charts |
| `/sessions` | Searchable session list with stats |
| `/sessions/[id]` | Session event timeline with typed event cards |

## Tech Stack

- **Next.js 16** (App Router) — frontend and API routes
- **ClickHouse** — event, metric, and session storage
- **Vector** — data pipeline (OTLP + file sources → ClickHouse)
- **Tailwind CSS** + **shadcn/ui** — UI components
- **recharts** — dashboard charts
- **@clickhouse/client** — ClickHouse queries from Node.js

## Verify the Pipeline

```bash
docker compose exec clickhouse clickhouse-client \
  -q "SELECT count() FROM claude_logs.otel_events"
```

## License

MIT
