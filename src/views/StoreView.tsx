import { useMemo, useState } from 'react';
import {
  Search,
  Grid,
  List,
  Download,
  RefreshCw,
  Play,
  ChevronRight,
  Store,
  Sparkles,
  CheckCircle2,
  X,
  Ban,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { AppCard } from '../components/AppCard';
import { AppIcon } from '../components/AppIcon';
import { GitHubTokenCard } from '../components/GitHubTokenCard';
import {
  formatBytes,
  formatTurkishDate,
  isUpdateAvailable,
  pickPreferredAsset,
} from '../utils/semver';
import type { StoreApp } from '../types';

interface StoreViewProps {
  onSelectApp: (app: StoreApp) => void;
}

type StatusFilter = 'all' | 'installed' | 'updates';

export function StoreView({ onSelectApp }: StoreViewProps) {
  const {
    apps,
    installedMap,
    tasks,
    isSyncing,
    syncError,
    platformInfo,
    updatableApps,
    installedApps,
    githubTokenConfigured,
    githubTokenStatusLoaded,
    syncCatalog,
    installApp,
    updateApp,
    launchApp,
    cancelTask,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const hasGitHubRateLimitError = apps.some((app) =>
    /403|rate.?limit/i.test(app.syncError || '')
  ) || /403|rate.?limit/i.test(syncError || '');
  const hasGitHubRepoError = apps.some((app) => /404|not found/i.test(app.syncError || ''));

  const categories = useMemo(() => {
    const set = new Set<string>(['Tümü']);
    for (const app of apps) {
      if (app.category) set.add(app.category);
    }
    return Array.from(set);
  }, [apps]);

  const latestUpdatedApp = useMemo(() => {
    if (apps.length === 0) return null;
    return [...apps].sort((a, b) => {
      const timeA = new Date(a.latestRelease?.publishedAt || a.syncedAt).getTime() || 0;
      const timeB = new Date(b.latestRelease?.publishedAt || b.syncedAt).getTime() || 0;
      return timeB - timeA;
    })[0];
  }, [apps]);

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const installed = installedMap[app.id];
      const hasUpdate = Boolean(installed && isUpdateAvailable(installed.version, app.latestVersion));

      if (statusFilter === 'installed' && !installed) return false;
      if (statusFilter === 'updates' && !hasUpdate) return false;

      if (selectedCategory !== 'Tümü' && app.category !== selectedCategory) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          app.name.toLowerCase().includes(q) ||
          app.id.toLowerCase().includes(q) ||
          app.developer.toLowerCase().includes(q) ||
          app.summary.toLowerCase().includes(q) ||
          app.category.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [apps, installedMap, statusFilter, selectedCategory, searchQuery]);

  const spotlightInstalled = latestUpdatedApp ? installedMap[latestUpdatedApp.id] : undefined;
  const spotlightTask = latestUpdatedApp ? tasks[latestUpdatedApp.id] : undefined;
  const spotlightDownloadable = latestUpdatedApp ? latestUpdatedApp.downloadable !== false : true;
  const spotlightHasUpdate = Boolean(
    latestUpdatedApp &&
      spotlightInstalled &&
      isUpdateAvailable(spotlightInstalled.version, latestUpdatedApp.latestVersion)
  );
  const spotlightDownloadBlocked = Boolean(
    latestUpdatedApp &&
      !spotlightDownloadable &&
      !spotlightTask &&
      (!spotlightInstalled || spotlightHasUpdate)
  );
  const spotlightAsset =
    latestUpdatedApp && latestUpdatedApp.latestRelease
      ? pickPreferredAsset(latestUpdatedApp.latestRelease.assets, platformInfo.platform)
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border accent-border accent-subtle p-2.5 accent-text">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Uygulama Mağazası</h1>
            <p className="mt-1 text-xs text-muted">
              Hesap girişi gerektirmeden uygulamaları keşfedin, kurun, güncelleyin veya kaldırın.
            </p>
          </div>
        </div>

        {apps.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-full font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'btn-primary-koza'
                  : 'bg-card border-subtle text-secondary hover:bg-card-hover'
              }`}
            >
              Tümü ({apps.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('installed')}
              className={`px-3 py-1.5 rounded-full font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'installed'
                  ? 'btn-primary-koza'
                  : 'bg-card border-subtle text-secondary hover:bg-card-hover'
              }`}
            >
              Kurulu ({installedApps.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('updates')}
              className={`px-3 py-1.5 rounded-full font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'updates'
                  ? 'btn-primary-koza'
                  : 'bg-card border-subtle text-secondary hover:bg-card-hover'
              }`}
            >
              Güncellemeler ({updatableApps.length})
            </button>
          </div>
        )}
      </header>

      {githubTokenStatusLoaded && !githubTokenConfigured && (
        <GitHubTokenCard
          hasRateLimitError={hasGitHubRateLimitError}
          hasRepoError={hasGitHubRepoError}
        />
      )}
      {githubTokenStatusLoaded &&
        githubTokenConfigured &&
        (hasGitHubRateLimitError || hasGitHubRepoError) && (
          <section
            role="alert"
            className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3"
          >
            <p className="text-xs text-secondary">
              {hasGitHubRateLimitError
                ? 'GitHub sürüm bilgileri alınamadı. Ayarlar’dan anahtar erişimini kontrol edin.'
                : 'Bir GitHub deposuna erişilemiyor. Detay ekranında hatanın hangi depo için olduğunu görebilirsiniz.'}
            </p>
            <button
              type="button"
              onClick={() => void syncCatalog()}
              className="shrink-0 text-xs font-semibold accent-text hover:underline cursor-pointer"
            >
              Yeniden Dene
            </button>
          </section>
        )}

      {/* Latest Updated App Spotlight */}
      {latestUpdatedApp && !searchQuery.trim() && selectedCategory === 'Tümü' && statusFilter === 'all' && (
        <section
          onClick={() => onSelectApp(latestUpdatedApp)}
          className="p-6 rounded-3xl bg-card border border-subtle hover:border-hover transition-colors cursor-pointer"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4 min-w-0">
              <AppIcon
                name={latestUpdatedApp.name}
                iconUrl={latestUpdatedApp.iconUrl}
                cacheKey={latestUpdatedApp.syncedAt}
                grayscale={!spotlightDownloadable}
                className="flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-modal p-2"
                imageClassName="h-full w-full object-contain rounded-xl"
              />
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 text-xs accent-text font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Son Güncellenen Uygulama</span>
                </div>
                <div className="flex items-center gap-2.5 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight truncate">
                    {latestUpdatedApp.name}
                  </h2>
                  {latestUpdatedApp.new && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold badge-koza shrink-0">
                      Yeni
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-secondary max-w-3xl leading-relaxed">
                  {latestUpdatedApp.description}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted font-mono tabular-nums pt-1">
                  <span>{latestUpdatedApp.developer}</span>
                  <span aria-hidden="true">·</span>
                  <span>v{latestUpdatedApp.latestVersion}</span>
                  {spotlightAsset && spotlightAsset.size > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{formatBytes(spotlightAsset.size)}</span>
                    </>
                  )}
                  {(latestUpdatedApp.releaseDate || latestUpdatedApp.latestRelease?.publishedAt) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Yayın: {formatTurkishDate(latestUpdatedApp.releaseDate || latestUpdatedApp.latestRelease?.publishedAt)}
                      </span>
                    </>
                  )}
                  {latestUpdatedApp.announcedAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Duyuru: {formatTurkishDate(latestUpdatedApp.announcedAt)}</span>
                    </>
                  )}
                  {latestUpdatedApp.upcomingUpdateDate && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Yaklaşan: {formatTurkishDate(latestUpdatedApp.upcomingUpdateDate)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {spotlightTask ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void cancelTask(latestUpdatedApp.id);
                  }}
                  className="px-5 py-2.5 rounded-full bg-inner border border-subtle text-xs font-bold text-primary flex items-center gap-2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span className="tabular-nums">İptal ({spotlightTask.percent}%)</span>
                </button>
              ) : spotlightDownloadBlocked ? (
                <button
                  type="button"
                  disabled
                  onClick={(e) => e.stopPropagation()}
                  className="px-5 py-2.5 rounded-full bg-inner border border-subtle text-xs font-bold text-muted flex items-center gap-2 cursor-not-allowed opacity-60 whitespace-nowrap"
                >
                  <Ban className="w-4 h-4" />
                  <span>İndirilemez</span>
                </button>
              ) : spotlightHasUpdate ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void updateApp(latestUpdatedApp);
                  }}
                  className="px-5 py-2.5 rounded-full text-xs font-bold btn-primary-koza hover:opacity-90 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Güncelle (v{latestUpdatedApp.latestVersion})</span>
                </button>
              ) : spotlightInstalled ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void launchApp(latestUpdatedApp).then((res) => {
                      if (!res.launched) onSelectApp(latestUpdatedApp);
                    });
                  }}
                  className="px-5 py-2.5 rounded-full text-xs font-bold btn-primary-koza hover:opacity-90 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-4 h-4" />
                  <span>Uygulamayı Aç</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void installApp(latestUpdatedApp);
                  }}
                  disabled={!spotlightAsset}
                  className="px-5 py-2.5 rounded-full text-xs font-bold btn-primary-koza hover:opacity-90 flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>İndir ve Kur</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectApp(latestUpdatedApp);
                }}
                className="px-4 py-2.5 rounded-full bg-inner hover:bg-card-hover border border-subtle text-xs font-semibold text-primary cursor-pointer whitespace-nowrap"
              >
                Detaylar & Sürümler
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Search & View Mode Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 sm:max-w-md lg:max-w-lg">
          <Search className="w-4 h-4 text-muted absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Uygulama, geliştirici veya paket adı ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-16 py-2.5 rounded-full bg-input border border-input focus:border-accent focus:outline-none text-xs text-primary transition-colors placeholder:text-muted"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-muted hover:text-primary cursor-pointer"
            >
              Temizle
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-full bg-input border border-subtle">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'accent-subtle accent-text' : 'text-muted hover:text-primary'
              }`}
              title="Kart Görünümü"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                viewMode === 'table' ? 'accent-subtle accent-text' : 'text-muted hover:text-primary'
              }`}
              title="Liste Görünümü"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'btn-primary-koza shadow-xs'
                  : 'bg-card hover:bg-card-hover text-secondary border border-subtle'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      {isSyncing && apps.length === 0 ? (
        <div className="py-20 text-center text-xs text-muted flex flex-col items-center justify-center gap-2">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span>Katalog senkronize ediliyor...</span>
        </div>
      ) : syncError && apps.length === 0 ? (
        <div className="p-8 rounded-3xl bg-card border border-subtle text-center max-w-xl mx-auto my-6 space-y-4">
          <p className="text-xs text-red-400">{syncError}</p>
          <button
            type="button"
            onClick={() => void syncCatalog()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold btn-primary-koza cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Yeniden Dene</span>
          </button>
        </div>
      ) : apps.length === 0 ? (
        <div className="p-8 sm:p-12 rounded-3xl bg-card border border-subtle text-center max-w-xl mx-auto my-6 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-card border border-subtle accent-text flex items-center justify-center mx-auto">
            <Store className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-primary mb-2">Katalogda Henüz Uygulama Yok</h3>
            <p className="text-xs text-muted leading-relaxed max-w-md mx-auto">
              Resmi katalog güncellendiğinde yayınlanan uygulamalar burada otomatik olarak listelenecektir.
            </p>
          </div>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="py-16 text-center text-xs text-muted space-y-2">
          <p>Arama veya filtre kriterlerine uygun uygulama bulunamadı.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('Tümü');
              setStatusFilter('all');
            }}
            className="accent-text font-semibold hover:underline cursor-pointer"
          >
            Filtreleri Temizle
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <motion.div
          layout
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4"
        >
          {filteredApps.map((app) => (
            <AppCard key={app.id} app={app} onSelect={onSelectApp} />
          ))}
        </motion.div>
      ) : (
        <div className="rounded-3xl bg-card border border-subtle overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-subtle bg-inner/60 text-muted font-semibold">
                  <th className="py-3 px-4">Uygulama</th>
                  <th className="py-3 px-4">Paket Kimliği</th>
                  <th className="py-3 px-4">Sürüm</th>
                  <th className="py-3 px-4">Boyut</th>
                  <th className="py-3 px-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {filteredApps.map((app) => {
                  const installed = installedMap[app.id];
                  const task = tasks[app.id];
                  const isDownloadable = app.downloadable !== false;
                  const hasUpdate = Boolean(
                    installed && isUpdateAvailable(installed.version, app.latestVersion)
                  );
                  const isDownloadBlocked = !isDownloadable && !task && (!installed || hasUpdate);
                  const asset = app.latestRelease
                    ? pickPreferredAsset(app.latestRelease.assets, platformInfo.platform)
                    : null;

                  return (
                    <tr
                      key={app.id}
                      onClick={() => onSelectApp(app)}
                      className="hover:bg-card-hover transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <AppIcon
                            name={app.name}
                            iconUrl={app.iconUrl}
                            cacheKey={app.syncedAt}
                            grayscale={!isDownloadable}
                            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-subtle bg-inner p-1"
                            imageClassName="h-full w-full object-contain rounded-lg"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-primary block group-hover:accent-text transition-colors truncate">
                                {app.name}
                              </span>
                              {app.new && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold badge-koza shrink-0">
                                  Yeni
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted">
                              {app.developer} · {app.category}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-secondary">{app.id}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <span className="text-primary font-semibold">v{app.latestVersion}</span>
                        {installed && (
                          <span className="block text-[10px] text-emerald-400">
                            Kurulu: v{installed.version}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-muted">
                        {asset && asset.size > 0 ? formatBytes(asset.size) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isDownloadBlocked || (!asset && !installed && !task)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (task) void cancelTask(app.id);
                              else if (isDownloadBlocked) return;
                              else if (hasUpdate) void updateApp(app);
                              else if (installed)
                                void launchApp(app).then((r) => {
                                  if (!r.launched) onSelectApp(app);
                                });
                              else void installApp(app);
                            }}
                            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                              isDownloadBlocked
                                ? 'bg-inner border border-subtle text-muted cursor-not-allowed opacity-60'
                                : hasUpdate || !installed
                                ? 'btn-primary-koza cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
                                : 'bg-inner border border-subtle text-primary cursor-pointer'
                            }`}
                          >
                            {task ? (
                              `${task.percent}%`
                            ) : isDownloadBlocked ? (
                              <span className="inline-flex items-center gap-1">
                                <Ban className="w-3 h-3" />
                                İndirilemez
                              </span>
                            ) : hasUpdate ? (
                              'Güncelle'
                            ) : installed ? (
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Aç
                              </span>
                            ) : (
                              'Yükle'
                            )}
                          </button>
                          <ChevronRight className="w-4 h-4 text-muted group-hover:text-primary" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
