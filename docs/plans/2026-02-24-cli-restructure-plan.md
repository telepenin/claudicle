# CLI Restructure: Resource-First Commands — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the CLI from verb-first (`claudicle setup ui`) to resource-first (`claudicle ui setup`) dispatch.

**Architecture:** Two-level dispatch in `claudicle.js` — resource groups (`ui`, `collector`) route to `cli/lib/{resource}/{action}.js`, top-level commands (`config`, `init`) stay in `cli/lib/commands/`. Shared utilities (`service.js`, `platform.js`, `otelcol-config.js`, `collector-downloader.js`) remain in `cli/lib/install/`.

**Tech Stack:** Node.js ESM, vitest for tests

**Design doc:** `docs/plans/2026-02-24-cli-restructure-design.md`

---

### Task 1: Create `cli/lib/ui/` directory and move UI commands

**Files:**
- Create: `cli/lib/ui/start.js`
- Create: `cli/lib/ui/stop.js`
- Create: `cli/lib/ui/status.js`
- Create: `cli/lib/ui/update.js`
- Create: `cli/lib/ui/build.js`
- Create: `cli/lib/ui/install.js`
- Create: `cli/lib/ui/setup.js`

**Step 1: Create `cli/lib/ui/` directory**

```bash
mkdir -p cli/lib/ui
```

**Step 2: Move `cli/lib/commands/start.js` → `cli/lib/ui/start.js`**

```bash
mv cli/lib/commands/start.js cli/lib/ui/start.js
```

Update the import path in `cli/lib/ui/start.js` — change relative imports from `../` to `../` (they stay the same depth, but verify each import):
- `../args.js` → `../args.js` (same)
- `../config.js` → `../config.js` (same)
- `../downloader.js` → `../downloader.js` (same)
- `../../package.json` → `../../package.json` (same)

No import changes needed since `ui/` and `commands/` are at the same depth under `lib/`.

**Step 3: Move remaining UI commands**

```bash
mv cli/lib/commands/stop.js cli/lib/ui/stop.js
mv cli/lib/commands/status.js cli/lib/ui/status.js
mv cli/lib/commands/update.js cli/lib/ui/update.js
mv cli/lib/commands/build.js cli/lib/ui/build.js
mv cli/lib/install/ui.js cli/lib/ui/install.js
```

Update import paths in `cli/lib/ui/install.js` (was at `install/ui.js`, now at `ui/install.js` — same depth):
- `../args.js` → `../args.js` (same)
- `../config.js` → `../config.js` (same)
- `../clickhouse.js` → `../clickhouse.js` (same)
- `../downloader.js` → `../downloader.js` (same)
- `./platform.js` → `../install/platform.js` (CHANGED)
- `./service.js` imports → `../install/service.js` (CHANGED)

**Step 4: Create `cli/lib/ui/setup.js`**

Extract the `ui` subcommand from `cli/lib/commands/setup.js` into a standalone module:

```js
/**
 * `claudicle ui setup` — full setup in one command.
 *
 * Runs config init + schema init + ui install in sequence.
 */

export async function run(argv) {
  console.log("\n=== Step 1/3: Saving configuration ===\n");
  await (await import("../config-init.js")).run(argv);

  console.log("\n=== Step 2/3: Initializing ClickHouse schema ===\n");
  await (await import("../commands/init.js")).run(argv);

  console.log("\n=== Step 3/3: Installing UI service ===\n");
  await (await import("./install.js")).run(argv);
}
```

**Step 5: Run tests**

```bash
cd cli && npx vitest run
```

Expected: all existing tests pass (no tests reference moved files directly).

**Step 6: Commit**

```bash
git add cli/lib/ui/
git commit -m "refactor(cli): create ui/ directory with moved command files"
```

---

### Task 2: Create `cli/lib/collector/` directory and move collector commands

**Files:**
- Create: `cli/lib/collector/install.js`
- Create: `cli/lib/collector/setup.js`
- Create: `cli/lib/collector/start.js`
- Create: `cli/lib/collector/stop.js`
- Create: `cli/lib/collector/status.js`

**Step 1: Create directory and move install**

