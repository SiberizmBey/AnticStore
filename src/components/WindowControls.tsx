import { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';

interface WindowControlsProps {
  className?: string;
}

export function WindowControls({ className = '' }: WindowControlsProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const desktop = window.anticStoreDesktop;
    if (!desktop) return;

    const unsubscribe = desktop.onMaximizedChange(setIsMaximized);
    desktop.isMaximized().then(setIsMaximized).catch((error: unknown) => {
      console.error('Failed to read window state:', error);
    });

    return unsubscribe;
  }, []);

  if (!window.anticStoreDesktop) return null;

  const minimize = () => {
    window.anticStoreDesktop?.minimize().catch(console.error);
  };

  const toggleMaximize = () => {
    window.anticStoreDesktop?.toggleMaximize().then(setIsMaximized).catch(console.error);
  };

  const close = () => {
    window.anticStoreDesktop?.close().catch(console.error);
  };

  return (
    <div className={`koza-window-drag-region flex items-center gap-0.5 ${className}`}>
      <button
        type="button"
        title="Simge durumuna küçült"
        aria-label="Simge durumuna küçült"
        onClick={minimize}
        className="koza-window-interactive p-1.5 text-muted hover:text-primary hover:bg-card-hover rounded-full transition-colors cursor-pointer"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title={isMaximized ? 'Geri Yükle' : 'Ekranı Kapla'}
        aria-label={isMaximized ? 'Geri Yükle' : 'Ekranı Kapla'}
        onClick={toggleMaximize}
        className="koza-window-interactive p-1.5 text-muted hover:text-primary hover:bg-card-hover rounded-full transition-colors cursor-pointer"
      >
        <Square className="w-3 h-3" />
      </button>
      <button
        type="button"
        title="Kapat"
        aria-label="Pencereyi kapat"
        onClick={close}
        className="koza-window-interactive p-1.5 text-muted hover:text-white hover:bg-red-500/80 rounded-full transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
