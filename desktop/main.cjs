const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, safeStorage, shell } = require('electron');

const STORE_APP_ID = 'com.anticvalley.koru';
const LEGACY_STORE_APP_ID = 'com.anticvalley.store';
const REGISTRY_FILE = () => path.join(app.getPath('userData'), 'installed-apps.json');
const DOWNLOADS_DIR = () => path.join(app.getPath('userData'), 'downloads');
const GITHUB_TOKEN_FILE = () => path.join(app.getPath('userData'), 'github-token.enc');
const DESKTOP_SETTINGS_FILE = () => path.join(app.getPath('userData'), 'desktop-settings.json');
const DEFAULT_DESKTOP_SETTINGS = {
  showTrayIcon: true,
  autostartInTray: false,
  closeBehavior: 'tray',
  autoCleanInstallers: false,
  askDownloadDirOnInstall: false,
  downloadSpeedLimitBps: 0,
  customInstallDir: '',
};

let mainWindow = null;
let tray = null;
let isQuitting = false;
let pendingDeepLink = null;

app.setName('Koru');
if (process.platform === 'win32') {
  app.setAppUserModelId(STORE_APP_ID);
}

function resolveAppIconPath(preferIco = false) {
  const baseDir = path.join(app.getAppPath(), app.isPackaged ? 'dist' : 'public', 'assets', 'img');
  const candidates = preferIco
    ? ['icon.ico', 'icon.png', 'koru.png']
    : ['icon.png', 'icon.ico', 'koru.png'];
  for (const file of candidates) {
    const full = path.join(baseDir, file);
    if (fs.existsSync(full)) return full;
  }
  return path.join(baseDir, 'icon.png');
}

function ensureWindowsAppUserModelRegistration() {
  if (process.platform !== 'win32') return;
  const regKey = `HKCU\\Software\\Classes\\AppUserModelId\\${STORE_APP_ID}`;
  const iconPath = resolveAppIconPath(true);
  execFile('reg.exe', ['add', regKey, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'Koru', '/f'], () => {});
  if (iconPath && fs.existsSync(iconPath)) {
    execFile('reg.exe', ['add', regKey, '/v', 'IconUri', '/t', 'REG_SZ', '/d', iconPath, '/f'], () => {});
  }
}

let currentDownloadSpeedLimitBps = 0;

function normalizeDesktopSettings(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const rawLimit = Number(obj.downloadSpeedLimitBps);
  return {
    showTrayIcon: typeof obj.showTrayIcon === 'boolean' ? obj.showTrayIcon : DEFAULT_DESKTOP_SETTINGS.showTrayIcon,
    autostartInTray:
      typeof obj.autostartInTray === 'boolean' ? obj.autostartInTray : DEFAULT_DESKTOP_SETTINGS.autostartInTray,
    closeBehavior: obj.closeBehavior === 'exit' ? 'exit' : 'tray',
    autoCleanInstallers:
      typeof obj.autoCleanInstallers === 'boolean'
        ? obj.autoCleanInstallers
        : DEFAULT_DESKTOP_SETTINGS.autoCleanInstallers,
    askDownloadDirOnInstall:
      typeof obj.askDownloadDirOnInstall === 'boolean'
        ? obj.askDownloadDirOnInstall
        : DEFAULT_DESKTOP_SETTINGS.askDownloadDirOnInstall,
    downloadSpeedLimitBps: Number.isFinite(rawLimit) && rawLimit > 0 ? Math.round(rawLimit) : 0,
    customInstallDir: typeof obj.customInstallDir === 'string' ? obj.customInstallDir.trim() : '',
  };
}

function readDesktopSettings() {
  try {
    const raw = fs.readFileSync(DESKTOP_SETTINGS_FILE(), 'utf8');
    const normalized = normalizeDesktopSettings(JSON.parse(raw));
    currentDownloadSpeedLimitBps = normalized.downloadSpeedLimitBps;
    return normalized;
  } catch {
    return { ...DEFAULT_DESKTOP_SETTINGS };
  }
}

