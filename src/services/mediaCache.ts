import { useEffect, useState } from 'react';

const MEDIA_CACHE_NAME = 'koru-media-v1';
const META_STORAGE_KEY = 'koru_media_meta_v1';
const INLINE_STORAGE_KEY = 'koru_media_inline_v1';
const REVALIDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_META_ENTRIES = 300;
const MAX_INLINE_BYTES = 120 * 1024; // 120 KB (icons load synchronously in 0ms)
const MAX_INLINE_ENTRIES = 30;

interface MediaMeta {
  etag?: string;
  lastModified?: string;
  checkedAt: number;
}

const memoryMediaUrls = new Map<string, string>();
const inFlightResolutions = new Map<string, Promise<string>>();
const listeners = new Map<string, Set<(resolvedUrl: string) => void>>();

let metaStoreCache: Record<string, MediaMeta> | null = null;
let inlineStoreCache: Record<string, { dataUrl: string; savedAt: number }> | null = null;

function loadMetaStore(): Record<string, MediaMeta> {
  if (metaStoreCache) return metaStoreCache;
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) {
      metaStoreCache = {};
      return metaStoreCache;
    }
    const parsed = JSON.parse(raw);
    metaStoreCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    metaStoreCache = {};
  }
  return metaStoreCache!;
}

function loadInlineStore(): Record<string, { dataUrl: string; savedAt: number }> {
  if (inlineStoreCache) return inlineStoreCache;
  try {
    const raw = localStorage.getItem(INLINE_STORAGE_KEY);
    if (!raw) {
      inlineStoreCache = {};
      return inlineStoreCache;
    }
    const parsed = JSON.parse(raw);
    inlineStoreCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    inlineStoreCache = {};
  }
  return inlineStoreCache!;
}

// Synchronously hydrate small icons into memory before React mounts (0ms render, zero flash)
(function hydrateInlineCacheSync() {
  if (typeof window === 'undefined') return;
  const store = loadInlineStore();
  for (const [url, entry] of Object.entries(store)) {
    if (entry && typeof entry.dataUrl === 'string' && entry.dataUrl.startsWith('data:')) {
      memoryMediaUrls.set(url, entry.dataUrl);
    }
  }
})();

function saveMetaEntry(url: string, meta: MediaMeta): void {
  const store = loadMetaStore();
  store[url] = meta;

  const keys = Object.keys(store);
  if (keys.length > MAX_META_ENTRIES) {
    keys
      .sort((a, b) => (store[a]?.checkedAt || 0) - (store[b]?.checkedAt || 0))
      .slice(0, keys.length - MAX_META_ENTRIES)
      .forEach((k) => {
        delete store[k];
      });
  }

  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors
  }
}

function saveInlineEntry(url: string, dataUrl: string): void {
  const store = loadInlineStore();
  store[url] = { dataUrl, savedAt: Date.now() };

  const keys = Object.keys(store);
  if (keys.length > MAX_INLINE_ENTRIES) {
    keys
      .sort((a, b) => (store[a]?.savedAt || 0) - (store[b]?.savedAt || 0))
      .slice(0, keys.length - MAX_INLINE_ENTRIES)
      .forEach((k) => {
        delete store[k];
      });
  }

  try {
    localStorage.setItem(INLINE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full — Cache API still holds the full asset
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('DataURL conversion failed'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

async function toFastDisplayUrl(rawUrl: string, blob: Blob): Promise<string> {
  if (blob.size > 0 && blob.size <= MAX_INLINE_BYTES) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      saveInlineEntry(rawUrl, dataUrl);
      return dataUrl;
    } catch {
      // Fallback to object URL
    }
  }
  return URL.createObjectURL(blob);
}

function isCacheableRemoteUrl(url?: string): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

function buildFetchUrl(rawUrl: string, forceRevalidate = false): string {
  if (window.anticStoreDesktop) {
    return rawUrl;
  }
  return `/api/media?url=${encodeURIComponent(rawUrl)}${forceRevalidate ? '&revalidate=1' : ''}`;
}

function notifySubscribers(url: string, resolvedUrl: string): void {
  const subs = listeners.get(url);
  if (!subs) return;
  for (const cb of subs) {
    cb(resolvedUrl);
  }
}

async function openMediaCache(): Promise<Cache | null> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return null;
  }
  try {
    return await window.caches.open(MEDIA_CACHE_NAME);
  } catch {
    return null;
  }
}

