import { readState, writeState } from "../config.js";
import { getLatestVersion, downloadAndExtract } from "../downloader.js";

export async function run() {
  const state = readState();
  const pkgVersion = (await import("../../package.json", { with: { type: "json" } })).default.version;
  const currentVersion = state.version || pkgVersion;

  console.log(`Current version: ${currentVersion}`);
  console.log("Checking for updates...");

  const latest = await getLatestVersion();

  if (latest === currentVersion) {
    console.log("Already up to date.");
    return;
  }

  console.log(`New version available: ${latest}`);
  await downloadAndExtract(latest);
  writeState({ version: latest });
  console.log(`Updated to v${latest}. Restart with 'claudicle stop && claudicle start'.`);
}
