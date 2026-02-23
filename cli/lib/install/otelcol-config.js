/**
 * Generate otelcol-config.yaml from the bundled source config.
 * Reads cli/configs/otelcol-config.yaml (copied from configs/otelcol-config.yaml)
 * and replaces the ClickHouse exporter section with user-supplied credentials.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfigDir } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function readConfigTemplate() {
  return readFileSync(join(__dirname, "..", "..", "configs", "otelcol-config.yaml"), "utf-8");
}

/**
 * Derive ClickHouse TCP endpoint from HTTP URL.
 * http://host:8123 → tcp://host:9000?dial_timeout=10s
 */
export function deriveClickHouseTcpEndpoint(httpUrl) {
  const url = new URL(httpUrl);
  const host = url.hostname;
  const httpPort = parseInt(url.port || "8123", 10);
  // Convention: TCP port = HTTP port - 8123 + 9000
  const tcpPort = httpPort - 8123 + 9000;
  return `tcp://${host}:${tcpPort}?dial_timeout=10s`;
}

/**
 * Generate collector config YAML with ClickHouse credentials substituted.
 * Replaces the env-var references in the exporter section with literal values.
 */
export function generateCollectorConfig(chConfig, template) {
  if (!template) template = readConfigTemplate();
  const tcpEndpoint = deriveClickHouseTcpEndpoint(chConfig.url);

  return template
    .replace(/endpoint: tcp:\/\/.*/, `endpoint: ${tcpEndpoint}`)
    .replace(/username: .*/, `username: ${chConfig.user}`)
    .replace(/password: .*/, `password: "${chConfig.password}"`)
    .replace(/database: .*/, `database: ${chConfig.database}`);
}

/**
 * Write collector config to ~/.claudicle/collector/otelcol-config.yaml
 */
export function writeCollectorConfig(chConfig) {
  const collectorDir = join(getConfigDir(), "collector");
  mkdirSync(collectorDir, { recursive: true });

  const configPath = join(collectorDir, "otelcol-config.yaml");
  const content = generateCollectorConfig(chConfig);
  writeFileSync(configPath, content, { mode: 0o600 });

  console.log(`Wrote collector config: ${configPath}`);
  return configPath;
}
