/**
 * `claudicle install collector` — orchestration.
 *
 * 1. Resolve ClickHouse config (args > env > env files > defaults)
 * 2. Validate credentials present
 * 3. Check ClickHouse is reachable
 * 4. Download otelcol-contrib binary
 * 5. Generate otelcol-config.yaml
 * 6. Register as systemd/launchd service (if --systemd or --launchd passed)
 */

import { parseArgs } from "../args.js";
import { resolveClickHouseConfig, writeEnvFile, readState, writeState } from "../config.js";
import { checkClickHouse } from "../clickhouse.js";
import { detectPlatform, detectServiceType } from "../install/platform.js";
import { getLatestCollectorVersion, downloadCollector, getCollectorBinaryPath } from "../install/collector-downloader.js";
import { writeCollectorConfig } from "../install/otelcol-config.js";
import {
  readSystemdTemplate,
  readLaunchdTemplate,
  generateSystemdUnit,
  installSystemdService,
  generateLaunchdPlist,
  installLaunchdService,
} from "../install/service.js";

const SERVICE_NAME = "claudicle-collector";
const LAUNCHD_LABEL = "com.claudicle.collector";

export async function run(argv) {
  const args = parseArgs(argv);

  // 1. Resolve ClickHouse config
  const chConfig = resolveClickHouseConfig(args);

  // 2. Validate credentials
  if (!chConfig.user || !chConfig.password) {
    console.error(
      "Error: ClickHouse credentials required.\n" +
      "Provide --user and --password, or run 'claudicle config init' first."
    );
    process.exit(1);
  }

  // 3. Check ClickHouse is reachable
  await checkClickHouse(chConfig);

  // 4. Download collector binary
  const { os, arch } = detectPlatform();
  const state = readState();
  const version = args["collector-version"] || state.collector_version;
  const collectorVersion = version || await getLatestCollectorVersion();

  await downloadCollector(collectorVersion, os, arch);
  writeState({ collector_version: collectorVersion });

  // 5. Generate otelcol-config.yaml
  const configPath = writeCollectorConfig(chConfig);

  // 6. Write env file + optionally register service
  const binaryPath = getCollectorBinaryPath();
  const envFile = writeEnvFile("collector", {
    CLICKHOUSE_USER: chConfig.user,
    CLICKHOUSE_PASSWORD: chConfig.password,
  });

  const serviceType = detectServiceType(args);
  if (serviceType) {
    const vars = {
      BINARY_PATH: binaryPath,
      CONFIG_PATH: configPath,
      ENV_FILE: envFile,
    };

    if (serviceType === "systemd") {
      const template = readSystemdTemplate("collector");
      const unit = generateSystemdUnit(template, vars);
      installSystemdService(SERVICE_NAME, unit);
    } else {
      const template = readLaunchdTemplate("collector");
      const plist = generateLaunchdPlist(template, vars);
      installLaunchdService(LAUNCHD_LABEL, plist);
    }

    console.log(`\nCollector v${collectorVersion} installed and running as ${serviceType} service.`);
  } else {
    console.log(`\nCollector v${collectorVersion} installed.`);
    console.log(`Config: ${configPath}`);
    console.log(`Binary: ${binaryPath}`);
    console.log(`\nTo register as a system service, re-run with --systemd or --launchd.`);
  }
}
