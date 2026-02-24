/**
 * `claudicle collector setup` — full setup in one command.
 *
 * Runs config init + schema init + collector install in sequence.
 */

export async function run(argv) {
  console.log("\n=== Step 1/3: Saving configuration ===\n");
  await (await import("../config-init.js")).run(argv);

  console.log("\n=== Step 2/3: Initializing ClickHouse schema ===\n");
  await (await import("../commands/init.js")).run(argv);

  console.log("\n=== Step 3/3: Installing OTel Collector service ===\n");
  await (await import("./install.js")).run(argv);
}
