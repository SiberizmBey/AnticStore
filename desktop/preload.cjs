const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anticStoreDesktop', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window:maximized-change', listener);
    return () => ipcRenderer.removeListener('window:maximized-change', listener);
  },

  getPlatformInfo: () => ipcRenderer.invoke('store:platform-info'),
  fetchJson: (url) => ipcRenderer.invoke('store:fetch-json', url),
  fetchJsonOptional: (url) => ipcRenderer.invoke('store:fetch-json-optional', url),
  getGitHubTokenStatus: () => ipcRenderer.invoke('store:get-github-token-status'),
  saveGitHubToken: (token) => ipcRenderer.invoke('store:save-github-token', token),
  clearGitHubToken: () => ipcRenderer.invoke('store:clear-github-token'),
  getInstalledApps: (catalogApps) => ipcRenderer.invoke('store:get-installed', catalogApps),
  installApp: (req) => ipcRenderer.invoke('store:install-app', req),
  pauseDownload: (appId) => ipcRenderer.invoke('store:pause-download', appId),
  cancelDownload: (appId) => ipcRenderer.invoke('store:cancel-download', appId),
  uninstallApp: (req) => ipcRenderer.invoke('store:uninstall-app', req),
  launchApp: (req) => ipcRenderer.invoke('store:launch-app', req),
  openExternal: (url) => ipcRenderer.invoke('store:open-external', url),
  openDownloadsFolder: () => ipcRenderer.invoke('store:open-downloads'),
  openInstallFolder: (req) => ipcRenderer.invoke('store:open-install-folder', req),
  createDesktopShortcut: (req) => ipcRenderer.invoke('store:create-desktop-shortcut', req),
  chooseInstallDirectory: () => ipcRenderer.invoke('store:choose-install-directory'),
  chooseDownloadDirectory: () => ipcRenderer.invoke('store:choose-download-directory'),
  checkAppRunning: (req) => ipcRenderer.invoke('store:check-app-running', req),
  stopAppProcesses: (req) => ipcRenderer.invoke('store:stop-app', req),
  checkSystemDependencies: () => ipcRenderer.invoke('store:check-system-dependencies'),
  checkPrerequisites: (items) => ipcRenderer.invoke('store:check-prerequisites', items),
  installPrerequisite: (item) => ipcRenderer.invoke('store:install-prerequisite', item),
  getDownloadsCacheInfo: () => ipcRenderer.invoke('store:get-downloads-cache-info'),
  clearDownloadsCache: () => ipcRenderer.invoke('store:clear-downloads-cache'),
  setTaskbarProgress: (progress, label) => ipcRenderer.invoke('store:set-taskbar-progress', progress, label),
  getPendingDeepLink: () => ipcRenderer.invoke('store:get-pending-deep-link'),
  onDeepLink: (callback) => {
    const listener = (_event, target) => callback(target);
    ipcRenderer.on('store:deep-link', listener);
    return () => ipcRenderer.removeListener('store:deep-link', listener);
  },
  getAutostartStatus: () => ipcRenderer.invoke('store:get-autostart'),
  setAutostartEnabled: (enabled) => ipcRenderer.invoke('store:set-autostart', enabled),
  getDesktopSettings: () => ipcRenderer.invoke('store:get-desktop-settings'),
  updateDesktopSettings: (patch) => ipcRenderer.invoke('store:update-desktop-settings', patch),
  quitApp: () => ipcRenderer.invoke('store:quit-app'),
  showNotification: (payload) => ipcRenderer.invoke('store:show-notification', payload),
  onSyncRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('store:request-sync', listener);
    return () => ipcRenderer.removeListener('store:request-sync', listener);
  },
  onTaskProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('store:task-progress', listener);
    return () => ipcRenderer.removeListener('store:task-progress', listener);
  },
});

