import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_CONFIG = {
  clickhouse: {
    url: "http://localhost:8123",
    user: "",
    password: "",
    database: "claude_logs",
  },
  ui: {
    port: 3000,
  },
  version: null,
};

export function getConfigDir() {
  return process.env.CLAUDICLE_HOME || join(homedir(), ".claudicle");
}

export function readConfig() {
  const configPath = join(getConfigDir(), "config.json");
  if (!existsSync(configPath)) {
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = readFileSync(configPath, "utf-8");
  return deepMerge(structuredClone(DEFAULT_CONFIG), JSON.parse(raw));
}

export function writeConfig(partial) {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  const existing = readConfig();
  const merged = deepMerge(existing, partial);
  writeFileSync(join(dir, "config.json"), JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
