import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readState, readEnvFile, getConfigDir } from "../config.js";

export async function run() {
  const state = readState();
  const uiEnv = readEnvFile("ui");
  const pkgVersion = (await import("../../package.json", { with: { type: "json" } })).default.version;

  console.log(`CLI version:  ${pkgVersion}`);
  console.log(`UI version:   ${state.version || "not downloaded"}`);
  console.log(`ClickHouse:   ${uiEnv.CLICKHOUSE_URL || "http://localhost:8123"}`);
  console.log(`UI port:      ${uiEnv.PORT || "3000"}`);

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
