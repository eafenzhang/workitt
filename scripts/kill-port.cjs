// Kill any process on port 5173 before starting Vite
const { execSync } = require('child_process');
try {
  const result = execSync(
    `netstat -ano | findstr ":5173 "`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const pids = new Set();
  for (const line of result.split('\n')) {
    const m = line.trim().match(/(\d+)\s*$/);
    if (m) pids.add(m[1]);
  }
  for (const pid of pids) {
    if (pid && pid !== '0') {
      try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
    }
  }
} catch {} // No process on port 5173
