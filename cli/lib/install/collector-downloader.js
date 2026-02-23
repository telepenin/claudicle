/**
 * Download otelcol-contrib binary from GitHub releases.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, createWriteStream, unlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { getConfigDir } from '../config.js';

const REPO = 'open-telemetry/opentelemetry-collector-releases';

export function getCollectorAssetUrl(version, os, arch) {
  return `https://github.com/${REPO}/releases/download/v${version}/otelcol-contrib_${version}_${os}_${arch}.tar.gz`;
}

export async function getLatestCollectorVersion(fetchFn = globalThis.fetch) {
  const resp = await fetchFn(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!resp.ok) throw new Error(`GitHub API error (${resp.status})`);
  const data = await resp.json();
  const version = data.tag_name.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return version;
}

export function getCollectorDir() {
  return join(getConfigDir(), 'collector');
}

export function getCollectorBinaryPath() {
  return join(getCollectorDir(), 'otelcol-contrib');
}

export async function downloadCollector(version, os, arch, fetchFn = globalThis.fetch) {
  const binaryPath = getCollectorBinaryPath();
  if (existsSync(binaryPath)) {
    console.log(`Collector binary already exists at ${binaryPath}`);
    return binaryPath;
  }

  const collectorDir = getCollectorDir();
  mkdirSync(collectorDir, { recursive: true });

  const url = getCollectorAssetUrl(version, os, arch);
  console.log(`Downloading otelcol-contrib v${version}...`);

  const resp = await fetchFn(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`Download failed (${resp.status}): ${url}`);

  const tarball = join(collectorDir, `otelcol-contrib-${version}.tar.gz`);
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(tarball));

  try {
    execFileSync('tar', ['-xzf', tarball, '-C', collectorDir], { stdio: 'pipe' });
  } catch (err) {
    unlinkSync(tarball);
    throw new Error(`Failed to extract tarball: ${err.message}`);
  }
  unlinkSync(tarball);

  chmodSync(binaryPath, 0o755);
  console.log(`Collector binary installed at ${binaryPath}`);
  return binaryPath;
}
