// updater.js — Auto-updater with GitHub API fallback for local/dev builds
const { app, ipcMain } = require('electron');
const { log } = require('./database.cjs');
const { getMainWindow, getQCWindow } = require('./window.cjs');

const isDev = process.defaultApp || /electron/.test(process.argv[0]);
const GITHUB_API = 'https://api.github.com/repos/eafenzhang/workit/releases/latest';

// Broadcast to all renderer windows
function broadcast(channel, payload) {
  [getMainWindow(), getQCWindow()].forEach(getWin => {
    try {
      const win = getWin();
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    } catch {}
  });
}

let _updater = null;
let _checkTimer = null;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// GitHub API fallback — works even without electron-updater / app-update.yml
async function checkGitHubRelease() {
  try {
    const resp = await fetch(GITHUB_API, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Workit-Updater' },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return { available: false, error: 'GitHub API错误: HTTP ' + resp.status, current: app.getVersion() };
    const release = await resp.json();
    const tag = (release.tag_name || '').replace(/^v/, '');
    const current = app.getVersion();
    if (!tag) return { available: false, current };
    const isNewer = tag !== current;
    return {
      available: isNewer,
      version: tag,
      current,
      releaseNotes: (release.body || '').substring(0, 2000),
    };
  } catch (e) {
    return { available: false, error: '检查失败: ' + (e.message || '网络错误'), current: app.getVersion() };
  }
}

function setupAutoUpdater() {
  // Default handler — uses GitHub API fallback by default, replaced by electron-updater if available
  let updateHandler = checkGitHubRelease;
  ipcMain.handle('check-for-update', async () => updateHandler());

  if (isDev) { log('AutoUpdater: dev mode, using GitHub API fallback'); return; }

  try {
    const { autoUpdater } = require('electron-updater');
    _updater = autoUpdater;

    try {
      if (!autoUpdater.currentVersion) {
        log('AutoUpdater: no update feed, using GitHub API fallback');
        return;
      }
    } catch {
      log('AutoUpdater: app-update.yml not found, using GitHub API fallback');
      return;
    }

    // ── Config ──
    autoUpdater.autoDownload = false;       // We control download explicitly
    autoUpdater.autoInstallOnAppQuit = true; // If already downloaded, install on quit
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;

    // ── Logger ──
    autoUpdater.logger = {
      debug: () => {},
      info: (m) => log('Updater: ' + m),
      warn: (m) => log('Updater warn: ' + m),
      error: (m) => log('Updater error: ' + m),
    };

    // ── Events → broadcast to all renderer windows ──
    autoUpdater.on('checking-for-update', () => {
      log('Updater: checking...');
      broadcast('update:checking');
    });

    autoUpdater.on('update-available', (info) => {
      log('Updater: v' + info.version + ' available, auto-downloading');
      broadcast('update:available', {
        version: info.version,
        currentVersion: app.getVersion(),
        releaseNotes: (info.releaseNotes || info.releaseName || '').replace(/<[^>]+>/g, ''),
      });
      // Don't auto-download — wait for user to click "立即升级" in dialog
    });

    autoUpdater.on('update-not-available', () => {
      log('Updater: already latest');
      broadcast('update:not-available');
    });

    autoUpdater.on('download-progress', (p) => {
      broadcast('update:progress', { percent: Math.round(p.percent), transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond });
    });

    autoUpdater.on('update-downloaded', (info) => {
      log('Updater: v' + info.version + ' downloaded, ready to install');
      broadcast('update:downloaded', { version: info.version });
    });

    autoUpdater.on('error', (e) => {
      log('Updater error: ' + (e.message || e));
      broadcast('update:error', { message: e.message || 'Unknown error' });
    });

    // Replace fallback handler with real electron-updater handler
    updateHandler = async () => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const r = await autoUpdater.checkForUpdates();
          const current = app.getVersion();
          if (r?.updateInfo?.version) {
            const v = r.updateInfo.version;
            return { available: v !== current, version: v, current };
          }
          return { available: false, current };
        } catch (e) {
          const msg = e.message || '';
          const isTransient = msg.includes('504') || msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET');
          if (isTransient && attempt < 2) {
            log('Updater: transient error on attempt ' + attempt + ', retrying: ' + msg);
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          log('Updater: electron-updater failed, falling back to GitHub API: ' + msg);
          return checkGitHubRelease();
        }
      }
      return checkGitHubRelease();
    };

    ipcMain.handle('download-update', async () => {
      try {
        // Try electron-updater first
        if (_updater) { await autoUpdater.downloadUpdate(); return { ok: true }; }
        // Fallback: download from GitHub releases
        const resp = await fetch(GITHUB_API, { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Workit-Updater' } });
        const release = await resp.json();
        const asset = release.assets?.find(a => a.name?.endsWith('.exe'));
        if (!asset) return { ok: false, error: '未找到安装包' };
        // Download with progress
        const dlResp = await fetch(asset.browser_download_url);
        const total = parseInt(dlResp.headers.get('content-length') || '0');
        let downloaded = 0;
        const reader = dlResp.body.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          downloaded += value.length;
          if (total > 0) broadcast('update:progress', { percent: Math.round(downloaded / total * 100) });
        }
        const { writeFileSync } = require('fs');
        const { join } = require('path');
        const installerPath = join(app.getPath('temp'), 'Workitt-Update.exe');
        writeFileSync(installerPath, Buffer.concat(chunks));
        broadcast('update:downloaded', { version: release.tag_name });
        return { ok: true, installerPath };
      } catch (e) { return { ok: false, error: e.message }; }
    });

    ipcMain.handle('install-update', (_, installerPath) => {
      if (installerPath) {
        const { exec } = require('child_process');
        exec('start "" "' + installerPath + '"', () => app.quit());
        return true;
      }
      if (_updater) { autoUpdater.quitAndInstall(); return true; }
      return false;
    });

    // ── Retry helper for update checks ──
    const checkWithRetry = (label, maxRetries = 3) => {
      let attempts = 0;
      const tryCheck = () => {
        attempts++;
        log('Updater: ' + label + ' (attempt ' + attempts + '/' + maxRetries + ')');
        autoUpdater.checkForUpdates().catch(e => {
          log('Updater: ' + label + ' failed (attempt ' + attempts + '): ' + (e.message || e));
          if (attempts < maxRetries) {
            const delay = attempts * 30000; // 30s, 60s, 90s backoff
            log('Updater: retrying in ' + (delay/1000) + 's');
            setTimeout(tryCheck, delay);
          }
        });
      };
      tryCheck();
    };

    // ── Startup: delayed auto-check + download (with retry) ──
    setTimeout(() => checkWithRetry('startup check'), 15000);

    // ── Periodic check every 4 hours ──
    _checkTimer = setInterval(() => checkWithRetry('periodic check'), CHECK_INTERVAL_MS);

    log('AutoUpdater: initialized');
  } catch (e) { log('AutoUpdater init failed', e); }
}

// Cleanup on app quit
function teardownAutoUpdater() {
  if (_checkTimer) { clearInterval(_checkTimer); _checkTimer = null; }
}

module.exports = { setupAutoUpdater, teardownAutoUpdater };
