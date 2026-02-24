import { execFileSync } from "node:child_process";
import { parseArgs } from "../args.js";
import { detectServiceType } from "../install/platform.js";

const SERVICE_NAME = "claudicle-collector";
const LAUNCHD_LABEL = "com.claudicle.collector";

export async function run(argv) {
  const args = parseArgs(argv);
  const serviceType = detectServiceType(args) || (process.platform === "linux" ? "systemd" : "launchd");

  if (serviceType === "systemd") {
    execFileSync("systemctl", ["--user", "stop", SERVICE_NAME], { stdio: "inherit" });
  } else {
    const plistPath = `${process.env.HOME}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`;
    try {
      execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plistPath], { stdio: "inherit" });
    } catch {
      console.error("Service not running or not installed.");
      process.exit(1);
    }
  }

  console.log("Collector service stopped.");
}
