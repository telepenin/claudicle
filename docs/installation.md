# Installation Guide

> See also: [README](../README.md) for a quick overview, [Configuration](configuration.md) for advanced settings.

Claudicle has three components that are installed in order:

1. **ClickHouse** — the database (one instance, central server)
2. **Claudicle UI** — the web dashboard + schema initialization (same server as ClickHouse)
3. **OTel Collector** — collects telemetry from Claude Code (every machine that runs Claude Code)

```
                        ClickHouse (:8123)
                       ▲       ▲       ▲
                      ╱        │        ╲
                     ╱         │         ╲          Claudicle UI (:3000)
                    ╱          │          ╲              reads ──▶ ClickHouse
   Developer A     Developer B     CI runner
   OTel Collector  OTel Collector  OTel Collector
   + Claude Code   + Claude Code   + Claude Code
```

## Prerequisites

- **Node.js >= 22** (for the `claudicle` CLI)
- **Docker** (for ClickHouse) — or an existing ClickHouse instance

```bash
npm install -g claudicle
```

## Step 1. Install ClickHouse

Run ClickHouse wherever you want your data stored. The simplest option is Docker:

```bash
docker run -d \
  --name clickhouse \
  -p 8123:8123 -p 9000:9000 \
  -e CLICKHOUSE_USER=claude \
  -e CLICKHOUSE_PASSWORD=claude \
  -v clickhouse-data:/var/lib/clickhouse \
  clickhouse/clickhouse-server
```

Verify it's running:

```bash
curl "http://localhost:8123/?user=claude&password=claude" --data-binary 'SELECT 1'
```

> **Already have ClickHouse?** Skip this step — just note the URL, username, and password for the next steps.

## Step 2. Install the UI

Run this on the same server as ClickHouse (or wherever you want the dashboard hosted). This command saves credentials, initializes the ClickHouse schema, and registers the UI as a system service:

```bash
claudicle setup ui --user claude --password claude
```

ClickHouse parameters can also be passed via environment variables instead of flags:

```bash
export CLICKHOUSE_USER=claude
export CLICKHOUSE_PASSWORD=claude
claudicle setup ui
```

Options:
- `--clickhouse-url http://host:8123` / `CLICKHOUSE_URL` — ClickHouse HTTP URL (default: `http://localhost:8123`)
- `--user` / `CLICKHOUSE_USER` — ClickHouse username (required)
- `--password` / `CLICKHOUSE_PASSWORD` — ClickHouse password (required)
- `--database` / `CLICKHOUSE_DB` — ClickHouse database (default: `claude_logs`)
- `--port 3000` — UI port (default: 3000)
- `--systemd` / `--launchd` — force service type (default: auto-detect from OS)

Resolution priority: CLI flags > environment variables > saved env files > defaults.

