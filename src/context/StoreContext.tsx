import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityAction,
  ActivityLogEntry,
  AppPrerequisite,
  AppTaskProgress,
  CatalogDefinition,
  CatalogSource,
  DownloadsCacheInfo,
  InstallMode,
  InstalledAppRecord,
  KoruProfileManifest,
  NotificationKind,
  PlatformInfo,
  PrerequisiteInstallResult,
  PrerequisiteStatus,
  ReleaseChannel,
  RunningProcessStatus,
  SignalsManifest,
  StoreApp,
  StoreAsset,
  StoreNotification,
  StoreRelease,
  SystemRuntimeDependency,
} from '../types';
import { OFFICIAL_STORE_REPO, syncOfficialCatalog, syncOfficialSignals } from '../services/catalogService';
import { preloadMediaUrls } from '../services/mediaCache';
import {
  compareSemver,
  getAvailableReleaseChannels,
  getEffectiveLatestRelease,
  isUpdateAvailable,
  pickPreferredAsset,
} from '../utils/semver';
import {
  isPrerequisiteSupportedOnPlatform,
  resolveAppPrerequisites,
} from '../utils/prerequisites';

import type { DesktopWindowCloseBehavior } from '../types/electron';

const WEB_INSTALLED_STORAGE_KEY = 'anticstore_web_installed_v1';
const INSTALL_MODE_STORAGE_KEY = 'anticstore_install_mode_v1';
const SEEN_SIGNALS_STORAGE_KEY = 'koru_seen_signals_v1';
const NOTIFICATIONS_STORAGE_KEY = 'koru_notifications_v1';
const FOLLOWED_APPS_STORAGE_KEY = 'koru_followed_apps_v1';
const FOLLOWED_SNAPSHOT_STORAGE_KEY = 'koru_followed_snapshot_v1';
const ACTIVITY_HISTORY_STORAGE_KEY = 'koru_activity_history_v1';
const NOTIFIED_EVENTS_STORAGE_KEY = 'koru_notified_events_v1';
const DESKTOP_NOTIFICATIONS_STORAGE_KEY = 'koru_desktop_notifications_v1';
const INAPP_NOTIFICATIONS_STORAGE_KEY = 'koru_inapp_notifications_v1';
const AUTOSTART_STORAGE_KEY = 'koru_autostart_v1';
const SHOW_TRAY_STORAGE_KEY = 'koru_show_tray_v1';
const AUTOSTART_IN_TRAY_STORAGE_KEY = 'koru_autostart_in_tray_v1';
const CLOSE_BEHAVIOR_STORAGE_KEY = 'koru_close_behavior_v1';
const APP_CHANNELS_STORAGE_KEY = 'koru_app_channels_v1';
const AUTO_UPDATE_APPS_STORAGE_KEY = 'koru_auto_update_apps_v1';
const AUTO_CLEAN_INSTALLERS_STORAGE_KEY = 'koru_auto_clean_installers_v1';
const DOWNLOAD_SPEED_LIMIT_STORAGE_KEY = 'koru_download_speed_limit_v1';
const CUSTOM_INSTALL_DIR_STORAGE_KEY = 'koru_custom_install_dir_v1';
const ASK_DOWNLOAD_DIR_STORAGE_KEY = 'koru_ask_download_dir_v1';

const MAX_CONCURRENT_DOWNLOADS = 2;

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

interface FollowedAppSnapshot {
  downloadable: boolean;
  version: string;
}

export interface PendingPrerequisitePrompt {
  app: StoreApp;
  missingPrerequisites: AppPrerequisite[];
  statuses: Record<string, PrerequisiteStatus>;
  mode: 'install' | 'update' | 'reinstall';
  resolve: (proceed: boolean) => void;
}

interface QueuedInstallRequest {
  app: StoreApp;
  release: StoreRelease;
  asset: StoreAsset;
  mode: 'install' | 'update' | 'reinstall';
  activityId: string;
  customDownloadDir?: string;
  resolve: () => void;
}

function loadJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJsonStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function loadSeenSignalIds(): string[] {
  const parsed = loadJsonStorage<unknown>(SEEN_SIGNALS_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
}

function loadWebInstalled(): Record<string, InstalledAppRecord> {
  const parsed = loadJsonStorage<Record<string, InstalledAppRecord> | null>(WEB_INSTALLED_STORAGE_KEY, null);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function loadActivityHistory(): ActivityLogEntry[] {
  const saved = loadJsonStorage<unknown>(ACTIVITY_HISTORY_STORAGE_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(
      (item): item is ActivityLogEntry =>
        Boolean(item && typeof item === 'object' && typeof (item as ActivityLogEntry).id === 'string')
    )
    .slice(0, 100)
    .map((item) =>
      item.status === 'in_progress'
        ? {
            ...item,
            status: 'cancelled' as const,
            message: `${item.message} (Oturum sonlandığı için yarıda kesildi)`,
          }
        : item
    );
}

function readNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

async function computeBufferSha256(buffer: ArrayBuffer): Promise<string | undefined> {
  try {
    if (typeof window === 'undefined' || !window.crypto?.subtle) return undefined;
    const digest = await window.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();
  } catch {
    return undefined;
  }
}

interface StoreContextType {
  platformInfo: PlatformInfo;
  officialSource: CatalogSource;
  apps: StoreApp[];
  catalogs: CatalogDefinition[];
  activeCatalog: string;
  setActiveCatalog: (catalogId: string) => void;
  installedMap: Record<string, InstalledAppRecord>;
  tasks: Record<string, AppTaskProgress>;
  appErrors: Record<string, string>;
  githubTokenConfigured: boolean;
  githubTokenStorageAvailable: boolean;
  githubTokenStatusLoaded: boolean;
  syncError: string | null;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  installMode: InstallMode;
  updatableApps: StoreApp[];
  installedApps: StoreApp[];
  signalsFeed: SignalsManifest;
  isSyncingSignals: boolean;
  signalsError: string | null;
  unreadSignalsCount: number;
  notifications: StoreNotification[];
  unreadNotificationsCount: number;
  activeToasts: StoreNotification[];
  followedAppIds: string[];
  autoUpdateAppIds: string[];
  appChannels: Record<string, ReleaseChannel>;
  autoCleanInstallers: boolean;
  downloadSpeedLimitBps: number;
  customInstallDir: string;
  askDownloadDirOnInstall: boolean;
  systemDependencies: SystemRuntimeDependency[];
  isCheckingDependencies: boolean;
  prerequisiteStatuses: Record<string, PrerequisiteStatus>;
  isCheckingPrerequisites: boolean;
  installingPrerequisiteIds: string[];
  pendingPrerequisitePrompt: PendingPrerequisitePrompt | null;
  resolvePendingPrerequisitePrompt: (proceed: boolean) => void;
  checkAppPrerequisites: (app: StoreApp) => Promise<PrerequisiteStatus[]>;
  installPrerequisite: (prereq: AppPrerequisite) => Promise<PrerequisiteInstallResult>;
  downloadsCache: DownloadsCacheInfo | null;
  isLoadingCache: boolean;
  activityHistory: ActivityLogEntry[];
  notificationPermission: BrowserNotificationPermission;
  desktopNotificationsEnabled: boolean;
  inAppNotificationsEnabled: boolean;
  autostartEnabled: boolean;
  autostartSupported: boolean;
  autostartUpdating: boolean;
  autostartInTray: boolean;
  showTrayIcon: boolean;
  closeBehavior: DesktopWindowCloseBehavior;
  setInstallMode: (mode: InstallMode) => void;
  setDesktopNotificationsEnabled: (enabled: boolean) => void;
  setInAppNotificationsEnabled: (enabled: boolean) => void;
  requestNotificationPermission: () => Promise<BrowserNotificationPermission>;
  sendTestNotification: () => Promise<void>;
  toggleAutostart: (enabled: boolean) => Promise<void>;
  setAutostartInTray: (enabled: boolean) => Promise<void>;
  setShowTrayIcon: (enabled: boolean) => Promise<void>;
  setCloseBehavior: (behavior: DesktopWindowCloseBehavior) => Promise<void>;
  setAutoCleanInstallers: (enabled: boolean) => Promise<void>;
  setDownloadSpeedLimit: (bps: number) => Promise<void>;
  setCustomInstallDir: (dir: string) => Promise<void>;
  chooseCustomInstallDir: () => Promise<boolean>;
  setAskDownloadDirOnInstall: (enabled: boolean) => Promise<void>;
  getAvailableChannels: (app: StoreApp) => ReleaseChannel[];
  getAppChannel: (appId: string) => ReleaseChannel;
  setAppChannel: (appId: string, channel: ReleaseChannel) => void;
  getChannelLatestRelease: (app: StoreApp) => StoreRelease | null;
  getRollbackRelease: (app: StoreApp) => StoreRelease | null;
  isAutoUpdateApp: (appId: string) => boolean;
  toggleAutoUpdateApp: (app: StoreApp) => boolean;
  refreshSystemDependencies: () => Promise<SystemRuntimeDependency[]>;
  refreshDownloadsCache: () => Promise<DownloadsCacheInfo | null>;
  clearDownloadsCache: () => Promise<{ deletedCount: number; freedBytes: number }>;
  checkAppRunning: (app: StoreApp) => Promise<RunningProcessStatus>;
  stopAppProcesses: (app: StoreApp) => Promise<{ stopped: boolean; message?: string }>;
  openInstallFolder: (app: StoreApp) => Promise<{ opened: boolean; message?: string }>;
  createDesktopShortcut: (app: StoreApp) => Promise<{ created: boolean; message: string }>;
  exportStoreProfile: () => KoruProfileManifest;
  importStoreProfile: (rawJson: string) => {
    manifest: KoruProfileManifest;
    missingApps: StoreApp[];
  };
  restoreProfileApps: (appIds: string[]) => Promise<number>;
  syncCatalog: () => Promise<void>;
  syncSignals: (forceRefresh?: boolean) => Promise<void>;
  markSignalsAsRead: () => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  dismissToast: (id: string) => void;
  isFollowingApp: (appId: string) => boolean;
  toggleFollowApp: (app: StoreApp) => Promise<boolean>;
  clearActivityHistory: () => void;
  saveGitHubToken: (token: string) => Promise<void>;
  clearGitHubToken: () => Promise<void>;
  installApp: (
    app: StoreApp,
    options?: {
      release?: StoreRelease;
      asset?: StoreAsset;
      mode?: 'install' | 'update' | 'reinstall';
      resumeActivityId?: string;
      customDownloadDir?: string;
      skipPrerequisiteCheck?: boolean;
    }
  ) => Promise<void>;
  updateApp: (app: StoreApp) => Promise<void>;
  updateAllApps: () => Promise<void>;
  reinstallApp: (app: StoreApp) => Promise<void>;
  rollbackApp: (app: StoreApp) => Promise<void>;
  uninstallApp: (app: StoreApp) => Promise<void>;
  launchApp: (app: StoreApp) => Promise<{ launched: boolean; message?: string }>;
  pauseTask: (appId: string) => Promise<void>;
  resumeTask: (appId: string) => Promise<void>;
  cancelTask: (appId: string) => Promise<void>;
  clearAppError: (appId: string) => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>({
    isDesktop: Boolean(window.anticStoreDesktop),
    platform: 'web',
    arch: 'x64',
    appVersion: '1.0.0',
    packageId: 'com.anticvalley.koru',
  });
  const [officialSource, setOfficialSource] = useState<CatalogSource>({
    id: 'official-anticstore',
    type: 'catalog-url',
    label: `GitHub (${OFFICIAL_STORE_REPO})`,
    value: OFFICIAL_STORE_REPO,
    enabled: true,
    builtIn: true,
  });
  const [apps, setApps] = useState<StoreApp[]>([]);
  const [manifestCatalogDefs, setManifestCatalogDefs] = useState<CatalogDefinition[]>([]);
  const [activeCatalog, setActiveCatalog] = useState<string>('all');
  const [installedMap, setInstalledMap] = useState<Record<string, InstalledAppRecord>>(() =>
    window.anticStoreDesktop ? {} : loadWebInstalled()
  );
  const [tasks, setTasks] = useState<Record<string, AppTaskProgress>>({});
  const [appErrors, setAppErrors] = useState<Record<string, string>>({});
  const [githubTokenConfigured, setGitHubTokenConfigured] = useState(false);
  const [githubTokenStorageAvailable, setGitHubTokenStorageAvailable] = useState(false);
  const [githubTokenStatusLoaded, setGitHubTokenStatusLoaded] = useState(
    () => !window.anticStoreDesktop
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [signalsFeed, setSignalsFeed] = useState<SignalsManifest>({
    headerLabel: 'ANTIC VALLEY / SİNYAL',
    eyebrow: 'GÜNCEL YAYIN',
    title: 'Not defteri',
    footerNote: 'YENİ NOTLAR BURADA YAYINLANIR',
    signals: [],
  });
  const [isSyncingSignals, setIsSyncingSignals] = useState<boolean>(true);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [seenSignalIds, setSeenSignalIds] = useState<string[]>(() => loadSeenSignalIds());
  const [notifications, setNotifications] = useState<StoreNotification[]>(() => {
    const saved = loadJsonStorage<StoreNotification[]>(NOTIFICATIONS_STORAGE_KEY, []);
    return Array.isArray(saved) ? saved.slice(0, 60) : [];
  });
  const [activeToasts, setActiveToasts] = useState<StoreNotification[]>([]);
  const [followedAppIds, setFollowedAppIds] = useState<string[]>(() => {
    const saved = loadJsonStorage<unknown>(FOLLOWED_APPS_STORAGE_KEY, []);
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  });
  const [activityHistory, setActivityHistory] = useState<ActivityLogEntry[]>(() =>
    loadActivityHistory()
  );
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>(
    () => readNotificationPermission()
  );
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabledState] = useState<boolean>(
    () => loadJsonStorage<boolean>(DESKTOP_NOTIFICATIONS_STORAGE_KEY, true)
  );
  const [inAppNotificationsEnabled, setInAppNotificationsEnabledState] = useState<boolean>(
    () => loadJsonStorage<boolean>(INAPP_NOTIFICATIONS_STORAGE_KEY, true)
  );
  const [autostartEnabled, setAutostartEnabledState] = useState<boolean>(() =>
    loadJsonStorage<boolean>(AUTOSTART_STORAGE_KEY, false)
  );
  const [autostartSupported, setAutostartSupported] = useState<boolean>(false);
  const [autostartUpdating, setAutostartUpdating] = useState<boolean>(false);
  const [autostartInTray, setAutostartInTrayState] = useState<boolean>(() =>
    loadJsonStorage<boolean>(AUTOSTART_IN_TRAY_STORAGE_KEY, false)
  );
  const [showTrayIcon, setShowTrayIconState] = useState<boolean>(() =>
    loadJsonStorage<boolean>(SHOW_TRAY_STORAGE_KEY, true)
  );
  const [closeBehavior, setCloseBehaviorState] = useState<DesktopWindowCloseBehavior>(() => {
    const saved = loadJsonStorage<string>(CLOSE_BEHAVIOR_STORAGE_KEY, 'tray');
    return saved === 'exit' ? 'exit' : 'tray';
  });
  const [installMode, setInstallModeState] = useState<InstallMode>(() => {
    const saved = localStorage.getItem(INSTALL_MODE_STORAGE_KEY);
    return saved === 'silent' ? 'silent' : 'interactive';
  });
  const [appChannels, setAppChannelsState] = useState<Record<string, ReleaseChannel>>(() => {
    const saved = loadJsonStorage<Record<string, ReleaseChannel>>(APP_CHANNELS_STORAGE_KEY, {});
    return saved && typeof saved === 'object' ? saved : {};
  });
  const [autoUpdateAppIds, setAutoUpdateAppIdsState] = useState<string[]>(() => {
    const saved = loadJsonStorage<unknown>(AUTO_UPDATE_APPS_STORAGE_KEY, []);
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  });
  const [autoCleanInstallers, setAutoCleanInstallersState] = useState<boolean>(() =>
    loadJsonStorage<boolean>(AUTO_CLEAN_INSTALLERS_STORAGE_KEY, false)
  );
  const [downloadSpeedLimitBps, setDownloadSpeedLimitBpsState] = useState<number>(() => {
    const saved = loadJsonStorage<number>(DOWNLOAD_SPEED_LIMIT_STORAGE_KEY, 0);
    return Number.isFinite(saved) && saved > 0 ? Math.round(saved) : 0;
  });
  const [customInstallDir, setCustomInstallDirState] = useState<string>(() => {
    const saved = loadJsonStorage<string>(CUSTOM_INSTALL_DIR_STORAGE_KEY, '');
    return typeof saved === 'string' ? saved : '';
  });
  const [askDownloadDirOnInstall, setAskDownloadDirOnInstallState] = useState<boolean>(() =>
    loadJsonStorage<boolean>(ASK_DOWNLOAD_DIR_STORAGE_KEY, false)
  );
  const [systemDependencies, setSystemDependencies] = useState<SystemRuntimeDependency[]>([]);
  const [isCheckingDependencies, setIsCheckingDependencies] = useState<boolean>(false);
  const [prerequisiteStatuses, setPrerequisiteStatuses] = useState<Record<string, PrerequisiteStatus>>({});
  const [isCheckingPrerequisites, setIsCheckingPrerequisites] = useState<boolean>(false);
  const [installingPrerequisiteIds, setInstallingPrerequisiteIds] = useState<string[]>([]);
  const [pendingPrerequisitePrompt, setPendingPrerequisitePrompt] =
    useState<PendingPrerequisitePrompt | null>(null);
  const [downloadsCache, setDownloadsCache] = useState<DownloadsCacheInfo | null>(null);
  const [isLoadingCache, setIsLoadingCache] = useState<boolean>(false);

  const webAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const webPartialChunksRef = useRef<
    Map<string, { chunks: Uint8Array[]; receivedBytes: number; totalBytes: number }>
  >(new Map());
  const pausedAbortAppIdsRef = useRef<Set<string>>(new Set());
  const pausedJobsRef = useRef<Map<string, Omit<QueuedInstallRequest, 'resolve'>>>(new Map());
  const activeActivityIds = useRef<Map<string, string>>(new Map());
  const activeInstallAppIdsRef = useRef<Set<string>>(new Set());
  const pendingPrerequisiteAppIdsRef = useRef<Set<string>>(new Set());
  const queuedInstallsRef = useRef<QueuedInstallRequest[]>([]);
  const catalogSyncInProgress = useRef(false);
  const catalogSyncRequested = useRef(false);
  const signalsSyncInProgress = useRef(false);
  const autostartUpdatingRef = useRef(false);
  const followedSnapshotsRef = useRef<Record<string, FollowedAppSnapshot>>(
    loadJsonStorage<Record<string, FollowedAppSnapshot>>(FOLLOWED_SNAPSHOT_STORAGE_KEY, {})
  );
  const notifiedEventsRef = useRef<Record<string, boolean>>(
    loadJsonStorage<Record<string, boolean>>(NOTIFIED_EVENTS_STORAGE_KEY, {})
  );
  const appsRef = useRef(apps);
  appsRef.current = apps;
  const installedMapRef = useRef(installedMap);
  installedMapRef.current = installedMap;
  const followedAppIdsRef = useRef(followedAppIds);
  followedAppIdsRef.current = followedAppIds;
  const appChannelsRef = useRef(appChannels);
  appChannelsRef.current = appChannels;
  const autoUpdateAppIdsRef = useRef(autoUpdateAppIds);
  autoUpdateAppIdsRef.current = autoUpdateAppIds;
  const autoCleanInstallersRef = useRef(autoCleanInstallers);
  autoCleanInstallersRef.current = autoCleanInstallers;
  const downloadSpeedLimitBpsRef = useRef(downloadSpeedLimitBps);
  downloadSpeedLimitBpsRef.current = downloadSpeedLimitBps;
  const customInstallDirRef = useRef(customInstallDir);
  customInstallDirRef.current = customInstallDir;
  const askDownloadDirOnInstallRef = useRef(askDownloadDirOnInstall);
  askDownloadDirOnInstallRef.current = askDownloadDirOnInstall;
  const desktopNotificationsEnabledRef = useRef(desktopNotificationsEnabled);
  desktopNotificationsEnabledRef.current = desktopNotificationsEnabled;
  const inAppNotificationsEnabledRef = useRef(inAppNotificationsEnabled);
  inAppNotificationsEnabledRef.current = inAppNotificationsEnabled;

  useEffect(() => {
    saveJsonStorage(ACTIVITY_HISTORY_STORAGE_KEY, activityHistory);
  }, [activityHistory]);

  const dismissToast = useCallback((id: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushNotification = useCallback(
    (payload: {
      kind: NotificationKind;
      title: string;
      message: string;
      appId?: string;
      showToast?: boolean;
      sendBrowserNotification?: boolean;
      forceToast?: boolean;
    }) => {
      const entry: StoreNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: payload.kind,
        title: payload.title,
        message: payload.message,
        appId: payload.appId,
        createdAt: new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => {
        const next = [entry, ...prev].slice(0, 60);
        saveJsonStorage(NOTIFICATIONS_STORAGE_KEY, next);
        return next;
      });

      if (payload.forceToast || (payload.showToast !== false && inAppNotificationsEnabledRef.current)) {
        setActiveToasts((prev) => [entry, ...prev].slice(0, 3));
        window.setTimeout(() => {
          setActiveToasts((prev) => prev.filter((t) => t.id !== entry.id));
        }, 5200);
      }

      if (payload.sendBrowserNotification && desktopNotificationsEnabledRef.current) {
        if (typeof window !== 'undefined' && window.anticStoreDesktop?.showNotification) {
          void window.anticStoreDesktop.showNotification({
            title: payload.title,
            body: payload.message,
          });
        } else if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          window.Notification.permission === 'granted'
        ) {
          try {
            new window.Notification(payload.title, {
              body: payload.message,
            });
          } catch {
            // Ignore browser notification errors in restricted contexts
          }
        }
      }
    },
    []
  );

  const recordActivity = useCallback(
    (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): string => {
      const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const full: ActivityLogEntry = {
        ...entry,
        id,
        timestamp: new Date().toISOString(),
      };
      setActivityHistory((prev) => [full, ...prev].slice(0, 100));
      return id;
    },
    []
  );

  const updateActivity = useCallback(
    (id: string, patch: Partial<Omit<ActivityLogEntry, 'id'>>) => {
      setActivityHistory((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const clearActivityHistory = useCallback(() => {
    setActivityHistory([]);
  }, []);

  const setDesktopNotificationsEnabled = useCallback((enabled: boolean) => {
    setDesktopNotificationsEnabledState(enabled);
    saveJsonStorage(DESKTOP_NOTIFICATIONS_STORAGE_KEY, enabled);
  }, []);

  const setInAppNotificationsEnabled = useCallback((enabled: boolean) => {
    setInAppNotificationsEnabledState(enabled);
    saveJsonStorage(INAPP_NOTIFICATIONS_STORAGE_KEY, enabled);
  }, []);

  const requestNotificationPermission = useCallback(async (): Promise<BrowserNotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }
    try {
      const result = await window.Notification.requestPermission();
      setNotificationPermission(result);
      if (result === 'granted') {
        setDesktopNotificationsEnabledState(true);
        saveJsonStorage(DESKTOP_NOTIFICATIONS_STORAGE_KEY, true);
      }
      return result;
    } catch {
      const current = readNotificationPermission();
      setNotificationPermission(current);
      return current;
    }
  }, []);

  const sendTestNotification = useCallback(async () => {
    const isDesktop = Boolean(typeof window !== 'undefined' && window.anticStoreDesktop?.showNotification);
    let perm: BrowserNotificationPermission = isDesktop ? 'granted' : readNotificationPermission();
    if (!isDesktop) {
      if (perm === 'default') {
        perm = await requestNotificationPermission();
      } else {
        setNotificationPermission(perm);
      }
    }

    const timeStr = new Date().toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    pushNotification({
      kind: 'release',
      title: 'Koru Test Bildirimi',
      message:
        isDesktop || perm === 'granted'
          ? `Bildirim kanalları aktif. Masaüstü ve uygulama içi uyarı test edildi (${timeStr}).`
          : `Uygulama içi test bildirimi gönderildi (${timeStr}). Masaüstü bildirim izni: ${perm === 'denied' ? 'Engelli' : 'Bekleniyor'}.`,
      showToast: true,
      forceToast: true,
      sendBrowserNotification: true,
    });
  }, [pushNotification, requestNotificationPermission]);

  const toggleAutostart = useCallback(async (enabled: boolean) => {
    if (autostartUpdatingRef.current) return;
    autostartUpdatingRef.current = true;
    setAutostartUpdating(true);
    try {
      if (window.anticStoreDesktop?.setAutostartEnabled) {
        const res = await window.anticStoreDesktop.setAutostartEnabled(enabled);
        setAutostartSupported(Boolean(res.supported));
        setAutostartEnabledState(Boolean(res.enabled));
        saveJsonStorage(AUTOSTART_STORAGE_KEY, Boolean(res.enabled));
        return;
      }
      setAutostartEnabledState(enabled);
      saveJsonStorage(AUTOSTART_STORAGE_KEY, enabled);
    } catch (err) {
      console.error('Failed to update autostart setting:', err);
    } finally {
      autostartUpdatingRef.current = false;
      setAutostartUpdating(false);
    }
  }, []);

  const updateDesktopPreference = useCallback(
    async (patch: {
      showTrayIcon?: boolean;
      autostartInTray?: boolean;
      closeBehavior?: DesktopWindowCloseBehavior;
      autoCleanInstallers?: boolean;
      downloadSpeedLimitBps?: number;
      customInstallDir?: string;
      askDownloadDirOnInstall?: boolean;
    }) => {
      if (typeof patch.showTrayIcon === 'boolean') {
        setShowTrayIconState(patch.showTrayIcon);
        saveJsonStorage(SHOW_TRAY_STORAGE_KEY, patch.showTrayIcon);
      }
      if (typeof patch.autostartInTray === 'boolean') {
        setAutostartInTrayState(patch.autostartInTray);
        saveJsonStorage(AUTOSTART_IN_TRAY_STORAGE_KEY, patch.autostartInTray);
      }
      if (patch.closeBehavior) {
        setCloseBehaviorState(patch.closeBehavior);
        saveJsonStorage(CLOSE_BEHAVIOR_STORAGE_KEY, patch.closeBehavior);
      }
      if (typeof patch.autoCleanInstallers === 'boolean') {
        setAutoCleanInstallersState(patch.autoCleanInstallers);
        saveJsonStorage(AUTO_CLEAN_INSTALLERS_STORAGE_KEY, patch.autoCleanInstallers);
      }
      if (typeof patch.downloadSpeedLimitBps === 'number') {
        const cleanLimit = Math.max(0, Math.round(patch.downloadSpeedLimitBps));
        setDownloadSpeedLimitBpsState(cleanLimit);
        saveJsonStorage(DOWNLOAD_SPEED_LIMIT_STORAGE_KEY, cleanLimit);
      }
      if (typeof patch.customInstallDir === 'string') {
        const cleanDir = patch.customInstallDir.trim();
        setCustomInstallDirState(cleanDir);
        saveJsonStorage(CUSTOM_INSTALL_DIR_STORAGE_KEY, cleanDir);
      }
      if (typeof patch.askDownloadDirOnInstall === 'boolean') {
        setAskDownloadDirOnInstallState(patch.askDownloadDirOnInstall);
        saveJsonStorage(ASK_DOWNLOAD_DIR_STORAGE_KEY, patch.askDownloadDirOnInstall);
      }

      if (window.anticStoreDesktop?.updateDesktopSettings) {
        try {
          const updated = await window.anticStoreDesktop.updateDesktopSettings(patch);
          setShowTrayIconState(Boolean(updated.showTrayIcon));
          saveJsonStorage(SHOW_TRAY_STORAGE_KEY, Boolean(updated.showTrayIcon));
          setAutostartInTrayState(Boolean(updated.autostartInTray));
          saveJsonStorage(AUTOSTART_IN_TRAY_STORAGE_KEY, Boolean(updated.autostartInTray));
          const behavior: DesktopWindowCloseBehavior =
            updated.closeBehavior === 'exit' ? 'exit' : 'tray';
          setCloseBehaviorState(behavior);
          saveJsonStorage(CLOSE_BEHAVIOR_STORAGE_KEY, behavior);
          setAutoCleanInstallersState(Boolean(updated.autoCleanInstallers));
          saveJsonStorage(AUTO_CLEAN_INSTALLERS_STORAGE_KEY, Boolean(updated.autoCleanInstallers));
          const nextLimit = Number(updated.downloadSpeedLimitBps) > 0 ? Math.round(updated.downloadSpeedLimitBps) : 0;
          setDownloadSpeedLimitBpsState(nextLimit);
          saveJsonStorage(DOWNLOAD_SPEED_LIMIT_STORAGE_KEY, nextLimit);
          const nextDir = typeof updated.customInstallDir === 'string' ? updated.customInstallDir : '';
          setCustomInstallDirState(nextDir);
          saveJsonStorage(CUSTOM_INSTALL_DIR_STORAGE_KEY, nextDir);
          const nextAskDir = Boolean(updated.askDownloadDirOnInstall);
          setAskDownloadDirOnInstallState(nextAskDir);
          saveJsonStorage(ASK_DOWNLOAD_DIR_STORAGE_KEY, nextAskDir);
        } catch (err) {
          console.error('Failed to update desktop settings:', err);
        }
      }
    },
    []
  );

  const setShowTrayIcon = useCallback(
    async (enabled: boolean) => {
      await updateDesktopPreference({ showTrayIcon: enabled });
    },
    [updateDesktopPreference]
  );

  const setAutostartInTray = useCallback(
    async (enabled: boolean) => {
      await updateDesktopPreference({ autostartInTray: enabled });
    },
    [updateDesktopPreference]
  );

  const setCloseBehavior = useCallback(
    async (behavior: DesktopWindowCloseBehavior) => {
      await updateDesktopPreference({ closeBehavior: behavior });
    },
    [updateDesktopPreference]
  );

  const setAutoCleanInstallers = useCallback(
    async (enabled: boolean) => {
      await updateDesktopPreference({ autoCleanInstallers: enabled });
    },
    [updateDesktopPreference]
  );

  const setDownloadSpeedLimit = useCallback(
    async (bps: number) => {
      await updateDesktopPreference({ downloadSpeedLimitBps: Math.max(0, Math.round(bps)) });
    },
    [updateDesktopPreference]
  );

  const setCustomInstallDir = useCallback(
    async (dir: string) => {
      await updateDesktopPreference({ customInstallDir: dir.trim() });
    },
    [updateDesktopPreference]
  );

  const chooseCustomInstallDir = useCallback(async (): Promise<boolean> => {
    if (!window.anticStoreDesktop?.chooseInstallDirectory) return false;
    const res = await window.anticStoreDesktop.chooseInstallDirectory();
    if (!res.canceled && res.path) {
      await setCustomInstallDir(res.path);
      return true;
    }
    return false;
  }, [setCustomInstallDir]);

  const setAskDownloadDirOnInstall = useCallback(
    async (enabled: boolean) => {
      await updateDesktopPreference({ askDownloadDirOnInstall: enabled });
    },
    [updateDesktopPreference]
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveJsonStorage(NOTIFICATIONS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.read ? n : { ...n, read: true }));
      saveJsonStorage(NOTIFICATIONS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    saveJsonStorage(NOTIFICATIONS_STORAGE_KEY, []);
  }, []);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const isFollowingApp = useCallback(
    (appId: string) => followedAppIds.includes(appId),
    [followedAppIds]
  );

  const toggleFollowApp = useCallback(
    async (app: StoreApp): Promise<boolean> => {
      const currentlyFollowing = followedAppIdsRef.current.includes(app.id);
      if (currentlyFollowing) {
        const next = followedAppIdsRef.current.filter((id) => id !== app.id);
        setFollowedAppIds(next);
        saveJsonStorage(FOLLOWED_APPS_STORAGE_KEY, next);
        const snapCopy = { ...followedSnapshotsRef.current };
        delete snapCopy[app.id];
        followedSnapshotsRef.current = snapCopy;
        saveJsonStorage(FOLLOWED_SNAPSHOT_STORAGE_KEY, snapCopy);
        recordActivity({
          appId: app.id,
          appName: app.name,
          action: 'unfollow',
          status: 'success',
          message: `${app.name} takipten çıkarıldı.`,
        });
        pushNotification({
          kind: 'follow',
          title: 'Takip Kapatıldı',
          message: `${app.name} için bildirim takibi kapatıldı.`,
          appId: app.id,
        });
        return false;
      }

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'default'
      ) {
        try {
          await window.Notification.requestPermission();
        } catch {
          // Ignore permission denial or restricted iframe context
        }
      }

      const next = Array.from(new Set([...followedAppIdsRef.current, app.id]));
      setFollowedAppIds(next);
      saveJsonStorage(FOLLOWED_APPS_STORAGE_KEY, next);

      const nextSnapshots = {
        ...followedSnapshotsRef.current,
        [app.id]: {
          downloadable: app.downloadable !== false,
          version: app.latestVersion,
        },
      };
      followedSnapshotsRef.current = nextSnapshots;
      saveJsonStorage(FOLLOWED_SNAPSHOT_STORAGE_KEY, nextSnapshots);

      recordActivity({
        appId: app.id,
        appName: app.name,
        action: 'follow',
        version: app.latestVersion,
        status: 'success',
        message:
          app.downloadable === false
            ? `${app.name} yayınlandığında bildirim almak üzere takip edildi.`
            : `${app.name} yeni sürüm bildirimleri için takip edildi.`,
      });
      pushNotification({
        kind: 'follow',
        title: 'Bildirimler Açıldı',
        message:
          app.downloadable === false
            ? `${app.name} indirmeye açıldığında anında haber vereceğiz.`
            : `${app.name} için yeni sürüm bildirimleri aktif edildi.`,
        appId: app.id,
      });
      return true;
    },
    [pushNotification, recordActivity]
  );

  const setInstallMode = (mode: InstallMode) => {
    setInstallModeState(mode);
    localStorage.setItem(INSTALL_MODE_STORAGE_KEY, mode);
  };

  useEffect(() => {
    if (!window.anticStoreDesktop) {
      localStorage.setItem(WEB_INSTALLED_STORAGE_KEY, JSON.stringify(installedMap));
    }
  }, [installedMap]);

  const refreshInstalled = useCallback(async (catalogApps: StoreApp[] = []) => {
    if (!window.anticStoreDesktop) return;
    try {
      const records = await window.anticStoreDesktop.getInstalledApps(
        catalogApps.map(({ id, name }) => ({ appId: id, name }))
      );
      const map: Record<string, InstalledAppRecord> = {};
      for (const rec of records) {
        map[rec.appId] = rec;
      }
      setInstalledMap(map);
    } catch (err) {
      console.error('Failed to scan installed apps:', err);
    }
  }, []);

  const getAvailableChannels = useCallback(
    (app: StoreApp): ReleaseChannel[] => getAvailableReleaseChannels(app.releases),
    []
  );

  const getAppChannel = useCallback(
    (appId: string): ReleaseChannel => {
      const stored = appChannels[appId] || 'stable';
      const targetApp = apps.find((a) => a.id === appId);
      if (targetApp && targetApp.releases.length > 0) {
        const available = getAvailableReleaseChannels(targetApp.releases);
        if (!available.includes(stored)) {
          return available.includes('stable') ? 'stable' : available[0];
        }
      }
      return stored;
    },
    [appChannels, apps]
  );

  const setAppChannel = useCallback((appId: string, channel: ReleaseChannel) => {
    setAppChannelsState((prev) => {
      const next: Record<string, ReleaseChannel> = { ...prev, [appId]: channel };
      saveJsonStorage(APP_CHANNELS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const getChannelLatestRelease = useCallback(
    (app: StoreApp): StoreRelease | null => {
      const channel = getAppChannel(app.id);
      return getEffectiveLatestRelease(app.releases, channel, app.latestRelease);
    },
    [getAppChannel]
  );

  const getRollbackRelease = useCallback(
    (app: StoreApp): StoreRelease | null => {
      const inst = installedMap[app.id];
      if (!inst || app.downloadable === false || !app.releases || app.releases.length === 0) {
        return null;
      }

      if (inst.previousVersion && compareSemver(inst.previousVersion, inst.version) !== 0) {
        const prevMatch = app.releases.find(
          (r) => compareSemver(r.version, inst.previousVersion!) === 0
        );
        if (prevMatch && pickPreferredAsset(prevMatch.assets, platformInfo.platform)) {
          return prevMatch;
        }
      }

      const activeChannel = getAppChannel(app.id);
      const sameChannelOlder = app.releases
        .filter((r) => {
          const sameChan = getAvailableReleaseChannels([r])[0] === activeChannel;
          return sameChan && compareSemver(r.version, inst.version) < 0 && pickPreferredAsset(r.assets, platformInfo.platform);
        })
        .sort((a, b) => compareSemver(b.version, a.version));
      if (sameChannelOlder.length > 0) {
        return sameChannelOlder[0];
      }

      const anyOlder = app.releases
        .filter(
          (r) =>
            compareSemver(r.version, inst.version) < 0 &&
            Boolean(pickPreferredAsset(r.assets, platformInfo.platform))
        )
        .sort((a, b) => compareSemver(b.version, a.version));
      return anyOlder[0] || null;
    },
    [getAppChannel, installedMap, platformInfo.platform]
  );

  const isAutoUpdateApp = useCallback(
    (appId: string) => autoUpdateAppIds.includes(appId),
    [autoUpdateAppIds]
  );

  const toggleAutoUpdateApp = useCallback(
    (app: StoreApp): boolean => {
      const currentlyEnabled = autoUpdateAppIdsRef.current.includes(app.id);
      const next = currentlyEnabled
        ? autoUpdateAppIdsRef.current.filter((id) => id !== app.id)
        : Array.from(new Set([...autoUpdateAppIdsRef.current, app.id]));
      setAutoUpdateAppIdsState(next);
      saveJsonStorage(AUTO_UPDATE_APPS_STORAGE_KEY, next);
      pushNotification({
        kind: 'follow',
        title: !currentlyEnabled ? 'Otomatik Güncelleme Açıldı' : 'Otomatik Güncelleme Kapatıldı',
        message: !currentlyEnabled
          ? `${app.name} açık değilken yeni güncellemeler arka planda otomatik kurulacak.`
          : `${app.name} için otomatik güncelleme devre dışı bırakıldı.`,
        appId: app.id,
      });
      return !currentlyEnabled;
    },
    [pushNotification]
  );

  const refreshSystemDependencies = useCallback(async (): Promise<SystemRuntimeDependency[]> => {
    if (!window.anticStoreDesktop?.checkSystemDependencies) {
      return [];
    }
    setIsCheckingDependencies(true);
    try {
      const deps = await window.anticStoreDesktop.checkSystemDependencies();
      setSystemDependencies(deps);
      return deps;
    } catch (err) {
      console.error('Failed to check system dependencies:', err);
      return [];
    } finally {
      setIsCheckingDependencies(false);
    }
  }, []);

  const checkAppPrerequisites = useCallback(
    async (app: StoreApp): Promise<PrerequisiteStatus[]> => {
      const prereqs = resolveAppPrerequisites(app);
      if (prereqs.length === 0) return [];

      setIsCheckingPrerequisites(true);
      try {
        let statuses: PrerequisiteStatus[];
        if (window.anticStoreDesktop?.checkPrerequisites) {
          statuses = await window.anticStoreDesktop.checkPrerequisites(prereqs);
        } else {
          const checkedAt = new Date().toISOString();
          statuses = prereqs.map((prereq) => ({
            id: prereq.id,
            name: prereq.name,
            installed: false,
            supportedOnPlatform: isPrerequisiteSupportedOnPlatform(prereq, platformInfo),
            details:
              'Web önizleme modunda sistem sürücüsü taraması yapılamaz; kurulum öncesi elle kontrol edilmesi önerilir.',
            checkedAt,
          }));
        }

        setPrerequisiteStatuses((prev) => {
          const next = { ...prev };
          for (const st of statuses) {
            next[st.id] = st;
          }
          return next;
        });

        return statuses;
      } catch (err) {
        console.error('Failed to check prerequisites:', err);
        return [];
      } finally {
        setIsCheckingPrerequisites(false);
      }
    },
    [platformInfo]
  );

  const installPrerequisite = useCallback(
    async (prereq: AppPrerequisite): Promise<PrerequisiteInstallResult> => {
      const taskKey = `prereq:${prereq.id}`;
      setInstallingPrerequisiteIds((prev) => Array.from(new Set([...prev, prereq.id])));

      const actId = recordActivity({
        appId: taskKey,
        appName: prereq.name,
        action: 'install',
        status: 'in_progress',
        fileName: prereq.fileName,
        message: `${prereq.name} indiriliyor ve kuruluyor...`,
      });

      try {
        if (window.anticStoreDesktop?.installPrerequisite) {
          const result = await window.anticStoreDesktop.installPrerequisite(prereq);
          setPrerequisiteStatuses((prev) => ({
            ...prev,
            [prereq.id]: {
              id: prereq.id,
              name: prereq.name,
              installed: result.installed,
              version: result.version,
              details: result.message,
              supportedOnPlatform: true,
              checkedAt: new Date().toISOString(),
            },
          }));
          void refreshSystemDependencies();
          void refreshDownloadsCache();

          if (result.installed) {
            updateActivity(actId, {
              status: 'success',
              message: result.message,
              timestamp: new Date().toISOString(),
            });
            pushNotification({
              kind: 'install',
              title: `${prereq.name} Kuruldu`,
              message: result.rebootRecommended
                ? `${result.message} Değişikliklerin tam uygulanması için gerekirse yeniden başlatın.`
                : result.message,
              sendBrowserNotification: true,
            });
          } else {
            updateActivity(actId, {
              action: 'error',
              status: 'failed',
              message: result.message,
              timestamp: new Date().toISOString(),
            });
          }
          return result;
        }

        // Web preview fallback: download official package via /api/download proxy
        const safeFileName =
          prereq.fileName || `${prereq.id.replace(/[^a-z0-9._-]/gi, '_')}.zip`;
        const downloadTarget = prereq.downloadUrl
          ? `/api/download?url=${encodeURIComponent(prereq.downloadUrl)}&filename=${encodeURIComponent(safeFileName)}`
          : prereq.websiteUrl || '';

        if (downloadTarget.startsWith('/api/download')) {
          const anchor = document.createElement('a');
          anchor.href = downloadTarget;
          anchor.download = safeFileName;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        } else if (downloadTarget) {
          window.open(downloadTarget, '_blank', 'noopener,noreferrer');
        }

        const webMsg = `${safeFileName} tarayıcınızdan indirildi. Web önizlemede otomatik yönetici kurulumu yapılamadığı için indirdiğiniz arşivi açıp kurulumu çalıştırın.`;
        updateActivity(actId, {
          status: 'info',
          message: webMsg,
          timestamp: new Date().toISOString(),
        });
        pushNotification({
          kind: 'install',
          title: `${prereq.name} İndirildi`,
          message: webMsg,
        });
        return {
          id: prereq.id,
          installed: false,
          message: webMsg,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : `${prereq.name} kurulamadı.`;
        updateActivity(actId, {
          action: 'error',
          status: 'failed',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        pushNotification({
          kind: 'warning',
          title: `${prereq.name} Kurulum Hatası`,
          message: msg,
        });
        return {
          id: prereq.id,
          installed: false,
          message: msg,
        };
      } finally {
        setInstallingPrerequisiteIds((prev) => prev.filter((id) => id !== prereq.id));
        setTasks((prev) => {
          if (!(taskKey in prev)) return prev;
          const copy = { ...prev };
          delete copy[taskKey];
          return copy;
        });
      }
    },
    [pushNotification, recordActivity, refreshSystemDependencies, updateActivity]
  );

  const resolvePendingPrerequisitePrompt = useCallback((proceed: boolean) => {
    setPendingPrerequisitePrompt((current) => {
      if (current) {
        current.resolve(proceed);
      }
      return null;
    });
  }, []);

  const refreshDownloadsCache = useCallback(async (): Promise<DownloadsCacheInfo | null> => {
    if (!window.anticStoreDesktop?.getDownloadsCacheInfo) {
      return null;
    }
    setIsLoadingCache(true);
    try {
      const info = await window.anticStoreDesktop.getDownloadsCacheInfo();
      setDownloadsCache(info);
      return info;
    } catch (err) {
      console.error('Failed to read downloads cache:', err);
      return null;
    } finally {
      setIsLoadingCache(false);
    }
  }, []);

  const clearDownloadsCache = useCallback(async () => {
    if (!window.anticStoreDesktop?.clearDownloadsCache) {
      return { deletedCount: 0, freedBytes: 0 };
    }
    const result = await window.anticStoreDesktop.clearDownloadsCache();
    await refreshDownloadsCache();
    return result;
  }, [refreshDownloadsCache]);

  const checkAppRunning = useCallback(async (app: StoreApp): Promise<RunningProcessStatus> => {
    const inst = installedMapRef.current[app.id];
    if (!window.anticStoreDesktop?.checkAppRunning || !inst) {
      return { running: false, processNames: [], pids: [] };
    }
    return window.anticStoreDesktop.checkAppRunning({
      appId: app.id,
      name: app.name,
      executablePath: inst.executablePath,
      installLocation: inst.installLocation,
    });
  }, []);

  const stopAppProcesses = useCallback(async (app: StoreApp) => {
    const inst = installedMapRef.current[app.id];
    if (!window.anticStoreDesktop?.stopAppProcesses || !inst) {
      return { stopped: true };
    }
    return window.anticStoreDesktop.stopAppProcesses({
      appId: app.id,
      name: app.name,
      executablePath: inst.executablePath,
      installLocation: inst.installLocation,
    });
  }, []);

  const openInstallFolder = useCallback(async (app: StoreApp) => {
    const inst = installedMapRef.current[app.id];
    if (!window.anticStoreDesktop?.openInstallFolder || !inst) {
      return { opened: false, message: 'Kurulum klasörü bilgisi bulunamadı.' };
    }
    return window.anticStoreDesktop.openInstallFolder({
      appId: app.id,
      name: app.name,
      executablePath: inst.executablePath,
      installLocation: inst.installLocation,
    });
  }, []);

  const createDesktopShortcut = useCallback(async (app: StoreApp) => {
    const inst = installedMapRef.current[app.id];
    if (!window.anticStoreDesktop?.createDesktopShortcut || !inst) {
      return { created: false, message: 'Masaüstü kısayolu yalnızca masaüstü uygulamasında oluşturulabilir.' };
    }
    return window.anticStoreDesktop.createDesktopShortcut({
      appId: app.id,
      name: app.name,
      executablePath: inst.executablePath,
      installLocation: inst.installLocation,
    });
  }, []);

  useEffect(() => {
    const desktop = window.anticStoreDesktop;
    if (!desktop) return;

    desktop.getPlatformInfo().then(setPlatformInfo).catch(console.error);
    desktop
      .getGitHubTokenStatus()
      .then(({ configured, secureStorageAvailable }) => {
        setGitHubTokenConfigured(configured);
        setGitHubTokenStorageAvailable(secureStorageAvailable);
      })
      .catch(console.error)
      .finally(() => setGitHubTokenStatusLoaded(true));
    const refreshDesktopStartupStatus = () => {
      if (desktop.getAutostartStatus) {
        desktop
          .getAutostartStatus()
          .then(({ enabled, supported }) => {
            setAutostartSupported(Boolean(supported));
            setAutostartEnabledState(Boolean(enabled));
            saveJsonStorage(AUTOSTART_STORAGE_KEY, Boolean(enabled));
          })
          .catch(console.error);
      }
    };
    refreshDesktopStartupStatus();
    if (desktop.getDesktopSettings) {
      desktop
        .getDesktopSettings()
        .then((settings) => {
          setShowTrayIconState(Boolean(settings.showTrayIcon));
          saveJsonStorage(SHOW_TRAY_STORAGE_KEY, Boolean(settings.showTrayIcon));
          setAutostartInTrayState(Boolean(settings.autostartInTray));
          saveJsonStorage(AUTOSTART_IN_TRAY_STORAGE_KEY, Boolean(settings.autostartInTray));
          const behavior: DesktopWindowCloseBehavior =
            settings.closeBehavior === 'exit' ? 'exit' : 'tray';
          setCloseBehaviorState(behavior);
          saveJsonStorage(CLOSE_BEHAVIOR_STORAGE_KEY, behavior);
          setAutoCleanInstallersState(Boolean(settings.autoCleanInstallers));
          saveJsonStorage(AUTO_CLEAN_INSTALLERS_STORAGE_KEY, Boolean(settings.autoCleanInstallers));
          const nextLimit =
            Number(settings.downloadSpeedLimitBps) > 0 ? Math.round(settings.downloadSpeedLimitBps) : 0;
          setDownloadSpeedLimitBpsState(nextLimit);
          saveJsonStorage(DOWNLOAD_SPEED_LIMIT_STORAGE_KEY, nextLimit);
          const nextDir = typeof settings.customInstallDir === 'string' ? settings.customInstallDir : '';
          setCustomInstallDirState(nextDir);
          saveJsonStorage(CUSTOM_INSTALL_DIR_STORAGE_KEY, nextDir);
          const nextAskDir = Boolean(settings.askDownloadDirOnInstall);
          setAskDownloadDirOnInstallState(nextAskDir);
          saveJsonStorage(ASK_DOWNLOAD_DIR_STORAGE_KEY, nextAskDir);
        })
        .catch(console.error);
    }
    void refreshInstalled();
    void refreshSystemDependencies();
    void refreshDownloadsCache();

    window.addEventListener('focus', refreshDesktopStartupStatus);
    const unsubscribe = desktop.onTaskProgress((progress) => {
      const matched = appsRef.current.find((a) => a.id === progress.appId);
      setTasks((prev) => ({
        ...prev,
        [progress.appId]: {
          ...progress,
          appName: progress.appName || matched?.name,
        },
      }));
    });

    return () => {
      window.removeEventListener('focus', refreshDesktopStartupStatus);
      unsubscribe();
    };
  }, [refreshDownloadsCache, refreshInstalled, refreshSystemDependencies]);

  useEffect(() => {
    const desktop = window.anticStoreDesktop;
    if (!desktop?.setTaskbarProgress) return;

    const list = Object.values(tasks);
    if (list.length === 0) {
      void desktop.setTaskbarProgress(-1);
      return;
    }

    const activeOnly = list.filter((t) => t.phase !== 'queued' && t.phase !== 'paused');
    if (activeOnly.length === 0) {
      void desktop.setTaskbarProgress(-1);
      return;
    }
    const avg = activeOnly.reduce((acc, item) => acc + (Number(item.percent) || 0), 0) / activeOnly.length;
    const ratio = Math.max(0.02, Math.min(1, avg / 100));
    const label =
      activeOnly.length === 1
        ? `${activeOnly[0].appName || activeOnly[0].appId} (%${Math.round(avg)})`
        : `${activeOnly.length} işlem sürüyor (%${Math.round(avg)})`;
    void desktop.setTaskbarProgress(ratio, label);
  }, [tasks]);

  const syncSignals = useCallback(async (forceRefresh = false) => {
    if (signalsSyncInProgress.current) return;
    signalsSyncInProgress.current = true;
    setIsSyncingSignals(true);
    setSignalsError(null);
    try {
      const feed = await syncOfficialSignals(forceRefresh);
      setSignalsFeed(feed);
    } catch (err) {
      setSignalsError(err instanceof Error ? err.message : 'Sinyal akışı alınamadı.');
    } finally {
      signalsSyncInProgress.current = false;
      setIsSyncingSignals(false);
    }
  }, []);

  const markSignalsAsRead = useCallback(() => {
    const ids = signalsFeed.signals.map((s) => s.id);
    if (ids.length === 0) return;
    setSeenSignalIds((prev) => {
      const merged = Array.from(new Set([...prev, ...ids]));
      try {
        localStorage.setItem(SEEN_SIGNALS_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // Ignore storage quota errors
      }
      return merged;
    });
  }, [signalsFeed.signals]);

  const unreadSignalsCount = useMemo(
    () => signalsFeed.signals.filter((s) => !seenSignalIds.includes(s.id)).length,
    [signalsFeed.signals, seenSignalIds]
  );

  const executeInstallJob = useCallback(
    async (job: {
      app: StoreApp;
      release: StoreRelease;
      asset: StoreAsset;
      mode: 'install' | 'update' | 'reinstall';
      activityId: string;
      customDownloadDir?: string;
    }) => {
      const { app, release, asset, mode, activityId, customDownloadDir } = job;
      const previousVersion = installedMapRef.current[app.id]?.version;
      let verifiedSha256 = false;
      let wasPaused = false;

      try {
        if (window.anticStoreDesktop) {
          const result = await window.anticStoreDesktop.installApp({
            appId: app.id,
            name: app.name,
            version: release.version,
            downloadUrl: asset.downloadUrl,
            fileName: asset.name,
            silent: installMode === 'silent',
            mode,
            expectedSha256: asset.sha256,
            checksumUrl: asset.checksumUrl,
            cleanAfterInstall: customDownloadDir ? false : autoCleanInstallersRef.current,
            customInstallDir: customInstallDirRef.current,
            customDownloadDir,
          });
          if (result && result.paused) {
            wasPaused = true;
            pausedJobsRef.current.set(app.id, { app, release, asset, mode, activityId, customDownloadDir });
            const pausedReceived = result.receivedBytes ?? 0;
            const pausedTotal = result.totalBytes ?? asset.size ?? 0;
            const pausedPercent =
              pausedTotal > 0 ? Math.min(99, Math.round((pausedReceived / pausedTotal) * 100)) : 0;
            setTasks((prev) => ({
              ...prev,
              [app.id]: {
                appId: app.id,
                appName: app.name,
                phase: 'paused',
                percent: pausedPercent,
                receivedBytes: pausedReceived,
                totalBytes: pausedTotal,
                speedBps: 0,
                message: `${asset.name} duraklatıldı`,
              },
            }));
            updateActivity(activityId, {
              message: `${asset.name} indirmesi duraklatıldı.`,
            });
            return;
          }
          pausedJobsRef.current.delete(app.id);
          verifiedSha256 = Boolean(result.sha256Verified);
          setInstalledMap((prev) => ({ ...prev, [app.id]: result }));
          void refreshDownloadsCache();
        } else {
          const controller = new AbortController();
          webAbortControllers.current.set(app.id, controller);

          const savedPartial = webPartialChunksRef.current.get(app.id);
          const resumeOffset = savedPartial && savedPartial.receivedBytes > 0 ? savedPartial.receivedBytes : 0;

          setTasks((prev) => ({
            ...prev,
            [app.id]: {
              appId: app.id,
              appName: app.name,
              phase: 'downloading',
              percent:
                resumeOffset > 0 && savedPartial?.totalBytes
                  ? Math.min(99, Math.round((resumeOffset / savedPartial.totalBytes) * 100))
                  : 0,
              receivedBytes: resumeOffset,
              totalBytes: savedPartial?.totalBytes || asset.size,
              speedBps: 0,
              message: resumeOffset > 0 ? `${asset.name} devam ettiriliyor...` : `${asset.name} indiriliyor...`,
            },
          }));

          const proxyUrl = `/api/download?url=${encodeURIComponent(asset.downloadUrl)}&filename=${encodeURIComponent(asset.name)}`;
          const fetchInit: RequestInit = { signal: controller.signal };
          if (resumeOffset > 0) {
            fetchInit.headers = { Range: `bytes=${resumeOffset}-` };
          }
          const response = await fetch(proxyUrl, fetchInit);
          if (!response.ok || !response.body) {
            throw new Error(`İndirme başarısız (${response.status})`);
          }

          const isPartial = response.status === 206 && resumeOffset > 0;
          const chunks: Uint8Array[] = isPartial && savedPartial ? [...savedPartial.chunks] : [];
          let receivedBytes = isPartial ? resumeOffset : 0;
          const sessionStartBytes = receivedBytes;
          const contentLen = Number(response.headers.get('content-length') || 0);
          let totalBytes = isPartial ? receivedBytes + contentLen : contentLen || asset.size || 0;
          const contentRange = response.headers.get('content-range');
          if (isPartial && contentRange) {
            const crMatch = contentRange.match(/bytes\s+\d+-\d+\/(\d+)/i);
            if (crMatch) totalBytes = Number(crMatch[1]);
          }

          const reader = response.body.getReader();
          const startedAt = Date.now();
          let lastUiUpdate = 0;
          let throttleWindowStart = Date.now();
          let throttleWindowBytes = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              receivedBytes += value.byteLength;
              throttleWindowBytes += value.byteLength;
              webPartialChunksRef.current.set(app.id, {
                chunks,
                receivedBytes,
                totalBytes,
              });

              const limitBps = downloadSpeedLimitBpsRef.current;
              if (limitBps > 0) {
                const elapsedWindowMs = Date.now() - throttleWindowStart;
                const expectedMs = (throttleWindowBytes / limitBps) * 1000;
                if (expectedMs > elapsedWindowMs) {
                  const waitMs = Math.min(1000, Math.round(expectedMs - elapsedWindowMs));
                  if (waitMs > 0) {
                    await new Promise((res) => window.setTimeout(res, waitMs));
                  }
                }
                if (Date.now() - throttleWindowStart >= 1000) {
                  throttleWindowStart = Date.now();
                  throttleWindowBytes = 0;
                }
              }

              const now = Date.now();
              if (now - lastUiUpdate >= 100) {
                lastUiUpdate = now;
                const elapsedSec = Math.max(0.2, (now - startedAt) / 1000);
                const speedBps = Math.round(Math.max(0, receivedBytes - sessionStartBytes) / elapsedSec);
                const percent = totalBytes > 0 ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : 50;
                setTasks((prev) => ({
                  ...prev,
                  [app.id]: {
                    appId: app.id,
                    appName: app.name,
                    phase: 'downloading',
                    percent,
                    receivedBytes,
                    totalBytes,
                    speedBps,
                    message: `${asset.name} indiriliyor...`,
                  },
                }));
              }
            }
          }

          webPartialChunksRef.current.delete(app.id);
          pausedJobsRef.current.delete(app.id);

          setTasks((prev) => ({
            ...prev,
            [app.id]: {
              appId: app.id,
              appName: app.name,
              phase: 'verifying',
              percent: 100,
              receivedBytes,
              totalBytes: totalBytes || receivedBytes,
              speedBps: 0,
              message: `${asset.name} SHA-256 bütünlüğü doğrulanıyor...`,
            },
          }));

          const blob = new Blob(chunks as unknown as BlobPart[], {
            type: asset.contentType || 'application/octet-stream',
          });
          const arrayBuffer = await blob.arrayBuffer();
          const actualSha256 = await computeBufferSha256(arrayBuffer);
          if (asset.sha256 && actualSha256 && actualSha256 !== asset.sha256.toLowerCase()) {
            throw new Error(
              `SHA-256 doğrulaması başarısız (Beklenen: ${asset.sha256.slice(0, 12)}..., Hesaplanan: ${actualSha256.slice(0, 12)}...).`
            );
          }
          verifiedSha256 = Boolean(asset.sha256 && actualSha256 === asset.sha256.toLowerCase());

          const phase = mode === 'update' ? 'updating' : mode === 'reinstall' ? 'reinstalling' : 'installing';
          setTasks((prev) => ({
            ...prev,
            [app.id]: {
              appId: app.id,
              appName: app.name,
              phase,
              percent: 100,
              receivedBytes,
              totalBytes: totalBytes || receivedBytes,
              speedBps: 0,
              message: `${app.name} paketi hazırlanıyor...`,
            },
          }));

          const blobUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = blobUrl;
          anchor.download = asset.name;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

          const nowIso = new Date().toISOString();
          setInstalledMap((prev) => {
            const prevRec = prev[app.id];
            const prevVerForRollback =
              prevRec?.version && prevRec.version !== release.version
                ? prevRec.version
                : prevRec?.previousVersion;
            return {
              ...prev,
              [app.id]: {
                appId: app.id,
                name: app.name,
                version: release.version,
                previousVersion: prevVerForRollback,
                installedAt: prevRec?.installedAt || nowIso,
                updatedAt: nowIso,
                installerPath: asset.name,
                sha256: actualSha256,
                sha256Verified: verifiedSha256,
                verifiedAt: nowIso,
                sourceMode: 'web',
              },
            };
          });
        }

        const actionSuccessTitle =
          mode === 'update'
            ? `${app.name} Güncellendi`
            : mode === 'reinstall'
            ? `${app.name} Yeniden Kuruldu`
            : `${app.name} Kuruldu`;
        const actionSuccessMessage =
          mode === 'update' && previousVersion
            ? `v${previousVersion} → v${release.version} (${asset.name})`
            : `v${release.version} (${asset.name})`;

        updateActivity(activityId, {
          status: 'success',
          sha256Verified: verifiedSha256,
          message: verifiedSha256 ? `${actionSuccessMessage} · SHA-256 doğrulandı` : actionSuccessMessage,
          timestamp: new Date().toISOString(),
        });
        pushNotification({
          kind: 'install',
          title: actionSuccessTitle,
          message: verifiedSha256 ? `${actionSuccessMessage} · SHA-256 doğrulandı` : actionSuccessMessage,
          appId: app.id,
          sendBrowserNotification: true,
        });
      } catch (err) {
        if (
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.message.toLowerCase().includes('abort'))
        ) {
          if (pausedAbortAppIdsRef.current.has(app.id)) {
            pausedAbortAppIdsRef.current.delete(app.id);
            wasPaused = true;
            pausedJobsRef.current.set(app.id, {
              app,
              release,
              asset,
              mode,
              activityId,
              customDownloadDir,
            });
            const savedPartial = webPartialChunksRef.current.get(app.id);
            const rec = savedPartial?.receivedBytes || 0;
            const tot = savedPartial?.totalBytes || asset.size || 0;
            const pct = tot > 0 ? Math.min(99, Math.round((rec / tot) * 100)) : 0;
            setTasks((prev) => ({
              ...prev,
              [app.id]: {
                appId: app.id,
                appName: app.name,
                phase: 'paused',
                percent: pct,
                receivedBytes: rec,
                totalBytes: tot,
                speedBps: 0,
                message: `${asset.name} duraklatıldı`,
              },
            }));
            updateActivity(activityId, {
              message: `${asset.name} indirmesi duraklatıldı.`,
            });
            return;
          }

          updateActivity(activityId, {
            action: 'cancel',
            status: 'cancelled',
            message: `${asset.name} indirmesi kullanıcı tarafından iptal edildi.`,
            timestamp: new Date().toISOString(),
          });
        } else {
          const msg = err instanceof Error ? err.message : 'Kurulum sırasında hata oluştu.';
          setAppErrors((prev) => ({
            ...prev,
            [app.id]: msg,
          }));
          updateActivity(activityId, {
            action: 'error',
            status: 'failed',
            message: msg,
            timestamp: new Date().toISOString(),
          });
          pushNotification({
            kind: 'warning',
            title: `${app.name} İşlem Hatası`,
            message: msg,
            appId: app.id,
          });
        }
      } finally {
        webAbortControllers.current.delete(app.id);
        activeInstallAppIdsRef.current.delete(app.id);
        if (!wasPaused) {
          activeActivityIds.current.delete(app.id);
          webPartialChunksRef.current.delete(app.id);
          pausedJobsRef.current.delete(app.id);
          setTasks((prev) => {
            const copy = { ...prev };
            delete copy[app.id];
            return copy;
          });
        }
      }
    },
    [installMode, pushNotification, refreshDownloadsCache, updateActivity]
  );

  const pumpDownloadQueue = useCallback(() => {
    while (
      activeInstallAppIdsRef.current.size < MAX_CONCURRENT_DOWNLOADS &&
      queuedInstallsRef.current.length > 0
    ) {
      const nextJob = queuedInstallsRef.current.shift();
      if (!nextJob) break;

      activeInstallAppIdsRef.current.add(nextJob.app.id);
      updateActivity(nextJob.activityId, {
        message: `${nextJob.asset.name} indiriliyor (v${nextJob.release.version})...`,
      });

      void executeInstallJob(nextJob).finally(() => {
        nextJob.resolve();
        pumpDownloadQueue();
      });
    }

    if (queuedInstallsRef.current.length > 0) {
      setTasks((prev) => {
        const next = { ...prev };
        queuedInstallsRef.current.forEach((queued, idx) => {
          const existing = next[queued.app.id];
          if (existing && existing.phase === 'queued') {
            next[queued.app.id] = {
              ...existing,
              queuePosition: idx + 1,
              message: `Kuyrukta bekliyor (#${idx + 1})`,
            };
          }
        });
        return next;
      });
    }
  }, [executeInstallJob, updateActivity]);

  const clearAppError = useCallback((appId: string) => {
    setAppErrors((prev) => {
      if (!(appId in prev)) return prev;
      const copy = { ...prev };
      delete copy[appId];
      return copy;
    });
  }, []);

  const installApp = useCallback(
    async (
      app: StoreApp,
      options?: {
        release?: StoreRelease;
        asset?: StoreAsset;
        mode?: 'install' | 'update' | 'reinstall';
        resumeActivityId?: string;
        customDownloadDir?: string;
        skipPrerequisiteCheck?: boolean;
      }
    ) => {
      clearAppError(app.id);
      if (
        activeInstallAppIdsRef.current.has(app.id) ||
        pendingPrerequisiteAppIdsRef.current.has(app.id) ||
        queuedInstallsRef.current.some((q) => q.app.id === app.id)
      ) {
        return;
      }

      if (app.downloadable === false) {
        setAppErrors((prev) => ({
          ...prev,
          [app.id]: 'Bu uygulama şu anda indirmeye kapalı.',
        }));
        return;
      }

      const rawChannel = appChannelsRef.current[app.id] || 'stable';
      const availableChannels = getAvailableReleaseChannels(app.releases);
      const channel = availableChannels.includes(rawChannel)
        ? rawChannel
        : availableChannels.includes('stable')
        ? 'stable'
        : availableChannels[0];
      const release =
        options?.release || getEffectiveLatestRelease(app.releases, channel, app.latestRelease);
      if (!release) {
        const msg = 'Bu uygulama için indirilebilir bir sürüm bulunamadı.';
        setAppErrors((prev) => ({
          ...prev,
          [app.id]: msg,
        }));
        recordActivity({
          appId: app.id,
          appName: app.name,
          action: 'error',
          status: 'failed',
          message: msg,
        });
        return;
      }

      const asset = options?.asset || pickPreferredAsset(release.assets, platformInfo.platform);
      if (!asset) {
        const msg = `${release.tag} sürümünde indirilebilir kurulum paketi yok.`;
        setAppErrors((prev) => ({
          ...prev,
          [app.id]: msg,
        }));
        recordActivity({
          appId: app.id,
          appName: app.name,
          action: 'error',
          version: release.version,
          status: 'failed',
          message: msg,
        });
        return;
      }

      const mode = options?.mode || 'install';

      // Check app prerequisites BEFORE download folder dialog or main download
      if (
        mode !== 'update' &&
        !options?.skipPrerequisiteCheck &&
        !options?.resumeActivityId
      ) {
        const appPrereqs = resolveAppPrerequisites(app).filter((p) =>
          isPrerequisiteSupportedOnPlatform(p, platformInfo)
        );
        if (appPrereqs.length > 0) {
          pendingPrerequisiteAppIdsRef.current.add(app.id);
          try {
            const checkedStatuses = await checkAppPrerequisites(app);
            const statusMap: Record<string, PrerequisiteStatus> = {};
            for (const st of checkedStatuses) {
              statusMap[st.id] = st;
            }
            const missingPrereqs = appPrereqs.filter((p) => !statusMap[p.id]?.installed);
            if (missingPrereqs.length > 0) {
              const shouldContinue = await new Promise<boolean>((resolve) => {
                setPendingPrerequisitePrompt({
                  app,
                  missingPrerequisites: missingPrereqs,
                  statuses: statusMap,
                  mode,
                  resolve,
                });
              });
              if (!shouldContinue) {
                return;
              }
            }
          } finally {
            pendingPrerequisiteAppIdsRef.current.delete(app.id);
          }
        }
      }

      let chosenDownloadDir = options?.customDownloadDir;

      // Prompt for custom download folder only on non-update fresh downloads when enabled
      if (
        askDownloadDirOnInstallRef.current &&
        mode !== 'update' &&
        !options?.resumeActivityId &&
        chosenDownloadDir === undefined &&
        window.anticStoreDesktop?.chooseDownloadDirectory
      ) {
        const picked = await window.anticStoreDesktop.chooseDownloadDirectory();
        if (picked.canceled || !picked.path) {
          return;
        }
        chosenDownloadDir = picked.path;
      }

      pausedJobsRef.current.delete(app.id);

      const previousVersion = installedMapRef.current[app.id]?.version;
      const actionKind: ActivityAction =
        mode === 'update' ? 'update' : mode === 'reinstall' ? 'reinstall' : 'install';

      const shouldQueue = activeInstallAppIdsRef.current.size >= MAX_CONCURRENT_DOWNLOADS;
      let activityId = options?.resumeActivityId;
      if (activityId) {
        updateActivity(activityId, {
          status: 'in_progress',
          message: shouldQueue
            ? `${asset.name} indirme kuyruğuna alındı (v${release.version})`
            : `${asset.name} devam ettiriliyor (v${release.version})...`,
        });
      } else {
        activityId = recordActivity({
          appId: app.id,
          appName: app.name,
          action: actionKind,
          version: release.version,
          previousVersion,
          fileName: asset.name,
          fileSize: asset.size,
          status: 'in_progress',
          message: shouldQueue
            ? `${asset.name} indirme kuyruğuna alındı (v${release.version})`
            : `${asset.name} indiriliyor (v${release.version})...`,
        });
      }
      activeActivityIds.current.set(app.id, activityId);

      if (!shouldQueue) {
        activeInstallAppIdsRef.current.add(app.id);
        await executeInstallJob({
          app,
          release,
          asset,
          mode,
          activityId,
          customDownloadDir: chosenDownloadDir,
        });
        pumpDownloadQueue();
        return;
      }

      await new Promise<void>((resolve) => {
        const queuePosition = queuedInstallsRef.current.length + 1;
        queuedInstallsRef.current.push({
          app,
          release,
          asset,
          mode,
          activityId,
          customDownloadDir: chosenDownloadDir,
          resolve,
        });
        setTasks((prev) => ({
          ...prev,
          [app.id]: {
            appId: app.id,
            appName: app.name,
            phase: 'queued',
            percent: 0,
            receivedBytes: 0,
            totalBytes: asset.size || 0,
            speedBps: 0,
            queuePosition,
            message: `Kuyrukta bekliyor (#${queuePosition})`,
          },
        }));
      });
    },
    [
      checkAppPrerequisites,
      clearAppError,
      executeInstallJob,
      platformInfo,
      pumpDownloadQueue,
      recordActivity,
      updateActivity,
    ]
  );

  const installAppRef = useRef(installApp);
  installAppRef.current = installApp;

  const syncCatalog = useCallback(async () => {
    void syncSignals(true);
    if (catalogSyncInProgress.current) {
      catalogSyncRequested.current = true;
      return;
    }
    catalogSyncInProgress.current = true;

    try {
      do {
        catalogSyncRequested.current = false;
        setIsSyncing(true);
        setSyncError(null);

        try {
          const { apps: syncedApps, source, catalogDefs } = await syncOfficialCatalog(true);
          setApps(syncedApps);
          setManifestCatalogDefs(catalogDefs);
          setOfficialSource(source);
          setLastSyncedAt(new Date().toISOString());
          void preloadMediaUrls(syncedApps.map((a) => a.iconUrl), false, { maxDimension: 192 });
          void preloadMediaUrls(
            syncedApps.map((a) => a.coverUrl || a.screenshots?.[0]),
            false,
            { maxDimension: 960 }
          );
          await refreshInstalled(syncedApps);

          const currentInstalled = installedMapRef.current;
          const followedIds = followedAppIdsRef.current;
          const autoIds = autoUpdateAppIdsRef.current;
          const channels = appChannelsRef.current;
          const prevSnaps = followedSnapshotsRef.current;
          const nextSnaps = { ...prevSnaps };
          let snapsChanged = false;
          let eventsChanged = false;

          for (const app of syncedApps) {
            const channel = channels[app.id] || 'stable';
            const channelRelease = getEffectiveLatestRelease(app.releases, channel, app.latestRelease);
            const targetVersion = channelRelease?.version || app.latestVersion;
            const inst = currentInstalled[app.id];

            if (inst && isUpdateAvailable(inst.version, targetVersion) && app.downloadable !== false) {
              const shouldAutoUpdate =
                autoIds.includes(app.id) &&
                !activeInstallAppIdsRef.current.has(app.id) &&
                !queuedInstallsRef.current.some((q) => q.app.id === app.id);

              if (shouldAutoUpdate) {
                let running = false;
                if (window.anticStoreDesktop?.checkAppRunning) {
                  try {
                    const proc = await window.anticStoreDesktop.checkAppRunning({
                      appId: app.id,
                      name: app.name,
                      executablePath: inst.executablePath,
                      installLocation: inst.installLocation,
                    });
                    running = proc.running;
                  } catch {
                    running = false;
                  }
                }

                if (running) {
                  const busyKey = `autoupdate-busy:${app.id}:${targetVersion}`;
                  if (!notifiedEventsRef.current[busyKey]) {
                    notifiedEventsRef.current[busyKey] = true;
                    eventsChanged = true;
                    pushNotification({
                      kind: 'update',
                      title: `${app.name} Güncellemesi Bekliyor`,
                      message: `v${targetVersion} hazır, ancak uygulama açık olduğu için otomatik kurulum ertelendi.`,
                      appId: app.id,
                      sendBrowserNotification: true,
                    });
                  }
                } else {
                  void installAppRef.current(app, {
                    release: channelRelease || undefined,
                    mode: 'update',
                  });
                }
              }

              const eventKey = `update:${app.id}:${channel}:${targetVersion}`;
              if (!notifiedEventsRef.current[eventKey]) {
                notifiedEventsRef.current[eventKey] = true;
                eventsChanged = true;
                recordActivity({
                  appId: app.id,
                  appName: app.name,
                  action: 'update_found',
                  version: targetVersion,
                  previousVersion: inst.version,
                  status: 'info',
                  message: `Yeni sürüm tespit edildi: v${inst.version} → v${targetVersion}`,
                });
                pushNotification({
                  kind: 'update',
                  title: `${app.name} Güncellemesi Hazır`,
                  message: `v${inst.version} → v${targetVersion} sürümü indirilebilir durumda.`,
                  appId: app.id,
                  showToast: false,
                  sendBrowserNotification: true,
                });
              }
            }

            if (followedIds.includes(app.id)) {
              const prevSnap = prevSnaps[app.id];
              const nowDownloadable = app.downloadable !== false;
              if (prevSnap) {
                if (!prevSnap.downloadable && nowDownloadable) {
                  pushNotification({
                    kind: 'release',
                    title: `${app.name} Yayında!`,
                    message: `Takip ettiğiniz ${app.name} (v${targetVersion}) artık indirilebilir.`,
                    appId: app.id,
                    sendBrowserNotification: true,
                  });
                } else if (prevSnap.version !== targetVersion && nowDownloadable) {
                  pushNotification({
                    kind: 'release',
                    title: `${app.name} Yeni Sürüm`,
                    message: `Takip ettiğiniz uygulama v${targetVersion} sürümüne güncellendi.`,
                    appId: app.id,
                    sendBrowserNotification: true,
                  });
                }
              }
              if (
                !prevSnap ||
                prevSnap.downloadable !== nowDownloadable ||
                prevSnap.version !== targetVersion
              ) {
                nextSnaps[app.id] = {
                  downloadable: nowDownloadable,
                  version: targetVersion,
                };
                snapsChanged = true;
              }
            }
          }

          if (snapsChanged) {
            followedSnapshotsRef.current = nextSnaps;
            saveJsonStorage(FOLLOWED_SNAPSHOT_STORAGE_KEY, nextSnaps);
          }
          if (eventsChanged) {
            saveJsonStorage(NOTIFIED_EVENTS_STORAGE_KEY, notifiedEventsRef.current);
          }
        } catch (err) {
          setSyncError(err instanceof Error ? err.message : 'Katalog senkronizasyonu başarısız.');
        }
      } while (catalogSyncRequested.current);
    } finally {
      catalogSyncInProgress.current = false;
      setIsSyncing(false);
    }
  }, [pushNotification, recordActivity, refreshInstalled, syncSignals]);

  useEffect(() => {
    void syncCatalog();
    const intervalId = window.setInterval(() => {
      if (window.anticStoreDesktop || document.visibilityState === 'visible') {
        void syncCatalog();
      }
    }, 15 * 60 * 1000);
    const unsubscribeTraySync = window.anticStoreDesktop?.onSyncRequested?.(() => {
      void syncCatalog();
    });
    return () => {
      window.clearInterval(intervalId);
      unsubscribeTraySync?.();
    };
  }, [syncCatalog]);

  const saveGitHubToken = useCallback(
    async (token: string) => {
      const desktop = window.anticStoreDesktop;
      if (!desktop) {
        throw new Error('GitHub anahtarı yalnızca Koru masaüstü uygulamasında güvenle saklanabilir.');
      }
      await desktop.saveGitHubToken(token);
      setGitHubTokenConfigured(true);
      await syncCatalog();
    },
    [syncCatalog]
  );

  const clearGitHubToken = useCallback(async () => {
    const desktop = window.anticStoreDesktop;
    if (!desktop) {
      throw new Error('GitHub anahtarı yalnızca Koru masaüstü uygulamasında yönetilebilir.');
    }
    await desktop.clearGitHubToken();
    const status = await desktop.getGitHubTokenStatus();
    setGitHubTokenConfigured(status.configured);
    await syncCatalog();
  }, [syncCatalog]);

  const updateApp = async (app: StoreApp) => {
    const release = getChannelLatestRelease(app) || app.latestRelease || undefined;
    await installApp(app, { release, mode: 'update' });
  };

  const reinstallApp = async (app: StoreApp) => {
    const release = getChannelLatestRelease(app) || app.latestRelease || undefined;
    await installApp(app, { release, mode: 'reinstall' });
  };

  const rollbackApp = async (app: StoreApp) => {
    const rollbackRelease = getRollbackRelease(app);
    if (!rollbackRelease) return;
    await installApp(app, { release: rollbackRelease, mode: 'reinstall' });
  };

  const uninstallApp = async (app: StoreApp) => {
    clearAppError(app.id);
    const existing = installedMap[app.id];
    if (!existing) return;

    const uninstallActivityId = recordActivity({
      appId: app.id,
      appName: app.name,
      action: 'uninstall',
      version: existing.version,
      status: 'in_progress',
      message: `${app.name} (v${existing.version}) kaldırılıyor...`,
    });

    try {
      setTasks((prev) => ({
        ...prev,
        [app.id]: {
          appId: app.id,
          phase: 'uninstalling',
          percent: 50,
          receivedBytes: 0,
          totalBytes: 0,
          speedBps: 0,
          message: `${app.name} kaldırılıyor...`,
        },
      }));

      if (window.anticStoreDesktop) {
        await window.anticStoreDesktop.uninstallApp({
          appId: app.id,
          name: app.name,
          uninstallString: existing.uninstallString,
          installLocation: existing.installLocation,
          silent: installMode === 'silent',
        });
      }

      setInstalledMap((prev) => {
        const copy = { ...prev };
        delete copy[app.id];
        return copy;
      });

      updateActivity(uninstallActivityId, {
        status: 'success',
        message: `v${existing.version} sürümü kaldırıldı.`,
        timestamp: new Date().toISOString(),
      });
      pushNotification({
        kind: 'install',
        title: `${app.name} Kaldırıldı`,
        message: `v${existing.version} sürümü başarıyla kaldırıldı.`,
        appId: app.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaldırma işlemi başarısız oldu.';
      setAppErrors((prev) => ({
        ...prev,
        [app.id]: msg,
      }));
      updateActivity(uninstallActivityId, {
        action: 'error',
        status: 'failed',
        message: msg,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setTasks((prev) => {
        const copy = { ...prev };
        delete copy[app.id];
        return copy;
      });
    }
  };

  const launchApp = async (app: StoreApp) => {
    const existing = installedMap[app.id];
    if (!existing) {
      return { launched: false, message: 'Uygulama henüz kurulmamış.' };
    }
    if (window.anticStoreDesktop) {
      const result = await window.anticStoreDesktop.launchApp({
        appId: app.id,
        name: app.name,
        executablePath: existing.executablePath,
        installLocation: existing.installLocation,
      });
      if (result.launched) {
        recordActivity({
          appId: app.id,
          appName: app.name,
          action: 'launch',
          version: existing.version,
          status: 'info',
          message: `${app.name} (v${existing.version}) başlatıldı.`,
        });
      }
      return result;
    }
    return {
      launched: false,
      message: `Web önizleme modunda "${existing.installerPath || app.name}" dosyası tarayıcınız tarafından indirildi. Doğrudan başlatma ve tek tıkla kurulum için Koru Masaüstü uygulamasını kullanın.`,
    };
  };

  const pauseTask = async (appId: string) => {
    const queuedIdx = queuedInstallsRef.current.findIndex((q) => q.app.id === appId);
    if (queuedIdx !== -1) {
      const [removed] = queuedInstallsRef.current.splice(queuedIdx, 1);
      pausedJobsRef.current.set(appId, {
        app: removed.app,
        release: removed.release,
        asset: removed.asset,
        mode: removed.mode,
        activityId: removed.activityId,
        customDownloadDir: removed.customDownloadDir,
      });
      updateActivity(removed.activityId, {
        message: `${removed.asset.name} duraklatıldı.`,
      });
      setTasks((prev) => {
        const copy = { ...prev };
        copy[appId] = {
          appId,
          appName: removed.app.name,
          phase: 'paused',
          percent: 0,
          receivedBytes: 0,
          totalBytes: removed.asset.size || 0,
          speedBps: 0,
          message: `${removed.asset.name} duraklatıldı`,
        };
        queuedInstallsRef.current.forEach((queued, idx) => {
          const item = copy[queued.app.id];
          if (item && item.phase === 'queued') {
            copy[queued.app.id] = {
              ...item,
              queuePosition: idx + 1,
              message: `Kuyrukta bekliyor (#${idx + 1})`,
            };
          }
        });
        return copy;
      });
      removed.resolve();
      return;
    }

    if (!activeInstallAppIdsRef.current.has(appId)) return;

    if (window.anticStoreDesktop?.pauseDownload) {
      await window.anticStoreDesktop.pauseDownload(appId);
    } else {
      const controller = webAbortControllers.current.get(appId);
      if (controller) {
        pausedAbortAppIdsRef.current.add(appId);
        controller.abort();
      }
    }
  };

  const resumeTask = async (appId: string) => {
    const saved = pausedJobsRef.current.get(appId);
    if (!saved) return;
    pausedJobsRef.current.delete(appId);
    await installApp(saved.app, {
      release: saved.release,
      asset: saved.asset,
      mode: saved.mode,
      resumeActivityId: saved.activityId,
      customDownloadDir: saved.customDownloadDir,
    });
  };

  const cancelTask = async (appId: string) => {
    const pausedJob = pausedJobsRef.current.get(appId);
    if (pausedJob) {
      pausedJobsRef.current.delete(appId);
      webPartialChunksRef.current.delete(appId);
      if (window.anticStoreDesktop?.cancelDownload) {
        await window.anticStoreDesktop.cancelDownload(appId);
      }
      updateActivity(pausedJob.activityId, {
        action: 'cancel',
        status: 'cancelled',
        message: `${pausedJob.asset.name} indirmesi iptal edildi.`,
        timestamp: new Date().toISOString(),
      });
      activeActivityIds.current.delete(appId);
      setTasks((prev) => {
        const copy = { ...prev };
        delete copy[appId];
        return copy;
      });
      return;
    }

    const queuedIdx = queuedInstallsRef.current.findIndex((q) => q.app.id === appId);
    if (queuedIdx !== -1) {
      const [removed] = queuedInstallsRef.current.splice(queuedIdx, 1);
      updateActivity(removed.activityId, {
        action: 'cancel',
        status: 'cancelled',
        message: `${removed.asset.name} kuyruktan çıkarıldı.`,
        timestamp: new Date().toISOString(),
      });
      activeActivityIds.current.delete(appId);
      setTasks((prev) => {
        const copy = { ...prev };
        delete copy[appId];
        queuedInstallsRef.current.forEach((queued, idx) => {
          const item = copy[queued.app.id];
          if (item && item.phase === 'queued') {
            copy[queued.app.id] = {
              ...item,
              queuePosition: idx + 1,
              message: `Kuyrukta bekliyor (#${idx + 1})`,
            };
          }
        });
        return copy;
      });
      removed.resolve();
      return;
    }

    pausedAbortAppIdsRef.current.delete(appId);
    webPartialChunksRef.current.delete(appId);
    const activityId = activeActivityIds.current.get(appId);
    if (window.anticStoreDesktop) {
      await window.anticStoreDesktop.cancelDownload(appId);
      if (activityId) {
        updateActivity(activityId, {
          action: 'cancel',
          status: 'cancelled',
          message: 'İndirme kullanıcı tarafından iptal edildi.',
          timestamp: new Date().toISOString(),
        });
        activeActivityIds.current.delete(appId);
      }
    } else {
      const controller = webAbortControllers.current.get(appId);
      if (controller) controller.abort();
    }
    setTasks((prev) => {
      const copy = { ...prev };
      delete copy[appId];
      return copy;
    });
  };

  const exportStoreProfile = useCallback((): KoruProfileManifest => {
    const installedList = Object.values(installedMap).map((rec) => ({
      appId: rec.appId,
      name: rec.name,
      version: rec.version,
      channel: appChannels[rec.appId] || 'stable',
    }));
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      packageId: platformInfo.packageId,
      installedApps: installedList,
      followedAppIds: [...followedAppIds],
      autoUpdateAppIds: [...autoUpdateAppIds],
      appChannels: { ...appChannels },
      preferences: {
        installMode,
        desktopNotificationsEnabled,
        inAppNotificationsEnabled,
        autoCleanInstallers,
        downloadSpeedLimitBps,
        customInstallDir,
        askDownloadDirOnInstall,
      },
    };
  }, [
    appChannels,
    askDownloadDirOnInstall,
    autoCleanInstallers,
    autoUpdateAppIds,
    customInstallDir,
    desktopNotificationsEnabled,
    downloadSpeedLimitBps,
    followedAppIds,
    inAppNotificationsEnabled,
    installMode,
    installedMap,
    platformInfo.packageId,
  ]);

  const importStoreProfile = useCallback(
    (rawJson: string) => {
      const parsed = JSON.parse(rawJson) as Partial<KoruProfileManifest>;
      if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1) {
        throw new Error('Geçersiz Koru profil dosyası (.koruprofile.json).');
      }

      if (parsed.appChannels && typeof parsed.appChannels === 'object') {
        const sanitizedChannels: Record<string, ReleaseChannel> = {};
        for (const [k, v] of Object.entries(parsed.appChannels)) {
          if (v === 'beta' || v === 'nightly' || v === 'rc' || v === 'stable') sanitizedChannels[k] = v;
        }
        setAppChannelsState((prev) => {
          const next = { ...prev, ...sanitizedChannels };
          saveJsonStorage(APP_CHANNELS_STORAGE_KEY, next);
          return next;
        });
      }

      if (Array.isArray(parsed.followedAppIds)) {
        const validIds = parsed.followedAppIds.filter((id): id is string => typeof id === 'string');
        setFollowedAppIds((prev) => {
          const next = Array.from(new Set([...prev, ...validIds]));
          saveJsonStorage(FOLLOWED_APPS_STORAGE_KEY, next);
          return next;
        });
      }

      if (Array.isArray(parsed.autoUpdateAppIds)) {
        const validAutoIds = parsed.autoUpdateAppIds.filter((id): id is string => typeof id === 'string');
        setAutoUpdateAppIdsState((prev) => {
          const next = Array.from(new Set([...prev, ...validAutoIds]));
          saveJsonStorage(AUTO_UPDATE_APPS_STORAGE_KEY, next);
          return next;
        });
      }

      if (parsed.preferences) {
        if (parsed.preferences.installMode === 'silent' || parsed.preferences.installMode === 'interactive') {
          setInstallMode(parsed.preferences.installMode);
        }
        if (typeof parsed.preferences.desktopNotificationsEnabled === 'boolean') {
          setDesktopNotificationsEnabled(parsed.preferences.desktopNotificationsEnabled);
        }
        if (typeof parsed.preferences.inAppNotificationsEnabled === 'boolean') {
          setInAppNotificationsEnabled(parsed.preferences.inAppNotificationsEnabled);
        }
        if (typeof parsed.preferences.autoCleanInstallers === 'boolean') {
          void setAutoCleanInstallers(parsed.preferences.autoCleanInstallers);
        }
        if (typeof parsed.preferences.downloadSpeedLimitBps === 'number') {
          void setDownloadSpeedLimit(parsed.preferences.downloadSpeedLimitBps);
        }
        if (typeof parsed.preferences.customInstallDir === 'string') {
          void setCustomInstallDir(parsed.preferences.customInstallDir);
        }
        if (typeof parsed.preferences.askDownloadDirOnInstall === 'boolean') {
          void setAskDownloadDirOnInstall(parsed.preferences.askDownloadDirOnInstall);
        }
      }

      const profileApps = Array.isArray(parsed.installedApps) ? parsed.installedApps : [];
      const missingApps: StoreApp[] = [];
      for (const entry of profileApps) {
        if (!entry?.appId) continue;
        if (installedMapRef.current[entry.appId]) continue;
        const catalogApp = apps.find((a) => a.id === entry.appId);
        if (catalogApp && catalogApp.downloadable !== false) {
          missingApps.push(catalogApp);
        }
      }

      const normalizedManifest: KoruProfileManifest = {
        schemaVersion: 1,
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        packageId: parsed.packageId || platformInfo.packageId,
        installedApps: profileApps,
        followedAppIds: parsed.followedAppIds || [],
        autoUpdateAppIds: parsed.autoUpdateAppIds || [],
        appChannels: parsed.appChannels || {},
        preferences: parsed.preferences || {
          installMode,
          desktopNotificationsEnabled,
          inAppNotificationsEnabled,
          autoCleanInstallers,
          downloadSpeedLimitBps,
          customInstallDir,
          askDownloadDirOnInstall,
        },
      };

      pushNotification({
        kind: 'follow',
        title: 'Profil İçe Aktarıldı',
        message:
          missingApps.length > 0
            ? `Tercihler uygulandı. Kurulabilecek ${missingApps.length} eksik uygulama bulundu.`
            : 'Tercihleriniz ve abonelikleriniz başarıyla geri yüklendi.',
      });

      return { manifest: normalizedManifest, missingApps };
    },
    [
      apps,
      askDownloadDirOnInstall,
      autoCleanInstallers,
      customInstallDir,
      desktopNotificationsEnabled,
      downloadSpeedLimitBps,
      inAppNotificationsEnabled,
      installMode,
      platformInfo.packageId,
      pushNotification,
      setAskDownloadDirOnInstall,
      setAutoCleanInstallers,
      setCustomInstallDir,
      setDesktopNotificationsEnabled,
      setDownloadSpeedLimit,
      setInAppNotificationsEnabled,
    ]
  );

  const restoreProfileApps = useCallback(
    async (appIds: string[]): Promise<number> => {
      const targets = appIds
        .map((id) => apps.find((a) => a.id === id))
        .filter((a): a is StoreApp => Boolean(a && a.downloadable !== false && !installedMapRef.current[a.id]));
      if (targets.length === 0) return 0;

      await Promise.all(
        targets.map((target) => {
          const release = getChannelLatestRelease(target) || undefined;
          return installApp(target, { release, mode: 'install' });
        })
      );
      return targets.length;
    },
    [apps, getChannelLatestRelease, installApp]
  );

  const installedApps = useMemo(
    () => apps.filter((a) => Boolean(installedMap[a.id])),
    [apps, installedMap]
  );

  const updatableApps = useMemo(
    () =>
      apps.filter((a) => {
        const inst = installedMap[a.id];
        if (!inst) return false;
        const effectiveRelease = getChannelLatestRelease(a);
        const latestVer = effectiveRelease?.version || a.latestVersion;
        return isUpdateAvailable(inst.version, latestVer);
      }),
    [apps, getChannelLatestRelease, installedMap]
  );

  const catalogs = useMemo<CatalogDefinition[]>(() => {
    const defMap = new Map<string, CatalogDefinition>();
    for (const def of manifestCatalogDefs) {
      defMap.set(def.id, { ...def, count: 0 });
    }

    for (const app of apps) {
      const existing = defMap.get(app.catalogId);
      if (existing) {
        existing.count = (existing.count || 0) + 1;
      } else {
        defMap.set(app.catalogId, {
          id: app.catalogId,
          label: app.catalogLabel,
          order: app.catalogId === 'general' ? -1 : defMap.size,
          count: 1,
        });
      }
    }

    return Array.from(defMap.values())
      .filter((c) => (c.count || 0) > 0)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.label.localeCompare(b.label, 'tr'));
  }, [apps, manifestCatalogDefs]);

  useEffect(() => {
    if (activeCatalog !== 'all' && catalogs.length > 0 && !catalogs.some((c) => c.id === activeCatalog)) {
      setActiveCatalog('all');
    }
  }, [activeCatalog, catalogs]);

  const updateAllApps = async () => {
    const ready = updatableApps.filter((a) => a.downloadable !== false);
    await Promise.all(ready.map((app) => updateApp(app)));
  };

  return (
    <StoreContext.Provider
      value={{
        platformInfo,
        officialSource,
        apps,
        catalogs,
        activeCatalog,
        setActiveCatalog,
        installedMap,
        tasks,
        appErrors,
        githubTokenConfigured,
        githubTokenStorageAvailable,
        githubTokenStatusLoaded,
        syncError,
        isSyncing,
        lastSyncedAt,
        installMode,
        updatableApps,
        installedApps,
        signalsFeed,
        isSyncingSignals,
        signalsError,
        unreadSignalsCount,
        notifications,
        unreadNotificationsCount,
        activeToasts,
        followedAppIds,
        autoUpdateAppIds,
        appChannels,
        autoCleanInstallers,
        downloadSpeedLimitBps,
        customInstallDir,
        askDownloadDirOnInstall,
        systemDependencies,
        isCheckingDependencies,
        prerequisiteStatuses,
        isCheckingPrerequisites,
        installingPrerequisiteIds,
        pendingPrerequisitePrompt,
        resolvePendingPrerequisitePrompt,
        checkAppPrerequisites,
        installPrerequisite,
        downloadsCache,
        isLoadingCache,
        activityHistory,
        notificationPermission,
        desktopNotificationsEnabled,
        inAppNotificationsEnabled,
        autostartEnabled,
        autostartSupported,
        autostartUpdating,
        autostartInTray,
        showTrayIcon,
        closeBehavior,
        setInstallMode,
        setDesktopNotificationsEnabled,
        setInAppNotificationsEnabled,
        requestNotificationPermission,
        sendTestNotification,
        toggleAutostart,
        setAutostartInTray,
        setShowTrayIcon,
        setCloseBehavior,
        setAutoCleanInstallers,
        setDownloadSpeedLimit,
        setCustomInstallDir,
        chooseCustomInstallDir,
        setAskDownloadDirOnInstall,
        getAvailableChannels,
        getAppChannel,
        setAppChannel,
        getChannelLatestRelease,
        getRollbackRelease,
        isAutoUpdateApp,
        toggleAutoUpdateApp,
        refreshSystemDependencies,
        refreshDownloadsCache,
        clearDownloadsCache,
        checkAppRunning,
        stopAppProcesses,
        openInstallFolder,
        createDesktopShortcut,
        exportStoreProfile,
        importStoreProfile,
        restoreProfileApps,
        syncCatalog,
        syncSignals,
        markSignalsAsRead,
        markNotificationRead,
        markAllNotificationsRead,
        clearNotifications,
        dismissToast,
        isFollowingApp,
        toggleFollowApp,
        clearActivityHistory,
        saveGitHubToken,
        clearGitHubToken,
        installApp,
        updateApp,
        updateAllApps,
        reinstallApp,
        rollbackApp,
        uninstallApp,
        launchApp,
        pauseTask,
        resumeTask,
        cancelTask,
        clearAppError,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used within StoreProvider');
  }
  return ctx;
}
