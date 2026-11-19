import { useRef, useState, type ChangeEvent } from 'react';
import {
  Sparkles,
  Moon,
  Sun,
  Monitor,
  Check,
  Layers,
  AppWindow,
  Square,
  HardDriveDownload,
  FolderOpen,
  Bell,
  BellRing,
  Power,
  FlaskConical,
  ShieldCheck,
  PanelBottom,
  LogOut,
  Minimize2,
  HardDrive,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Gauge,
  RotateCcw,
} from 'lucide-react';
import { useTheme, ACCENT_PALETTES } from '../context/ThemeContext';
import { useStore } from '../context/StoreContext';
import { Footer } from '../components/Footer';
import { GitHubTokenCard } from '../components/GitHubTokenCard';
import { formatBytes, formatTurkishDate } from '../utils/semver';
import type {
  AccentColor,
  InstallMode,
  KoruProfileManifest,
  StoreApp,
  ThemeMode,
  UIStyle,
} from '../types';
import type { DesktopWindowCloseBehavior } from '../types/electron';

export function SettingsView() {
  const { activeTheme, resolvedTheme, setTheme, activeAccent, setAccent, activeUIStyle, setUIStyle } = useTheme();
  const {
    platformInfo,
    installMode,
    setInstallMode,
    officialSource,
    githubTokenConfigured,
    githubTokenStatusLoaded,
    notificationPermission,
    desktopNotificationsEnabled,
    inAppNotificationsEnabled,
    autostartEnabled,
    autostartSupported,
    autostartUpdating,
    autostartInTray,
    showTrayIcon,
    closeBehavior,
    autoCleanInstallers,
    downloadsCache,
    isLoadingCache,
    setDesktopNotificationsEnabled,
    setInAppNotificationsEnabled,
    requestNotificationPermission,
    sendTestNotification,
    toggleAutostart,
    setAutostartInTray,
    setShowTrayIcon,
    setCloseBehavior,
    setAutoCleanInstallers,
    downloadSpeedLimitBps,
    customInstallDir,
    askDownloadDirOnInstall,
    setDownloadSpeedLimit,
    setCustomInstallDir,
    chooseCustomInstallDir,
    setAskDownloadDirOnInstall,
    refreshDownloadsCache,
    clearDownloadsCache,
    exportStoreProfile,
    importStoreProfile,
    restoreProfileApps,
  } = useStore();

  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importedProfile, setImportedProfile] = useState<{
    manifest: KoruProfileManifest;
    missingApps: StoreApp[];
  } | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [restoringProfile, setRestoringProfile] = useState(false);

  const handleClearCache = async () => {
    setClearingCache(true);
    setCacheNotice(null);
    try {
      const res = await clearDownloadsCache();
      if (res.deletedCount > 0) {
        setCacheNotice(`${res.deletedCount} önbellek dosyası silindi (${formatBytes(res.freedBytes)} alan açıldı).`);
      } else {
        setCacheNotice('Silinecek önbellek dosyası bulunamadı.');
      }
    } finally {
      setClearingCache(false);
    }
  };

  const handleExportProfile = () => {
    setProfileError(null);
    setProfileNotice(null);
    const manifest = exportStoreProfile();
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'koru-profilim.koruprofile.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setProfileNotice(
      `Profil dışa aktarıldı (${manifest.installedApps.length} kurulu uygulama, ${Object.keys(manifest.appChannels).length} kanal tercihi).`
    );
  };

  const handleImportProfileFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileError(null);
    setProfileNotice(null);
    try {
      const text = await file.text();
      const result = importStoreProfile(text);
      setImportedProfile(result);
      setProfileNotice(
        `Profil tercihleri uygulandı. ${
          result.missingApps.length > 0
            ? `${result.missingApps.length} eksik uygulama kurulum için hazır.`
            : 'Listedeki tüm uygulamalar zaten kurulu.'
        }`
      );
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Profil dosyası okunamadı.');
      setImportedProfile(null);
    }
  };

  const handleRestoreMissingApps = async () => {
    if (!importedProfile || importedProfile.missingApps.length === 0) return;
    setRestoringProfile(true);
    setProfileError(null);
    try {
      const count = await restoreProfileApps(importedProfile.missingApps.map((a) => a.id));
      setProfileNotice(`${count} uygulama eşzamanlı indirme kuyruğuna eklendi.`);
      setImportedProfile((prev) => (prev ? { ...prev, missingApps: [] } : null));
    } finally {
      setRestoringProfile(false);
    }
  };

  const permissionLabel =
    notificationPermission === 'granted'
      ? 'İzin Verildi'
      : notificationPermission === 'denied'
      ? 'Tarayıcı / Sistem Tarafından Engellendi'
      : notificationPermission === 'unsupported'
      ? 'Bu Ortamda Desteklenmiyor'
      : 'İzin Bekleniyor';

  return (
    <div className="w-full flex flex-col justify-between min-h-full gap-8">
      <div className="w-full space-y-6">
        {githubTokenStatusLoaded && githubTokenConfigured && <GitHubTokenCard />}

        {/* Store & Installer Preferences */}
        <div className="p-6 rounded-3xl bg-card border border-subtle space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-modal border border-subtle flex items-center justify-center">
                <HardDriveDownload className="w-6 h-6 accent-text" />
              </div>
              <div>
                <h2 className="text-base font-bold text-primary">Koru Kurulum Motoru</h2>
                <p className="text-xs text-muted">
                  Paket: <span className="font-mono text-secondary">{platformInfo.packageId}</span> · Katalog:{' '}
                  <span className="font-mono text-secondary">{officialSource.value}</span>
                </p>
              </div>
            </div>

            {platformInfo.isDesktop && (
              <button
                type="button"
                onClick={() => void window.anticStoreDesktop?.openDownloadsFolder()}
                className="px-4 py-2 rounded-full bg-inner border border-subtle hover:bg-card-hover text-xs font-semibold text-primary flex items-center gap-1.5 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 accent-text" />
                <span>İndirilen Paketleri Aç</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {[
              {
                id: 'interactive' as InstallMode,
                title: 'Standart Kurulum Sihirbazı',
                desc: 'Kurulum ve kaldırma işlemlerinde uygulamanın kendi kurulum penceresi açılır.',
              },
              {
                id: 'silent' as InstallMode,
                title: 'Sessiz Arka Plan Kurulumu (/S)',
                desc: 'Destekleyen NSIS/MSI paketlerini masaüstü uygulamasında sessiz parametrelerle kurar.',
              },
            ].map((mode) => {
              const selected = installMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setInstallMode(mode.id)}
                  style={selected ? { borderColor: 'var(--accent)' } : undefined}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    selected
                      ? 'accent-subtle shadow-sm'
                      : 'border-subtle bg-inner/60 hover:bg-card-hover'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-primary">{mode.title}</span>
                    {selected && <Check className="w-4 h-4 accent-text" />}
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">{mode.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="p-4 rounded-2xl bg-inner/60 border border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 accent-text shrink-0" />
                <span className="text-xs font-bold text-primary">Varsayılan Kurulum Dizini</span>
              </div>
              <p
                title={customInstallDir || 'Sistem Varsayılanı'}
                className="text-[11px] font-mono text-secondary truncate"
              >
                {customInstallDir || 'Sistem Varsayılanı (Uygulama Yükleyicisi)'}
              </p>
              <p className="text-[10px] text-muted leading-relaxed">
                Özel bir klasör seçildiğinde kurulum paketlerine her uygulama için alt klasör yönlendirilir (NSIS: /D=, MSI: INSTALLDIR=).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {platformInfo.isDesktop && (
                <button
                  type="button"
                  onClick={() => void chooseCustomInstallDir()}
                  className="px-3.5 py-2 rounded-full bg-card border border-subtle hover:bg-card-hover text-xs font-semibold text-primary inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 accent-text" />
                  <span>Klasör Seç</span>
                </button>
              )}
              {customInstallDir && (
                <button
                  type="button"
                  onClick={() => void setCustomInstallDir('')}
                  className="px-3.5 py-2 rounded-full bg-card border border-subtle hover:bg-card-hover text-xs font-semibold text-secondary hover:text-primary inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Varsayılana Sıfırla</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Downloads Cache & Cleanup */}
        <div className="p-6 rounded-3xl bg-card border border-subtle space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-modal border border-subtle flex items-center justify-center shrink-0">
                <HardDrive className="w-6 h-6 accent-text" />
              </div>
              <div>
                <h2 className="text-base font-bold text-primary">İndirme Önbelleği ve Depolama</h2>
                <p className="text-xs text-muted">
                  İndirilen kurulum dosyalarının disk kullanımını inceleyin ve önbelleği yönetin.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isLoadingCache || !platformInfo.isDesktop}
                onClick={() => void refreshDownloadsCache()}
                className="px-3.5 py-2 rounded-full bg-inner border border-subtle hover:bg-card-hover text-xs font-semibold text-primary inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCache ? 'animate-spin' : ''}`} />
                <span>Yenile</span>
              </button>
              <button
                type="button"
                disabled={clearingCache || !platformInfo.isDesktop || !downloadsCache || downloadsCache.fileCount === 0}
                onClick={() => void handleClearCache()}
                className="px-4 py-2 rounded-full border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-xs font-bold text-red-400 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearingCache ? 'Temizleniyor...' : 'Önbelleği Temizle'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-inner/60 border border-subtle">
              <span className="text-[11px] text-muted block">Önbellekteki Dosya</span>
              <span className="text-sm font-bold font-mono tabular-nums text-primary mt-0.5 block">
                {platformInfo.isDesktop ? `${downloadsCache?.fileCount ?? 0} dosya` : 'Masaüstü modunda'}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-inner/60 border border-subtle">
              <span className="text-[11px] text-muted block">Toplam Disk Kullanımı</span>
              <span className="text-sm font-bold font-mono tabular-nums text-primary mt-0.5 block">
                {platformInfo.isDesktop ? formatBytes(downloadsCache?.totalBytes ?? 0) : '—'}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-inner/60 border border-subtle min-w-0">
              <span className="text-[11px] text-muted block">İndirme Klasörü</span>
              <span
                title={downloadsCache?.downloadsDir || platformInfo.downloadsDir || ''}
                className="text-[11px] font-mono text-secondary mt-1 block truncate"
              >
                {downloadsCache?.downloadsDir || platformInfo.downloadsDir || 'Tarayıcı İndirmeleri'}
              </span>
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-inner/60 border border-subtle cursor-pointer">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 accent-text shrink-0" />
                <span className="text-xs font-semibold text-primary">Her İndirmede Sor</span>
              </div>
              <span className="text-[11px] text-muted block leading-relaxed">
                Yeni uygulama indirirken kurulum paketinin nereye kaydedileceğini seçmenizi ister. Güncellemeler ve otomatik güncellemeler bundan etkilenmez; özel klasöre indirilen dosyalar otomatik silinmez.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={askDownloadDirOnInstall}
              aria-label="Her indirmede nereye indirileceğini sor"
              onClick={() => void setAskDownloadDirOnInstall(!askDownloadDirOnInstall)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                askDownloadDirOnInstall ? 'bg-accent border-accent' : 'bg-card border-subtle'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  askDownloadDirOnInstall ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </label>

          {cacheNotice && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{cacheNotice}</span>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-inner/60 border border-subtle space-y-3">
            <div className="flex items-start gap-2.5">
              <Gauge className="w-4 h-4 accent-text shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-primary block">İndirme Hız Limiti</span>
                <span className="text-[11px] text-muted block leading-relaxed">
                  Diğer ağ trafiğinizi etkilememek için Koru indirmelerine anlık bant genişliği sınırı koyabilirsiniz.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: 'Sınırsız', bps: 0 },
                { label: '2 MB/sn', bps: 2 * 1024 * 1024 },
                { label: '5 MB/sn', bps: 5 * 1024 * 1024 },
                { label: '10 MB/sn', bps: 10 * 1024 * 1024 },
                { label: '25 MB/sn', bps: 25 * 1024 * 1024 },
              ].map((preset) => {
                const selected = downloadSpeedLimitBps === preset.bps;
                return (
                  <button
                    key={preset.bps}
                    type="button"
                    onClick={() => void setDownloadSpeedLimit(preset.bps)}
                    style={selected ? { borderColor: 'var(--accent)' } : undefined}
                    className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer tabular-nums ${
                      selected
                        ? 'accent-subtle accent-text font-bold shadow-sm'
                        : 'border-subtle bg-card hover:bg-card-hover text-secondary hover:text-primary'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-inner/60 border border-subtle cursor-pointer">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-primary block">
                Kurulum Sonrası Yükleyiciyi Otomatik Sil
              </span>
              <span className="text-[11px] text-muted block leading-relaxed">
                Başarılı kurulum veya güncellemeden sonra indirilen setup dosyasını otomatik kaldırarak disk alanı tasarrufu sağlar.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoCleanInstallers}
              aria-label="Kurulum sonrası yükleyiciyi otomatik sil"
              onClick={() => void setAutoCleanInstallers(!autoCleanInstallers)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                autoCleanInstallers ? 'bg-accent border-accent' : 'bg-card border-subtle'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  autoCleanInstallers ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>

        {/* Permissions: Notifications & Autostart */}
        <div className="p-6 rounded-3xl bg-card border border-subtle space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-modal border border-subtle flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6 accent-text" />
              </div>
              <div>
                <h2 className="text-base font-bold text-primary">İzinler ve Başlangıç</h2>
                <p className="text-xs text-muted">
                  Bildirim tercihlerini ve sistem açılışında otomatik başlatma izinlerini yönetin.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void sendTestNotification()}
              className="px-4 py-2 rounded-full bg-inner border border-subtle hover:bg-card-hover hover:border-hover text-xs font-semibold text-primary inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto whitespace-nowrap shrink-0"
              title="Geçici bildirim testi"
            >
              <FlaskConical className="w-3.5 h-3.5 accent-text" />
              <span>Test Bildirimi Gönder</span>
              <span className="text-[10px] font-mono text-muted">(Geçici)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Notification Permissions */}
            <div className="p-4 rounded-2xl bg-inner/60 border border-subtle space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <BellRing className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-primary">Bildirim İzinleri</h3>
                    <p className="text-[11px] text-muted mt-0.5">
                      Sistem durumu:{' '}
                      <span
                        className={`font-semibold ${
                          notificationPermission === 'granted'
                            ? 'text-emerald-400'
                            : notificationPermission === 'denied'
                            ? 'text-red-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {permissionLabel}
                      </span>
                    </p>
                  </div>
                </div>

                {notificationPermission === 'default' && (
                  <button
                    type="button"
                    onClick={() => void requestNotificationPermission()}
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold btn-primary-koza hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    İzin İste
                  </button>
                )}
              </div>

              <div className="space-y-2.5 pt-2 border-t border-subtle">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-primary block">
                      Masaüstü Sistem Bildirimleri
                    </span>
                    <span className="text-[11px] text-muted block">
                      Yeni sürüm ve kurulum tamamlandığında işletim sistemi bildirimi göster.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={desktopNotificationsEnabled}
                    onClick={() => {
                      if (!desktopNotificationsEnabled && notificationPermission === 'default') {
                        void requestNotificationPermission();
                      } else {
                        setDesktopNotificationsEnabled(!desktopNotificationsEnabled);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                      desktopNotificationsEnabled
                        ? 'bg-accent border-accent'
                        : 'bg-card border-subtle'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        desktopNotificationsEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>

                <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-subtle/60">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-primary block">
                      Uygulama İçi Toast Uyarıları
                    </span>
                    <span className="text-[11px] text-muted block">
                      Ekranın sol alt köşesinde anlık bildirim kartları göster.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={inAppNotificationsEnabled}
                    onClick={() => setInAppNotificationsEnabled(!inAppNotificationsEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                      inAppNotificationsEnabled
                        ? 'bg-accent border-accent'
                        : 'bg-card border-subtle'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        inAppNotificationsEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </div>
            </div>

            {/* Autostart Permission */}
            <div className="p-4 rounded-2xl bg-inner/60 border border-subtle flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Power className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-primary">
                        Otomatik Başlatma İzni
                      </h3>
                      <p className="text-[11px] text-muted mt-0.5">
                        Durum:{' '}
                        <span
                          className={`font-semibold ${
                            autostartEnabled ? 'text-emerald-400' : 'text-secondary'
                          }`}
                        >
                          {autostartEnabled ? 'Açık' : 'Kapalı'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={autostartEnabled}
                    aria-label="Sistem açılışında otomatik başlat"
                    disabled={autostartUpdating}
                    onClick={() => void toggleAutostart(!autostartEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                      autostartUpdating ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                    } ${
                      autostartEnabled ? 'bg-accent border-accent' : 'bg-card border-subtle'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        autostartEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <p className="text-[11px] text-secondary leading-relaxed">
                  Etkinleştirildiğinde Koru bilgisayarınız açıldığında otomatik olarak başlar ve takip ettiğiniz uygulamalar için güncellemeleri kontrol eder.
                </p>

                <label className="flex items-center justify-between gap-3 cursor-pointer pt-2.5 border-t border-subtle/60">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-primary block">
                      Sistem Tepsisinde Başlat
                    </span>
                    <span className="text-[11px] text-muted block leading-relaxed">
                      Otomatik başlangıçta pencere doğrudan açılmaz; arka planda sistem tepsisinde başlatılır.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autostartInTray}
                    aria-label="Otomatik başlangıçta sistem tepsisinde başlat"
                    onClick={() => void setAutostartInTray(!autostartInTray)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                      autostartInTray ? 'bg-accent border-accent' : 'bg-card border-subtle'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        autostartInTray ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </div>

              <div className="pt-2 border-t border-subtle/60 flex items-center gap-2 text-[11px] text-muted">
                <Bell className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {platformInfo.isDesktop
                    ? autostartSupported
                      ? 'İşletim sistemi oturum açma kaydı ile doğrudan senkronize edilir.'
                      : 'Bu masaüstü platformunda sistem başlangıç kaydı desteklenmiyor.'
                    : 'Web önizleme modunda tercihiniz kaydedilir; masaüstü uygulamasında sistem açılışına uygulanır.'}
                </span>
              </div>
            </div>
          </div>

          {/* System Tray & Close Behavior */}
          <div className="p-4 rounded-2xl bg-inner/60 border border-subtle space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <PanelBottom className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-primary">Sistem Tepsisini Göster</h3>
                  <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                    Koru simgesini görev çubuğunun bildirim alanında gösterir; arka planda güncelleme denetimi ve bildirim gönderimini sürdürmenizi sağlar.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={showTrayIcon}
                aria-label="Sistem tepsisini göster"
                onClick={() => void setShowTrayIcon(!showTrayIcon)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer self-start sm:self-auto ${
                  showTrayIcon ? 'bg-accent border-accent' : 'bg-card border-subtle'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    showTrayIcon ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="pt-3 border-t border-subtle space-y-2.5">
              <div>
                <h4 className="text-xs font-bold text-primary">Uygulamayı Kapatırken</h4>
                <p className="text-[11px] text-muted mt-0.5">
                  Pencere kapatma butonuna basıldığında Koru&apos;nun nasıl davranacağını seçin.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    id: 'tray' as DesktopWindowCloseBehavior,
                    title: 'Sistem tepsisinde çalışmaya devam et',
                    desc: 'Pencere gizlenir, Koru arka planda güncellemeleri denetleyip bildirim göndermeyi sürdürür.',
                    icon: <Minimize2 className="w-3.5 h-3.5 accent-text shrink-0" />,
                  },
                  {
                    id: 'exit' as DesktopWindowCloseBehavior,
                    title: 'Uygulamadan çık',
                    desc: 'Kapat butonuna basıldığında arka plan süreci dahil Koru tamamen kapatılır.',
                    icon: <LogOut className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
                  },
                ].map((option) => {
                  const selected = closeBehavior === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => void setCloseBehavior(option.id)}
                      style={selected ? { borderColor: 'var(--accent)' } : undefined}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        selected
                          ? 'accent-subtle shadow-sm'
                          : 'border-subtle bg-card/60 hover:bg-card-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-xs text-primary flex items-center gap-1.5">
                          {option.icon}
                          <span>{option.title}</span>
                        </span>
                        {selected && <Check className="w-4 h-4 accent-text shrink-0" />}
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed">{option.desc}</p>
                    </button>
                  );
                })}
              </div>

              {closeBehavior === 'tray' && !showTrayIcon && (
                <p className="text-[11px] text-muted leading-relaxed">
                  Tepsi simgesi normalde gizli olsa da pencereyi arka plana küçülttüğünüzde erişebilmeniz için sistem tepsisi simgesi otomatik olarak görünür.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Install Profile Backup & Restore */}
        <div className="p-6 rounded-3xl bg-card border border-subtle space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-modal border border-subtle flex items-center justify-center shrink-0">
                <Download className="w-6 h-6 accent-text" />
              </div>
              <div>
                <h2 className="text-base font-bold text-primary">Kurulum Profili Yedekleme ve Geri Yükleme</h2>
                <p className="text-xs text-muted">
                  Kurulu uygulama listesini, sürüm kanallarını, oto-güncelleme ve bildirim tercihlerini <span className="font-mono text-secondary">.koruprofile.json</span> olarak aktarın.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.koruprofile.json"
                onChange={(e) => void handleImportProfileFile(e)}
                className="hidden"
              />
              <button
                type="button"
                onClick={handleExportProfile}
                className="px-4 py-2 rounded-full btn-primary-koza hover:opacity-90 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Profili Dışa Aktar</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-full bg-inner border border-subtle hover:bg-card-hover text-xs font-semibold text-primary inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 accent-text" />
                <span>Profili İçe Aktar</span>
              </button>
            </div>
          </div>

          {profileError && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          {profileNotice && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{profileNotice}</span>
            </div>
          )}

          {importedProfile && (
            <div className="p-4 rounded-2xl bg-inner/70 border border-subtle space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-bold text-primary">
                    İçe Aktarılan Profil ({formatTurkishDate(importedProfile.manifest.exportedAt)})
                  </h3>
                  <p className="text-[11px] text-muted font-mono tabular-nums">
                    Kayıtlı: {importedProfile.manifest.installedApps.length} uygulama ·{' '}
                    Takip: {importedProfile.manifest.followedAppIds.length} ·{' '}
                    Oto-Güncelleme: {importedProfile.manifest.autoUpdateAppIds.length}
                  </p>
                </div>

                {importedProfile.missingApps.length > 0 && (
                  <button
                    type="button"
                    disabled={restoringProfile}
                    onClick={() => void handleRestoreMissingApps()}
                    className="px-4 py-2 rounded-full btn-primary-koza hover:opacity-90 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <HardDriveDownload className="w-3.5 h-3.5" />
                    <span>Eksik Uygulamaları Kur ({importedProfile.missingApps.length})</span>
                  </button>
                )}
              </div>

              {importedProfile.missingApps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {importedProfile.missingApps.map((missing) => (
                    <span
                      key={missing.id}
                      className="px-2.5 py-1 rounded-full bg-card border border-subtle text-[11px] font-medium text-secondary"
                    >
                      {missing.name} <span className="font-mono text-muted">v{missing.latestVersion}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Design Language / UI Style Selection */}
        <div className="p-6 rounded-3xl bg-card border border-subtle space-y-4">
          <div>
            <h3 className="text-sm font-bold text-primary">Tasarım Dili ve Arayüz Teması</h3>
            <p className="text-xs text-muted">
              Gama mimarisi veya Windows tasarım standartlarına göre pencere ve ada düzenini özelleştirin.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: 'gama',
                name: 'Gama (Varsayılan)',
                desc: 'Antic Valley Gama UI: Yüzen 3 kapsül ada, ultra yumuşak köşeler ve akıcı mimari.',
                icon: <Layers className="w-4 h-4 accent-text" />,
              },
              {
                id: 'win11',
                name: 'Windows 11',
                desc: 'Windows 11 tarzı yumuşatılmış köşeler ve yüzen ada tasarımı.',
                icon: <AppWindow className="w-4 h-4 text-sky-400" />,
              },
              {
                id: 'win10',
                name: 'Windows 10',
                desc: 'Yuvarlatılmış köşeler ve yüzen ada anlayışı yok (Keskin & kenetli yapı).',
                icon: <Square className="w-4 h-4 text-zinc-400" />,
              },
            ].map((item) => {
              const isSelected = activeUIStyle === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setUIStyle(item.id as UIStyle)}
                  style={isSelected ? { borderColor: 'var(--accent)' } : undefined}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'accent-subtle shadow-sm'
                      : 'border-subtle bg-inner/60 hover:bg-card-hover'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-primary flex items-center gap-1.5">
                      {item.icon} {item.name}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 accent-text" />}
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">{item.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Theme Selection (including System Theme) */}
        <div className="p-6 rounded-3xl bg-card border border-subtle space-y-4">
          <div>
            <h3 className="text-sm font-bold text-primary">Arayüz Renk Teması</h3>
            <p className="text-xs text-muted">
              Sistem, Amoled, Koyu veya Açık renk düzenleri arasında geçiş yapın.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                id: 'system',
                name: 'Sistem Teması',
                desc: `İşletim sistemi (${resolvedTheme === 'light' ? 'Açık' : 'Koyu'})`,
                icon: <Monitor className="w-4 h-4 accent-text" />,
              },
              {
                id: 'amoled',
                name: 'Amoled (Saf Siyah)',
                desc: '#000000 Saf siyah arka plan',
                icon: <Sparkles className="w-4 h-4 accent-text" />,
              },
              {
                id: 'dark',
                name: 'Koyu Tema (Dark)',
                desc: '#0c0c0e Koyu füme tonlar',
                icon: <Moon className="w-4 h-4 text-blue-400" />,
              },
              {
                id: 'light',
                name: 'Açık Tema (Light)',
                desc: '#f4f4f5 Ferah ve aydınlık',
                icon: <Sun className="w-4 h-4 text-amber-500" />,
              },
            ].map((item) => {
              const isSelected = activeTheme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTheme(item.id as ThemeMode)}
                  style={isSelected ? { borderColor: 'var(--accent)' } : undefined}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'accent-subtle shadow-sm'
                      : 'border-subtle bg-inner/60 hover:bg-card-hover'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-primary flex items-center gap-1.5">
                      {item.icon} {item.name}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 accent-text" />}
                  </div>
                  <p className="text-[11px] text-muted">{item.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent Color Selection */}
        <div className="p-6 rounded-3xl bg-card border border-subtle space-y-4">
          <div>
            <h3 className="text-sm font-bold text-primary">Aksan Rengi (Özelleştirme)</h3>
            <p className="text-xs text-muted">
              Uygulamanın buton, vurgu ve simgelerinde kullanılacak aksan rengini belirleyin.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
            {(
              Object.entries(ACCENT_PALETTES) as [
                AccentColor,
                (typeof ACCENT_PALETTES)[AccentColor]
              ][]
            ).map(([key, pal]) => {
              const isSelected = activeAccent === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAccent(key)}
                  style={isSelected ? { borderColor: 'var(--accent)' } : undefined}
                  className={`p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3 cursor-pointer ${
                    isSelected
                      ? 'bg-inner/80 shadow-sm'
                      : 'border-subtle bg-inner/40 hover:bg-card-hover'
                  }`}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-xs"
                    style={{ backgroundColor: pal.accent }}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                  <div className="overflow-hidden">
                    <span className="text-xs font-bold text-primary block truncate">
                      {pal.name}
                    </span>
                    <span className="text-[10px] text-muted font-mono block">
                      {pal.accent}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-full flex justify-center">
        <Footer />
      </div>
    </div>
  );
}
