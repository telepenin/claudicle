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

### Initialize ClickHouse schema

```bash
claudicle init --clickhouse-url http://your-host:8123 --user claude --password claude
```

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

## How It Works

The CLI is a thin installer (~8 KB). On first `claudicle start`, it downloads a pre-built Next.js standalone bundle from [GitHub Releases](https://github.com/telepenin/claudicle/releases) and caches it in `~/.claudicle/`. The UI runs as a background Node.js process.

## Configuration

Config is stored in `~/.claudicle/config.json`. You can override the config directory with the `CLAUDICLE_HOME` environment variable.

## Full Documentation

For the complete setup with Docker Compose, OTel Collector, and JSONL log collection, see the [main repository](https://github.com/telepenin/claudicle).

## License

[MIT](https://github.com/telepenin/claudicle/blob/main/LICENSE)
