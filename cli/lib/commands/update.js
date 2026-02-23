import { readConfig, writeConfig } from "../config.js";
import { getLatestVersion, downloadAndExtract } from "../downloader.js";

export async function run() {
  const config = readConfig();
  const pkgVersion = (await import("../../package.json", { with: { type: "json" } })).default.version;
  const currentVersion = config.version || pkgVersion;

  console.log(`Current version: ${currentVersion}`);
  console.log("Checking for updates...");

  const latest = await getLatestVersion();

  if (latest === currentVersion) {
    console.log("Already up to date.");
    return;
  }

  console.log(`New version available: ${latest}`);
  await downloadAndExtract(latest);
  writeConfig({ version: latest });
  console.log(`Updated to v${latest}. Restart with 'claudicle stop && claudicle start'.`);
}
