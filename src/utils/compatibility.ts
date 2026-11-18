import type {
  AppPermissionItem,
  AppRequirements,
  PlatformInfo,
  PlatformKind,
  StoreApp,
} from '../types';

export interface DetectedSystemProfile {
  os: PlatformKind;
  osLabel: string;
  arch: string;
  ramGb?: number;
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
    osLabel = 'Windows';
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
  const ramGb = typeof deviceMemory === 'number' && Number.isFinite(deviceMemory) ? deviceMemory : undefined;

  return {
    os,
    osLabel,
    arch,
    ramGb,
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

export function inferAppRequirements(app: StoreApp): {
  requirements: AppRequirements;
  inferred: boolean;
} {
  if (app.requirements && Object.keys(app.requirements).length > 0) {
    return { requirements: app.requirements, inferred: Boolean(app.requirementsInferred) };
  }

  const assetPlatforms = Array.from(
    new Set(
      (app.latestRelease?.assets || [])
        .map((a) => a.platform)
        .filter((p): p is PlatformKind => p !== 'universal')
    )
  );

  const tagPlatforms: PlatformKind[] = [];
  const tagText = `${app.tags.join(' ')} ${app.summary}`.toLowerCase();
  if (tagText.includes('windows')) tagPlatforms.push('windows');
  if (tagText.includes('macos') || tagText.includes('mac')) tagPlatforms.push('macos');
  if (tagText.includes('linux')) tagPlatforms.push('linux');

  const osList: PlatformKind[] =
    assetPlatforms.length > 0
      ? assetPlatforms
      : tagPlatforms.length > 0
      ? tagPlatforms
      : ['windows'];

  const largestAssetSize = (app.latestRelease?.assets || []).reduce(
    (max, asset) => Math.max(max, asset.size || 0),
    0
  );
  const estimatedDiskMb =
    largestAssetSize > 0 ? Math.max(120, Math.ceil((largestAssetSize / (1024 * 1024)) * 2.4)) : 250;

  return {
    inferred: true,
    requirements: {
      os: osList,
      minOsVersion: osList.includes('windows') ? 'Windows 10 / 11 (64-bit)' : undefined,
      arch: ['x64'],
      minRamGb: 2,
      minDiskMb: estimatedDiskMb,
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
  platformInfo: PlatformInfo
): CompatibilityReport {
  const user = detectUserSystemProfile(platformInfo);
  const { requirements } = inferAppRequirements(app);

  const supportedOs: PlatformKind[] =
    requirements.os && requirements.os.length > 0 ? requirements.os : ['windows'];
  const osCompatible = supportedOs.includes('universal') || supportedOs.includes(user.os);

  const supportedArch: string[] =
    requirements.arch && requirements.arch.length > 0 ? requirements.arch : ['x64'];
  const archCompatible = supportedArch.includes(user.arch) || supportedArch.includes('universal');

  const ramCompatible =
    !requirements.minRamGb || !user.ramGb || user.ramGb >= requirements.minRamGb;

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
  ];

  if (requirements.minRamGb) {
    checks.push({
      label: 'Bellek (RAM)',
      value: `En az ${requirements.minRamGb} GB`,
      ok: ramCompatible,
    });
  }

  if (requirements.minDiskMb) {
    checks.push({
      label: 'Depolama',
      value:
        requirements.minDiskMb >= 1024
          ? `${(requirements.minDiskMb / 1024).toFixed(1)} GB`
          : `${requirements.minDiskMb} MB`,
      ok: true,
    });
  }

  if (!osCompatible) {
    return {
      status: 'incompatible',
      badgeLabel: `${user.osLabel} ile Uyumsuz`,
      summary: `Bu uygulama yalnızca ${supportedOs.map(formatPlatformLabel).join(', ')} sistemlerini destekliyor.`,
      checks,
    };
  }

  if (!archCompatible || !ramCompatible) {
    return {
      status: 'partial',
      badgeLabel: 'Kısmi Uyum',
      summary: !ramCompatible
        ? `Cihaz belleği önerilen ${requirements.minRamGb} GB sınırının altında görünüyor.`
        : `Sistem mimariniz (${user.arch}) önerilen mimariden (${supportedArch.join('/')}) farklı.`,
      checks,
    };
  }

  return {
    status: 'compatible',
    badgeLabel: `${user.osLabel} ile Uyumlu`,
    summary: `Sisteminiz (${user.osLabel} · ${user.arch}) tüm gereksinimleri karşılıyor.`,
    checks,
  };
}
