const { contextBridge, ipcRenderer } = require('electron');
const isQCPopup = process.argv.includes('--qc-popup');

contextBridge.exposeInMainWorld('electronAPI', {
  __isQCPopup: isQCPopup,
  platform: process.platform,
  versions: { node: process.versions.node, chrome: process.versions.chrome, electron: process.versions.electron },
  getVersion: () => ipcRenderer.invoke('get-version'),
  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  // P1-05: onMaximizeChange returns unsubscribe function
  onMaximizeChange: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on('window-maximized-change', handler);
    return () => ipcRenderer.removeListener('window-maximized-change', handler);
  },
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  // Database operations
  dbQuery: (method, table, args) => ipcRenderer.invoke('db-query', method, table, args),
  dbUpload: (table, fileData) => ipcRenderer.invoke('db-upload', table, fileData),
  // Auto-update
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  // P1-06: Update event listeners return unsubscribe functions
  onUpdateAvailable: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateProgress: (cb) => {
    const handler = (_, p) => cb(p);
    ipcRenderer.on('update-download-progress', handler);
    return () => ipcRenderer.removeListener('update-download-progress', handler);
  },
  onUpdateDownloaded: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('set-minimize-to-tray', enabled),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke('set-open-at-login', enabled),
  toggleQCWindow: (enabled) => ipcRenderer.invoke('toggle-qc-window', enabled),
  openQCForm: () => ipcRenderer.invoke('open-qc-form'),
  closeQCForm: () => ipcRenderer.invoke('close-qc-form'),
  notifyRequirementsChanged: () => ipcRenderer.invoke('notify-requirements-changed'),
  testModelConnection: (baseUrl, apiKey, modelId) => ipcRenderer.invoke('test-model-connection', baseUrl, apiKey, modelId),
  resizeQC: (width, height) => ipcRenderer.invoke('resize-qc-window', width, height),
  // Clipboard operations
  readClipboardImages: () => ipcRenderer.invoke('read-clipboard-images'),
  readClipboardText: () => ipcRenderer.invoke('read-clipboard-text'),
  readClipboardHTML: () => ipcRenderer.invoke('read-clipboard-html'),
  readClipboardFiles: () => ipcRenderer.invoke('read-clipboard-files'),
  readLocalFile: (filePath) => ipcRenderer.invoke('read-local-file', filePath),
  // P0-06: Forward requirements-changed event from main process (replaces executeJavaScript)
  onRequirementsChanged: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('requirements-changed', handler);
    return () => ipcRenderer.removeListener('requirements-changed', handler);
  },
});
