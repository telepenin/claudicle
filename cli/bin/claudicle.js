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