```bash
mkdir -p cli/lib/collector
mv cli/lib/install/collector.js cli/lib/collector/install.js
```

Update imports in `cli/lib/collector/install.js` (was `install/collector.js`, now `collector/install.js`):
- `../args.js` → `../args.js` (same)
- `../config.js` → `../config.js` (same)
- `../clickhouse.js` → `../clickhouse.js` (same)
- `./platform.js` → `../install/platform.js` (CHANGED)
- `./collector-downloader.js` → `../install/collector-downloader.js` (CHANGED)
- `./otelcol-config.js` → `../install/otelcol-config.js` (CHANGED)
- `./service.js` imports → `../install/service.js` (CHANGED)

**Step 2: Create `cli/lib/collector/setup.js`**

```js
/**
 * `claudicle collector setup` — full setup in one command.
 *
 * Runs config init + schema init + collector install in sequence.
 */

export async function run(argv) {
  console.log("\n=== Step 1/3: Saving configuration ===\n");
  await (await import("../config-init.js")).run(argv);

  console.log("\n=== Step 2/3: Initializing ClickHouse schema ===\n");
  await (await import("../commands/init.js")).run(argv);

  console.log("\n=== Step 3/3: Installing OTel Collector service ===\n");
  await (await import("./install.js")).run(argv);
}
```

**Step 3: Create `cli/lib/collector/start.js`**

Manages systemd/launchd service start:

```js
import { execFileSync } from "node:child_process";
import { parseArgs } from "../args.js";
import { detectServiceType } from "../install/platform.js";

const SERVICE_NAME = "claudicle-collector";
const LAUNCHD_LABEL = "com.claudicle.collector";

export async function run(argv) {
  const args = parseArgs(argv);
  const serviceType = detectServiceType(args);

  if (!serviceType) {
    const platform = process.platform;
    // Auto-detect if not specified
    if (platform === "linux") {
      execFileSync("systemctl", ["--user", "start", SERVICE_NAME], { stdio: "inherit" });
    } else if (platform === "darwin") {
      const plistPath = `${process.env.HOME}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`;
      try {
        execFileSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, plistPath], { stdio: "inherit" });
      } catch {
        console.error("Service not installed. Run 'claudicle collector install' first.");
        process.exit(1);
      }
    }
    return;
  }

  if (serviceType === "systemd") {
    execFileSync("systemctl", ["--user", "start", SERVICE_NAME], { stdio: "inherit" });
  } else {
    const plistPath = `${process.env.HOME}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`;
    execFileSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, plistPath], { stdio: "inherit" });
  }

  console.log("Collector service started.");
}
```

**Step 4: Create `cli/lib/collector/stop.js`**

```js
import { execFileSync } from "node:child_process";
import { parseArgs } from "../args.js";
import { detectServiceType } from "../install/platform.js";

const SERVICE_NAME = "claudicle-collector";
const LAUNCHD_LABEL = "com.claudicle.collector";

export async function run(argv) {
  const args = parseArgs(argv);
  const serviceType = detectServiceType(args);

  if (!serviceType) {
    const platform = process.platform;
    if (platform === "linux") {
      execFileSync("systemctl", ["--user", "stop", SERVICE_NAME], { stdio: "inherit" });
    } else if (platform === "darwin") {
      const plistPath = `${process.env.HOME}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`;
      try {
        execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plistPath], { stdio: "inherit" });
      } catch {
        console.error("Service not running or not installed.");
        process.exit(1);
      }
    }
    return;
  }

  if (serviceType === "systemd") {
    execFileSync("systemctl", ["--user", "stop", SERVICE_NAME], { stdio: "inherit" });
  } else {
    const plistPath = `${process.env.HOME}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`;
    execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plistPath], { stdio: "inherit" });
  }

  console.log("Collector service stopped.");
}
```

**Step 5: Create `cli/lib/collector/status.js`**

