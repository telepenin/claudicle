# claudicle

[![npm version](https://img.shields.io/npm/v/claudicle.svg)](https://www.npmjs.com/package/claudicle)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/telepenin/claudicle/blob/main/LICENSE)

CLI to install and run the [Claudicle](https://github.com/telepenin/claudicle) UI — a self-hosted dashboard for [Claude Code](https://claude.ai/code) session telemetry (costs, tokens, tool usage, conversation transcripts).

## Install

```bash
npm install -g claudicle
```

Requires Node.js >= 22.

## Usage

### Quick Setup

Run a single command to save credentials, initialize the ClickHouse schema, and install a system service:

```bash
# Set up the OTel Collector (receives telemetry from Claude Code)
claudicle setup collector --user claude --password claude

# Or set up the UI server (dashboard)
claudicle setup ui --user claude --password claude
```

All options from the individual commands (`config init`, `init`, `install`) are accepted.

### Save ClickHouse connection parameters

```bash
claudicle config init --user claude --password claude
```

Options:
- `--clickhouse-url http://host:8123` — ClickHouse HTTP URL (default: `http://localhost:8123`)
- `--user` / `--password` — ClickHouse credentials (required)
- `--database` — ClickHouse database (default: `claude_logs`)
- `--port 3000` — UI port (default: 3000)

### Initialize ClickHouse schema

```bash
claudicle init
```

Reads credentials from saved config. You can also pass `--user` and `--password` as overrides.

### Start the UI

```bash
claudicle start
```

Options:
- `--port 3000` — UI port (default: 3000)
- `--clickhouse-url http://host:8123` — ClickHouse HTTP URL
- `--user` / `--password` / `--database` — ClickHouse credentials

### Stop the UI

```bash
claudicle stop
```

### Check status

```bash
claudicle status
```

### Update to latest version

```bash
claudicle update
```

### Install OTel Collector as a system service

Downloads `otelcol-contrib`, generates a config with your ClickHouse credentials, and registers it as a systemd (Linux) or launchd (macOS) service with auto-restart.

```bash
claudicle install collector
```

Options:
- `--collector-version 0.115.0` — pin a specific collector version (default: latest)
- `--systemd` / `--launchd` — force service type (default: auto-detect from OS)

### Install UI as a system service

Registers the UI server as a systemd/launchd service so it starts on boot and auto-restarts.

```bash
claudicle install ui
```

Options:
- `--port 3000` — UI port (default: 3000)
- `--systemd` / `--launchd` — force service type (default: auto-detect from OS)

## How It Works

The CLI is a thin installer (~8 KB). On first `claudicle start`, it downloads a pre-built Next.js standalone bundle from [GitHub Releases](https://github.com/telepenin/claudicle/releases) and caches it in `~/.claudicle/`. The UI runs as a background Node.js process.

## Configuration

Config is stored in env files (`~/.claudicle/collector.env`, `~/.claudicle/ui.env`) and install metadata in `~/.claudicle/state.json`. Override the config directory with the `CLAUDICLE_HOME` environment variable.

## Full Documentation

For the complete setup with Docker Compose, OTel Collector, and JSONL log collection, see the [main repository](https://github.com/telepenin/claudicle).

## License

[MIT](https://github.com/telepenin/claudicle/blob/main/LICENSE)
