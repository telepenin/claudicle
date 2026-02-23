import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../args.js";
import { readState, resolveClickHouseConfig } from "../config.js";
import { runSQL, checkClickHouse } from "../clickhouse.js";
import { fetchInitSql } from "../downloader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run(argv) {
  const args = parseArgs(argv);

  const chConfig = resolveClickHouseConfig(args);

  if (!chConfig.user || !chConfig.password) {
    console.error("Error: --user and --password are required (run 'claudicle config init' first)");
    process.exit(1);
  }

  await checkClickHouse(chConfig);

  // Try to fetch init.sql from GitHub, fall back to bundled
  const state = readState();
  const version = state.version || (await import("../../package.json", { with: { type: "json" } })).default.version;
  let sql = await fetchInitSql(version);
  if (!sql) {
    console.log("Using bundled schema (GitHub fetch failed)");
    sql = readFileSync(join(__dirname, "..", "..", "schema", "init.sql"), "utf-8");
  }

  console.log(`Initializing ClickHouse at ${chConfig.url}...`);

  // ClickHouse HTTP API executes one statement at a time.
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));

  for (const stmt of statements) {
    await runSQL(stmt, chConfig);
  }

  console.log("ClickHouse schema initialized successfully.");
}
