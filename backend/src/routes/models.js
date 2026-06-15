import express from 'express';
import { getDb, saveDbDirect } from '../db/index.js';

const app = express.Router();

// 国内主流大模型供应商配置
export const PROVIDERS = {
  deepseek: { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', endpoint: '/chat/completions', models: [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }, { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }], authType: 'bearer' },
  minimax: { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimaxi.com/anthropic', endpoint: '/v1/messages', models: [{ id: 'MiniMax-M3', name: 'MiniMax M3' }, { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' }], authType: 'bearer' },
  mimo: { id: 'mimo', name: 'Mimo AI', baseUrl: 'https://api.mimoai.com', endpoint: '/chat/completions', models: [{ id: 'mimo-v2.5-pro', name: 'Mimo V2.5 Pro' }, { id: 'mimo-v2.5-flash', name: 'Mimo V2.5 Flash' }], authType: 'bearer' },
  zhipu: { id: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', endpoint: '/chat/completions', models: [{ id: 'glm-5', name: 'GLM-5' }, { id: 'glm-5-flash', name: 'GLM-5 Flash' }], authType: 'bearer' },
  moonshot: { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', endpoint: '/chat/completions', models: [{ id: 'kimi-k2.6', name: 'Kimi K2.6' }, { id: 'kimi-k2.5', name: 'Kimi K2.5' }, { id: 'moonshot-v1-8k', name: 'Moonshot V1 8K' }], authType: 'bearer' },
  dashscope: { id: 'dashscope', name: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', endpoint: '/chat/completions', models: [{ id: 'qwen3.7-max', name: 'Qwen3.7 Max' }, { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus' }], authType: 'bearer' },
  volcengine: { id: 'volcengine', name: '火山引擎', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', endpoint: '/chat/completions', models: [{ id: 'doubao-seed-2.0-32k', name: '豆包 Seed 2.0 Pro' }, { id: 'doubao-seed-2.0-lite', name: '豆包 Seed 2.0 Lite' }], authType: 'bearer' },
  tencent: { id: 'tencent', name: '腾讯混元', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', endpoint: '/chat/completions', models: [{ id: 'hunyuan-turbos-latest', name: '混元 TurboS' }, { id: 'hunyuan-lite', name: '混元 Lite' }], authType: 'bearer' },
  qianfan: { id: 'qianfan', name: '百度千帆', baseUrl: 'https://qianfan.baidubce.com/v2', endpoint: '/chat/completions', models: [{ id: 'ernie-5.1', name: 'ERNIE 5.1' }, { id: 'ernie-5.0', name: 'ERNIE 5.0' }], authType: 'bearer' },
  siliconflow: { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', endpoint: '/chat/completions', models: [{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' }, { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen3 235B' }], authType: 'bearer' },
};

// 列表
app.get('/', (req, res) => {
  const db = getDb();
  const rows = db.exec("SELECT id, name, provider, base_url, api_key, model_id, enabled, is_default, created_at FROM models ORDER BY is_default DESC, id DESC")[0]?.values || [];
  res.json(rows.map(r => ({
    id: r[0],
    name: r[1],
    provider: r[2],
    baseUrl: r[3],
    apiKey: r[4] ? '******' + r[4].slice(-4) : '',
    hasApiKey: !!r[4],
    modelId: r[5],
    enabled: !!r[6],
    isDefault: !!r[7],
    createdAt: r[8],
  })));
});

// 详情
app.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.exec(`SELECT id, name, provider, base_url, api_key, model_id, enabled, is_default, created_at FROM models WHERE id = ${req.params.id}`)[0]?.values[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: row[0], name: row[1], provider: row[2], baseUrl: row[3],
    apiKey: row[4] ? '******' + row[4].slice(-4) : '',
    hasApiKey: !!row[4], modelId: row[5], enabled: !!row[6],
    isDefault: !!row[7], createdAt: row[8],
  });
});

// 新增
app.post('/', (req, res) => {
  const { name, provider, baseUrl, apiKey, modelId, modelName } = req.body;
  if (!provider || !modelId) return res.status(400).json({ error: '缺少必要参数' });

  const db = getDb();
  const displayName = name || (PROVIDERS[provider]?.name + ' - ' + (PROVIDERS[provider]?.models.find(m => m.id === modelId)?.name || modelId));
  const resolvedBaseUrl = baseUrl || PROVIDERS[provider]?.baseUrl || '';

  const stmt = db.prepare(`INSERT INTO models (name, provider, base_url, api_key, model_id, enabled, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  stmt.run([displayName, provider, resolvedBaseUrl, apiKey || '', modelId, 0, 0]);
  stmt.free();
  const idArr = db.exec("SELECT last_insert_rowid()");
  const id = idArr[0]?.values[0][0] ?? 0;
  saveDbDirect();

  res.json({ success: true, id });
});

// 更新
app.put('/:id', (req, res) => {
  const db = getDb();
  const { name, apiKey, modelId, is_default } = req.body;

  if (is_default) {
    db.raw().run(`UPDATE models SET is_default = 0`);
  }

  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (apiKey !== undefined) { fields.push('api_key = ?'); values.push(apiKey); }
  if (modelId !== undefined) { fields.push('model_id = ?'); values.push(modelId); }
  if (is_default !== undefined) { fields.push('is_default = ?'); values.push(is_default ? 1 : 0); }

  if (fields.length === 0) return res.status(400).json({ error: '没有要更新的字段' });

  values.push(req.params.id);
  db.raw().run(`UPDATE models SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDbDirect();

  res.json({ success: true });
});

// 删除
app.delete('/:id', (req, res) => {
  getDb().raw().run(`DELETE FROM models WHERE id = ${req.params.id}`);
  saveDbDirect();
  res.json({ success: true });
});

// 获取供应商列表（不含敏感信息）
app.get('/providers/list', (req, res) => {
  res.json(Object.values(PROVIDERS).map(p => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    endpoint: p.endpoint,
    models: p.models,
    authType: p.authType,
  })));
});

export default app;