import type {
  CatalogAppEntry,
  CatalogSource,
  RemoteCatalogManifest,
  StoreApp,
  StoreAsset,
  StoreRelease,
} from '../types';
import bundledCatalog from '../../catalog.json';
import { cleanVersion, detectAssetMeta } from '../utils/semver';

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
  const res = await fetch(url);
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

function inferCategory(name: string, summary: string, topics: string[]): string {
  const haystack = `${name} ${summary} ${topics.join(' ')}`.toLowerCase();
  if (/(ses|sound|audio|music|soundpad|lir)/.test(haystack)) return 'Ses & Medya';
  if (/(dev|code|git|cli|sdk|terminal|api)/.test(haystack)) return 'Geliştirici';
  if (/(erp|mes|plan|task|not|office|productivity)/.test(haystack)) return 'Üretkenlik';
  if (/(auth|2fa|vault|security|crypto|pass)/.test(haystack)) return 'Güvenlik';
  return 'Araçlar';
}

function mapBundleToStoreApp(
  bundle: GitHubRepoBundle,
  sourceLabel: string,
  override?: Partial<CatalogAppEntry>
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
        version: cleanVersion(tag),
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

  const iconUrl =
    override?.iconUrl ||
    manifest.iconUrl ||
    bundle.iconUrl ||
    repoInfo.owner?.avatar_url;
  const screenshots = override?.screenshots || manifest.screenshots;

  return {
    id: appId,
    name: appName,
    developer,
    developerAvatarUrl: repoInfo.owner?.avatar_url,
    category,
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

function mapDirectEntryToStoreApp(entry: CatalogAppEntry, sourceLabel: string): StoreApp {
  const version = cleanVersion(entry.version || '1.0.0');
  const fileName = entry.fileName || `${entry.name || entry.id}-${version}.exe`;
  const meta = detectAssetMeta(fileName);

  const release: StoreRelease | null = entry.downloadUrl
    ? {
        tag: `v${version}`,
        version,
        name: `v${version}`,
        notes: entry.releaseNotes || '',
        publishedAt: entry.publishedAt || new Date().toISOString(),
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

  return {
    id: entry.id,
    name: entry.name || entry.id,
    developer: entry.developer || 'Antic Valley',
    category: entry.category || 'Araçlar',
    summary: entry.summary || 'AnticStore uygulaması',
    description: entry.description || entry.summary || 'AnticStore kataloğundan sunulan uygulama.',
    iconUrl: entry.iconUrl,
    screenshots: Array.isArray(entry.screenshots)
      ? entry.screenshots.filter((url): url is string => typeof url === 'string')
      : [],
    websiteUrl: entry.websiteUrl || entry.downloadUrl || 'https://anticvalley.com.tr',
    featured: Boolean(entry.featured),
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

  return bundledCatalog as RemoteCatalogManifest;
}

export async function syncOfficialCatalog(): Promise<{
  apps: StoreApp[];
  source: CatalogSource;
}> {
  const manifest = window.anticStoreDesktop
    ? await fetchOfficialManifestDesktop()
    : await fetchJsonSmart<RemoteCatalogManifest>('/api/catalog/official');

  if (!manifest || !Array.isArray(manifest.apps)) {
    throw new Error('Resmi katalog JSON formatı geçersiz.');
  }

  const sourceLabel = manifest.storeName || `GitHub (${OFFICIAL_STORE_REPO})`;

  const apps = await Promise.all(
    manifest.apps.map(async (entry) => {
      try {
        if (entry.githubRepo) {
          const slug = normalizeGitHubRepoInput(entry.githubRepo);
          if (slug) {
            const bundle = await fetchGitHubBundle(slug);
            return mapBundleToStoreApp(bundle, sourceLabel, entry);
          }
        }
        return mapDirectEntryToStoreApp(entry, sourceLabel);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Senkronizasyon hatası';
        const fallback = mapDirectEntryToStoreApp(entry, sourceLabel);
        return {
          ...fallback,
          syncError: msg,
        };
      }
    })
  );

  return {
    apps,
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
