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
  } = useStore();

  return (
    <div className="w-full flex flex-col justify-between min-h-full">
      <div className="max-w-4xl w-full mx-auto space-y-6 mb-8">
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
