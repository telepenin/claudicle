# Project Presentation Overhaul — Design

**Date:** 2026-02-21
**Status:** Approved

## Problem

The README is comprehensive but reads like a manual rather than a landing page. Missing: LICENSE file, CONTRIBUTING.md, demo visuals, proper package.json metadata. License mismatch (README says MIT, package.json says ISC).

## Audience

Both individual developers tracking personal Claude Code usage and engineering teams needing aggregate visibility.

## Approach

**"Landing Page README"** — restructure README as a scannable first impression, move detailed configuration to `docs/`.

## README Structure

```
# Claudicle
one-liner tagline + badges row (CI, codecov, license)

hero image

## Why Claudicle?
2-3 sentence value prop

[Live Demo](placeholder) | [Installation Guide](docs/installation.md) | [Contributing](CONTRIBUTING.md)

## Quick Start
3-step: clone → docker compose up → configure Claude Code
Link to full installation guide

## Features
4 short bullet points with screenshot placeholders:
- Dashboard
- Session browser
- Session detail view
- Session export

## Architecture
ASCII diagram + 3-bullet component summary

## What Gets Collected
Compact tables (OTel events, metrics, JSONL)

## Roadmap
Brief list

## Contributing
Paragraph + link to CONTRIBUTING.md

## License
MIT
```

### Key changes from current README
- Per-project config, Agent SDK usage, dimension tables, pipeline verification → moved to `docs/configuration.md`
- Features tightened from long descriptions to scannable bullets
- Demo link placeholder for live site (to be provided later)
- Screenshot placeholders for dashboard/session views

## New and Updated Files

| File | Action | Content |
|------|--------|---------|
| `README.md` | **Rewrite** | Landing page structure above |
| `LICENSE` | **Create** | MIT license |
| `CONTRIBUTING.md` | **Create** | Dev setup, PR process, code style, issue templates |
| `docs/configuration.md` | **Create** | Per-project dimensions, Agent SDK, env vars, verification |
| `docs/installation.md` | **Update** | Minor tweaks, link back to README |
| `package.json` | **Update** | license → "MIT", add keywords + author |

## Package.json Updates

```json
{
  "license": "MIT",
  "author": "Nikolay Telepenin",
  "keywords": [
    "claude-code", "telemetry", "opentelemetry", "clickhouse",
    "session-viewer", "developer-tools", "ai-tools", "observability"
  ]
}
```

## CONTRIBUTING.md Outline

- Prerequisites (Docker, Node.js, otelcol-contrib)
- Development setup (fork, clone, npm install, docker compose up)
- Running tests (npm test)
- Code style (ESLint, TypeScript strict)
- PR process (branch naming, commit messages, CI must pass)
- Reporting issues

## GitHub Repo Settings (Manual)

- **Topics:** claude-code, telemetry, opentelemetry, clickhouse, developer-tools, ai, observability, session-viewer
- **Description:** "Collect and visualize Claude Code session telemetry"
- **Website:** live demo URL (when ready)
