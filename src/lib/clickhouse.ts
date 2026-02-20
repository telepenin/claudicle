import { createClient } from "@clickhouse/client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const host = process.env.CLICKHOUSE_HOST ?? "localhost";
const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL ?? `http://${host}:8123`,
  username: requireEnv("CLICKHOUSE_USER"),
  password: requireEnv("CLICKHOUSE_PASSWORD"),
  database: process.env.CLICKHOUSE_DB ?? "claude_logs",
});

export default clickhouse;
