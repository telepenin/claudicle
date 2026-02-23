/**
 * OS/architecture detection and service type auto-detection.
 */

const SUPPORTED_PLATFORMS = {
  darwin: 'darwin',
  linux: 'linux',
};

const ARCH_MAP = {
  x64: 'amd64',
  arm64: 'arm64',
};

export function detectPlatform(platform = process.platform, arch = process.arch) {
  const os = SUPPORTED_PLATFORMS[platform];
  if (!os) {
    throw new Error(`Unsupported platform: ${platform}. Only linux and darwin are supported.`);
  }

  const mappedArch = ARCH_MAP[arch];
  if (!mappedArch) {
    throw new Error(`Unsupported architecture: ${arch}. Only x64 and arm64 are supported.`);
  }

  return { os, arch: mappedArch };
}

export function detectServiceType(args = {}, platform = process.platform) {
  if (args.systemd) return 'systemd';
  if (args.launchd) return 'launchd';

  if (platform === 'darwin') return 'launchd';
  if (platform === 'linux') return 'systemd';

  throw new Error(`Cannot auto-detect service type for platform: ${platform}`);
}
