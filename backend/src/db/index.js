import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/wiki.db');

let db;

function initDB() {
  // 确保 data 目录存在
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // better-sqlite3 直接读写文件，无需 WASM 加载
  db = new Database(DB_PATH);

  // 开启 WAL 模式（即时持久化 + 并发读）
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  console.log('[DB] better-sqlite3 initialized at', DB_PATH);

  db.exec(`
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
  try { db.exec("ALTER TABLE requirements ADD COLUMN module TEXT DEFAULT '用户端'"); } catch {}
  try { db.exec("ALTER TABLE requirements ADD COLUMN workflow_handler TEXT DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE requirements ADD COLUMN workflow_history TEXT DEFAULT '[]'"); } catch {}

  db.exec(`
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

  try { db.exec("ALTER TABLE documents ADD COLUMN content TEXT DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE documents ADD COLUMN image_descriptions TEXT DEFAULT '[]'"); } catch {}

  db.exec(`
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

  const mcpCount = db.prepare('SELECT COUNT(*) FROM mcp_servers').raw().get()?.[0] || 0;
  if (mcpCount === 0) {
    db.prepare('INSERT INTO mcp_servers (name, type, command, args, env, enabled, config) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'TAPD', 'tapd', 'node', '["C:/Users/121212/Desktop/react/backend/src/mcp/tapd.js"]', '{}', 0, '{"workspaceId": "32690680"}'
    );
  }

  db.exec(`
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

  // 迁移：将旧状态"待评审"更新为"待评估"
  db.exec("UPDATE requirements SET status = '待评估' WHERE status = '待评审'");
  // 清理：删除 AI 自动创建的冗余知识文档
  db.exec("DELETE FROM documents WHERE category = '需求' AND file_path = ''");

  console.log('[DB] SQLite initialized');
  return db;
}

// better-sqlite3 写入直接到磁盘，无需手动存盘
function saveDB() { /* no-op */ }
function saveDbDirect() { /* no-op */ }

function getDb() {
  return db;
}

export { initDB, getDb, saveDB, saveDbDirect };
