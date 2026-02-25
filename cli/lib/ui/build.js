/**
 * `claudicle ui build` — build UI from source with custom options.
 *
 * Downloads source from GitHub, runs `npm ci && npm run build` with
 * the specified BASE_PATH, and stores the standalone output in the
 * versions directory (replacing any pre-built download).
 *
 * Usage:
 *   claudicle ui build --base-path /claudicle
 */

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  existsSync,
  createWriteStream,
  rmSync,
  cpSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { parseArgs } from "../args.js";
import { getConfigDir, readState } from "../config.js";
import { getLatestVersion } from "../downloader.js";

const REPO = "telepenin/claudicle";

function getSourceUrl(version) {
  return `https://github.com/${REPO}/archive/refs/tags/v${version}.tar.gz`;
}

async function buildUi(argv) {
  const args = parseArgs(argv);
  const basePath = args["base-path"];

  if (!basePath) {
    console.error("Error: --base-path is required.\n\nUsage:\n  claudicle ui build --base-path /claudicle");
    process.exit(1);
  }

  // Resolve version
  const state = readState();
  const version =
    state.version ||
    (await import("../../package.json", { with: { type: "json" } })).default
      .version;

  console.log(`Building Claudicle UI v${version} with basePath=${basePath}...`);

  // Download source tarball
  const sourceUrl = getSourceUrl(version);
  console.log(`Downloading source from ${sourceUrl}...`);
  const resp = await fetch(sourceUrl, { redirect: "follow" });
  if (!resp.ok) {
    throw new Error(`Download failed (${resp.status}): ${sourceUrl}`);
  }

  const buildDir = join(tmpdir(), `claudicle-build-${version}-${Date.now()}`);
  mkdirSync(buildDir, { recursive: true });

  const tarball = join(buildDir, "source.tar.gz");
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(tarball));

  // Extract source
  const srcDir = join(buildDir, "src");
  mkdirSync(srcDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", srcDir, "--strip-components=1"], {
    stdio: "pipe",
  });

  // Install deps and build
  console.log("Installing dependencies...");
  execFileSync("npm", ["ci"], { cwd: srcDir, stdio: "inherit" });

  console.log(`Building with BASE_PATH=${basePath}...`);
  execFileSync("npm", ["run", "build"], {
    cwd: srcDir,
    stdio: "inherit",
    env: { ...process.env, BASE_PATH: basePath },
  });

  // Copy standalone output to version directory
  const standaloneSrc = join(srcDir, ".next", "standalone");
  const staticSrc = join(srcDir, ".next", "static");
  const publicSrc = join(srcDir, "public");

  if (!existsSync(standaloneSrc)) {
    throw new Error("Build did not produce standalone output. Check next.config.ts has output: 'standalone'.");
  }

  const versionDir = join(getConfigDir(), "versions", version);
  // Remove old version if exists
  if (existsSync(versionDir)) {
    rmSync(versionDir, { recursive: true, force: true });
  }
  mkdirSync(versionDir, { recursive: true });

  // Copy standalone + static assets
  cpSync(standaloneSrc, versionDir, { recursive: true });
  if (existsSync(staticSrc)) {
    cpSync(staticSrc, join(versionDir, ".next", "static"), { recursive: true });
  }
  if (existsSync(publicSrc)) {
    cpSync(publicSrc, join(versionDir, "public"), { recursive: true });
  }

  // Clean up build dir
  rmSync(buildDir, { recursive: true, force: true });

  console.log(`\nBuild complete: ${versionDir}`);
  console.log(`basePath: ${basePath}`);
  console.log(`\nRun 'claudicle setup ui' or 'claudicle install ui' to register as a service.`);
}

export async function run(argv) {
  await buildUi(argv);
}
