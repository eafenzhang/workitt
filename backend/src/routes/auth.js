import express from 'express';
import { getDb } from '../db/index.js';
import crypto from 'crypto';

const router = express.Router();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper: parameterized query returning rows as arrays
function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql).raw();
  const row = stmt.get(...params);
  return row || null;
}

router.post('/register', (req, res) => {
  const { phone, password, nickname, avatar, role } = req.body;

  if (!phone || !password || !nickname || !role) {
    return res.status(400).json({ error: '缺少必填字段' });
  }

  const validRoles = ['技术', '产品', '测试', '研发', '市场'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: '无效的角色' });
  }

  const db = getDb();

  const existing = queryOne(db, 'SELECT id FROM users WHERE phone = ?', [phone]);
  if (existing) {
    return res.status(409).json({ error: '该手机号已注册' });
  }

  db.prepare('INSERT INTO users (phone, password, nickname, avatar, role) VALUES (?, ?, ?, ?, ?)')
    .run(phone, hashPassword(password), nickname, avatar || '', role);

  res.json({ success: true });
});

router.post('/login', (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: '请输入手机号和密码' });
  }

  const db = getDb();
  const row = queryOne(db, 'SELECT id, phone, nickname, avatar, role FROM users WHERE phone = ? AND password = ?',
    [phone, hashPassword(password)]);

  if (!row) {
    return res.status(401).json({ error: '手机号或密码错误' });
  }

  res.json({
    success: true,
    user: { id: row[0], phone: row[1], nickname: row[2], avatar: row[3], role: row[4] },
  });
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权' });
  }

  const token = authHeader.slice(7);
  const db = getDb();
  const row = queryOne(db, 'SELECT id, phone, nickname, avatar, role FROM users WHERE id = ?', [parseInt(token)]);

  if (!row) {
    return res.status(401).json({ error: '用户不存在' });
  }

  res.json({
    user: { id: row[0], phone: row[1], nickname: row[2], avatar: row[3], role: row[4] },
  });
});

export default router;
