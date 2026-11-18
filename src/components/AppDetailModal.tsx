import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { AppIcon } from './AppIcon';
import { ScreenshotGallery } from './ScreenshotGallery';
import {
  compareSemver,
  formatBytes,
  formatSpeed,
  formatTurkishDate,
  isUpdateAvailable,
  pickPreferredAsset,
} from '../utils/semver';
import type { StoreApp, StoreAsset } from '../types';

interface AppDetailModalProps {
  app: StoreApp | null;
  onClose: () => void;
}

export function AppDetailModal({ app, onClose }: AppDetailModalProps) {
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
  } = useStore();

  const [selectedTag, setSelectedTag] = useState<string>('');
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: false, bottom: false });
  const rightScrollRef = useRef<HTMLDivElement | null>(null);

  const updateScrollFade = useCallback(() => {
    const el = rightScrollRef.current;
    if (!el) return;
    const top = el.scrollTop > 4;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
    setScrollFade((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);

  useEffect(() => {
    if (!app) return;
    setSelectedTag(app.latestRelease?.tag || app.releases[0]?.tag || '');
    setShowUninstallConfirm(false);
    setActionNotice(null);
    clearAppError(app.id);
    if (rightScrollRef.current) {
      rightScrollRef.current.scrollTop = 0;
    }
  }, [app?.id]);

  useEffect(() => {
    const el = rightScrollRef.current;
    if (!el) return;
    updateScrollFade();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollFade) : null;
    ro?.observe(el);
    window.addEventListener('resize', updateScrollFade);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateScrollFade);
    };
  }, [app?.id, selectedTag, updateScrollFade]);

  const selectedRelease = useMemo(() => {
    if (!app) return null;
    return (
      app.releases.find((r) => r.tag === selectedTag) ||
      app.latestRelease ||
      app.releases[0] ||
      null
    );
  }, [app, selectedTag]);

  if (!app) return null;

  const installed = installedMap[app.id];
  const task = tasks[app.id];
  const error = appErrors[app.id];
  const isDownloadable = app.downloadable !== false;
  const hasUpdate = Boolean(installed && isUpdateAvailable(installed.version, app.latestVersion));
  const isNew = Boolean(app.new);
  const selectedIsDifferent = Boolean(
    installed && selectedRelease && compareSemver(selectedRelease.version, installed.version) !== 0
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-modal-backdrop backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onMouseMove={(e) => {
          if (!isNew) return;
          const rect = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
          e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
        }}
        className={`group/modal relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-3xl bg-modal border overflow-hidden ${
          isNew ? 'card-update-spotlight border-subtle' : 'border-subtle shadow-xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {isNew && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 card-update-spotlight-aura transition-opacity duration-300"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-0 group-hover/modal:opacity-100 card-update-spotlight-cursor transition-opacity duration-300"
            />
          </>
        )}

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between p-6 border-b border-subtle bg-card/40 gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <AppIcon
              name={app.name}
              iconUrl={app.iconUrl}
              cacheKey={app.syncedAt}
              grayscale={!isDownloadable}
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-card p-1.5"
              imageClassName="h-full w-full object-contain rounded-xl"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <h2 className="text-lg font-bold text-primary truncate">{app.name}</h2>
                {isNew && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold badge-koza shrink-0">
                    Yeni
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5 truncate">
                {app.developer} · {app.category} · <span className="font-mono">{app.id}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {app.repoUrl && (
              <button
                type="button"
                onClick={() => handleOpenExternal(app.repoUrl!)}
                title="GitHub Deposunu Aç"
                className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-card-hover border border-subtle transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
            {app.websiteUrl && app.websiteUrl !== app.repoUrl && (
              <button
                type="button"
                onClick={() => handleOpenExternal(app.websiteUrl)}
                title="Uygulama Web Sitesini Aç"
                className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-card-hover border border-subtle transition-colors cursor-pointer"
              >
                <Globe2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="p-2 rounded-xl text-muted hover:text-primary hover:bg-card-hover transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col gap-5 overflow-y-auto lg:overflow-hidden p-6">
          {error && (
            <div className="shrink-0 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {actionNotice && (
            <div className="shrink-0 p-3.5 rounded-2xl accent-subtle border accent-border text-xs text-primary leading-relaxed">
              {actionNotice}
            </div>
          )}

          {app.syncError && (
            <div className="shrink-0 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-start justify-between gap-3">
              <span>
                GitHub sürüm bilgileri alınamadı: {app.syncError}
              </span>
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
                      className="px-3 py-1.5 rounded-xl bg-card hover:bg-card-hover border border-subtle text-xs font-medium text-secondary cursor-pointer"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleUninstall()}
                      className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer"
                    >
                      Evet, Kaldır
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Primary Action & Status Card */}
          <div className="shrink-0 p-5 rounded-3xl bg-card border border-subtle space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  {installed ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="tabular-nums">
                        Kurulu Sürüm: v{installed.version}
                      </span>
                    </span>
                  ) : (
                    <span className="text-secondary font-semibold flex items-center gap-1.5">
                      <Package className="w-4 h-4 accent-text" />
                      <span>Kurulmamış</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted font-mono tabular-nums">
                  En güncel sürüm: v{app.latestVersion}
                  {effectiveReleaseDate
                    ? ` · Yayın: ${formatTurkishDate(effectiveReleaseDate)}`
                    : ''}
                  {!isDownloadable ? ' · İndirmeye kapalı' : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {task ? (
                  <button
                    type="button"
                    onClick={() => void cancelTask(app.id)}
                    className="px-4 py-2 rounded-full bg-inner border border-subtle hover:border-hover text-xs font-semibold text-primary flex items-center gap-1.5 cursor-pointer"
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
                        className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${
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
                          className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
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
                          className={`px-3.5 py-2 rounded-full bg-inner border border-subtle text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                            !isDownloadable
                              ? 'text-muted cursor-not-allowed opacity-50'
                              : 'hover:bg-card-hover text-secondary hover:text-primary cursor-pointer'
                          }`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>
                            {selectedIsDifferent && selectedRelease
                              ? `v${selectedRelease.version} Kur`
                              : 'Yeniden Kur'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowUninstallConfirm((v) => !v)}
                          className="px-3.5 py-2 rounded-full border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-400 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
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
                        className={`px-5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${
                          !isDownloadable
                            ? 'bg-inner border border-subtle text-muted cursor-not-allowed opacity-60'
                            : 'btn-primary-koza hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
                        }`}
                      >
                        {!isDownloadable ? <Ban className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                        <span>
                          {!isDownloadable
                            ? 'İndirilemez'
                            : selectedRelease
                            ? `İndir ve Kur (v${selectedRelease.version})`
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
              <div className="p-3.5 rounded-2xl bg-inner border border-subtle space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold accent-text">{task.message}</span>
                  <span className="font-mono font-bold tabular-nums text-primary">
                    {task.percent}%
                  </span>
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
          </div>

          {/* 2-Column Content: Screenshots (Left, Fixed) + Hakkında & Version Picker (Right, Scrollable) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:flex-1 lg:min-h-0">
            {/* Left Column: Screenshots */}
            <div className="lg:col-span-7 space-y-2.5 min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
              <h4 className="text-[11px] font-bold text-secondary flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5 accent-text" />
                <span>Ekran Görüntüleri</span>
              </h4>
              <ScreenshotGallery
                appName={app.name}
                screenshots={app.screenshots || []}
                cacheKey={app.syncedAt}
              />
            </div>

            {/* Right Column: Description + Dates + Version History / Release Picker */}
            <div
              ref={rightScrollRef}
              onScroll={updateScrollFade}
              data-fade-top={scrollFade.top ? 'true' : 'false'}
              data-fade-bottom={scrollFade.bottom ? 'true' : 'false'}
              className="lg:col-span-5 space-y-4 min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1.5 lg:pb-1 scroll-fade-y"
            >
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Hakkında</h3>
                <p className="text-xs sm:text-sm text-secondary leading-relaxed">
                  {app.description}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-inner border border-subtle">
                  <span className="text-[10px] font-medium text-muted block">Duyurulma Tarihi</span>
                  <span className="text-xs font-mono font-semibold text-primary tabular-nums mt-0.5 block">
                    {formatTurkishDate(app.announcedAt)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-inner border border-subtle">
                  <span className="text-[10px] font-medium text-muted block">Yayınlanma Tarihi</span>
                  <span className="text-xs font-mono font-semibold text-primary tabular-nums mt-0.5 block">
                    {formatTurkishDate(effectiveReleaseDate)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-inner border border-subtle">
                  <span className="text-[10px] font-medium text-muted block">Yaklaşan Güncelleme</span>
                  <span className="text-xs font-mono font-semibold text-primary tabular-nums mt-0.5 block">
                    {formatTurkishDate(app.upcomingUpdateDate)}
                  </span>
                </div>
              </div>

              {app.releases.length > 0 ? (
                <div className="p-4 rounded-2xl bg-card border border-subtle space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-primary">
                      <Calendar className="w-4 h-4 accent-text shrink-0" />
                      <span>Sürüm Seçimi ve Notlar</span>
                    </div>

                    <select
                      value={selectedRelease?.tag || ''}
                      onChange={(e) => setSelectedTag(e.target.value)}
                      className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-input border border-input focus:border-accent text-xs font-mono text-primary"
                    >
                      {app.releases.map((rel) => (
                        <option key={rel.tag} value={rel.tag}>
                          {rel.tag} ({formatTurkishDate(rel.publishedAt)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedRelease?.notes ? (
                    <pre className="p-3 rounded-xl bg-inner border border-subtle text-xs text-secondary whitespace-pre-wrap font-sans leading-relaxed">
                      {selectedRelease.notes}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted">
                      {selectedRelease?.tag} sürümü için ek sürüm notu girilmemiş.
                    </p>
                  )}

                  {/* Release Assets */}
                  {selectedRelease && selectedRelease.assets.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] font-semibold text-muted block">
                        Kurulum Dosyaları ({selectedRelease.assets.length})
                      </span>
                      <div className="space-y-1.5">
                        {selectedRelease.assets.map((asset) => (
                          <div
                            key={asset.name}
                            className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-inner/70 border border-subtle text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileArchive className="w-4 h-4 accent-text shrink-0" />
                              <div className="min-w-0">
                                <span className="font-mono text-primary block truncate text-[11px]">
                                  {asset.name}
                                </span>
                                <span className="text-[10px] text-muted font-mono tabular-nums">
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
                              className={`px-3 py-1.5 rounded-full border border-subtle text-[11px] font-semibold shrink-0 ${
                                !isDownloadable
                                  ? 'bg-inner text-muted cursor-not-allowed opacity-50'
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
                </div>
              ) : !app.syncError ? (
                <div className="p-4 rounded-2xl bg-card border border-subtle text-xs text-muted">
                  Bu uygulama için GitHub’da yayınlanmış bir sürüm bulunamadı.
                </div>
              ) : null}
            </div>
          </div>

          {/* Source & Metadata Footer */}
          <div className="shrink-0 pt-2 text-[11px] text-muted flex flex-wrap items-center justify-between gap-2 border-t border-subtle">
            <span>Kaynak: {app.sourceLabel}</span>
            <span>Son eşitleme: {formatTurkishDate(app.syncedAt)}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
