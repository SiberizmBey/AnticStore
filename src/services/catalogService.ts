import type {
  CatalogAppEntry,
  CatalogDefinition,
  CatalogSource,
  RemoteCatalogManifest,
  SignalEntry,
  SignalsManifest,
  StoreApp,
  StoreAsset,
  StoreRelease,
} from '../types';
import bundledCatalog from '../../catalog.json';
import bundledSignals from '../../signals.json';
import { cleanVersion, detectAssetMeta } from '../utils/semver';
import { normalizePermissionsList } from '../utils/compatibility';

export const OFFICIAL_STORE_REPO = 'SiberizmBey/AnticStore';

interface GitHubRepoBundle {
  repo: {
    name?: string;
    full_name?: string;
    description?: string;
    html_url?: string;
    homepage?: string;
    stargazers_count?: number;
    topics?: string[];
    owner?: {
      login?: string;
      avatar_url?: string;
    };
  };
  releases: Array<{
    tag_name?: string;
    name?: string;
    body?: string;
    published_at?: string;
    prerelease?: boolean;
    draft?: boolean;
    html_url?: string;
    assets?: Array<{
      name?: string;
      size?: number;
      browser_download_url?: string;
      content_type?: string;
    }>;
  }>;
  packageJson?: {
    name?: string;
    version?: string;
    description?: string;
    build?: {
      appId?: string;
      productName?: string;
    };
  } | null;
  anticManifest?: Partial<CatalogAppEntry> | null;
  iconUrl?: string | null;
}

export function normalizeGitHubRepoInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i);
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2].replace(/\.git$/i, '')}`;
  }

  const slugMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (slugMatch) {
    return `${slugMatch[1]}/${slugMatch[2]}`;
  }

  return null;
}

async function fetchJsonSmart<T>(url: string): Promise<T> {
  if (window.anticStoreDesktop) {
    return window.anticStoreDesktop.fetchJson<T>(url);
  }
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as { error?: string }).error || `İstek başarısız (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function fetchGitHubBundleDesktop(owner: string, repo: string): Promise<GitHubRepoBundle> {
  const desktop = window.anticStoreDesktop!;
  const [repoInfo, releases] = await Promise.all([
    desktop.fetchJson<GitHubRepoBundle['repo']>(`https://api.github.com/repos/${owner}/${repo}`),
    desktop.fetchJson<GitHubRepoBundle['releases']>(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=15`
    ),
  ]);

  let packageJson: GitHubRepoBundle['packageJson'] = null;
  try {
    packageJson = await desktop.fetchJsonOptional<NonNullable<GitHubRepoBundle['packageJson']>>(
      `https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`
    );
  } catch {
    // Optional
  }

  let anticManifest: GitHubRepoBundle['anticManifest'] = null;
  try {
    anticManifest = await desktop.fetchJsonOptional<NonNullable<GitHubRepoBundle['anticManifest']>>(
      `https://raw.githubusercontent.com/${owner}/${repo}/main/anticstore.json`
    );
  } catch {
    // Optional
  }

  const iconUrl =
    (typeof anticManifest?.iconUrl === 'string' ? anticManifest.iconUrl : null) ||
    `https://raw.githubusercontent.com/${owner}/${repo}/main/public/assets/img/icon.png`;

  return {
    repo: repoInfo,
    releases: Array.isArray(releases) ? releases : [],
    packageJson,
    anticManifest,
    iconUrl,
  };
}

async function fetchGitHubBundle(repoSlug: string): Promise<GitHubRepoBundle> {
  const [owner, repo] = repoSlug.split('/');
  if (window.anticStoreDesktop) {
    return fetchGitHubBundleDesktop(owner, repo);
  }
  return fetchJsonSmart<GitHubRepoBundle>(`/api/github/repo?repo=${encodeURIComponent(repoSlug)}`);
}

function parseDownloadableFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  }
  if (typeof value === 'number') return value !== 0;
  return undefined;
}

