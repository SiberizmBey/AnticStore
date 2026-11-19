import { useEffect, useState } from 'react';

const MEDIA_CACHE_NAME = 'koru-media-v2';
const META_STORAGE_KEY = 'koru_media_meta_v2';
const INLINE_STORAGE_KEY = 'koru_media_inline_v2';
const LEGACY_CACHE_NAMES = ['koru-media-v1'];
const LEGACY_STORAGE_KEYS = ['koru_media_meta_v1', 'koru_media_inline_v1'];
const REVALIDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_META_ENTRIES = 300;
const MAX_INLINE_BYTES = 120 * 1024; // 120 KB (icons load synchronously in 0ms)
const MAX_INLINE_ENTRIES = 40;

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

function getCacheKey(rawUrl: string, maxDimension?: number): string {
  return maxDimension && maxDimension > 0 ? `thumb:${maxDimension}:${rawUrl}` : rawUrl;
}

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

// Synchronously hydrate cached icons into memory & clear stale v1 cache/cookies once
(function initializeMediaCacheSync() {
  if (typeof window === 'undefined') return;
  try {
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Ignore storage cleanup errors
  }

  if ('caches' in window) {
    for (const legacyCache of LEGACY_CACHE_NAMES) {
      void window.caches.delete(legacyCache).catch(() => {});
    }
  }

  const store = loadInlineStore();
  for (const [key, entry] of Object.entries(store)) {
    if (
      entry &&
      typeof entry.dataUrl === 'string' &&
      entry.dataUrl.startsWith('data:image/')
    ) {
      memoryMediaUrls.set(key, entry.dataUrl);
    }
  }
})();

function saveMetaEntry(cacheKey: string, meta: MediaMeta): void {
  const store = loadMetaStore();
  store[cacheKey] = meta;

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

function saveInlineEntry(cacheKey: string, dataUrl: string): void {
  if (!dataUrl.startsWith('data:image/')) return;
  const store = loadInlineStore();
  store[cacheKey] = { dataUrl, savedAt: Date.now() };

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

function sniffMimeFromBytes(bytes: Uint8Array, rawUrl: string, declaredType: string): string | null {
  if (bytes.byteLength === 0) return null;

  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.byteLength >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  ) {
    return 'image/x-icon';
  }

  const headText = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart().toLowerCase();
  if (headText.startsWith('<!doctype') || headText.startsWith('<html') || headText.startsWith('{')) {
    return null;
  }
  if (headText.startsWith('<svg') || (headText.startsWith('<?xml') && headText.includes('<svg'))) {
    return 'image/svg+xml';
  }

  const cleanDeclared = declaredType.split(';')[0].trim().toLowerCase();
  if (cleanDeclared.startsWith('image/')) {
    return cleanDeclared;
  }

  const lowerUrl = rawUrl.split('?')[0].toLowerCase();
  if (lowerUrl.endsWith('.png')) return 'image/png';
  if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerUrl.endsWith('.webp')) return 'image/webp';
  if (lowerUrl.endsWith('.gif')) return 'image/gif';
  if (lowerUrl.endsWith('.svg')) return 'image/svg+xml';
  if (lowerUrl.endsWith('.ico')) return 'image/x-icon';

  return cleanDeclared.includes('octet-stream') || cleanDeclared === '' ? 'image/png' : null;
}

