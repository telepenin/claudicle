import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
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
