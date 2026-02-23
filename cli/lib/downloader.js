import { execSync } from "node:child_process";
import { mkdirSync, existsSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { getConfigDir } from "./config.js";

const REPO = "telepenin/claudicle";

export function getReleaseUrl(version) {
  return `https://github.com/${REPO}/releases/download/v${version}/claudicle-ui-v${version}.tar.gz`;
}

export function getInitSqlUrl(version) {
  return `https://github.com/${REPO}/releases/download/v${version}/init.sql`;
}

export async function getLatestVersion(fetchFn = globalThis.fetch) {
  const resp = await fetchFn(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!resp.ok) throw new Error(`GitHub API error (${resp.status})`);
  const data = await resp.json();
  return data.tag_name.replace(/^v/, "");
}

export async function downloadAndExtract(version, fetchFn = globalThis.fetch) {
  const versionDir = join(getConfigDir(), "versions", version);
  if (existsSync(versionDir)) return versionDir;

  console.log(`Downloading Claudicle UI v${version}...`);
  const url = getReleaseUrl(version);
  const resp = await fetchFn(url, { redirect: "follow" });
  if (!resp.ok) throw new Error(`Download failed (${resp.status}): ${url}`);

  const tarball = join(getConfigDir(), `claudicle-ui-v${version}.tar.gz`);
  mkdirSync(join(getConfigDir(), "versions"), { recursive: true });

  await pipeline(Readable.fromWeb(resp.body), createWriteStream(tarball));

  mkdirSync(versionDir, { recursive: true });
  execSync(`tar -xzf ${tarball} -C ${versionDir}`, { stdio: "pipe" });
  execSync(`rm ${tarball}`, { stdio: "pipe" });

  console.log(`Extracted to ${versionDir}`);
  return versionDir;
}

export async function fetchInitSql(version, fetchFn = globalThis.fetch) {
  const url = getInitSqlUrl(version);
  const resp = await fetchFn(url, { redirect: "follow" });
  if (!resp.ok) return null;
  return resp.text();
}
