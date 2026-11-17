import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  getMemoryCachedMediaUrl,
  preloadMediaUrls,
  useCachedMedia,
} from '../services/mediaCache';

interface ScreenshotGalleryProps {
  appName: string;
  screenshots: string[];
  cacheKey?: string;
}

function CachedThumb({
  url,
  alt,
  className,
}: {
  url: string;
  alt: string;
  className?: string;
}) {
  const { src, failed, markFailed } = useCachedMedia(url);
  if (!src || failed) {
    return <div className="w-full h-full bg-inner" />;
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={markFailed}
      className={className}
    />
  );
}

export function ScreenshotGallery({
  appName,
  screenshots,
}: ScreenshotGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
    setLightboxOpen(false);
    if (screenshots.length > 0) {
      void preloadMediaUrls(screenshots);
    }
  }, [appName, screenshots]);

  const count = screenshots.length;
  const activeUrl = screenshots[activeIndex] || screenshots[0];
  const {
    src: activeSrc,
    failed: isActiveBroken,
    markFailed: markActiveBroken,
  } = useCachedMedia(activeUrl);

  const goPrev = useCallback(() => {
    if (count <= 1) return;
    setActiveIndex((prev) => (prev - 1 + count) % count);
  }, [count]);

  const goNext = useCallback(() => {
    if (count <= 1) return;
    setActiveIndex((prev) => (prev + 1) % count);
  }, [count]);

  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setLightboxOpen(false);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [lightboxOpen, goPrev, goNext]);

  if (count === 0) {
    return (
      <p className="text-xs text-muted">
        Bu uygulama için henüz ekran görüntüsü eklenmemiş.
      </p>
    );
  }

  const resolvedStageSrc = activeSrc || getMemoryCachedMediaUrl(activeUrl);

  return (
    <>
      <div className="space-y-3">
        {/* Main Active Stage */}
        <div className="relative group rounded-2xl border border-subtle bg-inner overflow-hidden">
          <div
            role="button"
            tabIndex={0}
            onClick={() => !isActiveBroken && resolvedStageSrc && setLightboxOpen(true)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isActiveBroken && resolvedStageSrc) {
                e.preventDefault();
                setLightboxOpen(true);
              }
            }}
            aria-label={`${appName} ekran görüntüsü ${activeIndex + 1} — büyütmek için tıklayın`}
            className={`relative aspect-video max-h-[240px] sm:max-h-[270px] w-full flex items-center justify-center overflow-hidden ${
              isActiveBroken ? 'cursor-default' : 'cursor-zoom-in'
            }`}
          >
            <AnimatePresence mode="wait">
              {isActiveBroken ? (
                <motion.div
                  key={`broken-${activeIndex}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-2 text-muted p-6"
                >
                  <ImageOff className="w-7 h-7 opacity-50" />
                  <span className="text-xs">Görsel yüklenemedi</span>
                </motion.div>
              ) : resolvedStageSrc ? (
                <motion.img
                  key={`${activeUrl}-${activeIndex}`}
                  src={resolvedStageSrc}
                  alt={`${appName} ekran görüntüsü ${activeIndex + 1}`}
                  decoding="sync"
                  referrerPolicy="no-referrer"
                  onError={markActiveBroken}
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.985 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full h-full object-contain bg-black/20 transition-transform duration-300 group-hover:scale-[1.015]"
                />
              ) : (
                <motion.div
                  key={`loading-${activeIndex}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"
                />
              )}
            </AnimatePresence>

            {/* Subtle counter + expand hint */}
            {!isActiveBroken && resolvedStageSrc && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/65 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-between">
                <span className="text-[11px] font-mono tabular-nums text-white/90 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-sm border border-white/10">
                  {String(activeIndex + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white px-3 py-1 rounded-full bg-black/45 backdrop-blur-sm border border-white/10">
                  <Maximize2 className="w-3 h-3" />
                  <span>Büyüt</span>
                </span>
              </div>
            )}
          </div>

          {/* Prev / Next Overlay Arrows */}
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                aria-label="Önceki ekran görüntüsü"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-modal/85 backdrop-blur-md border border-subtle text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:border-hover transition-all cursor-pointer shadow-md"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                aria-label="Sonraki ekran görüntüsü"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-modal/85 backdrop-blur-md border border-subtle text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:border-hover transition-all cursor-pointer shadow-md"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail Strip */}
        {count > 1 && (
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
            {screenshots.map((shot, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={`${shot}-${idx}`}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  aria-label={`Ekran görüntüsü ${idx + 1}`}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`relative shrink-0 w-24 sm:w-28 aspect-video rounded-xl overflow-hidden border transition-all cursor-pointer bg-inner ${
                    isSelected
                      ? 'border-accent opacity-100 shadow-sm'
                      : 'border-subtle opacity-55 hover:opacity-90 hover:border-hover'
                  }`}
                  style={
                    isSelected
                      ? { boxShadow: '0 0 0 1px var(--accent-border)' }
                      : undefined
                  }
                >
                  <CachedThumb
                    url={shot}
                    alt={`${appName} küçük önizleme ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Animated Lightbox */}
      <AnimatePresence>
        {lightboxOpen && resolvedStageSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setLightboxOpen(false)}
            className="fixed inset-0 z-[70] bg-black/88 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6 lg:p-10"
            role="dialog"
            aria-modal="true"
            aria-label={`${appName} ekran görüntüsü önizlemesi`}
          >
            {/* Top Bar */}
            <div
              className="flex items-center justify-between gap-4 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-bold text-white truncate">{appName}</span>
                <span className="text-xs font-mono tabular-nums text-white/60 shrink-0">
                  {String(activeIndex + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                aria-label="Önizlemeyi kapat"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Center Zoomed Image */}
            <div className="relative flex-1 min-h-0 flex items-center justify-center my-4">
              {count > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  aria-label="Önceki görsel"
                  className="absolute left-0 sm:left-2 z-10 w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 border border-white/15 text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <AnimatePresence mode="wait">
                <motion.img
                  key={`lightbox-${activeUrl}-${activeIndex}`}
                  src={resolvedStageSrc}
                  alt={`${appName} ekran görüntüsü ${activeIndex + 1}`}
                  referrerPolicy="no-referrer"
                  onClick={(e) => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.88, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                  transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                  className="max-h-full max-w-full rounded-2xl border border-white/10 shadow-2xl object-contain select-none"
                />
              </AnimatePresence>

              {count > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  aria-label="Sonraki görsel"
                  className="absolute right-0 sm:right-2 z-10 w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 border border-white/15 text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Bottom Thumbnail Switcher */}
            {count > 1 && (
              <div
                className="flex items-center justify-center gap-2 overflow-x-auto pb-1 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {screenshots.map((shot, idx) => {
                  const isSelected = idx === activeIndex;
                  return (
                    <button
                      key={`lb-thumb-${shot}-${idx}`}
                      type="button"
                      onClick={() => setActiveIndex(idx)}
                      aria-label={`Görsel ${idx + 1}`}
                      className={`shrink-0 w-16 sm:w-20 aspect-video rounded-lg overflow-hidden border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-accent opacity-100 scale-105'
                          : 'border-white/15 opacity-45 hover:opacity-85'
                      }`}
                    >
                      <CachedThumb
                        url={shot}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
