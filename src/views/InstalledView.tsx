import {
  PackageCheck,
  RefreshCw,
  Play,
  RotateCcw,
  Trash2,
  CheckCircle2,
  ArrowRight,
  X,
  Ban,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { AppIcon } from '../components/AppIcon';
import { formatBytes, formatTurkishDate, isUpdateAvailable } from '../utils/semver';
import type { StoreApp } from '../types';

interface InstalledViewProps {
  onSelectApp: (app: StoreApp) => void;
  onBrowseStore: () => void;
}

export function InstalledView({ onSelectApp, onBrowseStore }: InstalledViewProps) {
  const {
    installedApps,
    updatableApps,
    installedMap,
    tasks,
    updateApp,
    updateAllApps,
    reinstallApp,
    uninstallApp,
    launchApp,
    cancelTask,
  } = useStore();

  const downloadableUpdatesCount = updatableApps.filter((a) => a.downloadable !== false).length;

  return (
    <div className="space-y-6 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border accent-border accent-subtle p-2.5 accent-text">
            <PackageCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Yüklü Uygulamalar ve Güncellemeler</h1>
            <p className="mt-1 text-xs text-muted">
              Kurulu uygulamalarınızı başlatın, güncelleyin, yeniden kurun veya sistemden kaldırın.
            </p>
          </div>
        </div>

        {downloadableUpdatesCount > 0 && (
          <button
            type="button"
            onClick={() => void updateAllApps()}
            className="px-4 py-2 rounded-full text-xs font-bold btn-primary-koza hover:opacity-90 flex items-center gap-2 cursor-pointer self-start sm:self-auto whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tümünü Güncelle ({downloadableUpdatesCount})</span>
          </button>
        )}
      </header>

      {/* Pending Updates Section */}
      {updatableApps.length > 0 && (
        <section className="p-5 rounded-3xl bg-card border accent-border space-y-3">
          <h2 className="text-xs font-bold accent-text uppercase tracking-wider">
            Mevcut Güncellemeler ({updatableApps.length})
          </h2>
          <div className="space-y-2.5">
            {updatableApps.map((app) => {
              const inst = installedMap[app.id];
              const task = tasks[app.id];
              const isDownloadable = app.downloadable !== false;
              return (
                <div
                  key={app.id}
                  onClick={() => onSelectApp(app)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-inner/70 border border-subtle hover:border-hover transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <AppIcon
                      name={app.name}
                      iconUrl={app.iconUrl}
                      cacheKey={app.syncedAt}
                      grayscale={!isDownloadable}
                      className="w-11 h-11 rounded-2xl bg-card border border-subtle p-1.5 shrink-0 flex items-center justify-center overflow-hidden"
                      imageClassName="w-full h-full object-contain rounded-lg"
                    />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-primary truncate">{app.name}</h3>
                      <p className="text-xs font-mono tabular-nums text-muted">
                        v{inst?.version} → <span className="accent-text font-semibold">v{app.latestVersion}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {task ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void cancelTask(app.id);
                        }}
                        className="px-4 py-1.5 rounded-full bg-card border border-subtle text-xs font-semibold text-primary flex items-center gap-1.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span className="tabular-nums">{task.percent}% İptal</span>
                      </button>
                    ) : !isDownloadable ? (
                      <button
                        type="button"
                        disabled
                        onClick={(e) => e.stopPropagation()}
                        className="px-4 py-1.5 rounded-full bg-card border border-subtle text-xs font-bold text-muted flex items-center gap-1.5 cursor-not-allowed opacity-60"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>İndirilemez</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void updateApp(app);
                        }}
                        className="px-4 py-1.5 rounded-full text-xs font-bold btn-primary-koza hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Güncelle</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Installed Apps List */}
      {installedApps.length === 0 ? (
        <div className="p-8 sm:p-12 rounded-3xl bg-card border border-subtle text-center space-y-4">
          <div className="w-14 h-14 rounded-3xl bg-inner border border-subtle accent-text flex items-center justify-center mx-auto">
            <PackageCheck className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-primary">Henüz Kurulmuş Uygulama Yok</h3>
            <p className="text-xs text-muted mt-1 max-w-md mx-auto">
              Mağaza sekmesinden Lir veya diğer uygulamaları indirip kurduğunuzda burada görünecektir.
            </p>
          </div>
          <button
            type="button"
            onClick={onBrowseStore}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold btn-primary-koza hover:opacity-90 cursor-pointer"
          >
            <span>Mağazaya Git</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {installedApps.map((app) => {
            const inst = installedMap[app.id];
            const task = tasks[app.id];
            const isDownloadable = app.downloadable !== false;
            const hasUpdate = Boolean(inst && isUpdateAvailable(inst.version, app.latestVersion));

            return (
              <div
                key={app.id}
                onClick={() => onSelectApp(app)}
                className="p-4 sm:p-5 rounded-3xl bg-card border border-subtle hover:border-hover transition-colors cursor-pointer space-y-3"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <AppIcon
                      name={app.name}
                      iconUrl={app.iconUrl}
                      cacheKey={app.syncedAt}
                      grayscale={!isDownloadable}
                      className="w-12 h-12 rounded-2xl bg-modal border border-subtle p-1.5 shrink-0 flex items-center justify-center overflow-hidden"
                      imageClassName="w-full h-full object-contain rounded-lg"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-bold text-primary truncate">
                          {app.name}
                        </h3>
                        {!hasUpdate && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Güncel</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted font-mono tabular-nums mt-0.5 truncate">
                        {app.id} · Kurulu: v{inst.version} · Kurulum: {formatTurkishDate(inst.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {task ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void cancelTask(app.id);
                        }}
                        className="px-3.5 py-1.5 rounded-full bg-inner border border-subtle text-xs font-semibold text-primary flex items-center gap-1.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span className="tabular-nums">{task.message} ({task.percent}%)</span>
                      </button>
                    ) : (
                      <>
                        {hasUpdate && (
                          <button
                            type="button"
                            disabled={!isDownloadable}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isDownloadable) return;
                              void updateApp(app);
                            }}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                              !isDownloadable
                                ? 'bg-inner border border-subtle text-muted cursor-not-allowed opacity-60'
                                : 'btn-primary-koza hover:opacity-90 cursor-pointer'
                            }`}
                          >
                            {!isDownloadable ? <Ban className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            <span>{!isDownloadable ? 'İndirilemez' : 'Güncelle'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void launchApp(app).then((r) => {
                              if (!r.launched) onSelectApp(app);
                            });
                          }}
                          className="px-3.5 py-1.5 rounded-full bg-inner border border-subtle hover:bg-card-hover text-xs font-semibold text-primary flex items-center gap-1.5 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Aç</span>
                        </button>
                        <button
                          type="button"
                          disabled={!isDownloadable}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDownloadable) return;
                            void reinstallApp(app);
                          }}
                          className={`px-3.5 py-1.5 rounded-full bg-inner border border-subtle text-xs font-semibold flex items-center gap-1.5 ${
                            !isDownloadable
                              ? 'text-muted cursor-not-allowed opacity-50'
                              : 'hover:bg-card-hover text-secondary hover:text-primary cursor-pointer'
                          }`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Yeniden Kur</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void uninstallApp(app);
                          }}
                          className="px-3.5 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-400 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Kaldır</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {task && task.totalBytes > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-inner overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-150"
                        style={{
                          width: `${Math.max(4, task.percent)}%`,
                          backgroundColor: 'var(--accent)',
                        }}
                      />
                    </div>
                    <p className="text-[10px] font-mono tabular-nums text-muted text-right">
                      {formatBytes(task.receivedBytes)} / {formatBytes(task.totalBytes)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
