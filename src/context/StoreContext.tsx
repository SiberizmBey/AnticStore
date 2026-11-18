import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityAction,
  ActivityLogEntry,
  AppTaskProgress,
  CatalogDefinition,
  CatalogSource,
  InstallMode,
  InstalledAppRecord,
  NotificationKind,
  PlatformInfo,
  SignalsManifest,
  StoreApp,
  StoreAsset,
  StoreNotification,
  StoreRelease,
} from '../types';
import { OFFICIAL_STORE_REPO, syncOfficialCatalog, syncOfficialSignals } from '../services/catalogService';
import { preloadMediaUrls } from '../services/mediaCache';
import { isUpdateAvailable, pickPreferredAsset } from '../utils/semver';

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

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

interface FollowedAppSnapshot {
  downloadable: boolean;
  version: string;
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
  activityHistory: ActivityLogEntry[];
  notificationPermission: BrowserNotificationPermission;
  desktopNotificationsEnabled: boolean;
  inAppNotificationsEnabled: boolean;
  autostartEnabled: boolean;
  autostartSupported: boolean;
  setInstallMode: (mode: InstallMode) => void;
  setDesktopNotificationsEnabled: (enabled: boolean) => void;
  setInAppNotificationsEnabled: (enabled: boolean) => void;
  requestNotificationPermission: () => Promise<BrowserNotificationPermission>;
  sendTestNotification: () => Promise<void>;
  toggleAutostart: (enabled: boolean) => Promise<void>;
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
    options?: { release?: StoreRelease; asset?: StoreAsset; mode?: 'install' | 'update' | 'reinstall' }
  ) => Promise<void>;
  updateApp: (app: StoreApp) => Promise<void>;
  updateAllApps: () => Promise<void>;
  reinstallApp: (app: StoreApp) => Promise<void>;
  uninstallApp: (app: StoreApp) => Promise<void>;
  launchApp: (app: StoreApp) => Promise<{ launched: boolean; message?: string }>;
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
  const [installMode, setInstallModeState] = useState<InstallMode>(() => {
    const saved = localStorage.getItem(INSTALL_MODE_STORAGE_KEY);
    return saved === 'silent' ? 'silent' : 'interactive';
  });

  const webAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const activeActivityIds = useRef<Map<string, string>>(new Map());
  const catalogSyncInProgress = useRef(false);
  const catalogSyncRequested = useRef(false);
  const signalsSyncInProgress = useRef(false);
  const followedSnapshotsRef = useRef<Record<string, FollowedAppSnapshot>>(
    loadJsonStorage<Record<string, FollowedAppSnapshot>>(FOLLOWED_SNAPSHOT_STORAGE_KEY, {})
  );
  const notifiedEventsRef = useRef<Record<string, boolean>>(
    loadJsonStorage<Record<string, boolean>>(NOTIFIED_EVENTS_STORAGE_KEY, {})
  );
  const installedMapRef = useRef(installedMap);
  installedMapRef.current = installedMap;
  const followedAppIdsRef = useRef(followedAppIds);
  followedAppIdsRef.current = followedAppIds;
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
    if (window.anticStoreDesktop?.setAutostartEnabled) {
      try {
        const res = await window.anticStoreDesktop.setAutostartEnabled(enabled);
        setAutostartSupported(Boolean(res.supported));
        setAutostartEnabledState(Boolean(res.enabled));
        saveJsonStorage(AUTOSTART_STORAGE_KEY, Boolean(res.enabled));
        return;
      } catch (err) {
        console.error('Failed to update autostart setting:', err);
      }
    }
    setAutostartEnabledState(enabled);
    saveJsonStorage(AUTOSTART_STORAGE_KEY, enabled);
  }, []);

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
    void refreshInstalled();

    const unsubscribe = desktop.onTaskProgress((progress) => {
      setTasks((prev) => ({
        ...prev,
        [progress.appId]: progress,
      }));
    });

    return unsubscribe;
  }, [refreshInstalled]);

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
          void preloadMediaUrls(syncedApps.map((a) => a.iconUrl));
          await refreshInstalled(syncedApps);

          // Check updates & followed apps release/availability notifications
          const currentInstalled = installedMapRef.current;
          const followedIds = followedAppIdsRef.current;
          const prevSnaps = followedSnapshotsRef.current;
          const nextSnaps = { ...prevSnaps };
          let snapsChanged = false;
          let eventsChanged = false;

          for (const app of syncedApps) {
            const inst = currentInstalled[app.id];
            if (inst && isUpdateAvailable(inst.version, app.latestVersion) && app.downloadable !== false) {
              const eventKey = `update:${app.id}:${app.latestVersion}`;
              if (!notifiedEventsRef.current[eventKey]) {
                notifiedEventsRef.current[eventKey] = true;
                eventsChanged = true;
                recordActivity({
                  appId: app.id,
                  appName: app.name,
                  action: 'update_found',
                  version: app.latestVersion,
                  previousVersion: inst.version,
                  status: 'info',
                  message: `Yeni sürüm tespit edildi: v${inst.version} → v${app.latestVersion}`,
                });
                pushNotification({
                  kind: 'update',
                  title: `${app.name} Güncellemesi Hazır`,
                  message: `v${inst.version} → v${app.latestVersion} sürümü indirilebilir durumda.`,
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
                    message: `Takip ettiğiniz ${app.name} (v${app.latestVersion}) artık indirilebilir.`,
                    appId: app.id,
                    sendBrowserNotification: true,
                  });
                } else if (prevSnap.version !== app.latestVersion && nowDownloadable) {
                  pushNotification({
                    kind: 'release',
                    title: `${app.name} Yeni Sürüm`,
                    message: `Takip ettiğiniz uygulama v${app.latestVersion} sürümüne güncellendi.`,
                    appId: app.id,
                    sendBrowserNotification: true,
                  });
                }
              }
              if (
                !prevSnap ||
                prevSnap.downloadable !== nowDownloadable ||
                prevSnap.version !== app.latestVersion
              ) {
                nextSnaps[app.id] = {
                  downloadable: nowDownloadable,
                  version: app.latestVersion,
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
      if (document.visibilityState === 'visible') {
        void syncCatalog();
      }
    }, 15 * 60 * 1000);
    return () => window.clearInterval(intervalId);
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

  const clearAppError = (appId: string) => {
    setAppErrors((prev) => {
      if (!(appId in prev)) return prev;
      const copy = { ...prev };
      delete copy[appId];
      return copy;
    });
  };

  const installApp = async (
    app: StoreApp,
    options?: { release?: StoreRelease; asset?: StoreAsset; mode?: 'install' | 'update' | 'reinstall' }
  ) => {
    clearAppError(app.id);
    if (app.downloadable === false) {
      setAppErrors((prev) => ({
        ...prev,
        [app.id]: 'Bu uygulama şu anda indirmeye kapalı.',
      }));
      return;
    }
    const release = options?.release || app.latestRelease;
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
    const previousVersion = installedMapRef.current[app.id]?.version;
    const actionKind: ActivityAction =
      mode === 'update' ? 'update' : mode === 'reinstall' ? 'reinstall' : 'install';

    const activityId = recordActivity({
      appId: app.id,
      appName: app.name,
      action: actionKind,
      version: release.version,
      previousVersion,
      fileName: asset.name,
      fileSize: asset.size,
      status: 'in_progress',
      message: `${asset.name} indiriliyor (v${release.version})...`,
    });
    activeActivityIds.current.set(app.id, activityId);

    try {
      if (window.anticStoreDesktop) {
        const record = await window.anticStoreDesktop.installApp({
          appId: app.id,
          name: app.name,
          version: release.version,
          downloadUrl: asset.downloadUrl,
          fileName: asset.name,
          silent: installMode === 'silent',
          mode,
        });
        setInstalledMap((prev) => ({ ...prev, [app.id]: record }));
      } else {
        const controller = new AbortController();
        webAbortControllers.current.set(app.id, controller);

        setTasks((prev) => ({
          ...prev,
          [app.id]: {
            appId: app.id,
            phase: 'downloading',
            percent: 0,
            receivedBytes: 0,
            totalBytes: asset.size,
            speedBps: 0,
            message: `${asset.name} indiriliyor...`,
          },
        }));

        const proxyUrl = `/api/download?url=${encodeURIComponent(asset.downloadUrl)}&filename=${encodeURIComponent(asset.name)}`;
        const response = await fetch(proxyUrl, { signal: controller.signal });
        if (!response.ok || !response.body) {
          throw new Error(`İndirme başarısız (${response.status})`);
        }

        const totalBytes = Number(response.headers.get('content-length') || asset.size || 0);
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;
        const startedAt = Date.now();
        let lastUiUpdate = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.byteLength;
            const now = Date.now();
            if (now - lastUiUpdate >= 100) {
              lastUiUpdate = now;
              const elapsedSec = Math.max(0.2, (now - startedAt) / 1000);
              const speedBps = Math.round(receivedBytes / elapsedSec);
              const percent = totalBytes > 0 ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : 50;
              setTasks((prev) => ({
                ...prev,
                [app.id]: {
                  appId: app.id,
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

        const phase = mode === 'update' ? 'updating' : mode === 'reinstall' ? 'reinstalling' : 'installing';
        setTasks((prev) => ({
          ...prev,
          [app.id]: {
            appId: app.id,
            phase,
            percent: 100,
            receivedBytes,
            totalBytes: totalBytes || receivedBytes,
            speedBps: 0,
            message: `${app.name} paketi hazırlanıyor...`,
          },
        }));

        const blob = new Blob(chunks as unknown as BlobPart[], {
          type: asset.contentType || 'application/octet-stream',
        });
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = asset.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

        const nowIso = new Date().toISOString();
        setInstalledMap((prev) => ({
          ...prev,
          [app.id]: {
            appId: app.id,
            name: app.name,
            version: release.version,
            installedAt: prev[app.id]?.installedAt || nowIso,
            updatedAt: nowIso,
            installerPath: asset.name,
            sourceMode: 'web',
          },
        }));
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
        message: actionSuccessMessage,
        timestamp: new Date().toISOString(),
      });
      pushNotification({
        kind: 'install',
        title: actionSuccessTitle,
        message: actionSuccessMessage,
        appId: app.id,
        sendBrowserNotification: true,
      });
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.message.toLowerCase().includes('abort'))
      ) {
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
      activeActivityIds.current.delete(app.id);
      webAbortControllers.current.delete(app.id);
      setTasks((prev) => {
        const copy = { ...prev };
        delete copy[app.id];
        return copy;
      });
    }
  };

  const updateApp = async (app: StoreApp) => {
    await installApp(app, { mode: 'update' });
  };

  const reinstallApp = async (app: StoreApp) => {
    await installApp(app, { mode: 'reinstall' });
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

  const cancelTask = async (appId: string) => {
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

  const installedApps = useMemo(
    () => apps.filter((a) => Boolean(installedMap[a.id])),
    [apps, installedMap]
  );

  const updatableApps = useMemo(
    () =>
      apps.filter((a) => {
        const inst = installedMap[a.id];
        return Boolean(inst && isUpdateAvailable(inst.version, a.latestVersion));
      }),
    [apps, installedMap]
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
    for (const app of updatableApps) {
      if (app.downloadable === false) continue;
      await updateApp(app);
    }
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
        activityHistory,
        notificationPermission,
        desktopNotificationsEnabled,
        inAppNotificationsEnabled,
        autostartEnabled,
        autostartSupported,
        setInstallMode,
        setDesktopNotificationsEnabled,
        setInAppNotificationsEnabled,
        requestNotificationPermission,
        sendTestNotification,
        toggleAutostart,
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
        uninstallApp,
        launchApp,
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