```js
import { existsSync } from "node:fs";
import { readState, readEnvFile } from "../config.js";
import { getCollectorBinaryPath } from "../install/collector-downloader.js";

export async function run() {
  const state = readState();
  const pkgVersion = (await import("../../package.json", { with: { type: "json" } })).default.version;
  const collectorEnv = readEnvFile("collector");
  const binaryPath = getCollectorBinaryPath();

  console.log(`CLI version:        ${pkgVersion}`);
  console.log(`Collector version:  ${state.collector_version || "not installed"}`);
  console.log(`Binary:             ${existsSync(binaryPath) ? binaryPath : "not found"}`);
  console.log(`ClickHouse user:    ${collectorEnv.CLICKHOUSE_USER || "not configured"}`);

  // Check service status
  const platform = process.platform;
  if (platform === "linux") {
    try {
      const { execFileSync } = await import("node:child_process");
      const out = execFileSync("systemctl", ["--user", "is-active", "claudicle-collector"], { encoding: "utf-8" }).trim();
      console.log(`Service:            ${out}`);
    } catch {
      console.log("Service:            inactive");
    }
  } else if (platform === "darwin") {
    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("launchctl", ["print", `gui/${process.getuid()}/com.claudicle.collector`], { stdio: "pipe" });
      console.log("Service:            running");
    } catch {
      console.log("Service:            not loaded");
    }
  }
}
```

**Step 6: Run tests**

```bash
cd cli && npx vitest run
```

**Step 7: Commit**

```bash
git add cli/lib/collector/
git commit -m "refactor(cli): create collector/ directory with install, setup, start, stop, status"
```

---

### Task 3: Rewrite entry point with two-level dispatch

**Files:**
- Modify: `cli/bin/claudicle.js`

**Step 1: Rewrite `cli/bin/claudicle.js`**

```js
#!/usr/bin/env node

const command = process.argv[2];
const subcommand = process.argv[3];

// Resource groups: claudicle <resource> <action> [options]
const resources = {
  ui: {
    build: () => import("../lib/ui/build.js"),
    install: () => import("../lib/ui/install.js"),
    setup: () => import("../lib/ui/setup.js"),
    start: () => import("../lib/ui/start.js"),
    stop: () => import("../lib/ui/stop.js"),
    status: () => import("../lib/ui/status.js"),
    update: () => import("../lib/ui/update.js"),
  },
  collector: {
    install: () => import("../lib/collector/install.js"),
    setup: () => import("../lib/collector/setup.js"),
    start: () => import("../lib/collector/start.js"),
    stop: () => import("../lib/collector/stop.js"),
    status: () => import("../lib/collector/status.js"),
  },
};

// Top-level commands: claudicle <command> [options]
const commands = {
  config: () => import("../lib/commands/config.js"),
  init: () => import("../lib/commands/init.js"),
};

const HELP = `claudicle — Claude Code session telemetry

Usage:
  claudicle ui build            Build UI from source with custom base path
  claudicle ui update           Download latest UI release
  claudicle ui install          Register UI as a system service
  claudicle ui setup            Full setup: config + schema + service
  claudicle ui start            Start the UI server (foreground/PID)
  claudicle ui stop             Stop the UI server
  claudicle ui status           Show UI version and server status

  claudicle collector install   Install OTel Collector as a system service
  claudicle collector setup     Full setup: config + schema + service
  claudicle collector start     Start the collector service
  claudicle collector stop      Stop the collector service
  claudicle collector status    Show collector version and service status

  claudicle config init         Save ClickHouse connection parameters
  claudicle init                Initialize ClickHouse schema

