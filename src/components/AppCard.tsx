import React from 'react';
import {
  Download,
  RefreshCw,
  Play,
  ChevronRight,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { AppIcon } from './AppIcon';
import {
  formatBytes,
  formatSpeed,
  isUpdateAvailable,
  pickPreferredAsset,
} from '../utils/semver';
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
  } = useStore();

  const installed = installedMap[app.id];
  const task = tasks[app.id];
  const error = appErrors[app.id];
  const hasUpdate = Boolean(installed && isUpdateAvailable(installed.version, app.latestVersion));
  const preferredAsset = app.latestRelease
    ? pickPreferredAsset(app.latestRelease.assets, platformInfo.platform)
    : null;

  const handlePrimaryAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task) {
      void cancelTask(app.id);
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

  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onClick={() => onSelect(app)}
      className="group relative flex flex-col justify-between p-5 rounded-3xl bg-card border border-card hover:border-hover hover:bg-card-hover transition-all duration-150 cursor-pointer select-none"
    >
      <div>
        {/* Card Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <AppIcon
              name={app.name}
              iconUrl={app.iconUrl}
              cacheKey={app.syncedAt}
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-modal p-1.5 transition-transform duration-200 group-hover:scale-105"
              imageClassName="h-full w-full object-contain rounded-xl"
            />
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-primary tracking-tight group-hover:accent-text transition-colors truncate">
                {app.name}
              </h3>
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
              <span>{preferredAsset ? preferredAsset.name : 'Sürüm paketi'}</span>
              <span>{preferredAsset && preferredAsset.size > 0 ? formatBytes(preferredAsset.size) : '—'}</span>
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
      <div className="pt-3 border-t border-subtle flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium truncate">
          {hasUpdate ? (
            <span className="accent-text font-semibold tabular-nums">
              v{installed.version} → v{app.latestVersion}
            </span>
          ) : installed ? (
            <span className="text-emerald-400 font-semibold flex items-center gap-1 tabular-nums">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Kurulu (v{installed.version})</span>
            </span>
          ) : (
            <span className="text-muted">Kurulmaya hazır</span>
          )}
        </div>

        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={!preferredAsset && !installed && !task}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 ${
            task
              ? 'bg-inner border border-subtle text-secondary hover:text-primary'
              : hasUpdate || !installed
              ? 'btn-primary-koza hover:opacity-90 active:scale-[0.97]'
              : 'bg-inner border border-subtle hover:bg-card-hover text-primary'
          }`}
        >
          {task ? (
            <>
              <X className="w-3.5 h-3.5" />
              <span>İptal</span>
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
    </motion.div>
  );
}
