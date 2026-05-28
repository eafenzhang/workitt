// Strip ELECTRON_RUN_AS_NODE to fix double-click launch in Explorer.
if (process.env.ELECTRON_RUN_AS_NODE === '1') {
  const { spawn } = require('child_process');
  const env = {};
  for (const k in process.env) {
    if (k !== 'ELECTRON_RUN_AS_NODE') env[k] = process.env[k];
  }
  spawn(process.execPath, [], { detached: true, stdio: 'ignore', env });
  // Must NOT exit immediately — give child time to detach
  setTimeout(() => process.exit(0), 500);
}

const { app, BrowserWindow, shell, ipcMain, nativeImage, Tray, Menu, safeStorage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// P0-01: Whitelist for dynamic table names used in SQL
const ALLOWED_TABLES = ['requirements', 'documents', 'mcp_servers', 'models'];

// P1-09: Whitelist for allowed IPC methods on db-query
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

// P0-02: Whitelists for dynamic field names in MCP/Models PUT
const MCP_FIELDS = new Map([
  ['enabled', (v) => v ? 1 : 0],
  ['config', (v) => JSON.stringify(v)],
  ['name', (v) => v],
  ['type', (v) => v],
  ['command', (v) => v],
  ['args', (v) => JSON.stringify(v)],
  ['env', (v) => JSON.stringify(v)],
]);
const MODEL_FIELDS = new Map([
  ['name', (v) => v],
  ['apiKey', (v) => v],
  ['modelId', (v) => v],
  ['is_default', (v) => v ? 1 : 0],
  ['enabled', (v) => v ? 1 : 0],
]);

const isDev = process.defaultApp || /electron/.test(process.argv[0]);
let logPath = '';

function log(msg, err) {
  try {
    if (!logPath) logPath = path.join(app.getPath('userData'), 'workit.log');
    const line = `[${new Date().toISOString()}] ${msg}${err ? ': ' + (err.message || err) : ''}\n`;
    fs.appendFile(logPath, line, () => {});
  } catch {}
}

process.on('uncaughtException', (err) => {
  log('UNCAUGHT', err);
  try { fs.appendFile(logPath, (err.stack || '') + '\n', () => {}); } catch {}
  app.exit(1);
});
process.on('unhandledRejection', (err) => { log('UNHANDLED REJECTION', err); });

let mainWindow;
let qcWindow = null;
let db = null;
let insightsCache = null;
const preloadPath = path.join(app.getAppPath(), 'electron', 'preload.cjs');

// ========== Database ==========
async function initDatabase() {
  const sqlJsInit = require('sql.js');
  const SQL = await sqlJsInit();
  const dbPath = path.join(app.getPath('userData'), 'workit-data.db');
  const dbBackupPath = path.join(app.getPath('userData'), 'workit-data.db.bak');

  // P1-10: Database corruption recovery
  try {
    if (fs.existsSync(dbPath)) {
      // Create startup backup before any write operations
      try {
        fs.copyFileSync(dbPath, dbBackupPath);
        log('initDatabase: backup created at ' + dbBackupPath);
      } catch (backupErr) {
        log('initDatabase: backup creation failed (non-fatal)', backupErr);
      }
      const fileData = fs.readFileSync(dbPath);
      db = new SQL.Database(fileData);
      // Quick integrity check: try a simple query
      db.exec('SELECT 1');
    } else if (fs.existsSync(dbBackupPath)) {
      // Restore from backup if main DB is missing (e.g. after reinstall)
      log('initDatabase: main DB missing, restoring from backup');
      fs.copyFileSync(dbBackupPath, dbPath);
      const fileData = fs.readFileSync(dbPath);
      db = new SQL.Database(fileData);
      db.exec('SELECT 1');
    } else {
      db = new SQL.Database();
    }
  } catch (dbErr) {
    log('initDatabase: corruption detected or read error', dbErr);
    // Try to restore from backup
    if (fs.existsSync(dbBackupPath)) {
      try {
        log('initDatabase: attempting restore from backup');
        fs.copyFileSync(dbBackupPath, dbPath);
        const fileData = fs.readFileSync(dbPath);
        db = new SQL.Database(fileData);
        db.exec('SELECT 1');
        log('initDatabase: restored from backup successfully');
      } catch (restoreErr) {
        log('initDatabase: restore from backup also failed, creating fresh DB', restoreErr);
        try {
          const corruptPath = dbPath + '.corrupt.' + Date.now();
          if (fs.existsSync(dbPath)) fs.renameSync(dbPath, corruptPath);
        } catch {}
        db = new SQL.Database();
      }
    } else {
      try {
        const backupPath = dbPath + '.corrupt.' + Date.now();
        if (fs.existsSync(dbPath)) fs.renameSync(dbPath, backupPath);
      } catch (backupErr) {
        log('initDatabase: backup failed', backupErr);
      }
      db = new SQL.Database();
    }
  }

  db.run(`CREATE TABLE IF NOT EXISTS requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
    category TEXT DEFAULT '产品', module TEXT DEFAULT '用户端', priority TEXT DEFAULT '中',
    status TEXT DEFAULT '待评估', assignee TEXT DEFAULT '', creator TEXT DEFAULT '',
    due_date TEXT DEFAULT '', tags TEXT DEFAULT '[]', images TEXT DEFAULT '[]',
    ai_summary TEXT DEFAULT '', ai_tags TEXT DEFAULT '[]', image_descriptions TEXT DEFAULT '[]',
    workflow_handler TEXT DEFAULT '', workflow_history TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT DEFAULT 'guide',
    type TEXT DEFAULT 'MD', size TEXT DEFAULT '', views INTEGER DEFAULT 0, stars INTEGER DEFAULT 0,
    date TEXT DEFAULT '', tags TEXT DEFAULT '[]', featured INTEGER DEFAULT 0,
    file_path TEXT DEFAULT '', content TEXT DEFAULT '', image_descriptions TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS mcp_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
    command TEXT NOT NULL, args TEXT DEFAULT '[]', env TEXT DEFAULT '{}', enabled INTEGER DEFAULT 0,
    config TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, provider TEXT NOT NULL,
    base_url TEXT DEFAULT '', api_key TEXT DEFAULT '', model_id TEXT NOT NULL,
    enabled INTEGER DEFAULT 0, is_default INTEGER DEFAULT 0, config TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  // Migrate old status
  db.run("UPDATE requirements SET status = '待评估' WHERE status = '待评审'");

  // Migrate: add content_blocks column for unified content rendering
  try {
    db.run("ALTER TABLE requirements ADD COLUMN content_blocks TEXT DEFAULT '[]'");
    log('initDatabase: content_blocks column added');
  } catch (e) {
    // Column may already exist — ignore
    log('initDatabase: content_blocks migration (column may already exist)', e);
  }

  saveDb();
  log('initDatabase: success, path=' + dbPath);
}

// P1-01: Debounced save (200ms) + atomic write (tmp + rename)
let saveTimer = null;
function debouncedSaveDb() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDb, 200);
}

function saveDb() {
  if (!db) return;
  try {
    const dbPath = path.join(app.getPath('userData'), 'workit-data.db');
    const tmpPath = dbPath + '.tmp';
    const data = db.export();
    fs.writeFileSync(tmpPath, data);
    fs.renameSync(tmpPath, dbPath);
  } catch (e) {
    log('saveDb FAILED (disk write error — data still in memory)', e);
  }
}

// P1-02: Null checks for query/run
function query(sql, params = []) {
  if (!db) { log('query called but db is null'); return []; }
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.get());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  if (!db) { log('run called but db is null'); return; }
  db.run(sql, params);
  debouncedSaveDb(); // P1-01: debounced instead of sync save
}

// P0-03: Encrypt API key before storage
function encryptApiKey(plainText) {
  if (!plainText) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plainText).toString('base64');
    }
  } catch (e) {
    log('encryptApiKey failed, storing as plaintext', e);
  }
  return plainText;
}

// P0-03: Decrypt API key with fallback for old plaintext data
function decryptApiKey(stored) {
  if (!stored) return '';
  try {
    // Try decrypting (new encrypted format)
    if (safeStorage.isEncryptionAvailable()) {
      const buf = Buffer.from(stored, 'base64');
      // safeStorage encrypted buffers are not valid UTF-8 plaintext
      // If decryptString succeeds, it was encrypted
      return safeStorage.decryptString(buf);
    }
  } catch {
    // Fallback: old plaintext data (not encrypted)
    return stored;
  }
  return stored;
}

function getDefaultModel() {
  const rows = query('SELECT * FROM models WHERE enabled = 1 AND is_default = 1 LIMIT 1');
  if (!rows.length) {
    const any = query('SELECT * FROM models WHERE enabled = 1 LIMIT 1');
    if (!any.length) {
      const all = query('SELECT * FROM models');
      log('getDefaultModel: no enabled model found. Total models: ' + all.length);
      return null;
    }
    log('getDefaultModel: using first enabled model: ' + any[0][1]);
    return { baseUrl: any[0][3], apiKey: decryptApiKey(any[0][4]), modelId: any[0][5] };
  }
  log('getDefaultModel: using default model: ' + rows[0][1]);
  return { baseUrl: rows[0][3], apiKey: decryptApiKey(rows[0][4]), modelId: rows[0][5] };
}

async function callAI(prompt) {
  const model = getDefaultModel();
  if (!model || !model.apiKey) return null;
  // Detect API style from baseUrl
  const isAnthropic = model.baseUrl.includes('anthropic');
  let url = model.baseUrl.replace(/\/+$/, '');
  if (isAnthropic) {
    url += '/v1/messages';
  } else {
    url += '/v1/chat/completions';
  }
  try {
    // P1-08: Set proper auth headers for Anthropic vs OpenAI-style APIs
    const headers = { 'Content-Type': 'application/json' };
    if (isAnthropic) {
      headers['x-api-key'] = model.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = 'Bearer ' + model.apiKey;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model.modelId,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000, temperature: 0.7,
      }),
      signal: AbortSignal.timeout(30000), // P1-07: 30s timeout
    });
    const data = await res.json();
    log('AI call response status=' + res.status + ' body=' + JSON.stringify(data).substring(0, 500));
    // OpenAI format: { choices: [{ message: { content: "..." } }] }
    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content.trim();
    }
    // Anthropic/Minimax format: { content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "..." }] }
    if (data.content && Array.isArray(data.content)) {
      // Try standard Anthropic text block first
      const textBlock = data.content.find((c) => c.type === 'text');
      if (textBlock?.text) return textBlock.text.trim();
      // MiniMax M2.7 thinking model: content only has thinking block, no text block
      const thinkingBlock = data.content.find((c) => c.thinking);
      if (thinkingBlock?.thinking) return thinkingBlock.thinking.trim();
    }
    log('AI call unexpected response format: ' + JSON.stringify(data).substring(0, 300));
    return null;
  } catch (e) {
    log('AI call failed', e);
    return null;
  }
}

// ========== IPC Handlers ==========
function setupIPC() {
  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.handle('window-minimize', () => mainWindow?.minimize());
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize();
  });
  ipcMain.handle('window-close', () => mainWindow?.close());
  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() || false);

  ipcMain.handle('db-query', async (event, method, table, args) => {
    try {
      // P1-09: Method whitelist validation
      if (!ALLOWED_METHODS.includes(method)) return { error: 'Method not allowed: ' + method };

      // P0-04: QC window source validation — only allow GET on requirements
      if (qcWindow && !qcWindow.isDestroyed() && event.sender === qcWindow.webContents) {
        if (method !== 'GET' || table !== 'requirements') {
          log('db-query BLOCKED from QC window: method=' + method + ' table=' + table);
          return { error: 'Access denied from QC window' };
        }
      }

      const { data, id } = args || {};
      const result = await handleDbQuery(method, table, data, id);
      const rtype = Array.isArray(result) ? 'array[' + result.length + ']' : (typeof result) + '/' + Object.keys(result||{}).slice(0,3).join(',');
      const extra = (result && result.id !== undefined) ? ' id=' + result.id : '';
      log('db-query: ' + method + ' ' + table + ' → ' + rtype + extra);
      return result;
    } catch (e) { log('db-query ERROR', e); return { error: e.message }; }
  });

  ipcMain.handle('db-upload', async (_, table, fileData) => {
    try {
      const uploadsDir = path.join(app.getPath('userData'), 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const filename = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = '.bin';
      const filePath = path.join(uploadsDir, filename + ext);
      fs.writeFileSync(filePath, Buffer.from(fileData));
      const url = `/uploads/${filename}${ext}`;
      return { url };
    } catch (e) { return { error: e.message }; }
  });
}

async function handleDbQuery(method, table, data, id) {
  table = String(table || '').split('?')[0];
  switch (table) {
    case 'requirements':
      return handleRequirements(method, data, id);
    case 'documents':
      return handleDocuments(method, data, id);
    case 'mcp':
      return handleMcp(method, data, id);
    case 'models':
      return handleModels(method, data, id);
    case 'dashboard/stats': {
      // Merged single query: total, completed, in-progress in one pass
      const statsRow = query("SELECT COUNT(*) as cnt, SUM(CASE WHEN status='已完成' THEN 1 ELSE 0 END), SUM(CASE WHEN status='实现中' THEN 1 ELSE 0 END) FROM requirements")[0];
      const total = statsRow[0];
      const completed = statsRow[1] || 0;
      const inProgress = statsRow[2] || 0;
      const docCount = query('SELECT COUNT(*) FROM documents')[0][0];
      return [
        { label: '需求总数', value: String(total), change: '+' + total, icon: 'SparklesIcon', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
        { label: '完成率', value: total ? Math.round(completed/total*100) + '%' : '0%', change: completed + ' 已完成', icon: 'CheckCircleIcon', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
        { label: '进行中', value: String(inProgress), change: inProgress + ' 项', icon: 'ZapIcon', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
        { label: '知识文档', value: String(docCount), change: docCount + ' 篇', icon: 'DatabaseIcon', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
      ];
    }
    case 'dashboard/charts': {
      const total = query('SELECT COUNT(*) FROM requirements')[0][0];
      const docCount = query('SELECT COUNT(*) FROM documents')[0][0];
      const cats = query('SELECT category, COUNT(*) FROM requirements GROUP BY category');
      return {
        areaData: [
          { name: '1月', 需求: 0, 知识: 0, 洞察分析: 0 },
          { name: '2月', 需求: 0, 知识: 0, 洞察分析: 0 },
          { name: '3月', 需求: 0, 知识: 0, 洞察分析: 0 },
          { name: '4月', 需求: 0, 知识: 0, 洞察分析: 0 },
          { name: '5月', 需求: total, 知识: docCount, 洞察分析: 0 },
          { name: '6月', 需求: 0, 知识: 0, 洞察分析: 0 },
          { name: '7月', 需求: 0, 知识: 0, 洞察分析: 0 },
        ],
        barData: cats.map(r => ({ name: r[0]||'未分类', value: r[1] })),
      };
    }
    case 'dashboard/activities': {
      const rows = query("SELECT id, title, status, updated_at FROM requirements ORDER BY updated_at DESC LIMIT 10");
      const iconMap = { '待评估': 'AlertCircleIcon', '设计中': 'EditIcon', '实现中': 'ArrowUpIcon', '测试中': 'SearchIcon', '已完成': 'CheckCircleIcon' };
      const colorMap = { '待评估': '#f59e0b', '设计中': '#6366f1', '实现中': '#06b6d4', '测试中': '#8b5cf6', '已完成': '#10b981' };
      return rows.map(r => ({ id: r[0], icon: iconMap[r[2]] || 'ClockIcon', color: colorMap[r[2]] || '#888', text: r[1] || '', time: r[3] }));
    }
    case 'insights/kpis': {
      const total = query('SELECT COUNT(*) FROM requirements')[0][0];
      const completed = query("SELECT COUNT(*) FROM requirements WHERE status='已完成'")[0][0];
      const docCount = query('SELECT COUNT(*) FROM documents')[0][0];
      return [
        { label: '需求总数', value: String(total), change: '0', up: true },
        { label: '完成率', value: total ? Math.round(completed/total*100) + '%' : '0%', change: '0%', up: true },
        { label: '知识文档', value: String(docCount), change: '0', up: true },
      ];
    }
    case 'insights/charts': {
      const cats = query('SELECT category, COUNT(*) FROM documents GROUP BY category');
      const types = query('SELECT type, COUNT(*) FROM documents GROUP BY type');
      return {
        barData: cats.map(r => ({ name: r[0]||'未分类', value: r[1] })),
        pieData: types.map(r => ({ name: r[0]||'未知', value: r[1] })),
      };
    }
    case 'insights/ai-insights': {
      // GET: return cached insights; POST: generate fresh ones from AI
      if (method === 'POST') {
        // Gather all statistics for AI analysis
        const totalReqs = query('SELECT COUNT(*) FROM requirements')[0][0];
        const statusRows = query("SELECT status, COUNT(*) FROM requirements GROUP BY status");
        const categoryRows = query("SELECT category, COUNT(*) FROM requirements GROUP BY category");
        const priorityRows = query("SELECT priority, COUNT(*) FROM requirements GROUP BY priority");
        const totalDocs = query('SELECT COUNT(*) FROM documents')[0][0];
        const docTypeRows = query("SELECT type, COUNT(*) FROM documents GROUP BY type");
        const featuredDocs = query("SELECT COUNT(*) FROM documents WHERE featured=1")[0][0];
        const recentCreated = query("SELECT COUNT(*) FROM requirements WHERE created_at >= datetime('now','-7 days')")[0][0];
        const completedReqs = query("SELECT COUNT(*) FROM requirements WHERE status='已完成'")[0][0];

        const statsSummary = [
          `需求总数: ${totalReqs}, 已完成: ${completedReqs}, 近7日新增: ${recentCreated}`,
          `需求状态分布: ${statusRows.map(r => r[0] + ':' + r[1]).join(', ')}`,
          `需求分类分布: ${categoryRows.map(r => r[0] + ':' + r[1]).join(', ')}`,
          `需求优先级分布: ${priorityRows.map(r => r[0] + ':' + r[1]).join(', ')}`,
          `知识文档总数: ${totalDocs}, 精选文档: ${featuredDocs}`,
          `文档类型分布: ${docTypeRows.map(r => r[0] + ':' + r[1]).join(', ')}`,
        ].join('\n');

        const prompt = [
          '你是智能体工作台的数据分析师。请根据以下项目统计数据生成3-4条洞察分析。',
          '',
          '项目数据：',
          statsSummary,
          '',
          '输出要求（只输出纯JSON，不要markdown代码块）：',
          '{',
          '  "insights": [',
          '    {',
          '      "title": "洞察标题（简洁有力，8字以内）",',
          '      "desc": "详细分析说明（50字以内，说明数据含义和建议）",',
          '      "icon": "TrendingUpIcon|AlertTriangleIcon|BrainCircuitIcon|ZapIcon",',
          '      "color": "#6366f1|#f59e0b|#10b981|#ef4444|#06b6d4|#8b5cf6",',
          '      "bg": "#6366f115|#f59e0b15|#10b98115|#ef444415|#06b6d415|#8b5cf615",',
          '      "score": 85',
          '    }',
          '  ]',
          '}',
          '',
          '注意：',
          '- score 是置信度 60-95 之间',
          '- 如果有大量"待评估"状态，建议用 AlertTriangleIcon',
          '- 如果完成率较高，建议用 TrendingUpIcon 并给正向评价',
          '- desc 要包含具体数据和建议行动',
        ].join('\n');

        try {
          // Check model availability first for better error messages
          const model = getDefaultModel();
          if (!model) {
            return { error: '未配置大模型：请在「设置 → 模型配置」中添加并启用至少一个模型' };
          }
          if (!model.apiKey) {
            return { error: '模型缺少 API Key：请在模型配置中填写 ' + model.modelId + ' 的 API 密钥' };
          }
          const aiResult = await callAI(prompt);
          if (!aiResult) {
            return { error: 'AI 调用失败：请检查模型 ' + model.modelId + ' 的接口地址和 API Key 是否正确' };
          }
          let jsonStr = aiResult.replace(/```[a-z]*\n?/g, '').replace(/`/g, '').trim();
          let parsed;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            const match = jsonStr.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
            else throw new Error('No JSON object found');
          }
          const insights = (parsed.insights || []).slice(0, 4);
          // Cache in memory
          insightsCache = insights;
          return insights;
        } catch (e) {
          log('AI insights generation failed: ' + e.message);
          return { error: 'AI 分析失败：' + e.message };
        }
      }
      // GET: return cached insights or empty
      return insightsCache || [];
    }
    case 'storage/stats': {
      try {
        const uploadsDir = path.join(app.getPath('userData'), 'uploads');
        if (!fs.existsSync(uploadsDir)) return { usedBytes: 0 };
        const files = fs.readdirSync(uploadsDir);
        let usedBytes = 0;
        const docPaths = new Set(query("SELECT file_path FROM documents WHERE file_path != ''").map(r => path.basename(r[0])));
        for (const f of files) { if (docPaths.has(f)) usedBytes += fs.statSync(path.join(uploadsDir, f)).size; }
        return { usedBytes };
      } catch { return { usedBytes: 0 }; }
    }
    default: {
      // Handle /analyze, /summarize, /preview sub-routes
      const actionMatch = table.match(/^(\w+)\/(\d+)\/(\w+)$/);
      if (actionMatch) {
        const [, resType, resId, action] = actionMatch;
        // P0-01: Validate dynamic table name against whitelist
        if (!ALLOWED_TABLES.includes(resType)) return { error: 'Invalid table: ' + resType };
        const req = query(`SELECT * FROM ${resType} WHERE id = ?`, [parseInt(resId)])[0];
        if (!req) return { error: 'Not found' };
        if (action === 'analyze') {
          const desc = (req[2] || '').trim();
          if (!desc) return { error: 'No description to analyze' };
          const aiResult = await callAI(
            `你是需求分析助手。请分析以下需求描述，输出JSON格式（不要markdown代码块，只输出纯JSON）：\n{"summary":"一段简洁的中文摘要（50字以内，抽象式总结核心意图）","tags":["标签1","标签2","标签3"]}\n\n需求描述：${desc}`
          );
          if (!aiResult) return { error: 'AI analysis failed: model not configured or API error' };
          let aiSummary = ''; let aiTags = [];
          try {
            let jsonStr = aiResult.replace(/```[a-z]*\n?/g, '').replace(/`/g, '').trim();
            let parsed;
            try {
              parsed = JSON.parse(jsonStr);
            } catch {
              const match = jsonStr.match(/\{[\s\S]*\}/);
              if (match) parsed = JSON.parse(match[0]);
              else throw new Error('No JSON object found in response');
            }
            aiSummary = parsed.summary || '';
            aiTags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [];
          } catch (parseErr) {
            log('AI analysis parse failed, raw response: ' + aiResult.substring(0, 300));
            return { error: 'AI analysis failed: invalid response format' };
          }
          if (!aiSummary) return { error: 'AI analysis failed: empty summary' };
          run(`UPDATE ${resType} SET ai_summary = ?, ai_tags = ?, image_descriptions = ? WHERE id = ?`,
            [aiSummary, JSON.stringify(aiTags), JSON.stringify([]), parseInt(resId)]);
          return { success: true, aiSummary, aiTags, imageDescriptions: [] };
        }
        if (action === 'summarize') {
          const title = req[1] || '';
          const content = (req[11] || '').substring(0, 500);
          const summary = content ? generateAISummary(content) : title;
          run(`UPDATE documents SET content = ? WHERE id = ?`, [summary, parseInt(resId)]);
          return { success: true, summary };
        }
      }
      return { error: 'Unknown table: ' + table };
    }
  }
}

function handleRequirements(method, data, id) {
  try {
  switch (method) {
    case 'GET':
      if (id) {
        const r = query('SELECT * FROM requirements WHERE id = ?', [id]);
        if (!r.length) return { error: 'Not found' };
        return formatReq(r[0]);
      }
      const all = query('SELECT * FROM requirements ORDER BY created_at DESC');
      return all.map(formatReq);
    case 'POST': {
      const { title, desc, category, module, priority, assignee, creator, dueDate, tags, images, content_blocks } = data || {};
      const contentBlocksStr = typeof content_blocks === 'string' ? content_blocks : JSON.stringify(content_blocks || []);
      run(`INSERT INTO requirements (title, description, category, module, priority, assignee, creator, due_date, tags, images, content_blocks) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [title||'', desc||'', category||'', module||'用户端', priority||'', assignee||'', creator||'', dueDate||'', JSON.stringify(tags||[]), JSON.stringify(images||[]), contentBlocksStr]);
      // Use MAX(id) instead of last_insert_rowid() — some sql.js versions return 0 from last_insert_rowid()
      const newId = query('SELECT MAX(id) FROM requirements')[0][0];
      log('handleReq POST: newId=' + newId + ' title=' + (title||'').substring(0, 30));
      return { success: true, id: newId };
    }
    case 'PUT': {
      if (!id) return { error: 'No id' };
      const { title, desc, category, module, priority, status, assignee, creator, dueDate, tags, images, workflow_handler, content_blocks } = data || {};
      let workflowHistory = [];
      try { workflowHistory = JSON.parse(query('SELECT workflow_history FROM requirements WHERE id = ?', [id])[0]?.[0] || '[]'); } catch {}
      if (status) {
        const old = query('SELECT status FROM requirements WHERE id = ?', [id])[0]?.[0];
        if (old && old !== status) workflowHistory.push({ from: old, to: status, handler: workflow_handler || '', time: new Date().toLocaleString('zh-CN') });
      }
      const contentBlocksStr = typeof content_blocks === 'string' ? content_blocks : JSON.stringify(content_blocks || []);
      run(`UPDATE requirements SET title=?, description=?, category=?, module=?, priority=?, status=?, assignee=?, creator=?, due_date=?, tags=?, images=?, content_blocks=?, workflow_history=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [title||'', desc||'', category||'', module||'用户端', priority||'', status||'', assignee||'', creator||'', dueDate||'', JSON.stringify(tags||[]), JSON.stringify(images||[]), contentBlocksStr, JSON.stringify(workflowHistory), id]);
      return { success: true };
    }
    case 'DELETE': {
      if (id) run('DELETE FROM requirements WHERE id = ?', [id]);
      return { success: true };
    }
    default: return { error: 'Unknown method' };
  }
  } catch (e) { log('handleRequirements ERROR', e); return []; }
}

function handleDocuments(method, data, id) {
  try {
  switch (method) {
    case 'GET':
      if (id) {
        const r = query('SELECT * FROM documents WHERE id = ?', [id]);
        if (!r.length) return { error: 'Not found' };
        run('UPDATE documents SET views = views + 1 WHERE id = ?', [id]);
        return formatDoc(r[0]);
      }
      return query('SELECT id, title, category, type, size, views, stars, date, tags, featured, created_at FROM documents ORDER BY created_at DESC').map(r => ({
        id: r[0], title: r[1], category: r[2], type: r[3], size: r[4], views: r[5], stars: r[6], date: r[7], tags: JSON.parse(r[8] || '[]'), featured: r[9] === 1,
      }));
    case 'POST': {
      const { title, category, type, size, date, tags, featured, content, file_path } = data || {};
      run('INSERT INTO documents (title, category, type, size, date, tags, featured, content, file_path) VALUES (?,?,?,?,?,?,?,?,?)',
        [title||'', category||'guide', type||'MD', size||'', date||'', JSON.stringify(tags||[]), featured ? 1 : 0, content||'', file_path||'']);
      return { success: true, id: query('SELECT MAX(id) FROM documents')[0][0] };
    }
    case 'PUT': {
      if (!id) return { error: 'No id' };
      const { title, category, type, size, date, tags, featured, content } = data || {};
      run("UPDATE documents SET title=?, category=?, type=?, size=?, date=?, tags=?, featured=?, content=?, updated_at=datetime('now','localtime') WHERE id=?",
        [title||'', category||'', type||'', size||'', date||'', JSON.stringify(tags||[]), featured?1:0, content||'', id]);
      return { success: true };
    }
    case 'DELETE': {
      if (id) run('DELETE FROM documents WHERE id = ?', [id]);
      return { success: true };
    }
    default: return { error: 'Unknown method' };
  }
  } catch (e) { log('handleDocuments ERROR', e); return []; }
}

function handleMcp(method, data, id) {
  try {
  switch (method) {
    case 'GET':
      return query('SELECT * FROM mcp_servers ORDER BY id DESC').map(r => ({
        id: r[0], name: r[1], type: r[2], command: r[3], args: JSON.parse(r[4]||'[]'), env: JSON.parse(r[5]||'{}'),
        enabled: !!r[6], config: JSON.parse(r[7]||'{}'), createdAt: r[8],
      }));
    case 'POST': {
      const { name, type, command, args, env, config } = data || {};
      run('INSERT INTO mcp_servers (name, type, command, args, env, config) VALUES (?,?,?,?,?,?)',
        [name||'', type||'', command||'', JSON.stringify(args||[]), JSON.stringify(env||{}), JSON.stringify(config||{})]);
      return { success: true };
    }
    case 'PUT': {
      if (!id) return { error: 'No id' };
      const { enabled, config, name, type, command, args, env } = data || {};
      // P0-02: Use field whitelist for MCP PUT to prevent SQL injection
      const fields = []; const vals = [];
      if (enabled !== undefined) { fields.push('enabled=?'); vals.push(enabled?1:0); }
      if (config !== undefined) { fields.push('config=?'); vals.push(JSON.stringify(config)); }
      if (name !== undefined) { fields.push('name=?'); vals.push(name); }
      if (type !== undefined) { fields.push('type=?'); vals.push(type); }
      if (command !== undefined) { fields.push('command=?'); vals.push(command); }
      if (args !== undefined) { fields.push('args=?'); vals.push(JSON.stringify(args)); }
      if (env !== undefined) { fields.push('env=?'); vals.push(JSON.stringify(env)); }
      if (fields.length) { vals.push(id); run(`UPDATE mcp_servers SET ${fields.join(',')} WHERE id=?`, vals); }
      return { success: true };
    }
    case 'DELETE': { if (id) run('DELETE FROM mcp_servers WHERE id = ?', [id]); return { success: true }; }
    default: return { error: 'Unknown method' };
  }
  } catch (e) { log('handleMcp ERROR', e); return []; }
}

function handleModels(method, data, id) {
  try {
  switch (method) {
    case 'GET':
      return query('SELECT * FROM models ORDER BY is_default DESC, id DESC').map(r => ({
        id: r[0], name: r[1], provider: r[2], baseUrl: r[3], apiKey: r[4] ? (() => { try { const dec = decryptApiKey(r[4]); return '******' + (dec ? dec.slice(-4) : ''); } catch { return '******'; } })() : '',
        hasApiKey: !!r[4], modelId: r[5], enabled: !!r[6], isDefault: !!r[7], createdAt: r[9],
      }));
    case 'POST': {
      const { name, provider, baseUrl, apiKey, modelId } = data || {};
      const displayName = name || (provider + ' - ' + modelId);
      // P0-03: Encrypt API key before storage
      const encryptedKey = encryptApiKey(apiKey || '');
      run('INSERT INTO models (name, provider, base_url, api_key, model_id, enabled) VALUES (?,?,?,?,?,1)',
        [displayName, provider||'', baseUrl||'', encryptedKey, modelId||'']);
      // P1-03: Fixed wrong table name — was 'documents', should be 'models'
      return { success: true, id: query('SELECT MAX(id) FROM models')[0][0] };
    }
    case 'PUT': {
      if (!id) return { error: 'No id' };
      const { is_default, apiKey, modelId, name, enabled } = data || {};
      if (is_default) run('UPDATE models SET is_default = 0');
      // P0-02: Use field whitelist for Models PUT to prevent SQL injection
      const fields = []; const vals = [];
      if (name !== undefined) { fields.push('name=?'); vals.push(name); }
      // P0-03: Encrypt API key on update
      if (apiKey !== undefined) { fields.push('api_key=?'); vals.push(encryptApiKey(apiKey)); }
      if (modelId !== undefined) { fields.push('model_id=?'); vals.push(modelId); }
      if (is_default !== undefined) { fields.push('is_default=?'); vals.push(is_default?1:0); }
      if (enabled !== undefined) { fields.push('enabled=?'); vals.push(enabled?1:0); }
      if (fields.length) { vals.push(id); run(`UPDATE models SET ${fields.join(',')} WHERE id=?`, vals); }
      return { success: true };
    }
    case 'DELETE': { if (id) run('DELETE FROM models WHERE id = ?', [id]); return { success: true }; }
    default: return { error: 'Unknown method' };
  }
  } catch (e) { log('handleModels ERROR', e); return []; }
}

function formatReq(r) {
  // NOTE: ALTER TABLE ADD COLUMN appends to end. content_blocks is at index 19, NOT 15.
  // Original columns 15-18 (workflow_handler, workflow_history, created_at, updated_at)
  // remain at their original positions.
  return {
    id: r[0], title: r[1], desc: r[2], category: r[3], module: r[4]||'用户端', priority: r[5],
    status: r[6], assignee: r[7], creator: r[8], dueDate: r[9], tags: JSON.parse(r[10]||'[]'),
    images: JSON.parse(r[11]||'[]'), aiSummary: r[12]||'', aiTags: JSON.parse(r[13]||'[]'),
    imageDescriptions: JSON.parse(r[14]||'[]'),
    workflowHandler: r[15]||'', workflowHistory: JSON.parse(r[16]||'[]'),
    createdAt: r[17], updatedAt: r[18],
    contentBlocks: (() => { try { return JSON.parse(r[19] || '[]'); } catch { return []; } })(),
  };
}

function formatDoc(r) {
  return {
    id: r[0], title: r[1], category: r[2], type: r[3], size: r[4],
    views: r[5], stars: r[6], date: r[7], tags: JSON.parse(r[8]||'[]'),
    featured: r[9]===1, file_path: r[10]||'', content: r[11]||'',
    imageDescriptions: JSON.parse(r[12]||'[]'), createdAt: r[13],
  };
}

function setupWindowEvents(win) {
  win.on('maximize', () => win.webContents?.send('window-maximized-change', true));
  win.on('unmaximize', () => win.webContents?.send('window-maximized-change', false));
}

async function createWindow() {
  // If window already exists, just show and focus it
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    log('createWindow: reusing existing window');
    return;
  }

  log('Creating window...');
  try {
  log('createWindow: preload path = ' + preloadPath);
  log('createWindow: preload exists = ' + fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    title: 'Workit',
    icon: nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon.png')),
    frame: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true, preload: preloadPath },
  });

  setupWindowEvents(mainWindow);
  setupIPC();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    log('createWindow: ready-to-show, window displayed');
  });

  try {
    await initDatabase();
  } catch (dbErr) {
    log('createWindow: initDatabase FAILED', dbErr);
    console.error('initDatabase failed:', dbErr);
  }

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
  log('createWindow: success');
  } catch (e) { log('createWindow: FAILED', e); }
}

app.whenReady().then(async () => {
  log('App ready');
  try {
    setupAutoUpdater();
    await createWindow();

    // Tray + QC window + settings
    let tray = null;
    let minimizeToTray = false;

    function createTray() {
      if (tray) return;
      const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon.png')).resize({ width: 16, height: 16 });
      tray = new Tray(icon);
      tray.setToolTip('Workit');
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
          const { screen } = require('electron');
          const disp = screen.getPrimaryDisplay();
          const { width, height } = disp.workAreaSize;
          qcWindow = new BrowserWindow({
            width: 56, height: 56,
            x: width - 76, y: height - 76,
            frame: false, resizable: false, alwaysOnTop: true,
            skipTaskbar: true, transparent: true,
            webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, additionalArguments: ['--qc-popup'] }
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

    ipcMain.handle('test-model-connection', async (_, baseUrl, apiKey, modelId) => {
      try {
        // Detect API style from baseUrl
        const isAnthropic = baseUrl.includes('anthropic');
        let url = baseUrl.replace(/\/+$/, '');
        if (isAnthropic) {
          url += '/v1/messages';
        } else {
          url += '/v1/chat/completions';
        }
        log('Model test: ' + url);
        // P1-08: Set proper auth headers for Anthropic vs OpenAI-style APIs
        const headers = { 'Content-Type': 'application/json' };
        if (isAnthropic) {
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else {
          headers['Authorization'] = 'Bearer ' + apiKey;
        }
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
          signal: AbortSignal.timeout(10000),
        });
        const text = await res.text();
        log('Model test response status=' + res.status + ' body=' + text.substring(0, 200));
        try {
          const data = JSON.parse(text);
          // OpenAI: choices[0].message.content, Anthropic: content[].text (may have thinking blocks first)
          return !!(data.choices?.[0]?.message?.content
            || (data.content && Array.isArray(data.content) && data.content.some((c) => c.type === 'text' && c.text))
            || data.id);
        } catch {
          return false;
        }
      } catch (e) {
        log('Model test failed', e);
        return false;
      }
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

    ipcMain.handle('read-local-file', (_, filePath) => {
      try {
        if (!filePath || !fs.existsSync(filePath)) { log('readLocalFile: not found: ' + filePath); return null; }
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
        // macOS: Finder files
        if (typeof clipboard.readFinderFiles === 'function') {
          const files = clipboard.readFinderFiles();
          if (Array.isArray(files) && files.length > 0) return files;
        }
        // Windows: read CF_HDROP / FileNameW format
        if (process.platform === 'win32') {
          try {
            const buf = clipboard.readBuffer('FileNameW');
            if (buf && buf.length > 0) {
              // CF_HDROP: null-terminated file paths, double-null terminated
              const text = buf.toString('utf16le').replace(/\0/g, '\n');
              const paths = text.split('\n').map(s => s.trim()).filter(Boolean);
              if (paths.length > 0) return paths;
            }
          } catch {}
        }
        // Fallback: try reading as text (some apps put file paths as text)
        try {
          const text = clipboard.readText();
          if (text) {
            const lines = text.split('\n').filter(l => /^[A-Za-z]:[\\/]/.test(l) || /^file:\/\//.test(l));
            if (lines.length > 0) return lines;
          }
        } catch {}
        return [];
      } catch {
        return [];
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

  } catch (e) { log('App ready handler failed', e); }
});

function setupAutoUpdater() {
  if (isDev) return;
  try {
    const { autoUpdater } = require('electron-updater');
    // Verify update feed is available (app-update.yml exists)
    // currentVersion access triggers a file read — catch if missing (local build)
    try {
      const v = autoUpdater.currentVersion;
      if (!v) {
        log('AutoUpdater: no update feed (local build), skipping');
        return;
      }
    } catch {
      log('AutoUpdater: app-update.yml not found (local build), skipping');
      return;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Manual check: just report what's available, don't trigger download
    ipcMain.handle('check-for-update', async () => {
      try {
        const r = await autoUpdater.checkForUpdates();
        const current = app.getVersion();
        if (r?.updateInfo?.version) {
          const v = r.updateInfo.version;
          log('Updater check: found v' + v + ' current=' + current);
          return { available: v !== current, version: v, current };
        }
        return { available: false, current };
      } catch (e) {
        log('Updater check error: ' + (e.message || e));
        return { available: false, error: e.message || 'Unknown error', current: app.getVersion() };
      }
    });

    ipcMain.handle('download-update', async () => {
      try { await autoUpdater.downloadUpdate(); return { ok: true }; }
      catch (e) { return { ok: false, error: e.message }; }
    });

    ipcMain.handle('install-update', () => { autoUpdater.quitAndInstall(); return true; });

    autoUpdater.on('update-available', (info) => {
      log('Updater: v' + info.version + ' available');
      mainWindow?.webContents?.send('update-available', info.version);
    });
    autoUpdater.on('download-progress', (p) => {
      mainWindow?.webContents?.send('update-download-progress', Math.round(p.percent));
    });
    autoUpdater.on('update-downloaded', () => {
      log('Updater: downloaded, install on quit');
      mainWindow?.webContents?.send('update-downloaded');
    });
    autoUpdater.on('error', (e) => log('Updater error: ' + e.message));

    autoUpdater.logger = {
      debug: () => {}, info: (m) => log('Updater: ' + m),
      warn: (m) => log('Updater warn: ' + m), error: (m) => log('Updater error: ' + m)
    };

    // Startup: auto-check & download in background
    setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 10000);
  } catch (e) { log('AutoUpdater init failed', e); }
}

app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://') && !url.startsWith('http://localhost')) event.preventDefault();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
