/**
 * systemd unit and launchd plist generators + installers.
 * Reads per-service template files from cli/configs/ and substitutes named placeholders.
 * Environment variables are written to env files (~/.claudicle/{service}.env).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { getConfigDir } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIGS_DIR = join(__dirname, '..', '..', 'configs');

export function readSystemdTemplate(service) {
  return readFileSync(join(CONFIGS_DIR, `${service}.service`), 'utf-8');
}

export function readLaunchdTemplate(service) {
  return readFileSync(join(CONFIGS_DIR, `${service}.plist`), 'utf-8');
}

export function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


export function generateSystemdUnit(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export function installSystemdService(unitName, unitContent) {
  const unitDir = join(homedir(), '.config', 'systemd', 'user');
  mkdirSync(unitDir, { recursive: true });

  const unitPath = join(unitDir, `${unitName}.service`);
  writeFileSync(unitPath, unitContent, { mode: 0o644 });
  console.log(`Wrote systemd unit: ${unitPath}`);

  execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
  execFileSync('systemctl', ['--user', 'enable', '--now', unitName], { stdio: 'inherit' });
  console.log(`Service ${unitName} enabled and started.`);
}

export function generateLaunchdPlist(template, vars) {
  const logsDir = join(getConfigDir(), 'logs');
  let result = template.replaceAll('{{LOGS_DIR}}', escapeXml(logsDir));
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, escapeXml(value));
  }
  return result;
}

export function installLaunchdService(label, plistContent) {
  const agentsDir = join(homedir(), 'Library', 'LaunchAgents');
  mkdirSync(agentsDir, { recursive: true });

  const logsDir = join(getConfigDir(), 'logs');
  mkdirSync(logsDir, { recursive: true });

  const plistPath = join(agentsDir, `${label}.plist`);
  writeFileSync(plistPath, plistContent, { mode: 0o644 });
  console.log(`Wrote launchd plist: ${plistPath}`);

  // Bootout first (ignore errors if not loaded)
  try {
    execFileSync('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath], { stdio: 'pipe' });
  } catch {
    // Not loaded yet, fine
  }

  execFileSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath], { stdio: 'inherit' });
  console.log(`Service ${label} loaded and started.`);
}
