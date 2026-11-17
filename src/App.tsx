import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ThemeProvider } from './context/ThemeContext';
import { StoreProvider } from './context/StoreContext';
import { Navbar, type NavTab } from './components/Navbar';
import { StoreView } from './views/StoreView';
import { InstalledView } from './views/InstalledView';
import { SettingsView } from './views/SettingsView';
import { AppDetailModal } from './components/AppDetailModal';
import { SignalsPopover } from './components/SignalsPopover';
import { useStore } from './context/StoreContext';
import type { StoreApp } from './types';

function KoruShell() {
  const [currentTab, setCurrentTab] = useState<NavTab>('store');
  const [selectedApp, setSelectedApp] = useState<StoreApp | null>(null);
  const { apps } = useStore();
  const currentSelectedApp = selectedApp
    ? apps.find((app) => app.id === selectedApp.id) || selectedApp
    : null;

  const handleSelectAppById = (appId: string) => {
    const found = apps.find((app) => app.id === appId);
    if (found) {
      setSelectedApp(found);
      setCurrentTab('store');
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-primary flex flex-col transition-colors duration-200">
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
      />

      <main
        className={`flex-1 w-full mx-auto pt-2 ${
          currentTab === 'settings'
            ? 'px-3 sm:px-6 lg:px-8 pb-20'
            : 'px-3 sm:px-6 lg:px-8 pb-20'
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {currentTab === 'store' && (
              <StoreView onSelectApp={setSelectedApp} />
            )}
            {currentTab === 'installed' && (
              <InstalledView
                onSelectApp={setSelectedApp}
                onBrowseStore={() => setCurrentTab('store')}
              />
            )}
            {currentTab === 'settings' && <SettingsView />}
          </motion.div>
        </AnimatePresence>
      </main>

      <SignalsPopover onSelectAppById={handleSelectAppById} />

      <AnimatePresence>
        {currentSelectedApp && (
          <AppDetailModal
            app={currentSelectedApp}
            onClose={() => setSelectedApp(null)}
          />
        )}
      </AnimatePresence>
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
