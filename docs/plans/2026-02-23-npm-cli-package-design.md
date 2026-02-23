# Claudicle npm CLI Package — Design

**Date:** 2026-02-23
**Status:** Approved

## Problem

Claudicle currently requires cloning the repo and running Docker Compose. Users who run ClickHouse on a separate node (or already have ClickHouse) need a lightweight way to install just the UI and initialize the schema remotely.

## Approach

**Thin CLI on npm + artifacts on GitHub Releases.** The npm package (`claudicle`, ~1MB) is a CLI that downloads the pre-built UI from GitHub Releases on first start. ClickHouse schema is fetched from the release and run via HTTP API.

## Package Structure

```
npm package: claudicle (~1MB)
├── bin/claudicle.js          ← CLI entry point
├── lib/
│   ├── commands/
│   │   ├── init.js           ← fetch + run init.sql against ClickHouse
│   │   ├── start.js          ← download UI if needed, start server.js
│   │   ├── stop.js           ← kill running server
│   │   └── update.js         ← download latest UI version
│   ├── downloader.js         ← fetch tarball from GitHub Releases
│   ├── config.js             ← read/write ~/.claudicle/config.json
│   └── clickhouse.js         ← run SQL against ClickHouse (HTTP API)
├── schema/
│   └── init.sql              ← bundled fallback copy
└── package.json
```

## CLI Commands

```bash
claudicle init --clickhouse-url http://host:8123 --user claude --password claude
claudicle start [--port 3000] [--clickhouse-url http://host:8123]
claudicle stop
claudicle update
claudicle status
```

## Artifact Flow

### GitHub Release (per tag v*)

- `claudicle-ui-v1.2.0.tar.gz` — pre-built Next.js standalone output (.next/standalone + public + .next/static)
- `init.sql` — ClickHouse schema

### `claudicle init`

1. Fetch `init.sql` from `https://github.com/telepenin/claudicle/releases/download/v{version}/init.sql`
2. Fallback: use bundled `schema/init.sql`
3. POST SQL to ClickHouse HTTP API (`http://host:8123/`)

### `claudicle start`

1. Check `~/.claudicle/versions/{version}/` exists
2. If not: download `claudicle-ui-v{version}.tar.gz` from GitHub Releases
3. Extract to `~/.claudicle/versions/{version}/`
4. Spawn: `node ~/.claudicle/versions/{version}/server.js` (detached, with env vars)
5. Write PID to `~/.claudicle/claudicle.pid`

### `claudicle stop`

1. Read `~/.claudicle/claudicle.pid`
2. Kill process

### `claudicle update`

1. Check latest release via GitHub API
2. Download new tarball if newer version available
3. Extract to `~/.claudicle/versions/{new-version}/`
4. Update `~/.claudicle/config.json` version

## Local Cache (`~/.claudicle/`)

```
~/.claudicle/
├── versions/
│   ├── 1.1.0/          ← older version (can be cleaned up)
│   └── 1.2.0/          ← current
│       ├── server.js
│       ├── .next/
│       └── public/
├── config.json          ← saved connection params + current version
├── claudicle.pid        ← running server PID
└── init.sql             ← cached schema
```

## Config Persistence (`~/.claudicle/config.json`)

```json
{
  "clickhouse": {
    "url": "http://node-a:8123",
    "user": "claude",
    "password": "claude",
    "database": "claude_logs"
  },
  "ui": {
    "port": 3000
  },
  "version": "1.2.0"
}
```

Once configured, subsequent commands don't need flags.

## GitHub Actions

### Release workflow (on tag `v*`)

1. `npm ci && npm run build`
2. Tar the standalone output → upload `claudicle-ui-v{tag}.tar.gz` to GitHub Release
3. Copy `clickhouse/init.sql` to the release
4. `npm publish` the CLI package (from `cli/` directory or a separate package.json)

### Existing CI — unchanged

## Dependencies

Minimal to keep package tiny:
- `tar` extraction: use `node:child_process` to call system `tar`, or lightweight `tar` npm package
- ClickHouse HTTP: native `fetch()` (Node.js 22 built-in)
- GitHub API: native `fetch()`
- CLI argument parsing: lightweight lib or manual `process.argv` parsing

No `@clickhouse/client`, no `next`, no heavy deps.

## Monorepo Consideration

The CLI package needs its own `package.json` (different from the Next.js app). Two options:

1. **`cli/` subdirectory** with its own `package.json` — published as `claudicle` on npm
2. **Root `package.json` changes** to add `bin` field and CLI entry point

Option 1 is cleaner — the CLI is a separate concern from the Next.js app.
