/**
 * `claudicle install ui` — orchestration.
 *
 * 1. Resolve ClickHouse config + port
 * 2. Check ClickHouse is reachable
 * 3. Download UI if not cached (reuse downloadAndExtract)
 * 4. Register as systemd/launchd service (if --systemd or --launchd passed)
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "../args.js";
import { resolveClickHouseConfig, resolveUiPort, writeEnvFile, readState } from "../config.js";
import { checkClickHouse } from "../clickhouse.js";
import { downloadAndExtract } from "../downloader.js";
import { detectServiceType } from "./platform.js";
import {
  readSystemdTemplate,
  readLaunchdTemplate,
  generateSystemdUnit,
  installSystemdService,
  generateLaunchdPlist,
  installLaunchdService,
} from "./service.js";

const SERVICE_NAME = "claudicle-ui";
const LAUNCHD_LABEL = "com.claudicle.ui";

export async function run(argv) {
  const args = parseArgs(argv);

  // 1. Resolve config
  const chConfig = resolveClickHouseConfig(args);
  const port = resolveUiPort(args);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Error: --port must be a valid port number (1-65535)");
    process.exit(1);
  }

  if (!chConfig.user || !chConfig.password) {
    console.error(
      "Error: ClickHouse credentials required.\n" +
      "Provide --user and --password, or run 'claudicle config init' first."
    );
    process.exit(1);
  }

  // 2. Check ClickHouse is reachable
  await checkClickHouse(chConfig);

  // 3. Download UI if not cached
  const state = readState();
  const version = state.version || (await import("../../package.json", { with: { type: "json" } })).default.version;
  const versionDir = await downloadAndExtract(version);
  const serverJs = join(versionDir, "server.js");

  if (!existsSync(serverJs)) {
    console.error(`Error: server.js not found in ${versionDir}. Try 'claudicle update' first.`);
    process.exit(1);
  }

  // 4. Write env file + optionally register service
  const envFile = writeEnvFile("ui", {
    PORT: String(port),
    HOSTNAME: "0.0.0.0",
    NODE_ENV: "production",
    CLICKHOUSE_URL: chConfig.url,
    CLICKHOUSE_USER: chConfig.user,
    CLICKHOUSE_PASSWORD: chConfig.password,
    CLICKHOUSE_DB: chConfig.database,
  });

  const serviceType = detectServiceType(args);
  if (serviceType) {
    const vars = {
      NODE_PATH: process.execPath,
      SERVER_JS: serverJs,
      ENV_FILE: envFile,
    };

    if (serviceType === "systemd") {
      const template = readSystemdTemplate("ui");
      const unit = generateSystemdUnit(template, vars);
      installSystemdService(SERVICE_NAME, unit);
    } else {
      const template = readLaunchdTemplate("ui");
      const plist = generateLaunchdPlist(template, vars);
      installLaunchdService(LAUNCHD_LABEL, plist);
    }

    console.log(`\nUI v${version} installed and running as ${serviceType} service on port ${port}.`);
  } else {
    console.log(`\nUI v${version} installed.`);
    console.log(`Start manually: claudicle start`);
    console.log(`\nTo register as a system service, re-run with --systemd or --launchd.`);
  }
}
