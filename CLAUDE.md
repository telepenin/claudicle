# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claudicle (Claude + Chronicle) is an open-source tool to collect and visualize Claude Code session telemetry. Docker Compose runs ClickHouse + Next.js App. OTel Collector (otelcol-contrib) runs locally on the host (receives OTLP + tails JSONL files → exports to ClickHouse).

Two data sources:
- **OTel events/metrics** — structured operational data (costs, tokens, tool stats) via Claude Code's built-in OTel export
- **JSONL session logs** — full conversation transcripts (including Claude's responses) from `~/.claude/projects/`

Design docs and implementation plans are in `docs/plans/`.

## Architecture

```
                   ┌──OTLP HTTP──▶  OTel Collector (:4318) ──────────────────────────────┐
Claude Code ───────┤                                                                       ├──▶  ClickHouse  ──▶  Next.js App (:3000)
                   └──JSONL──▶  ~/.claude/projects/*.jsonl  ──▶  OTel Collector (filelog) ┘
```

- **OTel Collector** (local install, otelcol-contrib) — receives OTLP on port 4318 + tails JSONL files, exports both to ClickHouse
- **ClickHouse** (Docker) — canonical OTel schema: `otel_logs` (both OTel events and JSONL), `otel_metrics_*`, `otel_traces`
- **Next.js 16 App** (Docker) — App Router, API routes query ClickHouse via `@clickhouse/client`, frontend uses Tailwind + shadcn/ui

ClickHouse auth via env vars (`CLICKHOUSE_USER`/`CLICKHOUSE_PASSWORD`) in `.env` — no hardcoded defaults, see `.env.example`.

## Commands

```bash
# Start ClickHouse + Next.js app
docker compose up -d

# Start OTel Collector (install otelcol-contrib first)
set -a && source .env && set +a
otelcol-contrib --config cli/configs/otelcol-config.yaml

# Dev server (Next.js, outside Docker)
npm run dev

# Build
npm run build

# Run CLI tests
cd cli && npx vitest run

# Verify pipeline is receiving data (curl is ~200x faster than docker exec)
curl "http://localhost:8123/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=claude_logs" \
  --data-binary 'SELECT count() FROM otel_logs'
```

## CLI Package (`cli/`)

Thin npm installer (`npm install -g claudicle`) that downloads pre-built UI from GitHub Releases. Zero runtime dependencies, ESM, Node.js >= 22.

Resource-first CLI dispatch: `claudicle <resource> <action>` (e.g., `claudicle ui setup`, `claudicle collector status`).

```bash
# UI commands
claudicle ui build --base-path /claudicle   # Build from source with custom base path
claudicle ui update                          # Download latest UI release
claudicle ui install --port 3001 --systemd   # Register as system service
claudicle ui setup --port 3001 --systemd     # Full setup: config + schema + service
claudicle ui start / stop / status           # Manage UI server

# Collector commands
claudicle collector install --systemd        # Install OTel Collector service
claudicle collector setup --systemd          # Full setup: config + schema + service
claudicle collector start / stop / status    # Manage collector service

# Shared commands
claudicle config init                        # Save ClickHouse credentials
claudicle init                               # Initialize ClickHouse schema
```

- `cli/bin/claudicle.js` — entry point, two-level resource dispatch
- `cli/lib/ui/` — UI commands: `build`, `install`, `setup`, `start`, `stop`, `status`, `update`
- `cli/lib/collector/` — collector commands: `install`, `setup`, `start`, `stop`, `status`
- `cli/lib/commands/` — shared top-level commands: `config`, `init`
- `cli/lib/install/` — shared utilities: `service.js`, `platform.js`, `otelcol-config.js`, `collector-downloader.js`
- `cli/lib/config.js` — read/write `~/.claudicle/config.json`, `CLAUDICLE_HOME` env override
- `cli/lib/args.js` — lightweight `--key value` / `--key=value` arg parser
- `cli/lib/clickhouse.js` — ClickHouse HTTP client using native `fetch()`
- `cli/lib/downloader.js` — fetches UI tarball + init.sql from GitHub Releases, caches in `~/.claudicle/versions/{version}/`
- `cli/schema/init.sql` — bundled fallback copy of `clickhouse/init.sql`

**Release workflow** (`.github/workflows/release.yml`): on `v*` tag push → build Next.js standalone → package tarball → create GitHub Release → publish CLI to npm. Requires `NPM_TOKEN` repo secret.

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- OTel Collector (otelcol-contrib) — OTLP receiver + filelog receiver → ClickHouse exporter
- `@clickhouse/client` for ClickHouse queries
- `recharts` for dashboard charts
- Docker Compose for deployment

## Key Data Model

All data lives in the canonical OTel schema table `otel_logs` (auto-created by the ClickHouse exporter).

**OTel events** (`ServiceName = 'claude-code'`) — canonical columns: `Timestamp`, `Body`, `SeverityText`, `LogAttributes` (map), `ResourceAttributes` (map), `ServiceName`. Event types in `LogAttributes['event.name']`: `user_prompt`, `tool_result`, `api_request`, `api_error`, `tool_decision`. Dashboard filters use `ResourceAttributes` keys: `project`, `environment`, `team`, `developer` (set via `OTEL_RESOURCE_ATTRIBUTES`).

**JSONL session logs** (`ResourceAttributes['source'] = 'claude_jsonl'`) — full conversation transcripts. Message type in `LogAttributes['type']`, session ID in `LogAttributes['sessionId']`, raw JSON in `Body`, file path in `ResourceAttributes['log.file.path']`.

## API Routes

- `GET /api/logs` — JSONL session list with message counts (pagination: `page`, `limit`, `search`, `from`, `to`)
- `GET /api/logs/[id]` — full conversation for a JSONL session ordered by timestamp
- `GET /api/logs/[id]/text` — plain-text export of a conversation
- `GET /api/stats` — aggregate stats for dashboard charts (accepts `project`, `environment`, `team`, `developer` query params)
- `GET /api/dimensions` — distinct values for each resource attribute dimension

## Schema Changes

`cli/schema/init.sql` is the full schema for new installs. All statements use `CREATE ... IF NOT EXISTS` so re-running is safe. For changes to existing deployments:

- **New table or MV** — add to `init.sql`. `IF NOT EXISTS` makes it idempotent.
- **Add column** — use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in a numbered migration file. Also update the `CREATE TABLE` in `init.sql` for new installs.
- **Change a materialized view** — MVs can't be altered. Use `DROP VIEW IF EXISTS` + `CREATE MATERIALIZED VIEW ... POPULATE` in a migration file. Do NOT put `DROP` in `init.sql` — it would re-run and re-populate on every setup.

Migrations live in `cli/schema/migrations/` as numbered SQL files (`002.sql`, `003.sql`, ...). The current schema version is tracked in `~/.claudicle/state.json` as `schema_version`. Each migration runs once — the init command applies any migrations with a version higher than the stored `schema_version`.

## Key Source Locations

- `src/lib/clickhouse.ts` — ClickHouse client singleton
- `src/lib/queries.ts` — all ClickHouse queries (OTel events + JSONL sessions)
- `src/lib/types.ts` — shared TypeScript types
- `cli/configs/otelcol-config.yaml` — OTel Collector pipeline config (OTLP + filelog → ClickHouse)
- `docker-compose.yml` — ClickHouse + Next.js app
- `cli/` — npm CLI package (see "CLI Package" section above)