async function normalizeImageBlob(blob: Blob, rawUrl: string): Promise<Blob> {
  if (!blob || blob.size === 0) {
    throw new Error('Boş medya yanıtı');
  }
  const headSlice = new Uint8Array(await blob.slice(0, 256).arrayBuffer());
  const detectedMime = sniffMimeFromBytes(headSlice, rawUrl, blob.type || '');
  if (!detectedMime) {
    throw new Error('Geçersiz veya HTML medya içeriği');
  }
  if (blob.type === detectedMime) {
    return blob;
  }
  return new Blob([blob], { type: detectedMime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        resolve(reader.result);
      } else {
        reject(new Error('DataURL conversion failed'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

async function downscaleIconBlob(blob: Blob, maxDimension: number): Promise<Blob | null> {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof createImageBitmap !== 'function' ||
    blob.type === 'image/svg+xml'
  ) {
    return null;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    if (maxSide <= 0) return null;
    if (maxSide <= maxDimension && blob.size <= MAX_INLINE_BYTES) {
      return blob;
    }

    const scale = Math.min(1, maxDimension / maxSide);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const encoded = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((out) => resolve(out), 'image/webp', 0.92);
    });
    if (encoded && encoded.size > 0) return encoded;

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((out) => resolve(out), 'image/png');
    });
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

async function toFastDisplayUrl(
  rawUrl: string,
  rawBlob: Blob,
  maxDimension?: number
): Promise<string> {
  const normalized = await normalizeImageBlob(rawBlob, rawUrl);
  const cacheKey = getCacheKey(rawUrl, maxDimension);

  let workingBlob = normalized;
  if (maxDimension && maxDimension > 0) {
    const shrunk = await downscaleIconBlob(normalized, maxDimension);
    if (shrunk && shrunk.size > 0) {
      workingBlob = shrunk;
    }
  }

  if (workingBlob.size > 0 && workingBlob.size <= MAX_INLINE_BYTES) {
    try {
      const dataUrl = await blobToDataUrl(workingBlob);
      saveInlineEntry(cacheKey, dataUrl);
      return dataUrl;
    } catch {
      // Fallback to object URL
    }
  }

  return URL.createObjectURL(workingBlob);
}

function isCacheableRemoteUrl(url?: string): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

export function getDirectMediaDisplayUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  if (!isCacheableRemoteUrl(rawUrl)) return rawUrl;
  if (typeof window !== 'undefined' && window.anticStoreDesktop) {
    return rawUrl;
  }
  return `/api/media?url=${encodeURIComponent(rawUrl)}`;
}

function buildFetchUrl(rawUrl: string, forceRevalidate = false): string {
  if (typeof window !== 'undefined' && window.anticStoreDesktop) {
    return rawUrl;
  }
  return `/api/media?url=${encodeURIComponent(rawUrl)}${forceRevalidate ? '&revalidate=1' : ''}`;
}

function notifySubscribers(cacheKey: string, resolvedUrl: string): void {
  const subs = listeners.get(cacheKey);
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

export async function evictCachedMedia(rawUrl: string, maxDimension?: number): Promise<void> {
  const keysToClear = [rawUrl, getCacheKey(rawUrl, maxDimension)];
  for (const key of keysToClear) {
    const prev = memoryMediaUrls.get(key);
    if (prev && prev.startsWith('blob:')) {
      URL.revokeObjectURL(prev);
    }
    memoryMediaUrls.delete(key);

    if (metaStoreCache) delete metaStoreCache[key];
    if (inlineStoreCache) delete inlineStoreCache[key];
  }

  try {
    if (metaStoreCache) localStorage.setItem(META_STORAGE_KEY, JSON.stringify(metaStoreCache));
    if (inlineStoreCache) localStorage.setItem(INLINE_STORAGE_KEY, JSON.stringify(inlineStoreCache));
  } catch {
    // Ignore storage errors
  }

  const cache = await openMediaCache();
  if (cache) {
    await cache.delete(rawUrl).catch(() => {});
  }
}

async function fetchAndCache(
  rawUrl: string,
  cache: Cache | null,
  forceRevalidate = false,
  hasCachedBody = false,
  maxDimension?: number
): Promise<string> {
  const cacheKey = getCacheKey(rawUrl, maxDimension);
  const isDesktop = typeof window !== 'undefined' && Boolean(window.anticStoreDesktop);
  const metaStore = loadMetaStore();
  const prevMeta = metaStore[cacheKey] || metaStore[rawUrl];
  const headers: Record<string, string> = {};

  // Avoid cross-origin CORS preflight issues when Electron fetches directly from GitHub
  if (!isDesktop && hasCachedBody && !forceRevalidate) {
    if (prevMeta?.etag) {
      headers['If-None-Match'] = prevMeta.etag;
    } else if (prevMeta?.lastModified) {
      headers['If-Modified-Since'] = prevMeta.lastModified;
    }
  }

  let response = await fetch(buildFetchUrl(rawUrl, forceRevalidate), {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    cache: forceRevalidate ? 'no-store' : 'default',
  });

  if (response.status === 304) {
    saveMetaEntry(cacheKey, {
      etag: prevMeta?.etag,
      lastModified: prevMeta?.lastModified,
      checkedAt: Date.now(),
    });

    const existing = memoryMediaUrls.get(cacheKey);
    if (existing) return existing;

    if (cache) {
      const cachedRes = await cache.match(rawUrl);
      if (cachedRes) {
        try {
          const blob = await cachedRes.blob();
          const fastUrl = await toFastDisplayUrl(rawUrl, blob, maxDimension);
          memoryMediaUrls.set(cacheKey, fastUrl);
          return fastUrl;
        } catch {
          await cache.delete(rawUrl).catch(() => {});
        }
      }
    }

    // Stale 304 without body — fetch fresh bypassing caches
    response = await fetch(buildFetchUrl(rawUrl, true), { cache: 'no-store' });
  }

  if (!response.ok) {
    throw new Error(`Medya alınamadı (${response.status})`);
  }

  const etag = response.headers.get('etag') || undefined;
  const lastModified = response.headers.get('last-modified') || undefined;
  const rawBlob = await response.blob();
  const normalizedBlob = await normalizeImageBlob(rawBlob, rawUrl);

  if (cache) {
    await cache
      .put(
        rawUrl,
        new Response(normalizedBlob, {
          status: 200,
          headers: { 'Content-Type': normalizedBlob.type },
        })
      )
      .catch(() => {});
  }

  saveMetaEntry(cacheKey, {
    etag,
    lastModified,
    checkedAt: Date.now(),
  });

  const previousUrl = memoryMediaUrls.get(cacheKey);
  const newUrl = await toFastDisplayUrl(rawUrl, normalizedBlob, maxDimension);
  memoryMediaUrls.set(cacheKey, newUrl);

  if (previousUrl && previousUrl !== newUrl) {
    if (previousUrl.startsWith('blob:')) {
      window.setTimeout(() => URL.revokeObjectURL(previousUrl), 5000);
    }
    notifySubscribers(cacheKey, newUrl);
  }

  return newUrl;
}

export function getMemoryCachedMediaUrl(url?: string, maxDimension?: number): string | undefined {
  if (!url) return undefined;
  if (!isCacheableRemoteUrl(url)) return url;
  return memoryMediaUrls.get(getCacheKey(url, maxDimension)) || memoryMediaUrls.get(url);
}

export async function resolveCachedMedia(
  url: string,
  options?: { forceRevalidate?: boolean; maxDimension?: number }
): Promise<string> {
  if (!isCacheableRemoteUrl(url)) {
    return url;
  }

  const forceRevalidate = Boolean(options?.forceRevalidate);
  const maxDimension = options?.maxDimension;
  const cacheKey = getCacheKey(url, maxDimension);
  const memUrl = memoryMediaUrls.get(cacheKey);
  const meta = loadMetaStore()[cacheKey];
  const isFresh = Boolean(meta && Date.now() - meta.checkedAt < REVALIDATE_INTERVAL_MS);

  if (memUrl && isFresh && !forceRevalidate) {
    return memUrl;
  }

  if (memUrl && !isFresh && !forceRevalidate) {
    void (async () => {
      const cache = await openMediaCache();
      await fetchAndCache(url, cache, false, true, maxDimension).catch(() => {});
    })();
    return memUrl;
  }

  if (!forceRevalidate) {
    const existingTask = inFlightResolutions.get(cacheKey);
    if (existingTask) return existingTask;
  }

  const task = (async () => {
    const cache = await openMediaCache();

    if (cache && !forceRevalidate) {
      const cachedResponse = await cache.match(url);
      if (cachedResponse) {
        try {
          let fastUrl = memoryMediaUrls.get(cacheKey);
          if (!fastUrl) {
            const blob = await cachedResponse.blob();
            fastUrl = await toFastDisplayUrl(url, blob, maxDimension);
            memoryMediaUrls.set(cacheKey, fastUrl);
          }

          if (!isFresh) {
            void fetchAndCache(url, cache, false, true, maxDimension).catch(() => {});
          }

          return fastUrl;
        } catch {
          await cache.delete(url).catch(() => {});
        }
      }
    }

    return fetchAndCache(url, cache, forceRevalidate, false, maxDimension);
  })().finally(() => {
    inFlightResolutions.delete(cacheKey);
  });

  inFlightResolutions.set(cacheKey, task);
  return task;
}

export async function preloadMediaUrls(
  urls: Array<string | undefined>,
  forceRevalidate = false,
  options?: { maxDimension?: number }
): Promise<void> {
  const unique = Array.from(
    new Set(urls.filter((u): u is string => isCacheableRemoteUrl(u)))
  );
  await Promise.allSettled(
    unique.map((url) =>
      resolveCachedMedia(url, {
        forceRevalidate,
        maxDimension: options?.maxDimension,
      })
    )
  );
}

export function useCachedMedia(
  url?: string,
  revalidateSignal = 0,
  options?: { maxDimension?: number; immediateFallback?: boolean }
): {
  src: string | undefined;
  failed: boolean;
  markFailed: () => void;
} {
  const maxDimension = options?.maxDimension;
  const cacheKey = url ? getCacheKey(url, maxDimension) : undefined;
  const syncCached = getMemoryCachedMediaUrl(url, maxDimension);
  const directFallback = getDirectMediaDisplayUrl(url);

  const [asyncResult, setAsyncResult] = useState<{ key?: string; src?: string }>({
    key: cacheKey,
    src: syncCached,
  });
  const [errorState, setErrorState] = useState<{ key?: string; stage: 'direct' | 'failed' } | null>(
    null
  );

  useEffect(() => {
    if (!url || !cacheKey || !isCacheableRemoteUrl(url)) {
      return;
    }

    let cancelled = false;

    const subscriber = (updatedUrl: string) => {
      if (!cancelled) {
        setAsyncResult({ key: cacheKey, src: updatedUrl });
        setErrorState((prev) => (prev?.key === cacheKey ? null : prev));
      }
    };

    let set = listeners.get(cacheKey);
    if (!set) {
      set = new Set();
      listeners.set(cacheKey, set);
    }
    set.add(subscriber);

    resolveCachedMedia(url, { forceRevalidate: revalidateSignal > 0, maxDimension })
      .then((resolved) => {
        if (!cancelled) {
          setAsyncResult({ key: cacheKey, src: resolved });
          setErrorState((prev) => (prev?.key === cacheKey ? null : prev));
        }
      })
      .catch(() => {
        if (!cancelled && !memoryMediaUrls.has(cacheKey) && directFallback) {
          setAsyncResult({ key: cacheKey, src: directFallback });
        }
      });

    return () => {
      cancelled = true;
      listeners.get(cacheKey)?.delete(subscriber);
    };
  }, [url, cacheKey, revalidateSignal, maxDimension, directFallback]);

  const matchedError =
    errorState && cacheKey && errorState.key === cacheKey ? errorState.stage : null;
  const resolvedSrc =
    matchedError === 'direct'
      ? directFallback
      : syncCached ||
        (asyncResult.key === cacheKey ? asyncResult.src : undefined) ||
        (options?.immediateFallback ? directFallback : undefined);

  const markFailed = () => {
    if (!url || !cacheKey) return;
    if (matchedError !== 'direct' && directFallback && resolvedSrc !== directFallback) {
      void evictCachedMedia(url, maxDimension);
      setErrorState({ key: cacheKey, stage: 'direct' });
    } else {
      setErrorState({ key: cacheKey, stage: 'failed' });
    }
  };

  return {
    src: resolvedSrc,
    failed: Boolean(url && matchedError === 'failed'),
    markFailed,
  };
}
