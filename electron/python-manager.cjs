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
  const line = `[PythonManager] ${msg}${err ? ': ' + (err.message || err) : ''}`;
  try {
    const { log: logFn } = require('./database.cjs');
    logFn(line);
  } catch {
    console.error(line);
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
      const checkPath = path.join(dir, 'app.py');
      log(`Looking for backend: ${checkPath} — ${fs.existsSync(checkPath) ? 'FOUND' : 'not found'}`);
      if (fs.existsSync(checkPath)) {
        log(`Found CowAgent backend at: ${dir}`);
        return dir;
      }
    }

    log('CowAgent backend not found in expected locations');
    return null;
  }

  /**
   * Try to spawn Python with given args, trying multiple python commands.
   * Returns the child process on success, null if all failed.
   */
  _trySpawn(args, cwd) {
    const pys = ['python', 'python3', 'py'];
    // Ensure user site-packages is in path (for --user pip installs)
    const extraEnv = { ...process.env, PYTHONUNBUFFERED: '1', PYTHONUTF8: '1' };
    // Add common user site-packages to PYTHONPATH if not already set
    if (!extraEnv.PYTHONPATH) {
      try {
        const { execSync } = require('child_process');
        const userSite = execSync('python -c "import site; print(site.getusersitepackages())"', { encoding: 'utf8', timeout: 5000 }).trim();
        if (userSite) extraEnv.PYTHONPATH = userSite;
      } catch {}
    }

    for (const py of pys) {
      try {
        const child = spawn(py, args, {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: extraEnv,
          windowsHide: true,
        });
        log(`Spawned: ${py} ${args.join(' ')} (PID ${child.pid})${cwd ? ' cwd=' + cwd : ''}`);

        // Capture stdout — buffer lines, always capture ERROR/WARNING
        let stdoutBuf = '';
        child.stdout.on('data', (data) => {
          stdoutBuf += data.toString();
          const lines = stdoutBuf.split('\n');
          stdoutBuf = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              if (trimmed.includes('[ERROR]') || trimmed.includes('[CRITICAL]')) {
                log(`[python:ERR] ${trimmed}`);
              } else if (!trimmed.includes('[INFO]') && !trimmed.includes('[WebChannel]')) {
                log(`[python:out] ${trimmed}`);
              }
            }
          }
        });

        // Capture stderr — Python tracebacks go here
        let stderrBuf = '';
        child.stderr.on('data', (data) => {
          const text = data.toString();
          stderrBuf += text;
          const lines = text.trim().split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) log(`[python:err] ${trimmed}`);
          }
        });

        // Detect premature exit (crash before ready)
        child.on('exit', (code) => {
          log(`Python process exited with code ${code}`);
          if (stdoutBuf.trim()) log(`[python:flush:out] ${stdoutBuf.trim()}`);
          if (stderrBuf.trim()) log(`[python:flush:err] ${stderrBuf.trim()}`);
          this._process = null;
          this._ready = false;
        });

        return child;
      } catch (e) {
        log(`${py} failed: ${e.message}`);
      }
    }
    return null;
  }

  /**
   * Install pip dependencies from requirements.txt.
   */
  async _installDeps(backendDir) {
    const reqFile = path.join(backendDir, 'requirements.txt');
    if (!fs.existsSync(reqFile)) return false;
    const { execSync } = require('child_process');
    for (const cmd of ['python -m pip install -r', 'python3 -m pip install -r', 'py -m pip install -r']) {
      try {
        execSync(`${cmd} "${reqFile}" --quiet`, { cwd: backendDir, stdio: 'pipe', timeout: 120000 });
        log('Python dependencies installed');
        return true;
      } catch { /* try next */ }
    }
    // Last attempt: --user flag
    try {
      execSync(`python -m pip install -r "${reqFile}" --quiet --user`, { cwd: backendDir, stdio: 'pipe', timeout: 120000 });
      log('Python dependencies installed (--user)');
      return true;
    } catch {
      log('Failed to install Python dependencies');
      return false;
    }
  }

  /**
   * Start the CowAgent Python backend (matches cowagent-desktop approach).
   */
  async start() {
    if (this._process) { log('Already running'); return; }

    this._exiting = false;
    this._ready = false;

    // Kill stale backend on the target port
    await this._killExistingPort(this._port);

    // Find backend directory
    const backendDir = this._findBackendDir();
    const useModule = !backendDir;
    if (useModule) log('CowAgent not found locally, trying `python -m cowagent`');

    // Attempt 1: spawn directly
    const args1 = backendDir ? ['app.py'] : ['-m', 'cowagent'];
    const child1 = this._trySpawn(args1, backendDir || undefined);

    if (child1) {
      this._process = child1;
      const ready = await this._waitForReady();
      if (ready) { this._ready = true; return; }

      // Attempt 1 failed — install deps and retry
      log('Attempt 1 failed, installing Python dependencies...');
      this.stop();
      if (backendDir) await this._installDeps(backendDir);
    } else {
      log('Could not start CowAgent backend: Python not found or backend not available');
      log('请确保已安装 Python 3.10+（https://www.python.org/downloads/）');
      return;
    }

    // Attempt 2: spawn after dependency install
    const child2 = this._trySpawn(args1, backendDir || undefined);
    if (child2) {
      this._process = child2;
      const ready = await this._waitForReady();
      if (ready) { this._ready = true; return; }
      log('Attempt 2 also failed — CowAgent backend could not start');
      log('请检查 Workitt 日志（%APPDATA%/Workitt/workit.log）获取详细错误信息');
      this.stop();
    } else {
      log('Could not start CowAgent backend on retry');
    }
  }


  /**
   * Poll the CowAgent HTTP endpoint until it responds.
   * Returns true if backend is ready, false if timeout.
   */
  async _waitForReady() {
    const start = Date.now();
    let consecutiveExitCheck = 0;
    while (Date.now() - start < READY_TIMEOUT_MS) {
      // Check if process already exited
      if (!this._process || this._process.killed) {
        consecutiveExitCheck++;
        // Wait a tiny bit for exit handler to flush buffered output
        if (consecutiveExitCheck >= 3) {
          log('Python process exited before becoming ready');
          return false;
        }
        await sleep(100);
        continue;
      }
      consecutiveExitCheck = 0;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`http://localhost:${this._port}/`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.status >= 200 && res.status < 500) {
          log('CowAgent backend is ready');
          return true;
        }
      } catch { /* not ready yet */ }
      await sleep(POLL_INTERVAL_MS);
    }
    log(`CowAgent backend did not start within ${READY_TIMEOUT_MS / 1000}s`);
    return false;
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

  /**
   * Update CowAgent backend: stop, git pull, install deps, restart.
   * Returns once the backend is ready again.
   */
  async update() {
    const backendDir = this._findBackendDir();
    if (!backendDir) throw new Error('CowAgent 后端目录未找到');

    await this.stop();

    const { exec } = require('child_process');
    const execAsync = (cmd, opts) => new Promise((resolve, reject) => {
      exec(cmd, { ...opts, timeout: 180000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
    });

    // Git pull
    const gitDir = path.join(backendDir, '.git');
    if (fs.existsSync(gitDir)) {
      log('CowAgent: pulling latest code via git pull...');
      try {
        await execAsync('git pull', { cwd: backendDir });
        log('CowAgent: git pull succeeded');
      } catch (e) {
        log('CowAgent: git pull failed, trying Gitee mirror...');
        try {
          await execAsync('git remote set-url origin https://gitee.com/zhayujie/CowAgent.git', { cwd: backendDir });
          await execAsync('git pull', { cwd: backendDir });
        } catch (e2) {
          log('CowAgent: git pull from Gitee also failed', e2);
          throw new Error('Git pull 失败: ' + (e2.message || ''));
        }
      }
    } else {
      log('CowAgent: not a git repository, skipping code update. Install deps only.');
    }

    // Install / update Python dependencies
    const reqFile = path.join(backendDir, 'requirements.txt');
    if (fs.existsSync(reqFile)) {
      log('CowAgent: installing Python dependencies from requirements.txt...');
      await execAsync('python -m pip install -r "' + reqFile + '" -q', { cwd: backendDir });
      log('CowAgent: Python dependencies installed');
    }

    // Reinstall CLI in editable mode
    log('CowAgent: reinstalling CLI...');
    await execAsync('python -m pip install -e "' + backendDir + '" -q', { cwd: backendDir });
    log('CowAgent: CLI reinstalled');

    // Restart backend
    await this.start();
    log('CowAgent: update complete');
  }
}

// Singleton
let _instance = null;
function getPythonManager() {
  if (!_instance) _instance = new PythonManager();
  return _instance;
}

module.exports = { PythonManager, getPythonManager };
