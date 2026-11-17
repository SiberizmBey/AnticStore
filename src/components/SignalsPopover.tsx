import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Newspaper, RefreshCw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import type { SignalEntry } from '../types';

interface SignalsPopoverProps {
  onSelectAppById?: (appId: string) => void;
}

export function SignalsPopover({ onSelectAppById }: SignalsPopoverProps) {
  const {
    signalsFeed,
    isSyncingSignals,
    signalsError,
    unreadSignalsCount,
    syncSignals,
    markSignalsAsRead,
  } = useStore();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && unreadSignalsCount > 0) {
      markSignalsAsRead();
    }
  }, [isOpen, unreadSignalsCount, markSignalsAsRead]);

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        markSignalsAsRead();
        void syncSignals(true);
      }
      return next;
    });
  };

  const handleSignalAction = (signal: SignalEntry) => {
    if (signal.appId && onSelectAppById) {
      onSelectAppById(signal.appId);
      setIsOpen(false);
      return;
    }
    if (signal.url) {
      if (window.anticStoreDesktop) {
        void window.anticStoreDesktop.openExternal(signal.url);
      } else {
        const anchor = document.createElement('a');
        anchor.href = signal.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.click();
      }
    }
  };

  const signals = signalsFeed.signals || [];
  const countLabel = String(signals.length).padStart(2, '0');
  const hasUnread = unreadSignalsCount > 0;

  return (
    <div ref={containerRef} className="relative flex items-center shrink-0">
      {/* Standalone Sinyaller Capsule */}
      <div
        className={`koza-nav-capsule relative flex items-center p-1.5 rounded-full bg-island border shadow-sm shrink-0 transition-all ${
          isOpen || hasUnread ? 'border-accent' : 'border-subtle hover:border-hover'
        }`}
        style={
          isOpen || hasUnread
            ? {
                boxShadow:
                  '0 0 0 1px var(--accent-border), 0 0 16px -4px rgba(var(--accent-rgb), 0.45)',
              }
            : undefined
        }
      >
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label="Sinyaller ve haber akışı"
          title="Sinyaller — Güncel duyurular ve notlar"
          className="h-7 px-2.5 sm:px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold bg-transparent text-primary hover:opacity-85 transition-opacity cursor-pointer shrink-0 whitespace-nowrap"
        >
          <Newspaper className="w-3.5 h-3.5 accent-text shrink-0" />
          <span className="hidden sm:inline">Sinyaller</span>
        </button>

        {hasUnread && (
          <span
            aria-label={`${unreadSignalsCount} okunmamış sinyal`}
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-[var(--bg-canvas)]"
          />
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="dialog"
            aria-label={signalsFeed.title || 'Sinyaller'}
            initial={{ opacity: 0, y: -8, scale: 0.98, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, scale: 0.98, filter: 'blur(4px)' }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="koza-window-interactive fixed sm:absolute right-3 sm:right-0 top-[62px] sm:top-[calc(100%+12px)] w-[calc(100vw-1.5rem)] sm:w-[400px] z-50 rounded-3xl bg-modal border border-subtle shadow-2xl overflow-hidden"
          >
            {/* Header with subtle concentric signal rings */}
            <div className="relative px-5 pt-4 pb-4 border-b border-subtle overflow-hidden">
              <svg
                className="pointer-events-none absolute -top-10 -right-10 w-44 h-44 opacity-25"
                viewBox="0 0 160 160"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="96" cy="64" r="28" stroke="var(--accent)" strokeWidth="1" />
                <circle cx="96" cy="64" r="46" stroke="var(--accent)" strokeWidth="1" />
                <circle cx="96" cy="64" r="64" stroke="var(--accent)" strokeWidth="1" />
              </svg>

              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-secondary truncate">
                    {signalsFeed.headerLabel || 'ANTIC VALLEY / SİNYAL'}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void syncSignals(true)}
                    disabled={isSyncingSignals}
                    title="Sinyalleri Yenile"
                    aria-label="Sinyalleri yenile"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-primary hover:bg-card-hover transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isSyncingSignals ? 'animate-spin accent-text' : ''}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    title="Kapat"
                    aria-label="Sinyalleri kapat"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-primary hover:bg-card-hover transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="relative mt-4 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono font-bold tracking-[0.14em] uppercase accent-text">
                    {signalsFeed.eyebrow || 'GÜNCEL YAYIN'}
                  </p>
                  <h2 className="text-xl font-bold text-primary tracking-tight mt-0.5 truncate">
                    {signalsFeed.title || 'Not defteri'}
                  </h2>
                </div>
                <span className="font-mono tabular-nums text-2xl font-bold text-muted/45 leading-none select-none shrink-0">
                  {countLabel}
                </span>
              </div>
            </div>

            {/* Feed Body */}
            <div className="max-h-[420px] overflow-y-auto p-4 space-y-3">
              {isSyncingSignals && signals.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-muted">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <span>Sinyaller çekiliyor...</span>
                </div>
              ) : signalsError && signals.length === 0 ? (
                <div className="p-5 rounded-2xl bg-inner border border-subtle text-center space-y-3">
                  <p className="text-xs text-red-400">{signalsError}</p>
                  <button
                    type="button"
                    onClick={() => void syncSignals(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold btn-primary-koza cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Yeniden Dene</span>
                  </button>
                </div>
              ) : signals.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted">
                  Henüz yayınlanmış bir sinyal bulunmuyor.
                </div>
              ) : (
                signals.map((signal) => {
                  const isInteractive = Boolean(signal.url || (signal.appId && onSelectAppById));
                  return (
                    <article
                      key={signal.id}
                      onClick={isInteractive ? () => handleSignalAction(signal) : undefined}
                      className={`rounded-2xl bg-inner/80 border border-subtle p-4 transition-colors ${
                        isInteractive ? 'hover:border-hover hover:bg-card-hover cursor-pointer group' : ''
                      }`}
                    >
                      {(signal.badge || signal.code) && (
                        <div className="flex items-center justify-between gap-2">
                          {signal.badge ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold badge-koza truncate max-w-[75%]">
                              {signal.badge}
                            </span>
                          ) : (
                            <span />
                          )}
                          {signal.code && (
                            <span className="font-mono tabular-nums text-[11px] text-muted shrink-0 flex items-center gap-1">
                              <span>{signal.code}</span>
                              {isInteractive && (
                                <ArrowUpRight className="w-3 h-3 opacity-60 group-hover:opacity-100 group-hover:accent-text transition-opacity" />
                              )}
                            </span>
                          )}
                        </div>
                      )}

                      <h3 className="text-[15px] font-bold text-primary mt-3 leading-snug group-hover:accent-text transition-colors">
                        {signal.title}
                      </h3>

                      {signal.summary && (
                        <p className="text-xs text-secondary mt-1.5 leading-relaxed">
                          {signal.summary}
                        </p>
                      )}

                      <div className="mt-3.5 pt-3 border-t border-subtle flex items-center justify-between gap-3">
                        <span className="text-[10px] font-mono tracking-[0.12em] uppercase text-muted truncate">
                          {signal.category || 'ANTIC VALLEY / SİNYAL'}
                        </span>
                        <div className="flex items-center gap-1 shrink-0" aria-hidden="true">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                          <span className="w-4 h-1.5 rounded-full bg-accent opacity-50" />
                          <span className="w-1.5 h-1.5 rounded-full bg-accent opacity-25" />
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-subtle text-center bg-inner/40">
              <p className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">
                {signalsFeed.footerNote || 'YENİ NOTLAR BURADA YAYINLANIR'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
