import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { checkInstalledMirrorStatus } from '../utils/semver';
import { AppCard } from './AppCard';
import type { StoreApp } from '../types';

interface CatalogAppRowProps {
  apps: StoreApp[];
  onSelectApp: (app: StoreApp) => void;
  headerLeft?: React.ReactNode;
  headerClassName?: string;
}

const GAP_PX = 16;

function resolveVisibleCount(width: number): number {
  if (width >= 1120) return 4;
  if (width >= 820) return 3;
  if (width >= 540) return 2;
  return 1;
}

function getInitialViewportWidth(): number {
  if (typeof window === 'undefined') return 1200;
  return Math.max(320, window.innerWidth - 64);
}

export function CatalogAppRow({
  apps,
  onSelectApp,
  headerLeft,
  headerClassName = '',
}: CatalogAppRowProps) {
  const { installedMap } = useStore();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const wheelCooldownRef = useRef<number>(0);

  const [containerWidth, setContainerWidth] = useState<number>(() => getInitialViewportWidth());
  const [stopIndex, setStopIndex] = useState<number>(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = el.clientWidth;
      if (next > 0) {
        setContainerWidth(next);
      }
    };

    updateWidth();
    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleCount = useMemo(() => resolveVisibleCount(containerWidth), [containerWidth]);

  const cardLayouts = useMemo(() => {
    const totalGaps = Math.max(0, visibleCount - 1) * GAP_PX;
    const unitWidth = Math.max(220, (containerWidth - totalGaps) / visibleCount);

    let cursorX = 0;
    const items = apps.map((app) => {
      const installed = installedMap[app.id];
      const mirrorStatus = checkInstalledMirrorStatus(
        installed?.version,
        app.latestVersion,
        app.releases,
        app.syncError
      );
      const span = mirrorStatus.isUnofficial && visibleCount >= 2 ? 2 : 1;
      const widthPx = span * unitWidth + (span - 1) * GAP_PX;
      const startX = cursorX;
      cursorX += widthPx + GAP_PX;
      return {
        app,
        span,
        widthPx,
        startX,
        endX: startX + widthPx,
      };
    });

    const totalSlots = items.reduce((acc, item) => acc + item.span, 0);
    const totalTrackWidth = Math.max(0, cursorX - GAP_PX);
    return { items, totalSlots, totalTrackWidth };
  }, [apps, installedMap, visibleCount, containerWidth]);

  const hasOverflow = cardLayouts.totalSlots > visibleCount;
  const maxScrollOffset = Math.max(0, cardLayouts.totalTrackWidth - containerWidth);

  const stops = useMemo(() => {
    if (!hasOverflow) return [0];
    const unique: number[] = [];
    for (const item of cardLayouts.items) {
      const clamped = Math.min(item.startX, maxScrollOffset);
      if (unique.length === 0 || clamped - unique[unique.length - 1] > 2) {
        unique.push(clamped);
      }
      if (clamped >= maxScrollOffset - 1) break;
    }
    return unique.length > 0 ? unique : [0];
  }, [hasOverflow, cardLayouts.items, maxScrollOffset]);

  const maxStopIndex = Math.max(0, stops.length - 1);
  const clampedStopIndex = Math.min(stopIndex, maxStopIndex);

  useEffect(() => {
    setStopIndex((prev) => Math.min(prev, maxStopIndex));
  }, [maxStopIndex]);

  const offsetX = -(stops[clampedStopIndex] || 0);
  const currentScrollLeft = stops[clampedStopIndex] || 0;
  const canPrev = clampedStopIndex > 0;
  const canNext = clampedStopIndex < maxStopIndex;

  const handlePrev = () => {
    setStopIndex((prev) => Math.max(0, Math.min(prev, maxStopIndex) - 1));
  };

  const handleNext = () => {
    setStopIndex((prev) => Math.min(maxStopIndex, Math.min(prev, maxStopIndex) + 1));
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!hasOverflow) return;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
    const now = Date.now();
    if (now - wheelCooldownRef.current < 260) return;
    wheelCooldownRef.current = now;
    if (e.deltaX > 0 && canNext) {
      handleNext();
    } else if (e.deltaX < 0 && canPrev) {
      handlePrev();
    }
  };

  const visibleIndices = useMemo(() => {
    const viewRight = currentScrollLeft + containerWidth;
    const indices: number[] = [];
    cardLayouts.items.forEach((item, idx) => {
      if (item.endX > currentScrollLeft + 8 && item.startX < viewRight - 8) {
        indices.push(idx);
      }
    });
    return indices;
  }, [cardLayouts.items, currentScrollLeft, containerWidth]);

  const rangeStart = visibleIndices.length > 0 ? visibleIndices[0] + 1 : 1;
  const rangeEnd =
    visibleIndices.length > 0
      ? visibleIndices[visibleIndices.length - 1] + 1
      : Math.min(apps.length, visibleCount);
  const totalStops = stops.length;

  const renderControls = () => {
    if (!hasOverflow) return null;
    return (
      <div className="flex items-center gap-2.5 shrink-0">
        {totalStops > 1 && totalStops <= 10 && (
          <div
            className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-full bg-card border border-subtle"
            aria-label="Sayfa göstergesi"
          >
            {stops.map((_, idx) => {
              const active = idx === clampedStopIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setStopIndex(idx)}
                  aria-label={`${idx + 1}. konuma kaydır`}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    active ? 'w-5 bg-accent' : 'w-1.5 bg-muted/40 hover:bg-muted/80'
                  }`}
                />
              );
            })}
          </div>
        )}

        <span className="text-[11px] font-mono tabular-nums text-muted px-1">
          {rangeStart}–{rangeEnd} / {apps.length}
        </span>

        <div className="flex items-center gap-1.5">
          <motion.button
            type="button"
            onClick={handlePrev}
            disabled={!canPrev}
            whileHover={canPrev ? { scale: 1.07 } : undefined}
            whileTap={canPrev ? { scale: 0.92 } : undefined}
            aria-label="Önceki uygulamalar"
            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
              canPrev
                ? 'bg-card border-subtle hover:border-hover hover:bg-card-hover text-primary cursor-pointer shadow-sm'
                : 'bg-inner/40 border-subtle/50 text-muted/40 cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>

          <motion.button
            type="button"
            onClick={handleNext}
            disabled={!canNext}
            whileHover={canNext ? { scale: 1.07 } : undefined}
            whileTap={canNext ? { scale: 0.92 } : undefined}
            aria-label="Sonraki uygulamalar"
            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
              canNext
                ? 'bg-card border-subtle hover:border-hover hover:bg-card-hover text-primary cursor-pointer shadow-sm'
                : 'bg-inner/40 border-subtle/50 text-muted/40 cursor-not-allowed'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {(headerLeft || hasOverflow) && (
        <div className={`flex flex-wrap items-center justify-between gap-3 ${headerClassName}`}>
          <div className="min-w-0 flex-1">{headerLeft}</div>
          {renderControls()}
        </div>
      )}

      <div className="relative group/carousel" onWheel={handleWheel}>
        {/* Viewport measured for exact card widths */}
        <div ref={viewportRef} className="w-full overflow-hidden py-2 -my-2">
          {!hasOverflow ? (
            <motion.div
              layout
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${visibleCount}, minmax(0, 1fr))`,
              }}
            >
              {cardLayouts.items.map(({ app, span }) => (
                <div
                  key={app.id}
                  className="flex [&>*]:w-full"
                  style={span > 1 ? { gridColumn: `span ${span} / span ${span}` } : undefined}
                >
                  <AppCard app={app} onSelect={onSelectApp} />
                </div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              className="flex items-stretch will-change-transform"
              style={{ gap: `${GAP_PX}px` }}
              animate={{ x: offsetX }}
              transition={{
                type: 'spring',
                stiffness: 310,
                damping: 32,
                mass: 0.85,
              }}
            >
              {cardLayouts.items.map(({ app, widthPx, startX, endX }) => {
                const isInWindow =
                  endX > currentScrollLeft + 8 && startX < currentScrollLeft + containerWidth - 8;
                return (
                  <motion.div
                    key={app.id}
                    className="shrink-0 flex"
                    style={{ width: `${widthPx}px` }}
                    animate={{
                      opacity: isInWindow ? 1 : 0.45,
                      scale: isInWindow ? 1 : 0.97,
                    }}
                    transition={{
                      duration: 0.22,
                      ease: 'easeOut',
                    }}
                  >
                    <div className="w-full flex [&>*]:w-full">
                      <AppCard app={app} onSelect={onSelectApp} />
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* Floating edge navigation buttons on overflow */}
        <AnimatePresence>
          {hasOverflow && canPrev && (
            <motion.button
              key="carousel-edge-prev"
              type="button"
              initial={{ opacity: 0, x: -6, scale: 0.88 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -6, scale: 0.88 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.16 }}
              onClick={handlePrev}
              aria-label="Sola kaydır"
              className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-card/90 backdrop-blur-md border border-subtle hover:border-hover shadow-lg items-center justify-center text-primary cursor-pointer opacity-0 group-hover/carousel:opacity-100 focus:opacity-100 transition-opacity"
            >
              <ChevronLeft className="w-4.5 h-4.5" />
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {hasOverflow && canNext && (
            <motion.button
              key="carousel-edge-next"
              type="button"
              initial={{ opacity: 0, x: 6, scale: 0.88 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 6, scale: 0.88 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.16 }}
              onClick={handleNext}
              aria-label="Sağa kaydır"
              className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-card/90 backdrop-blur-md border border-subtle hover:border-hover shadow-lg items-center justify-center text-primary cursor-pointer opacity-0 group-hover/carousel:opacity-100 focus:opacity-100 transition-opacity"
            >
              <ChevronRight className="w-4.5 h-4.5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
