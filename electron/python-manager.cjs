// python-manager.cjs — CowAgent Python backend process lifecycle
// Spawns, monitors, and cleanly shuts down the CowAgent Python engine
// as a child process of the Workit Electron app.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const BACKEND_PORT = 9899;
const READY_TIMEOUT_MS = 120_000;  // 2 min for slow Windows startup
const POLL_INTERVAL_MS = 500;

// ── Helpers ────────────────────────────────────────────────────

function log(msg, err) {
  try {
    const line = `[PythonManager] ${msg}${err ? ': ' + (err.message || err) : ''}`;
    const { log: logFn } = require('./database.cjs');
    logFn(line);
  } catch {
    console.error(line || `[PythonManager] ${msg}`, err || '');
  }
}

/** Check if a TCP port is in use (returns true if something is listening). */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));   // in use
    server.once('listening', () => {
      server.close();
      resolve(false);                             // free
    });
    server.listen(port, '127.0.0.1');
  });
}

/** Sleep helper */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── PythonManager ──────────────────────────────────────────────

class PythonManager {
  constructor() {
    this._process = null;
    this._port = BACKEND_PORT;
    this._ready = false;
    this._exiting = false;
  }

  get isRunning() {
    return this._process !== null && !this._process.killed && this._ready;
  }

  get port() {
    return this._port;
  }

