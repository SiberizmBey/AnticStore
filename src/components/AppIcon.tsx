import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';

interface AppIconProps {
  name: string;
  iconUrl?: string;
  className?: string;
  imageClassName?: string;
}

export function AppIcon({
  name,
  iconUrl,
  className = 'w-12 h-12 rounded-2xl bg-inner border border-subtle flex items-center justify-center overflow-hidden shrink-0',
  imageClassName = 'w-full h-full object-contain',
}: AppIconProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [iconUrl]);

  const initial = (name || 'A').trim().charAt(0).toUpperCase();

  return (
    <div className={className}>
      {iconUrl && !failed ? (
        <img
          src={iconUrl}
          alt={`${name} simgesi`}
          className={imageClassName}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center accent-subtle accent-text font-bold text-base">
          {initial || <Package className="w-5 h-5" />}
        </div>
      )}
    </div>
  );
}
