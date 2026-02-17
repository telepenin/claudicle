# Design: Migrate from Vector to OTel Collector with Canonical Schema

**Date:** 2026-02-17
**Status:** Approved

## Context

The current pipeline uses Vector to receive OTLP data and tail JSONL files, with a custom ClickHouse schema. Vector's OTLP HTTP source only supports protobuf (not JSON), and the custom schema lacks indexes, codecs, and diverges from the industry-standard OTel-ClickHouse schema. The `otel_metrics` table is populated but never queried by the frontend.

## Decision

Replace Vector with `otelcol-contrib` (OpenTelemetry Collector) running as a local binary. Adopt the canonical OTel-ClickHouse schema for logs and metrics. Add materialized views for fast dashboard queries.

## Architecture

```
Claude Code ──OTLP/protobuf──> otelcol-contrib (:4318) ──> ClickHouse (canonical schema)
~/.claude/projects/**/*.jsonl ──> otelcol-contrib (filelog) ──> ClickHouse (session_logs)
```

- **otelcol-contrib** (local binary) replaces Vector entirely
- **ClickHouse** (Docker) unchanged — still the only Docker service
- **Next.js App** unchanged architecturally — queries and types updated

## ClickHouse Schema

### Canonical tables (auto-created by OTel Collector exporter)

- `otel_logs` — canonical OTel log schema with `LogAttributes`, `ResourceAttributes`, `ScopeAttributes` maps, bloom filter indexes, ZSTD codecs, daily partitioning
- `otel_metrics_gauge`, `otel_metrics_sum`, `otel_metrics_histogram`, etc. — separate table per metric type

### Custom tables (managed in init.sql)

- `session_logs` — kept as-is for JSONL data (not OTel-structured)

### Materialized views (managed in init.sql)

1. **`session_summaries`** — per-session aggregation from `otel_logs`: cost, tokens, model, event count, time range. Used by session list and detail endpoints.
2. **`daily_stats`** — daily rollups from `otel_logs`: cost, tokens, model counts, tool counts. Used by dashboard charts.

## OTel Collector Config

New file: `otelcol-config.yaml` (replaces `vector.toml`)

### Receivers
- `otlp` — HTTP on :4318, gRPC on :4317
- `filelog` — tails `~/.claude/projects/**/*.jsonl`, extracts `session_id`, `msg_type`, `msg_timestamp` via JSON parsing

### Processors
- `batch` — batches inserts for efficiency

### Exporters
- `clickhouse` — auto-DDL for `otel_logs` and metric tables; `session_logs` uses custom DDL from init.sql

## Query Layer Changes

### Table/column mapping

| Current | New |
|---------|-----|
| `otel_events` | `otel_logs` |
| `attributes['cost']` | `LogAttributes['cost_usd']` |
| `attributes['model']` | `LogAttributes['model']` |
| `attributes['input_tokens']` | `LogAttributes['input_tokens']` |
| `attributes['output_tokens']` | `LogAttributes['output_tokens']` |
| `attributes['tool_name']` | `LogAttributes['tool_name']` |
| `attributes['duration_ms']` | `LogAttributes['duration_ms']` |
| `session_id` (top-level column) | `LogAttributes['session.id']` |
| `event_name` (top-level column) | `LogAttributes['event.name']` |
| `event_sequence` (top-level column) | `LogAttributes['event.sequence']` |

### Query strategy
- Session list → query `session_summaries` MV
- Session detail summary → query `session_summaries` MV
- Session detail events → query `otel_logs` with `LogAttributes['session.id']` filter
- Dashboard stats → query `daily_stats` MV + `session_summaries` MV
- Log sessions/conversations → unchanged (still query `session_logs`)

## Types Changes

`src/lib/types.ts`:
- `OtelEvent` interface updated to canonical column names
- `OtelMetric` interface removed (unused by frontend)
- `SessionSummary` kept (populated from MV)

## Files Changed

| Action | File |
|--------|------|
| Add | `otelcol-config.yaml` |
| Add | `scripts/run-otelcol.sh` |
| Update | `clickhouse/init.sql` (drop old tables, add MVs, keep session_logs) |
| Update | `src/lib/queries.ts` (all queries) |
| Update | `src/lib/types.ts` (OtelEvent interface) |
| Update | `src/components/event-cards/*.tsx` (attribute key names) |
| Update | `src/components/event-timeline.tsx` (field names) |
| Update | `docker-compose.yml` (remove init.sql mount if OTel Collector handles DDL, or keep for MVs + session_logs) |
| Update | `CLAUDE.md` + `PLAN.md` (documentation) |
| Delete | `vector.toml` |
| Delete | `scripts/run-vector.sh` |

## What Stays the Same

- `docker-compose.yml` — still just ClickHouse
- `scripts/run-claude.sh` + `scripts/.env.local` — unchanged
- All API route file structure — same endpoints
- All frontend component structure — same components, updated attribute keys
- `src/lib/clickhouse.ts` — unchanged (still connects to `claude_logs` database)
