import { AlertTriangle, BellRing, Download, RefreshCw, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import type { NotificationKind } from '../types';

interface ToastContainerProps {
  onSelectAppById?: (appId: string) => void;
}

function renderToastIcon(kind: NotificationKind) {
  switch (kind) {
    case 'release':
      return <Sparkles className="w-4 h-4 accent-text" />;
    case 'update':
      return <RefreshCw className="w-4 h-4 accent-text" />;
    case 'follow':
      return <BellRing className="w-4 h-4 accent-text" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    default:
      return <Download className="w-4 h-4 text-emerald-400" />;
  }
}

export function ToastContainer({ onSelectAppById }: ToastContainerProps) {
  const { activeToasts, dismissToast, markNotificationRead } = useStore();

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] sm:w-[340px] pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {activeToasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            onClick={() => {
              markNotificationRead(toast.id);
              if (toast.appId && onSelectAppById) {
                onSelectAppById(toast.appId);
              }
              dismissToast(toast.id);
            }}
            className="pointer-events-auto p-3.5 rounded-2xl bg-modal border border-subtle shadow-xl flex items-start gap-3 cursor-pointer hover:border-hover transition-colors"
          >
            <div className="w-8 h-8 rounded-xl bg-inner border border-subtle flex items-center justify-center shrink-0">
              {renderToastIcon(toast.kind)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-primary truncate">{toast.title}</p>
              <p className="text-[11px] text-secondary mt-0.5 leading-snug line-clamp-2">
                {toast.message}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(toast.id);
              }}
              aria-label="Bildirimi kapat"
              className="p-1 rounded-lg text-muted hover:text-primary hover:bg-card-hover transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
