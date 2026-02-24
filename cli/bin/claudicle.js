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
  const mod = await commands[command]();
  await mod.run(process.argv.slice(3));
} else {
  console.log(HELP);
  process.exit(command ? 1 : 0);
}
