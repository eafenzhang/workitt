// Strip ELECTRON_RUN_AS_NODE to fix double-click launch in Explorer.
// Note: when spawned from WorkBuddy, this env var prevents Electron from
// bootstrapping — the fix is in the workit-build skill (clears it before launch).
if (process.env.ELECTRON_RUN_AS_NODE === '1' && !process.defaultApp) {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { initDatabase, log, query } = require('./database.cjs');
const { setupIPC } = require('./ipc.cjs');
const { createWindow } = require('./window.cjs');
const { setupAutoUpdater } = require('./updater.cjs');
const { McpClientManager, setStatusPushFn } = require('./mcp-manager.cjs');
const { startMemoryConsolidator } = require('./memory-consolidator.cjs');
const { startSkillGenerator } = require('./skill-generator.cjs');
const { startWorkflowOptimizer } = require('./workflow-optimizer.cjs');
const { startKnowledgeGraph } = require('./knowledge-graph.cjs');
const { getPythonManager } = require('./python-manager.cjs');

let mainWindow;
let db;
let mcpManager;

app.whenReady().then(async () => {
  const preloadPath = path.join(app.getAppPath(), 'electron', 'preload.cjs');
  log('App ready');
  try {
    db = await initDatabase();
    mcpManager = McpClientManager.getInstance();

    // Set up the IPC status push callback — broadcasts to all renderer windows
    setStatusPushFn((serverId, status, error, tools) => {
      const { getMainWindow: gw, getQCWindow: gq } = require('./window.cjs');
      const payload = { id: serverId, status, error, toolCount: tools ? tools.length : 0, tools };
      const mainWin = gw();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('mcp:status-update', payload);
      }
      const qcWin = gq();
      if (qcWin && !qcWin.isDestroyed()) {
        qcWin.webContents.send('mcp:status-update', payload);
      }
    });

    mainWindow = createWindow(preloadPath);
    setupIPC(mainWindow, db);
    // Try to populate GitHub token for updater (from git credential store)
    try {
      const { execSync } = require('child_process');
      const out = execSync('git credential fill', {
        input: 'protocol=https\nhost=github.com\n\n',
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      });
      const match = out.match(/^password=(.+)$/m);
      if (match) {
        const token = match[1].trim();
        if (token && !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
          process.env.GH_TOKEN = token;
          log('Updater: loaded GitHub token from credential store');
        }
      }
    } catch (e) { /* credential read is best-effort */ }
    setupAutoUpdater();
    startMemoryConsolidator(db);
    startSkillGenerator(db);
    startWorkflowOptimizer(db);
    startKnowledgeGraph(db);

    // Start CowAgent Python backend (non-blocking — will log success/failure)
    const pyMgr = getPythonManager();
    pyMgr.start().catch(e => log('CowAgent backend start failed (non-fatal): ' + e.message));

    // Auto-connect to all enabled MCP servers on startup
    const enabledServers = query(db, 'SELECT * FROM mcp_servers WHERE enabled = 1');
    for (const row of enabledServers) {
      const id = row[0];
      const name = row[1];
      const command = row[3];
      const args = (() => { try { return JSON.parse(row[4] || '[]'); } catch { return []; } })();
      const env = (() => { try { return JSON.parse(row[5] || '{}'); } catch { return {}; } })();
      log('Auto-connecting MCP server #' + id + ' (' + name + ')');
      mcpManager.connect(id, { command, args, env, name }).catch(e => {
        log('Auto-connect failed for server #' + id, e);
      });
    }
  } catch (e) { log('App ready handler failed', e); }
});

// Pass mcpManager and PythonManager to cleanup on shutdown
app.on('before-quit', async (event) => {
  event.preventDefault();
  try {
    const pyMgr = getPythonManager();
    await pyMgr.stop();
  } catch (e) { log('PythonManager shutdown error', e); }
  if (mcpManager) {
    try {
      await mcpManager.shutdown();
    } catch (e) { log('McpManager shutdown error', e); }
  }
  app.quit();
});

app.on('web-contents-created', (_, contents) => {
  // Handle webview guest contents — intercept window.open / target="_blank"
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      const { getMainWindow: gmw } = require('./window.cjs');
      const mw = gmw();
      if (mw && !mw.isDestroyed()) {
        mw.webContents.send('browser:new-window', url);
      }
      return { action: 'deny' };
    });
    return;
  }
  // Restrict navigation for main app windows
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://') && !url.startsWith('http://localhost')) event.preventDefault();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
