import { parseArgs } from "./args.js";
import { resolveClickHouseConfig, resolveUiPort, writeEnvFile } from "./config.js";

export async function run(argv) {
  const args = parseArgs(argv);

  const chConfig = resolveClickHouseConfig(args);

  if (!chConfig.user || !chConfig.password) {
    console.error(
      "Error: --user and --password are required.\n" +
      "Usage: claudicle config init --user <user> --password <password>"
    );
    process.exit(1);
  }

  const uiPort = resolveUiPort(args);

  writeEnvFile("collector", {
    CLICKHOUSE_USER: chConfig.user,
    CLICKHOUSE_PASSWORD: chConfig.password,
  });
  writeEnvFile("ui", {
    PORT: String(uiPort),
    HOSTNAME: "0.0.0.0",
    NODE_ENV: "production",
    CLICKHOUSE_URL: chConfig.url,
    CLICKHOUSE_USER: chConfig.user,
    CLICKHOUSE_PASSWORD: chConfig.password,
    CLICKHOUSE_DB: chConfig.database,
  });

  const masked = chConfig.password.length > 2
    ? chConfig.password[0] + "*".repeat(chConfig.password.length - 2) + chConfig.password.at(-1)
    : "**";

  console.log(`Configuration saved:
  ClickHouse URL: ${chConfig.url}
  User:           ${chConfig.user}
  Password:       ${masked}
  Database:       ${chConfig.database}
  UI Port:        ${uiPort}`);
}