async function fetchAndCache(
  rawUrl: string,
  cache: Cache | null,
  forceRevalidate = false,
  hasCachedBody = false
): Promise<string> {
  const metaStore = loadMetaStore();
  const prevMeta = metaStore[rawUrl];
  const headers: Record<string, string> = {};

  if (hasCachedBody) {
    if (prevMeta?.etag) {
      headers['If-None-Match'] = prevMeta.etag;
    } else if (prevMeta?.lastModified) {
      headers['If-Modified-Since'] = prevMeta.lastModified;
    }
  }

  const response = await fetch(buildFetchUrl(rawUrl, forceRevalidate), { headers });

  if (response.status === 304) {
    saveMetaEntry(rawUrl, {
      etag: prevMeta?.etag,
      lastModified: prevMeta?.lastModified,
      checkedAt: Date.now(),
    });
    const existing = memoryMediaUrls.get(rawUrl);
    if (existing) return existing;

    if (cache) {
      const cachedRes = await cache.match(rawUrl);
      if (cachedRes) {
        const blob = await cachedRes.blob();
        const fastUrl = await toFastDisplayUrl(rawUrl, blob);
        memoryMediaUrls.set(rawUrl, fastUrl);
        return fastUrl;
      }
    }

    const freshRes = await fetch(buildFetchUrl(rawUrl, true));
    if (!freshRes.ok) throw new Error(`Medya alınamadı (${freshRes.status})`);
    const freshClone = freshRes.clone();
    const blob = await freshRes.blob();
    if (cache) await cache.put(rawUrl, freshClone).catch(() => {});
    saveMetaEntry(rawUrl, {
      etag: freshRes.headers.get('etag') || undefined,
      lastModified: freshRes.headers.get('last-modified') || undefined,
      checkedAt: Date.now(),
    });
    const fastUrl = await toFastDisplayUrl(rawUrl, blob);
    memoryMediaUrls.set(rawUrl, fastUrl);
    return fastUrl;
  }

  if (!response.ok) {
    throw new Error(`Medya alınamadı (${response.status})`);
  }

  const etag = response.headers.get('etag') || undefined;
  const lastModified = response.headers.get('last-modified') || undefined;
  const responseClone = response.clone();
  const blob = await response.blob();

  if (cache) {
    await cache.put(rawUrl, responseClone).catch(() => {});
  }

  saveMetaEntry(rawUrl, {
    etag,
    lastModified,
    checkedAt: Date.now(),
  });

  const previousUrl = memoryMediaUrls.get(rawUrl);
  const newUrl = await toFastDisplayUrl(rawUrl, blob);
  memoryMediaUrls.set(rawUrl, newUrl);

  if (previousUrl && previousUrl !== newUrl) {
    if (previousUrl.startsWith('blob:')) {
      window.setTimeout(() => URL.revokeObjectURL(previousUrl), 5000);
    }
    notifySubscribers(rawUrl, newUrl);
  }

  return newUrl;
}

export function getMemoryCachedMediaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (!isCacheableRemoteUrl(url)) return url;
  return memoryMediaUrls.get(url);
}

export async function resolveCachedMedia(
  url: string,
  options?: { forceRevalidate?: boolean }
): Promise<string> {
  if (!isCacheableRemoteUrl(url)) {
    return url;
  }

  const forceRevalidate = Boolean(options?.forceRevalidate);
  const memUrl = memoryMediaUrls.get(url);
  const meta = loadMetaStore()[url];
  const isFresh = Boolean(meta && Date.now() - meta.checkedAt < REVALIDATE_INTERVAL_MS);

  if (memUrl && isFresh && !forceRevalidate) {
    return memUrl;
  }

  if (memUrl && !isFresh && !forceRevalidate) {
    // Return synchronously-hydrated cached icon immediately, revalidate in background
    void (async () => {
      const cache = await openMediaCache();
      await fetchAndCache(url, cache, false, true).catch(() => {});
    })();
    return memUrl;
  }

  if (!forceRevalidate) {
    const existingTask = inFlightResolutions.get(url);
    if (existingTask) return existingTask;
  }

  const task = (async () => {
    const cache = await openMediaCache();

    // Fast path: serve from persistent browser Cache API immediately
    if (cache) {
      const cachedResponse = await cache.match(url);
      if (cachedResponse) {
        let fastUrl = memoryMediaUrls.get(url);
        if (!fastUrl) {
          const blob = await cachedResponse.blob();
          fastUrl = await toFastDisplayUrl(url, blob);
          memoryMediaUrls.set(url, fastUrl);
        }

        if (!isFresh || forceRevalidate) {
          void fetchAndCache(url, cache, forceRevalidate, true).catch(() => {});
        }

        return fastUrl;
      }
    }

    // Cache miss: fetch once and persist
    return fetchAndCache(url, cache, forceRevalidate, false);
  })().finally(() => {
    inFlightResolutions.delete(url);
  });

  inFlightResolutions.set(url, task);
  return task;
}

export async function preloadMediaUrls(
  urls: Array<string | undefined>,
  forceRevalidate = false
): Promise<void> {
  const unique = Array.from(
    new Set(urls.filter((u): u is string => isCacheableRemoteUrl(u)))
  );
  await Promise.allSettled(
    unique.map((url) => resolveCachedMedia(url, { forceRevalidate }))
  );
}

export function useCachedMedia(
  url?: string,
  revalidateSignal = 0
): {
  src: string | undefined;
  failed: boolean;
  markFailed: () => void;
} {
  const syncCached = getMemoryCachedMediaUrl(url);
  const [asyncResult, setAsyncResult] = useState<{ url?: string; src?: string }>({
    url,
    src: syncCached,
  });
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url || !isCacheableRemoteUrl(url)) {
      return;
    }

    let cancelled = false;

    const subscriber = (updatedUrl: string) => {
      if (!cancelled) {
        setAsyncResult({ url, src: updatedUrl });
        setFailedUrl((prev) => (prev === url ? null : prev));
      }
    };

    let set = listeners.get(url);
    if (!set) {
      set = new Set();
      listeners.set(url, set);
    }
    set.add(subscriber);

    resolveCachedMedia(url, { forceRevalidate: revalidateSignal > 0 })
      .then((resolved) => {
        if (!cancelled) {
          setAsyncResult({ url, src: resolved });
        }
      })
      .catch(() => {
        if (!cancelled && !memoryMediaUrls.has(url)) {
          setAsyncResult({ url, src: url });
        }
      });

    return () => {
      cancelled = true;
      listeners.get(url)?.delete(subscriber);
    };
  }, [url, revalidateSignal]);

  const resolvedSrc =
    syncCached || (asyncResult.url === url ? asyncResult.src : undefined);

  return {
    src: resolvedSrc,
    failed: Boolean(url && failedUrl === url),
    markFailed: () => {
      if (url) setFailedUrl(url);
    },
  };
}
