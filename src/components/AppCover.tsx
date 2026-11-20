import { useCachedMedia } from '../services/mediaCache';

interface AppCoverProps {
  name: string;
  coverUrl?: string;
  screenshots?: string[];
  iconUrl?: string;
  variant: 'card' | 'spotlight' | 'detail' | 'preview';
  grayscale?: boolean;
  className?: string;
}

const MASK_BY_VARIANT: Record<AppCoverProps['variant'], string> = {
  card: 'linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 58%, transparent 100%)',
  preview: 'linear-gradient(to bottom, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.7) 64%, transparent 100%)',
  spotlight:
    'linear-gradient(90deg, transparent 0%, transparent 24%, rgba(0,0,0,0.35) 52%, rgba(0,0,0,0.88) 100%)',
  detail:
    'linear-gradient(to bottom, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.34) 62%, transparent 100%)',
};

export function AppCover({
  name,
  coverUrl,
  screenshots,
  iconUrl,
  variant,
  grayscale = false,
  className = '',
}: AppCoverProps) {
  const normalizedCoverUrl = coverUrl?.trim() || undefined;
  const fallbackScreenshot = screenshots && screenshots.length > 0 ? screenshots[0] : undefined;

  const maxDimension =
    variant === 'detail' || variant === 'spotlight'
      ? 1280
      : variant === 'preview'
      ? 640
      : 720;

  const {
    src: coverSrc,
    failed: coverFailed,
    markFailed: markCoverFailed,
  } = useCachedMedia(normalizedCoverUrl, 0, {
    maxDimension,
    immediateFallback: true,
  });

  const shouldTryScreenshot = Boolean(fallbackScreenshot && (!normalizedCoverUrl || coverFailed));
  const {
    src: screenshotSrc,
    failed: screenshotFailed,
    markFailed: markScreenshotFailed,
  } = useCachedMedia(shouldTryScreenshot ? fallbackScreenshot : undefined, 0, {
    maxDimension,
    immediateFallback: true,
  });

  const activePhotoSrc =
    normalizedCoverUrl && coverSrc && !coverFailed
      ? coverSrc
      : shouldTryScreenshot && screenshotSrc && !screenshotFailed
      ? screenshotSrc
      : undefined;

  const markActivePhotoFailed =
    normalizedCoverUrl && coverSrc && !coverFailed ? markCoverFailed : markScreenshotFailed;

  const {
    src: ambientIconSrc,
    failed: ambientIconFailed,
    markFailed: markAmbientIconFailed,
  } = useCachedMedia(!activePhotoSrc ? iconUrl : undefined, 0, {
    maxDimension: 192,
    immediateFallback: true,
  });

  const hasCoverPhoto = Boolean(activePhotoSrc);
  const hasAmbientIcon = Boolean(!hasCoverPhoto && ambientIconSrc && !ambientIconFailed);

  const imagePositionClass =
    variant === 'spotlight'
      ? 'absolute inset-y-0 right-0 w-full lg:w-[70%] h-full object-cover object-top'
      : 'w-full h-full object-cover object-top';

  const photoOpacityClass =
    variant === 'detail'
      ? 'opacity-30'
      : variant === 'spotlight'
      ? 'opacity-45'
      : variant === 'preview'
      ? 'opacity-85'
      : 'opacity-75 group-hover:scale-[1.04] transition-transform duration-500 ease-out';

  const maskGradient = MASK_BY_VARIANT[variant];

  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden select-none ${
        grayscale ? 'app-icon-grayscale' : ''
      } ${className}`}
      style={{
        maskImage: maskGradient,
        WebkitMaskImage: maskGradient,
      }}
    >
      {/* Subtle accent atmospheric tint underneath */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(95% 85% at 85% 15%, rgba(var(--accent-rgb), 0.22) 0%, rgba(var(--accent-rgb), 0.05) 55%, transparent 100%)',
        }}
      />

      {hasCoverPhoto && activePhotoSrc ? (
        <img
          src={activePhotoSrc}
          alt={`${name} kapak görseli`}
          referrerPolicy="no-referrer"
          onError={markActivePhotoFailed}
          className={`${imagePositionClass} ${photoOpacityClass}`}
        />
      ) : hasAmbientIcon && ambientIconSrc ? (
        <img
          src={ambientIconSrc}
          alt=""
          referrerPolicy="no-referrer"
          onError={markAmbientIconFailed}
          className="w-full h-full object-cover scale-[1.85] blur-2xl opacity-35 saturate-150"
        />
      ) : null}

      {/* Extra left-side text protection for detail hero */}
      {variant === 'detail' && hasCoverPhoto && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(100deg, color-mix(in srgb, var(--bg-card) 82%, transparent) 0%, color-mix(in srgb, var(--bg-card) 45%, transparent) 48%, transparent 100%)',
          }}
        />
      )}
    </div>
  );
}
