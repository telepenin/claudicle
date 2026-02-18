# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Log Collection is an open-source tool to collect and visualize Claude Code session telemetry. Docker Compose runs ClickHouse + Next.js App. OTel Collector (otelcol-contrib) runs locally on the host (receives OTLP + tails JSONL files → exports to ClickHouse).

Two data sources:
- **OTel events/metrics** — structured operational data (costs, tokens, tool stats) via Claude Code's built-in OTel export
- **JSONL session logs** — full conversation transcripts (including Claude's responses) from `~/.claude/projects/`

Design docs and implementation plans are in `docs/plans/`.

## Architecture

```
Claude Code  ──OTLP HTTP──▶  OTel Collector (:4318)  ──▶  ClickHouse  ──▶  Next.js App (:3000)
~/.claude/projects/*.jsonl  ──▶  OTel Collector (filelog)  ──▶  ClickHouse
```

- **OTel Collector** (local install, otelcol-contrib) — receives OTLP on port 4318 + tails JSONL files, exports both to ClickHouse
- **ClickHouse** (Docker) — canonical OTel schema: `otel_logs` (both OTel events and JSONL), `otel_metrics_*`, `otel_traces`
- **Next.js 16 App** (Docker) — App Router, API routes query ClickHouse via `@clickhouse/client`, frontend uses Tailwind + shadcn/ui

No PostgreSQL, no custom backend. ClickHouse auth via env vars (`CLICKHOUSE_USER`/`CLICKHOUSE_PASSWORD`, default: `claude`/`claude`).

## Commands

```bash
# Start ClickHouse + Next.js app
docker compose up -d

# Start OTel Collector (install otelcol-contrib first)
./scripts/run-otelcol.sh

# Dev server (Next.js, outside Docker)
npm run dev

# Build
npm run build

# Verify pipeline is receiving data (curl is ~200x faster than docker exec)
curl 'http://localhost:8123/?user=claude&password=claude&database=claude_logs' \
  --data-binary 'SELECT count() FROM otel_logs'
```

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- OTel Collector (otelcol-contrib) — OTLP receiver + filelog receiver → ClickHouse exporter
- `@clickhouse/client` for ClickHouse queries
- `recharts` for dashboard charts
- Docker Compose for deployment

## Key Data Model

All data lives in the canonical OTel schema table `otel_logs` (auto-created by the ClickHouse exporter).

**OTel events** (`ServiceName = 'claude-code'`) — canonical columns: `Timestamp`, `Body`, `SeverityText`, `LogAttributes` (map), `ResourceAttributes` (map), `ServiceName`. Event types in `LogAttributes['event.name']`: `user_prompt`, `tool_result`, `api_request`, `api_error`, `tool_decision`.

**JSONL session logs** (`ResourceAttributes['source'] = 'claude_jsonl'`) — full conversation transcripts. Message type in `LogAttributes['type']`, session ID in `LogAttributes['sessionId']`, raw JSON in `Body`, file path in `ResourceAttributes['log.file.path']`.

## API Routes

- `GET /api/logs` — JSONL session list with message counts (pagination: `page`, `limit`, `search`, `from`, `to`)
- `GET /api/logs/[id]` — full conversation for a JSONL session ordered by timestamp
- `GET /api/logs/[id]/text` — plain-text export of a conversation
- `GET /api/stats` — aggregate stats for dashboard charts

## Key Source Locations

- `src/lib/clickhouse.ts` — ClickHouse client singleton
- `src/lib/queries.ts` — all ClickHouse queries (OTel events + JSONL sessions)
- `src/lib/types.ts` — shared TypeScript types
- `otelcol-config.yaml` — OTel Collector pipeline config (OTLP + filelog → ClickHouse)
- `docker-compose.yml` — ClickHouse + Next.js app
- `scripts/run-otelcol.sh` — start OTel Collector locally
