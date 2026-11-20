import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  RefreshCw,
  Play,
  ChevronRight,
  X,
  CheckCircle2,
  AlertCircle,
  Ban,
  Bell,
  BellRing,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Pause,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { AppIcon } from './AppIcon';
import { AppCover } from './AppCover';
import { AppHoverPreview } from './AppHoverPreview';
import {
  checkInstalledMirrorStatus,
  formatBytes,
  formatDownloadCount,
  formatSpeed,
  formatTurkishDate,
  isUpdateAvailable,
  pickPreferredAsset,
} from '../utils/semver';
import { evaluateCompatibility } from '../utils/compatibility';
import type { StoreApp } from '../types';

interface AppCardProps {
  app: StoreApp;
  onSelect: (app: StoreApp) => void;
}

export function AppCard({ app, onSelect }: AppCardProps) {
  const {
    installedMap,
    tasks,
    appErrors,
    platformInfo,
    getAppChannel,
    getChannelLatestRelease,
    installApp,
    updateApp,
    launchApp,
    pauseTask,
    resumeTask,
    cancelTask,
    isFollowingApp,
    toggleFollowApp,
  } = useStore();

  const cardRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const [previewRect, setPreviewRect] = useState<DOMRect | null>(null);

  const installed = installedMap[app.id];
  const task = tasks[app.id];
  const error = appErrors[app.id];
  const isDownloadable = app.downloadable !== false;
  const isComingSoon = !isDownloadable || Boolean(app.comingSoon);
  const following = isFollowingApp(app.id);
  const channel = getAppChannel(app.id);
  const effectiveRelease = getChannelLatestRelease(app) || app.latestRelease;
  const effectiveVersion = effectiveRelease?.version || app.latestVersion;
  const compatibility = evaluateCompatibility(app, platformInfo, effectiveRelease);
  const hasUpdate = Boolean(installed && isUpdateAvailable(installed.version, effectiveVersion));
  const isNew = Boolean(app.new);
  const mirrorStatus = checkInstalledMirrorStatus(
    installed?.version,
    app.latestVersion,
    app.releases,
    app.syncError
  );
  const isUnofficialVersion = mirrorStatus.isUnofficial;
  const hasRedSpotlight = isUnofficialVersion;
  const hasAccentSpotlight = !isUnofficialVersion && !isComingSoon && (hasUpdate || isNew);
  const hasAnySpotlight = hasRedSpotlight || hasAccentSpotlight;
  const isDownloadBlocked = !isDownloadable && !task && (!installed || hasUpdate);
  const preferredAsset = effectiveRelease
    ? pickPreferredAsset(effectiveRelease.assets, platformInfo.platform)
    : null;
  const totalDownloadsLabel =
    typeof app.totalDownloads === 'number' && app.totalDownloads > 0
      ? formatDownloadCount(app.totalDownloads)
      : null;

  const clearHoverPreview = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPreviewRect(null);
  };

  useEffect(() => {
    const onScroll = () => clearHoverPreview();
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const scheduleHoverPreview = (target: EventTarget | null) => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 768) return;
    if (window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;
    if (target instanceof HTMLElement && target.closest('[data-no-preview="true"]')) {
      clearHoverPreview();
      return;
    }
    if (previewRect || hoverTimerRef.current !== null) return;
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      if (cardRef.current) {
        setPreviewRect(cardRef.current.getBoundingClientRect());
      }
    }, 260);
  };

  const handlePrimaryAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearHoverPreview();
    if (task) {
      if (task.phase === 'paused') {
        void resumeTask(app.id);
      } else {
        void cancelTask(app.id);
      }
      return;
    }
    if (isDownloadBlocked) {
      return;
    }
    if (isUnofficialVersion && app.latestRelease) {
      void installApp(app, { release: app.latestRelease, mode: 'reinstall' });
      return;
    }
    if (hasUpdate) {
      void updateApp(app);
      return;
    }
    if (installed) {
      void launchApp(app).then((res) => {
        if (!res.launched) {
          onSelect(app);
        }
      });
      return;
    }
    void installApp(app);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest('[data-no-preview="true"]')) {
      clearHoverPreview();
    } else if (!previewRect && hoverTimerRef.current === null) {
      scheduleHoverPreview(e.target);
    }
    if (!hasAnySpotlight) return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  return (
    <>
    <motion.div
      ref={cardRef}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onClick={() => {
        clearHoverPreview();
        onSelect(app);
      }}
      onMouseEnter={(e) => scheduleHoverPreview(e.target)}
      onMouseLeave={clearHoverPreview}
      onMouseDown={clearHoverPreview}
      onMouseMove={handleMouseMove}
      className={`group relative overflow-hidden flex flex-col justify-between rounded-3xl bg-card border ${
        hasRedSpotlight
          ? 'card-danger-spotlight'
          : isComingSoon
          ? 'card-coming-soon'
          : hasAccentSpotlight
          ? 'card-update-spotlight border-card hover:border-hover'
          : 'border-card hover:border-hover'
      } hover:bg-card-hover transition-all duration-150 cursor-pointer select-none`}
    >
      {/* Top Edge-to-Edge Cover Header */}
      <AppCover
        name={app.name}
        coverUrl={app.coverUrl}
        screenshots={app.screenshots}
        iconUrl={app.iconUrl}
        variant="card"
        grayscale={!isDownloadable}
        className="h-[100px] w-full shrink-0"
      />

      {hasRedSpotlight ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[1] card-danger-spotlight-aura transition-opacity duration-300"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[1] opacity-0 group-hover:opacity-100 card-danger-spotlight-cursor transition-opacity duration-300"
          />
        </>
      ) : (
        hasAccentSpotlight && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[1] card-update-spotlight-aura transition-opacity duration-300"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[1] opacity-0 group-hover:opacity-100 card-update-spotlight-cursor transition-opacity duration-300"
            />
          </>
        )
      )}

      <div className="relative z-10 px-5 pb-5 -mt-7 flex-1 flex flex-col justify-between">
      <div>
        {/* Card Header */}
        <div className="flex items-end justify-between gap-3 mb-3">
          <div className="flex items-end gap-3 min-w-0">
            <AppIcon
              name={app.name}
              iconUrl={app.iconUrl}
              cacheKey={app.syncedAt}
              grayscale={!isDownloadable}
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-modal p-1.5 shadow-lg transition-transform duration-200 group-hover:scale-105"
              imageClassName="h-full w-full object-contain rounded-xl"
            />
            <div className="min-w-0 pt-2">
              <div className="flex items-center gap-2 min-w-0">
                <h3
                  className={`font-bold text-sm sm:text-base tracking-tight transition-colors truncate ${
                    hasRedSpotlight
                      ? 'text-red-400 group-hover:text-red-300'
                      : 'text-primary group-hover:accent-text'
                  }`}
                >
                  {app.name}
                </h3>
                {isUnofficialVersion && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 border border-red-500/50 text-red-300 shrink-0">
                    Resmi Dışı Sürüm
                  </span>
                )}
                {!isUnofficialVersion && isNew && !isComingSoon && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold badge-koza shrink-0">
                    Yeni
                  </span>
                )}
                {isComingSoon && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/12 border border-amber-500/35 text-amber-400 shrink-0">
                    <Clock className="w-2.5 h-2.5 shrink-0" />
                    <span>Yakında</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted truncate mt-0.5">
                {app.developer} · {app.category}
              </p>
            </div>
          </div>

          <span className="p-1.5 rounded-full text-muted group-hover:text-primary group-hover:bg-card transition-colors shrink-0 mb-0.5">
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>

        {/* Summary */}
        <p className="text-xs text-secondary leading-relaxed line-clamp-2 min-h-[2.25rem] mb-3.5">
          {app.summary}
        </p>

        {/* Version & Asset Info Box */}
        <div className="p-3 rounded-2xl bg-inner border border-subtle mb-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono text-[11px] text-muted truncate">{app.id}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {channel === 'beta' && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 border border-amber-500/35 text-amber-300">
                  Beta
                </span>
              )}
              {channel === 'nightly' && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-500/15 border border-violet-500/35 text-violet-300">
                  Nightly
                </span>
              )}
              {channel === 'rc' && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-sky-500/15 border border-sky-500/35 text-sky-300">
                  RC
                </span>
              )}
              <span className="font-mono font-bold text-xs text-primary tabular-nums">
                v{effectiveVersion}
              </span>
            </div>
          </div>

          {task ? (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] gap-2">
                <span
                  className={`font-semibold truncate ${
                    task.phase === 'paused' ? 'text-amber-400' : 'accent-text'
                  }`}
                >
                  {task.message}
                </span>
                <span className="font-mono tabular-nums text-secondary shrink-0">
                  {task.phase === 'queued'
                    ? 'Sırada'
                    : task.phase === 'verifying'
                    ? 'SHA-256'
                    : task.phase === 'paused'
                    ? `Duraklatıldı (${task.percent}%)`
                    : `${task.percent}%`}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-card overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${Math.max(4, task.percent)}%`,
                    backgroundColor: task.phase === 'paused' ? '#f59e0b' : 'var(--accent)',
                  }}
                />
              </div>
              {task.totalBytes > 0 && (
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-muted">
                  <span>
                    {formatBytes(task.receivedBytes)} / {formatBytes(task.totalBytes)}
                  </span>
                  <span>{task.phase === 'paused' ? 'Beklemede' : formatSpeed(task.speedBps)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-muted font-mono tabular-nums">
              <span className="truncate">
                {preferredAsset ? preferredAsset.name : isDownloadable ? 'Sürüm paketi' : 'İndirmeye kapalı'}
              </span>
              <span className="shrink-0">
                {preferredAsset && preferredAsset.size > 0 ? formatBytes(preferredAsset.size) : '—'}
              </span>
            </div>
          )}

          {(app.announcedAt || app.releaseDate || totalDownloadsLabel || compatibility) && (
            <div className="pt-2 border-t border-subtle/60 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted font-mono tabular-nums">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                {app.releaseDate ? (
                  <span>Yayın: {formatTurkishDate(app.releaseDate)}</span>
                ) : app.announcedAt ? (
                  <span>Duyuru: {formatTurkishDate(app.announcedAt)}</span>
                ) : null}
                {totalDownloadsLabel && (
                  <span className="inline-flex items-center gap-1 text-secondary" title="Toplam GitHub indirme sayısı">
                    <Download className="w-2.5 h-2.5 accent-text shrink-0" />
                    <span>{totalDownloadsLabel}</span>
                  </span>
                )}
              </div>
              <span
                title={compatibility.summary}
                className={`inline-flex items-center gap-1 font-sans font-semibold ${
                  compatibility.status === 'compatible'
                    ? 'text-emerald-400'
                    : compatibility.status === 'partial'
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {compatibility.status === 'compatible' ? (
                  <ShieldCheck className="w-3 h-3 shrink-0" />
                ) : (
                  <ShieldAlert className="w-3 h-3 shrink-0" />
                )}
                <span>{compatibility.badgeLabel}</span>
              </span>
            </div>
          )}
        </div>

        {isUnofficialVersion && (
          <div className="mb-3 p-3 rounded-2xl bg-red-500/15 border border-red-500/45 text-[11px] text-red-200 flex items-start gap-2 leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-red-100">
                Uygulama resmi yansılarda var olmayan bir sürüm içeriyor. Lütfen güncel sürümü doğrudan Koru üzerinden indirip kurun.
              </p>
              <p className="text-[10px] font-mono tabular-nums text-red-300/90">
                Kurulu: v{installed?.version} · Resmi Güncel: v{app.latestVersion}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 p-2.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-[11px] text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="pt-3 border-t border-subtle flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium truncate">
          {isUnofficialVersion && installed ? (
            <span className="text-red-400 font-bold flex items-center gap-1.5 tabular-nums">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>Resmi Olmayan (v{installed.version})</span>
            </span>
          ) : hasUpdate ? (
            <span className="accent-text font-semibold tabular-nums flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--accent)' }}
                aria-hidden="true"
              />
              v{installed.version} → v{effectiveVersion}
            </span>
          ) : installed ? (
            <span className="text-emerald-400 font-semibold flex items-center gap-1 tabular-nums">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Kurulu (v{installed.version})</span>
            </span>
          ) : isComingSoon ? (
            <span className="text-amber-400 font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{!isDownloadable ? 'Yakında · İndirmeye kapalı' : 'Yakında yayınlanacak'}</span>
            </span>
          ) : isNew ? (
            <span className="accent-text font-semibold flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: 'var(--accent)' }}
                aria-hidden="true"
              />
              Yeni
            </span>
          ) : (
            <span className="text-muted">Kurulmaya hazır</span>
          )}
        </div>

        <div data-no-preview="true" className="flex items-center gap-1.5 shrink-0">
          {isComingSoon && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void toggleFollowApp(app);
              }}
              title={following ? 'Bildirim takibini kapat' : 'Yayınlandığında bildirim al'}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
                following
                  ? 'accent-subtle accent-border accent-text'
                  : 'bg-inner border-subtle text-primary hover:bg-card-hover'
              }`}
            >
              {following ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              <span>{following ? 'Takipte' : 'Bildirim Aç'}</span>
            </button>
          )}

          {task && (task.phase === 'downloading' || task.phase === 'queued') && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void pauseTask(app.id);
              }}
              title="Duraklat"
              className="shrink-0 inline-flex items-center justify-center p-1.5 rounded-full bg-inner border border-subtle hover:bg-card-hover text-amber-400 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}

          {task && task.phase === 'paused' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void cancelTask(app.id);
              }}
              title="İptal Et"
              className="shrink-0 inline-flex items-center justify-center p-1.5 rounded-full bg-inner border border-subtle hover:bg-card-hover text-secondary hover:text-red-400 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isDownloadBlocked || (!preferredAsset && !installed && !task)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
              isDownloadBlocked
                ? 'bg-inner border border-subtle text-muted cursor-not-allowed opacity-60'
                : task && task.phase === 'paused'
                ? 'btn-primary-koza hover:opacity-90 active:scale-[0.97] cursor-pointer'
                : task
                ? 'bg-inner border border-subtle text-secondary hover:text-primary cursor-pointer'
                : isUnofficialVersion
                ? 'bg-red-600 hover:bg-red-500 text-white border border-red-400/50 active:scale-[0.97] cursor-pointer'
                : hasUpdate || !installed
                ? 'btn-primary-koza hover:opacity-90 active:scale-[0.97] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
                : 'bg-inner border border-subtle hover:bg-card-hover text-primary cursor-pointer'
            }`}
          >
            {task ? (
              task.phase === 'paused' ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Devam Et</span>
                </>
              ) : (
                <>
                  <X className="w-3.5 h-3.5" />
                  <span>İptal</span>
                </>
              )
            ) : isDownloadBlocked ? (
              <>
                <Ban className="w-3.5 h-3.5" />
                <span>İndirilemez</span>
              </>
            ) : isUnofficialVersion ? (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Resmi Sürümü Kur</span>
              </>
            ) : hasUpdate ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Güncelle</span>
              </>
            ) : installed ? (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Aç</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Yükle</span>
              </>
            )}
          </button>
        </div>
      </div>
      </div>
    </motion.div>
    <AnimatePresence>
      {previewRect && <AppHoverPreview app={app} anchorRect={previewRect} />}
    </AnimatePresence>
    </>
  );
}
