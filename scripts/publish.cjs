// ─── Unified publish script ────────────────────────────────────────
// Usage: node scripts/publish.cjs <version>
// Example: node scripts/publish.cjs 1.2.16
//
// Steps:
//   1. Run build script
//   2. Create git tag
//   3. Push to GitHub
//   4. Create GitHub release + upload asset

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts }).toString();
}

function getToken() {
  try {
    const creds = fs.readFileSync(path.join(require('os').homedir(), '.git-credentials'), 'utf-8');
    for (const line of creds.split('\n')) {
      if (line.includes('github.com')) {
        return line.split(':').pop().split('@')[0];
      }
    }
  } catch {}
  return process.env.GH_TOKEN || '';
}

async function main() {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/publish.cjs <version>');
    process.exit(1);
  }

  // 1. Build
  console.log(`\n=== Build v${version} ===`);
  run(`node scripts/build.cjs ${version}`);

  // 2. Git commit and tag
  console.log('\n=== Git commit & tag ===');
  run('git add package.json release/');
  run(`git commit -m "chore: bump version to ${version}"`);
  try { run(`git tag -d v${version}`); } catch {}
  try { run(`git push origin :refs/tags/v${version}`); } catch {}
  run(`git tag -a "v${version}" -m "v${version}"`);
  run('git push origin master --force');
  run(`git push origin v${version}`);

  // 3. Create GitHub release
  console.log('\n=== Creating GitHub release ===');
  const TOKEN = getToken();
  if (!TOKEN) {
    console.error('No GitHub token found');
    process.exit(1);
  }

  const body = [
    '## 更新内容\n',
    `- 移植 MinoPencil Skia/WASM 画板引擎`,
    `- CowAgent AI 对话集成，流式设计生成`,
    `- 全新 UI 布局（原 MinoPencil 风格）`,
    `- 键盘快捷键支持、画布内编辑文本`,
    `- 图层面板可折叠、属性面板完善`,
    `- 自动保存、PNG/SVG 导出`,
    `- UI 中文化、深色模式适配`,
    `- 其他优化和修复`,
  ].join('\n');

  const json = JSON.stringify({
    tag_name: `v${version}`,
    name: `Workitt v${version}`,
    body,
    draft: false,
    prerelease: false,
  });

  const resp = require('child_process').execSync(
    `curl -s -X POST "https://api.github.com/repos/eafenzhang/Workitt/releases"` +
    ` -H "Authorization: Bearer ${TOKEN}"` +
    ` -H "Content-Type: application/json"` +
    ` -d '${json.replace(/'/g, "'\\''")}'`,
    { cwd: ROOT }
  ).toString();

  const releaseId = (resp.match(/"id": (\d+)/) || [])[1];
  if (!releaseId) {
    console.error('Failed to create release:', resp.slice(0, 200));
    process.exit(1);
  }
  console.log(`Release created: ID ${releaseId}`);

  // 4. Upload asset
  console.log('\n=== Uploading asset ===');
  const exePath = path.join(ROOT, 'release', `Workitt-Setup-${version}.exe`);
  if (!fs.existsSync(exePath)) {
    console.error('Setup exe not found:', exePath);
    process.exit(1);
  }

  const uploadUrl = `https://uploads.github.com/repos/eafenzhang/Workitt/releases/${releaseId}/assets?name=Workitt-Setup-${version}.exe`;
  execSync(
    `curl -s -X POST "${uploadUrl}"` +
    ` -H "Authorization: Bearer ${TOKEN}"` +
    ` -H "Content-Type: application/octet-stream"` +
    ` --data-binary @"${exePath}"`,
    { cwd: ROOT, stdio: 'inherit' }
  );

  console.log(`\n=== Published: https://github.com/eafenzhang/Workitt/releases/tag/v${version} ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
