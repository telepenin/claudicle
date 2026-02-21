# Project Presentation Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure project presentation — rewrite README as a landing page, create LICENSE + CONTRIBUTING.md + docs/configuration.md, fix package.json metadata.

**Architecture:** No code changes. All work is documentation: rewrite README.md, create 3 new files (LICENSE, CONTRIBUTING.md, docs/configuration.md), update package.json metadata and docs/installation.md.

**Tech Stack:** Markdown, JSON

---

### Task 1: Create LICENSE file

**Files:**
- Create: `LICENSE`

**Step 1: Create MIT LICENSE file**

Create `LICENSE` with the standard MIT license text. Use year 2026, author "Nikolay Telepenin".

```
MIT License

Copyright (c) 2026 Nikolay Telepenin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 2: Commit**

```bash
git add LICENSE
git commit -m "docs: add MIT LICENSE file"
```

---

### Task 2: Fix package.json metadata

**Files:**
- Modify: `package.json` (lines 6-8: keywords, author, license fields)

**Step 1: Update package.json**

Change these three fields:

```json
"keywords": [
  "claude-code",
  "telemetry",
  "opentelemetry",
  "clickhouse",
  "session-viewer",
  "developer-tools",
  "ai-tools",
  "observability"
],
"author": "Nikolay Telepenin",
"license": "MIT",
```

The current values are `"keywords": []`, `"author": ""`, `"license": "ISC"`.

**Step 2: Commit**

```bash
git add package.json
git commit -m "docs: fix license to MIT, add keywords and author to package.json"
```

---

### Task 3: Create docs/configuration.md

This file receives the detailed configuration content being moved out of README: per-project dimensions, Agent SDK usage, env vars, pipeline verification.

**Files:**
- Create: `docs/configuration.md`

**Step 1: Create docs/configuration.md**

Content should include these sections, sourced from the current README (lines 61-109) and docs/installation.md (lines 111-166):

```markdown
# Configuration

## Dashboard Filter Dimensions

The `OTEL_RESOURCE_ATTRIBUTES` environment variable is a comma-separated list of `key=value` pairs that appear as filter dropdowns in the dashboard.

| Key | Description | Example |
|-----|-------------|---------|
| `project` | Project name | `claudicle` |
| `environment` | Environment | `dev`, `ci` |
| `team` | Team name | `platform`, `frontend` |
| `developer` | Developer name | `nikolay` |

Only dimensions with data in ClickHouse appear in the dashboard.

## Per-Project Dimensions

If you run multiple Claude Code instances for different projects, override `OTEL_RESOURCE_ATTRIBUTES` per project using a project-level settings file (`.claude/settings.local.json` in the project root):

` ` `json
{
  "env": {
    "OTEL_RESOURCE_ATTRIBUTES": "project=my-api,team=backend,developer=nikolay"
  }
}
` ` `

The shared telemetry settings (exporters, endpoint) stay in the global `~/.claude/settings.json`. Each terminal's Claude instance picks up the project-level override from its working directory.

## Using with Claude Agent SDK

When using Claude programmatically via the [Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk), pass the same environment variables through the `env` option:

` ` `typescript
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
` ` `

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CLICKHOUSE_USER` | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | ClickHouse password |
| `CLICKHOUSE_DB` | ClickHouse database name (default: `claude_logs`) |
| `CLICKHOUSE_HOST` | ClickHouse host (used by the Next.js app) |

## Configuration Files

| File | Purpose |
|------|---------|
| `.env` | ClickHouse credentials (used by all components) |
| `~/.claude/settings.json` | Claude Code global settings — OTel env vars |
| `configs/otelcol-config.yaml` | OTel Collector pipeline config |

## Verifying the Pipeline

After starting all components and running a Claude Code session:

` ` `bash
# Check OTel events
curl "http://localhost:8123/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=claude_logs" \
  --data-binary "SELECT count() FROM otel_logs WHERE ServiceName = 'claude-code'"

# Check JSONL session logs
curl "http://localhost:8123/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=claude_logs" \
  --data-binary 'SELECT count() FROM mv_jsonl_messages'