function inferCategory(name: string, summary: string, topics: string[]): string {
  const haystack = `${name} ${summary} ${topics.join(' ')}`.toLowerCase();
  if (/(ses|sound|audio|music|soundpad|lir)/.test(haystack)) return 'Ses & Medya';
  if (/(dev|code|git|cli|sdk|terminal|api)/.test(haystack)) return 'Geliştirici';
  if (/(erp|mes|plan|task|not|office|productivity)/.test(haystack)) return 'Üretkenlik';
  if (/(auth|2fa|vault|security|crypto|pass)/.test(haystack)) return 'Güvenlik';
  return 'Araçlar';
}

function normalizeCatalogId(raw?: string): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned || cleaned === 'general' || cleaned === 'genel' || cleaned === 'default' || cleaned === 'main') {
    return 'general';
  }
  return cleaned;
}

function formatCatalogLabel(raw: string | undefined, id: string): string {
  if (id === 'general') return 'Genel';
  const trimmed = (raw || '').trim();
  if (!trimmed) return id.charAt(0).toUpperCase() + id.slice(1);
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return trimmed;
}

function parseManifestCatalogDefs(
  rawCatalogs?: RemoteCatalogManifest['catalogs']
): Map<string, CatalogDefinition> {
  const map = new Map<string, CatalogDefinition>();
  if (!Array.isArray(rawCatalogs)) return map;

  rawCatalogs.forEach((item, idx) => {
    if (typeof item === 'string') {
      const id = normalizeCatalogId(item);
      map.set(id, {
        id,
        label: formatCatalogLabel(item, id),
        order: id === 'general' ? -1 : idx,
      });
    } else if (item && typeof item === 'object' && typeof item.id === 'string') {
      const id = normalizeCatalogId(item.id);
      map.set(id, {
        id,
        label:
          typeof item.label === 'string' && item.label.trim()
            ? item.label.trim()
            : formatCatalogLabel(item.id, id),
        description:
          typeof item.description === 'string' && item.description.trim()
            ? item.description.trim()
            : undefined,
        order: typeof item.order === 'number' ? item.order : id === 'general' ? -1 : idx,
      });
    }
  });

  return map;
}

function resolveAppCatalog(
  rawCatalog: string | undefined,
  defsMap: Map<string, CatalogDefinition>
): { catalogId: string; catalogLabel: string } {
  const catalogId = normalizeCatalogId(rawCatalog);
  const directDef = defsMap.get(catalogId);
  if (directDef) {
    return { catalogId: directDef.id, catalogLabel: directDef.label };
  }
  for (const def of defsMap.values()) {
    if (normalizeCatalogId(def.label) === catalogId) {
      return { catalogId: def.id, catalogLabel: def.label };
    }
  }
  return {
    catalogId,
    catalogLabel: formatCatalogLabel(rawCatalog, catalogId),
  };
}

