import { useEffect, useMemo, useState } from 'react';
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
  Bell,
  BellRing,
  ShieldCheck,
  ShieldAlert,
  Briefcase,
  FolderKanban,
  Layers,
  Code2,
  Gamepad2,
  Clock,
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
import { evaluateCompatibility } from '../utils/compatibility';
import type { CatalogDefinition, StoreApp } from '../types';

interface StoreViewProps {
  onSelectApp: (app: StoreApp) => void;
}

type StatusFilter = 'all' | 'installed' | 'updates' | 'upcoming';

function getCatalogIcon(catalogId: string, label: string, sizeClass = 'w-4 h-4') {
  const key = `${catalogId} ${label}`.toLowerCase();
  if (/(job|iş|erp|crm|kurumsal|enterprise|ofis)/.test(key)) {
    return <Briefcase className={sizeClass} />;
  }
  if (/(dev|code|geliştirici|sdk|cli|api)/.test(key)) {
    return <Code2 className={sizeClass} />;
  }
  if (/(game|oyun|arcade)/.test(key)) {
    return <Gamepad2 className={sizeClass} />;
  }
  return <FolderKanban className={sizeClass} />;
}

export function StoreView({ onSelectApp }: StoreViewProps) {
  const {
    apps,
    catalogs,
    activeCatalog,
    setActiveCatalog,
    installedMap,
    tasks,
    isSyncing,
    syncError,
    platformInfo,
    githubTokenConfigured,
    githubTokenStatusLoaded,
    syncCatalog,
    installApp,
    updateApp,
    launchApp,
    cancelTask,
    isFollowingApp,
    toggleFollowApp,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const hasGitHubRateLimitError = apps.some((app) =>
    /403|rate.?limit/i.test(app.syncError || '')
  ) || /403|rate.?limit/i.test(syncError || '');
  const hasGitHubRepoError = apps.some((app) => /404|not found/i.test(app.syncError || ''));

  const activeCatalogDef = useMemo(
    () => (activeCatalog === 'all' ? null : catalogs.find((c) => c.id === activeCatalog) || null),
    [activeCatalog, catalogs]
  );

  const catalogScopedApps = useMemo(() => {
    if (activeCatalog === 'all') return apps;
    return apps.filter((a) => a.catalogId === activeCatalog);
  }, [apps, activeCatalog]);

  const categories = useMemo(() => {
    const set = new Set<string>(['Tümü']);
    for (const app of catalogScopedApps) {
      if (app.category) set.add(app.category);
    }
    return Array.from(set);
  }, [catalogScopedApps]);

  useEffect(() => {
    if (selectedCategory !== 'Tümü' && !categories.includes(selectedCategory)) {
      setSelectedCategory('Tümü');
    }
  }, [categories, selectedCategory]);

  const latestUpdatedApp = useMemo(() => {
    const releasedPool = catalogScopedApps.filter(
      (a) => a.downloadable !== false && !a.comingSoon
    );
    if (releasedPool.length === 0) return null;
    return [...releasedPool].sort((a, b) => {
      const timeA = new Date(a.latestRelease?.publishedAt || a.syncedAt).getTime() || 0;
      const timeB = new Date(b.latestRelease?.publishedAt || b.syncedAt).getTime() || 0;
      return timeB - timeA;
    })[0];
  }, [catalogScopedApps]);

  const scopedInstalledCount = useMemo(
    () => catalogScopedApps.filter((a) => Boolean(installedMap[a.id])).length,
    [catalogScopedApps, installedMap]
  );

  const scopedUpdatableCount = useMemo(
    () =>
      catalogScopedApps.filter((a) => {
        const inst = installedMap[a.id];
        return Boolean(inst && isUpdateAvailable(inst.version, a.latestVersion));
      }).length,
    [catalogScopedApps, installedMap]
  );

  const upcomingAppsCount = useMemo(
    () => catalogScopedApps.filter((a) => a.downloadable === false || a.comingSoon).length,
    [catalogScopedApps]
  );

  const filteredApps = useMemo(() => {
    return catalogScopedApps.filter((app) => {
      const installed = installedMap[app.id];
      const hasUpdate = Boolean(installed && isUpdateAvailable(installed.version, app.latestVersion));
      const isComingSoon = app.downloadable === false || Boolean(app.comingSoon);

      if (statusFilter === 'installed' && !installed) return false;
      if (statusFilter === 'updates' && !hasUpdate) return false;
      if (statusFilter === 'upcoming' && !isComingSoon) return false;

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
          app.category.toLowerCase().includes(q) ||
          app.catalogLabel.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [catalogScopedApps, installedMap, statusFilter, selectedCategory, searchQuery]);

  const groupedSections = useMemo(() => {
    const orderMap = new Map<string, CatalogDefinition>();
    for (const def of catalogs) {
      orderMap.set(def.id, def);
    }

    const buckets = new Map<string, { catalog: CatalogDefinition; apps: StoreApp[] }>();
    for (const app of filteredApps) {
      const existing = buckets.get(app.catalogId);
      if (existing) {
        existing.apps.push(app);
      } else {
        const def = orderMap.get(app.catalogId) || {
          id: app.catalogId,
          label: app.catalogLabel,
        };
        buckets.set(app.catalogId, {
          catalog: def,
          apps: [app],
        });
      }
    }

    return Array.from(buckets.values()).sort(
      (a, b) =>
        (a.catalog.order ?? 99) - (b.catalog.order ?? 99) ||
        a.catalog.label.localeCompare(b.catalog.label, 'tr')
    );
  }, [filteredApps, catalogs]);

  const spotlightInstalled = latestUpdatedApp ? installedMap[latestUpdatedApp.id] : undefined;
  const spotlightTask = latestUpdatedApp ? tasks[latestUpdatedApp.id] : undefined;
  const spotlightDownloadable = latestUpdatedApp ? latestUpdatedApp.downloadable !== false : true;
  const spotlightFollowing = latestUpdatedApp ? isFollowingApp(latestUpdatedApp.id) : false;
  const spotlightCompatibility = latestUpdatedApp
    ? evaluateCompatibility(latestUpdatedApp, platformInfo)
    : null;
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
            {activeCatalogDef ? (
              getCatalogIcon(activeCatalogDef.id, activeCatalogDef.label, 'h-5 w-5')
            ) : (
              <Store className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-primary">
                {activeCatalogDef ? `${activeCatalogDef.label} Kataloğu` : 'Uygulama Mağazası'}
              </h1>
              {activeCatalogDef && (
                <button
                  type="button"
                  onClick={() => setActiveCatalog('all')}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-card border border-subtle text-secondary hover:text-primary hover:bg-card-hover transition-colors cursor-pointer"
                >
                  Tüm Kataloglar
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              {activeCatalogDef?.description ||
                'Hesap girişi gerektirmeden uygulamaları keşfedin, kurun, güncelleyin veya kaldırın.'}
            </p>
          </div>
        </div>

        {catalogScopedApps.length > 0 && (
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
              Tümü ({catalogScopedApps.length})
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
              Kurulu ({scopedInstalledCount})
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
              Güncellemeler ({scopedUpdatableCount})
            </button>
            {upcomingAppsCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('upcoming')}
                className={`px-3 py-1.5 rounded-full font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === 'upcoming'
                    ? 'btn-primary-koza'
                    : 'bg-card border-subtle text-secondary hover:bg-card-hover'
                }`}
              >
                Yakında ({upcomingAppsCount})
              </button>
            )}
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
                  {spotlightCompatibility && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`inline-flex items-center gap-1 font-sans font-semibold ${
                          spotlightCompatibility.status === 'compatible'
                            ? 'text-emerald-400'
                            : spotlightCompatibility.status === 'partial'
                            ? 'text-amber-400'
                            : 'text-red-400'
                        }`}
                      >
                        {spotlightCompatibility.status === 'compatible' ? (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        ) : (
                          <ShieldAlert className="w-3.5 h-3.5" />
                        )}
                        <span>{spotlightCompatibility.badgeLabel}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {(!spotlightDownloadable || latestUpdatedApp.comingSoon) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleFollowApp(latestUpdatedApp);
                  }}
                  className={`px-4 py-2.5 rounded-full border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                    spotlightFollowing
                      ? 'accent-subtle accent-border accent-text'
                      : 'bg-inner border-subtle text-primary hover:bg-card-hover'
                  }`}
                >
                  {spotlightFollowing ? (
                    <BellRing className="w-4 h-4" />
                  ) : (
                    <Bell className="w-4 h-4" />
                  )}
                  <span>{spotlightFollowing ? 'Takipte' : 'Bildirim Aç'}</span>
                </button>
              )}

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

      {/* Catalog & Category Filter Bars */}
      <div className="space-y-2.5">
        {catalogs.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <span className="text-[11px] font-semibold text-muted flex items-center gap-1 mr-1 shrink-0">
              <Layers className="w-3.5 h-3.5 accent-text" />
              <span>Katalog:</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveCatalog('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                activeCatalog === 'all'
                  ? 'btn-primary-koza shadow-xs'
                  : 'bg-card hover:bg-card-hover text-secondary border border-subtle'
              }`}
            >
              <span>Tüm Kataloglar</span>
              <span className="text-[10px] opacity-80 tabular-nums">({apps.length})</span>
            </button>
            {catalogs.map((cat) => {
              const isSelected = activeCatalog === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCatalog(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'btn-primary-koza shadow-xs'
                      : 'bg-card hover:bg-card-hover text-secondary border border-subtle'
                  }`}
                >
                  {getCatalogIcon(cat.id, cat.label, 'w-3.5 h-3.5')}
                  <span>{cat.label}</span>
                  <span className="text-[10px] opacity-80 tabular-nums">({cat.count || 0})</span>
                </button>
              );
            })}
          </div>
        )}

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
              setActiveCatalog('all');
            }}
            className="accent-text font-semibold hover:underline cursor-pointer"
          >
            Filtreleri Temizle
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedSections.map((section) => {
            const showSectionHeader = activeCatalog === 'all' && catalogs.length > 1;
            const readyApps =
              statusFilter === 'upcoming'
                ? []
                : section.apps.filter((a) => a.downloadable !== false && !a.comingSoon);
            const upcomingApps = section.apps.filter(
              (a) => a.downloadable === false || Boolean(a.comingSoon)
            );
            const orderedTableApps = [...readyApps, ...upcomingApps];

            return (
              <section key={section.catalog.id} className="space-y-4">
                {showSectionHeader && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-subtle">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl accent-subtle border accent-border accent-text flex items-center justify-center shrink-0">
                        {getCatalogIcon(section.catalog.id, section.catalog.label, 'w-4 h-4')}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-primary truncate">
                            {section.catalog.label}
                          </h2>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-card border border-subtle text-muted tabular-nums">
                            {section.apps.length} uygulama
                          </span>
                        </div>
                        {section.catalog.description && (
                          <p className="text-[11px] text-muted truncate">
                            {section.catalog.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveCatalog(section.catalog.id)}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold bg-card hover:bg-card-hover border border-subtle text-secondary hover:text-primary transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>Ayrı Göster</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {viewMode === 'grid' ? (
                  <div className="space-y-5">
                    {readyApps.length > 0 && (
                      <motion.div
                        layout
                        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4"
                      >
                        {readyApps.map((app) => (
                          <AppCard key={app.id} app={app} onSelect={onSelectApp} />
                        ))}
                      </motion.div>
                    )}

                    {upcomingApps.length > 0 && (
                      <div className="space-y-3">
                        {statusFilter !== 'upcoming' && (
                          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-2xl border border-dashed border-amber-500/35 bg-amber-500/[0.04]">
                            <div className="flex items-center gap-2 text-xs">
                              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="font-bold text-amber-400">
                                Yakında Yayınlanacaklar ({upcomingApps.length})
                              </span>
                              <span className="hidden sm:inline text-[11px] text-muted">
                                · Henüz indirmeye açılmadı, bildirim açarak takibe alabilirsiniz
                              </span>
                            </div>
                          </div>
                        )}
                        <motion.div
                          layout
                          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4"
                        >
                          {upcomingApps.map((app) => (
                            <AppCard key={app.id} app={app} onSelect={onSelectApp} />
                          ))}
                        </motion.div>
                      </div>
                    )}
                  </div>
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
                          {orderedTableApps.map((app) => {
                            const installed = installedMap[app.id];
                            const task = tasks[app.id];
                            const isDownloadable = app.downloadable !== false;
                            const isComingSoon = !isDownloadable || Boolean(app.comingSoon);
                            const following = isFollowingApp(app.id);
                            const compatibility = evaluateCompatibility(app, platformInfo);
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
                                className={`hover:bg-card-hover transition-colors cursor-pointer group ${
                                  isComingSoon ? 'bg-amber-500/[0.025]' : ''
                                }`}
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
                                        {app.new && !isComingSoon && (
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
                                      <div className="flex items-center gap-2 text-[11px] text-muted">
                                        <span>
                                          {app.developer} · {app.category}
                                        </span>
                                        <span
                                          className={`inline-flex items-center gap-1 font-semibold ${
                                            compatibility.status === 'compatible'
                                              ? 'text-emerald-400'
                                              : compatibility.status === 'partial'
                                              ? 'text-amber-400'
                                              : 'text-red-400'
                                          }`}
                                        >
                                          · {compatibility.badgeLabel}
                                        </span>
                                      </div>
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
                                    {isComingSoon && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void toggleFollowApp(app);
                                        }}
                                        className={`px-2.5 py-1.5 rounded-full border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                                          following
                                            ? 'accent-subtle accent-border accent-text'
                                            : 'bg-inner border-subtle text-primary hover:bg-card-hover'
                                        }`}
                                      >
                                        {following ? (
                                          <BellRing className="w-3 h-3" />
                                        ) : (
                                          <Bell className="w-3 h-3" />
                                        )}
                                        <span>{following ? 'Takipte' : 'Bildirim Aç'}</span>
                                      </button>
                                    )}
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
