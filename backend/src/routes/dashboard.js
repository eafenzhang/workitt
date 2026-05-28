import express from 'express';
import { getDb } from '../db/index.js';

const app = express.Router();

// 统计卡片
app.get('/stats', (req, res) => {
  const db = getDb();
  const reqCount = db.exec("SELECT COUNT(*) FROM requirements")[0]?.values[0][0] || 0;
  const docCount = db.exec("SELECT COUNT(*) FROM documents")[0]?.values[0][0] || 0;
  const aiAnalyzedCount = db.exec("SELECT COUNT(*) FROM requirements WHERE ai_summary != ''")[0]?.values[0][0] || 0;
  const inProgressCount = db.exec("SELECT COUNT(*) FROM requirements WHERE status NOT IN ('已完成','已关闭')")[0]?.values[0][0] || 0;

  res.json([
    { label: '需求总数', value: String(reqCount), change: '+0', icon: 'SparklesIcon', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
    { label: '进行中', value: String(inProgressCount), change: '+0', icon: 'ActivityIcon', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    { label: '知识条目', value: String(docCount), change: '+0', icon: 'DatabaseIcon', color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
    { label: 'AI已分析', value: String(aiAnalyzedCount), change: '+0', icon: 'LightbulbIcon', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  ]);
});

// 最近动态（从真实数据）
app.get('/activities', (req, res) => {
  const db = getDb();
  const rows = db.exec(`
    SELECT 'req' as type, id, title, updated_at as time FROM requirements ORDER BY updated_at DESC LIMIT 5
    UNION ALL
    SELECT 'doc' as type, id, title, updated_at as time FROM documents ORDER BY updated_at DESC LIMIT 5
    ORDER BY time DESC LIMIT 5
  `)[0]?.values || [];

  const map = { req: { icon: 'SparklesIcon', color: '#8b5cf6', prefix: '需求' }, doc: { icon: 'DatabaseIcon', color: '#06b6d4', prefix: '文档' } };
  const acts = rows.map(r => {
    const cfg = map[r[0]] || map.req;
    return { icon: cfg.icon, color: cfg.color, text: `「${r[2]}」已更新`, time: r[3] };
  });
  res.json(acts.length ? acts : [
    { icon: 'SparklesIcon', color: '#8b5cf6', text: '暂无动态', time: '' },
  ]);
});

// 图表数据
app.get('/charts', (req, res) => {
  const db = getDb();
  // 按月统计需求和文档数量
  const monthlyReq = db.exec(`
    SELECT strftime('%m', created_at) as month, COUNT(*) as cnt
    FROM requirements WHERE created_at >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `)[0]?.values || [];
  const monthlyDoc = db.exec(`
    SELECT strftime('%m', created_at) as month, COUNT(*) as cnt
    FROM documents WHERE created_at >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `)[0]?.values || [];

  // 按状态统计
  const byStatus = db.exec(`
    SELECT status, COUNT(*) as cnt FROM requirements GROUP BY status
  `)[0]?.values || [];

  // 按模块统计
  const byModule = db.exec(`
    SELECT module, COUNT(*) as cnt FROM requirements GROUP BY module
  `)[0]?.values || [];

  // 填充近7个月
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const areaData = [];
  for (let i = 6; i >= 0; i--) {
    const m = ((currentMonth - i - 1 + 12) % 12) + 1;
    const label = `${m}月`;
    const reqFound = monthlyReq.find(r => String(r[0]) === String(m).padStart(2, '0'));
    const docFound = monthlyDoc.find(r => String(r[0]) === String(m).padStart(2, '0'));
    areaData.push({
      name: label,
      需求: reqFound ? reqFound[1] : 0,
      知识: docFound ? docFound[1] : 0,
      洞察: 0,
    });
  }

  const barData = [
    ...byStatus.map(r => ({ name: r[0], value: r[1] })),
    ...byModule.map(r => ({ name: r[0], value: r[1] })),
  ];

  res.json({ areaData, barData });
});

export default app;