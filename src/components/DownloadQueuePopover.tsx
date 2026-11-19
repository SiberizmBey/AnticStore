import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Clock, Loader2, Pause, Play, ShieldCheck, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { formatBytes, formatSpeed } from '../utils/semver';

interface DownloadQueuePopoverProps {
  onSelectAppById?: (appId: string) => void;
}

export function DownloadQueuePopover({ onSelectAppById }: DownloadQueuePopoverProps) {
  const { apps, tasks, pauseTask, resumeTask, cancelTask } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const taskList = useMemo(() => {
    const all = Object.values(tasks);
    const rank = (phase: string) => {
      if (phase === 'paused') return 1;
      if (phase === 'queued') return 2;
      return 0;
    };
    return all.sort((a, b) => {
      const diff = rank(a.phase) - rank(b.phase);
      if (diff !== 0) return diff;
      return (a.queuePosition || 0) - (b.queuePosition || 0);
    });
  }, [tasks]);

  useEffect(() => {
    if (taskList.length === 0) {
      setIsOpen(false);
    }
  }, [taskList.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (taskList.length === 0) {
    return null;
  }

  const pausedCount = taskList.filter((t) => t.phase === 'paused').length;
  const queuedCount = taskList.filter((t) => t.phase === 'queued').length;
  const activeSource = taskList.filter((t) => t.phase !== 'queued' && t.phase !== 'paused');
  const activeCount = activeSource.length;
  const overallPercent =
    activeSource.length > 0
      ? Math.round(activeSource.reduce((sum, t) => sum + (t.percent || 0), 0) / activeSource.length)
      : Math.round(
          taskList.reduce((sum, t) => sum + (t.percent || 0), 0) / Math.max(1, taskList.length)
        );

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="İndirme Kuyruğu"
        className={`h-7 px-2.5 rounded-full flex items-center gap-1.5 text-[11px] font-bold border transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
          isOpen
            ? 'accent-subtle accent-border accent-text'
            : 'bg-card border-subtle hover:bg-card-hover text-primary'
        }`}
      >
        <ArrowDownToLine
          className={`w-3.5 h-3.5 shrink-0 ${
            activeCount > 0 ? 'accent-text animate-pulse' : 'text-amber-400'
          }`}
        />
        <span className="tabular-nums">{taskList.length}</span>
        <span className="hidden md:inline text-muted font-mono tabular-nums">{overallPercent}%</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            role="dialog"
            aria-label="İndirme Kuyruğu"
            className="absolute right-0 top-10 w-[330px] sm:w-[370px] rounded-3xl bg-modal border border-subtle shadow-2xl overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-subtle flex items-center justify-between gap-2 bg-card/70">
              <div className="flex items-center gap-2 min-w-0">
                <ArrowDownToLine className="w-4 h-4 accent-text shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-primary truncate">İndirme Kuyruğu</h3>
                  <p className="text-[10px] text-muted tabular-nums">
                    {activeCount} aktif
                    {pausedCount > 0 ? ` · ${pausedCount} duraklatıldı` : ''}
                    {queuedCount > 0 ? ` · ${queuedCount} sırada` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-full text-muted hover:text-primary hover:bg-inner cursor-pointer"
                aria-label="Kapat"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="max-h-[320px] overflow-y-auto divide-y divide-subtle p-2 space-y-1">
              {taskList.map((task) => {
                const matchedApp = apps.find((a) => a.id === task.appId);
                const title = task.appName || matchedApp?.name || task.appId;
                const isQueued = task.phase === 'queued';
                const isPaused = task.phase === 'paused';
                const isVerifying = task.phase === 'verifying';
                const canPause = task.phase === 'downloading' || isQueued;

                return (
                  <div
                    key={task.appId}
                    onClick={() => {
                      if (onSelectAppById) {
                        onSelectAppById(task.appId);
                        setIsOpen(false);
                      }
                    }}
                    className="p-2.5 rounded-2xl bg-inner/65 hover:bg-card-hover border border-subtle/80 transition-colors cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isPaused ? (
                          <Pause className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : isQueued ? (
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : isVerifying ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Loader2 className="w-3.5 h-3.5 accent-text animate-spin shrink-0" />
                        )}
                        <span className="text-xs font-bold text-primary truncate">{title}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] font-mono font-bold tabular-nums text-primary mr-0.5">
                          {isQueued ? `#${task.queuePosition || '-'}` : `${task.percent}%`}
                        </span>
                        {canPause && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void pauseTask(task.appId);
                            }}
                            title="Duraklat"
                            className="p-1 rounded-full bg-card border border-subtle hover:border-hover text-muted hover:text-amber-400 cursor-pointer"
                          >
                            <Pause className="w-3 h-3" />
                          </button>
                        )}
                        {isPaused && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void resumeTask(task.appId);
                            }}
                            title="Devam Et"
                            className="p-1 rounded-full bg-card border border-subtle hover:border-hover accent-text cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void cancelTask(task.appId);
                          }}
                          title="İptal Et"
                          className="p-1 rounded-full bg-card border border-subtle hover:border-hover text-muted hover:text-red-400 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[10px] text-secondary truncate">{task.message}</p>

                    {!isQueued && (
                      <>
                        <div className="h-1.5 w-full rounded-full bg-card overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-150"
                            style={{
                              width: `${Math.max(4, task.percent)}%`,
                              backgroundColor: isVerifying
                                ? '#10b981'
                                : isPaused
                                ? '#f59e0b'
                                : 'var(--accent)',
                            }}
                          />
                        </div>
                        {task.totalBytes > 0 && (
                          <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-muted">
                            <span>
                              {formatBytes(task.receivedBytes)} / {formatBytes(task.totalBytes)}
                            </span>
                            <span>{isPaused ? 'Duraklatıldı' : formatSpeed(task.speedBps)}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
