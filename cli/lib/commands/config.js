/**
 * `claudicle config` — parent dispatcher for config subcommands.
 *
 * Usage:
 *   claudicle config init [options]
 */

const subcommands = {
  init: () => import("../config-init.js"),
};

export async function run(argv) {
  const subcommand = argv[0];

  if (!subcommand || !subcommands[subcommand]) {
    console.log(`Usage:
  claudicle config init   Save ClickHouse connection parameters

Options:
  --clickhouse-url <url>   ClickHouse HTTP URL (default: http://localhost:8123)
  --user <user>            ClickHouse username
  --password <password>    ClickHouse password
  --database <db>          ClickHouse database (default: claude_logs)
  --port <port>            UI server port (default: 3000)`);
    process.exit(subcommand ? 1 : 0);
  }

  const mod = await subcommands[subcommand]();
  await mod.run(argv.slice(1));
}
