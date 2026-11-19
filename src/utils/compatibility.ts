import type {
  AppPermissionItem,
  AppRequirements,
  PlatformInfo,
  PlatformKind,
  StoreApp,
  StoreAsset,
  StoreRelease,
} from '../types';
import { formatBytes, pickPreferredAsset } from './semver';

export interface DetectedSystemProfile {
  os: PlatformKind;
  osLabel: string;
  arch: string;
  ramGb?: number;
  freeDiskGb?: number;
  isDesktop: boolean;
}

export type CompatibilityStatus = 'compatible' | 'partial' | 'incompatible';

export interface CompatibilityReport {
  status: CompatibilityStatus;
  badgeLabel: string;
  summary: string;
  checks: Array<{
    label: string;
    value: string;
    ok: boolean;
  }>;
}

function detectWindowsDisplayLabel(osRelease?: string): string {
  if (!osRelease) return 'Windows';
  const parts = osRelease.split('.').map((n) => parseInt(n, 10));
  if (parts.length >= 3 && parts[0] === 10 && parts[2] >= 22000) {
    return 'Windows 11';
  }
  if (parts[0] === 10) return 'Windows 10';
  return 'Windows';
}

export function detectUserSystemProfile(platformInfo: PlatformInfo): DetectedSystemProfile {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent?.toLowerCase() || '';
  const platformStr = (
    (nav as Navigator & { userAgentData?: { platform?: string } })?.userAgentData?.platform ||
    nav?.platform ||
    ''
  ).toLowerCase();

  let os: PlatformKind = 'windows';
  let osLabel = 'Windows';

  if (platformInfo.platform === 'win32') {
    os = 'windows';
    osLabel = detectWindowsDisplayLabel(platformInfo.osRelease);
  } else if (platformInfo.platform === 'darwin') {
    os = 'macos';
    osLabel = 'macOS';
  } else if (platformInfo.platform === 'linux') {
    os = 'linux';
    osLabel = 'Linux';
  } else {
    if (platformStr.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) {
      os = 'macos';
      osLabel = 'macOS';
    } else if (platformStr.includes('linux') || ua.includes('linux')) {
      os = 'linux';
      osLabel = 'Linux';
    } else {
      os = 'windows';
      osLabel = 'Windows';
    }
  }

  let arch = platformInfo.arch || 'x64';
  if (platformInfo.platform === 'web') {
    if (ua.includes('arm64') || ua.includes('aarch64')) {
      arch = 'arm64';
    } else {
      arch = 'x64';
    }
  }

  const deviceMemory = (nav as Navigator & { deviceMemory?: number } | undefined)?.deviceMemory;
  const ramGb =
    typeof platformInfo.totalRamGb === 'number' && Number.isFinite(platformInfo.totalRamGb)
      ? platformInfo.totalRamGb
      : typeof deviceMemory === 'number' && Number.isFinite(deviceMemory)
      ? deviceMemory
      : undefined;

  const freeDiskGb =
    typeof platformInfo.freeDiskGb === 'number' && Number.isFinite(platformInfo.freeDiskGb)
      ? platformInfo.freeDiskGb
      : undefined;

  return {
    os,
    osLabel,
    arch,
    ramGb,
    freeDiskGb,
    isDesktop: platformInfo.isDesktop,
  };
}

export function formatPlatformLabel(platform: PlatformKind | string): string {
  switch (platform) {
    case 'windows':
      return 'Windows';
    case 'macos':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return 'Çoklu Platform';
  }
}

