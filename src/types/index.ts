export type ThemeMode = 'system' | 'amoled' | 'dark' | 'light';
export type UIStyle = 'gama' | 'win11' | 'win10';

export type AccentColor =
  | 'anticpurple'
  | 'purple'
  | 'indigo'
  | 'emerald'
  | 'blue'
  | 'rose'
  | 'amber'
  | 'cyan';

export type InstallMode = 'interactive' | 'silent';
export type ReleaseChannel = 'stable' | 'beta' | 'nightly' | 'rc';

export type PlatformKind = 'windows' | 'linux' | 'macos' | 'universal';

export interface StoreAsset {
  name: string;
  size: number;
  downloadUrl: string;
  contentType?: string;
  platform: PlatformKind;
  installerType: 'nsis' | 'msi' | 'exe' | 'appimage' | 'deb' | 'dmg' | 'pkg' | 'zip' | 'other';
  sha256?: string;
  checksumUrl?: string;
  downloadCount?: number;
}

export interface StoreRelease {
  tag: string;
  version: string;
  name: string;
  notes: string;
  publishedAt: string;
  prerelease?: boolean;
  htmlUrl?: string;
  downloadCount?: number;
  assets: StoreAsset[];
}

export interface CatalogAppEntry {
  id: string;
  name?: string;
  developer?: string;
  category?: string;
  catalog?: string;
  summary?: string;
  description?: string;
  iconUrl?: string;
  websiteUrl?: string;
  screenshots?: string[];
  githubRepo?: string;
  featured?: boolean;
  new?: boolean;
  downloadable?: boolean;
  comingSoon?: boolean;
  announcedAt?: string;
  releaseDate?: string;
  upcomingUpdateDate?: string;
  requirements?: AppRequirements;
  permissions?: Array<string | AppPermissionItem>;
  prerequisites?: Array<string | AppPrerequisite>;
  tags?: string[];
  // Optional direct release (for apps not hosted on GitHub Releases)
  version?: string;
  downloadUrl?: string;
  fileName?: string;
  fileSize?: number;
  sha256?: string;
  releaseNotes?: string;
  publishedAt?: string;
  platform?: PlatformKind;
}

export interface AppPrerequisite {
  id: string;
  name: string;
  description?: string;
  kind?: 'driver' | 'runtime' | 'app';
  platform?: PlatformKind;
  required?: boolean;
  downloadUrl: string;
  fileName?: string;
  packageType?: 'zip-exe' | 'exe' | 'msi' | 'url';
  executableX64?: string;
  executableX86?: string;
  silentArgs?: string[];
  interactiveArgs?: string[];
  requiresAdmin?: boolean;
  sha256?: string;
  websiteUrl?: string;
  rebootMayBeRequired?: boolean;
}

export interface PrerequisiteStatus {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  details?: string;
  supportedOnPlatform: boolean;
  checkedAt: string;
}

export interface PrerequisiteInstallResult {
  id: string;
  installed: boolean;
  version?: string;
  message: string;
  rebootRecommended?: boolean;
}

export interface AppRequirements {
  os?: PlatformKind[];
  minOsVersion?: string;
  arch?: string[];
  minRamGb?: number;
  minDiskMb?: number;
  runtimes?: string[];
  notes?: string;
}

export type PermissionLevel = 'standard' | 'network' | 'system' | 'elevated';

export interface AppPermissionItem {
  id: string;
  label: string;
  description?: string;
  level?: PermissionLevel;
}

export interface SignalEntry {
  id: string;
  code?: string;
  badge?: string;
  title: string;
  summary: string;
  category?: string;
  publishedAt?: string;
  url?: string;
  appId?: string;
}

export interface SignalsManifest {
  schemaVersion?: number;
  headerLabel?: string;
  eyebrow?: string;
  title?: string;
  footerNote?: string;
  updatedAt?: string;
  signals: SignalEntry[];
}

export interface CatalogDefinition {
  id: string;
  label: string;
  description?: string;
  order?: number;
  count?: number;
}

export interface RemoteCatalogManifest {
  schemaVersion?: number;
  storeName?: string;
  publisher?: string;
  updatedAt?: string;
  catalogs?: Array<
    | string
    | {
        id: string;
        label?: string;
        description?: string;
        order?: number;
      }
  >;
  apps: CatalogAppEntry[];
  signals?: SignalEntry[];
}

