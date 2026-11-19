import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  X,
  Download,
  RefreshCw,
  Play,
  Trash2,
  RotateCcw,
  ExternalLink,
  Globe2,
  Image,
  Check,
  CheckCircle2,
  AlertCircle,
  Package,
  Calendar,
  FileArchive,
  ShieldAlert,
  Ban,
  Bell,
  BellRing,
  ShieldCheck,
  Cpu,
  Lock,
  Wifi,
  HardDrive,
  Clock,
  ChevronRight,
  ChevronDown,
  Layers,
  Tag,
  Sparkles,
  GitBranch,
  KeyRound,
  Pause,
  Undo2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { AppIcon } from '../components/AppIcon';
import { ScreenshotGallery } from '../components/ScreenshotGallery';
import { RunningAppPrompt, type PendingRunningAction } from '../components/RunningAppPrompt';
import {
  buildChangelogRangeSummary,
  checkInstalledMirrorStatus,
  compareSemver,
  filterReleasesByChannel,
  formatBytes,
  formatDownloadCount,
  formatSpeed,
  formatTurkishDate,
  getEffectiveLatestRelease,
  getReleaseChannelKind,
  isUpdateAvailable,
  pickPreferredAsset,
} from '../utils/semver';
import {
  evaluateCompatibility,
  inferAppPermissions,
  inferAppRequirements,
} from '../utils/compatibility';
import {
  isPrerequisiteSupportedOnPlatform,
  resolveAppPrerequisites,
} from '../utils/prerequisites';
import type { PermissionLevel, ReleaseChannel, StoreApp, StoreAsset } from '../types';

type DetailSectionTab = 'overview' | 'releases';

interface AppDetailViewProps {
  app: StoreApp;
  backLabel?: string;
  onBack: () => void;
}