export function normalizePermissionsList(
  rawPermissions?: Array<string | AppPermissionItem>
): AppPermissionItem[] {
  if (!Array.isArray(rawPermissions) || rawPermissions.length === 0) return [];

  const presets: Record<string, AppPermissionItem> = {
    network: {
      id: 'network',
      label: 'Ağ ve İnternet Erişimi',
      description: 'Güncelleme kontrolü ve çevrimiçi servis bağlantıları için ağ erişimi kullanır.',
      level: 'network',
    },
    internet: {
      id: 'internet',
      label: 'Ağ ve İnternet Erişimi',
      description: 'Çevrimiçi senkronizasyon ve API iletişimi için internet bağlantısı kullanır.',
      level: 'network',
    },
    filesystem: {
      id: 'filesystem',
      label: 'Dosya Sistemi Erişimi',
      description: 'Yerel yapılandırma, veri veya medya dosyalarını okur ve kaydeder.',
      level: 'system',
    },
    storage: {
      id: 'storage',
      label: 'Yerel Depolama',
      description: 'Uygulama verilerini ve önbelleği cihazınızda saklar.',
      level: 'standard',
    },
    audio: {
      id: 'audio',
      label: 'Ses Aygıtı Erişimi',
      description: 'Ses çıkış/giriş cihazlarıyla doğrudan etkileşim kurar.',
      level: 'system',
    },
    admin: {
      id: 'admin',
      label: 'Yönetici / Kurulum İzni',
      description: 'Kurulum veya sistem bileşenleri için yükseltilmiş ayrıcalık isteyebilir.',
      level: 'elevated',
    },
    notifications: {
      id: 'notifications',
      label: 'Masaüstü Bildirimleri',
      description: 'Durum ve etkinlik bildirimleri gösterebilir.',
      level: 'standard',
    },
    autostart: {
      id: 'autostart',
      label: 'Başlangıçta Çalıştırma',
      description: 'İsteğe bağlı olarak sistem açılışında başlatılabilir.',
      level: 'system',
    },
  };

  return rawPermissions
    .map((item, idx): AppPermissionItem | null => {
      if (typeof item === 'string') {
        const key = item.trim().toLowerCase();
        if (!key) return null;
        if (presets[key]) return presets[key];
        return {
          id: `perm-${idx}-${key}`,
          label: item.trim(),
          level: 'standard',
        };
      }
      if (item && typeof item === 'object' && typeof item.label === 'string' && item.label.trim()) {
        return {
          id: item.id || `perm-${idx}`,
          label: item.label.trim(),
          description: typeof item.description === 'string' ? item.description : undefined,
          level: item.level || 'standard',
        };
      }
      return null;
    })
    .filter((p): p is AppPermissionItem => Boolean(p));
}

function cleanPositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function roundSmartDiskMb(rawMb: number): number {
  if (rawMb < 200) return Math.max(60, Math.ceil(rawMb / 10) * 10);
  if (rawMb < 1024) return Math.ceil(rawMb / 25) * 25;
  return Math.ceil(rawMb / 50) * 50;
}

function pickPrimaryAssetForInference(
  app: StoreApp,
  selectedRelease?: StoreRelease | null,
  platform: 'win32' | 'linux' | 'darwin' | 'web' = 'win32'
): StoreAsset | null {
  const assets = selectedRelease?.assets || app.latestRelease?.assets || [];
  if (assets.length === 0) return null;
  return pickPreferredAsset(assets, platform) || assets[0];
}

