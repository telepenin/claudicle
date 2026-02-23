/**
 * `claudicle install ui` — orchestration.
 *
 * 1. Resolve ClickHouse config + port
 * 2. Download UI if not cached (reuse downloadAndExtract)
 * 3. Register as systemd/launchd service with env vars
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "../args.js";
import { readConfig, writeConfig, resolveClickHouseConfig } from "../config.js";
import { downloadAndExtract } from "../downloader.js";
import { detectServiceType } from "./platform.js";
import {
  generateSystemdUnit,
  installSystemdService,
  generateLaunchdPlist,
  installLaunchdService,
} from "./service.js";

const SERVICE_NAME = "claudicle-ui";
const LAUNCHD_LABEL = "com.claudicle.ui";

export async function run(argv) {
  const args = parseArgs(argv);
  const config = readConfig();

  // 1. Resolve config
  const chConfig = resolveClickHouseConfig(args, config);
  const port = Number(args.port || config.ui.port || 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Error: --port must be a valid port number (1-65535)");
    process.exit(1);
  }

  if (!chConfig.user || !chConfig.password) {
    console.error(
      "Error: ClickHouse credentials required.\n" +
      "Provide --user and --password, or run 'claudicle init' first."
    );
    process.exit(1);
  }

  writeConfig({
    clickhouse: chConfig,
    ui: { port },
  });

  // 2. Download UI if not cached
  const version = config.version || (await import("../../package.json", { with: { type: "json" } })).default.version;
  const versionDir = await downloadAndExtract(version);
  const serverJs = join(versionDir, "server.js");

  if (!existsSync(serverJs)) {
    console.error(`Error: server.js not found in ${versionDir}. Try 'claudicle update' first.`);
    process.exit(1);
  }

  // 3. Register service
  const serviceType = detectServiceType(args);
  const execStart = `${process.execPath} ${serverJs}`;
  const env = {
    PORT: String(port),
    HOSTNAME: "0.0.0.0",
    NODE_ENV: "production",
    CLICKHOUSE_URL: chConfig.url,
    CLICKHOUSE_USER: chConfig.user,
    CLICKHOUSE_PASSWORD: chConfig.password,
    CLICKHOUSE_DB: chConfig.database,
  };

  if (serviceType === "systemd") {
    const unit = generateSystemdUnit(SERVICE_NAME, "Claudicle UI Server", execStart, env);
    installSystemdService(SERVICE_NAME, unit);
  } else {
    const plist = generateLaunchdPlist(
      LAUNCHD_LABEL,
      "Claudicle UI Server",
      [process.execPath, serverJs],
      env
    );
    installLaunchdService(LAUNCHD_LABEL, plist);
  }

  console.log(`\nUI v${version} installed and running as ${serviceType} service on port ${port}.`);
}
