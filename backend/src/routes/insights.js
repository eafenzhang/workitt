import express from 'express';
import { getDb } from '../db/index.js';

const app = express.Router();

// KPI 卡片（基于真实数据）
app.get('/kpis', (req, res) => {
  const db = getDb();
  const reqCount = db.exec("SELECT COUNT(*) FROM requirements")[0]?.values[0][0] || 0;
  const aiCount = db.exec("SELECT COUNT(*) FROM requirements WHERE ai_summary != ''")[0]?.values[0][0] || 0;
  const docCount = db.exec("SELECT COUNT(*) FROM documents")[0]?.values[0][0] || 0;
  const featuredCount = db.exec("SELECT COUNT(*) FROM documents WHERE featured = 1")[0]?.values[0][0] || 0;

  res.json([
    { label: '需求总数', value: String(reqCount), change: '+0', up: true },
    { label: 'AI已分析', value: String(aiCount), change: '+0', up: true },
    { label: '知识条目', value: String(docCount), change: '+0', up: true },
    { label: '精选文档', value: String(featuredCount), change: '+0', up: true },
  ]);
});

// 图表数据
app.get('/charts', (req, res) => {
  const db = getDb();
  // 按状态统计需求
  const byStatus = db.exec("SELECT status, COUNT(*) FROM requirements GROUP BY status")[0]?.values || [];
  // 按类型统计文档
  const byType = db.exec("SELECT type, COUNT(*) FROM documents GROUP BY type")[0]?.values || [];
  // 按分类统计需求
  const byCategory = db.exec("SELECT category, COUNT(*) FROM requirements GROUP BY category")[0]?.values || [];

  const lineData = byStatus.map(r => ({ name: r[0], value: r[1] }));
  const barData = byCategory.map(r => ({ name: r[0], value: r[1] }));
  const pieData = byType.map(r => ({ name: r[0], value: r[1] }));

  res.json({
    lineData,
    radarData: [
      { subject: '需求完整性', A: 85, fullMark: 100 },
      { subject: '知识覆盖度', A: 72, fullMark: 100 },
      { subject: '响应准确率', A: 91, fullMark: 100 },
      { subject: '上下文理解', A: 78, fullMark: 100 },
      { subject: '推理能力', A: 68, fullMark: 100 },
      { subject: '知识更新率', A: 83, fullMark: 100 },
    ],
    barData,
    pieData,
  });
});

// AI 洞察列表
app.get('/ai-insights', (req, res) => {
  const db = getDb();
  const reqCount = db.exec("SELECT COUNT(*) FROM requirements")[0]?.values[0][0] || 0;
  const docCount = db.exec("SELECT COUNT(*) FROM documents")[0]?.values[0][0] || 0;
  const aiCount = db.exec("SELECT COUNT(*) FROM requirements WHERE ai_summary != ''")[0]?.values[0][0] || 0;

  const insights = [];

  if (aiCount === 0 && reqCount > 0) {
    insights.push({
      type: 'warning',
      icon: 'AlertTriangleIcon',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.1)',
      title: '大部分需求未完成AI分析',
      desc: `共有 ${reqCount} 条需求，但仅 ${aiCount} 条完成AI分析。建议对历史需求批量触发AI分析。`,
      score: 75,
    });
  }

  if (docCount > 0) {
    insights.push({
      type: 'opportunity',
      icon: 'TrendingUpIcon',
      color: '#10b981',
      bg: 'rgba(16,185,129,0.1)',
      title: '知识库已积累基础内容',
      desc: `当前共 ${docCount} 篇文档，覆盖架构设计、API文档、研究报告等多个分类。`,
      score: 80,
    });
  }

  if (reqCount > 10 && aiCount > 5) {
    insights.push({
      type: 'insight',
      icon: 'BrainCircuitIcon',
      color: '#6366f1',
      bg: 'rgba(99,102,241,0.1)',
      title: 'AI辅助需求分析已启用',
      desc: `已有 ${aiCount} 条需求完成AI摘要提炼，有效提升需求理解效率。`,
      score: 90,
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: 'insight',
      icon: 'ZapIcon',
      color: '#8b5cf6',
      bg: 'rgba(139,92,246,0.1)',
      title: '开始使用 Workit',
      desc: '创建需求后AI将自动分析并生成摘要，知识库文档将帮助建立团队知识体系。',
      score: 60,
    });
  }

  res.json(insights);
});

export default app;