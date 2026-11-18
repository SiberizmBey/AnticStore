import React from 'react';
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
} from 'lucide-react';
import { motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { AppIcon } from './AppIcon';
import {
  formatBytes,
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
    installApp,
    updateApp,
    launchApp,
    cancelTask,
    isFollowingApp,
    toggleFollowApp,
  } = useStore();

  const installed = installedMap[app.id];
  const task = tasks[app.id];
  const error = appErrors[app.id];
  const isDownloadable = app.downloadable !== false;
  const isComingSoon = !isDownloadable || Boolean(app.comingSoon);
  const following = isFollowingApp(app.id);
  const compatibility = evaluateCompatibility(app, platformInfo);
  const hasUpdate = Boolean(installed && isUpdateAvailable(installed.version, app.latestVersion));
  const isNew = Boolean(app.new);
  const hasSpotlight = !isComingSoon && (hasUpdate || isNew);
  const isDownloadBlocked = !isDownloadable && !task && (!installed || hasUpdate);
  const preferredAsset = app.latestRelease
    ? pickPreferredAsset(app.latestRelease.assets, platformInfo.platform)
    : null;

  const handlePrimaryAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task) {
      void cancelTask(app.id);
      return;
    }
    if (isDownloadBlocked) {
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
    if (!hasSpotlight) return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onClick={() => onSelect(app)}
      onMouseMove={handleMouseMove}
      className={`group relative overflow-hidden flex flex-col justify-between p-5 rounded-3xl bg-card border ${
        isComingSoon
          ? 'card-coming-soon'
          : hasSpotlight
          ? 'card-update-spotlight border-card hover:border-hover'
          : 'border-card hover:border-hover'
      } hover:bg-card-hover transition-all duration-150 cursor-pointer select-none`}
    >
      {hasSpotlight && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 card-update-spotlight-aura transition-opacity duration-300"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 card-update-spotlight-cursor transition-opacity duration-300"
          />
        </>
      )}
      <div className="relative z-10">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <AppIcon
              name={app.name}
              iconUrl={app.iconUrl}
              cacheKey={app.syncedAt}
              grayscale={!isDownloadable}
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-modal p-1.5 transition-transform duration-200 group-hover:scale-105"
              imageClassName="h-full w-full object-contain rounded-xl"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-bold text-sm sm:text-base text-primary tracking-tight group-hover:accent-text transition-colors truncate">
                  {app.name}
                </h3>
                {isNew && !isComingSoon && (
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

          <span className="p-1.5 rounded-full text-muted group-hover:text-primary group-hover:bg-card transition-colors shrink-0">
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
            <span className="font-mono font-bold text-xs text-primary tabular-nums shrink-0">
              v{app.latestVersion}
            </span>
          </div>

          {task ? (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="accent-text font-semibold truncate">{task.message}</span>
                <span className="font-mono tabular-nums text-secondary shrink-0">
                  {task.percent}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-card overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${Math.max(4, task.percent)}%`,
                    backgroundColor: 'var(--accent)',
                  }}
                />
              </div>
              {task.totalBytes > 0 && (
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-muted">
                  <span>
                    {formatBytes(task.receivedBytes)} / {formatBytes(task.totalBytes)}
                  </span>
                  <span>{formatSpeed(task.speedBps)}</span>
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

          {(app.announcedAt || app.releaseDate || app.upcomingUpdateDate || compatibility) && (
            <div className="pt-2 border-t border-subtle/60 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted font-mono tabular-nums">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                {app.releaseDate ? (
                  <span>Yayın: {formatTurkishDate(app.releaseDate)}</span>
                ) : app.announcedAt ? (
                  <span>Duyuru: {formatTurkishDate(app.announcedAt)}</span>
                ) : null}
                {app.upcomingUpdateDate && (
                  <span>Sonraki: {formatTurkishDate(app.upcomingUpdateDate)}</span>
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

        {error && (
          <div className="mb-3 p-2.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-[11px] text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="relative z-10 pt-3 border-t border-subtle flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium truncate">
          {hasUpdate ? (
            <span className="accent-text font-semibold tabular-nums flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--accent)' }}
                aria-hidden="true"
              />
              v{installed.version} → v{app.latestVersion}
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

        <div className="flex items-center gap-1.5 shrink-0">
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

          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isDownloadBlocked || (!preferredAsset && !installed && !task)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
              isDownloadBlocked
                ? 'bg-inner border border-subtle text-muted cursor-not-allowed opacity-60'
                : task
                ? 'bg-inner border border-subtle text-secondary hover:text-primary cursor-pointer'
                : hasUpdate || !installed
                ? 'btn-primary-koza hover:opacity-90 active:scale-[0.97] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
                : 'bg-inner border border-subtle hover:bg-card-hover text-primary cursor-pointer'
            }`}
          >
            {task ? (
              <>
                <X className="w-3.5 h-3.5" />
                <span>İptal</span>
              </>
            ) : isDownloadBlocked ? (
              <>
                <Ban className="w-3.5 h-3.5" />
                <span>İndirilemez</span>
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
    </motion.div>
  );
}
