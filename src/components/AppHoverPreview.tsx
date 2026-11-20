import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, HardDrive, Cpu, ShieldCheck, ShieldAlert, ArrowRight, Sparkles, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { AppIcon } from './AppIcon';
import { AppCover } from './AppCover';
import { useStore } from '../context/StoreContext';
import {
  checkInstalledMirrorStatus,
  formatBytes,
  formatDownloadCount,
  formatTurkishDate,
  isUpdateAvailable,
  pickPreferredAsset,
} from '../utils/semver';
import { evaluateCompatibility, inferAppRequirements } from '../utils/compatibility';
import type { StoreApp } from '../types';

interface AppHoverPreviewProps {
  app: StoreApp;
  anchorRect: DOMRect;
}

const PREVIEW_WIDTH = 368;
const MARGIN_PX = 14;
const VIEWPORT_PAD = 14;

export function AppHoverPreview({ app, anchorRect }: AppHoverPreviewProps) {
  const { installedMap, platformInfo, getAppChannel, getChannelLatestRelease } = useStore();
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const installed = installedMap[app.id];
  const channel = getAppChannel(app.id);
  const effectiveRelease = getChannelLatestRelease(app) || app.latestRelease;
  const effectiveVersion = effectiveRelease?.version || app.latestVersion;
  const isDownloadable = app.downloadable !== false;
  const isComingSoon = !isDownloadable || Boolean(app.comingSoon);
  const hasUpdate = Boolean(installed && isUpdateAvailable(installed.version, effectiveVersion));
  const mirrorStatus = checkInstalledMirrorStatus(
    installed?.version,
    app.latestVersion,
    app.releases,
    app.syncError
  );
  const preferredAsset = effectiveRelease
    ? pickPreferredAsset(effectiveRelease.assets, platformInfo.platform)
    : null;
  const { requirements, installerBytes } = useMemo(
    () => inferAppRequirements(app, effectiveRelease, platformInfo.platform),
    [app, effectiveRelease, platformInfo.platform]
  );
  const compatibility = useMemo(
    () => evaluateCompatibility(app, platformInfo, effectiveRelease),
    [app, platformInfo, effectiveRelease]
  );

  const releaseNotesSnippet = useMemo(() => {
    const raw = (effectiveRelease?.notes || '').trim();
    if (!raw) return '';
    return raw
      .replace(/^#+\s*/gm, '')
      .replace(/\r\n/g, '\n')
      .trim();
  }, [effectiveRelease?.notes]);

  const estimatedHeight =
    330 +
    (releaseNotesSnippet ? 88 : 0);

  const position = useMemo(() => {
    const spaceRight = viewport.width - anchorRect.right;
    const spaceLeft = anchorRect.left;

    let left: number;
    let slideFromX = 0;
    let slideFromY = 0;

    if (spaceRight >= PREVIEW_WIDTH + MARGIN_PX + VIEWPORT_PAD) {
      left = anchorRect.right + MARGIN_PX;
      slideFromX = -8;
    } else if (spaceLeft >= PREVIEW_WIDTH + MARGIN_PX + VIEWPORT_PAD) {
      left = anchorRect.left - PREVIEW_WIDTH - MARGIN_PX;
      slideFromX = 8;
    } else {
      left = Math.max(
        VIEWPORT_PAD,
        Math.min(
          viewport.width - PREVIEW_WIDTH - VIEWPORT_PAD,
          anchorRect.left + anchorRect.width / 2 - PREVIEW_WIDTH / 2
        )
      );
      slideFromY = 6;
    }

    let top = anchorRect.top - 4;
    if (top + estimatedHeight > viewport.height - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, viewport.height - estimatedHeight - VIEWPORT_PAD);
    }
    if (top < VIEWPORT_PAD) {
      top = VIEWPORT_PAD;
    }

    return { left, top, slideFromX, slideFromY };
  }, [anchorRect, viewport.width, viewport.height, estimatedHeight]);

  if (typeof document === 'undefined') return null;

  const downloadSizeLabel =
    installerBytes && installerBytes > 0
      ? formatBytes(installerBytes)
      : preferredAsset && preferredAsset.size > 0
      ? formatBytes(preferredAsset.size)
      : '—';

  const totalDownloadsLabel =
    typeof app.totalDownloads === 'number' && app.totalDownloads > 0
      ? formatDownloadCount(app.totalDownloads)
      : null;

  return createPortal(
    <motion.div
      role="tooltip"
      aria-hidden="true"
      initial={{
        opacity: 0,
        scale: 0.96,
        x: position.slideFromX,
        y: position.slideFromY,
        filter: 'blur(4px)',
      }}
      animate={{ opacity: 1, scale: 1, x: 0, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.97, filter: 'blur(3px)' }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'fixed',
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${PREVIEW_WIDTH}px`,
        zIndex: 80,
      }}
      className="pointer-events-none select-none rounded-3xl bg-modal/95 backdrop-blur-xl border border-subtle shadow-2xl overflow-hidden"
    >
      {/* Top Edge-to-Edge Cover Header */}
      <AppCover
        name={app.name}
        coverUrl={app.coverUrl}
        screenshots={app.screenshots}
        iconUrl={app.iconUrl}
        variant="preview"
        grayscale={!isDownloadable}
        className="h-28 w-full shrink-0"
      />

      <div className="relative z-10 px-4 pb-4 -mt-7 space-y-3">
        {/* Compact Header Overlapping Cover Bottom */}
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-end gap-2.5 min-w-0">
            <AppIcon
              name={app.name}
              iconUrl={app.iconUrl}
              cacheKey={app.syncedAt}
              grayscale={!isDownloadable}
              className="w-11 h-11 rounded-2xl bg-modal border border-subtle p-1 shadow-lg flex items-center justify-center overflow-hidden shrink-0"
              imageClassName="w-full h-full object-contain rounded-xl"
            />
            <div className="min-w-0 pt-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <h4 className="text-sm font-bold text-primary truncate">{app.name}</h4>
                {mirrorStatus.isUnofficial ? (
                  <span className="text-[10px] font-bold text-red-400 shrink-0">Resmi Dışı</span>
                ) : isComingSoon ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-400 shrink-0">
                    <Clock className="w-2.5 h-2.5" /> Yakında
                  </span>
                ) : hasUpdate ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold accent-text shrink-0">
                    <Sparkles className="w-2.5 h-2.5" /> Güncelleme
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-muted truncate">
                {app.developer} · {app.category}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0 pb-0.5">
            <span className="text-xs font-mono font-bold text-primary tabular-nums block">
              v{effectiveVersion}
            </span>
            {channel !== 'stable' && (
              <span className="text-[10px] font-semibold accent-text uppercase tracking-wider block">
                {channel}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-secondary leading-relaxed line-clamp-3">
          {app.description || app.summary}
        </p>

        {/* Smart Requirements Quick Strip */}
        <div className="grid grid-cols-2 gap-1.5 p-2.5 rounded-2xl bg-inner/80 border border-subtle text-[11px]">
          <div className="flex items-center justify-between gap-2 px-1.5 py-0.5">
            <span className="text-muted">Paket Boyutu</span>
            <span className="font-mono font-semibold text-primary tabular-nums">
              {downloadSizeLabel}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 px-1.5 py-0.5">
            <span className="text-muted">RAM / Disk</span>
            <span className="font-mono font-semibold text-primary tabular-nums">
              {requirements.minRamGb || 2}GB / {requirements.minDiskMb ? `${Math.round(requirements.minDiskMb)}MB` : '—'}
            </span>
          </div>
          <div className="col-span-2 flex items-center justify-between gap-2 px-1.5 pt-1 border-t border-subtle/60">
            <span className="text-muted inline-flex items-center gap-1">
              <Cpu className="w-3 h-3 accent-text shrink-0" />
              <span>Minimum OS</span>
            </span>
            <span className="font-mono font-semibold text-secondary truncate">
              {requirements.minOsVersion || 'Windows 10 / 11 (64-bit)'}
            </span>
          </div>
        </div>

        {/* Latest Release Notes Snippet */}
        {releaseNotesSnippet && (
          <div className="p-2.5 rounded-2xl bg-inner/60 border border-subtle space-y-1">
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-muted">
              <span className="font-semibold text-secondary">v{effectiveVersion} Sürüm Notları</span>
              <span>{formatTurkishDate(effectiveRelease?.publishedAt || app.releaseDate)}</span>
            </div>
            <p className="text-[11px] text-secondary leading-snug line-clamp-3 whitespace-pre-line">
              {releaseNotesSnippet}
            </p>
          </div>
        )}

        {/* Footer Cue */}
        <div className="pt-2 border-t border-subtle flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`inline-flex items-center gap-1 font-semibold truncate ${
                compatibility.status === 'compatible'
                  ? 'text-emerald-400'
                  : compatibility.status === 'partial'
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            >
              {compatibility.status === 'compatible' ? (
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{compatibility.badgeLabel}</span>
            </span>
            {totalDownloadsLabel && (
              <span className="inline-flex items-center gap-1 font-mono tabular-nums text-muted shrink-0">
                <Download className="w-3 h-3" />
                <span>{totalDownloadsLabel}</span>
              </span>
            )}
          </div>

          <span className="inline-flex items-center gap-1 font-semibold accent-text shrink-0">
            <HardDrive className="w-3 h-3 hidden" />
            <span>Detayları Aç</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </motion.div>,
    document.body
  );
}
