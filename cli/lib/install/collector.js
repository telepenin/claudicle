/**
 * `claudicle install collector` — orchestration.
 *
 * 1. Resolve ClickHouse config (args > env > saved config)
 * 2. Validate credentials present
 * 3. Download otelcol-contrib binary
 * 4. Generate otelcol-config.yaml
 * 5. Register as systemd/launchd service
 */

import { parseArgs } from "../args.js";
import { readConfig, writeConfig, resolveClickHouseConfig } from "../config.js";
import { detectPlatform, detectServiceType } from "./platform.js";
import { getLatestCollectorVersion, downloadCollector, getCollectorBinaryPath } from "./collector-downloader.js";
import { writeCollectorConfig } from "./otelcol-config.js";
import {
  generateSystemdUnit,
  installSystemdService,
  generateLaunchdPlist,
  installLaunchdService,
} from "./service.js";

const SERVICE_NAME = "claudicle-collector";
const LAUNCHD_LABEL = "com.claudicle.collector";

export async function run(argv) {
  const args = parseArgs(argv);
  const config = readConfig();

  // 1. Resolve ClickHouse config
  const chConfig = resolveClickHouseConfig(args, config);

  // 2. Validate credentials
  if (!chConfig.user || !chConfig.password) {
    console.error(
      "Error: ClickHouse credentials required.\n" +
      "Provide --user and --password, or run 'claudicle init' first."
    );
    process.exit(1);
  }

  // Save config for future use
  writeConfig({ clickhouse: chConfig });

  // 3. Download collector binary
  const { os, arch } = detectPlatform();
  const version = args["collector-version"] || config.collector?.version;
  const collectorVersion = version || await getLatestCollectorVersion();

  await downloadCollector(collectorVersion, os, arch);
  writeConfig({ collector: { version: collectorVersion } });

  // 4. Generate otelcol-config.yaml
  const configPath = writeCollectorConfig(chConfig);

  // 5. Register service
  const binaryPath = getCollectorBinaryPath();
  const serviceType = detectServiceType(args);
  const execStart = `${binaryPath} --config ${configPath}`;
  const env = {
    CLICKHOUSE_USER: chConfig.user,
    CLICKHOUSE_PASSWORD: chConfig.password,
  };

  if (serviceType === "systemd") {
    const unit = generateSystemdUnit(SERVICE_NAME, "Claudicle OTel Collector", execStart, env);
    installSystemdService(SERVICE_NAME, unit);
  } else {
    const plist = generateLaunchdPlist(
      LAUNCHD_LABEL,
      "Claudicle OTel Collector",
      [binaryPath, "--config", configPath],
      env
    );
    installLaunchdService(LAUNCHD_LABEL, plist);
  }

  console.log(`\nCollector v${collectorVersion} installed and running as ${serviceType} service.`);
}
