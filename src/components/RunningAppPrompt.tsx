import { useState } from 'react';
import { AlertTriangle, Loader2, Power, Play, X } from 'lucide-react';
import type { RunningProcessStatus, StoreApp } from '../types';

export interface PendingRunningAction {
  app: StoreApp;
  actionTitle: string;
  status: RunningProcessStatus;
  proceed: () => Promise<void> | void;
}

interface RunningAppPromptProps {
  pending: PendingRunningAction | null;
  onStopAndProceed: (app: StoreApp) => Promise<{ stopped: boolean; message?: string }>;
  onClose: () => void;
}

export function RunningAppPrompt({
  pending,
  onStopAndProceed,
  onClose,
}: RunningAppPromptProps) {
  const [busy, setBusy] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);

  if (!pending) return null;

  const { app, actionTitle, status, proceed } = pending;

  const handleKillAndRun = async () => {
    setBusy(true);
    setStopError(null);
    try {
      const res = await onStopAndProceed(app);
      if (!res.stopped) {
        setStopError(res.message || 'Uygulama kapatılamadı. Lütfen elle kapatıp tekrar deneyin.');
        return;
      }
      onClose();
      await proceed();
    } finally {
      setBusy(false);
    }
  };

  const handleForceProceed = async () => {
    setBusy(true);
    try {
      onClose();
      await proceed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-label="Açık Uygulama Kontrolü"
      className="p-4 sm:p-5 rounded-3xl bg-amber-500/12 border border-amber-500/45 space-y-3 text-xs"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div className="space-y-1 min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-amber-200">
              {app.name} Şu Anda Çalışıyor
            </h3>
            <p className="text-[11px] sm:text-xs text-amber-100/90 leading-relaxed">
              <span className="font-semibold">{actionTitle}</span> işlemi öncesinde açık uygulama dosyalarının kilitlenmemesi için çalışan süreçleri kapatmanız önerilir:
              {' '}
              <span className="font-mono text-amber-200">
                {status.processNames.join(', ')}
              </span>
            </p>
            {stopError && (
              <p className="text-[11px] text-red-300 font-semibold pt-0.5">{stopError}</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="p-1.5 rounded-full text-amber-200/70 hover:text-amber-100 hover:bg-amber-500/15 cursor-pointer shrink-0"
          aria-label="Kapat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-full bg-card border border-subtle hover:bg-card-hover text-xs font-semibold text-secondary cursor-pointer"
        >
          İptal
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleForceProceed()}
          className="px-3.5 py-1.5 rounded-full bg-card border border-subtle hover:bg-card-hover text-xs font-semibold text-primary inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Yine de Devam Et</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleKillAndRun()}
          className="px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-xs font-bold text-black inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
          <span>Kapat ve Devam Et</span>
        </button>
      </div>
    </div>
  );
}
