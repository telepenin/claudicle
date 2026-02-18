import { createClient } from "@clickhouse/client";

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER ?? "claude",
  password: process.env.CLICKHOUSE_PASSWORD ?? "claude",
  database: "claude_logs",
});

export default clickhouse;