Options:
  --clickhouse-url <url>   ClickHouse HTTP URL (default: http://localhost:8123)
  --user <user>            ClickHouse username
  --password <password>    ClickHouse password
  --database <db>          ClickHouse database (default: claude_logs)
  --port <port>            UI server port (default: 3000)
  --base-path <path>       URL base path for UI build (e.g. /claudicle)
  --systemd                Register as systemd service (Linux)
  --launchd                Register as launchd service (macOS)`;

// Resource group dispatch
if (resources[command]) {
  const actions = resources[command];
  if (!subcommand || !actions[subcommand]) {
    const actionList = Object.keys(actions).join(", ");
    console.log(`Usage: claudicle ${command} <${actionList}>\n\n${HELP}`);
    process.exit(subcommand ? 1 : 0);
  }
  const mod = await actions[subcommand]();
  await mod.run(process.argv.slice(4));
} else if (commands[command]) {
  // Top-level command dispatch
  const mod = await commands[command]();
  await mod.run(process.argv.slice(3));
} else {
  console.log(HELP);
  process.exit(command ? 1 : 0);
}
```

**Step 2: Run tests**

```bash
cd cli && npx vitest run
```

**Step 3: Commit**

```bash
git add cli/bin/claudicle.js
git commit -m "refactor(cli): rewrite entry point with resource-first dispatch"
```

---

### Task 4: Delete old dispatch files

**Files:**
- Delete: `cli/lib/commands/start.js`
- Delete: `cli/lib/commands/stop.js`
- Delete: `cli/lib/commands/status.js`
- Delete: `cli/lib/commands/update.js`
- Delete: `cli/lib/commands/build.js`
- Delete: `cli/lib/commands/install.js`
- Delete: `cli/lib/commands/setup.js`
- Delete: `cli/lib/install/ui.js`
- Delete: `cli/lib/install/collector.js`

**Step 1: Delete old files**

```bash
rm cli/lib/commands/start.js cli/lib/commands/stop.js cli/lib/commands/status.js
rm cli/lib/commands/update.js cli/lib/commands/build.js
rm cli/lib/commands/install.js cli/lib/commands/setup.js
rm cli/lib/install/ui.js cli/lib/install/collector.js
```

**Step 2: Run tests to verify nothing breaks**

```bash
cd cli && npx vitest run
```

**Step 3: Commit**

```bash
git add -u cli/lib/commands/ cli/lib/install/
git commit -m "refactor(cli): delete old verb-first command files"
```

---

### Task 5: Update Ansible roles

**Files:**
- Modify: `momus/dev-utils/ansible/roles/claudicle/ui/tasks/main.yaml`
- Modify: `momus/dev-utils/ansible/roles/claudicle/client/tasks/main.yaml`

**Step 1: Update UI role**

Change commands from verb-first to resource-first:

```yaml
- set_fact:
    claudicle_port: 3001

- name: Install/update claudicle CLI
  command: npm install -g claudicle@latest

- name: Build UI with base path
  command: claudicle ui build --base-path /claudicle

- name: Setup claudicle UI (config + schema + service)
  command: claudicle ui setup --port {{ claudicle_port }} --systemd
  environment:
    CLICKHOUSE_URL: "http://{{ clickhouse_host }}:8123"
    CLICKHOUSE_USER: "{{ clickhouse_user }}"
    CLICKHOUSE_PASSWORD: "{{ clickhouse_password }}"
    CLICKHOUSE_DB: "{{ clickhouse_db }}"

- name: Wait for UI port
  wait_for:
    port: "{{ claudicle_port }}"
    timeout: 30
```

**Step 2: Update client role**

```yaml
- name: Install/update claudicle CLI
  command: npm install -g claudicle@latest

- name: Install OTel Collector service
  command: claudicle collector setup --systemd
  environment:
    CLICKHOUSE_URL: "http://{{ clickhouse_host }}:8123"
    CLICKHOUSE_USER: "{{ clickhouse_user }}"
    CLICKHOUSE_PASSWORD: "{{ clickhouse_password }}"
    CLICKHOUSE_DB: "{{ clickhouse_db }}"

- name: Wait for OTLP port
  wait_for:
    port: 4318
    timeout: 30
```

**Step 3: Commit**

```bash
git -C /Users/nikolaytelepenin/src/momus add dev-utils/ansible/roles/claudicle/
git -C /Users/nikolaytelepenin/src/momus commit -m "refactor(ansible): update claudicle roles for resource-first CLI"
```

---

### Task 6: Update CLAUDE.md and plugin command

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plugin/commands/claudicle-configure.md` (if it references CLI commands)

**Step 1: Update CLAUDE.md CLI section**

In the "CLI Package" section, update the command references to reflect the new structure. Update the "Commands" section to show the new command format. Add `cli/lib/ui/` and `cli/lib/collector/` to "Key Source Locations".

**Step 2: Run full test suite**

```bash
cd cli && npx vitest run
```

**Step 3: Commit**

```bash
git add CLAUDE.md plugin/
git commit -m "docs: update CLAUDE.md and plugin for resource-first CLI commands"
```