` ` `

## Troubleshooting

- **otelcol-contrib not found**: Ensure the binary is on your PATH. See [Installation Guide](installation.md).
- **ClickHouse connection refused**: Verify Docker is running with `docker compose ps`.
- **No data appearing**: Check OTel Collector logs for errors. Ensure `OTEL_EXPORTER_OTLP_ENDPOINT` is set correctly.
- **JSONL logs not ingested**: The filelog receiver tails `~/.claude/projects/**/*.jsonl`. Verify files exist and the collector has read permissions.
- **Dashboard filters not showing**: Dimension dropdowns only appear when data with those resource attributes exists.
```

Note: The triple backticks shown as `` ` ` ` `` above should be proper markdown code fences (``` ) in the actual file.

**Step 2: Commit**

```bash
git add docs/configuration.md
git commit -m "docs: create configuration guide (moved from README)"
```

---

### Task 4: Create CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

**Step 1: Create CONTRIBUTING.md**

```markdown
# Contributing to Claudicle

Thanks for your interest in contributing! Here's how to get started.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) 22+
- [otelcol-contrib](https://github.com/open-telemetry/opentelemetry-collector-releases/releases) (optional, for JSONL session logs)

## Development Setup

1. Fork and clone the repository:

` ` `bash
git clone https://github.com/<your-username>/claudicle.git
cd claudicle
` ` `

2. Install dependencies:

` ` `bash
npm install
` ` `

3. Start the backend services:

` ` `bash
cp .env.example .env
docker compose up -d
` ` `

4. Start the dev server:

` ` `bash
npm run dev
` ` `

Open [http://localhost:3000](http://localhost:3000).

## Running Tests

` ` `bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage
` ` `

## Code Style

- TypeScript strict mode
- ESLint — run `npm run lint` before committing
- Tailwind CSS + shadcn/ui for UI components

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure `npm run lint`, `npm test`, and `npm run build` all pass
4. Open a PR against `main` with a description of your changes

## Reporting Issues

Open an issue on [GitHub Issues](https://github.com/telepenin/claudicle/issues) with:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Docker version, Node.js version)
```

Note: The triple backticks shown as `` ` ` ` `` above should be proper markdown code fences in the actual file.

**Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md"
```

---

### Task 5: Update docs/installation.md

Minor tweaks: add link back to README, remove troubleshooting section (now in docs/configuration.md).

**Files:**
- Modify: `docs/installation.md`

**Step 1: Update docs/installation.md**

Add a note at the top after the heading linking back to the README:

```markdown
# Installation Guide

> See also: [README](../README.md) for a quick overview, [Configuration](configuration.md) for advanced settings.
```

Remove the Troubleshooting section (lines 159-165) — it now lives in `docs/configuration.md`.

Remove the Configuration section (lines 111-128) — it now lives in `docs/configuration.md`.

Remove the Data Pipeline section (lines 130-143) — duplicated in README and configuration guide.

Remove the Verifying the Pipeline section (lines 145-157) — now in `docs/configuration.md`.

Keep everything from Prerequisites through "Browse sessions" (lines 1-109).

**Step 2: Commit**

```bash
git add docs/installation.md
git commit -m "docs: streamline installation guide, link to configuration doc"
```

---

### Task 6: Rewrite README.md

This is the main deliverable. Rewrite as a landing page.

**Files:**
- Modify: `README.md`

**Step 1: Rewrite README.md**

New structure (full content):

