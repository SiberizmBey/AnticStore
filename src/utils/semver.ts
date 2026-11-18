import type { PlatformKind, StoreAsset } from '../types';

export function cleanVersion(version: string): string {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split('+')[0];
}

export function compareSemver(a: string, b: string): number {
  const cleanA = cleanVersion(a);
  const cleanB = cleanVersion(b);
  if (cleanA === cleanB) return 0;

  const [mainA, preA] = cleanA.split('-');
  const [mainB, preB] = cleanB.split('-');

  const partsA = mainA.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = mainB.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length, 3);

  for (let i = 0; i < len; i += 1) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  if (!preA && preB) return 1;
  if (preA && !preB) return -1;
  if (preA && preB) return preA.localeCompare(preB);
  return 0;
}

export function isUpdateAvailable(installedVersion: string | undefined, latestVersion: string | undefined): boolean {
  if (!installedVersion || !latestVersion) return false;
  return compareSemver(latestVersion, installedVersion) > 0;
}

export interface InstalledMirrorStatus {
  isUnofficial: boolean;
  isAheadOfOfficial: boolean;
  isMissingFromMirrors: boolean;
}

export function checkInstalledMirrorStatus(
  installedVersion: string | undefined,
  latestVersion: string | undefined,
  releases: Array<{ version: string; tag?: string }> = [],
  syncError?: string
): InstalledMirrorStatus {
  if (!installedVersion || !cleanVersion(installedVersion)) {
    return { isUnofficial: false, isAheadOfOfficial: false, isMissingFromMirrors: false };
  }
  if (
    syncError ||
    (!latestVersion && releases.length === 0) ||
    (latestVersion === '0.0.0' && releases.length === 0)
  ) {
    return { isUnofficial: false, isAheadOfOfficial: false, isMissingFromMirrors: false };
  }

  const isAheadOfOfficial = Boolean(
    latestVersion &&
      latestVersion !== '0.0.0' &&
      compareSemver(installedVersion, latestVersion) > 0
  );

  const existsInReleases =
    releases.length > 0
      ? releases.some(
          (r) =>
            compareSemver(r.version, installedVersion) === 0 ||
            (r.tag ? cleanVersion(r.tag) === cleanVersion(installedVersion) : false)
        )
      : Boolean(latestVersion && compareSemver(installedVersion, latestVersion) === 0);

  const isMissingFromMirrors = !existsInReleases;
  return {
    isUnofficial: isAheadOfOfficial || isMissingFromMirrors,
    isAheadOfOfficial,
    isMissingFromMirrors,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

export function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '';
  return `${formatBytes(bps)}/sn`;
}

export function detectAssetMeta(fileName: string): {
  platform: PlatformKind;
  installerType: StoreAsset['installerType'];
} {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.exe')) {
    return {
      platform: 'windows',
      installerType: lower.includes('setup') || lower.includes('installer') ? 'nsis' : 'exe',
    };
  }
  if (lower.endsWith('.msi')) {
    return { platform: 'windows', installerType: 'msi' };
  }
  if (lower.endsWith('.appimage')) {
    return { platform: 'linux', installerType: 'appimage' };
  }
  if (lower.endsWith('.deb')) {
    return { platform: 'linux', installerType: 'deb' };
  }
  if (lower.endsWith('.dmg')) {
    return { platform: 'macos', installerType: 'dmg' };
  }
  if (lower.endsWith('.pkg')) {
    return { platform: 'macos', installerType: 'pkg' };
  }
  if (lower.endsWith('.zip')) {
    if (lower.includes('win')) return { platform: 'windows', installerType: 'zip' };
    if (lower.includes('mac') || lower.includes('darwin')) return { platform: 'macos', installerType: 'zip' };
    if (lower.includes('linux')) return { platform: 'linux', installerType: 'zip' };
    return { platform: 'universal', installerType: 'zip' };
  }
  return { platform: 'universal', installerType: 'other' };
}

export function pickPreferredAsset(
  assets: StoreAsset[],
  currentPlatform: 'win32' | 'linux' | 'darwin' | 'web'
): StoreAsset | null {
  if (!assets || assets.length === 0) return null;

  const usable = assets.filter(
    (a) => !a.name.endsWith('.blockmap') && !a.name.endsWith('.yml') && !a.name.endsWith('.yaml')
  );
  const pool = usable.length > 0 ? usable : assets;

  const targetPlatform: PlatformKind =
    currentPlatform === 'linux'
      ? 'linux'
      : currentPlatform === 'darwin'
      ? 'macos'
      : 'windows';

  const platformMatches = pool.filter((a) => a.platform === targetPlatform);
  if (platformMatches.length > 0) {
    const installerFirst = platformMatches.find((a) =>
      ['nsis', 'msi', 'appimage', 'dmg', 'pkg', 'deb', 'exe'].includes(a.installerType)
    );
    return installerFirst || platformMatches[0];
  }

  return pool[0];
}

export function formatTurkishDate(isoDate?: string): string {
  const trimmed = isoDate?.trim();
  if (!trimmed) return '—';

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(trimmed);

  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
