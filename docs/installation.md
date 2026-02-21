# Installation Guide

> See also: [README](../README.md) for a quick overview, [Configuration](configuration.md) for advanced settings.

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
