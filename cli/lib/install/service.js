/**
 * systemd unit and launchd plist generators + installers.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { getConfigDir } from '../config.js';

export function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateSystemdUnit(name, description, execStart, env = {}) {
  const envLines = Object.entries(env)
    .map(([k, v]) => `Environment=${k}=${v}`)
    .join('\n');

  return `[Unit]
Description=${description}
After=network.target

[Service]
Type=simple
ExecStart=${execStart}
Restart=on-failure
RestartSec=5
${envLines}

[Install]
WantedBy=default.target
`.trimStart();
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

export function generateLaunchdPlist(label, description, programArgs, env = {}) {
  const logsDir = join(getConfigDir(), 'logs');
  const argsXml = programArgs
    .map((a) => `    <string>${escapeXml(a)}</string>`)
    .join('\n');

  const envXml = Object.entries(env).length > 0
    ? `  <key>EnvironmentVariables</key>\n  <dict>\n${Object.entries(env)
        .map(([k, v]) => `    <key>${escapeXml(k)}</key>\n    <string>${escapeXml(v)}</string>`)
        .join('\n')}\n  </dict>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(logsDir, `${label}.out.log`))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(logsDir, `${label}.err.log`))}</string>
${envXml}
</dict>
</plist>
`;
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