function mapBundleToStoreApp(
  bundle: GitHubRepoBundle,
  sourceLabel: string,
  override?: Partial<CatalogAppEntry>,
  catalogDefsMap: Map<string, CatalogDefinition> = new Map()
): StoreApp {
  const repoInfo = bundle.repo || {};
  const pkg = bundle.packageJson || {};
  const manifest = bundle.anticManifest || {};

  const fullName = repoInfo.full_name || override?.githubRepo || '';
  const [ownerName, repoName] = fullName.split('/');

  const releases: StoreRelease[] = (bundle.releases || [])
    .filter((r) => !r.draft)
    .map((r) => {
      const tag = r.tag_name || r.name || 'v0.0.0';
      const assets: StoreAsset[] = (r.assets || [])
        .filter((a) => Boolean(a.browser_download_url && a.name))
        .map((a) => {
          const meta = detectAssetMeta(a.name!);
          return {
            name: a.name!,
            size: a.size || 0,
            downloadUrl: a.browser_download_url!,
            contentType: a.content_type,
            platform: meta.platform,
            installerType: meta.installerType,
          };
        });

      return {
        tag,
        version: cleanVersion(r.name || tag),
        name: r.name || tag,
        notes: (r.body || '').trim(),
        publishedAt: r.published_at || '',
        prerelease: Boolean(r.prerelease),
        htmlUrl: r.html_url,
        assets,
      };
    });

  const latestRelease = releases.find((r) => !r.prerelease) || releases[0] || null;
  const appId =
    override?.id ||
    manifest.id ||
    pkg.build?.appId ||
    `com.github.${(ownerName || 'app').toLowerCase()}.${(repoName || 'pkg').toLowerCase()}`;

  const appName =
    override?.name ||
    manifest.name ||
    pkg.build?.productName ||
    repoInfo.name ||
    repoName ||
    appId;

  const developer =
    override?.developer ||
    manifest.developer ||
    repoInfo.owner?.login ||
    ownerName ||
    'Antic Valley';

  const summary =
    override?.summary ||
    manifest.summary ||
    repoInfo.description ||
    pkg.description ||
    'Açık kaynaklı masaüstü uygulaması';

  const description =
    override?.description ||
    manifest.description ||
    repoInfo.description ||
    summary;

  const category =
    override?.category ||
    manifest.category ||
    inferCategory(appName, summary, repoInfo.topics || []);

  const { catalogId, catalogLabel } = resolveAppCatalog(
    override?.catalog || manifest.catalog,
    catalogDefsMap
  );

  const iconUrl =
    override?.iconUrl ||
    manifest.iconUrl ||
    bundle.iconUrl ||
    repoInfo.owner?.avatar_url;
  const screenshots = override?.screenshots || manifest.screenshots;

  const overrideDownloadable = parseDownloadableFlag(override?.downloadable);
  const manifestDownloadable = parseDownloadableFlag(manifest.downloadable);
  const downloadable = (overrideDownloadable ?? manifestDownloadable) !== false;
  const comingSoon = Boolean(override?.comingSoon ?? manifest.comingSoon ?? !downloadable);
  const announcedAt = override?.announcedAt || manifest.announcedAt;
  const releaseDate =
    override?.releaseDate ||
    manifest.releaseDate ||
    latestRelease?.publishedAt ||
    override?.publishedAt ||
    manifest.publishedAt;
  const upcomingUpdateDate = override?.upcomingUpdateDate || manifest.upcomingUpdateDate;
  const requirements = override?.requirements || manifest.requirements;
  const permissions = normalizePermissionsList(override?.permissions || manifest.permissions);

  return {
    id: appId,
    name: appName,
    developer,
    developerAvatarUrl: repoInfo.owner?.avatar_url,
    category,
    catalogId,
    catalogLabel,
    summary,
    description,
    iconUrl: iconUrl || undefined,
    screenshots: Array.isArray(screenshots)
      ? screenshots.filter((url): url is string => typeof url === 'string')
      : [],
    websiteUrl: override?.websiteUrl || repoInfo.homepage || repoInfo.html_url || `https://github.com/${fullName}`,
    repoFullName: fullName,
    repoUrl: repoInfo.html_url || `https://github.com/${fullName}`,
    stars: repoInfo.stargazers_count,
    featured: Boolean(override?.featured || manifest.featured),
    new: Boolean(override?.new ?? manifest.new),
    downloadable,
    comingSoon,
    announcedAt: announcedAt || undefined,
    releaseDate: releaseDate || undefined,
    upcomingUpdateDate: upcomingUpdateDate || undefined,
    requirements,
    permissions: permissions.length > 0 ? permissions : undefined,
    requirementsInferred: !requirements,
    permissionsInferred: permissions.length === 0,
    tags:
      override?.tags ||
      manifest.tags ||
      (repoInfo.topics && repoInfo.topics.length > 0 ? repoInfo.topics.slice(0, 4) : ['GitHub Release']),
    latestVersion: latestRelease?.version || cleanVersion(pkg.version || '1.0.0'),
    latestRelease,
    releases,
    sourceId: 'official-anticstore',
    sourceLabel,
    syncedAt: new Date().toISOString(),
  };
}

