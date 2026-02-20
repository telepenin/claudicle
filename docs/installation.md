# Installation Guide

## Prerequisites

- **Docker** and **Docker Compose** (for ClickHouse + Next.js app)
- **otelcol-contrib** (OpenTelemetry Collector Contrib distribution) — only needed for JSONL session logs

### Installing otelcol-contrib

Download the latest release from [opentelemetry-collector-releases](https://github.com/open-telemetry/opentelemetry-collector-releases/releases). Choose the `otelcol-contrib` binary for your platform.

On macOS with Homebrew:

```bash
brew install open-telemetry/opentelemetry-collector/opentelemetry-collector-contrib
```

Verify it's on your PATH:

```bash
otelcol-contrib --version
```

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/telepenin/claudicle.git
cd claudicle
```

### 2. Configure credentials

```bash
cp .env.example .env
# Edit .env to set CLICKHOUSE_USER and CLICKHOUSE_PASSWORD
```

All components (Docker Compose, OTel Collector, Next.js app) read from this file. No hardcoded defaults — if `.env` is missing, services will fail with a clear error.

### 3. Start ClickHouse + Next.js app

```bash
docker compose up -d
```

Verify it's running:

```bash
curl "http://localhost:8123/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=claude_logs" \
  --data-binary 'SELECT 1'
```

### 4. Configure Claude Code

Add the following to your `~/.claude/settings.json`:

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

`OTEL_RESOURCE_ATTRIBUTES` is a comma-separated list of `key=value` pairs that appear as filter dropdowns in the dashboard. Supported keys:

| Key | Description | Example |
|-----|-------------|---------|
| `project` | Project name | `claudicle` |
| `environment` | Environment | `dev`, `ci`, `codespace` |
| `team` | Team name | `platform`, `frontend` |
| `developer` | Developer name | `nikolay` |

Only dimensions with data in ClickHouse are shown. Once the settings file is saved, run `claude` normally — no wrapper script needed.

### 5. (Optional) Start the OTel Collector

The OTel Collector enables full conversation transcripts (JSONL session logs). Without it, you still get OTel events and metrics.

```bash
./scripts/run-otelcol.sh
```

The collector:
- Listens on **port 4318** (HTTP) for OTLP data from Claude Code
- Tails `~/.claude/projects/**/*.jsonl` for session log files
- Exports everything to ClickHouse

The collector must run on the same machine as Claude Code (it reads local JSONL files).

### 6. Browse sessions

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

For local development of the Next.js app (outside Docker):

```bash
npm install
npm run dev
```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CLICKHOUSE_USER` | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | ClickHouse password |
| `CLICKHOUSE_DB` | ClickHouse database name (default in `.env.example`: `claude_logs`) |
| `CLICKHOUSE_HOST` | ClickHouse host (used by the Next.js app) |

### Files

| File | Purpose |
|------|---------|
| `.env` | ClickHouse credentials (used by all components) |
| `~/.claude/settings.json` | Claude Code global settings — OTel env vars go here |
| `configs/otelcol-config.yaml` | OTel Collector pipeline config |

## Data Pipeline

```
                   ┌──OTLP HTTP──▶  OTel Collector (:4318) ──────────────────────────────┐
Claude Code ───────┤                                                                       ├──▶  ClickHouse  ──▶  Next.js App (:3000)
                   └──JSONL──▶  ~/.claude/projects/*.jsonl  ──▶  OTel Collector (filelog) ┘
```

Two data sources flow into ClickHouse:

1. **OTel events** — structured operational data (costs, tokens, tool stats) sent by Claude Code via OTLP
2. **JSONL session logs** — full conversation transcripts tailed from `~/.claude/projects/` by the filelog receiver

Both are stored in `claude_logs.otel_logs`. Materialized views (`mv_jsonl_messages`, `mv_jsonl_sessions`) optimize query performance for the session log viewer.

## Verifying the Pipeline

After starting all components and running a Claude Code session:

```bash
# Check OTel events
curl "http://localhost:8123/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=claude_logs" \
  --data-binary "SELECT count() FROM otel_logs WHERE ServiceName = 'claude-code'"

# Check JSONL session logs
curl "http://localhost:8123/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=claude_logs" \
  --data-binary 'SELECT count() FROM mv_jsonl_messages'
```

## Troubleshooting

- **otelcol-contrib not found**: Ensure the binary is on your PATH. See the installation link above.
- **ClickHouse connection refused**: Verify Docker is running with `docker compose ps`.
- **No data appearing**: Check OTel Collector logs for errors. Ensure `OTEL_EXPORTER_OTLP_ENDPOINT` is set correctly in Claude Code.
- **JSONL logs not ingested**: The filelog receiver tails `~/.claude/projects/**/*.jsonl`. Verify files exist at that path and the collector has read permissions.
- **Dashboard filters not showing**: Dimension dropdowns only appear when data with those resource attributes exists. Make sure you launched Claude with `CLAUDE_*` env vars via `scripts/run-claude.sh`.
