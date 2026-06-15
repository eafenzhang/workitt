// pre-commit.cjs — Git pre-commit hook: auto-increment version on every commit
// Ensures version number is ALWAYS bumped and included in the commit.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const HOOK_PATH = path.join(ROOT, '.git', 'hooks', 'pre-commit');

// Install mode
if (process.argv.includes('--install') || process.argv.includes('-i')) {
  const hookScript = `#!/bin/sh
node scripts/pre-commit.cjs --run
`;
  const hooksDir = path.dirname(HOOK_PATH);
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(HOOK_PATH, hookScript);
  try { fs.chmodSync(HOOK_PATH, 0o755); } catch {}
  console.log('[pre-commit] Git hook installed at .git/hooks/pre-commit');
  console.log('[pre-commit] Version will auto-increment on every commit.');
  process.exit(0);
}

// Run mode
if (process.argv.includes('--run')) {
  if (!fs.existsSync(PKG_PATH)) process.exit(0);

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const parts = pkg.version.split('.');
  parts[2] = String(Number(parts[2]) + 1);
  const oldVer = pkg.version;
  const newVer = parts.join('.');

  // Don't bump if version already bumped this session (check git diff)
  const { execSync } = require('child_process');
  try {
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf8', cwd: ROOT });
    if (!staged.includes('package.json')) {
      pkg.version = newVer;
      fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
      execSync('git add package.json', { cwd: ROOT, stdio: 'ignore' });
      console.log('[pre-commit] ' + oldVer + ' → ' + newVer);
    }
  } catch {
    // Not a git repo, skip
  }
  process.exit(0);
}

console.log('Usage: node scripts/pre-commit.cjs --install');