export function inferAppRequirements(
  app: StoreApp,
  selectedRelease?: StoreRelease | null,
  preferredPlatform: 'win32' | 'linux' | 'darwin' | 'web' = 'win32'
): {
  requirements: AppRequirements;
  inferred: boolean;
  installerBytes: number;
} {
  const explicit = app.requirements || {};
  const assets = selectedRelease?.assets || app.latestRelease?.assets || [];
  const primaryAsset = pickPrimaryAssetForInference(app, selectedRelease, preferredPlatform);
  const largestAssetSize = assets.reduce((max, asset) => Math.max(max, asset.size || 0), 0);
  const installerBytes = primaryAsset?.size || largestAssetSize || 0;

  const assetPlatforms = Array.from(
    new Set(
      assets
        .map((a) => a.platform)
        .filter((p): p is PlatformKind => p !== 'universal')
    )
  );

  const hints = (app.runtimeHints || []).map((h) => h.toLowerCase());
  const haystack = `${app.name} ${app.category} ${app.summary} ${app.description} ${app.tags.join(' ')} ${hints.join(' ')}`.toLowerCase();

  const tagPlatforms: PlatformKind[] = [];
  if (haystack.includes('windows')) tagPlatforms.push('windows');
  if (haystack.includes('macos') || haystack.includes('mac')) tagPlatforms.push('macos');
  if (haystack.includes('linux')) tagPlatforms.push('linux');

  const explicitOs =
    Array.isArray(explicit.os) && explicit.os.length > 0 ? explicit.os : undefined;
  const inferredOs: PlatformKind[] =
    assetPlatforms.length > 0
      ? assetPlatforms
      : tagPlatforms.length > 0
      ? tagPlatforms
      : ['windows'];
  const osList = explicitOs || inferredOs;

  // Smart architecture inference from asset filenames
  const explicitArch =
    Array.isArray(explicit.arch) && explicit.arch.length > 0 ? explicit.arch : undefined;
  const detectedArchs = new Set<string>();
  for (const a of assets) {
    const n = a.name.toLowerCase();
    if (/arm64|aarch64/.test(n)) detectedArchs.add('arm64');
    if (/x64|amd64|x86_64|win64/.test(n)) detectedArchs.add('x64');
    if (/(?:ia32|x86(?!_64)|win32)/.test(n) && !/x64|amd64|x86_64/.test(n)) detectedArchs.add('x86');
  }
  const archList =
    explicitArch || (detectedArchs.size > 0 ? Array.from(detectedArchs) : ['x64']);

  // Smart runtime detection
  const explicitRuntimes =
    Array.isArray(explicit.runtimes) && explicit.runtimes.length > 0 ? explicit.runtimes : undefined;
  const isElectronStack =
    hints.includes('electron') || haystack.includes('electron') || installerBytes >= 65 * 1024 * 1024;
  const isWebView2Stack =
    hints.includes('webview2') ||
    (explicitRuntimes?.some((r) => r.toLowerCase().includes('webview2')) ?? false) ||
    haystack.includes('webview2') ||
    haystack.includes('tauri');
  const isErpOrHeavyWorkstation = /(erp|crm|kurumsal|yönetim|fabrika|veritabanı|postgresql|database)/.test(
    haystack
  );
  const isAudioDsp = /(ses|sound|audio|soundpad|dsp|rpc|discord|oynatıcı)/.test(haystack);

  const inferredRuntimes: string[] = [];
  if (osList.includes('windows')) {
    if (isWebView2Stack) inferredRuntimes.push('WebView2');
    if (hints.includes('dotnet') || haystack.includes('.net')) inferredRuntimes.push('.NET Desktop Runtime');
    if (hints.includes('vcredist') || isAudioDsp) inferredRuntimes.push('VC++ Redistributable');
  }
  const prerequisiteRuntimes = Array.isArray(app.prerequisites)
    ? app.prerequisites.map((p) => p.name).filter(Boolean)
    : [];
  const mergedRuntimes = Array.from(
    new Set([
      ...(explicitRuntimes || inferredRuntimes),
      ...prerequisiteRuntimes,
    ])
  );
  const runtimes = mergedRuntimes.length > 0 ? mergedRuntimes : undefined;

  // Smart unpacked disk estimation (MB)
  const explicitDiskMb = cleanPositiveNumber(explicit.minDiskMb);
  const installerMb = installerBytes > 0 ? installerBytes / (1024 * 1024) : 0;
  let estimatedDiskMb: number;
  if (installerMb > 0) {
    const instType = primaryAsset?.installerType || 'exe';
    let multiplier = 2.4;
    let overheadMb = 60;
    if (instType === 'appimage') {
      multiplier = 1.2;
      overheadMb = 80;
    } else if (instType === 'zip') {
      multiplier = 1.9;
      overheadMb = 40;
    } else if (instType === 'msi' || instType === 'nsis' || instType === 'exe') {
      multiplier = isElectronStack ? 2.65 : 2.25;
      overheadMb = isErpOrHeavyWorkstation ? 150 : 80;
    } else if (instType === 'dmg' || instType === 'deb') {
      multiplier = 2.3;
      overheadMb = 75;
    }
    estimatedDiskMb = roundSmartDiskMb(installerMb * multiplier + overheadMb);
  } else {
    if (isErpOrHeavyWorkstation || isElectronStack) {
      estimatedDiskMb = 350;
    } else if (isAudioDsp) {
      estimatedDiskMb = 220;
    } else if (isWebView2Stack) {
      estimatedDiskMb = 160;
    } else {
      estimatedDiskMb = 200;
    }
  }
  const minDiskMb = explicitDiskMb || estimatedDiskMb;

  // Smart RAM estimation (GB)
  const explicitRamGb = cleanPositiveNumber(explicit.minRamGb);
  let estimatedRamGb = 2;
  if (isErpOrHeavyWorkstation || (isElectronStack && installerMb >= 85)) {
    estimatedRamGb = 4;
  } else if (installerMb > 0 && installerMb < 25 && !isElectronStack && !isWebView2Stack) {
    estimatedRamGb = 1;
  } else if (isWebView2Stack || isAudioDsp || isElectronStack) {
    estimatedRamGb = 2;
  }
  const minRamGb = explicitRamGb || estimatedRamGb;

  // Smart minimum OS version string
  const explicitMinOs =
    typeof explicit.minOsVersion === 'string' && explicit.minOsVersion.trim()
      ? explicit.minOsVersion.trim()
      : undefined;
  let inferredMinOs: string | undefined;
  if (!explicitMinOs) {
    const archTag = archList.includes('arm64') && !archList.includes('x64') ? 'ARM64' : '64-bit';
    if (osList.includes('windows')) {
      inferredMinOs = isWebView2Stack
        ? `Windows 10 (1803+) / Windows 11 (${archTag})`
        : `Windows 10 / 11 (${archTag})`;
    } else if (osList.includes('macos')) {
      inferredMinOs = 'macOS 12 Monterey ve üzeri';
    } else if (osList.includes('linux')) {
      inferredMinOs = 'Ubuntu 20.04+ / Debian 11+ (64-bit)';
    }
  }
  const minOsVersion = explicitMinOs || inferredMinOs;

  const anyInferred =
    !explicitOs ||
    !explicitArch ||
    !explicitRamGb ||
    !explicitDiskMb ||
    !explicitMinOs ||
    Boolean(app.requirementsInferred);

  return {
    inferred: anyInferred,
    installerBytes,
    requirements: {
      os: osList,
      minOsVersion,
      arch: archList,
      minRamGb,
      minDiskMb,
      runtimes,
      notes: typeof explicit.notes === 'string' && explicit.notes.trim() ? explicit.notes.trim() : undefined,
    },
  };
}