  /**
   * Kill any process currently listening on the target port.
   * Uses netstat + taskkill (Windows native).
   */
  async _killExistingPort(port) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      log(`Port ${port} is free — no stale backend to kill`);
      return;
    }

    log(`Port ${port} is in use — searching for stale backend process...`);

    try {
      const { execSync } = require('child_process');
      const result = execSync(
        `netstat -ano | findstr ":${port}" | findstr "LISTENING"`,
        { encoding: 'utf8', timeout: 5000 }
      );

      const lines = result.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          log(`Killing stale PID ${pid} on port ${port}`);
          try {
            execSync(`taskkill /F /PID ${pid}`, { timeout: 3000 });
          } catch (e) {
            // May already be dead
          }
        }
      }

      // Wait up to 5s for the port to free
      for (let i = 0; i < 50; i++) {
        if (!(await isPortInUse(port))) {
          log(`Port ${port} freed after ${(i + 1) * 100}ms`);
          return;
        }
        await sleep(100);
      }
      log(`Port ${port} still in use after 5s — continuing anyway`);
    } catch (e) {
      log(`Failed to kill stale backend`, e);
    }
  }

  /**
   * Find the CowAgent backend directory.
   * Search order: sibling dir → extraResources → PATH module.
   */
  _findBackendDir() {
    // Allow override via env var
    if (process.env.COWAGENT_BACKEND_DIR) {
      const envPath = path.resolve(process.env.COWAGENT_BACKEND_DIR);
      if (fs.existsSync(path.join(envPath, 'app.py'))) return envPath;
    }

    const appPath = require('electron').app.getAppPath();
    const candidates = [
      // 1. Extra resources (packaged app — bundled via electron-builder)
      process.resourcesPath ? path.resolve(process.resourcesPath, 'cowagent-backend') : null,
      // 2. Env var
      process.env.COWAGENT_BACKEND_DIR || null,
      // 3. User-specified work directory
      path.resolve('D:/', 'Workitt', 'cowagent-backend'),
      // 4. Dev: sibling of workit-ref
      path.resolve(appPath, '..', 'cowagent-backend'),
      // 5. Dev: sibling of electron/ dir
      path.resolve(__dirname, '..', '..', 'cowagent-backend'),
      // 6. Same directory as Workitt
      path.resolve(__dirname, '..', 'cowagent-backend'),
      // 7. App path
      path.resolve(appPath, 'cowagent-backend'),
    ].filter(Boolean);

    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, 'app.py'))) {
        log(`Found CowAgent backend at: ${dir}`);
        return dir;
      }
    }

    log('CowAgent backend not found in expected locations');
    return null;
  }

  /**
   * Check if Python is available on the system.
   */
  async _checkPython() {
    try {
      const { execSync } = require('child_process');
      execSync('python --version', { stdio: 'pipe', timeout: 5000 });
      return true;
    } catch {
      try {
        const { execSync } = require('child_process');
        execSync('python3 --version', { stdio: 'pipe', timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Install CowAgent Python dependencies if needed.
   */
  async _ensureDependencies(backendDir) {
    const reqFile = path.join(backendDir, 'requirements.txt');
    if (!fs.existsSync(reqFile)) {
      log('No requirements.txt found, skipping dependency install');
      return true;
    }

    try {
      const { execSync } = require('child_process');
      log('Checking CowAgent Python dependencies...');
      execSync('python -m pip install -r "' + reqFile + '" --quiet', {
        cwd: backendDir,
        stdio: 'pipe',
        timeout: 120000,
      });
      log('CowAgent Python dependencies installed');
      return true;
    } catch (e) {
      log('Failed to install Python dependencies: ' + (e.message || e));
      // Try with --user flag as fallback
      try {
        const { execSync } = require('child_process');
        execSync('python -m pip install -r "' + reqFile + '" --quiet --user', {
          cwd: backendDir,
          stdio: 'pipe',
          timeout: 120000,
        });
        log('CowAgent Python dependencies installed (--user)');
        return true;
      } catch (e2) {
        log('Failed to install Python dependencies (--user): ' + (e2.message || e2));
        return false;
      }
    }
  }

  /**
   * Start the CowAgent Python backend.
   * Returns a promise that resolves when the backend is ready.
   */
  async start() {
    if (this._process) {
      log('Already running');
      return;
    }

    this._exiting = false;
    this._ready = false;

    // Check Python availability
    const pythonOk = await this._checkPython();
    if (!pythonOk) {
      log('Python is not installed or not in PATH. CowAgent backend cannot start.');
      log('Please install Python 3.10+ from https://www.python.org/downloads/');
      return;
    }

    // Kill stale backend on the target port
    await this._killExistingPort(this._port);

    // Find backend directory
    const backendDir = this._findBackendDir();
    if (!backendDir) {
      // Try `python -m cowagent` as fallback
      log('CowAgent not found locally, trying `python -m cowagent`');
    }

    // Auto-install dependencies if backend dir found
    if (backendDir) {
      await this._ensureDependencies(backendDir);
    }

    return new Promise((resolve, reject) => {
      const pythonCmd = 'python';
      const args = backendDir ? ['app.py'] : ['-m', 'cowagent'];
      const cwd = backendDir || undefined;

      log(`Starting: ${pythonCmd} ${args.join(' ')}${cwd ? ' (cwd: ' + cwd + ')' : ''}`);

      try {
        this._process = spawn(pythonCmd, args, {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
          },
          windowsHide: true,
        });

        const pid = this._process.pid;
        log(`CowAgent backend started (PID ${pid})`);

        // Capture stdout
        this._process.stdout.on('data', (data) => {
          const text = data.toString().trim();
          if (text) log(`[stdout] ${text}`);
        });

        // Capture stderr
        this._process.stderr.on('data', (data) => {
          const text = data.toString().trim();
          if (text) log(`[stderr] ${text}`);
        });

        this._process.on('error', (err) => {
          log('Process error', err);
          if (!this._exiting) reject(err);
        });

        this._process.on('exit', (code) => {
          log(`Process exited with code ${code}`);
          this._process = null;
          this._ready = false;
          if (!this._exiting && code !== 0) {
            log('Unexpected exit — CowAgent backend crashed');
          }
        });

        // Wait for HTTP readiness
        this._waitForReady()
          .then(() => {
            this._ready = true;
            log('CowAgent backend is ready');
            resolve();
          })
          .catch((err) => {
            log('Backend failed to become ready', err);
            this.stop();
            reject(err);
          });
      } catch (err) {
        log('Failed to spawn Python process', err);
        reject(err);
      }
    });
  }

  /**
   * Poll the CowAgent HTTP endpoint until it responds.
   */
  async _waitForReady() {
    const start = Date.now();
    while (Date.now() - start < READY_TIMEOUT_MS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(`http://localhost:${this._port}/`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        // Any response means the server is up
        if (res.status >= 200 && res.status < 500) {
          return;
        }
      } catch {
        // Not ready yet — keep waiting
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`CowAgent backend did not start within ${READY_TIMEOUT_MS / 1000}s`);
  }

  /**
   * Stop the CowAgent Python backend gracefully.
   */
  async stop() {
    if (!this._process) return;

    this._exiting = true;
    this._ready = false;

    const pid = this._process.pid;
    log(`Stopping CowAgent backend (PID ${pid})...`);

    // Try graceful shutdown via SIGTERM
    try {
      this._process.kill('SIGTERM');
    } catch {
      // Process might already be dead
    }

    // Wait up to 5s for the process to exit
    for (let i = 0; i < 50; i++) {
      if (this._process === null || this._process.killed) break;
      await sleep(100);
    }

    // Force kill if still alive
    if (this._process && !this._process.killed) {
      try {
        this._process.kill('SIGKILL');
      } catch {
        // Already dead
      }
    }

    this._process = null;
    log('CowAgent backend stopped');
  }

  /**
   * Get current status.
   */
  getStatus() {
    return {
      running: this.isRunning,
      port: this._port,
      pid: this._process ? this._process.pid : null,
    };
  }
}

// Singleton
let _instance = null;
function getPythonManager() {
  if (!_instance) _instance = new PythonManager();
  return _instance;
}

module.exports = { PythonManager, getPythonManager };