function writeDesktopSettings(patch) {
  const current = readDesktopSettings();
  const next = normalizeDesktopSettings({ ...current, ...(patch || {}) });
  currentDownloadSpeedLimitBps = next.downloadSpeedLimitBps;
  try {
    fs.mkdirSync(path.dirname(DESKTOP_SETTINGS_FILE()), { recursive: true });
    fs.writeFileSync(DESKTOP_SETTINGS_FILE(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist desktop settings:', err);
  }
  return next;
}

function execFileAsync(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

const WIN_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const WIN_STARTUP_APPROVED_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const WIN_RUN_VALUE_NAME = 'Koru';

function parseRegQueryValues(stdout) {
  const results = [];
  for (const rawLine of String(stdout || '').split(/\r?\n/)) {
    const match = rawLine.match(/^\s{2,}(.+?)\s{2,}(REG_[A-Z0-9_]+)(?:\s{2,}(.*))?$/);
    if (!match) continue;
    results.push({
      name: match[1].trim(),
      type: match[2].trim(),
      data: (match[3] || '').trim(),
    });
  }
  return results;
}

function isKoruStartupEntry(name, data) {
  const normName = String(name || '').trim().toLowerCase();
  const normData = String(data || '').trim().toLowerCase();
  const resolvedAppPath = path.resolve(app.getAppPath()).toLowerCase();
  const resolvedExecPath = String(process.execPath || '').toLowerCase();

  if (
    normName === 'koru' ||
    normName === 'electron.app.koru' ||
    normName === 'com.anticvalley.koru' ||
    normName === 'anticstore' ||
    normName === 'electron.app.anticstore' ||
    normName.startsWith('electron.app.koru')
  ) {
    return true;
  }

  if (!app.isPackaged && resolvedAppPath && normData.includes(resolvedAppPath)) {
    return true;
  }
  if (app.isPackaged && resolvedExecPath && normData.includes(resolvedExecPath)) {
    return true;
  }
  if (normData.includes('com.anticvalley.koru')) {
    return true;
  }
  return false;
}

function buildWindowsStartupCommand(autostartInTray) {
  const trayFlag = autostartInTray ? ' --tray' : '';
  if (!app.isPackaged) {
    return `"${process.execPath}" "${path.resolve(app.getAppPath())}"${trayFlag}`;
  }
  return `"${process.execPath}"${trayFlag}`;
}

async function queryWindowsStartupMatches() {
  const [runRes, approvedRes] = await Promise.all([
    execFileAsync('reg.exe', ['query', WIN_RUN_KEY]),
    execFileAsync('reg.exe', ['query', WIN_STARTUP_APPROVED_KEY]),
  ]);

  const runValues = runRes.error ? [] : parseRegQueryValues(runRes.stdout);
  const approvedValues = approvedRes.error ? [] : parseRegQueryValues(approvedRes.stdout);

  const runMatches = runValues.filter((item) => isKoruStartupEntry(item.name, item.data));
  const matchedNames = new Set(runMatches.map((m) => m.name.toLowerCase()));
  const approvedMatches = approvedValues.filter(
    (item) => matchedNames.has(item.name.toLowerCase()) || isKoruStartupEntry(item.name, '')
  );

  return { runMatches, approvedMatches };
}

async function deleteWindowsStartupEntry(key, valueName) {
  await execFileAsync('reg.exe', ['delete', key, '/v', valueName, '/f']);
}

async function removeAllWindowsKoruStartupEntries() {
  const { runMatches, approvedMatches } = await queryWindowsStartupMatches();
  for (const item of runMatches) {
    await deleteWindowsStartupEntry(WIN_RUN_KEY, item.name);
  }
  for (const item of approvedMatches) {
    await deleteWindowsStartupEntry(WIN_STARTUP_APPROVED_KEY, item.name);
  }
  // Ensure canonical value name is cleared as well
  await deleteWindowsStartupEntry(WIN_RUN_KEY, WIN_RUN_VALUE_NAME);
  await deleteWindowsStartupEntry(WIN_STARTUP_APPROVED_KEY, WIN_RUN_VALUE_NAME);
}

async function cleanupDuplicateWindowsStartupEntries() {
  if (process.platform !== 'win32') return;
  const { runMatches, approvedMatches } = await queryWindowsStartupMatches();

  if (runMatches.length === 0) {
    // Clear any orphaned StartupApproved entries if no active Run entry exists
    for (const item of approvedMatches) {
      await deleteWindowsStartupEntry(WIN_STARTUP_APPROVED_KEY, item.name);
    }
    return;
  }

  const hasSingleCanonical = runMatches.length === 1 && runMatches[0].name === WIN_RUN_VALUE_NAME;
  if (hasSingleCanonical) {
    // Remove only stale non-canonical StartupApproved leftovers if any
    for (const item of approvedMatches) {
      if (item.name !== WIN_RUN_VALUE_NAME) {
        await deleteWindowsStartupEntry(WIN_STARTUP_APPROVED_KEY, item.name);
      }
    }
    return;
  }

  // Multiple or legacy-named startup entries exist: consolidate into one canonical entry
  const settings = readDesktopSettings();
  const cmd = buildWindowsStartupCommand(settings.autostartInTray);
  await removeAllWindowsKoruStartupEntries();
  await execFileAsync('reg.exe', ['add', WIN_RUN_KEY, '/v', WIN_RUN_VALUE_NAME, '/t', 'REG_SZ', '/d', cmd, '/f']);
}

function isAutostartSupported() {
  return process.platform === 'win32' || process.platform === 'darwin';
}

async function readAutostartEnabled() {
  if (!isAutostartSupported()) return false;
  if (process.platform === 'win32') {
    const { runMatches, approvedMatches } = await queryWindowsStartupMatches();
    if (runMatches.length === 0) return false;
    const approvedMap = new Map(approvedMatches.map((m) => [m.name.toLowerCase(), m.data]));
    return runMatches.some((item) => {
      const approvedHex = approvedMap.get(item.name.toLowerCase());
      // In StartupApproved REG_BINARY, leading byte 03 means disabled in Task Manager; 02/06/absent means enabled
      if (approvedHex && /^03/i.test(approvedHex)) {
        return false;
      }
      return true;
    });
  }

  try {
    const status = app.getLoginItemSettings();
    return Boolean(status?.openAtLogin);
  } catch {
    return false;
  }
}

async function applyAutostartSettings(enabled, autostartInTray) {
  if (!isAutostartSupported()) return false;

  if (process.platform === 'win32') {
    await removeAllWindowsKoruStartupEntries();
    if (enabled) {
      const cmd = buildWindowsStartupCommand(autostartInTray);
      await execFileAsync('reg.exe', [
        'add',
        WIN_RUN_KEY,
        '/v',
        WIN_RUN_VALUE_NAME,
        '/t',
        'REG_SZ',
        '/d',
        cmd,
        '/f',
      ]);
    }
    return readAutostartEnabled();
  }

  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    openAsHidden: Boolean(autostartInTray),
  });
  return readAutostartEnabled();
}

function showAndFocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow({ showImmediately: true }).catch((error) => {
      console.error('Failed to show Koru window:', error);
    });
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
  syncTrayVisibility();
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    {
      label: "Koru'yu Aç",
      click: () => showAndFocusMainWindow(),
    },
    {
      label: 'Güncellemeleri Denetle',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('store:request-sync');
        }
      },
    },
    { type: 'separator' },
    {
      label: "Koru'dan Çık",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function ensureTray() {
  if (tray && !tray.isDestroyed()) {
    updateTrayMenu();
    return tray;
  }

  const iconPath = resolveAppIconPath(process.platform === 'win32');
  let trayIcon = nativeImage.createFromPath(iconPath);
  if (process.platform !== 'win32' && !trayIcon.isEmpty()) {
    trayIcon = trayIcon.resize({ width: 18, height: 18 });
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Koru — Uygulama Mağazası');
  tray.on('click', () => {
    showAndFocusMainWindow();
  });
  tray.on('double-click', () => {
    showAndFocusMainWindow();
  });
  updateTrayMenu();
  return tray;
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
  tray = null;
}

function syncTrayVisibility() {
  const settings = readDesktopSettings();
  const isHiddenInBackground =
    !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible();
  if (settings.showTrayIcon || isHiddenInBackground) {
    ensureTray();
  } else {
    destroyTray();
  }
}

const activeDownloads = new Map();
let cachedGitHubToken;

function getWindowFromEvent(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    throw new Error('The application window is no longer available.');
  }
  return window;
}

function sendProgress(sender, payload) {
  if (!sender.isDestroyed()) {
    sender.send('store:task-progress', payload);
  }
}

async function readLocalRegistry() {
  try {
    const raw = await fsp.readFile(REGISTRY_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalRegistry(records) {
  await fsp.mkdir(path.dirname(REGISTRY_FILE()), { recursive: true });
  await fsp.writeFile(REGISTRY_FILE(), JSON.stringify(records, null, 2), 'utf8');
}

async function getGitHubToken() {
  if (cachedGitHubToken !== undefined) return cachedGitHubToken;

  try {
    const encryptedToken = await fsp.readFile(GITHUB_TOKEN_FILE());
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Güvenli kimlik bilgisi saklama bu sistemde kullanılamıyor.');
    }
    cachedGitHubToken = safeStorage.decryptString(encryptedToken);
    return cachedGitHubToken;
  } catch (error) {
    if (error.code === 'ENOENT') {
      cachedGitHubToken = process.env.GITHUB_TOKEN || '';
      return cachedGitHubToken;
    }
    throw error;
  }
}

function scanWindowsUninstallRegistry() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve([]);
      return;
    }

    const psScript = `
$paths = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$items = Get-ItemProperty $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -and ($_.UninstallString -or $_.QuietUninstallString) } |
  Select-Object PSChildName, DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString, QuietUninstallString, DisplayIcon
$items | ConvertTo-Json -Compress
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { timeout: 6000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) {
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isSelfStoreApp(appId, name) {
  const normId = String(appId || '').trim().toLowerCase();
  const normName = normalizeName(name);
  return (
    normId === STORE_APP_ID ||
    normId === LEGACY_STORE_APP_ID ||
    normName === 'koru' ||
    normName === 'anticstore'
  );
}

function matchWindowsRegistryEntry(winEntries, appId, name) {
  const idShort = normalizeName(String(appId || '').split('.').pop());
  const normName = normalizeName(name);
  const selfApp = isSelfStoreApp(appId, name);

  return winEntries.find((entry) => {
    const child = normalizeName(entry.PSChildName);
    const display = normalizeName(entry.DisplayName);
    if (appId && child.includes(normalizeName(appId))) return true;
    if (selfApp) {
      if (
        child.includes(normalizeName(STORE_APP_ID)) ||
        child.includes(normalizeName(LEGACY_STORE_APP_ID)) ||
        display === 'koru' ||
        display === 'anticstore'
      ) {
        return true;
      }
    }
    if (normName && display.startsWith(normName)) {
      const suffix = display.slice(normName.length);
      if (!suffix || /^\d+$/.test(suffix)) return true;
    }
    if (idShort && idShort.length >= 8 && (display === idShort || child.includes(idShort))) return true;
    return false;
  });
}

function findExecutableInDir(dirPath, appName) {
  if (!dirPath || !fs.existsSync(dirPath)) return undefined;
  try {
    const files = fs.readdirSync(dirPath);
    const normName = normalizeName(appName);
    const exeFiles = files.filter((f) => f.toLowerCase().endsWith('.exe') && !f.toLowerCase().includes('uninstall'));
    const exact = exeFiles.find((f) => normalizeName(f.replace(/\.exe$/i, '')) === normName);
    if (exact) return path.join(dirPath, exact);
    if (exeFiles.length > 0) return path.join(dirPath, exeFiles[0]);
  } catch {
    return undefined;
  }
  return undefined;
}

function findExecutableFromDisplayIcon(displayIcon) {
  const value = String(displayIcon || '').trim();
  const match = value.match(/^"([^"]+\.exe)"/i) || value.match(/^(.+?\.exe)(?:,\s*-?\d+)?$/i);
  const executablePath = match?.[1];
  return executablePath && fs.existsSync(executablePath) ? executablePath : undefined;
}

function findInstallLocation(installLocation, uninstallString) {
  if (installLocation) return installLocation;
  const parsed = parseUninstallCommand(uninstallString);
  if (!parsed?.exe || /^(msiexec|rundll32|regsvr32|cmd|powershell|wscript)\.exe$/i.test(path.basename(parsed.exe))) {
    return undefined;
  }
  const directory = path.dirname(parsed.exe);
  return fs.existsSync(directory) ? directory : undefined;
}

function runCommandAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: Boolean(options.silent),
      shell: Boolean(options.shell),
      ...options.spawnOptions,
    });

    child.on('error', (err) => reject(err));
    child.on('exit', (code) => {
      if (code === 0 || code === null) {
        resolve(code);
      } else {
        reject(new Error(`İşlem ${code} çıkış kodu ile sonlandı.`));
      }
    });
  });
}

function parseUninstallCommand(rawCommand) {
  const trimmed = String(rawCommand || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('"')) {
    const endQuote = trimmed.indexOf('"', 1);
    if (endQuote > 1) {
      const exe = trimmed.slice(1, endQuote);
      const rest = trimmed.slice(endQuote + 1).trim();
      return { exe, args: rest ? rest.split(/\s+/) : [] };
    }
  }
  const parts = trimmed.split(/\s+/);
  return { exe: parts[0], args: parts.slice(1) };
}

// Window control IPCs
ipcMain.handle('window:minimize', (event) => {
  getWindowFromEvent(event).minimize();
});

ipcMain.handle('window:is-maximized', (event) => {
  return getWindowFromEvent(event).isMaximized();
});

ipcMain.handle('window:toggle-maximize', (event) => {
  const window = getWindowFromEvent(event);
  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
  return window.isMaximized();
});

ipcMain.handle('window:close', (event) => {
  getWindowFromEvent(event).close();
});

// Store IPCs
ipcMain.handle('store:platform-info', async () => {
  await fsp.mkdir(DOWNLOADS_DIR(), { recursive: true });
  const totalRamGb = Math.max(1, Math.round(os.totalmem() / 1024 ** 3));
  let freeDiskGb;
  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(DOWNLOADS_DIR());
      if (stats && typeof stats.bavail === 'number' && typeof stats.bsize === 'number') {
        freeDiskGb = Math.max(0, Math.floor((stats.bavail * stats.bsize) / 1024 ** 3));
      }
    }
  } catch {
    freeDiskGb = undefined;
  }
  return {
    isDesktop: true,
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    packageId: STORE_APP_ID,
    downloadsDir: DOWNLOADS_DIR(),
    totalRamGb,
    freeDiskGb,
    osRelease: os.release(),
  };
});

async function fetchJsonFromUrl(url, allowMissing = false) {
  const parsed = new URL(String(url));
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Geçersiz protokol.');
  }
  const headers = {
    'User-Agent': 'Koru/1.0 (com.anticvalley.koru)',
    Accept: 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  };
  if (parsed.hostname.toLowerCase() === 'api.github.com') {
    const token = await getGitHubToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(parsed.toString(), {
    cache: 'no-store',
    headers,
  });
  if (allowMissing && res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText} (${parsed.hostname}${parsed.pathname})`);
  }
  return res.json();
}

ipcMain.handle('store:fetch-json', (_event, url) => fetchJsonFromUrl(url));
ipcMain.handle('store:fetch-json-optional', (_event, url) => fetchJsonFromUrl(url, true));

ipcMain.handle('store:get-github-token-status', async () => ({
  configured: Boolean(process.env.GITHUB_TOKEN || fs.existsSync(GITHUB_TOKEN_FILE())),
  secureStorageAvailable: safeStorage.isEncryptionAvailable(),
}));

ipcMain.handle('store:save-github-token', async (_event, rawToken) => {
  const token = String(rawToken || '').trim();
  if (!token || token.length > 500 || /\s/.test(token)) {
    throw new Error('Geçerli bir GitHub erişim anahtarı girin.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Bu sistem güvenli anahtar saklamayı desteklemiyor.');
  }

  const verification = await fetch('https://api.github.com/rate_limit', {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Koru/1.0 (com.anticvalley.koru)',
      Accept: 'application/json',
    },
  });
  if (!verification.ok) {
    throw new Error(
      verification.status === 401
        ? 'GitHub anahtarı geçersiz. Anahtarı kontrol edip tekrar deneyin.'
        : `GitHub anahtarı doğrulanamadı (HTTP ${verification.status}).`
    );
  }

  await fsp.mkdir(path.dirname(GITHUB_TOKEN_FILE()), { recursive: true });
  await fsp.writeFile(GITHUB_TOKEN_FILE(), safeStorage.encryptString(token));
  cachedGitHubToken = token;
});

ipcMain.handle('store:clear-github-token', async () => {
  await fsp.rm(GITHUB_TOKEN_FILE(), { force: true });
  cachedGitHubToken = process.env.GITHUB_TOKEN || '';
});

