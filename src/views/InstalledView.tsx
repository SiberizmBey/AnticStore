import { useMemo, useState } from 'react';
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
  History,
  Download,
  BellRing,
  AlertCircle,
  Loader2,
  Ban as BanIcon,
  ShieldAlert,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { AppIcon } from '../components/AppIcon';
import {
  checkInstalledMirrorStatus,
  formatBytes,
  formatSpeed,
  formatTurkishDate,
  isUpdateAvailable,
} from '../utils/semver';
import type { ActivityAction, ActivityLogEntry, StoreApp } from '../types';

interface InstalledViewProps {
  onSelectApp: (app: StoreApp) => void;
  onBrowseStore: () => void;
}

type HistoryFilter = 'all' | 'installs' | 'uninstalls' | 'follows' | 'errors';

function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${formatTurkishDate(iso)} · ${date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function getActionMeta(
  action: ActivityAction,
  status?: ActivityLogEntry['status']
): { label: string; colorClass: string } {
  if (status === 'in_progress') {
    return { label: 'İşlem Sürüyor', colorClass: 'accent-text accent-border accent-subtle' };
  }
  switch (action) {
    case 'install':
      return { label: 'Kurulum', colorClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
    case 'update':
      return { label: 'Güncelleme', colorClass: 'accent-text accent-border accent-subtle' };
    case 'reinstall':
      return { label: 'Yeniden Kurulum', colorClass: 'text-sky-400 border-sky-500/30 bg-sky-500/10' };
    case 'uninstall':
      return { label: 'Kaldırma', colorClass: 'text-red-400 border-red-500/30 bg-red-500/10' };
    case 'follow':
      return { label: 'Bildirim Açıldı', colorClass: 'accent-text accent-border accent-subtle' };
    case 'unfollow':
      return { label: 'Takip Kapatıldı', colorClass: 'text-muted border-subtle bg-inner' };
    case 'cancel':
      return { label: 'İptal Edildi', colorClass: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    case 'launch':
      return { label: 'Başlatıldı', colorClass: 'text-sky-400 border-sky-500/30 bg-sky-500/10' };
    case 'update_found':
      return { label: 'Güncelleme Tespit Edildi', colorClass: 'accent-text accent-border accent-subtle' };
    case 'error':
      return { label: 'Hata', colorClass: 'text-red-400 border-red-500/30 bg-red-500/10' };
    default:
      return { label: 'Durum', colorClass: 'text-secondary border-subtle bg-inner' };
  }
}

export function InstalledView({ onSelectApp, onBrowseStore }: InstalledViewProps) {
  const {
    apps,
    installedApps,
    updatableApps,
    installedMap,
    tasks,
    activityHistory,
    clearActivityHistory,
    installApp,
    updateApp,
    updateAllApps,
    reinstallApp,
    uninstallApp,
    launchApp,
    cancelTask,
  } = useStore();

  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

  const filteredHistory = useMemo(() => {
    return activityHistory.filter((item) => {
      if (historyFilter === 'installs') {
        return (
          item.action === 'install' ||
          item.action === 'update' ||
          item.action === 'reinstall' ||
          item.action === 'update_found'
        );
      }
      if (historyFilter === 'uninstalls') return item.action === 'uninstall';
      if (historyFilter === 'follows') return item.action === 'follow' || item.action === 'unfollow';
      if (historyFilter === 'errors') {
        return (
          item.status === 'failed' ||
          item.status === 'cancelled' ||
          item.action === 'error' ||
          item.action === 'cancel'
        );
      }
      return true;
    });
  }, [activityHistory, historyFilter]);

  const activeTasksList = useMemo(() => Object.values(tasks), [tasks]);
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
            const mirrorStatus = checkInstalledMirrorStatus(
              inst?.version,
              app.latestVersion,
              app.releases,
              app.syncError
            );
            const isUnofficialVersion = mirrorStatus.isUnofficial;

            return (
              <div
                key={app.id}
                onClick={() => onSelectApp(app)}
                className={`relative overflow-hidden p-4 sm:p-5 rounded-3xl bg-card border transition-colors cursor-pointer space-y-3 ${
                  isUnofficialVersion
                    ? 'card-danger-spotlight'
                    : 'border-subtle hover:border-hover'
                }`}
              >
                {isUnofficialVersion && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 card-danger-spotlight-aura"
                  />
                )}
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                        <h3
                          className={`text-sm sm:text-base font-bold truncate ${
                            isUnofficialVersion ? 'text-red-400' : 'text-primary'
                          }`}
                        >
                          {app.name}
                        </h3>
                        {isUnofficialVersion ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 border border-red-500/50 text-red-300">
                            <ShieldAlert className="w-3 h-3" />
                            <span>Resmi Dışı Sürüm</span>
                          </span>
                        ) : (
                          !hasUpdate && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Güncel</span>
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-xs text-muted font-mono tabular-nums mt-0.5 truncate">
                        {app.id} · Kurulu: v{inst.version} · Resmi: v{app.latestVersion}
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
                        {isUnofficialVersion && app.latestRelease && isDownloadable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void installApp(app, { release: app.latestRelease!, mode: 'reinstall' });
                            }}
                            className="px-3.5 py-1.5 rounded-full bg-red-600 hover:bg-red-500 border border-red-400/50 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Resmi Sürümü Kur</span>
                          </button>
                        )}
                        {!isUnofficialVersion && hasUpdate && (
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

                {isUnofficialVersion && (
                  <div className="relative z-10 p-3 rounded-2xl bg-red-500/15 border border-red-500/45 text-[11px] text-red-100 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>
                      Uygulama resmi yansılarda var olmayan bir sürüm içeriyor. Lütfen güncel sürümü doğrudan Koru üzerinden indirip kurun.
                    </span>
                  </div>
                )}

                {task && task.totalBytes > 0 && (
                  <div className="relative z-10 space-y-1">
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

      {/* Download & Activity History Section */}
      <section className="p-5 sm:p-6 rounded-3xl bg-card border border-subtle space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-inner border border-subtle flex items-center justify-center accent-text shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-primary">
                İndirme ve Durum Geçmişi ({activityHistory.length})
              </h2>
              <p className="text-[11px] text-muted">
                Kurulum, güncelleme, kaldırma ve bildirim takibi kayıtları burada saklanır.
              </p>
            </div>
          </div>

          {activityHistory.length > 0 && (
            <button
              type="button"
              onClick={clearActivityHistory}
              className="px-3 py-1.5 rounded-full bg-inner border border-subtle hover:border-hover text-[11px] font-semibold text-muted hover:text-red-400 transition-colors cursor-pointer self-start sm:self-auto"
            >
              Geçmişi Temizle
            </button>
          )}
        </div>

        {activityHistory.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {(
              [
                { id: 'all', label: 'Tümü' },
                { id: 'installs', label: 'Kurulum & Güncelleme' },
                { id: 'uninstalls', label: 'Kaldırma' },
                { id: 'follows', label: 'Takip' },
                { id: 'errors', label: 'Hata & İptal' },
              ] as Array<{ id: HistoryFilter; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setHistoryFilter(tab.id)}
                className={`px-3 py-1 rounded-full font-semibold border transition-colors cursor-pointer ${
                  historyFilter === tab.id
                    ? 'btn-primary-koza'
                    : 'bg-inner border-subtle text-secondary hover:text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Active in-flight tasks without an in_progress entry (fallback safety) */}
        {activeTasksList
          .filter((t) => !activityHistory.some((h) => h.appId === t.appId && h.status === 'in_progress'))
          .map((activeTask) => {
            const matchedApp = apps.find((a) => a.id === activeTask.appId);
            return (
              <div
                key={`live-${activeTask.appId}`}
                className="p-3.5 rounded-2xl accent-subtle border accent-border space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="w-4 h-4 accent-text animate-spin shrink-0" />
                    <span className="font-bold text-primary truncate">
                      {matchedApp?.name || activeTask.appId}
                    </span>
                    <span className="text-[11px] accent-text font-semibold truncate">
                      {activeTask.message}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold tabular-nums text-primary">
                      {activeTask.percent}%
                    </span>
                    <button
                      type="button"
                      onClick={() => void cancelTask(activeTask.appId)}
                      className="px-2.5 py-1 rounded-full bg-card border border-subtle text-[11px] font-semibold text-primary hover:bg-card-hover cursor-pointer"
                    >
                      İptal
                    </button>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-card overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-150"
                    style={{
                      width: `${Math.max(4, activeTask.percent)}%`,
                      backgroundColor: 'var(--accent)',
                    }}
                  />
                </div>
              </div>
            );
          })}

        {filteredHistory.length === 0 && activeTasksList.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted rounded-2xl bg-inner/40 border border-subtle">
            {activityHistory.length === 0
              ? 'Henüz kaydedilmiş bir indirme veya durum hareketi yok.'
              : 'Seçilen filtreye uygun kayıt bulunamadı.'}
          </div>
        ) : (
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {filteredHistory.map((entry) => {
              const meta = getActionMeta(entry.action, entry.status);
              const matchedApp = apps.find((a) => a.id === entry.appId);
              const liveTask = entry.status === 'in_progress' ? tasks[entry.appId] : undefined;
              return (
                <div
                  key={entry.id}
                  onClick={matchedApp ? () => onSelectApp(matchedApp) : undefined}
                  className={`p-3 rounded-2xl bg-inner/65 border border-subtle space-y-2 ${
                    matchedApp ? 'hover:border-hover cursor-pointer transition-colors' : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-card border border-subtle flex items-center justify-center shrink-0">
                        {entry.status === 'in_progress' ? (
                          <Loader2 className="w-4 h-4 accent-text animate-spin" />
                        ) : entry.status === 'failed' || entry.action === 'error' ? (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        ) : entry.status === 'cancelled' || entry.action === 'cancel' ? (
                          <BanIcon className="w-4 h-4 text-amber-400" />
                        ) : entry.action === 'follow' || entry.action === 'unfollow' ? (
                          <BellRing className="w-4 h-4 accent-text" />
                        ) : entry.action === 'uninstall' ? (
                          <Trash2 className="w-4 h-4 text-red-400" />
                        ) : entry.action === 'launch' ? (
                          <Play className="w-4 h-4 text-sky-400" />
                        ) : entry.action === 'update_found' ? (
                          <RefreshCw className="w-4 h-4 accent-text" />
                        ) : (
                          <Download className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-primary truncate">
                            {entry.appName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.colorClass}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-secondary mt-0.5 truncate">
                          {liveTask ? liveTask.message : entry.message}
                          {entry.fileSize && entry.fileSize > 0
                            ? ` · ${formatBytes(entry.fileSize)}`
                            : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {liveTask && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void cancelTask(entry.appId);
                          }}
                          className="px-2.5 py-1 rounded-full bg-card border border-subtle text-[11px] font-semibold text-primary hover:bg-card-hover cursor-pointer"
                        >
                          İptal ({liveTask.percent}%)
                        </button>
                      )}
                      <span className="text-[10px] font-mono text-muted tabular-nums">
                        {formatActivityTime(entry.timestamp)}
                      </span>
                    </div>
                  </div>

                  {liveTask && (
                    <div className="space-y-1 pt-0.5">
                      <div className="h-1.5 w-full rounded-full bg-card overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-150"
                          style={{
                            width: `${Math.max(4, liveTask.percent)}%`,
                            backgroundColor: 'var(--accent)',
                          }}
                        />
                      </div>
                      {liveTask.totalBytes > 0 && (
                        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-muted">
                          <span>
                            {formatBytes(liveTask.receivedBytes)} / {formatBytes(liveTask.totalBytes)}
                          </span>
                          <span>{formatSpeed(liveTask.speedBps)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