export function inferAppPermissions(app: StoreApp): {
  permissions: AppPermissionItem[];
  inferred: boolean;
} {
  if (app.permissions && app.permissions.length > 0) {
    return { permissions: app.permissions, inferred: Boolean(app.permissionsInferred) };
  }

  const inferred: AppPermissionItem[] = [];
  const haystack = `${app.category} ${app.summary} ${app.description} ${app.tags.join(' ')}`.toLowerCase();

  inferred.push({
    id: 'network',
    label: 'Ağ ve Güncelleme Kontrolü',
    description: 'Sürüm ve içerik senkronizasyonu için HTTPS bağlantıları kurar.',
    level: 'network',
  });

  if (/(ses|sound|audio|music|panel|lir|discord)/.test(haystack)) {
    inferred.push({
      id: 'audio',
      label: 'Ses Aygıtı ve Medya',
      description: 'Ses oynatma ve mikrofon/ses çıkışı yönlendirmesi için ses aygıtlarına erişir.',
      level: 'system',
    });
  }

  if (/(erp|crm|mağaza|store|yedek|dosya|kirpi|koru)/.test(haystack)) {
    inferred.push({
      id: 'filesystem',
      label: 'Yerel Veri ve Depolama',
      description: 'Uygulama ayarlarını ve çalışma dosyalarını kullanıcı dizininde saklar.',
      level: 'standard',
    });
  }

  const hasElevatedInstaller = (app.latestRelease?.assets || []).some((a) =>
    ['msi', 'nsis', 'exe', 'deb', 'pkg'].includes(a.installerType)
  );
  if (hasElevatedInstaller) {
    inferred.push({
      id: 'installer',
      label: 'Sistem Kurulum Paketi',
      description: 'Kurulum veya kaldırma sırasında işletim sistemi kurulum izni isteyebilir.',
      level: 'elevated',
    });
  }

  return { permissions: inferred, inferred: true };
}