ipcMain.handle('store:get-installed', async (_event, catalogApps = []) => {
  const localRecords = await readLocalRegistry();
  const winEntries = await scanWindowsUninstallRegistry();

  if (winEntries.length === 0) {
    return localRecords;
  }

  const merged = [];
  for (const record of localRecords) {
    const winMatch = matchWindowsRegistryEntry(winEntries, record.appId, record.name);
    if (winMatch) {
      merged.push({
        ...record,
        version: winMatch.DisplayVersion || record.version,
        installLocation:
          findInstallLocation(
            winMatch.InstallLocation,
            winMatch.QuietUninstallString || winMatch.UninstallString
          ) || record.installLocation,
        uninstallString: winMatch.QuietUninstallString || winMatch.UninstallString || record.uninstallString,
        executablePath:
          record.executablePath ||
          findExecutableFromDisplayIcon(winMatch.DisplayIcon) ||
          findExecutableInDir(
            findInstallLocation(
              winMatch.InstallLocation,
              winMatch.QuietUninstallString || winMatch.UninstallString
            ),
            record.name
          ),
        detectedFromSystem: true,
      });
    } else if (process.platform !== 'win32' || !record.uninstallString) {
      merged.push(record);
    }
  }

  const knownApps = Array.isArray(catalogApps)
    ? catalogApps.filter(
        (known) =>
          known &&
          typeof known.appId === 'string' &&
          typeof known.name === 'string' &&
          known.appId.trim() &&
          known.name.trim()
      )
    : [];
  for (const known of knownApps) {
    if (merged.some((r) => r.appId === known.appId)) continue;
    const winMatch = matchWindowsRegistryEntry(winEntries, known.appId, known.name);
    const selfApp = isSelfStoreApp(known.appId, known.name);
    if (winMatch) {
      const uninstallString = winMatch.QuietUninstallString || winMatch.UninstallString;
      const installLocation = findInstallLocation(winMatch.InstallLocation, uninstallString);
      merged.push({
        appId: known.appId,
        name: winMatch.DisplayName || known.name,
        version: selfApp && app.isPackaged ? app.getVersion() : winMatch.DisplayVersion || '0.0.0',
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        installLocation,
        executablePath:
          findExecutableFromDisplayIcon(winMatch.DisplayIcon) ||
          findExecutableInDir(installLocation, known.name),
        uninstallString: uninstallString || undefined,
        detectedFromSystem: true,
        sourceMode: 'desktop',
      });
    } else if (selfApp && app.isPackaged) {
      merged.push({
        appId: known.appId,
        name: known.name,
        version: app.getVersion(),
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        installLocation: path.dirname(process.execPath),
        executablePath: process.execPath,
        detectedFromSystem: true,
        sourceMode: 'desktop',
      });
    }
  }

  return merged;
});

const pausedDownloads = new Set();
const pausedPartFiles = new Set();
const appPartPaths = new Map();
const activeDownloadFiles = new Set();

ipcMain.handle('store:pause-download', (_event, appId) => {
  pausedDownloads.add(appId);
  const controller = activeDownloads.get(appId);
  if (controller) {
    controller.abort();
    activeDownloads.delete(appId);
  }
});

ipcMain.handle('store:cancel-download', async (_event, appId) => {
  pausedDownloads.delete(appId);
  const controller = activeDownloads.get(appId);
  if (controller) {
    controller.abort();
    activeDownloads.delete(appId);
  }
  const partPath = appPartPaths.get(appId);
  if (partPath) {
    appPartPaths.delete(appId);
    pausedPartFiles.delete(partPath);
    await fsp.rm(partPath, { force: true }).catch(() => {});
  }
});

function normalizeSha256(value) {
  const match = String(value || '').trim().toLowerCase().match(/^(?:sha256:)?([a-f0-9]{64})$/);
  return match ? match[1] : null;
}

function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
  });
}

function parseChecksumFileForAsset(content, targetFileName) {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lowerTarget = String(targetFileName || '').toLowerCase();

  for (const line of lines) {
    const std = line.match(/^([a-fA-F0-9]{64})\s+[* ]?(.+)$/);
    if (std) {
      const digest = std[1].toLowerCase();
      const filePart = path.basename(std[2].trim()).toLowerCase();
      if (!lowerTarget || filePart === lowerTarget || std[2].toLowerCase().includes(lowerTarget)) {
        return digest;
      }
    }
    const bsd = line.match(/^SHA256\s*\(([^)]+)\)\s*=\s*([a-fA-F0-9]{64})$/i);
    if (bsd) {
      const filePart = path.basename(bsd[1].trim()).toLowerCase();
      if (!lowerTarget || filePart === lowerTarget) {
        return bsd[2].toLowerCase();
      }
    }
  }

  if (lines.length === 1) {
    const solo = lines[0].match(/^([a-fA-F0-9]{64})$/);
    if (solo) return solo[1].toLowerCase();
  }
  return null;
}

async function fetchExpectedSha256FromUrl(checksumUrl, fileName) {
  if (!checksumUrl) return null;
  try {
    const parsed = new URL(String(checksumUrl));
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const res = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'Koru/1.0 (com.anticvalley.koru)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const text = await res.text();
    return parseChecksumFileForAsset(text, fileName);
  } catch {
    return null;
  }
}

