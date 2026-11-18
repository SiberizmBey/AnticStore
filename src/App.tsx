import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ThemeProvider } from './context/ThemeContext';
import { StoreProvider, useStore } from './context/StoreContext';
import { Navbar, type NavTab } from './components/Navbar';
import { StoreView } from './views/StoreView';
import { InstalledView } from './views/InstalledView';
import { SettingsView } from './views/SettingsView';
import { AppDetailView } from './views/AppDetailView';
import { SignalsPopover } from './components/SignalsPopover';
import { ToastContainer } from './components/ToastContainer';
import { checkInstalledMirrorStatus, isUpdateAvailable } from './utils/semver';
import type { StoreApp } from './types';

function KoruShell() {
  const [currentTab, setCurrentTab] = useState<NavTab>('store');
  const [selectedApp, setSelectedApp] = useState<StoreApp | null>(null);
  const { apps, installedMap } = useStore();
  const spotlightRef = useRef<HTMLDivElement | null>(null);

  const currentSelectedApp = selectedApp
    ? apps.find((app) => app.id === selectedApp.id) || selectedApp
    : null;

  const detailInstalled = currentSelectedApp ? installedMap[currentSelectedApp.id] : undefined;
  const detailIsComingSoon = currentSelectedApp
    ? currentSelectedApp.downloadable === false || Boolean(currentSelectedApp.comingSoon)
    : false;
  const detailHasUpdate = Boolean(
    currentSelectedApp &&
      detailInstalled &&
      isUpdateAvailable(detailInstalled.version, currentSelectedApp.latestVersion)
  );
  const detailIsNew = Boolean(currentSelectedApp?.new) && !detailIsComingSoon;
  const detailMirrorStatus = currentSelectedApp
    ? checkInstalledMirrorStatus(
        detailInstalled?.version,
        currentSelectedApp.latestVersion,
        currentSelectedApp.releases,
        currentSelectedApp.syncError
      )
    : { isUnofficial: false, isAheadOfOfficial: false, isMissingFromMirrors: false };

  const activeSpotlightKind: 'danger' | 'accent' | null = currentSelectedApp
    ? detailMirrorStatus.isUnofficial
      ? 'danger'
      : !detailIsComingSoon && (detailIsNew || detailHasUpdate)
      ? 'accent'
      : null
    : null;

  useEffect(() => {
    if (!activeSpotlightKind) return;
    const handlePointerMove = (e: PointerEvent) => {
      const el = spotlightRef.current;
      if (!el) return;
      el.style.setProperty('--spot-x', `${e.clientX}px`);
      el.style.setProperty('--spot-y', `${e.clientY}px`);
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [activeSpotlightKind]);

  const handleSelectTab = (tab: NavTab) => {
    setSelectedApp(null);
    setCurrentTab(tab);
  };

  const handleSelectAppById = (appId: string) => {
    const found = apps.find((app) => app.id === appId);
    if (found) {
      setSelectedApp(found);
      setCurrentTab('store');
    }
  };

  const pageKey = currentSelectedApp ? `detail:${currentSelectedApp.id}` : currentTab;
  const backLabel = currentTab === 'installed' ? 'Yüklü Uygulamalara Dön' : 'Mağazaya Dön';

  return (
    <div className="relative min-h-screen text-primary flex flex-col transition-colors duration-200">
      {activeSpotlightKind && (
        <div
          ref={spotlightRef}
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
        >
          <div
            className={`absolute inset-0 transition-opacity duration-300 ${
              activeSpotlightKind === 'danger'
                ? 'page-danger-spotlight-aura'
                : 'page-update-spotlight-aura'
            }`}
          />
          <div
            className={`absolute inset-0 transition-opacity duration-300 ${
              activeSpotlightKind === 'danger'
                ? 'page-danger-spotlight-cursor'
                : 'page-update-spotlight-cursor'
            }`}
          />
        </div>
      )}

      <Navbar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onSelectAppById={handleSelectAppById}
      />

      <main className="relative z-10 flex-1 w-full mx-auto pt-2 px-3 sm:px-6 lg:px-8 pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={pageKey}
            initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {currentSelectedApp ? (
              <AppDetailView
                app={currentSelectedApp}
                backLabel={backLabel}
                onBack={() => setSelectedApp(null)}
              />
            ) : currentTab === 'store' ? (
              <StoreView onSelectApp={setSelectedApp} />
            ) : currentTab === 'installed' ? (
              <InstalledView
                onSelectApp={setSelectedApp}
                onBrowseStore={() => handleSelectTab('store')}
              />
            ) : (
              <SettingsView />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <ToastContainer onSelectAppById={handleSelectAppById} />
      <SignalsPopover onSelectAppById={handleSelectAppById} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <KoruShell />
      </StoreProvider>
    </ThemeProvider>
  );
}
