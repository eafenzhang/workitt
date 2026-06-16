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
  // Fullscreen
  setFullScreen: (flag) => ipcRenderer.invoke('window-set-fullscreen', flag),
  isFullScreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  onFullscreenChange: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on('window-fullscreen-change', handler);
    return () => ipcRenderer.removeListener('window-fullscreen-change', handler);
  },
  // Database operations
  dbQuery: (method, table, args) => ipcRenderer.invoke('db-query', method, table, args),
  dbUpload: (table, fileData) => ipcRenderer.invoke('db-upload', table, fileData),
  // Auto-update
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: (installerPath) => ipcRenderer.invoke('install-update', installerPath),
  // Unified update event subscriber — returns unsubscribe function
  onUpdateEvent: (cb) => {
    const channels = ['update:checking','update:available','update:not-available','update:progress','update:downloaded','update:error',
      'update-available','update-download-progress','update-downloaded']; // legacy channels
    channels.forEach(ch => {
      const handler = (_e, data) => {
        let type = ch.replace('update:','').replace('update-','');
        // Normalize: legacy 'download-progress' → 'progress'
        if (type === 'download-progress') type = 'progress';
        // Normalize: legacy 'downloaded' from update-downloaded → same as update:downloaded
        cb(type, data);
      };
      ipcRenderer.on(ch, handler);
    });
    return () => channels.forEach(ch => ipcRenderer.removeAllListeners(ch));
  },
  // Legacy event listeners (backward compat)
  onUpdateAvailable: (cb) => {
    const handler = (_, v) => cb(typeof v === 'object' ? v.version : v);
    ipcRenderer.on('update:available', handler);
    ipcRenderer.on('update-available', handler);
    return () => { ipcRenderer.removeListener('update:available', handler); ipcRenderer.removeListener('update-available', handler); };
  },
  onUpdateProgress: (cb) => {
    const handler = (_, p) => cb(typeof p === 'object' ? p.percent : p);
    ipcRenderer.on('update:progress', handler);
    ipcRenderer.on('update-download-progress', handler);
    return () => { ipcRenderer.removeListener('update:progress', handler); ipcRenderer.removeListener('update-download-progress', handler); };
  },
  onUpdateDownloaded: (cb) => {
    const handler = (_, data) => cb(data?.version);
    ipcRenderer.on('update:downloaded', handler);
    ipcRenderer.on('update-downloaded', handler);
    return () => { ipcRenderer.removeListener('update:downloaded', handler); ipcRenderer.removeListener('update-downloaded', handler); };
  },
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('set-minimize-to-tray', enabled),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke('set-open-at-login', enabled),
  toggleQCWindow: (enabled) => ipcRenderer.invoke('toggle-qc-window', enabled),
  openQCForm: () => ipcRenderer.invoke('open-qc-form'),
  closeQCForm: () => ipcRenderer.invoke('close-qc-form'),
  notifyRequirementsChanged: () => ipcRenderer.invoke('notify-requirements-changed'),
  testModelConnection: (modelId) => ipcRenderer.invoke('test-model-connection', modelId),
  resizeQC: (width, height) => ipcRenderer.invoke('resize-qc-window', width, height),
  // Clipboard operations
  readClipboardImages: () => ipcRenderer.invoke('read-clipboard-images'),
  readClipboardText: () => ipcRenderer.invoke('read-clipboard-text'),
  readClipboardHTML: () => ipcRenderer.invoke('read-clipboard-html'),
  readClipboardFiles: () => ipcRenderer.invoke('read-clipboard-files'),
  readLocalFile: (filePath) => ipcRenderer.invoke('read-local-file', filePath),
  openPathExternal: (filePath) => ipcRenderer.invoke('open-path-external', filePath),
  installExtension: (extId, dataUrl) => ipcRenderer.invoke('install-extension', extId, dataUrl),
  /** Send chat message to AI — returns { content: string } | { error: string } */
  chatSend: (payload) => ipcRenderer.invoke('chat:send', payload),
  // ── Agent Memory ──
  memoryGetAll: () => ipcRenderer.invoke('memory:getAll'),
  memoryUpsert: (key, value, source) => ipcRenderer.invoke('memory:upsert', { key, value, source }),
  memoryDelete: (key) => ipcRenderer.invoke('memory:delete', key),
  memoryClear: () => ipcRenderer.invoke('memory:clear'),
  memorySummary: () => ipcRenderer.invoke('memory:summary'),
  // ── CLI Tools ──
  cliCheckCommand: (command) => ipcRenderer.invoke('cli:check', command),
  cliInstall: (command) => ipcRenderer.invoke('cli:install', { command }),
  // P0-06: Forward requirements-changed event from main process (replaces executeJavaScript)
  onRequirementsChanged: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('requirements-changed', handler);
    return () => ipcRenderer.removeListener('requirements-changed', handler);
  },
  // ── MCP Runtime ──
  /** Subscribe to MCP server status updates. Returns unsubscribe function. */
  mcpSubscribeStatus: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('mcp:status-update', handler);
    return () => ipcRenderer.removeListener('mcp:status-update', handler);
  },
  /** Get MCP tools from all connected servers */
  mcpGetTools: () => ipcRenderer.invoke('mcp:get-tools'),
  /** Get MCP connection status snapshots */
  mcpGetStatus: () => ipcRenderer.invoke('mcp:get-status'),
  /** Get tools for a specific MCP server (detail panel) */
  mcpGetServerTools: (serverId) => ipcRenderer.invoke('mcp:get-server-tools', serverId),
  /** Execute a tool call on a connected MCP server */
  mcpExecuteTool: (serverId, toolName, args) => ipcRenderer.invoke('mcp:execute-tool', serverId, toolName, args),
  /** Connect to a specific MCP server */
  mcpConnect: (serverId) => ipcRenderer.invoke('mcp:connect', serverId),
  /** Disconnect from a specific MCP server */
  mcpDisconnect: (serverId) => ipcRenderer.invoke('mcp:disconnect', serverId),
  // ── Workflow ──
  workflowList: () => ipcRenderer.invoke('workflow:list'),
  workflowGet: (id) => ipcRenderer.invoke('workflow:get', id),
  workflowSave: (wf) => ipcRenderer.invoke('workflow:save', wf),
  workflowDelete: (id) => ipcRenderer.invoke('workflow:delete', id),
  workflowExecute: (workflowId, inputs) => ipcRenderer.invoke('workflow:execute', { workflowId, inputs }),
  workflowExecutions: (workflowId) => ipcRenderer.invoke('workflow:executions', workflowId),
  // ── AI Feedback ──
  feedbackSubmit: (data) => ipcRenderer.invoke('feedback:submit', data),
  feedbackStats: (opts) => ipcRenderer.invoke('feedback:stats', opts),
  // ── Profile persistence ──
  profileGet: () => ipcRenderer.invoke('profile:get'),
  profileSave: (profile) => ipcRenderer.invoke('profile:save', profile),
  modelCheckBalance: (modelId) => ipcRenderer.invoke('model:check-balance', modelId),
  // ── Browser webview new-window ── (Electron 22+ setWindowOpenHandler IPC relay)
  onBrowserNewWindow: (cb) => {
    const handler = (_event, url) => cb(url);
    ipcRenderer.on('browser:new-window', handler);
    return () => ipcRenderer.removeListener('browser:new-window', handler);
  },
  // ── CowAgent Backend Status & Update ──
  getBackendStatus: () => ipcRenderer.invoke('backend:status'),
  updateCowAgent: () => ipcRenderer.invoke('cowagent:update'),
});