ipcMain.handle('store:install-app', async (event, req) => {
  const {
    appId,
    name,
    version,
    downloadUrl,
    fileName,
    silent = false,
    mode = 'install',
    expectedSha256,
    checksumUrl,
    cleanAfterInstall,
    customInstallDir,
    customDownloadDir,
  } = req;
  const sender = event.sender;
  const safeName = String(fileName || `${appId}-${version}.bin`).replace(/[^A-Za-z0-9._-]/g, '_');

  const resolvedCustomDownloadDir =
    typeof customDownloadDir === 'string' && customDownloadDir.trim()
      ? path.resolve(customDownloadDir.trim())
      : '';
  const destinationDir = resolvedCustomDownloadDir || DOWNLOADS_DIR();
  await fsp.mkdir(destinationDir, { recursive: true });
  const targetPath = path.join(destinationDir, safeName);
  const partPath = `${targetPath}.part`;

  pausedDownloads.delete(appId);
  pausedPartFiles.delete(partPath);
  appPartPaths.set(appId, partPath);

  const controller = new AbortController();
  activeDownloads.set(appId, controller);
  activeDownloadFiles.add(targetPath);
  activeDownloadFiles.add(partPath);

  let lastReceivedBytes = 0;
  let lastTotalBytes = 0;

  try {
    let existingBytes = 0;
    try {
      const stat = await fsp.stat(partPath);
      if (stat.isFile() && stat.size > 0) {
        existingBytes = stat.size;
      }
    } catch {
      existingBytes = 0;
    }
    lastReceivedBytes = existingBytes;

    sendProgress(sender, {
      appId,
      phase: 'downloading',
      percent: 0,
      receivedBytes: existingBytes,
      totalBytes: 0,
      speedBps: 0,
      message: existingBytes > 0 ? `${safeName} devam ettiriliyor...` : `${safeName} indiriliyor...`,
    });

    const fetchHeaders = { 'User-Agent': 'Koru/1.0 (com.anticvalley.koru)' };
    if (existingBytes > 0) {
      fetchHeaders.Range = `bytes=${existingBytes}-`;
    }

    let response = await fetch(downloadUrl, {
      headers: fetchHeaders,
      signal: controller.signal,
      redirect: 'follow',
    });

    if (response.status === 416 && existingBytes > 0) {
      existingBytes = 0;
      lastReceivedBytes = 0;
      await fsp.rm(partPath, { force: true }).catch(() => {});
      response = await fetch(downloadUrl, {
        headers: { 'User-Agent': 'Koru/1.0 (com.anticvalley.koru)' },
        signal: controller.signal,
        redirect: 'follow',
      });
    }

    if (!response.ok || !response.body) {
      throw new Error(`İndirme başarısız (${response.status} ${response.statusText})`);
    }

    const isPartial = response.status === 206 && existingBytes > 0;
    if (!isPartial) {
      existingBytes = 0;
      lastReceivedBytes = 0;
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    let totalBytes = isPartial ? existingBytes + contentLength : contentLength;
    const contentRange = response.headers.get('content-range');
    if (isPartial && contentRange) {
      const crMatch = contentRange.match(/bytes\s+\d+-\d+\/(\d+)/i);
      if (crMatch) {
        totalBytes = Number(crMatch[1]);
      }
    }
    lastTotalBytes = totalBytes;

    let receivedBytes = existingBytes;
    const sessionStartBytes = existingBytes;
    const startedAt = Date.now();
    let lastEmit = 0;
    let throttleWindowStart = Date.now();
    let throttleWindowBytes = 0;

    // Ensure current limit is loaded
    if (currentDownloadSpeedLimitBps === 0) {
      currentDownloadSpeedLimitBps = readDesktopSettings().downloadSpeedLimitBps;
    }

    const fileStream = fs.createWriteStream(partPath, { flags: isPartial ? 'a' : 'w' });
    const reader = response.body.getReader();

    await new Promise((resolve, reject) => {
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              fileStream.end(() => resolve());
              break;
            }
            receivedBytes += value.byteLength;
            lastReceivedBytes = receivedBytes;
            throttleWindowBytes += value.byteLength;

            if (!fileStream.write(Buffer.from(value))) {
              await new Promise((resDrain) => fileStream.once('drain', resDrain));
            }

            const limitBps = currentDownloadSpeedLimitBps;
            if (limitBps > 0) {
              const elapsedWindowMs = Date.now() - throttleWindowStart;
              const expectedMs = (throttleWindowBytes / limitBps) * 1000;
              if (expectedMs > elapsedWindowMs) {
                const waitMs = Math.min(1000, Math.round(expectedMs - elapsedWindowMs));
                if (waitMs > 0) {
                  await new Promise((resSleep) => setTimeout(resSleep, waitMs));
                }
              }
              if (Date.now() - throttleWindowStart >= 1000) {
                throttleWindowStart = Date.now();
                throttleWindowBytes = 0;
              }
            }

            const now = Date.now();
            if (now - lastEmit >= 120) {
              lastEmit = now;
              const elapsedSec = Math.max(0.2, (now - startedAt) / 1000);
              const sessionBytes = Math.max(0, receivedBytes - sessionStartBytes);
              const speedBps = Math.round(sessionBytes / elapsedSec);
              const percent = totalBytes > 0 ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : 50;
              sendProgress(sender, {
                appId,
                phase: 'downloading',
                percent,
                receivedBytes,
                totalBytes,
                speedBps,
                message: `${safeName} indiriliyor...`,
              });
            }
          }
        } catch (err) {
          await new Promise((resClose) => {
            try {
              fileStream.close(() => resClose());
            } catch {
              fileStream.destroy();
              resClose();
            }
          });
          reject(err);
        }
      };
      pump();
    });

    activeDownloads.delete(appId);
    await fsp.rm(targetPath, { force: true }).catch(() => {});
    await fsp.rename(partPath, targetPath);
    appPartPaths.delete(appId);
    pausedPartFiles.delete(partPath);
    activeDownloadFiles.delete(partPath);

    sendProgress(sender, {
      appId,
      phase: 'verifying',
      percent: 100,
      receivedBytes,
      totalBytes: totalBytes || receivedBytes,
      speedBps: 0,
      message: `${safeName} SHA-256 bütünlüğü doğrulanıyor...`,
    });

    const actualSha256 = await computeFileSha256(targetPath);
    let resolvedExpectedSha256 = normalizeSha256(expectedSha256);
    if (!resolvedExpectedSha256 && checksumUrl) {
      resolvedExpectedSha256 = await fetchExpectedSha256FromUrl(checksumUrl, fileName || safeName);
    }

    let sha256Verified = false;
    if (resolvedExpectedSha256) {
      if (actualSha256 !== resolvedExpectedSha256) {
        await fsp.rm(targetPath, { force: true }).catch(() => {});
        throw new Error(
          `SHA-256 bütünlük doğrulaması başarısız! İndirilen dosya bozulmuş veya değiştirilmiş olabilir (Beklenen: ${resolvedExpectedSha256.slice(0, 12)}..., Hesaplanan: ${actualSha256.slice(0, 12)}...).`
        );
      }
      sha256Verified = true;
    }
    const verifiedAt = new Date().toISOString();

    const installPhase = mode === 'update' ? 'updating' : mode === 'reinstall' ? 'reinstalling' : 'installing';
    sendProgress(sender, {
      appId,
      phase: installPhase,
      percent: 100,
      receivedBytes,
      totalBytes: totalBytes || receivedBytes,
      speedBps: 0,
      message: `${name} kuruluyor...`,
    });

    const lower = safeName.toLowerCase();
    let executablePath;
    let installLocation;
    let uninstallString;

    if (
      process.platform === 'win32' &&
      app.isPackaged &&
      isSelfStoreApp(appId, name) &&
      lower.endsWith('.exe')
    ) {
      const vbsPath = path.join(os.tmpdir(), `koru-self-update-${Date.now()}-${process.pid}.vbs`);
      const vbsLines = [
        'On Error Resume Next',
        'Set shell = CreateObject("WScript.Shell")',
        'Set fso = CreateObject("Scripting.FileSystemObject")',
        'waitPid = shell.Environment("PROCESS")("KORU_WAIT_PID")',
        'installerPath = shell.Environment("PROCESS")("KORU_INSTALLER_PATH")',
        'installerArgs = shell.Environment("PROCESS")("KORU_INSTALLER_ARGS")',
        'relaunchExe = shell.Environment("PROCESS")("KORU_RELAUNCH_EXE")',
        'Set wmi = GetObject("winmgmts:{impersonationLevel=impersonate}!\\\\.\\root\\cimv2")',
        'If Not IsEmpty(waitPid) And waitPid <> "" Then',
        '  For i = 1 To 60',
        '    Set procs = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId = " & waitPid)',
        '    If procs.Count = 0 Then Exit For',
        '    WScript.Sleep 250',
        '  Next',
        'End If',
        'WScript.Sleep 800',
        'If installerPath <> "" And fso.FileExists(installerPath) Then',
        '  cmd = Chr(34) & installerPath & Chr(34)',
        '  If installerArgs <> "" Then',
        '    cmd = cmd & " " & installerArgs',
        '  End If',
        '  If installerArgs = "/S" Then',
        '    shell.Run cmd, 1, True',
        '    If relaunchExe <> "" And fso.FileExists(relaunchExe) Then',
        '      shell.Run Chr(34) & relaunchExe & Chr(34), 1, False',
        '    End If',
        '  Else',
        '    shell.Run cmd, 1, False',
        '  End If',
        'End If',
        'fso.DeleteFile WScript.ScriptFullName, True',
      ];
      await fsp.writeFile(vbsPath, vbsLines.join('\r\n'), 'utf8');

      const wscriptExe = path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32',
        'wscript.exe'
      );

      const updaterEnv = {
        ...process.env,
        KORU_WAIT_PID: String(process.pid),
        KORU_INSTALLER_PATH: targetPath,
        KORU_INSTALLER_ARGS: silent ? '/S' : '',
        KORU_RELAUNCH_EXE: process.execPath || '',
      };

      try {
        const launcher = spawn(wscriptExe, ['//Nologo', '//B', vbsPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
          env: updaterEnv,
        });

        await new Promise((resolve, reject) => {
          launcher.once('error', reject);
          launcher.once('spawn', resolve);
        });
        launcher.unref();
      } catch (vbsErr) {
        await fsp.rm(vbsPath, { force: true }).catch(() => {});
        const psCmd = [
          '$waitPid = $env:KORU_WAIT_PID;',
          'if ($waitPid) { Wait-Process -Id ([int]$waitPid) -Timeout 15 -ErrorAction SilentlyContinue };',
          'Start-Sleep -Milliseconds 800;',
          '$inst = $env:KORU_INSTALLER_PATH;',
          '$args = $env:KORU_INSTALLER_ARGS;',
          'if ($inst -and (Test-Path -LiteralPath $inst)) {',
          '  if ($args) { Start-Process -FilePath $inst -ArgumentList $args -WindowStyle Normal }',
          '  else { Start-Process -FilePath $inst -WindowStyle Normal }',
          '}',
        ].join(' ');

        const psLauncher = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', psCmd],
          {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            env: updaterEnv,
          }
        );

        await new Promise((resolve, reject) => {
          psLauncher.once('error', () => reject(vbsErr));
          psLauncher.once('spawn', resolve);
        });
        psLauncher.unref();
      }

      sendProgress(sender, {
        appId,
        phase: 'updating',
        percent: 100,
        receivedBytes,
        totalBytes: totalBytes || receivedBytes,
        speedBps: 0,
        message: 'Koru güncellemesi başlatılıyor; uygulama kapatılıp yükleyici açılacak.',
      });

      const existing = await readLocalRegistry();
      const previous = existing.find((item) => item.appId === appId);
      const nowIso = new Date().toISOString();
      const prevVerForRollback =
        previous?.version && previous.version !== version ? previous.version : previous?.previousVersion;
      const updatedRecord = {
        appId,
        name,
        version,
        previousVersion: prevVerForRollback,
        installedAt: previous?.installedAt || nowIso,
        updatedAt: nowIso,
        installLocation: previous?.installLocation || path.dirname(process.execPath),
        executablePath: previous?.executablePath || process.execPath,
        uninstallString: previous?.uninstallString,
        installerPath: targetPath,
        sha256: actualSha256,
        sha256Verified,
        verifiedAt,
        detectedFromSystem: previous?.detectedFromSystem || false,
        sourceMode: 'desktop',
      };
      const next = existing.filter((item) => item.appId !== appId);
      next.push(updatedRecord);
      await writeLocalRegistry(next).catch(() => {});

      activeDownloadFiles.delete(targetPath);

      setTimeout(() => {
        isQuitting = true;
        app.quit();
        setTimeout(() => app.exit(0), 1200);
      }, 250);

      return updatedRecord;
    }

    const desktopSettingsSnapshot = readDesktopSettings();
    const effectiveCustomInstallRoot = String(
      customInstallDir !== undefined ? customInstallDir : desktopSettingsSnapshot.customInstallDir || ''
    ).trim();
    const safeAppFolder =
      String(name || appId || 'KoruApp')
        .replace(/[<>:"/\\|?*]+/g, '')
        .trim() || 'KoruApp';
    const perAppCustomDir =
      effectiveCustomInstallRoot && !isSelfStoreApp(appId, name)
        ? path.join(effectiveCustomInstallRoot, safeAppFolder)
        : '';

    if (process.platform === 'win32') {
      if (lower.endsWith('.msi')) {
        const args = ['/i', targetPath];
        if (silent) args.push('/qn', '/norestart');
        if (perAppCustomDir) {
          args.push(`INSTALLDIR=${perAppCustomDir}`, `TARGETDIR=${perAppCustomDir}`);
        }
        await runCommandAsync('msiexec.exe', args, { silent });
      } else if (lower.endsWith('.exe')) {
        const args = silent ? ['/S'] : [];
        if (perAppCustomDir) {
          args.push(`/D=${perAppCustomDir}`);
        }
        await runCommandAsync(targetPath, args, { silent });
      } else {
        await shell.openPath(targetPath);
      }

      const winEntries = await scanWindowsUninstallRegistry();
      const winMatch = matchWindowsRegistryEntry(winEntries, appId, name);
      if (winMatch) {
        installLocation =
          winMatch.InstallLocation ||
          (perAppCustomDir && fs.existsSync(perAppCustomDir) ? perAppCustomDir : undefined);
        uninstallString = winMatch.QuietUninstallString || winMatch.UninstallString || undefined;
        executablePath = findExecutableInDir(installLocation, name);
      } else if (perAppCustomDir && fs.existsSync(perAppCustomDir)) {
        installLocation = perAppCustomDir;
        executablePath = findExecutableInDir(perAppCustomDir, name);
      }
    } else if (process.platform === 'linux' && lower.endsWith('.appimage')) {
      const appsDir = effectiveCustomInstallRoot || path.join(app.getPath('home'), 'Applications');
      await fsp.mkdir(appsDir, { recursive: true });
      const destAppImage = path.join(appsDir, safeName);
      await fsp.copyFile(targetPath, destAppImage);
      await fsp.chmod(destAppImage, 0o755);
      executablePath = destAppImage;
      installLocation = appsDir;
    } else {
      await shell.openPath(targetPath);
    }

    const shouldClean =
      typeof cleanAfterInstall === 'boolean'
        ? cleanAfterInstall
        : desktopSettingsSnapshot.autoCleanInstallers;

    let savedInstallerPath = targetPath;
    if (shouldClean) {
      await fsp.rm(targetPath, { force: true }).catch(() => {});
      savedInstallerPath = undefined;
    }

    const nowIso = new Date().toISOString();
    const existing = await readLocalRegistry();
    const prev = existing.find((item) => item.appId === appId);
    const prevVerForRollback =
      prev?.version && prev.version !== version ? prev.version : prev?.previousVersion;
    const newRecord = {
      appId,
      name,
      version,
      previousVersion: prevVerForRollback,
      installedAt: prev?.installedAt || nowIso,
      updatedAt: nowIso,
      installLocation,
      executablePath,
      uninstallString,
      installerPath: savedInstallerPath,
      sha256: actualSha256,
      sha256Verified,
      verifiedAt,
      detectedFromSystem: Boolean(uninstallString),
      sourceMode: 'desktop',
    };

    const next = existing.filter((item) => item.appId !== appId);
    next.push(newRecord);
    await writeLocalRegistry(next);

    activeDownloadFiles.delete(targetPath);
    return newRecord;
  } catch (err) {
    activeDownloads.delete(appId);
    activeDownloadFiles.delete(targetPath);
    activeDownloadFiles.delete(partPath);

    if (pausedDownloads.has(appId)) {
      pausedDownloads.delete(appId);
      pausedPartFiles.add(partPath);
      const pct =
        lastTotalBytes > 0 ? Math.min(99, Math.round((lastReceivedBytes / lastTotalBytes) * 100)) : 0;
      sendProgress(sender, {
        appId,
        phase: 'paused',
        percent: pct,
        receivedBytes: lastReceivedBytes,
        totalBytes: lastTotalBytes,
        speedBps: 0,
        message: `${safeName} duraklatıldı`,
      });
      return {
        paused: true,
        receivedBytes: lastReceivedBytes,
        totalBytes: lastTotalBytes,
      };
    }

    appPartPaths.delete(appId);
    pausedPartFiles.delete(partPath);
    await fsp.rm(partPath, { force: true }).catch(() => {});
    throw err;
  }
});

