/**
 * `claudicle install` — parent dispatcher for install subcommands.
 *
 * Usage:
 *   claudicle install collector [options]
 *   claudicle install ui [options]
 */

const subcommands = {
  collector: () => import("../install/collector.js"),
  ui: () => import("../install/ui.js"),
};

export async function run(argv) {
  const subcommand = argv[0];

  if (!subcommand || !subcommands[subcommand]) {
    console.log(`Usage:
  claudicle install collector   Install OTel Collector as a system service
  claudicle install ui          Install the UI server as a system service

Options:
  --systemd                     Force systemd (Linux default)
  --launchd                     Force launchd (macOS default)
  --clickhouse-url <url>        ClickHouse HTTP URL
  --user <user>                 ClickHouse username
  --password <password>         ClickHouse password
  --database <db>               ClickHouse database
  --port <port>                 UI server port (install ui only)
  --collector-version <ver>     OTel Collector version (install collector only)`);
    process.exit(subcommand ? 1 : 0);
  }

  const mod = await subcommands[subcommand]();
  await mod.run(argv.slice(1));
}
