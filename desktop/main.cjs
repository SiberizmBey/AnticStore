const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawn, execFile } = require('node:child_process');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const REGISTRY_FILE = () => path.join(app.getPath('userData'), 'installed-apps.json');
const DOWNLOADS_DIR = () => path.join(app.getPath('userData'), 'downloads');

const activeDownloads = new Map();

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

function matchWindowsRegistryEntry(winEntries, appId, name) {
  const idShort = normalizeName(String(appId || '').split('.').pop());
  const normName = normalizeName(name);

  return winEntries.find((entry) => {
    const child = normalizeName(entry.PSChildName);
    const display = normalizeName(entry.DisplayName);
    if (appId && child.includes(normalizeName(appId))) return true;
    if (normName && (display === normName || display.startsWith(normName))) return true;
    if (idShort && idShort.length >= 2 && (display === idShort || child.includes(idShort))) return true;
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
  return {
    isDesktop: true,
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    packageId: 'com.anticvalley.store',
    downloadsDir: DOWNLOADS_DIR(),
  };
});

ipcMain.handle('store:fetch-json', async (_event, url) => {
  const parsed = new URL(String(url));
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Geçersiz protokol.');
  }
  const res = await fetch(parsed.toString(), {
    headers: {
      'User-Agent': 'AnticStore/1.0 (com.anticvalley.store)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
});

ipcMain.handle('store:get-installed', async () => {
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
        installLocation: winMatch.InstallLocation || record.installLocation,
        uninstallString: winMatch.QuietUninstallString || winMatch.UninstallString || record.uninstallString,
        executablePath:
          record.executablePath || findExecutableInDir(winMatch.InstallLocation, record.name),
        detectedFromSystem: true,
      });
    } else if (process.platform !== 'win32' || !record.uninstallString) {
      merged.push(record);
    }
  }

  // Auto-detect known Windows apps (like Lir) even if installed outside AnticStore
  const knownApps = [
    { appId: 'com.anticvalley.lir', name: 'Lir' },
  ];
  for (const known of knownApps) {
    if (merged.some((r) => r.appId === known.appId)) continue;
    const winMatch = matchWindowsRegistryEntry(winEntries, known.appId, known.name);
    if (winMatch) {
      merged.push({
        appId: known.appId,
        name: winMatch.DisplayName || known.name,
        version: winMatch.DisplayVersion || '0.0.0',
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        installLocation: winMatch.InstallLocation || undefined,
        executablePath: findExecutableInDir(winMatch.InstallLocation, known.name),
        uninstallString: winMatch.QuietUninstallString || winMatch.UninstallString || undefined,
        detectedFromSystem: true,
        sourceMode: 'desktop',
      });
    }
  }

  return merged;
});

ipcMain.handle('store:cancel-download', (_event, appId) => {
  const controller = activeDownloads.get(appId);
  if (controller) {
    controller.abort();
    activeDownloads.delete(appId);
  }
});

ipcMain.handle('store:install-app', async (event, req) => {
  const { appId, name, version, downloadUrl, fileName, silent = false, mode = 'install' } = req;
  const sender = event.sender;
  const safeName = String(fileName || `${appId}-${version}.bin`).replace(/[^A-Za-z0-9._-]/g, '_');

  await fsp.mkdir(DOWNLOADS_DIR(), { recursive: true });
  const targetPath = path.join(DOWNLOADS_DIR(), safeName);

  const controller = new AbortController();
  activeDownloads.set(appId, controller);

  try {
    sendProgress(sender, {
      appId,
      phase: 'downloading',
      percent: 0,
      receivedBytes: 0,
      totalBytes: 0,
      speedBps: 0,
      message: `${safeName} indiriliyor...`,
    });

    const response = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'AnticStore/1.0 (com.anticvalley.store)' },
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

    const fileStream = fs.createWriteStream(targetPath);
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
            fileStream.write(Buffer.from(value));

            const now = Date.now();
            if (now - lastEmit >= 120) {
              lastEmit = now;
              const elapsedSec = Math.max(0.2, (now - startedAt) / 1000);
              const speedBps = Math.round(receivedBytes / elapsedSec);
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
          fileStream.destroy();
          reject(err);
        }
      };
      pump();
    });

    activeDownloads.delete(appId);

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

    if (process.platform === 'win32') {
      if (lower.endsWith('.msi')) {
        const args = ['/i', targetPath];
        if (silent) args.push('/qn', '/norestart');
        await runCommandAsync('msiexec.exe', args, { silent });
      } else if (lower.endsWith('.exe')) {
        const args = silent ? ['/S'] : [];
        await runCommandAsync(targetPath, args, { silent });
      } else {
        await shell.openPath(targetPath);
      }

      const winEntries = await scanWindowsUninstallRegistry();
      const winMatch = matchWindowsRegistryEntry(winEntries, appId, name);
      if (winMatch) {
        installLocation = winMatch.InstallLocation || undefined;
        uninstallString = winMatch.QuietUninstallString || winMatch.UninstallString || undefined;
        executablePath = findExecutableInDir(installLocation, name);
      }
    } else if (process.platform === 'linux' && lower.endsWith('.appimage')) {
      const appsDir = path.join(app.getPath('home'), 'Applications');
      await fsp.mkdir(appsDir, { recursive: true });
      const destAppImage = path.join(appsDir, safeName);
      await fsp.copyFile(targetPath, destAppImage);
      await fsp.chmod(destAppImage, 0o755);
      executablePath = destAppImage;
      installLocation = appsDir;
    } else {
      await shell.openPath(targetPath);
    }

    const nowIso = new Date().toISOString();
    const existing = await readLocalRegistry();
    const prev = existing.find((item) => item.appId === appId);
    const newRecord = {
      appId,
      name,
      version,
      installedAt: prev?.installedAt || nowIso,
      updatedAt: nowIso,
      installLocation,
      executablePath,
      uninstallString,
      installerPath: targetPath,
      detectedFromSystem: Boolean(uninstallString),
      sourceMode: 'desktop',
    };

    const next = existing.filter((item) => item.appId !== appId);
    next.push(newRecord);
    await writeLocalRegistry(next);

    return newRecord;
  } catch (err) {
    activeDownloads.delete(appId);
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

async function createWindow() {
  const iconPath = path.join(
    app.getAppPath(),
    app.isPackaged ? 'dist' : 'public',
    'assets',
    'img',
    'icon.png'
  );
  const window = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 880,
    minHeight: 620,
    title: 'AnticStore',
    icon: iconPath,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'desktop', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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
    return;
  }

  await window.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:3000');
}

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    console.error('Failed to load the AnticStore application window:', error);
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error('Failed to recreate the AnticStore application window:', error);
      app.quit();
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