ipcMain.handle('store:launch-app', async (_event, req) => {
  const { executablePath, installLocation, name } = req;
  const resolvedExe = executablePath || findExecutableInDir(installLocation, name);
  if (resolvedExe && fs.existsSync(resolvedExe)) {
    const child = spawn(resolvedExe, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { launched: true };
  }
  if (installLocation && fs.existsSync(installLocation)) {
    await shell.openPath(installLocation);
    return { launched: true, message: 'Kurulum klasörü açıldı.' };
  }
  return { launched: false, message: 'Çalıştırılabilir dosya bulunamadı.' };
});

ipcMain.handle('store:uninstall-app', async (event, req) => {
  const { appId, name, uninstallString, installLocation, silent = false } = req;
  const sender = event.sender;

  sendProgress(sender, {
    appId,
    phase: 'uninstalling',
    percent: 45,
    receivedBytes: 0,
    totalBytes: 0,
    speedBps: 0,
    message: `${name} kaldırılıyor...`,
  });

  if (process.platform === 'win32') {
    let cmdStr = uninstallString;
    if (!cmdStr) {
      const winEntries = await scanWindowsUninstallRegistry();
      const winMatch = matchWindowsRegistryEntry(winEntries, appId, name);
      cmdStr = winMatch?.QuietUninstallString || winMatch?.UninstallString;
    }

    if (cmdStr) {
      const parsed = parseUninstallCommand(cmdStr);
      if (parsed) {
        const args = [...parsed.args];
        if (silent && !args.includes('/S') && !args.includes('/qn')) {
          args.push('/S');
        }
        await runCommandAsync(parsed.exe, args, { silent });
      }
    }
  } else if (process.platform === 'linux') {
    const records = await readLocalRegistry();
    const target = records.find((r) => r.appId === appId);
    if (target?.executablePath && fs.existsSync(target.executablePath)) {
      await fsp.rm(target.executablePath, { force: true });
    }
  } else if (installLocation && fs.existsSync(installLocation) && installLocation.endsWith('.app')) {
    await fsp.rm(installLocation, { recursive: true, force: true });
  }

  const existing = await readLocalRegistry();
  const next = existing.filter((item) => item.appId !== appId);
  await writeLocalRegistry(next);
});

ipcMain.handle('store:open-external', async (_event, rawUrl) => {
  const parsed = new URL(String(rawUrl));
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
    await shell.openExternal(parsed.toString());
  }
});

ipcMain.handle('store:open-downloads', async () => {
  await fsp.mkdir(DOWNLOADS_DIR(), { recursive: true });
  await shell.openPath(DOWNLOADS_DIR());
});

ipcMain.handle('store:open-install-folder', async (_event, req) => {
  const { executablePath, installLocation, name } = req || {};
  const resolvedExe =
    executablePath && fs.existsSync(executablePath)
      ? executablePath
      : findExecutableInDir(installLocation, name);
  const targetDir =
    (installLocation && fs.existsSync(installLocation) && installLocation) ||
    (resolvedExe && fs.existsSync(path.dirname(resolvedExe)) && path.dirname(resolvedExe));

  if (targetDir) {
    await shell.openPath(targetDir);
    return { opened: true };
  }
  return { opened: false, message: 'Kurulum klasörü sistemde bulunamadı.' };
});

ipcMain.handle('store:create-desktop-shortcut', async (_event, req) => {
  const { appId, name, executablePath, installLocation } = req || {};
  const resolvedExe =
    executablePath && fs.existsSync(executablePath)
      ? executablePath
      : findExecutableInDir(installLocation, name);

  if (!resolvedExe || !fs.existsSync(resolvedExe)) {
    return {
      created: false,
      message: 'Uygulamanın çalıştırılabilir dosyası bulunamadığı için kısayol oluşturulamadı.',
    };
  }

  const desktopDir = app.getPath('desktop');
  const safeTitle =
    String(name || appId || 'Koru Uygulama')
      .replace(/[<>:"/\\|?*]+/g, '')
      .trim() || 'Koru Uygulama';

  if (process.platform === 'win32') {
    const shortcutPath = path.join(desktopDir, `${safeTitle}.lnk`);
    const psCmd = [
      '$ws = New-Object -ComObject WScript.Shell;',
      '$sc = $ws.CreateShortcut($env:KORU_SHORTCUT_PATH);',
      '$sc.TargetPath = $env:KORU_TARGET_EXE;',
      'if ($env:KORU_WORK_DIR) { $sc.WorkingDirectory = $env:KORU_WORK_DIR };',
      '$sc.IconLocation = "$($env:KORU_TARGET_EXE),0";',
      '$sc.Description = $env:KORU_APP_NAME;',
      '$sc.Save();',
    ].join(' ');

    await new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCmd],
        {
          windowsHide: true,
          env: {
            ...process.env,
            KORU_SHORTCUT_PATH: shortcutPath,
            KORU_TARGET_EXE: resolvedExe,
            KORU_WORK_DIR: installLocation && fs.existsSync(installLocation) ? installLocation : path.dirname(resolvedExe),
            KORU_APP_NAME: safeTitle,
          },
        },
        (err) => (err ? reject(err) : resolve())
      );
    });
    return { created: true, message: `Masaüstü kısayolu oluşturuldu: ${safeTitle}.lnk` };
  }

  if (process.platform === 'linux') {
    const desktopEntryPath = path.join(desktopDir, `${safeTitle}.desktop`);
    const content = [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${safeTitle}`,
      `Exec="${resolvedExe}"`,
      'Terminal=false',
      '',
    ].join('\n');
    await fsp.writeFile(desktopEntryPath, content, 'utf8');
    await fsp.chmod(desktopEntryPath, 0o755);
    return { created: true, message: `Masaüstü kısayolu oluşturuldu: ${safeTitle}.desktop` };
  }

  return {
    created: false,
    message: 'Bu işletim sisteminde otomatik masaüstü kısayolu oluşturma desteklenmiyor.',
  };
});

async function findRunningProcesses(req) {
  const { appId, name, executablePath, installLocation } = req || {};
  const selfApp = isSelfStoreApp(appId, name);

  if (process.platform !== 'win32') {
    return { running: false, processNames: [], pids: [] };
  }

  const candidateNames = new Set();
  if (executablePath) {
    candidateNames.add(path.basename(executablePath).toLowerCase());
  }
  if (installLocation && fs.existsSync(installLocation)) {
    try {
      const files = fs.readdirSync(installLocation);
      for (const file of files) {
        const lower = file.toLowerCase();
        if (
          lower.endsWith('.exe') &&
          !lower.includes('uninstall') &&
          !lower.startsWith('unins') &&
          !lower.includes('crashpad') &&
          !lower.includes('elevate')
        ) {
          candidateNames.add(lower);
        }
      }
    } catch {
      // Ignore folder read failure
    }
  }
  const norm = normalizeName(name);
  if (norm.length >= 2) {
    candidateNames.add(`${norm}.exe`);
  }

  if (candidateNames.size === 0) {
    return { running: false, processNames: [], pids: [] };
  }

  const res = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH']);
  if (res.error || !res.stdout) {
    return { running: false, processNames: [], pids: [] };
  }

  const processNames = [];
  const pids = [];

  for (const rawLine of res.stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('INFO:')) continue;
    const match = line.match(/^"([^"]+)","(\d+)"/);
    if (!match) continue;
    const imageName = match[1];
    const pid = Number(match[2]);
    if (!pid || pid === process.pid) continue;

    const lowerImage = imageName.toLowerCase();
    if (!selfApp && (lowerImage === 'koru.exe' || lowerImage === 'electron.exe')) {
      continue;
    }

    const imageBaseNorm = normalizeName(lowerImage.replace(/\.exe$/i, ''));
    const exactHit = candidateNames.has(lowerImage);
    const normHit = norm.length >= 3 && imageBaseNorm === norm;

    if (exactHit || normHit) {
      if (!processNames.includes(imageName)) processNames.push(imageName);
      if (!pids.includes(pid)) pids.push(pid);
    }
  }

  return {
    running: pids.length > 0,
    processNames,
    pids,
  };
}

ipcMain.handle('store:check-app-running', async (_event, req) => {
  return findRunningProcesses(req);
});

ipcMain.handle('store:stop-app', async (_event, req) => {
  if (isSelfStoreApp(req?.appId, req?.name)) {
    return {
      stopped: false,
      message: 'Koru kendisini güncelleme aşamasında otomatik kapatıp yeniden başlatacaktır.',
    };
  }
  const status = await findRunningProcesses(req);
  if (!status.running) {
    return { stopped: true, message: 'Çalışan örnek bulunamadı.' };
  }

  for (const pid of status.pids) {
    await execFileAsync('taskkill.exe', ['/F', '/T', '/PID', String(pid)]);
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  const after = await findRunningProcesses(req);
  if (after.running) {
    return {
      stopped: false,
      message: `${after.processNames.join(', ')} kapatılamadı. Lütfen uygulamayı elle kapatın.`,
    };
  }
  return {
    stopped: true,
    message: `${status.processNames.join(', ')} kapatıldı.`,
  };
});

async function queryRegistryValue(keyPath, valueName) {
  const res = await execFileAsync('reg.exe', ['query', keyPath, '/v', valueName]);
  if (res.error || !res.stdout) return null;
  const parsed = parseRegQueryValues(res.stdout);
  return parsed[0]?.data || null;
}

async function checkVbCableDriverStatus() {
  if (process.platform !== 'win32') {
    return {
      installed: false,
      supportedOnPlatform: false,
      details: 'VB-CABLE yalnızca Windows işletim sistemleri için gereklidir.',
    };
  }

  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const driverFileCandidates = [
    path.join(systemRoot, 'System32', 'drivers', 'vbaudio_cable64_win10.sys'),
    path.join(systemRoot, 'System32', 'drivers', 'vbaudio_cable64_win7.sys'),
    path.join(systemRoot, 'System32', 'drivers', 'vbaudio_cable_win7.sys'),
  ];
  const appFileCandidates = [
    path.join(programFiles, 'VB', 'CABLE', 'VBCABLE_ControlPanel.exe'),
    path.join(programFiles, 'VB', 'CABLE', 'VBCABLE_Setup_x64.exe'),
    path.join(programFilesX86, 'VB', 'CABLE', 'VBCABLE_ControlPanel.exe'),
  ];

  const driverFileExists = driverFileCandidates.some((p) => fs.existsSync(p));
  const appFileExists = appFileCandidates.some((p) => fs.existsSync(p));

  const psScript = `
$reg = Get-ItemProperty @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
) -ErrorAction SilentlyContinue |
  Where-Object { $_.PSChildName -match 'VBCABLE' -or $_.DisplayName -match 'VB-Audio Virtual Cable|VBCABLE' } |
  Select-Object -First 1 DisplayName, DisplayVersion;
$snd = Get-CimInstance Win32_SoundDevice -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'VB-Audio|CABLE' -or $_.Manufacturer -match 'VB-Audio' } |
  Select-Object -First 1 Name, Status, DeviceID;
