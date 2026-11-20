import { useStore } from '../context/StoreContext';
import { DownloadQueuePopover } from './DownloadQueuePopover';
import { NotificationPopover } from './NotificationPopover';
import { SignalsPopover } from './SignalsPopover';

interface BottomUtilityDockProps {
  onSelectAppById?: (appId: string) => void;
}

export function BottomUtilityDock({ onSelectAppById }: BottomUtilityDockProps) {
  const { unreadNotificationsCount, tasks } = useStore();
  const hasActiveTasks = Object.keys(tasks).length > 0;
  const hasAttention = unreadNotificationsCount > 0 || hasActiveTasks;

  return (
    <div className="koza-window-interactive fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2">
      {/* Tek Ek Kapsül: İndirme Bildirisi + Bildirimler */}
      <div className="relative group flex items-center gap-1.5 p-1.5 shrink-0">
        <div
          aria-hidden="true"
          className="koza-nav-capsule pointer-events-none absolute inset-0 rounded-full bg-island border border-subtle group-hover:border-hover transition-colors backdrop-blur-md shadow-sm"
        />
        <DownloadQueuePopover onSelectAppById={onSelectAppById} placement="top" />
        <NotificationPopover onSelectAppById={onSelectAppById} placement="top" />
      </div>

      {/* Sinyaller Kapsülü */}
      <SignalsPopover onSelectAppById={onSelectAppById} inline />
    </div>
  );
}
