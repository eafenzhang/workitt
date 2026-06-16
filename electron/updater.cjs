// updater.js — Auto-updater with GitHub API fallback for local/dev builds
const { app, ipcMain } = require('electron');
const { log } = require('./database.cjs');
const { getMainWindow, getQCWindow } = require('./window.cjs');

const isDev = process.defaultApp || /electron/.test(process.argv[0]);
const GITHUB_API = 'https://api.github.com/repos/eafenzhang/Workitt/releases/latest';
const GITHUB_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

function githubHeaders() {
  const h = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Workitt-Updater' };
  if (GITHUB_TOKEN) h['Authorization'] = 'token ' + GITHUB_TOKEN;
  return h;
}

// Semver compare: returns true if vA > vB
function semverGt(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

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
      headers: githubHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return { available: false, error: 'GitHub API错误: HTTP ' + resp.status, current: app.getVersion() };
    const release = await resp.json();
    const tag = (release.tag_name || '').replace(/^v/, '');
    const current = app.getVersion();
    if (!tag) return { available: false, current };
    const isNewer = semverGt(tag, current);
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

// Download installer from GitHub releases with progress
// Uses Node.js https module (avoids TLS cert issues with Azure CDN in Electron's fetch)
async function downloadFromGitHub() {
  const resp = await fetch(GITHUB_API, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) return { ok: false, error: 'GitHub API ' + resp.status };
  const release = await resp.json();
  const tag = release.tag_name || '';
  const asset = release.assets?.find(a => a.name?.endsWith('.exe') && a.name?.includes('Setup'));
  if (!asset) return { ok: false, error: '未找到安装包' };
  log('Updater: downloading from ' + asset.browser_download_url);

  // Download with progress via https (relaxed TLS for Azure CDN compatibility)
  return await downloadWithHttp(asset.browser_download_url, tag);
}

// Download using Node.js https module (more reliable than Electron fetch for CDN redirects)
async function downloadWithHttp(downloadUrl, tag) {
  const https = require('https');
  const { writeFileSync } = require('fs');
  const { join } = require('path');

  return new Promise((resolve) => {
    const parsedUrl = require('url').parse(downloadUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      headers: { 'User-Agent': 'Workitt-Updater' },
      rejectUnauthorized: false,
      timeout: 300000,
    };

    const req = https.request(options, (res) => {
      // Follow redirect manually
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : require('url').resolve(downloadUrl, res.headers.location);
        log('Updater: following redirect to ' + redirectUrl);
        res.resume(); // Drain the response
        return resolve(downloadWithHttp(redirectUrl, tag));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve({ ok: false, error: '下载失败 HTTP ' + res.statusCode });
      }

      const total = parseInt(res.headers['content-length'] || '0');
      let downloaded = 0;
      const chunks = [];
      const startTime = Date.now();

      res.on('data', (chunk) => {
        chunks.push(chunk);
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.round(downloaded / total * 100);
          const speed = downloaded / ((Date.now() - startTime) / 1000);
          broadcast('update:progress', { percent: pct, transferred: downloaded, total, bytesPerSecond: Math.round(speed) });
        }
      });

      res.on('end', () => {
        const installerPath = join(app.getPath('temp'), 'Workitt-Update.exe');
        writeFileSync(installerPath, Buffer.concat(chunks));
        broadcast('update:downloaded', { version: tag.replace(/^v/, '') });
        log('Updater: download complete (' + downloaded + ' bytes to ' + installerPath + ')');
        resolve({ ok: true, installerPath });
      });
    });

    req.on('error', (e) => {
      log('Updater: download error: ' + e.message);
      resolve({ ok: false, error: e.message || '下载失败' });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: '下载超时' });
    });

    req.end();
  });
}

function setupAutoUpdater() {
  // ── Register handlers OUTSIDE electron-updater try block (always available) ──
  ipcMain.handle('download-update', async () => {
    try {
      return await downloadFromGitHub();
    } catch (e) {
      log('Updater: download failed', e);
      return { ok: false, error: e.message || '下载失败' };
    }
  });

  ipcMain.handle('install-update', (_, installerPath) => {
    if (installerPath) {
      const { exec } = require('child_process');
      exec('start "" "' + installerPath + '"', () => app.quit());
      return true;
    }
    return false;
  });

  // ── Check handler — default GitHub API fallback ──
  let updateHandler = checkGitHubRelease;
  ipcMain.handle('check-for-update', async () => updateHandler());

  if (isDev) { log('AutoUpdater: dev mode, using GitHub API fallback'); return; }

  // ── Try to use electron-updater for checking (optional) ──
  try {
    const { autoUpdater } = require('electron-updater');
    _updater = autoUpdater;
    if (!autoUpdater.currentVersion) {
      log('AutoUpdater: no update feed, using GitHub API fallback');
      return;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = {
      debug: () => {},
      info: (m) => log('Updater: ' + m),
      warn: (m) => log('Updater warn: ' + m),
      error: (m) => log('Updater error: ' + m),
    };
    autoUpdater.on('checking-for-update', () => { log('Updater: checking...'); broadcast('update:checking'); });
    autoUpdater.on('update-available', (info) => {
      log('Updater: v' + info.version + ' available');
      broadcast('update:available', { version: info.version, currentVersion: app.getVersion(), releaseNotes: (info.releaseNotes || info.releaseName || '').replace(/<[^>]+>/g, '') });
    });
    autoUpdater.on('update-not-available', () => { log('Updater: already latest'); broadcast('update:not-available'); });
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

    // Replace fallback check handler with electron-updater one
    updateHandler = async () => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const r = await autoUpdater.checkForUpdates();
          const current = app.getVersion();
          if (r?.updateInfo?.version) {
            const v = r.updateInfo.version;
            return { available: semverGt(v, current), version: v, current };
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

    // ── Startup auto-check with retry ──
    const checkWithRetry = (label, maxRetries = 3) => {
      let attempts = 0;
      const tryCheck = () => {
        attempts++;
        log('Updater: ' + label + ' (attempt ' + attempts + '/' + maxRetries + ')');
        autoUpdater.checkForUpdates().catch(e => {
          log('Updater: ' + label + ' failed (attempt ' + attempts + '): ' + (e.message || e));
          if (attempts < maxRetries) {
            const delay = attempts * 30000;
            log('Updater: retrying in ' + (delay/1000) + 's');
            setTimeout(tryCheck, delay);
          }
        });
      };
      tryCheck();
    };

    setTimeout(() => checkWithRetry('startup check'), 15000);
    _checkTimer = setInterval(() => checkWithRetry('periodic check'), CHECK_INTERVAL_MS);
    log('AutoUpdater: initialized');
  } catch (e) { log('AutoUpdater init failed', e); }
}

function teardownAutoUpdater() {
  if (_checkTimer) { clearInterval(_checkTimer); _checkTimer = null; }
}

module.exports = { setupAutoUpdater, teardownAutoUpdater };
