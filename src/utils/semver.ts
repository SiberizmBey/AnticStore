import type { PlatformKind, ReleaseChannel, StoreAsset, StoreRelease } from '../types';

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

  const [mainA, rawPreA] = cleanA.split('-');
  const [mainB, rawPreB] = cleanB.split('-');
  const preA = rawPreA && /^stable(?:[.\-_]?\d+)?$/i.test(rawPreA) ? '' : rawPreA;
  const preB = rawPreB && /^stable(?:[.\-_]?\d+)?$/i.test(rawPreB) ? '' : rawPreB;

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

export function getReleaseChannelKind(
  release: Pick<StoreRelease, 'tag' | 'version' | 'prerelease'>
): ReleaseChannel {
  const combined = `${release.tag || ''} ${release.version || ''}`.toLowerCase();
  if (/(?:^|[.\-_])stable(?:[.\-_]?\d+|[a-z]*)?(?:\b|\s|$)/i.test(combined) || /-stable\b/i.test(combined)) {
    return 'stable';
  }
  if (/(?:^|[.\-_])rc(?:[.\-_]?\d+|[a-z]*)?(?:\b|\s|$)/i.test(combined) || /-rc\b/i.test(combined)) {
    return 'rc';
  }
  if (/(?:^|[.\-_])nightly(?:[.\-_]?\d+|[a-z]*)?(?:\b|\s|$)/i.test(combined) || /-nightly\b/i.test(combined)) {
    return 'nightly';
  }
  if (
    /(?:^|[.\-_])(beta|alpha|dev|preview)(?:[.\-_]?\d+|[a-z]*)?(?:\b|\s|$)/i.test(combined) ||
    /-beta\b/i.test(combined) ||
    Boolean(release.prerelease)
  ) {
    return 'beta';
  }
  return 'stable';
}

export function getAvailableReleaseChannels(releases: StoreRelease[]): ReleaseChannel[] {
  if (!releases || releases.length === 0) return ['stable'];
  const present = new Set<ReleaseChannel>(releases.map((r) => getReleaseChannelKind(r)));
  const ordered: ReleaseChannel[] = [];
  if (present.has('stable')) ordered.push('stable');
  if (present.has('beta')) ordered.push('beta');
  if (present.has('nightly')) ordered.push('nightly');
  if (present.has('rc')) ordered.push('rc');
  return ordered.length > 0 ? ordered : ['stable'];
}

export function filterReleasesByChannel(
  releases: StoreRelease[],
  channel: ReleaseChannel
): StoreRelease[] {
  if (!releases || releases.length === 0) return [];
  return releases
    .filter((r) => getReleaseChannelKind(r) === channel)
    .sort((a, b) => compareSemver(b.version, a.version));
}

export function getEffectiveLatestRelease(
  releases: StoreRelease[],
  channel: ReleaseChannel,
  fallbackLatest?: StoreRelease | null
): StoreRelease | null {
  if (!releases || releases.length === 0) {
    return fallbackLatest || null;
  }
  const channelMatches = filterReleasesByChannel(releases, channel);
  if (channelMatches.length > 0) {
    return channelMatches[0];
  }
  const stableMatches = filterReleasesByChannel(releases, 'stable');
  if (stableMatches.length > 0) {
    return stableMatches[0];
  }
  const sortedAll = [...releases].sort((a, b) => compareSemver(b.version, a.version));
  return sortedAll[0] || fallbackLatest || null;
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

  const existsInReleases =
    releases.length > 0
      ? releases.some(
          (r) =>
            compareSemver(r.version, installedVersion) === 0 ||
            (r.tag ? cleanVersion(r.tag) === cleanVersion(installedVersion) : false)
        )
      : Boolean(latestVersion && compareSemver(installedVersion, latestVersion) === 0);

  const isMissingFromMirrors = !existsInReleases;
  const isAheadOfOfficial = Boolean(
    isMissingFromMirrors &&
      latestVersion &&
      latestVersion !== '0.0.0' &&
      compareSemver(installedVersion, latestVersion) > 0
  );

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

  const usable = assets.filter((a) => {
    const lower = a.name.toLowerCase();
    return (
      !lower.endsWith('.blockmap') &&
      !lower.endsWith('.yml') &&
      !lower.endsWith('.yaml') &&
      !lower.endsWith('.sha256') &&
      !lower.endsWith('.sha256sum') &&
      !lower.endsWith('.sha512') &&
      !lower.endsWith('.sig') &&
      !lower.endsWith('.asc') &&
      lower !== 'checksums.txt' &&
      !lower.startsWith('sha256sum')
    );
  });
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

export function formatDownloadCount(count?: number): string {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return '';
  if (count < 1000) return String(Math.round(count));
  if (count < 1_000_000) {
    const val = (count / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return `${val} B`;
  }
  const val = (count / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',');
  return `${val} Mn`;
}

export interface ChangelogRangeSummary {
  fromVersion: string;
  toVersion: string;
  isUpdateRange: boolean;
  releases: StoreRelease[];
}

export function buildChangelogRangeSummary(
  releases: StoreRelease[],
  options: {
    channel: ReleaseChannel;
    fromVersion?: string;
    targetRelease?: StoreRelease | null;
    maxRecentCount?: number;
  }
): ChangelogRangeSummary | null {
  if (!releases || releases.length === 0) return null;

  const channelReleases = filterReleasesByChannel(releases, options.channel);
  const pool =
    channelReleases.length > 0
      ? channelReleases
      : [...releases].sort((a, b) => compareSemver(b.version, a.version));

  const target = options.targetRelease || pool[0];
  if (!target) return null;

  const fromVer = options.fromVersion ? cleanVersion(options.fromVersion) : '';
  if (fromVer && compareSemver(target.version, fromVer) > 0) {
    const between = pool.filter(
      (r) => compareSemver(r.version, fromVer) > 0 && compareSemver(r.version, target.version) <= 0
    );
    if (between.length > 0) {
      return {
        fromVersion: fromVer,
        toVersion: target.version,
        isUpdateRange: true,
        releases: between,
      };
    }
  }

  const maxRecent = options.maxRecentCount ?? 5;
  const upToTarget = pool
    .filter((r) => compareSemver(r.version, target.version) <= 0)
    .slice(0, maxRecent);
  if (upToTarget.length < 2) return null;

  return {
    fromVersion: upToTarget[upToTarget.length - 1].version,
    toVersion: upToTarget[0].version,
    isUpdateRange: false,
    releases: upToTarget,
  };
}