export function evaluateCompatibility(
  app: StoreApp,
  platformInfo: PlatformInfo,
  selectedRelease?: StoreRelease | null
): CompatibilityReport {
  const user = detectUserSystemProfile(platformInfo);
  const { requirements, installerBytes } = inferAppRequirements(
    app,
    selectedRelease,
    platformInfo.platform
  );

  const supportedOs: PlatformKind[] =
    requirements.os && requirements.os.length > 0 ? requirements.os : ['windows'];
  const osCompatible = supportedOs.includes('universal') || supportedOs.includes(user.os);

  const supportedArch: string[] =
    requirements.arch && requirements.arch.length > 0 ? requirements.arch : ['x64'];
  const archCompatible = supportedArch.includes(user.arch) || supportedArch.includes('universal');

  const ramCompatible =
    !requirements.minRamGb || !user.ramGb || user.ramGb >= requirements.minRamGb;

  const minDiskGb = requirements.minDiskMb ? requirements.minDiskMb / 1024 : 0;
  const diskCompatible =
    !requirements.minDiskMb || typeof user.freeDiskGb !== 'number' || user.freeDiskGb >= minDiskGb;

  const checks: CompatibilityReport['checks'] = [
    {
      label: 'İşletim Sistemi',
      value: supportedOs.map(formatPlatformLabel).join(', '),
      ok: osCompatible,
    },
    {
      label: 'Mimari',
      value: supportedArch.join(' / '),
      ok: archCompatible,
    },
    {
      label: 'İndirme Boyutu',
      value: installerBytes > 0 ? formatBytes(installerBytes) : 'Yayınlanınca belirlenir',
      ok: true,
    },
    {
      label: 'Depolama',
      value: requirements.minDiskMb
        ? requirements.minDiskMb >= 1024
          ? `En az ${(requirements.minDiskMb / 1024).toFixed(1)} GB`
          : `En az ${requirements.minDiskMb} MB`
        : '—',
      ok: diskCompatible,
    },
    {
      label: 'Bellek (RAM)',
      value: requirements.minRamGb ? `En az ${requirements.minRamGb} GB` : '—',
      ok: ramCompatible,
    },
    {
      label: 'Minimum Sürüm',
      value: requirements.minOsVersion || 'Windows 10 / 11',
      ok: osCompatible,
    },
  ];

  const userSpecLabel = [
    user.osLabel,
    user.arch,
    user.ramGb ? `${user.ramGb} GB RAM` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!osCompatible) {
    return {
      status: 'incompatible',
      badgeLabel: `${user.osLabel} ile Uyumsuz`,
      summary: `Bu uygulama yalnızca ${supportedOs.map(formatPlatformLabel).join(', ')} sistemlerini destekliyor.`,
      checks,
    };
  }

  if (!archCompatible || !ramCompatible || !diskCompatible) {
    return {
      status: 'partial',
      badgeLabel: 'Kısmi Uyum',
      summary: !ramCompatible
        ? `Cihaz belleği (${user.ramGb} GB) önerilen ${requirements.minRamGb} GB RAM sınırının altında.`
        : !diskCompatible
        ? `Kullanılabilir disk alanı (${user.freeDiskGb} GB) gereken alanın altında olabilir.`
        : `Sistem mimariniz (${user.arch}) önerilen mimariden (${supportedArch.join('/')}) farklı.`,
      checks,
    };
  }

  return {
    status: 'compatible',
    badgeLabel: `${user.osLabel} ile Uyumlu`,
    summary: `Sisteminiz (${userSpecLabel}) tüm gereksinimleri karşılıyor.`,
    checks,
  };
}
