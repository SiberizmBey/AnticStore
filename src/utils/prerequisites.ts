import type { AppPrerequisite, AppRequirements, PlatformInfo, StoreApp } from '../types';

export const VB_CABLE_PREREQUISITE: AppPrerequisite = {
  id: 'vb-cable',
  name: 'VB-CABLE Virtual Audio Device',
  description:
    'Lir uygulamasının ses efektlerini sanal mikrofon ve ses çıkış kanallarına aktarabilmesi için Windows ses sürücüsü gereklidir.',
  kind: 'driver',
  platform: 'windows',
  required: true,
  downloadUrl: 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack46.zip',
  fileName: 'VBCABLE_Driver_Pack46.zip',
  packageType: 'zip-exe',
  executableX64: 'VBCABLE_Setup_x64.exe',
  executableX86: 'VBCABLE_Setup.exe',
  silentArgs: ['-i', '-h'],
  interactiveArgs: ['-i'],
  requiresAdmin: true,
  websiteUrl: 'https://vb-audio.com/Cable/',
  rebootMayBeRequired: true,
};

const PREREQUISITE_PRESETS: Record<string, AppPrerequisite> = {
  'vb-cable': VB_CABLE_PREREQUISITE,
  vbcable: VB_CABLE_PREREQUISITE,
};

export function normalizePrerequisitesList(
  rawList?: Array<string | AppPrerequisite>
): AppPrerequisite[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  const result: AppPrerequisite[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    if (typeof item === 'string') {
      const key = item.trim().toLowerCase();
      const preset = PREREQUISITE_PRESETS[key];
      if (preset && !seen.has(preset.id)) {
        seen.add(preset.id);
        result.push({ ...preset });
      }
      continue;
    }

    if (!item || typeof item !== 'object') continue;
    const rawId = String(item.id || '').trim().toLowerCase();
    const preset = PREREQUISITE_PRESETS[rawId];
    const merged: AppPrerequisite = preset
      ? {
          ...preset,
          ...item,
          id: preset.id,
        }
      : {
          ...item,
          id: rawId || `prereq-${result.length + 1}`,
          name: String(item.name || item.id || 'Ek Bileşen'),
          downloadUrl: String(item.downloadUrl || ''),
        };

    if (!merged.id || seen.has(merged.id)) continue;
    if (!merged.downloadUrl && !merged.websiteUrl) continue;
    seen.add(merged.id);
    result.push(merged);
  }

  return result;
}

export function resolveAppPrerequisites(
  app: Pick<StoreApp, 'id' | 'prerequisites' | 'requirements'> & {
    requirements?: AppRequirements;
  }
): AppPrerequisite[] {
  const normalized = normalizePrerequisitesList(app.prerequisites);
  const seen = new Set(normalized.map((p) => p.id.toLowerCase()));

  const isLirApp = String(app.id || '').trim().toLowerCase() === 'com.anticvalley.lir';
  const mentionsVbCable = Boolean(
    app.requirements?.runtimes?.some((rt) => /vb[- ]?cable/i.test(String(rt || '')))
  );

  if ((isLirApp || mentionsVbCable) && !seen.has('vb-cable')) {
    normalized.push({ ...VB_CABLE_PREREQUISITE });
    seen.add('vb-cable');
  }

  return normalized;
}

export function isPrerequisiteSupportedOnPlatform(
  prereq: AppPrerequisite,
  platformInfo: PlatformInfo
): boolean {
  if (!prereq.platform || prereq.platform === 'universal') return true;
  if (platformInfo.platform === 'win32') return prereq.platform === 'windows';
  if (platformInfo.platform === 'darwin') return prereq.platform === 'macos';
  if (platformInfo.platform === 'linux') return prereq.platform === 'linux';
  // Web preview fallback: treat Windows prerequisites as applicable when user is likely on Windows
  if (typeof navigator !== 'undefined') {
    const ua = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
    if (ua.includes('mac')) return prereq.platform === 'macos';
    if (ua.includes('linux')) return prereq.platform === 'linux';
  }
  return prereq.platform === 'windows';
}
