import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function getConfigDir() {
  return process.env.CLAUDICLE_HOME || join(homedir(), ".claudicle");
}

/**
 * Parse KEY=VALUE content. Skips blank lines and comments (#).
 */
function parseEnvContent(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return vars;
}

/**
 * Read ~/.claudicle/{service}.env → object of KEY=VALUE pairs.
 * Returns {} if file doesn't exist.
 */
export function readEnvFile(service) {
  const envPath = join(getConfigDir(), `${service}.env`);
  if (!existsSync(envPath)) return {};
  return parseEnvContent(readFileSync(envPath, "utf-8"));
}

/**
 * Write KEY=VALUE env file to ~/.claudicle/{service}.env.
 * Compatible with systemd EnvironmentFile= and shell `set -a; . file`.
 * Returns the absolute path.
 */
export function writeEnvFile(service, env) {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  const envPath = join(dir, `${service}.env`);
  const content = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';
  writeFileSync(envPath, content, { mode: 0o600 });
  console.log(`Wrote env file: ${envPath}`);
  return envPath;
}

/**
 * Read ~/.claudicle/state.json → object. Returns {} if missing.
 */
export function readState() {
  const statePath = join(getConfigDir(), "state.json");
  if (!existsSync(statePath)) return {};
  return JSON.parse(readFileSync(statePath, "utf-8"));
}

/**
 * Shallow-merge partial into state.json and write.
 */
export function writeState(partial) {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  const existing = readState();
  const merged = { ...existing, ...partial };
  writeFileSync(join(dir, "state.json"), JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
}

/**
 * Resolve ClickHouse config with priority:
 * 1. CLI args
 * 2. Process env vars
 * 3. Env files (collector.env + ui.env)
 * 4. Defaults
 */
export function resolveClickHouseConfig(args = {}) {
  const collectorEnv = readEnvFile("collector");
  const uiEnv = readEnvFile("ui");

  return {
    url: args["clickhouse-url"] || process.env.CLICKHOUSE_URL || uiEnv.CLICKHOUSE_URL || "http://localhost:8123",
    user: args.user || process.env.CLICKHOUSE_USER || collectorEnv.CLICKHOUSE_USER || uiEnv.CLICKHOUSE_USER || "",
    password: args.password || process.env.CLICKHOUSE_PASSWORD || collectorEnv.CLICKHOUSE_PASSWORD || uiEnv.CLICKHOUSE_PASSWORD || "",
    database: args.database || process.env.CLICKHOUSE_DB || uiEnv.CLICKHOUSE_DB || "claude_logs",
  };
}

/**
 * Resolve UI port with priority: args → ui.env PORT → default 3000.
 */
export function resolveUiPort(args = {}) {
  if (args.port) return Number(args.port);
  const uiEnv = readEnvFile("ui");
  if (uiEnv.PORT) return Number(uiEnv.PORT);
  return 3000;
}
