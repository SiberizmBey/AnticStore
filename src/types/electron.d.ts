import type {
  AppPrerequisite,
  AppTaskProgress,
  DownloadsCacheInfo,
  InstalledAppRecord,
  KoruDeepLinkTarget,
  PlatformInfo,
  PrerequisiteInstallResult,
  PrerequisiteStatus,
  RunningProcessStatus,
  SystemRuntimeDependency,
} from './index';

export interface DesktopInstallRequest {
  appId: string;
  name: string;
  version: string;
  downloadUrl: string;
  fileName: string;
  silent?: boolean;
  mode?: 'install' | 'update' | 'reinstall';
  expectedSha256?: string;
  checksumUrl?: string;
  cleanAfterInstall?: boolean;
  customInstallDir?: string;
  customDownloadDir?: string;
}

export type DesktopInstallResult = InstalledAppRecord & {
  paused?: boolean;
  receivedBytes?: number;
  totalBytes?: number;
};

export interface DesktopUninstallRequest {
  appId: string;
  name: string;
  uninstallString?: string;
  installLocation?: string;
  silent?: boolean;
}

export interface DesktopLaunchRequest {
  appId: string;
  name: string;
  executablePath?: string;
  installLocation?: string;
}

export interface DesktopProcessCheckRequest {
  appId: string;
  name: string;
  executablePath?: string;
  installLocation?: string;
}

export type DesktopWindowCloseBehavior = 'tray' | 'exit';

export interface DesktopSettings {
  showTrayIcon: boolean;
  autostartInTray: boolean;
  closeBehavior: DesktopWindowCloseBehavior;
  autoCleanInstallers: boolean;
  askDownloadDirOnInstall: boolean;
  downloadSpeedLimitBps: number;
  customInstallDir: string;
  traySupported: boolean;
}

export interface AnticStoreDesktopAPI {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;

  getPlatformInfo: () => Promise<PlatformInfo>;
  fetchJson: <T = unknown>(url: string) => Promise<T>;
  fetchJsonOptional: <T = unknown>(url: string) => Promise<T | null>;
  getGitHubTokenStatus: () => Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
  saveGitHubToken: (token: string) => Promise<void>;
  clearGitHubToken: () => Promise<void>;
  getInstalledApps: (
    catalogApps?: Array<{ appId: string; name: string }>
  ) => Promise<InstalledAppRecord[]>;
  installApp: (req: DesktopInstallRequest) => Promise<DesktopInstallResult>;
  pauseDownload: (appId: string) => Promise<void>;
  cancelDownload: (appId: string) => Promise<void>;
  uninstallApp: (req: DesktopUninstallRequest) => Promise<void>;
  launchApp: (req: DesktopLaunchRequest) => Promise<{ launched: boolean; message?: string }>;
  openExternal: (url: string) => Promise<void>;
  openDownloadsFolder: () => Promise<void>;
  openInstallFolder: (req: DesktopLaunchRequest) => Promise<{ opened: boolean; message?: string }>;
  createDesktopShortcut: (req: DesktopLaunchRequest) => Promise<{ created: boolean; message: string }>;
  chooseInstallDirectory: () => Promise<{ canceled: boolean; path?: string }>;
  chooseDownloadDirectory: () => Promise<{ canceled: boolean; path?: string }>;
  checkAppRunning: (req: DesktopProcessCheckRequest) => Promise<RunningProcessStatus>;
  stopAppProcesses: (req: DesktopProcessCheckRequest) => Promise<{ stopped: boolean; message?: string }>;
  checkSystemDependencies: () => Promise<SystemRuntimeDependency[]>;
  checkPrerequisites: (items: AppPrerequisite[]) => Promise<PrerequisiteStatus[]>;
  installPrerequisite: (item: AppPrerequisite) => Promise<PrerequisiteInstallResult>;
  getDownloadsCacheInfo: () => Promise<DownloadsCacheInfo>;
  clearDownloadsCache: () => Promise<{ deletedCount: number; freedBytes: number }>;
  setTaskbarProgress: (progress: number, label?: string) => Promise<void>;
  getPendingDeepLink: () => Promise<KoruDeepLinkTarget | null>;
  onDeepLink: (callback: (target: KoruDeepLinkTarget) => void) => () => void;
  getAutostartStatus: () => Promise<{ enabled: boolean; supported: boolean }>;
  setAutostartEnabled: (enabled: boolean) => Promise<{ enabled: boolean; supported: boolean }>;
  getDesktopSettings: () => Promise<DesktopSettings>;
  updateDesktopSettings: (
    patch: Partial<
      Pick<
        DesktopSettings,
        | 'showTrayIcon'
        | 'autostartInTray'
        | 'closeBehavior'
        | 'autoCleanInstallers'
        | 'askDownloadDirOnInstall'
        | 'downloadSpeedLimitBps'
        | 'customInstallDir'
      >
    >
  ) => Promise<DesktopSettings>;
  quitApp: () => Promise<void>;
  showNotification: (payload: { title: string; body: string }) => Promise<{ shown: boolean }>;
  onSyncRequested: (callback: () => void) => () => void;
  onTaskProgress: (callback: (progress: AppTaskProgress) => void) => () => void;
}

declare global {
  interface Window {
    anticStoreDesktop?: AnticStoreDesktopAPI;
  }
}