function mapDirectEntryToStoreApp(
  entry: CatalogAppEntry,
  sourceLabel: string,
  catalogDefsMap: Map<string, CatalogDefinition> = new Map()
): StoreApp {
  const version = cleanVersion(entry.version || '1.0.0');
  const fileName = entry.fileName || `${entry.name || entry.id}-${version}.exe`;
  const meta = detectAssetMeta(fileName);

  const release: StoreRelease | null = entry.downloadUrl
    ? {
        tag: `v${version}`,
        version,
        name: `v${version}`,
        notes: entry.releaseNotes || '',
        publishedAt: entry.publishedAt || entry.releaseDate || '',
        assets: [
          {
            name: fileName,
            size: entry.fileSize || 0,
            downloadUrl: entry.downloadUrl,
            platform: entry.platform || meta.platform,
            installerType: meta.installerType,
          },
        ],
      }
    : null;

  const directDownloadable = parseDownloadableFlag(entry.downloadable) !== false;
  const directPermissions = normalizePermissionsList(entry.permissions);
  const { catalogId, catalogLabel } = resolveAppCatalog(entry.catalog, catalogDefsMap);

  return {
    id: entry.id,
    name: entry.name || entry.id,
    developer: entry.developer || 'Antic Valley',
    category: entry.category || 'Araçlar',
    catalogId,
    catalogLabel,
    summary: entry.summary || 'Koru uygulaması',
    description: entry.description || entry.summary || 'Koru kataloğundan sunulan uygulama.',
    iconUrl: entry.iconUrl,
    screenshots: Array.isArray(entry.screenshots)
      ? entry.screenshots.filter((url): url is string => typeof url === 'string')
      : [],
    websiteUrl: entry.websiteUrl || entry.downloadUrl || 'https://anticvalley.com.tr',
    featured: Boolean(entry.featured),
    new: Boolean(entry.new),
    downloadable: directDownloadable,
    comingSoon: Boolean(entry.comingSoon ?? !directDownloadable),
    announcedAt: entry.announcedAt || undefined,
    releaseDate: entry.releaseDate || entry.publishedAt || undefined,
    upcomingUpdateDate: entry.upcomingUpdateDate || undefined,
    requirements: entry.requirements,
    permissions: directPermissions.length > 0 ? directPermissions : undefined,
    requirementsInferred: !entry.requirements,
    permissionsInferred: directPermissions.length === 0,
    tags: entry.tags || ['Doğrudan Paket'],
    latestVersion: version,
    latestRelease: release,
    releases: release ? [release] : [],
    sourceId: 'official-anticstore',
    sourceLabel,
    syncedAt: new Date().toISOString(),
  };
}

async function fetchOfficialManifestDesktop(): Promise<RemoteCatalogManifest> {
  const desktop = window.anticStoreDesktop!;
  const ts = Date.now();
  const candidates = [
    `https://raw.githubusercontent.com/${OFFICIAL_STORE_REPO}/main/catalog.json?t=${ts}`,
    `https://raw.githubusercontent.com/${OFFICIAL_STORE_REPO}/master/catalog.json?t=${ts}`,
  ];

  for (const url of candidates) {
    try {
      const data = await desktop.fetchJson<RemoteCatalogManifest>(url);
      if (data && Array.isArray(data.apps)) {
        return data;
      }
    } catch {
      // Try next candidate
    }
  }

  return bundledCatalog as unknown as RemoteCatalogManifest;
}

export async function syncOfficialCatalog(forceRefresh = false): Promise<{
  apps: StoreApp[];
  source: CatalogSource;
  catalogDefs: CatalogDefinition[];
}> {
  const manifest = window.anticStoreDesktop
    ? await fetchOfficialManifestDesktop()
    : await fetchJsonSmart<RemoteCatalogManifest>(
        forceRefresh ? '/api/catalog/official?refresh=1' : '/api/catalog/official'
      );

  if (!manifest || !Array.isArray(manifest.apps)) {
    throw new Error('Resmi katalog JSON formatı geçersiz.');
  }

  const sourceLabel = manifest.storeName || `GitHub (${OFFICIAL_STORE_REPO})`;
  const catalogDefsMap = parseManifestCatalogDefs(manifest.catalogs);

  const apps = await Promise.all(
    manifest.apps.map(async (entry) => {
      try {
        if (entry.githubRepo) {
          const slug = normalizeGitHubRepoInput(entry.githubRepo);
          if (slug) {
            const bundle = await fetchGitHubBundle(slug);
            return mapBundleToStoreApp(bundle, sourceLabel, entry, catalogDefsMap);
          }
        }
        return mapDirectEntryToStoreApp(entry, sourceLabel, catalogDefsMap);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Senkronizasyon hatası';
        const fallback = mapDirectEntryToStoreApp(entry, sourceLabel, catalogDefsMap);
        return {
          ...fallback,
          syncError: msg,
        };
      }
    })
  );

  return {
    apps,
    catalogDefs: Array.from(catalogDefsMap.values()),
    source: {
      id: 'official-anticstore',
      type: 'catalog-url',
      label: sourceLabel,
      value: OFFICIAL_STORE_REPO,
      enabled: true,
      builtIn: true,
      lastSyncedAt: new Date().toISOString(),
      appCount: apps.length,
    },
  };
}

