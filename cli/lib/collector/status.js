import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

  const platform = process.platform;
  if (platform === "linux") {
    try {
      const out = execFileSync("systemctl", ["--user", "is-active", "claudicle-collector"], { encoding: "utf-8" }).trim();
      console.log(`Service:            ${out}`);
    } catch {
      console.log("Service:            inactive");
    }
  } else if (platform === "darwin") {
    try {
      execFileSync("launchctl", ["print", `gui/${process.getuid()}/com.claudicle.collector`], { stdio: "pipe" });
      console.log("Service:            running");
    } catch {
      console.log("Service:            not loaded");
    }
  }
}
