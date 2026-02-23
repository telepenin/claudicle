# Claudicle npm CLI Package — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a thin npm CLI package (`claudicle`) that downloads the pre-built UI from GitHub Releases and manages ClickHouse schema initialization.

**Architecture:** Separate `cli/` directory with its own `package.json`, published as `claudicle` on npm. Zero heavy deps — uses native `fetch()` for HTTP, system `tar` for extraction. GitHub Actions release workflow builds the UI tarball and publishes the CLI.

**Tech Stack:** Node.js 22 (ESM), native fetch, system tar, vitest for tests

---

### Task 1: Scaffold cli/ directory with package.json

**Files:**
- Create: `cli/package.json`
- Create: `cli/bin/claudicle.js`

**Step 1: Write the test**

No test for scaffolding — just create the files.

**Step 2: Create cli/package.json**

```json
{
  "name": "claudicle",
  "version": "1.0.0",
  "description": "CLI to install and run the Claudicle UI for Claude Code session telemetry",
  "type": "module",
  "bin": {
    "claudicle": "./bin/claudicle.js"
  },
  "files": [
    "bin/",
    "lib/",
    "schema/"
  ],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": [
    "claude-code",
    "telemetry",
    "opentelemetry",
    "clickhouse",
    "cli"
  ],
  "author": "Nikolay Telepenin",
  "license": "MIT",
  "engines": {
    "node": ">=22"
  },
  "devDependencies": {
    "vitest": "^4.0.18"
  }
}
```

**Step 3: Create cli/bin/claudicle.js**

```js
#!/usr/bin/env node

const command = process.argv[2];

const commands = {
  init: () => import("../lib/commands/init.js"),
  start: () => import("../lib/commands/start.js"),
  stop: () => import("../lib/commands/stop.js"),
  update: () => import("../lib/commands/update.js"),
  status: () => import("../lib/commands/status.js"),
};

if (!command || !commands[command]) {
  console.log(`claudicle — Claude Code session telemetry UI

Usage:
  claudicle init     Initialize ClickHouse schema
  claudicle start    Start the UI server
  claudicle stop     Stop the UI server
  claudicle update   Update to latest version
  claudicle status   Show version and server status

Options (for init/start):
  --clickhouse-url <url>   ClickHouse HTTP URL (default: http://localhost:8123)
  --user <user>            ClickHouse username
  --password <password>    ClickHouse password
  --database <db>          ClickHouse database (default: claude_logs)
  --port <port>            UI server port (default: 3000)`);
  process.exit(command ? 1 : 0);
}

const mod = await commands[command]();
await mod.run(process.argv.slice(3));
```

**Step 4: Commit**

```bash
git add cli/package.json cli/bin/claudicle.js
git commit -m "feat(cli): scaffold cli/ directory with package.json and entry point"
```

---

### Task 2: Config module — read/write ~/.claudicle/config.json

**Files:**
- Create: `cli/lib/config.js`
- Create: `cli/lib/config.test.js`

**Step 1: Write the failing tests**

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readConfig, writeConfig, getConfigDir } from "./config.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "claudicle-test-" + Date.now());

