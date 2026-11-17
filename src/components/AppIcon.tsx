import { Package } from 'lucide-react';
import { useCachedMedia } from '../services/mediaCache';

interface AppIconProps {
  name: string;
  iconUrl?: string;
  cacheKey?: string;
  className?: string;
  imageClassName?: string;
}

export function AppIcon({
  name,
  iconUrl,
  className = 'w-12 h-12 rounded-2xl bg-inner border border-subtle flex items-center justify-center overflow-hidden shrink-0',
  imageClassName = 'w-full h-full object-contain',
}: AppIconProps) {
  const { src: imageSrc, failed, markFailed } = useCachedMedia(iconUrl);
  const initial = (name || 'A').trim().charAt(0).toUpperCase();

  return (
    <div className={className}>
      {imageSrc && !failed ? (
        <img
          src={imageSrc}
          alt={`${name} simgesi`}
          className={imageClassName}
          decoding="sync"
          referrerPolicy="no-referrer"
          onError={markFailed}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center accent-subtle accent-text font-bold text-base">
          {initial || <Package className="w-5 h-5" />}
        </div>
      )}
    </div>
  );
}