function normalizeSignalsManifest(raw: Partial<SignalsManifest>): SignalsManifest {
  const signals: SignalEntry[] = Array.isArray(raw.signals)
    ? raw.signals
        .filter((item): item is SignalEntry => Boolean(item && typeof item.title === 'string'))
        .map((item, idx) => ({
          id: String(item.id || item.code || `signal-${idx + 1}`),
          code: typeof item.code === 'string' ? item.code : undefined,
          badge: typeof item.badge === 'string' ? item.badge : undefined,
          title: item.title,
          summary: typeof item.summary === 'string' ? item.summary : '',
          category: typeof item.category === 'string' ? item.category : undefined,
          publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : undefined,
          url: typeof item.url === 'string' ? item.url : undefined,
          appId: typeof item.appId === 'string' ? item.appId : undefined,
        }))
    : [];

  return {
    schemaVersion: raw.schemaVersion ?? 1,
    headerLabel: raw.headerLabel || 'ANTIC VALLEY / SİNYAL',
    eyebrow: raw.eyebrow || 'GÜNCEL YAYIN',
    title: raw.title || 'Not defteri',
    footerNote: raw.footerNote || 'YENİ NOTLAR BURADA YAYINLANIR',
    updatedAt: raw.updatedAt,
    signals,
  };
}

async function fetchOfficialSignalsDesktop(): Promise<SignalsManifest> {
  const desktop = window.anticStoreDesktop!;
  const ts = Date.now();
  const signalCandidates = [
    `https://raw.githubusercontent.com/${OFFICIAL_STORE_REPO}/main/signals.json?t=${ts}`,
    `https://raw.githubusercontent.com/${OFFICIAL_STORE_REPO}/master/signals.json?t=${ts}`,
  ];

  for (const url of signalCandidates) {
    try {
      const data = await desktop.fetchJson<SignalsManifest>(url);
      if (data && Array.isArray(data.signals)) {
        return normalizeSignalsManifest(data);
      }
    } catch {
      // Try next candidate
    }
  }

  const catalogCandidates = [
    `https://raw.githubusercontent.com/${OFFICIAL_STORE_REPO}/main/catalog.json?t=${ts}`,
    `https://raw.githubusercontent.com/${OFFICIAL_STORE_REPO}/master/catalog.json?t=${ts}`,
  ];

  for (const url of catalogCandidates) {
    try {
      const data = await desktop.fetchJson<RemoteCatalogManifest>(url);
      if (data && Array.isArray(data.signals) && data.signals.length > 0) {
        return normalizeSignalsManifest({ signals: data.signals, updatedAt: data.updatedAt });
      }
    } catch {
      // Try next candidate
    }
  }

  return normalizeSignalsManifest(bundledSignals as SignalsManifest);
}

export async function syncOfficialSignals(forceRefresh = false): Promise<SignalsManifest> {
  if (window.anticStoreDesktop) {
    return fetchOfficialSignalsDesktop();
  }
  const raw = await fetchJsonSmart<SignalsManifest>(
    forceRefresh ? '/api/signals/official?refresh=1' : '/api/signals/official'
  );
  return normalizeSignalsManifest(raw);
}
