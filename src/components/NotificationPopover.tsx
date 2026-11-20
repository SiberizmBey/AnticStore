import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Trash2,
  Download,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  BellRing,
  X,
  FlaskConical,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { formatTurkishDate } from '../utils/semver';
import type { NotificationKind, StoreNotification } from '../types';

interface NotificationPopoverProps {
  onSelectAppById?: (appId: string) => void;
  placement?: 'top' | 'bottom';
}

function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return 'Şimdi';
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} sa önce`;
  return formatTurkishDate(iso);
}

function getKindIcon(kind: NotificationKind) {
  switch (kind) {
    case 'release':
      return <Sparkles className="w-3.5 h-3.5 accent-text shrink-0" />;
    case 'update':
      return <RefreshCw className="w-3.5 h-3.5 accent-text shrink-0" />;
    case 'follow':
      return <BellRing className="w-3.5 h-3.5 accent-text shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    default:
      return <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  }
}

export function NotificationPopover({
  onSelectAppById,
  placement = 'bottom',
}: NotificationPopoverProps) {
  const {
    notifications,
    unreadNotificationsCount,
    followedAppIds,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    sendTestNotification,
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

  const handleNotificationClick = (item: StoreNotification) => {
    markNotificationRead(item.id);
    if (item.appId && onSelectAppById) {
      onSelectAppById(item.appId);
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Bildirimler"
        title="Bildirimler ve Takip Uyarıları"
        className={`relative h-7 w-7 rounded-full flex items-center justify-center border transition-colors cursor-pointer shrink-0 ${
          isOpen
            ? 'accent-subtle accent-border accent-text'
            : 'bg-card border-subtle hover:bg-card-hover text-primary'
        }`}
      >
        <Bell className="w-3.5 h-3.5" />
        {unreadNotificationsCount > 0 && (
          <span
            aria-label={`${unreadNotificationsCount} okunmamış bildirim`}
            className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center tabular-nums ring-2 ring-[var(--bg-island)]"
          >
            {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="dialog"
            aria-label="Bildirim Merkezi"
            initial={{ opacity: 0, y: placement === 'top' ? 10 : -8, scale: 0.98, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: placement === 'top' ? 10 : -8, scale: 0.98, filter: 'blur(4px)' }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={`${
              placement === 'top'
                ? 'fixed bottom-[4.75rem] right-4 sm:absolute sm:bottom-[calc(100%+14px)] sm:right-0 sm:top-auto'
                : 'absolute top-[calc(100%+12px)] right-0'
            } w-[calc(100vw-2rem)] sm:w-[370px] max-h-[calc(100vh-6rem)] flex flex-col z-50 rounded-3xl bg-modal border border-subtle shadow-2xl overflow-hidden`}
          >
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-subtle flex items-center justify-between gap-2 bg-card/50 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Bell className="w-4 h-4 accent-text shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-xs font-bold text-primary">Bildirimler</h2>
                  <p className="text-[10px] text-muted tabular-nums">
                    {followedAppIds.length > 0
                      ? `${followedAppIds.length} uygulama takip ediliyor`
                      : 'Güncelleme ve yayın uyarıları'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {unreadNotificationsCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    title="Tümünü okundu işaretle"
                    className="p-1.5 rounded-full text-muted hover:text-primary hover:bg-card-hover transition-colors cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={clearNotifications}
                    title="Bildirimleri temizle"
                    className="p-1.5 rounded-full text-muted hover:text-red-400 hover:bg-card-hover transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Kapat"
                  className="p-1.5 rounded-full text-muted hover:text-primary hover:bg-card-hover transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 max-h-[380px] overflow-y-auto p-3 space-y-2">
              {notifications.length === 0 ? (
                <div className="py-10 px-4 text-center space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-inner border border-subtle flex items-center justify-center mx-auto text-muted">
                    <Bell className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-semibold text-secondary">Henüz bildirim yok</p>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Kurulum, güncelleme ve takip ettiğiniz yakında çıkacak uygulamaların bildirimleri burada görünür.
                  </p>
                </div>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNotificationClick(item)}
                    style={!item.read ? { borderColor: 'var(--accent-border)' } : undefined}
                    className={`w-full text-left p-3 rounded-2xl border transition-colors cursor-pointer flex items-start gap-2.5 ${
                      item.read
                        ? 'bg-inner/45 border-subtle hover:bg-card-hover'
                        : 'bg-card border-subtle hover:bg-card-hover'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-xl bg-inner border border-subtle flex items-center justify-center shrink-0 mt-0.5">
                      {getKindIcon(item.kind)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-primary truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] font-mono text-muted shrink-0 tabular-nums">
                          {formatNotificationTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-secondary mt-0.5 leading-relaxed">
                        {item.message}
                      </p>
                    </div>
                    {!item.read && (
                      <span
                        className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Temporary Test Action Footer */}
            <div className="px-4 py-2.5 border-t border-subtle bg-card/40 flex items-center justify-between gap-2 shrink-0">
              <span className="text-[10px] font-mono text-muted">Geçici Test Aracı</span>
              <button
                type="button"
                onClick={() => void sendTestNotification()}
                className="px-3 py-1.5 rounded-full bg-inner border border-subtle hover:bg-card-hover hover:border-hover text-[11px] font-semibold text-primary inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FlaskConical className="w-3 h-3 accent-text" />
                <span>Test Bildirimi Gönder</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