```markdown
# Claudicle

[![CI](https://github.com/telepenin/claudicle/actions/workflows/ci.yml/badge.svg)](https://github.com/telepenin/claudicle/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/telepenin/claudicle/graph/badge.svg)](https://codecov.io/gh/telepenin/claudicle)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p align="center">
  <img src="img/claudicle_v2.jpg" alt="Claudicle" />
</p>

**The chronicles of Claude.** Collect and visualize your [Claude Code](https://claude.ai/code) session telemetry — costs, tokens, tool usage, and full conversation transcripts — in a self-hosted web UI.

## Why Claudicle?

Claude Code doesn't show you where your money goes. Claudicle gives you a dashboard for API costs, token trends, and tool performance across sessions. It also captures full conversation transcripts so you can review, search, and export any session — whether you're tracking your own usage or monitoring a team.

<!-- [Live Demo](https://demo.claudicle.dev) | -->
[Installation Guide](docs/installation.md) | [Configuration](docs/configuration.md) | [Contributing](CONTRIBUTING.md)

## Quick Start

` ` `bash
git clone https://github.com/telepenin/claudicle && cd claudicle
cp .env.example .env
docker compose up -d
` ` `

Add to `~/.claude/settings.json`:

` ` `json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
    "OTEL_RESOURCE_ATTRIBUTES": "project=my-project,developer=your-name"
  }
}
` ` `

Open [http://localhost:3000](http://localhost:3000). For full setup details, see the [Installation Guide](docs/installation.md).

## Features

- **Dashboard** — cost and token trends, top models and tools, events by type, filterable by project/environment/team/developer
<!-- ![Dashboard screenshot](img/dashboard.png) -->
- **Session browser** — searchable list with message counts, subagent and error indicators, date range filtering
<!-- ![Session browser screenshot](img/session-browser.png) -->
- **Session detail view** — rendered conversations with rich tool visualizations (diffs, code blocks, search results, MCP tools, nested subagent sessions), live tail for active sessions
<!-- ![Session detail screenshot](img/session-detail.png) -->
- **Session export** — portable `.tar.gz` archives preserving the `~/.claude/projects/` structure, restore and resume on any machine

## Architecture

` ` `
                   ┌──OTLP HTTP──▶  OTel Collector (:4318) ──────────────────────────────┐
Claude Code ───────┤                                                                       ├──▶  ClickHouse  ──▶  Next.js App (:3000)
                   └──JSONL──▶  ~/.claude/projects/*.jsonl  ──▶  OTel Collector (filelog) ┘
` ` `

- **OTel Collector** (otelcol-contrib) — receives OTLP on port 4318 + tails JSONL files, exports to ClickHouse
- **ClickHouse** (Docker) — stores events, metrics, and session logs
- **Next.js App** (Docker) — web UI and API routes

## What Gets Collected

| Source | Data |
|--------|------|
| OTel events | user prompts, tool results (name/duration/success), API requests (model/cost/tokens), errors, tool decisions |
| OTel metrics | token usage, cost, session count, lines of code, commits, PRs, active time |
| JSONL logs (optional) | full conversation transcripts — prompts, responses, thinking blocks, tool I/O |

Run the OTel Collector locally (`./scripts/run-otelcol.sh`) to enable JSONL log collection. See the [Installation Guide](docs/installation.md#5-optional-start-the-otel-collector).

## Roadmap

- Session analysis reports — per-session health dashboards with error timelines, tool success rates, and actionable insights
- Cross-session A/B testing — compare metrics across skill versions, CLAUDE.md configs, and MCP setups
- Self-improving skills — auto-generate improvement recommendations from session analysis
- JSONL redaction — strip sensitive data before ingestion
- [OpenClaw](https://github.com/openclaw/openclaw) support

## Tech Stack

Next.js 16 (App Router) · ClickHouse · OTel Collector · Tailwind CSS · shadcn/ui · recharts

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
```

Note: The triple backticks shown as `` ` ` ` `` above should be proper markdown code fences in the actual file. The `<!-- -->` HTML comments are screenshot placeholders — uncomment and add image paths when screenshots are available.

**Step 2: Verify links resolve**

Check that all relative links in the new README point to existing files:

```bash
ls -la LICENSE CONTRIBUTING.md docs/installation.md docs/configuration.md img/claudicle_v2.jpg
```

Expected: all files exist.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README as landing page, move config details to docs/"
```

---

### Task 7: Update CLAUDE.md if needed

**Files:**
- Modify: `CLAUDE.md` (if any paths/references changed)

**Step 1: Review CLAUDE.md**

Check if any references in CLAUDE.md point to content that moved. The file references `otelcol-config.yaml` — verify this path is still correct (it is: `configs/otelcol-config.yaml` wasn't moved).

No changes needed unless CLAUDE.md references README sections that no longer exist. If all references are still valid, skip this task.

**Step 2: Commit (if changes made)**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md references"
```

---

### Task 8: Document manual GitHub repo settings

**Files:** None (output to terminal only)

**Step 1: Print manual steps for the user**

Output the following for the user to apply manually in GitHub repo settings:

1. **Topics:** `claude-code`, `telemetry`, `opentelemetry`, `clickhouse`, `developer-tools`, `ai`, `observability`, `session-viewer`
2. **Description:** "Collect and visualize Claude Code session telemetry"
3. **Website:** (live demo URL when ready)

These cannot be set via code and must be applied at https://github.com/telepenin/claudicle/settings.
