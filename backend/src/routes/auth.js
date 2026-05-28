import express from 'express';
import { getDb } from '../db/index.js';
import crypto from 'crypto';

const router = express.Router();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

router.post('/register', (req, res) => {
  const { phone, password, nickname, avatar, role } = req.body;

  if (!phone || !password || !nickname || !role) {
    return res.status(400).json({ error: '缺少必填字段' });
  }

  // 允许的角色
  const validRoles = ['技术', '产品', '测试', '研发', '市场'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: '无效的角色' });
  }

  const db = getDb();

  const existing = db.exec(`SELECT id FROM users WHERE phone = '${phone}'`);
  if (existing[0]?.values?.length > 0) {
    return res.status(409).json({ error: '该手机号已注册' });
  }

  db.run(`INSERT INTO users (phone, password, nickname, avatar, role) VALUES (?, ?, ?, ?, ?)`,
    [phone, hashPassword(password), nickname, avatar || '', role]);

  res.json({ success: true });
});

router.post('/login', (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: '请输入手机号和密码' });
  }

  const db = getDb();
  const row = db.exec(`SELECT id, phone, nickname, avatar, role FROM users WHERE phone = '${phone}' AND password = '${hashPassword(password)}'`)[0]?.values[0];

  if (!row) {
    return res.status(401).json({ error: '手机号或密码错误' });
  }

  res.json({
    success: true,
    user: {
      id: row[0],
      phone: row[1],
      nickname: row[2],
      avatar: row[3],
      role: row[4],
    },
  });
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权' });
  }

  const token = authHeader.slice(7);
  const db = getDb();
  const row = db.exec(`SELECT id, phone, nickname, avatar, role FROM users WHERE id = ${token}`)[0]?.values[0];

  if (!row) {
    return res.status(401).json({ error: '用户不存在' });
  }

  res.json({
    user: {
      id: row[0],
      phone: row[1],
      nickname: row[2],
      avatar: row[3],
      role: row[4],
    },
  });
});

export default router;