@{ reg = $reg; snd = $snd } | ConvertTo-Json -Compress
`;

  let regHit = null;
  let sndHit = null;
  try {
    const psRes = await new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { timeout: 5500, windowsHide: true, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err || !stdout || !stdout.trim()) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch {
            resolve(null);
          }
        }
      );
    });
    if (psRes && typeof psRes === 'object') {
      regHit = psRes.reg || null;
      sndHit = psRes.snd || null;
    }
  } catch {
    // Fallback to filesystem check
  }

  const installed = Boolean(sndHit || regHit || (driverFileExists && appFileExists));
  const version =
    (regHit && typeof regHit.DisplayVersion === 'string' && regHit.DisplayVersion.trim()) ||
    undefined;

  let details = 'Windows sisteminde VB-CABLE sanal ses sürücüsü bulunamadı.';
  if (installed) {
    if (sndHit?.Name) {
      details = `Aktif ses aygıtı tespit edildi: ${sndHit.Name}`;
    } else if (regHit?.DisplayName) {
      details = `Sistemde kayıtlı sürücü bulundu: ${regHit.DisplayName}`;
    } else {
      details = 'VB-CABLE sürücü dosyaları sistemde mevcut.';
    }
  }

  return {
    installed,
    supportedOnPlatform: true,
    version,
    details,
  };
}

async function getSystemDependencySnapshots() {
  if (process.platform !== 'win32') {
    const dotnetRes = await execFileAsync('dotnet', ['--version']).catch(() => ({ error: true, stdout: '' }));
    return [
      {
        id: 'dotnet-cli',
        name: '.NET SDK / Çalışma Zamanı',
        kind: 'runtime',
        installed: !dotnetRes.error && Boolean(dotnetRes.stdout.trim()),
        version: dotnetRes.stdout.trim() || undefined,
        downloadUrl: 'https://dotnet.microsoft.com/en-us/download/dotnet',
        notes: 'Sistem PATH üzerinden dotnet komutu kontrol edildi.',
      },
    ];
  }

  const webViewGuid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  const [
    wvWow,
    wvStd,
    wvUser,
    vcX64Installed,
    vcX64Version,
    vcWowInstalled,
    vcWowVersion,
    netFxRelease,
    netFxVersion,
    dotnetListRes,
    vbCableStatus,
  ] = await Promise.all([
    queryRegistryValue(`HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${webViewGuid}`, 'pv'),
    queryRegistryValue(`HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${webViewGuid}`, 'pv'),
    queryRegistryValue(`HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${webViewGuid}`, 'pv'),
    queryRegistryValue('HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64', 'Installed'),
    queryRegistryValue('HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64', 'Version'),
    queryRegistryValue('HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64', 'Installed'),
    queryRegistryValue('HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64', 'Version'),
    queryRegistryValue('HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full', 'Release'),
    queryRegistryValue('HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full', 'Version'),
    execFileAsync('dotnet', ['--list-runtimes']),
    checkVbCableDriverStatus(),
  ]);

  const webViewVersion = wvWow || wvStd || wvUser;
  const hasWebView2 = Boolean(webViewVersion && webViewVersion !== '0.0.0.0');

  const isVcInstalled =
    /^0x1$/i.test(String(vcX64Installed || '')) ||
    String(vcX64Installed || '') === '1' ||
    /^0x1$/i.test(String(vcWowInstalled || '')) ||
    String(vcWowInstalled || '') === '1' ||
    Boolean(vcX64Version || vcWowVersion);
  const vcVersionClean = String(vcX64Version || vcWowVersion || '').replace(/^v/i, '') || undefined;

  let desktopRuntimeVersion;
  if (!dotnetListRes.error && dotnetListRes.stdout) {
    const matches = dotnetListRes.stdout
      .split(/\r?\n/)
      .map((line) => line.match(/Microsoft\.WindowsDesktop\.App\s+([^\s\[]+)/i))
      .filter(Boolean)
      .map((m) => m[1]);
    if (matches.length > 0) {
      desktopRuntimeVersion = matches[matches.length - 1];
    }
  }
  if (!desktopRuntimeVersion) {
    const programFilesDir = process.env.ProgramFiles || 'C:\\Program Files';
    const desktopDir = path.join(programFilesDir, 'dotnet', 'shared', 'Microsoft.WindowsDesktop.App');
    if (fs.existsSync(desktopDir)) {
      try {
        const dirs = fs.readdirSync(desktopDir).filter((d) => /^\d+\.\d+/.test(d)).sort();
        if (dirs.length > 0) desktopRuntimeVersion = dirs[dirs.length - 1];
      } catch {
        // Ignore
      }
    }
  }

  const netReleaseNum = netFxRelease
    ? String(netFxRelease).startsWith('0x')
      ? parseInt(netFxRelease, 16)
      : parseInt(netFxRelease, 10)
    : 0;
  const hasNetFx4 = Number.isFinite(netReleaseNum) && netReleaseNum >= 378389;

  return [
    {
      id: 'webview2',
      name: 'Microsoft Edge WebView2 Runtime',
      kind: 'runtime',
      installed: hasWebView2,
      version: hasWebView2 ? webViewVersion : undefined,
      downloadUrl: 'https://go.microsoft.com/fwlink/p/?LinkId=2124703',
      notes: 'Modern masaüstü arayüz bileşenleri için gereklidir.',
    },
    {
      id: 'vb-cable',
      name: 'VB-CABLE Virtual Audio Device',
      kind: 'driver',
      installed: vbCableStatus.installed,
      version: vbCableStatus.version,
      downloadUrl: 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack46.zip',
      notes: vbCableStatus.details,
    },
    {
      id: 'vcpp-x64',
      name: 'Visual C++ 2015–2022 Redistributable (x64)',
      kind: 'runtime',
      installed: isVcInstalled,
      version: isVcInstalled ? vcVersionClean : undefined,
      downloadUrl: 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
      notes: 'Yerel C/C++ modülleri ve ses/performans kütüphaneleri için gereklidir.',
    },
    {
      id: 'dotnet-desktop',
      name: '.NET Desktop Runtime',
      kind: 'runtime',
      installed: Boolean(desktopRuntimeVersion),
      version: desktopRuntimeVersion,
      downloadUrl: 'https://dotnet.microsoft.com/en-us/download/dotnet',
      notes: '.NET tabanlı masaüstü yardımcı araçları için kullanılır.',
    },
    {
      id: 'netfx-4',
      name: '.NET Framework 4.x',
      kind: 'runtime',
      installed: hasNetFx4,
      version: hasNetFx4 ? netFxVersion || '4.8+' : undefined,
      downloadUrl: 'https://dotnet.microsoft.com/en-us/download/dotnet-framework',
      notes: 'Windows sistem entegrasyonu ve klasik araçlar için kullanılır.',
    },
  ];
}

ipcMain.handle('store:check-system-dependencies', async () => {
  return getSystemDependencySnapshots();
});

function isPrerequisitePlatformSupported(prereq) {
  const target = String(prereq?.platform || 'universal').toLowerCase();
  if (!target || target === 'universal') return true;
  if (process.platform === 'win32') return target === 'windows';
  if (process.platform === 'darwin') return target === 'macos';
  if (process.platform === 'linux') return target === 'linux';
  return false;
}

async function checkSinglePrerequisite(prereq, snapshotsCache) {
  const id = String(prereq?.id || '').trim().toLowerCase();
  const name = String(prereq?.name || prereq?.id || 'Ek Bileşen');
  const supportedOnPlatform = isPrerequisitePlatformSupported(prereq);
  const checkedAt = new Date().toISOString();

  if (!supportedOnPlatform) {
    return {
      id,
      name,
      installed: false,
      supportedOnPlatform: false,
      details: 'Bu ek bileşen mevcut işletim sistemi için gerekli değildir.',
      checkedAt,
    };
  }

  if (id === 'vb-cable' || id === 'vbcable') {
    const vb = await checkVbCableDriverStatus();
    return {
      id: 'vb-cable',
      name,
      installed: vb.installed,
      version: vb.version,
      details: vb.details,
      supportedOnPlatform: vb.supportedOnPlatform,
      checkedAt,
    };
  }

  const snapshots = snapshotsCache || (await getSystemDependencySnapshots());
  const snapshotMatch = snapshots.find((s) => s.id.toLowerCase() === id);
  if (snapshotMatch) {
    return {
      id,
      name,
      installed: snapshotMatch.installed,
      version: snapshotMatch.version,
      details: snapshotMatch.notes,
      supportedOnPlatform: true,
      checkedAt,
    };
  }

  if (process.platform === 'win32') {
    const winEntries = await scanWindowsUninstallRegistry();
    const match = matchWindowsRegistryEntry(winEntries, id, name);
    if (match) {
      return {
        id,
        name,
        installed: true,
        version: match.DisplayVersion || undefined,
        details: `Kayıtlı bileşen bulundu: ${match.DisplayName}`,
        supportedOnPlatform: true,
        checkedAt,
      };
    }
  }

  return {
    id,
    name,
    installed: false,
    supportedOnPlatform: true,
    details: `${name} sistemde tespit edilmedi.`,
    checkedAt,
  };
}

ipcMain.handle('store:check-prerequisites', async (_event, items = []) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const snapshots = await getSystemDependencySnapshots();
  const results = [];
  for (const item of list) {
    results.push(await checkSinglePrerequisite(item, snapshots));
  }
  return results;
});

function findExtractedSetupFile(rootDir, candidates = []) {
  const normalizedCandidates = candidates
    .map((c) => String(c || '').trim().toLowerCase())
    .filter(Boolean);

  const allFiles = [];
  const walk = (dir, depth = 0) => {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        allFiles.push(full);
      } else if (entry.isDirectory()) {
        walk(full, depth + 1);
      }
    }
  };
  walk(rootDir, 0);

  for (const target of normalizedCandidates) {
    const exact = allFiles.find((f) => path.basename(f).toLowerCase() === target);
    if (exact) return exact;
  }

  const isX64 = process.arch !== 'ia32';
  const setupExe =
    allFiles.find((f) => {
      const b = path.basename(f).toLowerCase();
      return b.endsWith('.exe') && b.includes('setup') && (isX64 ? b.includes('64') : !b.includes('64'));
    }) ||
    allFiles.find((f) => {
      const b = path.basename(f).toLowerCase();
      return b.endsWith('.exe') && (b.includes('setup') || b.includes('install'));
    }) ||
    allFiles.find((f) => f.toLowerCase().endsWith('.msi'));

  return setupExe || null;
}

function runElevatedWindowsCommand(exePath, args, workingDir) {
  return new Promise((resolve, reject) => {
    const psScript = `
