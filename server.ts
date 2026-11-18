import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

interface CacheEntry {
  expiresAt: number;
  data: unknown;
}

const apiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

interface MediaCacheEntry {
  buffer: Buffer;
  contentType: string;
  etag?: string;
  lastModified?: string;
  checkedAt: number;
}

const mediaCache = new Map<string, MediaCacheEntry>();
const MEDIA_REVALIDATE_MS = 5 * 60_000;
const MAX_MEDIA_CACHE_ENTRIES = 120;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

function setMediaCached(url: string, entry: MediaCacheEntry): void {
  if (mediaCache.has(url)) {
    mediaCache.delete(url);
  } else if (mediaCache.size >= MAX_MEDIA_CACHE_ENTRIES) {
    const oldestKey = mediaCache.keys().next().value;
    if (oldestKey) mediaCache.delete(oldestKey);
  }
  mediaCache.set(url, entry);
}

function getCached(key: string): unknown | null {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: unknown, ttlMs = CACHE_TTL_MS): void {
  apiCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    data,
  });
}

function isSafeHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Koru/1.0 (com.anticvalley.koru)',
    Accept: 'application/vnd.github+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchGitHubJson(url: string): Promise<unknown> {
  const cached = getCached(`gh:${url}`);
  if (cached) return cached;

  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub API ${response.status}: ${text.slice(0, 180) || response.statusText}`);
  }
  const data = await response.json();
  setCached(`gh:${url}`, data);
  return data;
}

async function resolveGitHubIconUrl(owner: string, repo: string, branch: string): Promise<string | null> {
  const cacheKey = `icon:${owner}/${repo}:${branch}`;
  const cached = getCached(cacheKey);
  if (typeof cached === 'string') return cached;

  const candidates = [
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/public/assets/img/icon.png`,
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/public/icon.png`,
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/assets/img/icon.png`,
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/assets/icon.png`,
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/icon.png`,
  ];

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { method: 'HEAD', headers: { 'User-Agent': 'Koru/1.0' } });
      if (res.ok) {
        setCached(cacheKey, candidate, 5 * 60_000);
        return candidate;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

async function buildGitHubRepoBundle(owner: string, repo: string) {
  const [repoInfo, releases] = await Promise.all([
    fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}`) as Promise<Record<string, unknown>>,
    fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=15`) as Promise<
      Array<Record<string, unknown>>
    >,
  ]);

  const defaultBranch = typeof repoInfo.default_branch === 'string' ? repoInfo.default_branch : 'main';

  let packageJson: Record<string, unknown> | null = null;
  try {
    const pkgRes = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/package.json`,
      { headers: { 'User-Agent': 'Koru/1.0' } }
    );
    if (pkgRes.ok) {
      packageJson = (await pkgRes.json()) as Record<string, unknown>;
    }
  } catch {
    // package.json optional
  }

  let anticManifest: Record<string, unknown> | null = null;
  try {
    const manifestRes = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/anticstore.json`,
      { headers: { 'User-Agent': 'Koru/1.0' } }
    );
    if (manifestRes.ok) {
      anticManifest = (await manifestRes.json()) as Record<string, unknown>;
    }
  } catch {
    // anticstore.json optional
  }

  const iconUrl =
    (typeof anticManifest?.iconUrl === 'string' ? anticManifest.iconUrl : null) ||
    (await resolveGitHubIconUrl(owner, repo, defaultBranch)) ||
    (typeof (repoInfo.owner as Record<string, unknown> | undefined)?.avatar_url === 'string'
      ? ((repoInfo.owner as Record<string, unknown>).avatar_url as string)
      : null);

  return {
    repo: repoInfo,
    releases: Array.isArray(releases) ? releases : [],
    packageJson,
    anticManifest,
    iconUrl,
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'Koru', packageId: 'com.anticvalley.koru' });
  });

  app.get('/api/catalog/official', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const localPath = path.join(__dirname, 'catalog.json');
    if (fs.existsSync(localPath)) {
      try {
        const raw = fs.readFileSync(localPath, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && Array.isArray(parsed.apps)) {
          res.json({ ...parsed, _source: 'local-catalog' });
          return;
        }
      } catch {
        // Fall through to remote candidates if local JSON is invalid
      }
    }

    const cacheKey = 'official:SiberizmBey/AnticStore';
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const cached = forceRefresh ? null : getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const cacheBuster = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const remoteCandidates = [
      `https://raw.githubusercontent.com/SiberizmBey/AnticStore/main/catalog.json?t=${cacheBuster}`,
      `https://raw.githubusercontent.com/SiberizmBey/AnticStore/master/catalog.json?t=${cacheBuster}`,
    ];

    for (const candidate of remoteCandidates) {
      try {
        const upstream = await fetch(candidate, {
          cache: 'no-store',
          headers: {
            'User-Agent': 'Koru/1.0',
            Accept: 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });
        if (upstream.ok) {
          const data = (await upstream.json()) as Record<string, unknown>;
          if (data && Array.isArray(data.apps)) {
            const payload = { ...data, _source: candidate };
            setCached(cacheKey, payload, 15_000);
            res.json(payload);
            return;
          }
        }
      } catch {
        // Try next candidate
      }
    }

    res.status(404).json({ error: 'Resmi katalog bulunamadı.' });
  });

  app.get('/api/signals/official', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const cacheKey = 'signals:SiberizmBey/AnticStore';
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const cached = forceRefresh ? null : getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const cacheBuster = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const remoteSignalCandidates = [
      `https://raw.githubusercontent.com/SiberizmBey/AnticStore/main/signals.json?t=${cacheBuster}`,
      `https://raw.githubusercontent.com/SiberizmBey/AnticStore/master/signals.json?t=${cacheBuster}`,
    ];

    for (const candidate of remoteSignalCandidates) {
      try {
        const upstream = await fetch(candidate, {
          cache: 'no-store',
          headers: {
            'User-Agent': 'Koru/1.0',
            Accept: 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });
        if (upstream.ok) {
          const data = (await upstream.json()) as Record<string, unknown>;
          if (data && Array.isArray(data.signals)) {
            const payload = { ...data, _source: candidate };
            setCached(cacheKey, payload, 15_000);
            res.json(payload);
            return;
          }
        }
      } catch {
        // Try next candidate
      }
    }

    // Also check if remote catalog.json includes a signals array
    const remoteCatalogCandidates = [
      `https://raw.githubusercontent.com/SiberizmBey/AnticStore/main/catalog.json?t=${cacheBuster}`,
      `https://raw.githubusercontent.com/SiberizmBey/AnticStore/master/catalog.json?t=${cacheBuster}`,
    ];

    for (const candidate of remoteCatalogCandidates) {
      try {
        const upstream = await fetch(candidate, {
          headers: { 'User-Agent': 'Koru/1.0', Accept: 'application/json' },
        });
        if (upstream.ok) {
          const data = (await upstream.json()) as Record<string, unknown>;
          if (data && Array.isArray(data.signals) && data.signals.length > 0) {
            const payload = {
              schemaVersion: data.schemaVersion,
              updatedAt: data.updatedAt,
              signals: data.signals,
              _source: candidate,
            };
            setCached(cacheKey, payload, 15_000);
            res.json(payload);
            return;
          }
        }
      } catch {
        // Try next candidate
      }
    }

    // Dynamic local fallback from signals.json or catalog.json (no build required)
    const localSignalsPath = path.join(__dirname, 'signals.json');
    if (fs.existsSync(localSignalsPath)) {
      try {
        const raw = fs.readFileSync(localSignalsPath, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && Array.isArray(parsed.signals)) {
          res.json({ ...parsed, _source: 'local-signals' });
          return;
        }
      } catch {
        // Fall through to local catalog
      }
    }

    const localCatalogPath = path.join(__dirname, 'catalog.json');
    if (fs.existsSync(localCatalogPath)) {
      try {
        const raw = fs.readFileSync(localCatalogPath, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && Array.isArray(parsed.signals)) {
          res.json({ signals: parsed.signals, updatedAt: parsed.updatedAt, _source: 'local-catalog' });
          return;
        }
      } catch {
        // No signals found
      }
    }

    res.status(404).json({ error: 'Sinyal akışı bulunamadı.' });
  });

  app.get('/api/github/repo', async (req: Request, res: Response) => {
    const rawRepo = typeof req.query.repo === 'string' ? req.query.repo.trim() : '';
    const match = rawRepo.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
    if (!match) {
      res.status(400).json({ error: 'Geçersiz GitHub depo adı. Örnek: SiberizmBey/Lir' });
      return;
    }

    try {
      const bundle = await buildGitHubRepoBundle(match[1], match[2]);
      res.json(bundle);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'GitHub deposu alınamadı.';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/github/user-repos', async (req: Request, res: Response) => {
    const username = typeof req.query.user === 'string' ? req.query.user.trim() : '';
    if (!/^[A-Za-z0-9-]+$/.test(username)) {
      res.status(400).json({ error: 'Geçersiz GitHub kullanıcı adı.' });
      return;
    }

    try {
      const repos = (await fetchGitHubJson(
        `https://api.github.com/users/${username}/repos?sort=updated&per_page=30&type=owner`
      )) as Array<Record<string, unknown>>;

      const publicRepos = repos.filter((r) => !r.archived && !r.disabled && !r.fork);
      const bundles = await Promise.all(
        publicRepos.slice(0, 12).map(async (r) => {
          const fullName = String(r.full_name || '');
          const [owner, name] = fullName.split('/');
          if (!owner || !name) return null;
          try {
            const bundle = await buildGitHubRepoBundle(owner, name);
            return bundle.releases.length > 0 ? bundle : null;
          } catch {
            return null;
          }
        })
      );

      res.json({
        user: username,
        repos: bundles.filter(Boolean),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kullanıcı depoları alınamadı.';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/catalog/fetch', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!isSafeHttpsUrl(rawUrl)) {
      res.status(400).json({ error: 'Yalnızca herkese açık HTTPS katalog bağlantıları desteklenir.' });
      return;
    }

    try {
      const cached = getCached(`catalog:${rawUrl}`);
      if (cached) {
        res.json(cached);
        return;
      }

      const response = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'Koru/1.0',
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        res.status(502).json({ error: `Katalog sunucusu yanıt vermedi (${response.status}).` });
        return;
      }
      const data = await response.json();
      setCached(`catalog:${rawUrl}`, data, 30_000);
      res.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Uzak katalog JSON dosyası okunamadı.';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/media', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const forceRevalidate = req.query.revalidate === '1';
    if (!isSafeHttpsUrl(rawUrl)) {
      res.status(400).json({ error: 'Geçersiz medya adresi.' });
      return;
    }

    const clientEtag =
      typeof req.headers['if-none-match'] === 'string' ? req.headers['if-none-match'] : undefined;
    const clientLastModified =
      typeof req.headers['if-modified-since'] === 'string'
        ? req.headers['if-modified-since']
        : undefined;

    const sendMediaResponse = (entry: MediaCacheEntry) => {
      res.setHeader('Access-Control-Expose-Headers', 'ETag, Last-Modified');
      res.setHeader('Cache-Control', 'public, max-age=300');
      if (entry.etag) res.setHeader('ETag', entry.etag);
      if (entry.lastModified) res.setHeader('Last-Modified', entry.lastModified);

      const etagMatches = Boolean(clientEtag && entry.etag && clientEtag === entry.etag);
      const modifiedMatches = Boolean(
        !entry.etag &&
          clientLastModified &&
          entry.lastModified &&
          clientLastModified === entry.lastModified
      );

      if (etagMatches || modifiedMatches) {
        res.status(304).end();
        return;
      }

      res.setHeader('Content-Type', entry.contentType);
      res.setHeader('Content-Length', String(entry.buffer.byteLength));
      res.status(200).send(entry.buffer);
    };

    const existing = mediaCache.get(rawUrl);
    if (existing && !forceRevalidate && Date.now() - existing.checkedAt < MEDIA_REVALIDATE_MS) {
      sendMediaResponse(existing);
      return;
    }

    try {
      const upstreamHeaders: Record<string, string> = {
        'User-Agent': 'Koru/1.0',
      };
      if (existing?.etag) upstreamHeaders['If-None-Match'] = existing.etag;
      if (existing?.lastModified) upstreamHeaders['If-Modified-Since'] = existing.lastModified;

      const upstream = await fetch(rawUrl, {
        headers: upstreamHeaders,
        redirect: 'follow',
      });

      if (upstream.status === 304 && existing) {
        existing.checkedAt = Date.now();
        setMediaCached(rawUrl, existing);
        sendMediaResponse(existing);
        return;
      }

      if (!upstream.ok) {
        if (existing) {
          sendMediaResponse(existing);
          return;
        }
        res.status(502).json({ error: `Medya alınamadı (${upstream.status}).` });
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
        res.status(415).json({ error: 'Desteklenmeyen medya türü.' });
        return;
      }

      const arrayBuf = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const etag = upstream.headers.get('etag') || undefined;
      const lastModified = upstream.headers.get('last-modified') || undefined;

      const freshEntry: MediaCacheEntry = {
        buffer,
        contentType,
        etag,
        lastModified,
        checkedAt: Date.now(),
      };

      if (buffer.byteLength <= MAX_MEDIA_BYTES) {
        setMediaCached(rawUrl, freshEntry);
      }

      sendMediaResponse(freshEntry);
    } catch {
      if (existing) {
        sendMediaResponse(existing);
        return;
      }
      res.status(502).json({ error: 'Medya yüklenemedi.' });
    }
  });

  app.get('/api/download', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const rawName = typeof req.query.filename === 'string' ? req.query.filename.trim() : 'installer.exe';
    if (!isSafeHttpsUrl(rawUrl)) {
      res.status(400).json({ error: 'Geçersiz indirme adresi.' });
      return;
    }

    const safeFileName = rawName.replace(/[^A-Za-z0-9._-]/g, '_') || 'installer.bin';

    try {
      const upstream = await fetch(rawUrl, {
        headers: { 'User-Agent': 'Koru/1.0' },
        redirect: 'follow',
      });

      if (!upstream.ok || !upstream.body) {
        res.status(502).json({ error: `Dosya indirilemedi (${upstream.status}).` });
        return;
      }

      const contentLength = upstream.headers.get('content-length');
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const nodeStream = Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream);
      nodeStream.on('error', () => {
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.end();
        }
      });
      nodeStream.pipe(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'İndirme akışı başlatılamadı.';
      if (!res.headersSent) {
        res.status(502).json({ error: message });
      }
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Koru server listening on http://localhost:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start Koru server:', err);
  process.exit(1);
});
