import type { AppTaskProgress, InstalledAppRecord, PlatformInfo } from './index';

export interface DesktopInstallRequest {
  appId: string;
  name: string;
  version: string;
  downloadUrl: string;
  fileName: string;
  silent?: boolean;
  mode?: 'install' | 'update' | 'reinstall';
}

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
  installApp: (req: DesktopInstallRequest) => Promise<InstalledAppRecord>;
  cancelDownload: (appId: string) => Promise<void>;
  uninstallApp: (req: DesktopUninstallRequest) => Promise<void>;
  launchApp: (req: DesktopLaunchRequest) => Promise<{ launched: boolean; message?: string }>;
  openExternal: (url: string) => Promise<void>;
  openDownloadsFolder: () => Promise<void>;
  getAutostartStatus: () => Promise<{ enabled: boolean; supported: boolean }>;
  setAutostartEnabled: (enabled: boolean) => Promise<{ enabled: boolean; supported: boolean }>;
  onTaskProgress: (callback: (progress: AppTaskProgress) => void) => () => void;
}

declare global {
  interface Window {
    anticStoreDesktop?: AnticStoreDesktopAPI;
  }
}