$ErrorActionPreference = 'Stop'
$exe = $env:KORU_PREREQ_EXE
$workDir = $env:KORU_PREREQ_DIR
$rawArgs = $env:KORU_PREREQ_ARGS
$argList = @()
if ($rawArgs) {
  $parsed = ConvertFrom-Json -InputObject $rawArgs
  if ($parsed -is [System.Array]) {
    foreach ($a in $parsed) { $argList += [string]$a }
  } elseif ($parsed) {
    $argList += [string]$parsed
  }
}
if ($argList.Count -gt 0) {
  $proc = Start-Process -FilePath $exe -ArgumentList $argList -WorkingDirectory $workDir -Verb RunAs -Wait -PassThru
} else {
  $proc = Start-Process -FilePath $exe -WorkingDirectory $workDir -Verb RunAs -Wait -PassThru
}
exit $proc.ExitCode
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      {
        windowsHide: true,
        timeout: 180_000,
        env: {
          ...process.env,
          KORU_PREREQ_EXE: exePath,
          KORU_PREREQ_DIR: workingDir || path.dirname(exePath),
          KORU_PREREQ_ARGS: JSON.stringify(Array.isArray(args) ? args : []),
        },
      },
      (err, _stdout, stderr) => {
        if (err) {
          const msg = `${err.message || ''} ${stderr || ''}`.toLowerCase();
          if (msg.includes('canceled by the user') || msg.includes('iptal')) {
            reject(new Error('Yönetici izni verilmediği için kurulum iptal edildi.'));
            return;
          }
          reject(new Error(stderr?.trim() || err.message || 'Yükseltilmiş kurulum başarısız oldu.'));
          return;
        }
        resolve();
      }
    );
  });
}

ipcMain.handle('store:install-prerequisite', async (event, prereq) => {
  const sender = event.sender;
  const id = String(prereq?.id || '').trim().toLowerCase();
  const name = String(prereq?.name || prereq?.id || 'Ek Bileşen');
  const taskId = `prereq:${id}`;

  if (!isPrerequisitePlatformSupported(prereq)) {
    throw new Error(`${name} bu işletim sistemi için geçerli değil.`);
  }

  const downloadUrl = String(prereq?.downloadUrl || '').trim();
  if (!downloadUrl) {
    throw new Error(`${name} için geçerli bir indirme adresi bulunamadı.`);
  }
  const parsedUrl = new URL(downloadUrl);
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('Geçersiz indirme protokolü.');
  }

  const safeId = id.replace(/[^a-z0-9._-]/g, '_') || 'prereq';
  const fallbackFileName =
    path.basename(parsedUrl.pathname || '') || `${safeId}.bin`;
  const safeName = String(prereq?.fileName || fallbackFileName).replace(/[^A-Za-z0-9._-]/g, '_');

  const prereqDir = path.join(DOWNLOADS_DIR(), 'prerequisites');
  await fsp.mkdir(prereqDir, { recursive: true });
  const targetPath = path.join(prereqDir, safeName);
  const partPath = `${targetPath}.part`;

  const controller = new AbortController();
  activeDownloads.set(taskId, controller);
  activeDownloadFiles.add(targetPath);
  activeDownloadFiles.add(partPath);

  try {
    sendProgress(sender, {
      appId: taskId,
      appName: name,
      phase: 'downloading',
      percent: 0,
      receivedBytes: 0,
      totalBytes: 0,
      speedBps: 0,
      message: `${name} paketi indiriliyor...`,
    });

    const response = await fetch(parsedUrl.toString(), {
      headers: { 'User-Agent': 'Koru/1.0 (com.anticvalley.koru)' },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok || !response.body) {
      throw new Error(`İndirme başarısız (${response.status} ${response.statusText})`);
    }

    const totalBytes = Number(response.headers.get('content-length') || 0);
    let receivedBytes = 0;
    const startedAt = Date.now();
    let lastEmit = 0;
    let throttleWindowStart = Date.now();
    let throttleWindowBytes = 0;

    if (currentDownloadSpeedLimitBps === 0) {
      currentDownloadSpeedLimitBps = readDesktopSettings().downloadSpeedLimitBps;
    }

    const fileStream = fs.createWriteStream(partPath, { flags: 'w' });
    const reader = response.body.getReader();

    await new Promise((resolve, reject) => {
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              fileStream.end(() => resolve());
              break;
            }
            receivedBytes += value.byteLength;
            throttleWindowBytes += value.byteLength;

            if (!fileStream.write(Buffer.from(value))) {
              await new Promise((resDrain) => fileStream.once('drain', resDrain));
            }

            const limitBps = currentDownloadSpeedLimitBps;
            if (limitBps > 0) {
              const elapsedWindowMs = Date.now() - throttleWindowStart;
              const expectedMs = (throttleWindowBytes / limitBps) * 1000;
              if (expectedMs > elapsedWindowMs) {
                const waitMs = Math.min(1000, Math.round(expectedMs - elapsedWindowMs));
                if (waitMs > 0) {
                  await new Promise((resSleep) => setTimeout(resSleep, waitMs));
                }
              }
              if (Date.now() - throttleWindowStart >= 1000) {
                throttleWindowStart = Date.now();
                throttleWindowBytes = 0;
              }
            }

            const now = Date.now();
            if (now - lastEmit >= 100) {
              lastEmit = now;
              const elapsedSec = Math.max(0.2, (now - startedAt) / 1000);
              const speedBps = Math.round(receivedBytes / elapsedSec);
              const percent = totalBytes > 0 ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : 50;
              sendProgress(sender, {
                appId: taskId,
                appName: name,
                phase: 'downloading',
                percent,
                receivedBytes,
                totalBytes,
                speedBps,
                message: `${safeName} indiriliyor...`,
              });
            }
          }
        } catch (err) {
          await new Promise((resClose) => {
            try {
              fileStream.close(() => resClose());
            } catch {
              fileStream.destroy();
              resClose();
            }
          });
          reject(err);
        }
      };
      pump();
    });

    activeDownloads.delete(taskId);
    await fsp.rm(targetPath, { force: true }).catch(() => {});
    await fsp.rename(partPath, targetPath);
    activeDownloadFiles.delete(partPath);

    const expectedSha256 = normalizeSha256(prereq?.sha256);
    if (expectedSha256) {
      sendProgress(sender, {
        appId: taskId,
        appName: name,
        phase: 'verifying',
        percent: 100,
        receivedBytes,
        totalBytes: totalBytes || receivedBytes,
        speedBps: 0,
        message: `${safeName} SHA-256 doğrulaması yapılıyor...`,
      });
      const actualSha = await computeFileSha256(targetPath);
      if (actualSha !== expectedSha256) {
        await fsp.rm(targetPath, { force: true }).catch(() => {});
        throw new Error(`${name} SHA-256 doğrulaması başarısız oldu.`);
      }
    }

    const lower = safeName.toLowerCase();
    let extractDir = '';

    if (process.platform === 'win32') {
      let installerExe = targetPath;
      let installerWorkDir = prereqDir;

      if (prereq?.packageType === 'zip-exe' || lower.endsWith('.zip')) {
        sendProgress(sender, {
          appId: taskId,
          appName: name,
          phase: 'installing',
          percent: 100,
          receivedBytes,
          totalBytes: totalBytes || receivedBytes,
          speedBps: 0,
          message: `${name} arşivi çıkarılıyor...`,
        });

        extractDir = path.join(prereqDir, `extracted-${safeId}`);
        await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {});
        await fsp.mkdir(extractDir, { recursive: true });

        await new Promise((resolve, reject) => {
          execFile(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-ExecutionPolicy',
              'Bypass',
              '-Command',
              'Expand-Archive -LiteralPath $env:KORU_PREREQ_ZIP -DestinationPath $env:KORU_PREREQ_DEST -Force',
            ],
            {
              windowsHide: true,
              timeout: 60_000,
              env: {
                ...process.env,
                KORU_PREREQ_ZIP: targetPath,
                KORU_PREREQ_DEST: extractDir,
              },
            },
            (err, _stdout, stderr) => {
              if (err) {
                reject(new Error(stderr?.trim() || err.message || 'Arşiv açılamadı.'));
                return;
              }
              resolve();
            }
          );
        });

        const preferredCandidates =
          process.arch === 'ia32'
            ? [prereq?.executableX86, prereq?.executableX64]
            : [prereq?.executableX64, prereq?.executableX86];

        const located = findExtractedSetupFile(extractDir, preferredCandidates);
        if (!located) {
          throw new Error(`${name} arşivi içinde çalıştırılabilir kurulum dosyası bulunamadı.`);
        }
        installerExe = located;
        installerWorkDir = path.dirname(located);
      }

      sendProgress(sender, {
        appId: taskId,
        appName: name,
        phase: 'installing',
        percent: 100,
        receivedBytes,
        totalBytes: totalBytes || receivedBytes,
        speedBps: 0,
        message: `${name} kuruluyor (Windows yönetici onayı gerekebilir)...`,
      });

      const isMsi = installerExe.toLowerCase().endsWith('.msi');
      const runArgs = Array.isArray(prereq?.silentArgs) && prereq.silentArgs.length > 0
        ? prereq.silentArgs
        : isMsi
        ? ['/i', installerExe, '/qn', '/norestart']
        : [];

      if (prereq?.requiresAdmin !== false) {
        if (isMsi) {
          await runElevatedWindowsCommand(
            'msiexec.exe',
            ['/i', installerExe, '/qn', '/norestart'],
            installerWorkDir
          );
        } else {
          await runElevatedWindowsCommand(installerExe, runArgs, installerWorkDir);
        }
      } else if (isMsi) {
        await runCommandAsync('msiexec.exe', ['/i', installerExe, '/qn', '/norestart'], { silent: true });
      } else {
        await runCommandAsync(installerExe, runArgs, { silent: true });
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    } else {
      await shell.openPath(targetPath);
    }

    if (extractDir) {
      await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    }

    const postStatus = await checkSinglePrerequisite(prereq);
    activeDownloadFiles.delete(targetPath);

    return {
      id: postStatus.id,
      installed: postStatus.installed,
      version: postStatus.version,
      rebootRecommended: Boolean(prereq?.rebootMayBeRequired),
      message: postStatus.installed
        ? `${name} başarıyla kuruldu ve doğrulandı.`
        : `${name} kurulumu çalıştırıldı ancak sistemde doğrulanamadı. Gerekirse bilgisayarınızı yeniden başlatıp kontrolü yenileyin.`,
    };
  } catch (err) {
    activeDownloads.delete(taskId);
    activeDownloadFiles.delete(targetPath);
    activeDownloadFiles.delete(partPath);
    await fsp.rm(partPath, { force: true }).catch(() => {});
    throw err;
  }
});

