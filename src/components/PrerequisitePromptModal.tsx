import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  PackagePlus,
  RefreshCw,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { AppIcon } from './AppIcon';
import { formatBytes, formatSpeed } from '../utils/semver';

export function PrerequisitePromptModal() {
  const {
    pendingPrerequisitePrompt,
    resolvePendingPrerequisitePrompt,
    installPrerequisite,
    checkAppPrerequisites,
    prerequisiteStatuses,
    tasks,
    platformInfo,
  } = useStore();

  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsBusy(false);
    setErrorMsg(null);
    setStatusMessage(null);
  }, [pendingPrerequisitePrompt?.app.id]);

  useEffect(() => {
    if (!pendingPrerequisitePrompt) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        resolvePendingPrerequisitePrompt(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isBusy, pendingPrerequisitePrompt, resolvePendingPrerequisitePrompt]);

  const handleOpenExternal = (url: string) => {
    if (window.anticStoreDesktop) {
      void window.anticStoreDesktop.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!pendingPrerequisitePrompt) return null;

  const { app, missingPrerequisites } = pendingPrerequisitePrompt;

  const liveMissing = missingPrerequisites.filter((p) => {
    const live = prerequisiteStatuses[p.id] ?? pendingPrerequisitePrompt.statuses[p.id];
    return !live?.installed;
  });

  const activePrereqTask = missingPrerequisites
    .map((p) => tasks[`prereq:${p.id}`])
    .find(Boolean);

  const handleInstallAndContinue = async () => {
    setIsBusy(true);
    setErrorMsg(null);
    setStatusMessage(null);
    try {
      let allReady = true;
      for (const prereq of liveMissing.length > 0 ? liveMissing : missingPrerequisites) {
        const result = await installPrerequisite(prereq);
        if (!result.installed) {
          allReady = false;
          setErrorMsg(result.message);
          break;
        }
      }
      if (allReady) {
        resolvePendingPrerequisitePrompt(true);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleRecheck = async () => {
    setIsBusy(true);
    setErrorMsg(null);
    setStatusMessage(null);
    try {
      const checked = await checkAppPrerequisites(app);
      const stillMissing = missingPrerequisites.filter(
        (p) => !checked.find((c) => c.id === p.id)?.installed
      );
      if (stillMissing.length === 0) {
        setStatusMessage('Tüm ön gereksinimler doğrulandı, uygulama kurulumuna geçiliyor...');
        window.setTimeout(() => {
          resolvePendingPrerequisitePrompt(true);
        }, 450);
      } else {
        setStatusMessage('Eksik ek bileşenler hâlâ tespit edilmedi.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prereq-modal-title"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.96, y: 8, filter: 'blur(4px)' }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-lg rounded-3xl bg-modal border border-subtle shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-subtle bg-card/60 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <AppIcon
                name={app.name}
                iconUrl={app.iconUrl}
                cacheKey={app.syncedAt}
                className="w-11 h-11 rounded-2xl border border-subtle bg-inner p-1.5 shrink-0 flex items-center justify-center"
                imageClassName="w-full h-full object-contain rounded-xl"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Ek Bileşen Gereksinimi Tespit Edildi</span>
                </div>
                <h2
                  id="prereq-modal-title"
                  className="text-base font-bold text-primary truncate mt-0.5"
                >
                  {app.name} ek sürücü / bileşen istiyor
                </h2>
              </div>
            </div>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => resolvePendingPrerequisitePrompt(false)}
              aria-label="Kapat"
              className="p-1.5 rounded-full text-muted hover:text-primary hover:bg-card-hover transition-colors cursor-pointer disabled:opacity-40 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <p className="text-xs sm:text-sm text-secondary leading-relaxed">
              <span className="font-semibold text-primary">{app.name}</span> kurulumuna geçmeden önce yapılan sistem kontrolünde aşağıdaki gerekli ek bileşen sisteminizde bulunamadı:
            </p>

            <div className="space-y-2.5">
              {missingPrerequisites.map((prereq) => {
                const liveStatus =
                  prerequisiteStatuses[prereq.id] ?? pendingPrerequisitePrompt.statuses[prereq.id];
                const isInstalledNow = Boolean(liveStatus?.installed);
                const prereqTask = tasks[`prereq:${prereq.id}`];

                return (
                  <div
                    key={prereq.id}
                    className={`p-4 rounded-2xl border space-y-2.5 ${
                      isInstalledNow
                        ? 'bg-emerald-500/8 border-emerald-500/35'
                        : 'bg-inner border-subtle'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                            isInstalledNow
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                              : 'bg-amber-500/12 border-amber-500/35 text-amber-400'
                          }`}
                        >
                          {isInstalledNow ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Wrench className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-primary">
                              {prereq.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-card border border-subtle text-secondary">
                              {prereq.kind === 'driver'
                                ? 'Sürücü'
                                : prereq.kind === 'app'
                                ? 'Ek Uygulama'
                                : 'Çalışma Zamanı'}
                            </span>
                            {prereq.required !== false && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/35 text-amber-300">
                                Zorunlu
                              </span>
                            )}
                          </div>
                          {prereq.description && (
                            <p className="text-[11px] sm:text-xs text-secondary mt-1 leading-relaxed">
                              {prereq.description}
                            </p>
                          )}
                          <p className="text-[11px] font-mono text-muted mt-1.5">
                            {isInstalledNow
                              ? `Sistemde doğrulandı${liveStatus?.version ? ` (v${liveStatus.version})` : ''}`
                              : liveStatus?.details || 'Sistemde tespit edilmedi'}
                          </p>
                        </div>
                      </div>

                      {prereq.websiteUrl && (
                        <button
                          type="button"
                          onClick={() => handleOpenExternal(prereq.websiteUrl!)}
                          title="Resmi Web Sayfası"
                          className="p-1.5 rounded-xl bg-card border border-subtle hover:bg-card-hover text-muted hover:text-primary transition-colors cursor-pointer shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {prereqTask && (
                      <div className="pt-2 border-t border-subtle space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-primary font-semibold truncate pr-2">
                            {prereqTask.message}
                          </span>
                          <span className="accent-text font-bold tabular-nums shrink-0">
                            %{prereqTask.percent}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-card overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-150"
                            style={{
                              width: `${Math.max(4, Math.min(100, prereqTask.percent))}%`,
                              backgroundColor: 'var(--accent)',
                            }}
                          />
                        </div>
                        {(prereqTask.totalBytes > 0 || prereqTask.speedBps > 0) && (
                          <div className="flex items-center justify-between text-[10px] font-mono text-muted tabular-nums">
                            <span>
                              {formatBytes(prereqTask.receivedBytes)}
                              {prereqTask.totalBytes > 0
                                ? ` / ${formatBytes(prereqTask.totalBytes)}`
                                : ''}
                            </span>
                            {prereqTask.speedBps > 0 && (
                              <span>{formatSpeed(prereqTask.speedBps)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!platformInfo.isDesktop && (
              <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-[11px] text-sky-200 leading-relaxed">
                Web önizleme modunda tarayıcı üzerinden kurulu sürücü kontrolü ve otomatik yönetici kurulumu yapılamaz. Paketi indirip manuel kurduktan sonra uygulama kurulumuna devam edebilirsiniz.
              </div>
            )}

            {platformInfo.isDesktop &&
              missingPrerequisites.some((p) => p.requiresAdmin || p.rebootMayBeRequired) && (
                <div className="p-3.5 rounded-2xl bg-inner border border-subtle text-[11px] text-muted flex items-start gap-2 leading-relaxed">
                  <ShieldAlert className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                  <span>
                    Otomatik sürücü kurulumu sırasında Windows yönetici onayı (UAC) penceresi açılabilir. Kurulum tamamlandığında sürücü otomatik olarak yeniden doğrulanacaktır.
                  </span>
                </div>
              )}

            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/35 text-xs text-red-300 leading-relaxed">
                {errorMsg}
              </div>
            )}

            {statusMessage && (
              <div className="p-3.5 rounded-2xl accent-subtle border accent-border text-xs text-primary leading-relaxed">
                {statusMessage}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-subtle bg-card/40 flex flex-wrap items-center justify-between gap-2.5">
            {platformInfo.isDesktop ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleRecheck()}
                className="px-3.5 py-2 rounded-full bg-inner border border-subtle hover:bg-card-hover text-xs font-semibold text-secondary hover:text-primary inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBusy && !activePrereqTask ? 'animate-spin' : ''}`} />
                <span>Tekrar Denetle</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => resolvePendingPrerequisitePrompt(false)}
                className="px-4 py-2 rounded-full bg-inner border border-subtle hover:bg-card-hover text-xs font-semibold text-secondary cursor-pointer disabled:opacity-50"
              >
                Vazgeç
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => resolvePendingPrerequisitePrompt(true)}
                className="px-4 py-2 rounded-full bg-inner border border-subtle hover:bg-card-hover text-xs font-semibold text-primary cursor-pointer disabled:opacity-50"
              >
                {platformInfo.isDesktop ? 'Yine de Uygulamayı Kur' : `${app.name} İndirmesine Geç`}
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleInstallAndContinue()}
                className="px-4.5 py-2 rounded-full btn-primary-koza hover:opacity-90 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : platformInfo.isDesktop ? (
                  <PackagePlus className="w-3.5 h-3.5" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>
                  {isBusy
                    ? 'Kuruluyor...'
                    : platformInfo.isDesktop
                    ? 'İndir, Kur ve Devam Et'
                    : 'Ön Gereksinimi İndir'}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
