/**
 * `claudicle setup` — full setup in one command.
 *
 * Runs config init + schema init + install (collector or ui) in sequence.
 *
 * Usage:
 *   claudicle setup collector [options]
 *   claudicle setup ui [options]
 */

const subcommands = {
  collector: async (argv) => {
    console.log("\n=== Step 1/3: Saving configuration ===\n");
    await (await import("../config-init.js")).run(argv);

    console.log("\n=== Step 2/3: Initializing ClickHouse schema ===\n");
    await (await import("./init.js")).run(argv);

    console.log("\n=== Step 3/3: Installing OTel Collector service ===\n");
    await (await import("../install/collector.js")).run(argv);
  },
  ui: async (argv) => {
    console.log("\n=== Step 1/3: Saving configuration ===\n");
    await (await import("../config-init.js")).run(argv);

    console.log("\n=== Step 2/3: Initializing ClickHouse schema ===\n");
    await (await import("./init.js")).run(argv);

    console.log("\n=== Step 3/3: Installing UI service ===\n");
    await (await import("../install/ui.js")).run(argv);
  },
};

export async function run(argv) {
  const subcommand = argv[0];

  if (!subcommand || !subcommands[subcommand]) {
    console.log(`Usage:
  claudicle setup collector   Full setup: config + schema + collector service
  claudicle setup ui          Full setup: config + schema + UI service

Options:
  --clickhouse-url <url>        ClickHouse HTTP URL (default: http://localhost:8123)
  --user <user>                 ClickHouse username (required)
  --password <password>         ClickHouse password (required)
  --database <db>               ClickHouse database (default: claude_logs)
  --port <port>                 UI server port (setup ui only, default: 3000)
  --collector-version <ver>     OTel Collector version (setup collector only)
  --systemd                     Force systemd (Linux default)
  --launchd                     Force launchd (macOS default)`);
    process.exit(subcommand ? 1 : 0);
  }

  await subcommands[subcommand](argv.slice(1));
}
