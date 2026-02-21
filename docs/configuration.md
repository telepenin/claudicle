# Configuration

This guide covers advanced configuration for Claudicle. For initial setup, see the [Installation Guide](installation.md).

## Dashboard Filter Dimensions

The `OTEL_RESOURCE_ATTRIBUTES` environment variable is a comma-separated list of `key=value` pairs that Claude Code sends with every telemetry event. Claudicle reads these attributes and renders them as filter dropdowns in the dashboard.

Set the variable in your `~/.claude/settings.json`:

```json
{
  "env": {
    "OTEL_RESOURCE_ATTRIBUTES": "project=my-project,team=platform,developer=nikolay"
  }
}
```

Supported keys:

| Key | Description | Example |
|-----|-------------|---------|
| `project` | Project name | `claudicle` |
| `environment` | Deployment environment | `dev`, `ci`, `codespace` |
| `team` | Team name | `platform`, `frontend` |
| `developer` | Developer name | `nikolay` |

Only dimensions that have data in ClickHouse appear as filter dropdowns. If you set `team=backend` but no events have been ingested with that attribute yet, the dropdown won't show until data arrives.

## Per-Project Dimensions

If you work on multiple projects, you can override `OTEL_RESOURCE_ATTRIBUTES` per project using a `.claude/settings.local.json` file in the project root:

```json
{
  "env": {
    "OTEL_RESOURCE_ATTRIBUTES": "project=my-api,team=backend,developer=nikolay"
  }
}
```

The shared telemetry settings (exporters, endpoint, protocol) stay in the global `~/.claude/settings.json`. Each terminal's Claude instance picks up the project-level override from its working directory. This lets you filter by project in the Claudicle dashboard while keeping a single collector configuration.

## Using with Claude Agent SDK

When using Claude programmatically via the [Agent SDK docs](https://docs.anthropic.com/en/docs/claude-code/sdk), pass the same environment variables through the `env` option:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Fix the bug in auth.py",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    env: {
      CLAUDE_CODE_ENABLE_TELEMETRY: "1",
      OTEL_LOGS_EXPORTER: "otlp",
      OTEL_METRICS_EXPORTER: "otlp",
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      OTEL_RESOURCE_ATTRIBUTES: "project=my-project,team=platform",
    },
  },
})) {
  console.log(message);
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLICKHOUSE_USER` | ClickHouse username | *(required)* |
| `CLICKHOUSE_PASSWORD` | ClickHouse password | *(required)* |
| `CLICKHOUSE_DB` | ClickHouse database name | `claude_logs` |
| `CLICKHOUSE_HOST` | ClickHouse host (used by the Next.js app) | `localhost` |

All components (Docker Compose, OTel Collector, Next.js app) read from the `.env` file. See `.env.example` for a starting template.

## Configuration Files

| File | Purpose |
|------|---------|
| `.env` | ClickHouse credentials, shared by all components |
| `~/.claude/settings.json` | Claude Code global settings -- OTel env vars and resource attributes go here |
| `configs/otelcol-config.yaml` | OTel Collector pipeline config (OTLP receiver, filelog receiver, ClickHouse exporter) |

## Verifying the Pipeline

After starting all components and running a Claude Code session, check that data is flowing:

```bash
# Check OTel events
curl "http://localhost:8123/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=claude_logs" \
  --data-binary "SELECT count() FROM otel_logs WHERE ServiceName = 'claude-code'"
```

```bash
# Check JSONL session logs
curl "http://localhost:8123/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=claude_logs" \
  --data-binary 'SELECT count() FROM mv_jsonl_messages'
```

## Troubleshooting

- **otelcol-contrib not found** -- ensure the binary is on your PATH. See the [Installation Guide](installation.md) for download and install instructions.
- **ClickHouse connection refused** -- verify Docker is running with `docker compose ps`. Check that ports 8123 and 9000 are not occupied by another process.
- **No data appearing** -- check OTel Collector logs for errors. Ensure `OTEL_EXPORTER_OTLP_ENDPOINT` is set to `http://localhost:4318` in your Claude Code settings.
- **JSONL logs not ingested** -- the filelog receiver tails `~/.claude/projects/**/*.jsonl`. Verify files exist at that path and the collector has read permissions.
- **Dashboard filters not showing** -- dimension dropdowns only appear when data with those resource attributes exists in ClickHouse. Run a Claude Code session with `OTEL_RESOURCE_ATTRIBUTES` set, then refresh the dashboard.
