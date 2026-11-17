import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppTaskProgress,
  CatalogSource,
  InstallMode,
  InstalledAppRecord,
  PlatformInfo,
  SignalsManifest,
  StoreApp,
  StoreAsset,
  StoreRelease,
} from '../types';
import { OFFICIAL_STORE_REPO, syncOfficialCatalog, syncOfficialSignals } from '../services/catalogService';
import { preloadMediaUrls } from '../services/mediaCache';
import { isUpdateAvailable, pickPreferredAsset } from '../utils/semver';

const WEB_INSTALLED_STORAGE_KEY = 'anticstore_web_installed_v1';
const INSTALL_MODE_STORAGE_KEY = 'anticstore_install_mode_v1';
const SEEN_SIGNALS_STORAGE_KEY = 'koru_seen_signals_v1';

function loadSeenSignalIds(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_SIGNALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function loadWebInstalled(): Record<string, InstalledAppRecord> {
  try {
    const raw = localStorage.getItem(WEB_INSTALLED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, InstalledAppRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

interface StoreContextType {
  platformInfo: PlatformInfo;
  officialSource: CatalogSource;
  apps: StoreApp[];
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
  setInstallMode: (mode: InstallMode) => void;
  syncCatalog: () => Promise<void>;
  syncSignals: (forceRefresh?: boolean) => Promise<void>;
  markSignalsAsRead: () => void;
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
  const [installMode, setInstallModeState] = useState<InstallMode>(() => {
    const saved = localStorage.getItem(INSTALL_MODE_STORAGE_KEY);
    return saved === 'silent' ? 'silent' : 'interactive';
  });

  const webAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const catalogSyncInProgress = useRef(false);
  const catalogSyncRequested = useRef(false);
  const signalsSyncInProgress = useRef(false);

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
          const { apps: syncedApps, source } = await syncOfficialCatalog(true);
          setApps(syncedApps);
          setOfficialSource(source);
          setLastSyncedAt(new Date().toISOString());
          void preloadMediaUrls(syncedApps.map((a) => a.iconUrl));
          await refreshInstalled(syncedApps);
        } catch (err) {
          setSyncError(err instanceof Error ? err.message : 'Katalog senkronizasyonu başarısız.');
        }
      } while (catalogSyncRequested.current);
    } finally {
      catalogSyncInProgress.current = false;
      setIsSyncing(false);
    }
  }, [refreshInstalled, syncSignals]);

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
      setAppErrors((prev) => ({
        ...prev,
        [app.id]: 'Bu uygulama için indirilebilir bir sürüm bulunamadı.',
      }));
      return;
    }

    const asset = options?.asset || pickPreferredAsset(release.assets, platformInfo.platform);
    if (!asset) {
      setAppErrors((prev) => ({
        ...prev,
        [app.id]: `${release.tag} sürümünde indirilebilir kurulum paketi yok.`,
      }));
      return;
    }

    const mode = options?.mode || 'install';

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
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Cancelled by user
      } else if (err instanceof Error && err.message.toLowerCase().includes('abort')) {
        // Cancelled by user
      } else {
        setAppErrors((prev) => ({
          ...prev,
          [app.id]: err instanceof Error ? err.message : 'Kurulum sırasında hata oluştu.',
        }));
      }
    } finally {
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
    } catch (err) {
      setAppErrors((prev) => ({
        ...prev,
        [app.id]: err instanceof Error ? err.message : 'Kaldırma işlemi başarısız oldu.',
      }));
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
      return window.anticStoreDesktop.launchApp({
        appId: app.id,
        name: app.name,
        executablePath: existing.executablePath,
        installLocation: existing.installLocation,
      });
    }
    return {
      launched: false,
      message: `Web önizleme modunda "${existing.installerPath || app.name}" dosyası tarayıcınız tarafından indirildi. Doğrudan başlatma ve tek tıkla kurulum için Koru Masaüstü uygulamasını kullanın.`,
    };
  };

  const cancelTask = async (appId: string) => {
    if (window.anticStoreDesktop) {
      await window.anticStoreDesktop.cancelDownload(appId);
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
        setInstallMode,
        syncCatalog,
        syncSignals,
        markSignalsAsRead,
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