export interface StoreApp {
  id: string;
  name: string;
  developer: string;
  developerAvatarUrl?: string;
  category: string;
  catalogId: string;
  catalogLabel: string;
  summary: string;
  description: string;
  iconUrl?: string;
  screenshots?: string[];
  websiteUrl: string;
  repoFullName?: string;
  repoUrl?: string;
  stars?: number;
  totalDownloads?: number;
  featured?: boolean;
  new?: boolean;
  downloadable: boolean;
  comingSoon?: boolean;
  announcedAt?: string;
  releaseDate?: string;
  upcomingUpdateDate?: string;
  requirements?: AppRequirements;
  permissions?: AppPermissionItem[];
  prerequisites?: AppPrerequisite[];
  runtimeHints?: string[];
  requirementsInferred?: boolean;
  permissionsInferred?: boolean;
  tags: string[];
  latestVersion: string;
  latestRelease: StoreRelease | null;
  releases: StoreRelease[];
  sourceId: string;
  sourceLabel: string;
  syncError?: string;
  syncedAt: string;
}

export type NotificationKind = 'release' | 'update' | 'install' | 'follow' | 'warning';

export interface StoreNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  appId?: string;
  createdAt: string;
  read: boolean;
}

export type ActivityAction =
  | 'install'
  | 'update'
  | 'reinstall'
  | 'uninstall'
  | 'follow'
  | 'unfollow'
  | 'cancel'
  | 'launch'
  | 'update_found'
  | 'error';

export interface ActivityLogEntry {
  id: string;
  appId: string;
  appName: string;
  action: ActivityAction;
  version?: string;
  previousVersion?: string;
  fileName?: string;
  fileSize?: number;
  sha256Verified?: boolean;
  status: 'in_progress' | 'success' | 'failed' | 'cancelled' | 'info';
  message: string;
  timestamp: string;
}

export type CatalogSourceType = 'catalog-url' | 'github-repo' | 'github-user';

export interface CatalogSource {
  id: string;
  type: CatalogSourceType;
  label: string;
  value: string;
  enabled: boolean;
  builtIn?: boolean;
  lastSyncedAt?: string;
  lastError?: string;
  appCount?: number;
}

export interface InstalledAppRecord {
  appId: string;
  name: string;
  version: string;
  previousVersion?: string;
  installedAt: string;
  updatedAt: string;
  installLocation?: string;
  executablePath?: string;
  uninstallString?: string;
  installerPath?: string;
  sha256?: string;
  sha256Verified?: boolean;
  verifiedAt?: string;
  detectedFromSystem?: boolean;
  sourceMode: 'desktop' | 'web';
}

export type AppTaskPhase =
  | 'queued'
  | 'paused'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'updating'
  | 'uninstalling'
  | 'reinstalling';

export interface AppTaskProgress {
  appId: string;
  appName?: string;
  phase: AppTaskPhase;
  percent: number;
  receivedBytes: number;
  totalBytes: number;
  speedBps: number;
  message: string;
  queuePosition?: number;
}

export interface PlatformInfo {
  isDesktop: boolean;
  platform: 'win32' | 'linux' | 'darwin' | 'web';
  arch: string;
  appVersion: string;
  packageId: string;
  downloadsDir?: string;
  totalRamGb?: number;
  freeDiskGb?: number;
  osRelease?: string;
}

export interface SystemRuntimeDependency {
  id: string;
  name: string;
  kind?: 'runtime' | 'driver';
  installed: boolean;
  version?: string;
  downloadUrl?: string;
  notes?: string;
}

export interface DownloadsCacheInfo {
  fileCount: number;
  totalBytes: number;
  downloadsDir: string;
  files: Array<{
    name: string;
    size: number;
    modifiedAt: string;
  }>;
}

export interface RunningProcessStatus {
  running: boolean;
  processNames: string[];
  pids: number[];
}

export interface KoruDeepLinkTarget {
  rawUrl: string;
  action: 'app' | 'store' | 'installed' | 'settings';
  appId?: string;
}

export interface KoruProfileManifest {
  schemaVersion: 1;
  exportedAt: string;
  packageId: string;
  installedApps: Array<{
    appId: string;
    name: string;
    version: string;
    channel?: ReleaseChannel;
  }>;
  followedAppIds: string[];
  autoUpdateAppIds: string[];
  appChannels: Record<string, ReleaseChannel>;
  preferences: {
    installMode: InstallMode;
    desktopNotificationsEnabled: boolean;
    inAppNotificationsEnabled: boolean;
    autoCleanInstallers: boolean;
    askDownloadDirOnInstall?: boolean;
    downloadSpeedLimitBps?: number;
    customInstallDir?: string;
  };
}
