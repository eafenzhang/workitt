// ─── Unified build script ──────────────────────────────────────────
// Usage: node scripts/build.cjs [version]
// Example: node scripts/build.cjs 1.2.16
//
// Steps:
//   1. Build Vite (dist/)
//   2. Create win-unpacked (manual asar)
//   3. Build portable exe (electron-builder --prepackaged)

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(process.env.LOCALAPPDATA || '', 'electron', 'Cache');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function main() {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/build.cjs <version>');
    process.exit(1);
  }

  // 1. Update package.json version
  console.log(`\n=== Bumping version to ${version} ===`);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  pkg.version = version;
  fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

  // 2. Vite build
  console.log('\n=== Vite build ===');
  run('npx vite build');

  // 3. Prepare win-unpacked
  console.log('\n=== Preparing win-unpacked ===');
  const UNPACKED = path.join(ROOT, 'release', 'win-unpacked');
  const RESOURCES = path.join(UNPACKED, 'resources');
  if (fs.existsSync(UNPACKED)) fs.rmSync(UNPACKED, { recursive: true });

  // Find electron zip
  const zipPath = path.join(CACHE_DIR, `electron-v41.7.1-win32-x64.zip`);
  if (!fs.existsSync(zipPath)) {
    console.error('Electron zip not found at:', zipPath);
    process.exit(1);
  }

  run(`unzip -q "${zipPath}" -d "${UNPACKED}"`);
  fs.mkdirSync(path.join(UNPACKED, 'electron'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'electron'), path.join(UNPACKED, 'electron'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'package.json'), path.join(UNPACKED, 'electron', 'package.json'));
  fs.renameSync(path.join(UNPACKED, 'electron.exe'), path.join(UNPACKED, 'Workitt.exe'));
  fs.writeFileSync(path.join(UNPACKED, 'package.json'), JSON.stringify({ name: 'workitt', main: 'electron/main.cjs' }));

  // 4. Build asar
  console.log('\n=== Building asar ===');
  const ASAR_SRC = path.join(ROOT, 'release', '_asar_src');
  fs.mkdirSync(path.join(ASAR_SRC, 'dist'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'dist'), path.join(ASAR_SRC, 'dist'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'electron'), path.join(ASAR_SRC, 'electron'), { recursive: true });

  const nodeModules = path.join(ASAR_SRC, 'node_modules');
  fs.mkdirSync(nodeModules, { recursive: true });
  for (const pkg of ['better-sqlite3', 'bindings', 'file-uri-to-path', 'nan',
    'electron-updater', 'builder-util-runtime', 'debug', 'ms', 'graceful-fs',
    'semver', 'sax', 'js-yaml', 'argparse', 'lazy-val']) {
    const src = path.join(ROOT, 'node_modules', pkg);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(nodeModules, pkg), { recursive: true });
    }
  }
  fs.cpSync(path.join(ROOT, 'package.json'), path.join(ASAR_SRC, 'package.json'));

  run(`npx asar pack "${ASAR_SRC}" "${path.join(RESOURCES, 'app.asar')}"`);
  fs.rmSync(ASAR_SRC, { recursive: true });

  // 5. asarUnpack
  const UNP = path.join(RESOURCES, 'app.asar.unpacked', 'node_modules', 'better-sqlite3');
  fs.mkdirSync(UNP, { recursive: true });
  const bs3 = path.join(ROOT, 'node_modules', 'better-sqlite3');
  fs.cpSync(path.join(bs3, 'build'), path.join(UNP, 'build'), { recursive: true });
  fs.cpSync(path.join(bs3, 'lib'), path.join(UNP, 'lib'), { recursive: true });
  fs.cpSync(path.join(bs3, 'package.json'), path.join(UNP, 'package.json'));

  // cowagent-backend
  const cowBackend = path.join(ROOT, '..', 'cowagent-backend');
  if (fs.existsSync(cowBackend)) {
    fs.cpSync(cowBackend, path.join(RESOURCES, 'cowagent-backend'), { recursive: true });
  }

  // Cleanup default_app.asar
  const defAsar = path.join(UNPACKED, 'default_app.asar');
  if (fs.existsSync(defAsar)) fs.rmSync(defAsar);

  // 6. Update version in win-unpacked
  const electronPkg = JSON.parse(fs.readFileSync(path.join(UNPACKED, 'electron', 'package.json'), 'utf-8'));
  electronPkg.version = version;
  fs.writeFileSync(path.join(UNPACKED, 'electron', 'package.json'), JSON.stringify(electronPkg, null, 2) + '\n');

  // 7. Build portable exe
  console.log('\n=== Building portable installer ===');
  const setupName = `Workitt-Setup-${version}.exe`;
  run(`npx electron-builder --win portable --config --prepackaged="${UNPACKED}"`);

  // Rename if needed
  const builtExe = path.join(ROOT, 'release', setupName);
  if (!fs.existsSync(builtExe)) {
    // electron-builder generates it automatically with the version from the app
    // It should be named correctly already
  }

  console.log(`\n=== Build complete: release/${setupName} ===`);
}

main();