ipcMain.handle('store:get-downloads-cache-info', async () => {
  const dir = DOWNLOADS_DIR();
  await fsp.mkdir(dir, { recursive: true });
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];
  let totalBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(dir, entry.name);
    try {
      const stat = await fsp.stat(fullPath);
      totalBytes += stat.size;
      files.push({
        name: entry.name,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      // Ignore transient stat failure
    }
  }

  files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  return {
    fileCount: files.length,
    totalBytes,
    downloadsDir: dir,
    files,
  };
});

ipcMain.handle('store:clear-downloads-cache', async () => {
  const dir = DOWNLOADS_DIR();
  await fsp.mkdir(dir, { recursive: true });
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  let deletedCount = 0;
  let freedBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(dir, entry.name);
    if (activeDownloadFiles.has(fullPath) || pausedPartFiles.has(fullPath)) continue;
    try {
      const stat = await fsp.stat(fullPath);
      await fsp.rm(fullPath, { force: true });
      deletedCount += 1;
      freedBytes += stat.size;
    } catch {
      // Skip locked or in-use files
    }
  }

  return { deletedCount, freedBytes };
});

ipcMain.handle('store:set-taskbar-progress', (_event, progress, label) => {
  const numeric = typeof progress === 'number' && Number.isFinite(progress) ? progress : -1;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (numeric < 0) {
      mainWindow.setProgressBar(-1);
    } else {
      mainWindow.setProgressBar(Math.max(0, Math.min(1, numeric)));
    }
  }
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(label ? `Koru — ${String(label)}` : 'Koru — Uygulama Mağazası');
  }
});

function parseKoruDeepLink(rawUrl) {
  try {
    const trimmed = String(rawUrl || '').trim();
    if (!/^koru:\/\//i.test(trimmed)) return null;
    const parsed = new URL(trimmed);
    const host = String(parsed.hostname || '').toLowerCase();
    const pathSegments = parsed.pathname.split('/').filter(Boolean);

    if (host === 'app' && pathSegments[0]) {
      return { rawUrl: trimmed, action: 'app', appId: decodeURIComponent(pathSegments[0]) };
    }
    if (host === 'installed') {
      return { rawUrl: trimmed, action: 'installed' };
    }
    if (host === 'settings') {
      return { rawUrl: trimmed, action: 'settings' };
    }
    if (host === 'store') {
      return { rawUrl: trimmed, action: 'store' };
    }
    if (host.includes('.')) {
      return { rawUrl: trimmed, action: 'app', appId: decodeURIComponent(host) };
    }
    return { rawUrl: trimmed, action: 'store' };
  } catch {
    return null;
  }
}

function dispatchDeepLink(rawUrl) {
  const target = parseKoruDeepLink(rawUrl);
  if (!target) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    showAndFocusMainWindow();
    if (mainWindow.webContents.isLoadingMainFrame()) {
      pendingDeepLink = target;
    } else {
      mainWindow.webContents.send('store:deep-link', target);
    }
  } else {
    pendingDeepLink = target;
  }
}

ipcMain.handle('store:get-pending-deep-link', () => {
  const next = pendingDeepLink;
  pendingDeepLink = null;
  return next;
});

ipcMain.handle('store:get-autostart', async () => {
  const supported = isAutostartSupported();
  if (!supported) {
    return { enabled: false, supported: false };
  }
  const enabled = await readAutostartEnabled();
  return { enabled, supported: true };
});

ipcMain.handle('store:set-autostart', async (_event, enabled) => {
  const supported = isAutostartSupported();
  if (!supported) {
    return { enabled: false, supported: false };
  }
  const desktopSettings = readDesktopSettings();
  const actualEnabled = await applyAutostartSettings(Boolean(enabled), desktopSettings.autostartInTray);
  return { enabled: actualEnabled, supported: true };
});

ipcMain.handle('store:choose-install-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const settings = readDesktopSettings();
  const defaultDir =
    settings.customInstallDir && fs.existsSync(settings.customInstallDir)
      ? settings.customInstallDir
      : app.getPath('desktop');
  const result = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
    title: 'Özel Kurulum Dizini Seçin',
    defaultPath: defaultDir,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('store:choose-download-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const defaultDir = fs.existsSync(DOWNLOADS_DIR()) ? DOWNLOADS_DIR() : app.getPath('downloads');
  const result = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
    title: 'Kurulum Dosyasının İndirileceği Klasörü Seçin',
    defaultPath: defaultDir,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('store:get-desktop-settings', async () => {
  const settings = readDesktopSettings();
  return {
    ...settings,
    traySupported: true,
  };
});

ipcMain.handle('store:update-desktop-settings', async (_event, patch) => {
  const prevSettings = readDesktopSettings();
  const nextSettings = writeDesktopSettings(patch);
  if (
    prevSettings.autostartInTray !== nextSettings.autostartInTray &&
    isAutostartSupported() &&
    (await readAutostartEnabled())
  ) {
    await applyAutostartSettings(true, nextSettings.autostartInTray);
  }
  syncTrayVisibility();
  return {
    ...nextSettings,
    traySupported: true,
  };
});

ipcMain.handle('store:quit-app', async () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle('store:show-notification', async (_event, payload) => {
  try {
    if (!Notification.isSupported()) {
      return { shown: false };
    }
    const title = String(payload?.title || 'Koru');
    const body = String(payload?.body || '');
    const icon = resolveAppIconPath(false);
    const toast = new Notification({
      title,
      body,
      ...(icon && fs.existsSync(icon) ? { icon } : {}),
    });
    toast.on('click', () => {
      showAndFocusMainWindow();
    });
    toast.show();
    return { shown: true };
  } catch {
    return { shown: false };
  }
});

async function createWindow({ showImmediately = true } = {}) {
  const iconPath = resolveAppIconPath(false);
  const window = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 880,
    minHeight: 620,
    title: 'Koru',
    icon: iconPath,
    frame: false,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'desktop', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = window;

  window.once('ready-to-show', () => {
    if (showImmediately && !window.isDestroyed()) {
      window.show();
      window.focus();
    }
    syncTrayVisibility();
  });

  window.on('show', () => {
    syncTrayVisibility();
  });

  window.on('hide', () => {
    syncTrayVisibility();
  });

  window.on('close', (event) => {
    const settings = readDesktopSettings();
    if (!isQuitting && settings.closeBehavior === 'tray') {
      event.preventDefault();
      window.hide();
      ensureTray();
    }
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.on('maximize', () => {
    window.webContents.send('window:maximized-change', true);
  });
  window.on('unmaximize', () => {
    window.webContents.send('window:maximized-change', false);
  });

  if (app.isPackaged) {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    await window.loadFile(indexPath);
    return window;
  }

  try {
    await window.webContents.session.clearCache();
  } catch {
    // Ignore cache clear failure
  }
  await window.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:3000');
  return window;
}

const initialDeepLinkArg = process.argv.find(
  (arg) => typeof arg === 'string' && /^koru:\/\//i.test(arg)
);
if (initialDeepLinkArg) {
  pendingDeepLink = parseKoruDeepLink(initialDeepLinkArg);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const deepLinkArg = Array.isArray(argv)
      ? argv.find((arg) => typeof arg === 'string' && /^koru:\/\//i.test(arg))
      : undefined;
    if (deepLinkArg) {
      dispatchDeepLink(deepLinkArg);
      return;
    }
    const launchedInTray = argv.includes('--tray') || argv.includes('--hidden');
    if (!launchedInTray) {
      showAndFocusMainWindow();
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    dispatchDeepLink(url);
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.whenReady().then(async () => {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('koru', process.execPath, [path.resolve(process.argv[1])]);
    } else if (!app.isPackaged) {
      app.setAsDefaultProtocolClient('koru', process.execPath, [path.resolve(app.getAppPath())]);
    } else {
      app.setAsDefaultProtocolClient('koru');
    }

    ensureWindowsAppUserModelRegistration();
    await cleanupDuplicateWindowsStartupEntries().catch((err) => {
      console.error('Failed to cleanup duplicate startup entries:', err);
    });
    const loginSettings = process.platform === 'darwin' ? app.getLoginItemSettings() : {};
    const launchedInTray =
      !pendingDeepLink &&
      (process.argv.includes('--tray') ||
        process.argv.includes('--hidden') ||
        Boolean(loginSettings?.wasOpenedAsHidden));

    const desktopSettings = readDesktopSettings();
    if (desktopSettings.showTrayIcon || launchedInTray) {
      ensureTray();
    }

    try {
      await createWindow({ showImmediately: !launchedInTray });
    } catch (error) {
      console.error('Failed to load the Koru application window:', error);
      app.quit();
    }
  });

  app.on('activate', () => {
    showAndFocusMainWindow();
  });

  app.on('window-all-closed', () => {
    if (!isQuitting && tray && !tray.isDestroyed()) {
      return;
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