describe("config", () => {
  beforeEach(() => {
    process.env.CLAUDICLE_HOME = testDir;
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    delete process.env.CLAUDICLE_HOME;
  });

  it("getConfigDir returns CLAUDICLE_HOME when set", () => {
    expect(getConfigDir()).toBe(testDir);
  });

  it("readConfig returns defaults when no config file exists", () => {
    const config = readConfig();
    expect(config.clickhouse.url).toBe("http://localhost:8123");
    expect(config.clickhouse.database).toBe("claude_logs");
    expect(config.ui.port).toBe(3000);
  });

  it("writeConfig creates config file and readConfig reads it back", () => {
    const config = {
      clickhouse: {
        url: "http://remote:8123",
        user: "admin",
        password: "secret",
        database: "mydb",
      },
      ui: { port: 4000 },
      version: "1.5.0",
    };
    writeConfig(config);
    const read = readConfig();
    expect(read).toEqual(config);
  });

  it("writeConfig merges with existing config", () => {
    writeConfig({ clickhouse: { url: "http://a:8123", user: "u", password: "p", database: "d" }, ui: { port: 3000 }, version: "1.0.0" });
    writeConfig({ ui: { port: 5000 } });
    const read = readConfig();
    expect(read.clickhouse.url).toBe("http://a:8123");
    expect(read.ui.port).toBe(5000);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd cli && npx vitest run lib/config.test.js`
Expected: FAIL — module not found

**Step 3: Implement config.js**

```js
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_CONFIG = {
  clickhouse: {
    url: "http://localhost:8123",
    user: "",
    password: "",
    database: "claude_logs",
  },
  ui: {
    port: 3000,
  },
  version: null,
};

export function getConfigDir() {
  return process.env.CLAUDICLE_HOME || join(homedir(), ".claudicle");
}

export function readConfig() {
  const configPath = join(getConfigDir(), "config.json");
  if (!existsSync(configPath)) {
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = readFileSync(configPath, "utf-8");
  return { ...structuredClone(DEFAULT_CONFIG), ...JSON.parse(raw) };
}

export function writeConfig(partial) {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  const existing = readConfig();
  const merged = deepMerge(existing, partial);
  writeFileSync(join(dir, "config.json"), JSON.stringify(merged, null, 2) + "\n");
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd cli && npx vitest run lib/config.test.js`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add cli/lib/config.js cli/lib/config.test.js
git commit -m "feat(cli): add config module for ~/.claudicle/config.json"
```

---

### Task 3: Arg parser utility

**Files:**
- Create: `cli/lib/args.js`
- Create: `cli/lib/args.test.js`

**Step 1: Write the failing tests**

```js
import { describe, it, expect } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses --key value pairs", () => {
    const result = parseArgs(["--clickhouse-url", "http://host:8123", "--port", "4000"]);
    expect(result["clickhouse-url"]).toBe("http://host:8123");
    expect(result.port).toBe("4000");
  });

  it("parses --key=value syntax", () => {
    const result = parseArgs(["--user=admin"]);
    expect(result.user).toBe("admin");
  });

  it("returns empty object for no args", () => {
    expect(parseArgs([])).toEqual({});
  });

  it("ignores positional args", () => {
    const result = parseArgs(["something", "--port", "3000"]);
    expect(result.port).toBe("3000");
    expect(result.something).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd cli && npx vitest run lib/args.test.js`
Expected: FAIL

**Step 3: Implement args.js**

```js
export function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eqIndex = arg.indexOf("=");
    if (eqIndex !== -1) {
      result[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        result[arg.slice(2)] = next;
        i++;
      } else {
        result[arg.slice(2)] = true;
      }
    }
  }
  return result;
}
```

**Step 4: Run tests**

Run: `cd cli && npx vitest run lib/args.test.js`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add cli/lib/args.js cli/lib/args.test.js
git commit -m "feat(cli): add lightweight arg parser"
```

---

### Task 4: ClickHouse HTTP client

**Files:**
- Create: `cli/lib/clickhouse.js`
- Create: `cli/lib/clickhouse.test.js`

**Step 1: Write the failing tests**

```js
import { describe, it, expect, vi } from "vitest";
import { buildClickHouseUrl, runSQL } from "./clickhouse.js";

describe("buildClickHouseUrl", () => {
  it("builds URL with user, password, and database", () => {
    const url = buildClickHouseUrl("http://localhost:8123", "admin", "secret", "mydb");
    expect(url).toBe("http://localhost:8123/?user=admin&password=secret&database=mydb");
  });

  it("handles trailing slash in base URL", () => {
    const url = buildClickHouseUrl("http://localhost:8123/", "u", "p", "d");
    expect(url).toBe("http://localhost:8123/?user=u&password=p&database=d");
  });
});

describe("runSQL", () => {
  it("sends POST with SQL body to ClickHouse", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("Ok.\n") });
    const result = await runSQL("SELECT 1", {
      url: "http://localhost:8123",
      user: "u",
      password: "p",
      database: "d",
    }, mockFetch);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8123/?user=u&password=p&database=d",
      { method: "POST", body: "SELECT 1" }
    );
    expect(result).toBe("Ok.\n");
  });

  it("throws on HTTP error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });
    await expect(
      runSQL("SELECT 1", { url: "http://x:8123", user: "u", password: "p", database: "d" }, mockFetch)
    ).rejects.toThrow("ClickHouse error (401)");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd cli && npx vitest run lib/clickhouse.test.js`
Expected: FAIL

**Step 3: Implement clickhouse.js**

```js
export function buildClickHouseUrl(baseUrl, user, password, database) {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/?user=${encodeURIComponent(user)}&password=${encodeURIComponent(password)}&database=${encodeURIComponent(database)}`;
}

export async function runSQL(sql, config, fetchFn = globalThis.fetch) {
  const url = buildClickHouseUrl(config.url, config.user, config.password, config.database);
  const resp = await fetchFn(url, { method: "POST", body: sql });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ClickHouse error (${resp.status}): ${body}`);
  }
  return resp.text();
}
```

**Step 4: Run tests**

Run: `cd cli && npx vitest run lib/clickhouse.test.js`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add cli/lib/clickhouse.js cli/lib/clickhouse.test.js
git commit -m "feat(cli): add ClickHouse HTTP client"
```

---

### Task 5: Downloader — fetch tarball from GitHub Releases

**Files:**
- Create: `cli/lib/downloader.js`
- Create: `cli/lib/downloader.test.js`

**Step 1: Write the failing tests**

```js
import { describe, it, expect } from "vitest";
import { getReleaseUrl, getInitSqlUrl, getLatestVersion } from "./downloader.js";

describe("getReleaseUrl", () => {
  it("builds tarball URL for a version", () => {
    expect(getReleaseUrl("1.2.0")).toBe(
      "https://github.com/telepenin/claudicle/releases/download/v1.2.0/claudicle-ui-v1.2.0.tar.gz"
    );
  });
});

describe("getInitSqlUrl", () => {
  it("builds init.sql URL for a version", () => {
    expect(getInitSqlUrl("1.2.0")).toBe(
      "https://github.com/telepenin/claudicle/releases/download/v1.2.0/init.sql"
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd cli && npx vitest run lib/downloader.test.js`
Expected: FAIL

**Step 3: Implement downloader.js**

```js
import { execSync } from "node:child_process";
import { mkdirSync, existsSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { getConfigDir } from "./config.js";

const REPO = "telepenin/claudicle";

export function getReleaseUrl(version) {
  return `https://github.com/${REPO}/releases/download/v${version}/claudicle-ui-v${version}.tar.gz`;
}

export function getInitSqlUrl(version) {
  return `https://github.com/${REPO}/releases/download/v${version}/init.sql`;
}

export async function getLatestVersion(fetchFn = globalThis.fetch) {
  const resp = await fetchFn(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!resp.ok) throw new Error(`GitHub API error (${resp.status})`);
  const data = await resp.json();
  return data.tag_name.replace(/^v/, "");
}

export async function downloadAndExtract(version, fetchFn = globalThis.fetch) {
  const versionDir = join(getConfigDir(), "versions", version);
  if (existsSync(versionDir)) return versionDir;

  console.log(`Downloading Claudicle UI v${version}...`);
  const url = getReleaseUrl(version);
  const resp = await fetchFn(url, { redirect: "follow" });
  if (!resp.ok) throw new Error(`Download failed (${resp.status}): ${url}`);

  const tarball = join(getConfigDir(), `claudicle-ui-v${version}.tar.gz`);
  mkdirSync(join(getConfigDir(), "versions"), { recursive: true });

  await pipeline(Readable.fromWeb(resp.body), createWriteStream(tarball));

  mkdirSync(versionDir, { recursive: true });
  execSync(`tar -xzf ${tarball} -C ${versionDir}`, { stdio: "pipe" });
  execSync(`rm ${tarball}`, { stdio: "pipe" });

  console.log(`Extracted to ${versionDir}`);
  return versionDir;
}

export async function fetchInitSql(version, fetchFn = globalThis.fetch) {
  const url = getInitSqlUrl(version);
  const resp = await fetchFn(url, { redirect: "follow" });
  if (!resp.ok) return null; // caller should fall back to bundled
  return resp.text();
}
```

**Step 4: Run tests**

Run: `cd cli && npx vitest run lib/downloader.test.js`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add cli/lib/downloader.js cli/lib/downloader.test.js
git commit -m "feat(cli): add GitHub Releases downloader"
```

---

### Task 6: `claudicle init` command

**Files:**
- Create: `cli/lib/commands/init.js`
- Create: `cli/schema/init.sql` (copy from `clickhouse/init.sql`)

**Step 1: Copy bundled fallback schema**

```bash
mkdir -p cli/schema
cp clickhouse/init.sql cli/schema/init.sql
```

**Step 2: Implement init.js**

```js
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../args.js";
import { readConfig, writeConfig } from "../config.js";
import { runSQL } from "../clickhouse.js";
import { fetchInitSql } from "../downloader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run(argv) {
  const args = parseArgs(argv);
  const config = readConfig();

  const chConfig = {
    url: args["clickhouse-url"] || config.clickhouse.url,
    user: args.user || config.clickhouse.user,
    password: args.password || config.clickhouse.password,
    database: args.database || config.clickhouse.database,
  };

  if (!chConfig.user || !chConfig.password) {
    console.error("Error: --user and --password are required (or set them via 'claudicle init --user <u> --password <p>' first)");
    process.exit(1);
  }

  // Save config for future use
  writeConfig({ clickhouse: chConfig });

  // Try to fetch init.sql from GitHub, fall back to bundled
  const version = config.version || (await import("../../package.json", { with: { type: "json" } })).default.version;
  let sql = await fetchInitSql(version);
  if (!sql) {
    console.log("Using bundled schema (GitHub fetch failed)");
    sql = readFileSync(join(__dirname, "..", "..", "schema", "init.sql"), "utf-8");
  }

  console.log(`Initializing ClickHouse at ${chConfig.url}...`);

  // ClickHouse HTTP API executes one statement at a time.
  // Split on semicolons that are followed by a newline (avoids splitting inside strings).
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));

  for (const stmt of statements) {
    await runSQL(stmt, chConfig);
  }

  console.log("ClickHouse schema initialized successfully.");
}
```

**Step 3: Commit**

```bash
git add cli/lib/commands/init.js cli/schema/init.sql
git commit -m "feat(cli): add 'claudicle init' command"
```

---

### Task 7: `claudicle start` command

**Files:**
- Create: `cli/lib/commands/start.js`

**Step 1: Implement start.js**

```js
import { spawn } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "../args.js";
import { readConfig, writeConfig, getConfigDir } from "../config.js";
import { downloadAndExtract } from "../downloader.js";

export async function run(argv) {
  const args = parseArgs(argv);
  const config = readConfig();

  const version = config.version || (await import("../../package.json", { with: { type: "json" } })).default.version;
  const port = args.port || config.ui.port || 3000;
  const chUrl = args["clickhouse-url"] || config.clickhouse.url;
  const chUser = args.user || config.clickhouse.user;
  const chPassword = args.password || config.clickhouse.password;
  const chDb = args.database || config.clickhouse.database;

  // Check if already running
  const pidFile = join(getConfigDir(), "claudicle.pid");
  if (existsSync(pidFile)) {
    const { readFileSync } = await import("node:fs");
    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    try {
      process.kill(pid, 0); // check if process exists
      console.log(`Claudicle is already running (PID ${pid}). Use 'claudicle stop' first.`);
      process.exit(1);
    } catch {
      // stale pid file, continue
    }
  }

  // Download UI if not cached
  const versionDir = await downloadAndExtract(version);
  const serverJs = join(versionDir, "server.js");

  if (!existsSync(serverJs)) {
    console.error(`Error: server.js not found in ${versionDir}. Try 'claudicle update'.`);
    process.exit(1);
  }

  // Save config
  if (args["clickhouse-url"] || args.user || args.password) {
    writeConfig({
      clickhouse: { url: chUrl, user: chUser, password: chPassword, database: chDb },
      ui: { port: Number(port) },
      version,
    });
  }

  // Spawn detached server
  const child = spawn("node", [serverJs], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "0.0.0.0",
      NODE_ENV: "production",
      CLICKHOUSE_URL: chUrl,
      CLICKHOUSE_USER: chUser,
      CLICKHOUSE_PASSWORD: chPassword,
      CLICKHOUSE_DB: chDb,
    },
  });

  child.unref();
  writeFileSync(pidFile, String(child.pid));
  console.log(`Claudicle UI started on http://localhost:${port} (PID ${child.pid})`);
}
```

**Step 2: Commit**

```bash
git add cli/lib/commands/start.js
git commit -m "feat(cli): add 'claudicle start' command"
```

---

### Task 8: `claudicle stop` command

**Files:**
- Create: `cli/lib/commands/stop.js`

**Step 1: Implement stop.js**

```js
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config.js";

export async function run() {
  const pidFile = join(getConfigDir(), "claudicle.pid");

  if (!existsSync(pidFile)) {
    console.log("Claudicle is not running (no PID file found).");
    return;
  }

  const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);

  try {
    process.kill(pid, "SIGTERM");
    console.log(`Claudicle stopped (PID ${pid}).`);
  } catch (err) {
    if (err.code === "ESRCH") {
      console.log("Process already stopped (stale PID file).");
    } else {
      throw err;
    }
  }

  unlinkSync(pidFile);
}
```

**Step 2: Commit**

```bash
git add cli/lib/commands/stop.js
git commit -m "feat(cli): add 'claudicle stop' command"
```

---

### Task 9: `claudicle update` command

**Files:**
- Create: `cli/lib/commands/update.js`

**Step 1: Implement update.js**

```js
import { parseArgs } from "../args.js";
import { readConfig, writeConfig } from "../config.js";
import { getLatestVersion, downloadAndExtract } from "../downloader.js";

