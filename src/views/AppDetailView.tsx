import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { AppIcon } from '../components/AppIcon';
import { ScreenshotGallery } from '../components/ScreenshotGallery';
import {
  checkInstalledMirrorStatus,
  compareSemver,
  formatBytes,
  formatSpeed,
  formatTurkishDate,
  isUpdateAvailable,
  pickPreferredAsset,
} from '../utils/semver';
import {
  evaluateCompatibility,
  inferAppPermissions,
  inferAppRequirements,
} from '../utils/compatibility';
import type { PermissionLevel, StoreApp, StoreAsset } from '../types';

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
    installApp,
    updateApp,
    reinstallApp,
    uninstallApp,
    launchApp,
    cancelTask,
    clearAppError,
    syncCatalog,
    isFollowingApp,
    toggleFollowApp,
  } = useStore();

  const [selectedTag, setSelectedTag] = useState<string>('');
  const [activeTab, setActiveTab] = useState<DetailSectionTab>('overview');
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTag(app.latestRelease?.tag || app.releases[0]?.tag || '');
    setActiveTab('overview');
    setShowUninstallConfirm(false);
    setActionNotice(null);
    clearAppError(app.id);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [app.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  const selectedRelease = useMemo(() => {
    return (
      app.releases.find((r) => r.tag === selectedTag) ||
      app.latestRelease ||
      app.releases[0] ||
      null
    );
  }, [app.releases, app.latestRelease, selectedTag]);

  const installed = installedMap[app.id];
  const task = tasks[app.id];
  const error = appErrors[app.id];
  const isDownloadable = app.downloadable !== false;
  const isComingSoon = !isDownloadable || Boolean(app.comingSoon);
  const following = isFollowingApp(app.id);
  const compatibility = evaluateCompatibility(app, platformInfo);
  const { requirements: effectiveRequirements, inferred: reqInferred } = inferAppRequirements(app);
  const { permissions: effectivePermissions, inferred: permInferred } = inferAppPermissions(app);
  const hasUpdate = Boolean(installed && isUpdateAvailable(installed.version, app.latestVersion));
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
    selectedRelease && app.latestRelease && selectedRelease.tag !== app.latestRelease.tag
  );
  const effectiveReleaseDate =
    app.releaseDate || selectedRelease?.publishedAt || app.latestRelease?.publishedAt;
  const preferredAsset = selectedRelease
    ? pickPreferredAsset(selectedRelease.assets, platformInfo.platform)
    : null;

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
    await installApp(app, { release: selectedRelease, mode });
    if (!platformInfo.isDesktop) {
      setActionNotice(
        `${selectedRelease.tag} paketi tarayıcınızdan indirildi ve kurulum kaydı güncellendi.`
      );
    }
  };

  const handleInstallOfficialLatest = async () => {
    if (!app.latestRelease || !isDownloadable) return;
    setActionNotice(null);
    setSelectedTag(app.latestRelease.tag);
    await installApp(app, { release: app.latestRelease, mode: 'reinstall' });
  };

  const handleAssetInstall = async (asset: StoreAsset) => {
    if (!selectedRelease || !isDownloadable) return;
    setActionNotice(null);
    await installApp(app, {
      release: selectedRelease,
      asset,
      mode: installed ? 'reinstall' : 'install',
    });
  };

  const handleUninstall = async () => {
    setShowUninstallConfirm(false);
    setActionNotice(null);
    await uninstallApp(app);
    setActionNotice(`${app.name} kaldırıldı.`);
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
        className={`relative overflow-hidden p-6 sm:p-8 rounded-3xl border flex flex-col gap-5 ${
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

          {/* Primary Actions + Prominent Version Selector */}
          <div className="flex flex-wrap items-center justify-start xl:justify-end gap-2.5 shrink-0">
            {app.releases.length > 0 && isDownloadable && !task && (
              <div
                className={`relative flex items-center rounded-full border transition-colors ${
                  selectedIsCustomVersion
                    ? 'accent-subtle accent-border'
                    : 'bg-inner border-subtle hover:border-hover'
                }`}
              >
                <span className="pl-3.5 pr-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted pointer-events-none shrink-0">
                  <Tag className="w-3.5 h-3.5 accent-text" />
                  <span>Sürüm:</span>
                </span>
                <select
                  aria-label="Kurulacak sürümü seç"
                  value={selectedRelease?.tag || ''}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="appearance-none bg-transparent pr-8 py-2.5 text-xs font-mono font-bold text-primary cursor-pointer tabular-nums"
                >
                  {app.releases.map((rel) => {
                    const isLatestTag = app.latestRelease?.tag === rel.tag;
                    return (
                      <option key={rel.tag} value={rel.tag} className="bg-modal text-primary">
                        {rel.tag}
                        {isLatestTag ? ' · Güncel' : ` · ${formatTurkishDate(rel.publishedAt)}`}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted absolute right-3 pointer-events-none" />
              </div>
            )}

            <button
              type="button"
              onClick={() => void toggleFollowApp(app)}
              title={following ? 'Bildirim takibini kapat' : 'Yayın ve güncelleme bildirimlerini aç'}
              className={`px-4 py-2.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                following
                  ? 'accent-subtle accent-border accent-text'
                  : 'bg-inner border-subtle hover:bg-card-hover text-primary'
              }`}
            >
              {following ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              <span>{following ? 'Bildirimler Açık' : 'Takip Et'}</span>
            </button>

            {task ? (
              <button
                type="button"
                onClick={() => void cancelTask(app.id)}
                className="px-4 py-2.5 rounded-full bg-inner border border-subtle hover:border-hover text-xs font-semibold text-primary flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                <span>İptal Et</span>
              </button>
            ) : (
              <>
                {hasUpdate && (
                  <button
                    type="button"
                    disabled={!isDownloadable}
                    onClick={() => {
                      if (!isDownloadable) return;
                      void updateApp(app);
                    }}
                    className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      !isDownloadable
                        ? 'bg-inner border border-subtle text-muted cursor-not-allowed opacity-60'
                        : 'btn-primary-koza hover:opacity-90 cursor-pointer'
                    }`}
                  >
                    {!isDownloadable ? <Ban className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    <span className="tabular-nums">
                      {!isDownloadable ? 'İndirilemez' : `Güncelle (v${app.latestVersion})`}
                    </span>
                  </button>
                )}

                {installed && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleLaunch()}
                      className={`px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                        hasUpdate
                          ? 'bg-inner border border-subtle hover:bg-card-hover text-primary'
                          : 'btn-primary-koza hover:opacity-90'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Aç</span>
                    </button>

                    <button
                      type="button"
                      disabled={!isDownloadable}
                      onClick={() => {
                        if (!isDownloadable) return;
                        if (selectedIsDifferent) {
                          void handleInstallSelected();
                        } else {
                          void reinstallApp(app);
                        }
                      }}
                      className={`px-4 py-2.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
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
                      className="px-4 py-2.5 rounded-full border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-400 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Kaldır</span>
                    </button>
                  </>
                )}

                {!installed && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isDownloadable) return;
                      void handleInstallSelected();
                    }}
                    disabled={!isDownloadable || !preferredAsset}
                    className={`px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
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
        </div>

        {/* Active Task Progress */}
        {task && (
          <div className="relative z-10 p-4 rounded-2xl bg-inner border border-subtle space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold accent-text">{task.message}</span>
              <span className="font-mono font-bold tabular-nums text-primary">{task.percent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-card overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{
                  width: `${Math.max(4, task.percent)}%`,
                  backgroundColor: 'var(--accent)',
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
            </section>
          </div>

          {/* Right Column: Prominent Sürüm Seçimi + Requirements + Permissions */}
          <div className="lg:col-span-5 space-y-5 min-w-0">
            {/* Prominent Version Selection Card */}
            <section className="p-5 rounded-3xl bg-card border accent-border space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-primary">
                  <Tag className="w-4 h-4 accent-text shrink-0" />
                  <span>Sürüm Seçimi</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold accent-subtle accent-text border accent-border tabular-nums">
                  {app.releases.length} sürüm
                </span>
              </div>

              {app.releases.length > 0 ? (
                <>
                  {/* Quick Version Chips for Latest Releases */}
                  <div className="flex flex-wrap gap-1.5">
                    {app.releases.slice(0, 4).map((rel) => {
                      const isSel = rel.tag === selectedRelease?.tag;
                      const isLatestRel = app.latestRelease?.tag === rel.tag;
                      return (
                        <button
                          key={rel.tag}
                          type="button"
                          onClick={() => setSelectedTag(rel.tag)}
                          className={`px-3 py-1.5 rounded-full text-xs font-mono font-semibold transition-all cursor-pointer tabular-nums inline-flex items-center gap-1.5 border ${
                            isSel
                              ? 'btn-primary-koza shadow-xs'
                              : 'bg-inner border-subtle text-secondary hover:text-primary hover:bg-card-hover'
                          }`}
                        >
                          <span>{rel.tag}</span>
                          {isLatestRel && (
                            <span
                              className={`text-[10px] font-sans font-bold ${
                                isSel ? 'text-white/90' : 'accent-text'
                              }`}
                            >
                              Güncel
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Full Release Dropdown when more versions exist or for exact selection */}
                  <div className="relative">
                    <select
                      aria-label="Tüm sürümlerden seç"
                      value={selectedRelease?.tag || ''}
                      onChange={(e) => setSelectedTag(e.target.value)}
                      className="w-full appearance-none pl-3.5 pr-9 py-2.5 rounded-2xl bg-inner border border-subtle hover:border-hover focus:border-accent text-xs font-mono font-semibold text-primary cursor-pointer tabular-nums"
                    >
                      {app.releases.map((rel) => {
                        const isLatestRel = app.latestRelease?.tag === rel.tag;
                        const isInstalledRel =
                          installed && compareSemver(rel.version, installed.version) === 0;
                        return (
                          <option key={rel.tag} value={rel.tag} className="bg-modal text-primary">
                            {rel.tag} · {formatTurkishDate(rel.publishedAt)}
                            {isLatestRel ? ' (En Güncel)' : ''}
                            {isInstalledRel ? ' [Kurulu]' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-3 pointer-events-none" />
                  </div>

                  {/* Selected Version Asset Summary + Link to Notes */}
                  <div className="p-3 rounded-2xl bg-inner border border-subtle flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[11px] font-mono font-semibold text-primary block truncate tabular-nums">
                        {preferredAsset
                          ? preferredAsset.name
                          : `${selectedRelease?.tag || `v${app.latestVersion}`} paketi`}
                      </span>
                      <span className="text-[10px] text-muted font-mono tabular-nums block mt-0.5">
                        {selectedRelease?.publishedAt
                          ? `Yayın: ${formatTurkishDate(selectedRelease.publishedAt)}`
                          : 'Tarih belirtilmedi'}
                        {preferredAsset && preferredAsset.size > 0
                          ? ` · ${formatBytes(preferredAsset.size)}`
                          : ''}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('releases')}
                      className="px-3 py-1.5 rounded-full accent-subtle border accent-border text-[11px] font-bold accent-text hover:opacity-90 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Notlar & Dosyalar</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted">
                  Henüz yayınlanmış bir sürüm bulunamadı.
                </p>
              )}
            </section>

            {/* System Requirements */}
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

              <p className="text-xs text-secondary leading-relaxed">{compatibility.summary}</p>

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
                  Tüm Sürümler
                </h2>
                <span className="text-[11px] font-mono text-muted tabular-nums">
                  {app.releases.length} sürüm
                </span>
              </div>

              <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
                {app.releases.map((rel) => {
                  const isSelected = rel.tag === selectedRelease?.tag;
                  const isLatest = app.latestRelease?.tag === rel.tag;
                  const isInstalledRel = installed && compareSemver(rel.version, installed.version) === 0;
                  return (
                    <button
                      key={rel.tag}
                      type="button"
                      onClick={() => setSelectedTag(rel.tag)}
                      className={`w-full text-left px-3.5 py-3 rounded-2xl border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'accent-subtle accent-border'
                          : 'border-transparent hover:bg-card-hover'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-primary tabular-nums truncate">
                            {rel.tag}
                          </span>
                          {isLatest && (
                            <span className="text-[10px] font-semibold accent-text">Güncel</span>
                          )}
                          {isInstalledRel && (
                            <span className="text-[10px] font-semibold text-emerald-400">Kurulu</span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted font-mono tabular-nums block mt-0.5">
                          {formatTurkishDate(rel.publishedAt)} · {rel.assets.length} dosya
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
                        {selectedRelease.prerelease && (
                          <span className="text-[11px] font-semibold text-amber-400">Ön Sürüm</span>
                        )}
                      </div>
                      <p className="text-xs text-muted font-mono tabular-nums mt-1">
                        Yayınlanma: {formatTurkishDate(selectedRelease.publishedAt)}
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

                  {/* Release Notes */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider">
                      Sürüm Notları
                    </h3>
                    {selectedRelease.notes ? (
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
                                <span className="font-mono font-semibold text-primary block truncate">
                                  {asset.name}
                                </span>
                                <span className="text-[11px] text-muted font-mono tabular-nums">
                                  {asset.platform} · {asset.installerType.toUpperCase()} ·{' '}
                                  {asset.size > 0 ? formatBytes(asset.size) : 'Bilinmiyor'}
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