export function AppDetailView({ app, backLabel = 'Mağazaya Dön', onBack }: AppDetailViewProps) {
  const {
    installedMap,
    tasks,
    appErrors,
    platformInfo,
    systemDependencies,
    isCheckingDependencies,
    refreshSystemDependencies,
    prerequisiteStatuses,
    isCheckingPrerequisites,
    installingPrerequisiteIds,
    checkAppPrerequisites,
    installPrerequisite,
    getAvailableChannels,
    getAppChannel,
    setAppChannel,
    getChannelLatestRelease,
    getRollbackRelease,
    isAutoUpdateApp,
    toggleAutoUpdateApp,
    checkAppRunning,
    stopAppProcesses,
    installApp,
    updateApp,
    reinstallApp,
    rollbackApp,
    uninstallApp,
    launchApp,
    pauseTask,
    resumeTask,
    cancelTask,
    clearAppError,
    syncCatalog,
    isFollowingApp,
    toggleFollowApp,
  } = useStore();

  const [selectedTag, setSelectedTag] = useState<string>('');
  const [activeTab, setActiveTab] = useState<DetailSectionTab>('overview');
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  const [showOverviewUpdateDiff, setShowOverviewUpdateDiff] = useState(false);
  const [notesViewMode, setNotesViewMode] = useState<'single' | 'range'>('single');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [pendingRunningAction, setPendingRunningAction] = useState<PendingRunningAction | null>(null);
  const [isVersionMenuOpen, setIsVersionMenuOpen] = useState(false);
  const versionMenuRef = useRef<HTMLDivElement>(null);

  const availableChannels = useMemo(
    () => getAvailableChannels(app),
    [app, getAvailableChannels]
  );
  const showChannelSwitcher = availableChannels.length > 1;
  const activeChannel = getAppChannel(app.id);
  const channelLatestRelease = getChannelLatestRelease(app);
  const effectiveLatestVersion = channelLatestRelease?.version || app.latestVersion;
  const channelCounts = useMemo(() => {
    const counts: Record<ReleaseChannel, number> = { stable: 0, beta: 0, nightly: 0, rc: 0 };
    for (const rel of app.releases) {
      counts[getReleaseChannelKind(rel)] += 1;
    }
    return counts;
  }, [app.releases]);
  const channelReleases = useMemo(() => {
    const filtered = filterReleasesByChannel(app.releases, activeChannel);
    return filtered.length > 0 ? filtered : app.releases;
  }, [app.releases, activeChannel]);
  const rollbackRelease = getRollbackRelease(app);

  useEffect(() => {
    const currentChannel = getAppChannel(app.id);
    const initialRelease = getEffectiveLatestRelease(app.releases, currentChannel, app.latestRelease);
    setSelectedTag(initialRelease?.tag || app.releases[0]?.tag || '');
    setActiveTab('overview');
    setShowUninstallConfirm(false);
    setShowOverviewUpdateDiff(false);
    setNotesViewMode('single');
    setPendingRunningAction(null);
    setActionNotice(null);
    setIsVersionMenuOpen(false);
    clearAppError(app.id);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    if (resolveAppPrerequisites(app).length > 0) {
      void checkAppPrerequisites(app);
    }
  }, [app.id]);

  useEffect(() => {
    if (channelReleases.length === 0) return;
    if (!channelReleases.some((r) => r.tag === selectedTag)) {
      const target = getEffectiveLatestRelease(app.releases, activeChannel, app.latestRelease);
      setSelectedTag(target?.tag || channelReleases[0]?.tag || '');
    }
  }, [app.id, activeChannel, channelReleases, app.releases, app.latestRelease, selectedTag]);

  useEffect(() => {
    if (!isVersionMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (versionMenuRef.current && !versionMenuRef.current.contains(event.target as Node)) {
        setIsVersionMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isVersionMenuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isVersionMenuOpen) {
          setIsVersionMenuOpen(false);
          return;
        }
        onBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack, isVersionMenuOpen]);

  const selectedRelease = useMemo(() => {
    return (
      channelReleases.find((r) => r.tag === selectedTag) ||
      channelLatestRelease ||
      channelReleases[0] ||
      app.latestRelease ||
      app.releases[0] ||
      null
    );
  }, [channelReleases, app.releases, app.latestRelease, channelLatestRelease, selectedTag]);

  const installed = installedMap[app.id];
  const task = tasks[app.id];
  const error = appErrors[app.id];
  const isDownloadable = app.downloadable !== false;
  const isComingSoon = !isDownloadable || Boolean(app.comingSoon);
  const following = isFollowingApp(app.id);
  const autoUpdating = isAutoUpdateApp(app.id);
  const compatibility = evaluateCompatibility(app, platformInfo, selectedRelease);
  const { requirements: effectiveRequirements, inferred: reqInferred } = inferAppRequirements(
    app,
    selectedRelease,
    platformInfo.platform
  );
  const { permissions: effectivePermissions, inferred: permInferred } = inferAppPermissions(app);
  const appPrerequisites = useMemo(
    () =>
      resolveAppPrerequisites(app).filter((p) =>
        isPrerequisiteSupportedOnPlatform(p, platformInfo)
      ),
    [app, platformInfo]
  );
  const hasUpdate = Boolean(installed && isUpdateAvailable(installed.version, effectiveLatestVersion));
  const overviewDiffSummary = useMemo(
    () =>
      buildChangelogRangeSummary(app.releases, {
        channel: activeChannel,
        fromVersion: installed?.version,
        targetRelease: channelLatestRelease,
      }),
    [app.releases, activeChannel, installed?.version, channelLatestRelease]
  );
  const releaseTabDiffSummary = useMemo(
    () =>
      buildChangelogRangeSummary(app.releases, {
        channel: activeChannel,
        fromVersion: installed?.version,
        targetRelease: selectedRelease,
      }),
    [app.releases, activeChannel, installed?.version, selectedRelease]
  );
  const isNew = Boolean(app.new) && !isComingSoon;
  const mirrorStatus = checkInstalledMirrorStatus(
    installed?.version,
    app.latestVersion,
    app.releases,
    app.syncError
  );
  const isUnofficialVersion = mirrorStatus.isUnofficial;
  const hasAnySpotlight = isUnofficialVersion || (!isComingSoon && (isNew || hasUpdate));
  const selectedIsDifferent = Boolean(
    installed && selectedRelease && compareSemver(selectedRelease.version, installed.version) !== 0
  );
  const selectedIsCustomVersion = Boolean(
    selectedRelease && channelLatestRelease && selectedRelease.tag !== channelLatestRelease.tag
  );
  const effectiveReleaseDate =
    app.releaseDate || selectedRelease?.publishedAt || channelLatestRelease?.publishedAt;
  const preferredAsset = selectedRelease
    ? pickPreferredAsset(selectedRelease.assets, platformInfo.platform)
    : null;

  const isSelfApp =
    app.id.toLowerCase() === platformInfo.packageId.toLowerCase() ||
    app.id.toLowerCase() === 'com.anticvalley.store';

  const runWithProcessGuard = async (actionTitle: string, proceed: () => Promise<void> | void) => {
    if (installed && platformInfo.isDesktop && !isSelfApp) {
      const status = await checkAppRunning(app);
      if (status.running) {
        setPendingRunningAction({
          app,
          actionTitle,
          status,
          proceed,
        });
        return;
      }
    }
    await proceed();
  };

  const handleChannelChange = (nextChannel: ReleaseChannel) => {
    setAppChannel(app.id, nextChannel);
    setIsVersionMenuOpen(false);
    const filteredNext = filterReleasesByChannel(app.releases, nextChannel);
    const targetRel =
      filteredNext[0] || getEffectiveLatestRelease(app.releases, nextChannel, app.latestRelease);
    if (targetRel) {
      setSelectedTag(targetRel.tag);
    }
  };

  const handleOpenExternal = (url: string) => {
    if (window.anticStoreDesktop) {
      void window.anticStoreDesktop.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleLaunch = async () => {
    setActionNotice(null);
    const res = await launchApp(app);
    if (res.message) {
      setActionNotice(res.message);
    }
  };

  const handleInstallSelected = async () => {
    if (!selectedRelease || !isDownloadable) return;
    setActionNotice(null);
    const mode = installed
      ? compareSemver(selectedRelease.version, installed.version) > 0
        ? 'update'
        : 'reinstall'
      : 'install';
    const label = mode === 'update' ? 'Güncelleme' : mode === 'reinstall' ? 'Yeniden Kurulum' : 'Kurulum';
    await runWithProcessGuard(label, async () => {
      await installApp(app, { release: selectedRelease, mode });
      if (!platformInfo.isDesktop) {
        setActionNotice(
          `${selectedRelease.tag} paketi tarayıcınızdan indirildi ve kurulum kaydı güncellendi.`
        );
      }
    });
  };

  const handleInstallOfficialLatest = async () => {
    if (!app.latestRelease || !isDownloadable) return;
    setActionNotice(null);
    setSelectedTag(app.latestRelease.tag);
    await runWithProcessGuard('Resmi Sürüm Kurulumu', async () => {
      await installApp(app, { release: app.latestRelease!, mode: 'reinstall' });
    });
  };

  const handleAssetInstall = async (asset: StoreAsset) => {
    if (!selectedRelease || !isDownloadable) return;
    setActionNotice(null);
    await runWithProcessGuard('Kurulum', async () => {
      await installApp(app, {
        release: selectedRelease,
        asset,
        mode: installed ? 'reinstall' : 'install',
      });
    });
  };

  const handleUninstall = async () => {
    setShowUninstallConfirm(false);
    setActionNotice(null);
    await runWithProcessGuard('Kaldırma', async () => {
      await uninstallApp(app);
      setActionNotice(`${app.name} kaldırıldı.`);
    });
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Top Page Breadcrumb & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-card border border-subtle hover:bg-card-hover hover:border-hover text-xs font-semibold text-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{backLabel}</span>
          </button>

          <nav aria-label="Sayfa yolu" className="hidden sm:flex items-center gap-1.5 text-xs text-muted min-w-0">
            <span className="truncate">{app.catalogLabel || 'Genel'}</span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{app.category}</span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            <span className="text-primary font-semibold truncate">{app.name}</span>
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {app.repoUrl && (
            <button
              type="button"
              onClick={() => handleOpenExternal(app.repoUrl!)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-card border border-subtle hover:bg-card-hover text-xs font-semibold text-secondary hover:text-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </button>
          )}
          {app.websiteUrl && app.websiteUrl !== app.repoUrl && (
            <button
              type="button"
              onClick={() => handleOpenExternal(app.websiteUrl)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-card border border-subtle hover:bg-card-hover text-xs font-semibold text-secondary hover:text-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>Web Sitesi</span>
            </button>
          )}
        </div>
      </div>

      {/* Notices & Errors */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 text-xs text-red-400 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {actionNotice && (
        <div className="p-4 rounded-2xl accent-subtle border accent-border text-xs text-primary leading-relaxed">
          {actionNotice}
        </div>
      )}

      {app.syncError && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-start justify-between gap-3">
          <span>GitHub sürüm bilgileri alınamadı: {app.syncError}</span>
          <button
            type="button"
            onClick={() => void syncCatalog()}
            className="shrink-0 font-semibold hover:underline cursor-pointer"
          >
            Yeniden Dene
          </button>
        </div>
      )}

      <RunningAppPrompt
        pending={pendingRunningAction}
        onStopAndProceed={stopAppProcesses}
        onClose={() => setPendingRunningAction(null)}
      />

      {/* Uninstall Confirmation */}
      <AnimatePresence>
        {showUninstallConfirm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs space-y-3">
              <div className="flex items-start gap-2.5 text-red-300">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-red-200">
                    "{app.name}" uygulamasını kaldırmak istiyor musunuz?
                  </p>
                  <p className="text-[11px] text-red-300/80 mt-0.5">
                    {platformInfo.isDesktop
                      ? 'Sistem kaldırıcısı çalıştırılacak ve uygulama bilgisayarınızdan kaldırılacaktır.'
                      : 'Web önizleme kaydı temizlenecektir. İstediğiniz zaman yeniden kurabilirsiniz.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUninstallConfirm(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-card hover:bg-card-hover border border-subtle text-xs font-medium text-secondary cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={() => void handleUninstall()}
                  className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer"
                >
                  Evet, Kaldır
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-Width App Hero Card */}
      <section
        className={`relative z-20 p-6 sm:p-8 rounded-3xl border flex flex-col gap-5 ${
          isUnofficialVersion
            ? 'card-danger-spotlight bg-card/85 backdrop-blur-md'
            : hasAnySpotlight
            ? 'card-update-spotlight bg-card/80 backdrop-blur-md'
            : 'bg-card border-subtle'
        }`}
      >
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            <AppIcon
              name={app.name}
              iconUrl={app.iconUrl}
              cacheKey={app.syncedAt}
              grayscale={!isDownloadable}
              className="flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-modal p-2"
              imageClassName="h-full w-full object-contain rounded-xl"
            />

            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1
                  className={`text-2xl sm:text-3xl font-bold tracking-tight truncate ${
                    isUnofficialVersion ? 'text-red-400' : 'text-primary'
                  }`}
                >
                  {app.name}
                </h1>
                {isUnofficialVersion && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/20 border border-red-500/50 text-red-300 shrink-0">
                    Resmi Dışı Sürüm
                  </span>
                )}
                {!isUnofficialVersion && isNew && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold badge-koza shrink-0">
                    Yeni
                  </span>
                )}
                {!isUnofficialVersion && hasUpdate && !isComingSoon && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold badge-koza shrink-0">
                    Güncelleme Mevcut
                  </span>
                )}
                {isComingSoon && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/12 border border-amber-500/35 text-amber-400 shrink-0">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>Yakında</span>
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-secondary max-w-2xl leading-relaxed">
                {app.summary}
              </p>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted pt-0.5">
                <span className="font-medium text-secondary">{app.developer}</span>
                <span aria-hidden="true">·</span>
                <span>{app.category}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px]">{app.id}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-primary font-semibold">
                  v{app.latestVersion}
                </span>
                {effectiveReleaseDate && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Yayın: {formatTurkishDate(effectiveReleaseDate)}
                    </span>
                  </>
                )}
                {typeof app.totalDownloads === 'number' && app.totalDownloads > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      title="GitHub tüm sürümler toplam indirme sayısı"
                      className="inline-flex items-center gap-1 font-mono tabular-nums text-secondary"
                    >
                      <Download className="w-3 h-3 accent-text shrink-0" />
                      <span>{formatDownloadCount(app.totalDownloads)} indirme</span>
                    </span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                {installed ? (
                  <span className="text-emerald-400 font-semibold inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="tabular-nums">Kurulu Sürüm: v{installed.version}</span>
                  </span>
                ) : (
                  <span className="text-secondary font-medium inline-flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 accent-text" />
                    <span>{isComingSoon ? 'Yakında Yayınlanacak' : 'Kurulmaya Hazır'}</span>
                  </span>
                )}

                {installed?.sha256Verified && (
                  <>
                    <span aria-hidden="true" className="text-muted">·</span>
                    <span
                      title={installed.sha256 ? `SHA-256: ${installed.sha256}` : 'SHA-256 doğrulandı'}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/12 border border-emerald-500/35 text-emerald-400"
                    >
                      <KeyRound className="w-3 h-3 shrink-0" />
                      <span>SHA-256 Doğrulandı</span>
                    </span>
                  </>
                )}

                <span aria-hidden="true" className="text-muted">·</span>

                <span
                  title={compatibility.summary}
                  className={`inline-flex items-center gap-1 font-semibold ${
                    compatibility.status === 'compatible'
                      ? 'text-emerald-400'
                      : compatibility.status === 'partial'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                >
                  {compatibility.status === 'compatible' ? (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  )}
                  <span>{compatibility.badgeLabel}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Primary Actions + Release Channel + Slimmer Version Selector (Clean 2-Row Stack) */}
          <div className="flex flex-col items-start xl:items-end gap-2.5 shrink-0">
            {/* Row 1: Primary & Installed Actions */}
            <div className="flex flex-wrap items-center justify-start xl:justify-end gap-2">
              {task ? (
                <>
                  {(task.phase === 'downloading' || task.phase === 'queued') && (
                    <button
                      type="button"
                      onClick={() => void pauseTask(app.id)}
                      className="px-4 py-2 rounded-full bg-inner border border-subtle hover:bg-card-hover hover:border-hover text-xs font-semibold text-primary flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Pause className="w-3.5 h-3.5 text-amber-400" />
                      <span>Duraklat</span>
                    </button>
                  )}
                  {task.phase === 'paused' && (
                    <button
                      type="button"
                      onClick={() => void resumeTask(app.id)}
                      className="px-4 py-2 rounded-full btn-primary-koza hover:opacity-90 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Devam Et</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void cancelTask(app.id)}
                    className="px-4 py-2 rounded-full bg-inner border border-subtle hover:border-hover text-xs font-semibold text-primary flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>İptal Et</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void toggleFollowApp(app)}
                    title={following ? 'Bildirim takibini kapat' : 'Yayın ve güncelleme bildirimlerini aç'}
                    className={`px-3.5 py-2 rounded-full border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                      following
                        ? 'accent-subtle accent-border accent-text'
                        : 'bg-inner border-subtle hover:bg-card-hover text-primary'
                    }`}
                  >
                    {following ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                    <span>{following ? 'Bildirimler Açık' : 'Takip Et'}</span>
                  </button>

                  {installed && isDownloadable && (
                    <button
                      type="button"
                      onClick={() => toggleAutoUpdateApp(app)}
                      title={
                        autoUpdating
                          ? 'Arka plan otomatik güncellemeyi kapat'
                          : 'Uygulama kapalıyken yeni güncellemeleri otomatik kur'
                      }
                      className={`px-3.5 py-2 rounded-full border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                        autoUpdating
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          : 'bg-inner border-subtle hover:bg-card-hover text-secondary hover:text-primary'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{autoUpdating ? 'Oto-Güncelle Açık' : 'Oto-Güncelle'}</span>
                    </button>
                  )}

                  {installed && rollbackRelease && isDownloadable && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionNotice(null);
                        void runWithProcessGuard('Sürüm Geri Alma', () => rollbackApp(app));
                      }}
                      title={`Önceki sürüme dön: v${rollbackRelease.version}`}
                      className="px-3.5 py-2 rounded-full border border-subtle bg-inner hover:bg-card-hover text-xs font-semibold text-secondary hover:text-primary flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Undo2 className="w-3.5 h-3.5 accent-text" />
                      <span className="tabular-nums">Geri Al (v{rollbackRelease.version})</span>
                    </button>
                  )}

                  {installed && (
                    <>
                      <button
                        type="button"
                        disabled={!isDownloadable}
                        onClick={() => {
                          if (!isDownloadable) return;
                          if (selectedIsDifferent) {
                            void handleInstallSelected();
                          } else {
                            void runWithProcessGuard('Yeniden Kurulum', () => reinstallApp(app));
                          }
                        }}
                        className={`px-3.5 py-2 rounded-full border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                          !isDownloadable
                            ? 'bg-inner border-subtle text-muted cursor-not-allowed opacity-50'
                            : selectedIsDifferent
                            ? 'btn-primary-koza hover:opacity-90 cursor-pointer'
                            : 'bg-inner border-subtle hover:bg-card-hover text-secondary hover:text-primary cursor-pointer'
                        }`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="tabular-nums">
                          {selectedIsDifferent && selectedRelease
                            ? `v${selectedRelease.version} Kur`
                            : 'Yeniden Kur'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowUninstallConfirm((v) => !v)}
                        className="px-3.5 py-2 rounded-full border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-400 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Kaldır</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleLaunch()}
                        className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                          hasUpdate
                            ? 'bg-inner border border-subtle hover:bg-card-hover text-primary'
                            : 'btn-primary-koza hover:opacity-90'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Aç</span>
                      </button>
                    </>
                  )}

                  {hasUpdate && (
                    <button
                      type="button"
                      disabled={!isDownloadable}
                      onClick={() => {
                        if (!isDownloadable) return;
                        void runWithProcessGuard('Güncelleme', () => updateApp(app));
                      }}
                      className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                        !isDownloadable
                          ? 'bg-inner border border-subtle text-muted cursor-not-allowed opacity-60'
                          : 'btn-primary-koza hover:opacity-90 cursor-pointer'
                      }`}
                    >
                      {!isDownloadable ? <Ban className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span className="tabular-nums">
                        {!isDownloadable ? 'İndirilemez' : `Güncelle (v${effectiveLatestVersion})`}
                      </span>
                    </button>
                  )}

                  {!installed && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isDownloadable) return;
                        void handleInstallSelected();
                      }}
                      disabled={!isDownloadable || !preferredAsset}
                      className={`px-5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                        !isDownloadable
                          ? 'bg-inner border border-subtle text-muted cursor-not-allowed opacity-60'
                          : 'btn-primary-koza hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
                      }`}
                    >
                      {!isDownloadable ? <Ban className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                      <span className="tabular-nums">
                        {!isDownloadable
                          ? 'İndirilemez'
                          : selectedRelease
                          ? `${platformInfo.isDesktop ? 'Kur' : 'İndir ve Kur'} (v${selectedRelease.version})`
                          : 'İndir ve Kur'}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Row 2: Release Channel Switcher (only when multiple channels exist on GitHub) + Filtered Version Selector */}
            {app.releases.length > 0 && isDownloadable && !task && (
              <div className="flex flex-wrap items-center justify-start xl:justify-end gap-2">
                {showChannelSwitcher && (
                  <div
                    role="radiogroup"
                    aria-label="Yayın Kanalı"
                    className="koza-nav-capsule inline-flex items-center gap-0.5 p-1 rounded-full bg-island border border-subtle shadow-sm shrink-0"
                  >
                    <span className="pl-2 pr-1 text-muted flex items-center" aria-hidden="true">
                      <GitBranch className="w-3.5 h-3.5 accent-text" />
                    </span>
                    {availableChannels.map((ch) => {
                      const isChannelActive = activeChannel === ch;
                      const label =
                        ch === 'beta'
                          ? channelCounts.beta > 0
                            ? `Beta (${channelCounts.beta})`
                            : 'Beta'
                          : ch === 'nightly'
                          ? channelCounts.nightly > 0
                            ? `Nightly (${channelCounts.nightly})`
                            : 'Nightly'
                          : ch === 'rc'
                          ? channelCounts.rc > 0
                            ? `RC (${channelCounts.rc})`
                            : 'RC'
                          : 'Kararlı';
                      return (
                        <button
                          key={ch}
                          type="button"
                          role="radio"
                          aria-checked={isChannelActive}
                          onClick={() => handleChannelChange(ch)}
                          className={`relative px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors duration-200 select-none whitespace-nowrap cursor-pointer outline-none ${
                            isChannelActive
                              ? 'text-white font-bold'
                              : 'text-secondary hover:text-primary hover:bg-card-hover/40'
                          }`}
                        >
                          {isChannelActive && (
                            <motion.div
                              layoutId="detailChannelIndicator"
                              className="absolute inset-0 rounded-full shadow-sm nav-indicator"
                              style={{ backgroundColor: 'var(--accent)' }}
                              transition={{
                                type: 'spring',
                                stiffness: 450,
                                damping: 32,
                              }}
                            />
                          )}
                          <span className="relative z-10">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Custom Styled Koru Version Dropdown */}
                <div ref={versionMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    aria-label="Kurulacak sürümü seç"
                    aria-expanded={isVersionMenuOpen}
                    aria-haspopup="listbox"
                    onClick={() => setIsVersionMenuOpen((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors cursor-pointer whitespace-nowrap ${
                      isVersionMenuOpen || selectedIsCustomVersion
                        ? 'accent-subtle accent-border text-primary'
                        : 'bg-inner border-subtle hover:bg-card-hover hover:border-hover text-primary'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5 accent-text shrink-0" />
                    <span className="text-[11px] font-semibold text-muted">Sürüm:</span>
                    <span className="font-mono font-bold tabular-nums text-primary">
                      {selectedRelease?.tag || `v${effectiveLatestVersion}`}
                    </span>
                    {selectedRelease && getReleaseChannelKind(selectedRelease) === 'beta' ? (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 border border-amber-500/35 text-amber-300">
                        Beta
                      </span>
                    ) : selectedRelease && getReleaseChannelKind(selectedRelease) === 'nightly' ? (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-500/15 border border-violet-500/35 text-violet-300">
                        Nightly
                      </span>
                    ) : selectedRelease && getReleaseChannelKind(selectedRelease) === 'rc' ? (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-sky-500/15 border border-sky-500/35 text-sky-300">
                        RC
                      </span>
                    ) : (
                      channelLatestRelease?.tag === selectedRelease?.tag && (
                        <span className="text-[10px] font-semibold accent-text">Güncel</span>
                      )
                    )}
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-muted transition-transform duration-150 ${
                        isVersionMenuOpen ? 'rotate-180 accent-text' : ''
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {isVersionMenuOpen && (
                      <motion.div
                        role="listbox"
                        aria-label="Mevcut Sürümler"
                        initial={{ opacity: 0, y: -6, scale: 0.98, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -6, scale: 0.98, filter: 'blur(4px)' }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute top-[calc(100%+8px)] left-0 sm:left-auto sm:right-0 w-64 sm:w-72 rounded-2xl bg-modal border border-subtle shadow-2xl overflow-hidden z-50"
                      >
                        <div className="px-3 py-2 border-b border-subtle bg-card/50 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-primary">
                            {activeChannel === 'beta'
                              ? 'Beta Sürümler'
                              : activeChannel === 'nightly'
                              ? 'Nightly Sürümler'
                              : activeChannel === 'rc'
                              ? 'RC Sürümler'
                              : 'Kararlı Sürümler'}
                          </span>
                          <span className="text-[10px] font-mono text-muted tabular-nums">
                            {channelReleases.length} sürüm
                          </span>
                        </div>

                        <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
                          {channelReleases.map((rel) => {
                            const isSel = rel.tag === selectedRelease?.tag;
                            const isLatestRel = channelLatestRelease?.tag === rel.tag;
                            const relChannel = getReleaseChannelKind(rel);
                            const isInstalledRel =
                              installed && compareSemver(rel.version, installed.version) === 0;
                            return (
                              <button
                                key={rel.tag}
                                type="button"
                                role="option"
                                aria-selected={isSel}
                                onClick={() => {
                                  setSelectedTag(rel.tag);
                                  setIsVersionMenuOpen(false);
                                }}
                                className={`w-full text-left px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                                  isSel
                                    ? 'accent-subtle accent-border text-primary'
                                    : 'border-transparent hover:bg-card-hover text-secondary hover:text-primary'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                  <span className="text-xs font-mono font-bold text-primary tabular-nums">
                                    {rel.tag}
                                  </span>
                                  {relChannel === 'beta' && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 border border-amber-500/35 text-amber-300">
                                      Beta
                                    </span>
                                  )}
                                  {relChannel === 'nightly' && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-500/15 border border-violet-500/35 text-violet-300">
                                      Nightly
                                    </span>
                                  )}
                                  {relChannel === 'rc' && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-sky-500/15 border border-sky-500/35 text-sky-300">
                                      RC
                                    </span>
                                  )}
                                  {isLatestRel && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold accent-subtle accent-text border accent-border">
                                      Güncel
                                    </span>
                                  )}
                                  {isInstalledRel && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 border border-emerald-500/35 text-emerald-400">
                                      Kurulu
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] font-mono text-muted tabular-nums">
                                    {formatTurkishDate(rel.publishedAt)}
                                  </span>
                                  {isSel && <Check className="w-3.5 h-3.5 accent-text shrink-0" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="p-1.5 border-t border-subtle bg-card/40">
                          <button
                            type="button"
                            onClick={() => {
                              setIsVersionMenuOpen(false);
                              setActiveTab('releases');
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl text-[11px] font-semibold accent-text hover:bg-card-hover flex items-center justify-between cursor-pointer"
                          >
                            <span>Sürüm Notları &amp; Dosyalar</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Active Task Progress */}
        {task && (
          <div className="relative z-10 p-4 rounded-2xl bg-inner border border-subtle space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold ${task.phase === 'paused' ? 'text-amber-400' : 'accent-text'}`}>
                {task.message}
              </span>
              <span className="font-mono font-bold tabular-nums text-primary">{task.percent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-card overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{
                  width: `${Math.max(4, task.percent)}%`,
                  backgroundColor: task.phase === 'paused' ? '#f59e0b' : 'var(--accent)',
                }}
              />
            </div>
            {task.totalBytes > 0 && (
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-muted">
                <span>
                  {formatBytes(task.receivedBytes)} / {formatBytes(task.totalBytes)}
                </span>
                <span>{formatSpeed(task.speedBps)}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {isUnofficialVersion && (
        <section
          role="alert"
          className="p-4 sm:p-5 rounded-3xl bg-red-500/15 border border-red-500/55 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/45 flex items-center justify-center text-red-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-red-200">
                Resmi Yansılarda Olmayan Sürüm Tespit Edildi
              </h2>
              <p className="text-xs text-red-100/90 leading-relaxed">
                Uygulama resmi yansılarda var olmayan bir sürüm içeriyor. Lütfen güncel sürümü doğrudan Koru üzerinden indirip kurun.
              </p>
              <p className="text-[11px] font-mono tabular-nums text-red-300/90">
                Kurulu Sürüm: v{installed?.version} · Resmi Güncel Sürüm: v{app.latestVersion}
              </p>
            </div>
          </div>

          {app.latestRelease && isDownloadable && !task && (
            <button
              type="button"
              onClick={() => void handleInstallOfficialLatest()}
              className="px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-500 border border-red-400/50 text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <Download className="w-4 h-4" />
              <span className="tabular-nums">Resmi Güncel Sürümü Kur (v{app.latestVersion})</span>
            </button>
          )}
        </section>
      )}

      {/* Navbar-Style Section Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-3">
        <div
          className="koza-nav-capsule flex items-center gap-1 p-1.5 rounded-full bg-island border border-subtle shadow-sm"
          role="tablist"
          aria-label="Uygulama Detay Sekmeleri"
        >
          {(
            [
              {
                id: 'overview' as const,
                label: 'Genel Bakış',
                icon: <Layers className="w-4 h-4" />,
              },
              {
                id: 'releases' as const,
                label: 'Sürümler ve Notlar',
                icon: <Calendar className="w-4 h-4" />,
                badge: app.releases.length,
              },
            ] satisfies {
              id: DetailSectionTab;
              label: string;
              icon: React.ReactNode;
              badge?: number;
            }[]
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-colors duration-200 select-none whitespace-nowrap shrink-0 cursor-pointer outline-none ${
                  isActive
                    ? 'text-white font-bold'
                    : 'text-secondary hover:text-primary hover:bg-card-hover/40'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="detailTabIndicator"
                    className="absolute inset-0 rounded-full shadow-sm nav-indicator"
                    style={{ backgroundColor: 'var(--accent)' }}
                    transition={{
                      type: 'spring',
                      stiffness: 450,
                      damping: 32,
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border tabular-nums transition-colors ${
                        isActive
                          ? 'bg-black/20 text-white border-white/20'
                          : 'bg-card text-secondary border-subtle'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {selectedRelease && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>Aktif Sürüm:</span>
            <span className="px-2.5 py-1 rounded-full bg-card border border-subtle font-mono font-semibold text-primary tabular-nums">
              {selectedRelease.tag}
            </span>
          </div>
        )}
      </div>

      {/* Animated Tab Content (Matches App.tsx / Navbar transitions) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {activeTab === 'overview' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Screenshots & About */}
          <div className="lg:col-span-7 space-y-6 min-w-0">
            <section className="space-y-3">
              <h2 className="text-xs font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5 accent-text" />
                <span>Ekran Görüntüleri</span>
              </h2>
              <ScreenshotGallery
                appName={app.name}
                screenshots={app.screenshots || []}
                cacheKey={app.syncedAt}
              />
            </section>

            <section className="p-6 rounded-3xl bg-card border border-subtle space-y-4">
              <h2 className="text-xs font-bold text-primary uppercase tracking-wider">Hakkında</h2>
              <p className="text-sm text-secondary leading-relaxed">{app.description}</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-subtle">
                <div>
                  <span className="text-[11px] text-muted block">Duyurulma Tarihi</span>
                  <span className="text-xs font-mono font-semibold text-primary tabular-nums mt-0.5 block">
                    {formatTurkishDate(app.announcedAt)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-muted block">Yayınlanma Tarihi</span>
                  <span className="text-xs font-mono font-semibold text-primary tabular-nums mt-0.5 block">
                    {formatTurkishDate(effectiveReleaseDate)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-muted block">Planlanan Güncelleme Tarihi</span>
                  <span className="text-xs font-mono font-semibold text-primary tabular-nums mt-0.5 block">
                    {formatTurkishDate(app.upcomingUpdateDate)}
                  </span>
                </div>
              </div>

              {installed && hasUpdate && overviewDiffSummary && overviewDiffSummary.releases.length > 0 && (
                <div className="pt-3 border-t border-subtle space-y-2.5">
                  <button
                    type="button"
                    aria-expanded={showOverviewUpdateDiff}
                    onClick={() => setShowOverviewUpdateDiff((prev) => !prev)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-inner border border-subtle hover:bg-card-hover transition-colors flex items-center justify-between gap-3 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles className="w-4 h-4 accent-text shrink-0" />
                      <span className="text-xs font-semibold text-primary truncate">
                        v{overviewDiffSummary.fromVersion} → v{overviewDiffSummary.toVersion} Sürümler Arası Değişiklik Özeti
                      </span>
                      <span className="text-[11px] font-mono text-muted shrink-0 tabular-nums">
                        ({overviewDiffSummary.releases.length} sürüm)
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-muted shrink-0 transition-transform duration-150 ${
                        showOverviewUpdateDiff ? 'rotate-180 accent-text' : ''
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {showOverviewUpdateDiff && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 rounded-2xl bg-inner/80 border border-subtle space-y-3 max-h-80 overflow-y-auto">
                          {overviewDiffSummary.releases.map((rel) => (
                            <div
                              key={rel.tag}
                              className="pb-3 last:pb-0 border-b last:border-b-0 border-subtle/60 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-mono font-bold text-primary tabular-nums">
                                  {rel.tag}
                                </span>
                                <span className="text-[11px] font-mono text-muted tabular-nums">
                                  {formatTurkishDate(rel.publishedAt)}
                                </span>
                              </div>
                              <pre className="text-xs text-secondary whitespace-pre-wrap font-sans leading-relaxed">
                                {rel.notes?.trim() || 'Bu ara sürüm için ek sürüm notu girilmemiş.'}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Requirements & Permissions */}
          <div className="lg:col-span-5 space-y-5 min-w-0">
            {/* System Requirements + Real Runtime Dependency Check */}
            <section className="p-5 rounded-3xl bg-card border border-subtle space-y-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs font-bold text-primary">
                  <Cpu className="w-4 h-4 accent-text shrink-0" />
                  <span>Sistem Gereksinimleri</span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                    compatibility.status === 'compatible'
                      ? 'text-emerald-400'
                      : compatibility.status === 'partial'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                >
                  {compatibility.status === 'compatible' ? (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  )}
                  <span>{compatibility.badgeLabel}</span>
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-secondary leading-relaxed">{compatibility.summary}</p>
                {platformInfo.isDesktop &&
                  (typeof platformInfo.totalRamGb === 'number' ||
                    typeof platformInfo.freeDiskGb === 'number') && (
                    <p className="text-[11px] font-mono text-muted tabular-nums">
                      Cihazınız:{' '}
                      {typeof platformInfo.totalRamGb === 'number'
                        ? `${platformInfo.totalRamGb} GB RAM`
                        : ''}
                      {typeof platformInfo.totalRamGb === 'number' &&
                      typeof platformInfo.freeDiskGb === 'number'
                        ? ' · '
                        : ''}
                      {typeof platformInfo.freeDiskGb === 'number'
                        ? `${platformInfo.freeDiskGb} GB boş alan`
                        : ''}
                    </p>
                  )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {compatibility.checks.map((chk) => (
                  <div
                    key={chk.label}
                    className="p-3 rounded-2xl bg-inner border border-subtle flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-[10px] text-muted block">{chk.label}</span>
                      <span className="text-xs font-mono font-semibold text-primary truncate block mt-0.5">
                        {chk.value}
                      </span>
                    </div>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 mt-1 ${
                        chk.ok ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                ))}
              </div>

              {appPrerequisites.length > 0 && (
                <div className="pt-2.5 border-t border-subtle space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-primary">
                      Uygulama Ön Gereksinimleri (Ek Sürücü / Bileşen)
                    </span>
                    <button
                      type="button"
                      disabled={isCheckingPrerequisites}
                      onClick={() => void checkAppPrerequisites(app)}
                      className="text-[11px] font-semibold accent-text hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${isCheckingPrerequisites ? 'animate-spin' : ''}`}
                      />
                      <span>Denetle</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {appPrerequisites.map((prereq) => {
                      const status = prerequisiteStatuses[prereq.id];
                      const isPrereqInstalled = Boolean(status?.installed);
                      const isInstallingPrereq = installingPrerequisiteIds.includes(prereq.id);
                      const prereqTask = tasks[`prereq:${prereq.id}`];

                      return (
                        <div
                          key={prereq.id}
                          className={`p-3 rounded-2xl border space-y-2 text-[11px] ${
                            isPrereqInstalled
                              ? 'bg-emerald-500/8 border-emerald-500/30'
                              : 'bg-inner border-subtle'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2.5">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-primary truncate">
                                  {prereq.name}
                                </span>
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-card border border-subtle text-secondary">
                                  {prereq.kind === 'driver'
                                    ? 'Sürücü'
                                    : prereq.kind === 'app'
                                    ? 'Ek Uygulama'
                                    : 'Bileşen'}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted font-mono block truncate mt-0.5">
                                {platformInfo.isDesktop
                                  ? isPrereqInstalled
                                    ? `Kurulu${status?.version ? ` (v${status.version})` : ''}${
                                        status?.details ? ` · ${status.details}` : ''
                                      }`
                                    : status?.details || 'Sistemde tespit edilmedi'
                                  : 'Otomatik kontrol ve kurulum masaüstü uygulamasında desteklenir'}
                              </span>
                            </div>

                            {isPrereqInstalled ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/12 border border-emerald-500/35 text-emerald-400 shrink-0">
                                Hazır
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isInstallingPrereq}
                                onClick={() => void installPrerequisite(prereq)}
                                className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-[10px] font-bold text-amber-300 inline-flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
                              >
                                <Download className="w-3 h-3" />
                                <span>
                                  {isInstallingPrereq
                                    ? 'Kuruluyor...'
                                    : platformInfo.isDesktop
                                    ? 'Otomatik Kur'
                                    : 'İndir'}
                                </span>
                              </button>
                            )}
                          </div>

                          {prereqTask && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-secondary truncate pr-2">
                                  {prereqTask.message}
                                </span>
                                <span className="accent-text font-bold tabular-nums">
                                  %{prereqTask.percent}
                                </span>
                              </div>
                              <div className="h-1 rounded-full bg-card overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-150"
                                  style={{
                                    width: `${Math.max(4, Math.min(100, prereqTask.percent))}%`,
                                    backgroundColor: 'var(--accent)',
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {platformInfo.isDesktop && (
                <div className="pt-2.5 border-t border-subtle space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-primary">
                      Sistem Çalışma Zamanları (Canlı Tarama)
                    </span>
                    <button
                      type="button"
                      disabled={isCheckingDependencies}
                      onClick={() => void refreshSystemDependencies()}
                      className="text-[11px] font-semibold accent-text hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isCheckingDependencies ? 'animate-spin' : ''}`} />
                      <span>Yenile</span>
                    </button>
                  </div>

                  {systemDependencies.filter(
                    (dep) => dep.kind !== 'driver' && !appPrerequisites.some((p) => p.id === dep.id)
                  ).length > 0 ? (
                    <div className="space-y-1.5">
                      {systemDependencies
                        .filter(
                          (dep) =>
                            dep.kind !== 'driver' && !appPrerequisites.some((p) => p.id === dep.id)
                        )
                        .map((dep) => (
                        <div
                          key={dep.id}
                          className="px-3 py-2 rounded-2xl bg-inner border border-subtle flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-primary block truncate">{dep.name}</span>
                            <span className="text-[10px] text-muted font-mono tabular-nums block truncate">
                              {dep.installed
                                ? `Kurulu${dep.version ? ` (v${dep.version})` : ''}`
                                : 'Sistemde tespit edilmedi'}
                            </span>
                          </div>
                          {dep.installed ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/12 border border-emerald-500/35 text-emerald-400 shrink-0">
                              Hazır
                            </span>
                          ) : dep.downloadUrl ? (
                            <button
                              type="button"
                              onClick={() => handleOpenExternal(dep.downloadUrl!)}
                              className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-[10px] font-bold text-amber-300 inline-flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              <Download className="w-3 h-3" />
                              <span>Kur</span>
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/12 border border-amber-500/35 text-amber-400 shrink-0">
                              Eksik
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted">
                      {isCheckingDependencies
                        ? 'Sistem bileşenleri taranıyor...'
                        : 'Sistem çalışma zamanları kontrol edilmedi.'}
                    </p>
                  )}
                </div>
              )}

              {(effectiveRequirements.minOsVersion ||
                (effectiveRequirements.runtimes && effectiveRequirements.runtimes.length > 0) ||
                effectiveRequirements.notes) && (
                <div className="text-[11px] text-muted space-y-1 pt-1 border-t border-subtle">
                  {effectiveRequirements.minOsVersion && (
                    <p>
                      Minimum OS: <span className="text-secondary">{effectiveRequirements.minOsVersion}</span>
                    </p>
                  )}
                  {effectiveRequirements.runtimes && effectiveRequirements.runtimes.length > 0 && (
                    <p>
                      Gerekli Bileşenler:{' '}
                      <span className="text-secondary">{effectiveRequirements.runtimes.join(', ')}</span>
                    </p>
                  )}
                  {effectiveRequirements.notes && <p>{effectiveRequirements.notes}</p>}
                </div>
              )}

              {reqInferred && (
                <p className="text-[10px] text-muted">
                  * Paket ve sürüm yapısından otomatik çıkarılmıştır.
                </p>
              )}
            </section>

            {/* Permissions & Capabilities */}
            <section className="p-5 rounded-3xl bg-card border border-subtle space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-primary">
                  <Lock className="w-4 h-4 accent-text shrink-0" />
                  <span>İzin ve Özellik Beyanı</span>
                </div>
                <span className="text-[11px] font-mono text-muted tabular-nums">
                  {effectivePermissions.length} madde
                </span>
              </div>

              <div className="divide-y divide-subtle">
                {effectivePermissions.map((perm) => {
                  const level: PermissionLevel = perm.level || 'standard';
                  return (
                    <div key={perm.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-inner border border-subtle flex items-center justify-center shrink-0 mt-0.5">
                        {level === 'network' ? (
                          <Wifi className="w-3.5 h-3.5 accent-text" />
                        ) : level === 'elevated' ? (
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        ) : level === 'system' ? (
                          <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-semibold text-primary block">{perm.label}</span>
                        {perm.description && (
                          <span className="text-[11px] text-muted leading-snug block mt-0.5">
                            {perm.description}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {permInferred && (
                <p className="text-[10px] text-muted">
                  * Kurulum paketi ve uygulama kategorisine göre belirlenmiştir.
                </p>
              )}
            </section>
          </div>
        </div>
      ) : (
        /* Dedicated Tab: Sürüm Seçimi, Notlar ve Kurulum Dosyaları */
        app.releases.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Release List (Left) */}
            <aside className="lg:col-span-4 rounded-3xl bg-card border border-subtle p-3 space-y-1.5">
              <div className="px-3 py-2 flex items-center justify-between">
                <h2 className="text-xs font-bold text-primary uppercase tracking-wider">
                  {showChannelSwitcher
                    ? activeChannel === 'beta'
                      ? 'Beta Sürümleri'
                      : activeChannel === 'nightly'
                      ? 'Nightly Sürümleri'
                      : activeChannel === 'rc'
                      ? 'RC Sürümleri'
                      : 'Kararlı Sürümler'
                    : 'Tüm Sürümler'}
                </h2>
                <span className="text-[11px] font-mono text-muted tabular-nums">
                  {channelReleases.length} sürüm
                </span>
              </div>

              <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
                {channelReleases.map((rel) => {
                  const isSelected = rel.tag === selectedRelease?.tag;
                  const isLatest = channelLatestRelease?.tag === rel.tag;
                  const relChannel = getReleaseChannelKind(rel);
                  const isInstalledRel = installed && compareSemver(rel.version, installed.version) === 0;
                  return (
                    <button
                      key={rel.tag}
                      type="button"
                      onClick={() => setSelectedTag(rel.tag)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-2xl border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'accent-subtle accent-border'
                          : 'border-transparent hover:bg-card-hover'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-bold text-primary tabular-nums truncate">
                            {rel.tag}
                          </span>
                          {relChannel === 'beta' && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 border border-amber-500/35 text-amber-300">
                              Beta
                            </span>
                          )}
                          {relChannel === 'nightly' && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-500/15 border border-violet-500/35 text-violet-300">
                              Nightly
                            </span>
                          )}
                          {relChannel === 'rc' && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-sky-500/15 border border-sky-500/35 text-sky-300">
                              RC
                            </span>
                          )}
                          {isLatest && (
                            <span className="text-[10px] font-semibold accent-text">Güncel</span>
                          )}
                          {isInstalledRel && (
                            <span className="text-[10px] font-semibold text-emerald-400">Kurulu</span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted font-mono tabular-nums block mt-0.5">
                          {formatTurkishDate(rel.publishedAt)} · {rel.assets.length} dosya
                          {typeof rel.downloadCount === 'number' && rel.downloadCount > 0
                            ? ` · ↓ ${formatDownloadCount(rel.downloadCount)}`
                            : ''}
                        </span>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 ${
                          isSelected ? 'accent-text' : 'text-muted'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Selected Release Notes & Assets (Right) */}
            <div className="lg:col-span-8 space-y-5 min-w-0">
              {selectedRelease && (
                <section className="p-6 rounded-3xl bg-card border border-subtle space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-subtle">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-lg font-bold font-mono text-primary tabular-nums">
                          {selectedRelease.name || selectedRelease.tag}
                        </h2>
                        {getReleaseChannelKind(selectedRelease) === 'beta' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/35 text-amber-300">
                            Beta Ön Sürüm
                          </span>
                        )}
                        {getReleaseChannelKind(selectedRelease) === 'nightly' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 border border-violet-500/35 text-violet-300">
                            Nightly Sürüm
                          </span>
                        )}
                        {getReleaseChannelKind(selectedRelease) === 'rc' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 border border-sky-500/35 text-sky-300">
                            Sürüm Adayı (RC)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted font-mono tabular-nums mt-1">
                        Yayınlanma: {formatTurkishDate(selectedRelease.publishedAt)}
                        {typeof selectedRelease.downloadCount === 'number' &&
                          selectedRelease.downloadCount > 0 &&
                          ` · ${formatDownloadCount(selectedRelease.downloadCount)} indirme`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {selectedRelease.htmlUrl && (
                        <button
                          type="button"
                          onClick={() => handleOpenExternal(selectedRelease.htmlUrl!)}
                          className="px-3.5 py-2 rounded-full bg-inner border border-subtle hover:bg-card-hover text-xs font-semibold text-secondary hover:text-primary inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>GitHub'da Aç</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={!isDownloadable || !preferredAsset || Boolean(task)}
                        onClick={() => void handleInstallSelected()}
                        className="px-4 py-2 rounded-full text-xs font-bold btn-primary-koza hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {!isDownloadable
                            ? 'İndirilemez'
                            : platformInfo.isDesktop
                            ? `${selectedRelease.tag} Kur`
                            : `${selectedRelease.tag} İndir`}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Release Notes (Inline single vs range summary toggle) */}
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-primary uppercase tracking-wider">
                        {notesViewMode === 'range' && releaseTabDiffSummary
                          ? `Sürümler Arası Özet (v${releaseTabDiffSummary.fromVersion} → v${releaseTabDiffSummary.toVersion})`
                          : 'Sürüm Notları'}
                      </h3>

                      {releaseTabDiffSummary && releaseTabDiffSummary.releases.length > 1 && (
                        <div className="inline-flex items-center gap-1 p-0.5 rounded-full bg-inner border border-subtle">
                          <button
                            type="button"
                            onClick={() => setNotesViewMode('single')}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                              notesViewMode === 'single'
                                ? 'accent-subtle accent-text'
                                : 'text-muted hover:text-primary'
                            }`}
                          >
                            Bu Sürüm
                          </button>
                          <button
                            type="button"
                            onClick={() => setNotesViewMode('range')}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer tabular-nums ${
                              notesViewMode === 'range'
                                ? 'accent-subtle accent-text'
                                : 'text-muted hover:text-primary'
                            }`}
                          >
                            Sürümler Arası Özet ({releaseTabDiffSummary.releases.length})
                          </button>
                        </div>
                      )}
                    </div>

                    {notesViewMode === 'range' &&
                    releaseTabDiffSummary &&
                    releaseTabDiffSummary.releases.length > 1 ? (
                      <div className="p-4 rounded-2xl bg-inner border border-subtle space-y-3.5 max-h-[420px] overflow-y-auto">
                        {releaseTabDiffSummary.releases.map((rel) => (
                          <div
                            key={rel.tag}
                            className="pb-3.5 last:pb-0 border-b last:border-b-0 border-subtle/60 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-mono font-bold text-primary tabular-nums">
                                {rel.tag}
                              </span>
                              <span className="text-[11px] font-mono text-muted tabular-nums">
                                {formatTurkishDate(rel.publishedAt)}
                              </span>
                            </div>
                            <pre className="text-xs sm:text-sm text-secondary whitespace-pre-wrap font-sans leading-relaxed">
                              {rel.notes?.trim() || `${rel.tag} sürümü için ek sürüm notu girilmemiş.`}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : selectedRelease.notes ? (
                      <pre className="p-4 rounded-2xl bg-inner border border-subtle text-xs sm:text-sm text-secondary whitespace-pre-wrap font-sans leading-relaxed">
                        {selectedRelease.notes}
                      </pre>
                    ) : (
                      <p className="text-xs text-muted p-4 rounded-2xl bg-inner border border-subtle">
                        {selectedRelease.tag} sürümü için ek sürüm notu girilmemiş.
                      </p>
                    )}
                  </div>

                  {/* Release Assets */}
                  {selectedRelease.assets.length > 0 && (
                    <div className="space-y-2.5 pt-2 border-t border-subtle">
                      <h3 className="text-xs font-bold text-primary uppercase tracking-wider">
                        Kurulum Dosyaları ({selectedRelease.assets.length})
                      </h3>
                      <div className="space-y-2">
                        {selectedRelease.assets.map((asset) => (
                          <div
                            key={asset.name}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-inner border border-subtle text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <FileArchive className="w-4 h-4 accent-text shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-semibold text-primary block truncate">
                                    {asset.name}
                                  </span>
                                  {(asset.sha256 || asset.checksumUrl) && (
                                    <span
                                      title={
                                        asset.sha256
                                          ? `SHA-256: ${asset.sha256}`
                                          : 'Uzak checksum dosyası ile doğrulanacak'
                                      }
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/35 text-[10px] font-semibold text-emerald-400"
                                    >
                                      <KeyRound className="w-2.5 h-2.5" />
                                      <span>
                                        {asset.sha256 ? `SHA-256: ${asset.sha256.slice(0, 8)}…` : 'SHA-256 Doğrulanabilir'}
                                      </span>
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-muted font-mono tabular-nums">
                                  {asset.platform} · {asset.installerType.toUpperCase()} ·{' '}
                                  {asset.size > 0 ? formatBytes(asset.size) : 'Bilinmiyor'}
                                  {typeof asset.downloadCount === 'number' && asset.downloadCount > 0
                                    ? ` · ↓ ${formatDownloadCount(asset.downloadCount)} indirme`
                                    : ''}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={!isDownloadable || Boolean(task)}
                              onClick={() => {
                                if (!isDownloadable) return;
                                void handleAssetInstall(asset);
                              }}
                              className={`px-4 py-1.5 rounded-full border border-subtle text-xs font-semibold shrink-0 whitespace-nowrap ${
                                !isDownloadable
                                  ? 'bg-card text-muted cursor-not-allowed opacity-50'
                                  : 'bg-card hover:bg-card-hover text-primary cursor-pointer disabled:opacity-40'
                              }`}
                            >
                              {!isDownloadable
                                ? 'İndirilemez'
                                : platformInfo.isDesktop
                                ? 'Kur'
                                : 'İndir'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 rounded-3xl bg-card border border-subtle text-center text-xs text-muted">
            {app.syncError
              ? 'Sürüm bilgileri senkronize edilemedi.'
              : 'Bu uygulama için GitHub’da yayınlanmış bir sürüm bulunamadı.'}
          </div>
        )
      )}
        </motion.div>
      </AnimatePresence>

      {/* Footer Metadata */}
      <footer className="pt-4 border-t border-subtle text-[11px] text-muted flex flex-wrap items-center justify-between gap-2">
        <span>Kaynak: {app.sourceLabel}</span>
        <span className="tabular-nums">Son eşitleme: {formatTurkishDate(app.syncedAt)}</span>
      </footer>
    </div>
  );
}
