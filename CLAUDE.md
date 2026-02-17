# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Log Collection is an open-source tool to collect and visualize Claude Code session telemetry. It's a 3-service Docker Compose stack: Vector (receives OTLP + tails JSONL files) → ClickHouse (stores everything) → Next.js App (web UI to browse sessions).

Two data sources:
- **OTel events/metrics** — structured operational data (costs, tokens, tool stats) via Claude Code's built-in OTel export
- **JSONL session logs** — full conversation transcripts (including Claude's responses) from `~/.claude/projects/`

The full design spec is in `PLAN.md`.

## Architecture

```
Claude Code  ──OTLP HTTP/JSON──▶  Vector (:4318)  ──▶  ClickHouse  ──▶  Next.js App (:3000)
~/.claude/projects/*.jsonl  ──▶  Vector (file source)  ──▶  ClickHouse
```

- **Vector** — receives OTLP on port 4318 + tails JSONL files, sinks both to ClickHouse
- **ClickHouse** — stores OTel events in `otel_events`, metrics in `otel_metrics`, JSONL in `session_logs`
- **Next.js 16 App** — App Router, API routes query ClickHouse via `@clickhouse/client`, frontend uses Tailwind + shadcn/ui

No auth, no PostgreSQL, no custom backend.

## Commands

```bash
# Start all services
docker compose up -d

# Dev server (Next.js)
npm run dev

# Build
npm run build

# Verify pipeline is receiving data
docker compose exec clickhouse clickhouse-client -q "SELECT count() FROM claude_logs.otel_events"
```

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- Vector (OTLP source + file source → ClickHouse sink)
- `@clickhouse/client` for ClickHouse queries
- `recharts` for dashboard charts
- Docker Compose for deployment

## Key Data Model

**`otel_events`** — OTel events with `event_name`, `session_id`, `attributes` map. Event types: `claude_code.user_prompt`, `claude_code.tool_result`, `claude_code.api_request`, `claude_code.api_error`, `claude_code.tool_decision`.

**`session_logs`** — raw JSONL lines from `~/.claude/projects/`. Query with `JSONExtractString(raw, 'type')`, `JSONExtractString(raw, 'sessionId')`, etc.

## API Routes

- `GET /api/sessions` — session list grouped by `session.id` with aggregated stats (pagination: `page`, `limit`, `search`, `from`, `to`)
- `GET /api/sessions/[id]` — all events for a session ordered by timestamp
- `GET /api/stats` — aggregate stats for dashboard charts

## Key Source Locations

- `src/lib/clickhouse.ts` — ClickHouse client singleton
- `src/lib/types.ts` — shared TypeScript types
- `src/components/event-cards/` — typed event card components (one per event type)
- `vector.toml` — Vector pipeline config (OTLP + file sources → ClickHouse)
- `docker-compose.yml` — 3-service stack definition
