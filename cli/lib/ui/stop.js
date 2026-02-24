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
