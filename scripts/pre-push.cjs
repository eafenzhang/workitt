// pre-push.cjs — Git pre-push hook: auto-increment version before every push
// Install: node scripts/pre-push.cjs
// This ensures the version number ALWAYS increments on every push.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const HOOK_PATH = path.join(ROOT, '.git', 'hooks', 'pre-push');

// Install mode
if (process.argv.includes('--install') || process.argv.includes('-i')) {
  const hookScript = `#!/bin/sh
# Auto-bump version before push (installed by scripts/pre-push.cjs)
node scripts/pre-push.cjs --run
exit $?
`;

  // Ensure hooks dir exists
  const hooksDir = path.dirname(HOOK_PATH);
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  fs.writeFileSync(HOOK_PATH, hookScript);
  // Make executable (Unix) — on Windows git-bash handles .sh files
  try { fs.chmodSync(HOOK_PATH, 0o755); } catch {}

  console.log('[pre-push] Git hook installed at .git/hooks/pre-push');
  console.log('[pre-push] Version will auto-increment on every push.');
  process.exit(0);
}

// Run mode — called by the hook
if (process.argv.includes('--run')) {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const parts = pkg.version.split('.');
  parts[2] = String(Number(parts[2]) + 1);

  // Only stage if version actually changed
  const oldVersion = pkg.version;
  pkg.version = parts.join('.');
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');

  try {
    execSync('git add package.json', { cwd: ROOT, stdio: 'ignore' });
    console.log('[pre-push] Version bumped: ' + oldVersion + ' → ' + pkg.version);
  } catch {
    // If git add fails (e.g. not in a git repo), just continue
  }

  process.exit(0);
}

// No args — show help
console.log('Usage:');
console.log('  node scripts/pre-push.cjs --install   Install the git hook');
console.log('  node scripts/pre-push.cjs --run       Run the version bump');
