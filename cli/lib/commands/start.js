import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "../args.js";
import { readState, getConfigDir, resolveClickHouseConfig, resolveUiPort } from "../config.js";
import { downloadAndExtract } from "../downloader.js";

export async function run(argv) {
  const args = parseArgs(argv);

  const state = readState();
  const version = state.version || (await import("../../package.json", { with: { type: "json" } })).default.version;
  const port = resolveUiPort(args);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Error: --port must be a valid port number (1-65535)");
    process.exit(1);
  }
  const { url: chUrl, user: chUser, password: chPassword, database: chDb } = resolveClickHouseConfig(args);

  // Check if already running
  const pidFile = join(getConfigDir(), "claudicle.pid");
  if (existsSync(pidFile)) {
    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    try {
      process.kill(pid, 0);
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
