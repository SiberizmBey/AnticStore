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
  getInstalledApps: () => ipcRenderer.invoke('store:get-installed'),
  installApp: (req) => ipcRenderer.invoke('store:install-app', req),
  cancelDownload: (appId) => ipcRenderer.invoke('store:cancel-download', appId),
  uninstallApp: (req) => ipcRenderer.invoke('store:uninstall-app', req),
  launchApp: (req) => ipcRenderer.invoke('store:launch-app', req),
  openExternal: (url) => ipcRenderer.invoke('store:open-external', url),
  openDownloadsFolder: () => ipcRenderer.invoke('store:open-downloads'),
  onTaskProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('store:task-progress', listener);
    return () => ipcRenderer.removeListener('store:task-progress', listener);
  },
});
