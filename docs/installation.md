# Installation Guide

## Prerequisites

- **Docker** and **Docker Compose** (for ClickHouse)
- **Node.js** 18+ and **npm** (for the Next.js app)
- **otelcol-contrib** (OpenTelemetry Collector Contrib distribution)

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

### 2. Start ClickHouse

```bash
docker compose up -d
```

This starts ClickHouse with default credentials (`claude`/`claude`) and creates the `claude_logs` database with materialized views for JSONL session data.

Verify it's running:

```bash
docker compose exec clickhouse clickhouse-client \
  --user claude --password claude \
  -q "SELECT 1"
```

### 3. Start the OTel Collector

```bash
./scripts/run-otelcol.sh
```

The collector:
- Listens on **port 4318** (HTTP) and **4317** (gRPC) for OTLP data from Claude Code
- Tails `~/.claude/projects/**/*.jsonl` for session log files
- Exports everything to ClickHouse

The collector must run on the same machine as Claude Code (it reads local JSONL files).

### 4. Configure Claude Code

Enable OpenTelemetry export in Claude Code by adding to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "env": {
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318"
  }
}
```

Or export the environment variable before running Claude Code:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### 5. Start the Next.js app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLICKHOUSE_USER` | `claude` | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | `claude` | ClickHouse password |
| `CLICKHOUSE_DB` | `claude_logs` | ClickHouse database name |
| `CLICKHOUSE_HOST` | `localhost` | ClickHouse host (used by the Next.js app) |

### Credentials

All components read credentials from a single `.env` file in the project root. Copy the example and edit as needed:

```bash
cp .env.example .env
```

Docker Compose, the OTel Collector script, and the Next.js app all read from this file. No hardcoded defaults — if `.env` is missing, services will fail with a clear error.

## Data Pipeline

```
Claude Code  ──OTLP HTTP──▶  OTel Collector (:4318)  ──▶  ClickHouse (:9000)  ──▶  Next.js App (:3000)
~/.claude/projects/*.jsonl  ──▶  OTel Collector (filelog)  ──▶  ClickHouse
```

Two data sources flow into ClickHouse:

1. **OTel events** — structured operational data (costs, tokens, tool stats) sent by Claude Code via OTLP
2. **JSONL session logs** — full conversation transcripts tailed from `~/.claude/projects/` by the filelog receiver

Both are stored in `claude_logs.otel_logs`. Materialized views (`mv_jsonl_messages`, `mv_jsonl_sessions`) optimize query performance for the session log viewer.

## Verifying the Pipeline

After starting all components and running a Claude Code session:

```bash
# Check OTel events
docker compose exec clickhouse clickhouse-client \
  --user claude --password claude \
  -q "SELECT count() FROM claude_logs.otel_logs WHERE ServiceName = 'claude-code'"

# Check JSONL session logs
docker compose exec clickhouse clickhouse-client \
  --user claude --password claude \
  -q "SELECT count() FROM claude_logs.mv_jsonl_messages"
```

## Troubleshooting

- **otelcol-contrib not found**: Ensure the binary is on your PATH. See the installation link above.
- **ClickHouse connection refused**: Verify Docker is running with `docker compose ps`.
- **No data appearing**: Check OTel Collector logs for errors. Ensure `OTEL_EXPORTER_OTLP_ENDPOINT` is set correctly in Claude Code.
- **JSONL logs not ingested**: The filelog receiver tails `~/.claude/projects/**/*.jsonl`. Verify files exist at that path and the collector has read permissions.
