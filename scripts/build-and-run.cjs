// build-and-run.cjs — Kill existing processes, build, then launch
const { execSync, spawn } = require('child_process');
const { platform } = require('os');

const log = (msg) => console.log(`[build-and-run] ${msg}`);

function killProcess(name) {
  try {
    if (platform() === 'win32') {
      execSync(`taskkill //F //IM ${name} 2>nul`, { stdio: 'ignore' });
    } else {
      execSync(`pkill -f "${name}" 2>/dev/null`, { stdio: 'ignore' });
    }
    log(`Killed ${name}`);
  } catch { /* Process not running — that's fine */ }
}

// Step 1: Kill everything
log('Stopping existing processes...');
killProcess('Workit.exe');
killProcess('electron.exe');
killProcess('node.exe'); // Only kills backend if running

// Step 2: Kill port 3001
try {
  if (platform() === 'win32') {
    const out = execSync('netstat -ano | findstr ":3001" | findstr "LISTENING"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) || '';
    const pid = out.trim().split(/\s+/).pop();
    if (pid && /^\d+$/.test(pid)) execSync(`taskkill //F //PID ${pid} 2>nul`, { stdio: 'ignore' });
  } else {
    execSync('lsof -ti:3001 | xargs kill -9 2>/dev/null', { stdio: 'ignore' });
  }
  log('Port 3001 freed');
} catch {}

// Step 3: Wait a moment
setTimeout(() => {
  // Step 4: Build
  log('Building frontend...');
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: require('path').join(__dirname, '..') });
    log('Build complete');
  } catch (e) {
    console.error('Build failed:', e.message);
    process.exit(1);
  }

  // Step 5: Launch
  log('Starting Electron...');
  const electron = platform() === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(electron, ['electron', '.'], {
    cwd: require('path').join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
    detached: true,
  });
  child.unref();
  log('Launched (PID: ' + child.pid + ')');
  process.exit(0);
}, 2000);
