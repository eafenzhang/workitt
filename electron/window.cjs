// window.js — Window creation, tray, QC window, settings, clipboard
const { app, BrowserWindow, shell, ipcMain, nativeImage, Tray, Menu, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { log } = require('./database.cjs');

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;

let mainWindow = null;
let qcWindow = null;
let _preloadPath = '';

function setupWindowEvents(win) {
  win.on('maximize', () => win.webContents?.send('window-maximized-change', true));
  win.on('unmaximize', () => win.webContents?.send('window-maximized-change', false));
  win.on('enter-full-screen', () => win.webContents?.send('window-fullscreen-change', true));
  win.on('leave-full-screen', () => win.webContents?.send('window-fullscreen-change', false));
}

function getMainWindow() {
  return mainWindow;
}

function getQCWindow() {
  return qcWindow;
}

function createWindow(preloadPath) {
  if (preloadPath) _preloadPath = preloadPath;
  const pp = _preloadPath || preloadPath;

  // If window already exists, just show and focus it
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    log('createWindow: reusing existing window');
    return mainWindow;
  }

  log('Creating window...');
  try {
    log('createWindow: preload path = ' + pp);
    log('createWindow: preload exists = ' + fs.existsSync(pp));

    mainWindow = new BrowserWindow({
      width: 1200, height: 800, minWidth: 900, minHeight: 600,
      title: 'Workitt',
      icon: nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon.png')),
      frame: false,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true, webviewTag: true, preload: pp },
    });

    setupWindowEvents(mainWindow);

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      mainWindow.focus();
      log('createWindow: ready-to-show, window displayed');
    });

    mainWindow.center();
    if (isDev) {
      mainWindow.loadURL('http://localhost:5173');
      mainWindow.webContents.openDevTools();
    } else {
      const htmlPath = path.join(app.getAppPath(), 'dist', 'index.html');
      log('createWindow: loading HTML = ' + htmlPath);
      mainWindow.loadFile(htmlPath);
    }

    // 渲染进程错误监听
    mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
      log('createWindow: renderer load FAILED, code=' + code + ', desc=' + desc);
    });
    mainWindow.webContents.on('console-message', (_, level, message) => {
      log('Renderer [' + level + ']: ' + message);
    });
    mainWindow.webContents.on('render-process-gone', (_, details) => {
      log('createWindow: render-process-gone, reason=' + details.reason + ', exitCode=' + details.exitCode);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    mainWindow.on('closed', () => { mainWindow = null; });

    // ===== Tray + QC window + settings (from original app.whenReady) =====
    let tray = null;
    let minimizeToTray = false;

    function createTray() {
      if (tray) return;
      const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon.png')).resize({ width: 16, height: 16 });
      tray = new Tray(icon);
      tray.setToolTip('Workitt');
      function showFromTray() {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) {
          mainWindow.setOpacity(0);
          mainWindow.show();
          setTimeout(() => mainWindow.setOpacity(1), 50);
        }
        mainWindow.focus();
      }
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: '显示窗口', click: showFromTray },
        { type: 'separator' },
        { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
      ]));
      tray.on('double-click', showFromTray);
    }

    mainWindow.on('close', (event) => {
      if (minimizeToTray && !app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    ipcMain.handle('get-settings', () => ({
      minimizeToTray,
      openAtLogin: app.getLoginItemSettings().openAtLogin
    }));

    ipcMain.handle('set-minimize-to-tray', (_, enabled) => {
      minimizeToTray = enabled;
      if (enabled) createTray(); else { tray?.destroy(); tray = null; }
      return enabled;
    });

    ipcMain.handle('set-open-at-login', (_, enabled) => {
      app.setLoginItemSettings({ openAtLogin: enabled });
      return enabled;
    });

    // QuickCapture external popup
    ipcMain.handle('toggle-qc-window', (_, enabled) => {
      log('toggle-qc-window called: enabled=' + enabled);
      if (enabled) {
        if (!qcWindow) {
          const disp = screen.getPrimaryDisplay();
          const { width, height } = disp.workAreaSize;
          qcWindow = new BrowserWindow({
            width: 56, height: 56,
            x: width - 76, y: height - 76,
            frame: false, resizable: false, alwaysOnTop: true,
            skipTaskbar: true, transparent: true,
            webPreferences: { preload: pp, contextIsolation: true, nodeIntegration: false, additionalArguments: ['--qc-popup'] }
          });
          qcWindow.loadFile(path.join(app.getAppPath(), 'electron', 'qc-entry.html'));
          qcWindow.on('closed', () => {
            log('QC window closed');
            qcWindow = null;
            // Restore main window from tray
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.show();
              mainWindow.focus();
            }
          });
        }
        qcWindow.show();
        log('QC window shown');
      } else {
        log('Closing QC window');
        qcWindow?.close();
      }
      return enabled;
    });

    ipcMain.handle('read-clipboard-images', () => {
      try {
        const images = [];

        // Diagnostic: log available clipboard formats
        const text = clipboard.readText() || '';
        const html = clipboard.readHTML() || '';
        const rtf = clipboard.readRTF() || '';
        log('Clipboard: text=' + text.substring(0, 100) + ' | html=' + (html ? html.substring(0, 200) : '(empty)') + ' | rtf=' + (rtf ? rtf.substring(0, 100) : '(empty)'));

        // 1. Read native image (standard image/png clipboard)
        const image = clipboard.readImage();
        const hasNativeImage = image && !image.isEmpty();
        if (hasNativeImage) {
          images.push(image.toDataURL());
          log('Clipboard: native image found, size=' + image.getSize().width + 'x' + image.getSize().height);
        } else {
          log('Clipboard: no native image');
        }

        // 2. Read file references from clipboard (WeChat/Enterprise WeChat stores images as files)
        if (typeof clipboard.readFinderFiles === 'function') {
          try {
            const files = clipboard.readFinderFiles();
            log('Clipboard: finderFiles=' + JSON.stringify(files));
            if (Array.isArray(files)) {
              const mediaExts = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.tiff': 'image/tiff', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv', '.m4v': 'video/mp4', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pdf': 'application/pdf', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.csv': 'text/csv', '.rtf': 'application/rtf', '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet', '.odp': 'application/vnd.oasis.opendocument.presentation', '.zip': 'application/zip', '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed', '.tar': 'application/x-tar', '.gz': 'application/gzip', '.bz2': 'application/x-bzip2', '.xz': 'application/x-xz', '.tgz': 'application/gzip', '.html': 'text/html', '.htm': 'text/html', '.md': 'text/markdown', '.markdown': 'text/markdown', '.json': 'application/json', '.xml': 'application/xml', '.yaml': 'text/yaml', '.yml': 'text/yaml', '.toml': 'application/toml', '.ini': 'text/plain', '.conf': 'text/plain', '.log': 'text/plain', '.sql': 'application/sql', '.sh': 'application/x-sh', '.bat': 'application/x-bat', '.py': 'text/x-python', '.js': 'text/javascript', '.ts': 'text/typescript', '.css': 'text/css', '.txt': 'text/plain' };
              for (const fp of files) {
                if (!fp) continue;
                const ext = path.extname(fp).toLowerCase();
                const mime = mediaExts[ext];
                if (mime) {
                  try {
                    if (fs.existsSync(fp)) {
                      const buf = fs.readFileSync(fp);
                      images.push(`data:${mime};base64,${buf.toString('base64')}`);
                      log('Clipboard: file media read OK: ' + fp + ' (' + buf.length + ' bytes, ' + mime + ')');
                    } else {
                      log('Clipboard: file not found: ' + fp);
                    }
                  } catch (e) { log('Clipboard: file read error: ' + fp, e); }
                }
              }
            }
          } catch (e) { log('Clipboard: readFinderFiles error', e); }
        }

        // 3. Read HTML and extract media (images + videos)
        if (html) {
          const mediaRx = /<(?:img|video|source)[^>]+src\s*=\s*["']([^"']+?)["']/gi;
          const mimeExt = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv', '.m4v': 'video/mp4' };
          let m;
          while ((m = mediaRx.exec(html)) !== null) {
            const src = m[1];
            if (!src) continue;
            if (src.startsWith('data:')) {
              images.push(src);
              log('Clipboard: HTML data: media found');
            } else if (src.startsWith('file://')) {
              try {
                let filePath = src.replace(/^file:\/\//, '').replace(/^localhost\//, '');
                if (/^\/[a-zA-Z]:/.test(filePath)) filePath = filePath.slice(1);
                filePath = decodeURIComponent(filePath);
                filePath = filePath.replace(/\//g, '\\');
                if (fs.existsSync(filePath)) {
                  const buf = fs.readFileSync(filePath);
                  const ext = path.extname(filePath).toLowerCase();
                  const mime = mimeExt[ext] || 'application/octet-stream';
                  images.push(`data:${mime};base64,${buf.toString('base64')}`);
                  log('Clipboard: HTML file:// media read OK: ' + filePath + ' (' + buf.length + ' bytes, ' + mime + ')');
                } else {
                  log('Clipboard: HTML file:// path not found: ' + filePath + ' (original: ' + src + ')');
                }
              } catch {}
            } else if (src.startsWith('http://') || src.startsWith('https://')) {
              images.push(src);
            }
          }
        }

        return images;
      } catch (e) {
        log('readClipboardImages error', e);
        return [];
      }
    });

    // P0-06: Path whitelist for read-local-file to prevent arbitrary file read
    function isPathAllowed(filePath) {
      const allowed = [
        app.getPath('userData'),
        path.join(process.env.USERPROFILE || '', 'Documents'),
        path.join(process.env.USERPROFILE || '', 'Downloads'),
      ];
      // Also allow WXWork FileStorage directories
      try {
        const wxworkBase = path.join(process.env.USERPROFILE || '', 'Documents', 'WXWork');
        if (fs.existsSync(wxworkBase)) {
          const userDirs = fs.readdirSync(wxworkBase, { withFileTypes: true })
            .filter(d => d.isDirectory() && /^\d+$/.test(d.name));
          for (const d of userDirs) {
            const fileStorage = path.join(wxworkBase, d.name, 'FileStorage');
            if (fs.existsSync(fileStorage)) allowed.push(fileStorage);
            const cacheDir = path.join(wxworkBase, d.name, 'Cache');
            if (fs.existsSync(cacheDir)) allowed.push(cacheDir);
          }
        }
      } catch {}
      const resolved = path.resolve(filePath);
      return allowed.some(dir => resolved.startsWith(path.resolve(dir)));
    }

    ipcMain.handle('read-local-file', (_, filePath) => {
      try {
        if (!filePath || !fs.existsSync(filePath)) { log('readLocalFile: not found: ' + filePath); return null; }
        if (!isPathAllowed(filePath)) { log('readLocalFile: path not allowed: ' + filePath); return null; }
        // P1-09: Enforce 50MB file size limit for local file reads
        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_FILE_SIZE) {
          log('readLocalFile: file too large: ' + filePath + ' (' + (stat.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { error: '文件超过50MB大小限制', size: stat.size };
        }
        const buf = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.tiff': 'image/tiff', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv', '.m4v': 'video/mp4', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pdf': 'application/pdf', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.csv': 'text/csv', '.rtf': 'application/rtf', '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet', '.odp': 'application/vnd.oasis.opendocument.presentation', '.zip': 'application/zip', '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed', '.tar': 'application/x-tar', '.gz': 'application/gzip', '.bz2': 'application/x-bzip2', '.xz': 'application/x-xz', '.tgz': 'application/gzip', '.html': 'text/html', '.htm': 'text/html', '.md': 'text/markdown', '.markdown': 'text/markdown', '.json': 'application/json', '.xml': 'application/xml', '.yaml': 'text/yaml', '.yml': 'text/yaml', '.toml': 'application/toml', '.ini': 'text/plain', '.conf': 'text/plain', '.log': 'text/plain', '.sql': 'application/sql', '.sh': 'application/x-sh', '.bat': 'application/x-bat', '.ps1': 'text/plain', '.py': 'text/x-python', '.js': 'text/javascript', '.ts': 'text/typescript', '.css': 'text/css', '.less': 'text/plain', '.scss': 'text/plain', '.txt': 'text/plain' };
        const mime = mimeMap[ext] || 'application/octet-stream';
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch (e) {
        log('readLocalFile error: ' + filePath, e);
        return null;
      }
    });

    ipcMain.handle('read-clipboard-files', () => {
      try {
        const results = [];

        // Helper: read file and return structured result with dataUrl
        const readFileAsResult = (filePath, typeHint) => {
          try {
            if (!fs.existsSync(filePath)) return null;
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) return null;
            const name = path.basename(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mimeMap = {
              '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
              '.bmp': 'image/bmp', '.webp': 'image/webp', '.svg': 'image/svg+xml',
              '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
              '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.flv': 'video/x-flv',
              '.wmv': 'video/x-ms-wmv', '.m4v': 'video/mp4',
              '.pdf': 'application/pdf', '.doc': 'application/msword',
              '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              '.xls': 'application/vnd.ms-excel',
              '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              '.ppt': 'application/vnd.ms-powerpoint',
              '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              '.csv': 'text/csv', '.rtf': 'application/rtf', '.txt': 'text/plain',
            };
            const mime = mimeMap[ext] || 'application/octet-stream';
            // For large files (>50MB), don't embed as data URL — just return the path
            const MAX_EMBED = 50 * 1024 * 1024;
            const isVideo = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.m4v'].includes(ext);
            const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'].includes(ext);
            let type = typeHint || (isVideo ? 'video' : isImage ? 'image' : 'file');
            if (stat.size > MAX_EMBED) {
              return { path: filePath, name, size: stat.size, type, dataUrl: null };
            }
            const buf = fs.readFileSync(filePath);
            const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
            log('Clipboard: readFileAsResult: ' + filePath + ' (' + buf.length + ' bytes, ' + mime + ')');
            return { path: filePath, name, size: stat.size, type, dataUrl };
          } catch (e) {
            log('Clipboard: readFileAsResult error: ' + filePath, e);
            return null;
          }
        };

        // macOS: Finder files
        if (typeof clipboard.readFinderFiles === 'function') {
          const files = clipboard.readFinderFiles();
          if (Array.isArray(files) && files.length > 0) {
            for (const fp of files) {
              const r = readFileAsResult(fp);
              if (r) results.push(r);
            }
          }
        }

        // Windows: try standard clipboard file formats
        if (process.platform === 'win32') {
          // 1. FileNameW (CF_HDROP — Explorer file copy)
          try {
            const buf = clipboard.readBuffer('FileNameW');
            if (buf && buf.length > 0) {
              const text = buf.toString('utf16le').replace(/\0/g, '\n');
              const paths = text.split('\n').map(s => s.trim()).filter(Boolean);
              for (const fp of paths) {
                const r = readFileAsResult(fp);
                if (r) results.push(r);
              }
            }
          } catch {}
        }

        // Parse HTML/text to find WXWork/WeChat file references
        const html = clipboard.readHTML() || '';
        const text = clipboard.readText() || '';

        if (html || text) {
          // Find WXWork user cache directory
          const wxworkBase = path.join(process.env.USERPROFILE || '', 'Documents', 'WXWork');
          let wxworkCacheDir = null;
          try {
            if (fs.existsSync(wxworkBase)) {
              const userDirs = fs.readdirSync(wxworkBase, { withFileTypes: true })
                .filter(d => d.isDirectory() && /^\d+$/.test(d.name));
              for (const d of userDirs) {
                const cacheDir = path.join(wxworkBase, d.name, 'Cache');
                if (fs.existsSync(cacheDir)) {
                  wxworkCacheDir = cacheDir;
                  break;
                }
              }
            }
          } catch {}

          // Find WeChat (personal) cache directory
          const wechatBase = path.join(process.env.USERPROFILE || '', 'Documents', 'WeChat Files');
          let wechatFileStorage = null;
          try {
            if (fs.existsSync(wechatBase)) {
              const wxDirs = fs.readdirSync(wechatBase, { withFileTypes: true })
                .filter(d => d.isDirectory() && d.name !== 'All Users');
              for (const d of wxDirs) {
                const fileStorage = path.join(wechatBase, d.name, 'FileStorage');
                if (fs.existsSync(fileStorage)) {
                  wechatFileStorage = fileStorage;
                  break;
                }
              }
            }
          } catch {}

          // Helper: find file by name in cache subdirectories
          const findFileInCache = (fileName, subDir, timeWindowMs = 180000) => {
            const searchDirs = [];
            const roots = [];
            if (wxworkCacheDir) roots.push(wxworkCacheDir);
            if (wechatFileStorage) roots.push(wechatFileStorage);

            for (const root of roots) {
              const cacheSub = path.join(root, subDir);
              if (fs.existsSync(cacheSub)) {
                searchDirs.push(cacheSub);
                try {
                  const subDirs = fs.readdirSync(cacheSub, { withFileTypes: true }).filter(d => d.isDirectory());
                  for (const sd of subDirs) searchDirs.push(path.join(cacheSub, sd.name));
                } catch {}
              }
            }

            for (const dir of searchDirs) {
              try {
                const entries = fs.readdirSync(dir);
                for (const entry of entries) {
                  if (entry === fileName) {
                    const fp = path.join(dir, entry);
                    try { if (fs.statSync(fp).isFile()) return fp; } catch {}
                  }
                }
              } catch {}
            }

            // Fallback: partial name match (without extension) + recent
            const baseName = fileName.split('.')[0].toLowerCase();
            for (const dir of searchDirs) {
              try {
                let bestMatch = null, bestTime = 0;
                const entries = fs.readdirSync(dir);
                for (const entry of entries) {
                  if (entry.toLowerCase().startsWith(baseName)) {
                    const fp = path.join(dir, entry);
                    try {
                      const stat = fs.statSync(fp);
                      if (stat.isFile() && stat.mtimeMs > bestTime && Date.now() - stat.mtimeMs < timeWindowMs) {
                        bestMatch = fp;
                        bestTime = stat.mtimeMs;
                      }
                    } catch {}
                  }
                }
                if (bestMatch) return bestMatch;
              } catch {}
            }
            return null;
          };

          // Helper: find most recently modified file in a cache subdirectory
          const findRecentFile = (subDir, extFilter, timeWindowMs = 180000) => {
            const searchDirs = [];
            const roots = [];
            if (wxworkCacheDir) roots.push(wxworkCacheDir);
            if (wechatFileStorage) roots.push(wechatFileStorage);

            for (const root of roots) {
              const cacheSub = path.join(root, subDir);
              if (fs.existsSync(cacheSub)) {
                searchDirs.push(cacheSub);
                try {
                  const subDirs = fs.readdirSync(cacheSub, { withFileTypes: true }).filter(d => d.isDirectory());
                  for (const sd of subDirs) searchDirs.push(path.join(cacheSub, sd.name));
                } catch {}
              }
            }

            let bestMatch = null, bestTime = 0;
            for (const dir of searchDirs) {
              try {
                const entries = fs.readdirSync(dir);
                for (const entry of entries) {
                  const ext = path.extname(entry).toLowerCase();
                  if (extFilter && !extFilter.includes(ext)) continue;
                  const fp = path.join(dir, entry);
                  try {
                    const stat = fs.statSync(fp);
                    if (stat.isFile() && stat.mtimeMs > bestTime && Date.now() - stat.mtimeMs < timeWindowMs) {
                      bestMatch = fp;
                      bestTime = stat.mtimeMs;
                    }
                  } catch {}
                }
              } catch {}
            }
            return bestMatch;
          };

          const contentToCheck = text || html;

          // Detect [视频] markers — find most recent video file in cache
          const videoCount = (contentToCheck.match(/\[视频\]/g) || []).length;
          if (videoCount > 0) {
            const videoExts = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.m4v'];
            for (let v = 0; v < videoCount; v++) {
              const foundPath = findRecentFile('Video', videoExts, 180000);
              if (foundPath) {
                log('Clipboard: resolved [视频] -> ' + foundPath);
                const r = readFileAsResult(foundPath, 'video');
                if (r) results.push(r);
              } else {
                results.push({ name: '视频', type: 'video', dataUrl: null });
              }
            }
          }

          // Detect [文件：xxx] markers — find file by name in cache
          const fileMarkers = contentToCheck.match(/\[文件[：:](.+?)\]/g) || [];
          for (const marker of fileMarkers) {
            const nameMatch = marker.match(/\[文件[：:](.+?)\]/);
            if (nameMatch) {
              const fileName = nameMatch[1].trim();
              const foundPath = findFileInCache(fileName, 'File', 180000);
              if (foundPath) {
                log('Clipboard: resolved [文件：' + fileName + '] -> ' + foundPath);
                const r = readFileAsResult(foundPath, 'file');
                if (r) results.push(r);
              } else {
                results.push({ name: fileName, type: 'file', dataUrl: null });
              }
            }
          }
        }

        return results;
      } catch {
        return [];
      }
    });

    // Open file with system default application via shell.openPath
    ipcMain.handle('open-path-external', async (_event, filePath) => {
      try {
        if (!filePath || !fs.existsSync(filePath)) return { error: 'File not found: ' + filePath };
        await shell.openPath(filePath);
        return { success: true };
      } catch (e) {
        return { error: e.message };
      }
    });

    // Download and save Chrome extension from store
    ipcMain.handle('install-extension', async (_event, extId, dataUrl) => {
      try {
        const extDir = path.join(app.getPath('userData'), 'extensions', extId);
        if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });
        const base64 = dataUrl.split(',')[1];
        if (!base64) return { error: 'Invalid data URL' };
        const buf = Buffer.from(base64, 'base64');
        fs.writeFileSync(path.join(extDir, extId + '.crx'), buf);
        fs.writeFileSync(path.join(extDir, 'info.json'), JSON.stringify({ id: extId, installedAt: new Date().toISOString() }));
        log('Extension downloaded: ' + extId);
        return { success: true };
      } catch (e) {
        log('Extension install error', e);
        return { error: e.message };
      }
    });

    ipcMain.handle('read-clipboard-text', () => {
      try { return clipboard.readText() || ''; } catch { return ''; }
    });

    ipcMain.handle('read-clipboard-html', () => {
      try { return clipboard.readHTML() || ''; } catch { return ''; }
    });

    ipcMain.handle('notify-requirements-changed', () => {
      // P0-06: Replaced executeJavaScript (RCE risk) with webContents.send + preload forwarding
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('requirements-changed');
      }
    });

    ipcMain.handle('close-qc-form', () => {
      if (qcWindow && !qcWindow.isDestroyed()) {
        qcWindow.setSize(56, 56);
        qcWindow.loadFile(path.join(app.getAppPath(), 'electron', 'qc-entry.html'));
      }
    });

    ipcMain.handle('open-qc-form', () => {
      if (qcWindow && !qcWindow.isDestroyed()) {
        qcWindow.setSize(420, 540);
        qcWindow.center();
        qcWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
      }
    });

    log('createWindow: success');
    return mainWindow;
  } catch (e) { log('createWindow: FAILED', e); }
}

module.exports = { createWindow, getMainWindow, getQCWindow };