The UI is now running at [http://localhost:3000](http://localhost:3000) and will auto-start on boot.

### Alternative: manual steps

If you prefer to run each step separately:

```bash
claudicle config init --user claude --password claude
claudicle init          # initialize ClickHouse schema
claudicle start         # start the UI as a foreground process
```

## Step 3. Install the OTel Collector on every node

The OTel Collector must run on **every machine where Claude Code runs**. It receives OTLP telemetry and tails local JSONL session logs, then exports everything to ClickHouse.

```bash
claudicle setup collector \
  --user claude --password claude \
  --clickhouse-url http://your-clickhouse-server:8123
```

Same as with the UI, ClickHouse parameters can be passed via environment variables:

```bash
export CLICKHOUSE_USER=claude
export CLICKHOUSE_PASSWORD=claude
claudicle setup collector --clickhouse-url http://your-clickhouse-server:8123
```

Options:
- `--clickhouse-url http://host:8123` / `CLICKHOUSE_URL` — ClickHouse HTTP URL (required if ClickHouse is remote)
- `--user` / `CLICKHOUSE_USER` — ClickHouse username (required)
- `--password` / `CLICKHOUSE_PASSWORD` — ClickHouse password (required)
- `--database` / `CLICKHOUSE_DB` — ClickHouse database (default: `claude_logs`)
- `--collector-version 0.115.0` — pin a specific collector version (default: latest)
- `--systemd` / `--launchd` — force service type (default: auto-detect from OS)

The collector:
- Listens on **port 4318** (HTTP) for OTLP data from Claude Code
- Tails `~/.claude/projects/**/*.jsonl` for session log files
- Exports everything to ClickHouse

## Step 4. Configure Claude Code

On every machine that runs Claude Code, add the following to `~/.claude/settings.json`:

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
    "OTEL_RESOURCE_ATTRIBUTES": "project=my-project,developer=your-name"
  }
}
```

`OTEL_RESOURCE_ATTRIBUTES` is a comma-separated list of `key=value` pairs that appear as filter dropdowns in the dashboard:

| Key | Description | Example |
|-----|-------------|---------|
| `project` | Project name | `claudicle` |
| `environment` | Environment | `dev`, `ci`, `codespace` |
| `team` | Team name | `platform`, `frontend` |
| `developer` | Developer name | `nikolay` |

Once saved, run `claude` normally — no wrapper script needed.

## Verify the pipeline

Open [http://localhost:3000](http://localhost:3000) to view the dashboard. Start a Claude Code session and you should see data appear within a few seconds.

To check data is flowing into ClickHouse:

```bash
curl "http://localhost:8123/?user=claude&password=claude&database=claude_logs" \
  --data-binary 'SELECT count() FROM otel_logs'
```

## Configuration files

All config is stored in `~/.claudicle/` (override with `CLAUDICLE_HOME`):

| File | Contents |
|------|----------|
| `collector.env` | `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` |
| `ui.env` | `PORT`, `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DB` |
| `state.json` | Install metadata (UI version, collector version) |

## Development setup

For developing Claudicle itself — running all components locally from source.

### 1. Clone and configure

```bash
git clone https://github.com/telepenin/claudicle.git && cd claudicle
cp .env.example .env    # set CLICKHOUSE_USER and CLICKHOUSE_PASSWORD
```

### 2. Start ClickHouse

```bash
docker compose up -d clickhouse
```

### 3. Start the Next.js dev server

```bash
npm install
npm run dev             # dev server on :3000
```

### 4. Install otelcol-contrib

The OTel Collector Contrib distribution is required to collect both OTLP telemetry and JSONL session logs.

**macOS (Homebrew):**

```bash
brew install open-telemetry/opentelemetry-collector/opentelemetry-collector-contrib
```

**Linux (download binary):**

```bash
# Check latest version at https://github.com/open-telemetry/opentelemetry-collector-releases/releases
OTELCOL_VERSION=0.115.0
curl -fSL "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${OTELCOL_VERSION}/otelcol-contrib_${OTELCOL_VERSION}_linux_amd64.tar.gz" | tar xz
sudo mv otelcol-contrib /usr/local/bin/
```

Verify:

```bash
otelcol-contrib --version
```

### 5. Run the OTel Collector

Source credentials from `.env` and run `otelcol-contrib` with the bundled config:

```bash
set -a && source .env && set +a
otelcol-contrib --config cli/configs/otelcol-config.yaml
```

The config (`cli/configs/otelcol-config.yaml`) reads `CLICKHOUSE_USER` and `CLICKHOUSE_PASSWORD` from environment variables and:
- Listens on **port 4318** (HTTP) for OTLP data from Claude Code
- Tails `~/.claude/projects/**/*.jsonl` for session log files
- Exports everything to ClickHouse on `localhost:9000`

### 6. Configure Claude Code to send telemetry

Add to `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318"
  }
}
```

Open [http://localhost:3000](http://localhost:3000) and start a Claude Code session — data should appear within seconds.
