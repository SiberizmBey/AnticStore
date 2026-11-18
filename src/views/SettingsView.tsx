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
} from 'lucide-react';
import { useTheme, ACCENT_PALETTES } from '../context/ThemeContext';
import { useStore } from '../context/StoreContext';
import { Footer } from '../components/Footer';
import { GitHubTokenCard } from '../components/GitHubTokenCard';
import type { AccentColor, InstallMode, ThemeMode, UIStyle } from '../types';

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
    setDesktopNotificationsEnabled,
    setInAppNotificationsEnabled,
    requestNotificationPermission,
    sendTestNotification,
    toggleAutostart,
  } = useStore();

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
                    onClick={() => void toggleAutostart(!autostartEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
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