export async function run(argv) {
  const config = readConfig();
  const pkgVersion = (await import("../../package.json", { with: { type: "json" } })).default.version;
  const currentVersion = config.version || pkgVersion;

  console.log(`Current version: ${currentVersion}`);
  console.log("Checking for updates...");

  const latest = await getLatestVersion();

  if (latest === currentVersion) {
    console.log("Already up to date.");
    return;
  }

  console.log(`New version available: ${latest}`);
  await downloadAndExtract(latest);
  writeConfig({ version: latest });
  console.log(`Updated to v${latest}. Restart with 'claudicle stop && claudicle start'.`);
}
```

**Step 2: Commit**

```bash
git add cli/lib/commands/update.js
git commit -m "feat(cli): add 'claudicle update' command"
```

---

### Task 10: `claudicle status` command

**Files:**
- Create: `cli/lib/commands/status.js`

**Step 1: Implement status.js**

```js
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig, getConfigDir } from "../config.js";

export async function run() {
  const config = readConfig();
  const pkgVersion = (await import("../../package.json", { with: { type: "json" } })).default.version;

  console.log(`CLI version:  ${pkgVersion}`);
  console.log(`UI version:   ${config.version || "not downloaded"}`);
  console.log(`ClickHouse:   ${config.clickhouse.url}`);
  console.log(`UI port:      ${config.ui.port}`);

  const pidFile = join(getConfigDir(), "claudicle.pid");
  if (existsSync(pidFile)) {
    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    try {
      process.kill(pid, 0);
      console.log(`Server:       running (PID ${pid})`);
    } catch {
      console.log("Server:       stopped (stale PID file)");
    }
  } else {
    console.log("Server:       stopped");
  }
}
```

**Step 2: Commit**

```bash
git add cli/lib/commands/status.js
git commit -m "feat(cli): add 'claudicle status' command"
```

---

### Task 11: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Create the release workflow**

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          registry-url: "https://registry.npmjs.org"

      # Build the Next.js standalone output
      - run: npm ci
      - run: npm run build

      # Create UI tarball from standalone output
      - name: Package UI tarball
        run: |
          mkdir -p release-staging
          cp -r .next/standalone/. release-staging/
          cp -r .next/static release-staging/.next/static
          cp -r public release-staging/public
          VERSION=${GITHUB_REF_NAME#v}
          tar -czf claudicle-ui-v${VERSION}.tar.gz -C release-staging .

      # Upload to GitHub Release
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            claudicle-ui-*.tar.gz
            clickhouse/init.sql

      # Publish CLI to npm
      - name: Publish CLI to npm
        working-directory: cli
        run: |
          VERSION=${GITHUB_REF_NAME#v}
          npm version $VERSION --no-git-tag-version
          npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow for GitHub Releases + npm publish"
```

---

### Task 12: Add CLI vitest config and run all tests

**Files:**
- Create: `cli/vitest.config.js`

**Step 1: Create vitest config for cli/**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.js"],
  },
});
```

**Step 2: Install dev deps and run tests**

```bash
cd cli && npm install && npx vitest run
```

Expected: All tests pass (config: 4, args: 4, clickhouse: 4, downloader: 2 = 14 tests)

**Step 3: Commit**

```bash
git add cli/vitest.config.js cli/package-lock.json
git commit -m "feat(cli): add vitest config, verify all tests pass"
```

---

### Task 13: Update root README with npm install instructions

**Files:**
- Modify: `README.md`

**Step 1: Add npm install to Quick Start**

In `README.md`, add an alternative install section right after the existing Quick Start, before "## Features":

```markdown
### Alternative: Install via npm

If you already have ClickHouse running, install just the UI:

```bash
npm install -g claudicle
claudicle init --clickhouse-url http://your-host:8123 --user claude --password claude
claudicle start
```
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add npm install instructions to README"
```
