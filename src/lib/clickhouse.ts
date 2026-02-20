import { createClient, type ClickHouseClient } from "@clickhouse/client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let _client: ClickHouseClient | null = null;

function getClient(): ClickHouseClient {
  if (!_client) {
    const host = process.env.CLICKHOUSE_HOST ?? "localhost";
    _client = createClient({
      url: process.env.CLICKHOUSE_URL ?? `http://${host}:8123`,
      username: requireEnv("CLICKHOUSE_USER"),
      password: requireEnv("CLICKHOUSE_PASSWORD"),
      database: process.env.CLICKHOUSE_DB ?? "claude_logs",
    });
  }
  return _client;
}

const clickhouse = new Proxy({} as ClickHouseClient, {
  get(_, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default clickhouse;
