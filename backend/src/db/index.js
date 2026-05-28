import Database from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/wiki.db');

let db;

async function initDB() {
  const SQL = await import('sql.js');
  const initSqlJs = SQL.default;
  const SQLJS = await initSqlJs();

  // 确保 data 目录存在
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 尝试从文件加载，或者创建新的
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQLJS.Database(buffer);
    console.log('[DB] Loaded from', DB_PATH);
  } else {
    db = new SQLJS.Database();
    console.log('[DB] Created new database');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT '产品',
      module TEXT DEFAULT '用户端',
      priority TEXT DEFAULT '中',
      status TEXT DEFAULT '待评估',
      assignee TEXT DEFAULT '',
      creator TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      images TEXT DEFAULT '[]',
      ai_summary TEXT DEFAULT '',
      ai_tags TEXT DEFAULT '[]',
      image_descriptions TEXT DEFAULT '[]',
      workflow_handler TEXT DEFAULT '',
      workflow_history TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 兼容旧DB：补充新加的列
  try { db.run("ALTER TABLE requirements ADD COLUMN module TEXT DEFAULT '用户端'"); } catch {}
  try { db.run("ALTER TABLE requirements ADD COLUMN workflow_handler TEXT DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE requirements ADD COLUMN workflow_history TEXT DEFAULT '[]'"); } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'guide',
      type TEXT DEFAULT 'MD',
      size TEXT DEFAULT '',
      views INTEGER DEFAULT 0,
      stars INTEGER DEFAULT 0,
      date TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      featured INTEGER DEFAULT 0,
      file_path TEXT DEFAULT '',
      content TEXT DEFAULT '',
      image_descriptions TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 兼容旧DB：补充新加的列
  try { db.run("ALTER TABLE documents ADD COLUMN content TEXT DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE documents ADD COLUMN image_descriptions TEXT DEFAULT '[]'"); } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      command TEXT NOT NULL,
      args TEXT DEFAULT '[]',
      env TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 0,
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  const mcpCount = db.exec("SELECT COUNT(*) FROM mcp_servers")[0]?.values[0][0] || 0;
  if (mcpCount === 0) {
    const stmt = db.prepare(`INSERT INTO mcp_servers (name, type, command, args, env, enabled, config) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(['TAPD', 'tapd', 'node', '["C:/Users/121212/Desktop/react/backend/src/mcp/tapd.js"]', '{}', 0, '{"workspaceId": "32690680"}']);
    stmt.free();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      base_url TEXT DEFAULT '',
      api_key TEXT DEFAULT '',
      model_id TEXT NOT NULL,
      enabled INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 模型默认配置（不插入占位数据）
  const modelCount = db.exec("SELECT COUNT(*) FROM models")[0]?.values[0][0] || 0;
  if (modelCount === 0) {
    // 不插入默认模型，让用户自行配置
  }

  const reqCount = db.exec("SELECT COUNT(*) FROM requirements")[0]?.values[0][0] || 0;
  if (reqCount === 0) {
    // 不插入样例数据，保持空白
  }

  // 迁移：将旧状态"待评审"更新为"待评估"
  db.run("UPDATE requirements SET status = '待评估' WHERE status = '待评审'");

  // 清理：删除 AI 自动创建的冗余知识文档（由 analyze 接口创建的 '需求' 分类文档是摘要副本，非用户上传）
  db.run("DELETE FROM documents WHERE category = '需求' AND file_path = ''");

  const docCount = db.exec("SELECT COUNT(*) FROM documents")[0]?.values[0][0] || 0;
  if (docCount === 0) {
    // 不插入样例数据，保持空白
  }

  // 保存到文件
  saveDB();

  console.log('[DB] SQLite initialized');
  return db;
}

function saveDB() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// 每次数据变更后自动保存
function getDb() {
  return {
    exec: (...args) => {
      const result = db.exec(...args);
      return result;
    },
    run: (...args) => {
      db.run(...args);
    },
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      const originalRun = stmt.run.bind(stmt);
      stmt.run = (...args) => {
        originalRun(...args);
      };
      const originalFree = stmt.free.bind(stmt);
      stmt.free = (...args) => {
        return originalFree(...args);
      };
      return stmt;
    },
    // 原生 db 访问（用于需要保留连接状态的场景）
    raw: () => db,
  };
}

// 直接保存不经过 wrapper（用于需要保持连接状态的场景）
function saveDbDirect() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

export { initDB, getDb, saveDB, saveDbDirect };