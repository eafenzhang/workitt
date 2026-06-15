import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import https from 'https';
import http from 'http';
import { getDb, saveDbDirect } from '../db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../static/uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

const app = express.Router();

// 辅助函数：执行带参数查询，返回行数组（better-sqlite3 .raw() 模式返回数组的数组）
function queryAll(db, sql, params = []) {
  return db.prepare(sql).raw().all(...params);
}

// 辅助函数：执行单条查询（返回数组或 null）
function queryOne(db, sql, params = []) {
  return db.prepare(sql).raw().get(...params) || null;
}

// 辅助函数：格式化行数据为对象
function formatReqRow(r) {
  return {
    id: r[0], title: r[1], desc: r[2], category: r[3],
    module: r[4]||'用户端', priority: r[5], status: r[6], assignee: r[7],
    creator: r[8], dueDate: r[9], tags: JSON.parse(r[10]||'[]'),
    images: JSON.parse(r[11]||'[]'),
    aiSummary: r[12]||'', aiTags: JSON.parse(r[13]||'[]'),
    imageDescriptions: JSON.parse(r[14]||'[]'),
    workflowHandler: r[15]||'', workflowHistory: JSON.parse(r[16]||'[]'),
    createdAt: r[17], updatedAt: r[18],
  };
}

// 列表 - 支持多维度筛选 + 分页（使用参数化 SQL）
app.get('/', (req, res) => {
  const db = getDb();
  const { search, status, category, priority, assignee, dateFrom, dateTo, _page, _pageSize } = req.query;

  const BASE_SELECT = 'SELECT id, title, description, category, module, priority, status, assignee, creator, due_date, tags, images, ai_summary, ai_tags, image_descriptions, workflow_handler, workflow_history, created_at, updated_at FROM requirements';

  // 构建参数化 WHERE 子句
  const whereClauses = [];
  const params = [];

  if (search) {
    const s = '%' + String(search).toLowerCase() + '%';
    whereClauses.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)');
    params.push(s, s);
  }
  if (status && status !== '全部') {
    whereClauses.push('status = ?');
    params.push(status);
  }
  if (category && category !== '全部') {
    whereClauses.push('category = ?');
    params.push(category);
  }
  if (priority && priority !== '全部') {
    whereClauses.push('priority = ?');
    params.push(priority);
  }
  if (assignee && assignee !== '全部') {
    whereClauses.push('assignee = ?');
    params.push(assignee);
  }
  if (dateFrom) {
    whereClauses.push('created_at >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClauses.push('created_at <= ?');
    params.push(dateTo);
  }

  const whereSQL = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';
  const page = parseInt(_page) || 1;
  const ps = parseInt(_pageSize) || 10;
  const offset = (page - 1) * ps;

  // Count total matching rows
  const total = db.prepare('SELECT COUNT(*) FROM requirements' + whereSQL).raw().get(...params)?.[0] || 0;

  // Fetch page with LIMIT/OFFSET
  const pagedParams = [...params, ps, offset];
  const results = queryAll(db, BASE_SELECT + whereSQL + ' ORDER BY created_at DESC LIMIT ? OFFSET ?', pagedParams);

  // Compute unfiltered status counts for the status bar (always from ALL records)
  const allCounts = db.prepare('SELECT status, COUNT(*) FROM requirements GROUP BY status').raw().all();
  const counts = { '待评估': 0, '设计中': 0, '实现中': 0, '测试中': 0, '已完成': 0 };
  for (const [s, c] of allCounts) {
    if (counts[s] !== undefined) counts[s] = c;
  }

  // Compute module counts for the sidebar (always from ALL records)
  const moduleCountsRaw = db.prepare('SELECT module, COUNT(*) FROM requirements GROUP BY module').raw().all();
  const moduleCounts = {};
  for (const [m, c] of moduleCountsRaw) {
    moduleCounts[m || '用户端'] = c;
  }

  res.json({
    items: results.map(formatReqRow),
    total,
    counts,
    moduleCounts,
    page,
    pageSize: ps,
  });
});

// 详情
app.get('/:id', (req, res) => {
  const db = getDb();
  const row = queryOne(db, 'SELECT id, title, description, category, module, priority, status, assignee, creator, due_date, tags, images, ai_summary, ai_tags, image_descriptions, workflow_handler, workflow_history, created_at, updated_at FROM requirements WHERE id = ?', [parseInt(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(formatReqRow(row));
});

// 新建
app.post('/', (req, res) => {
  const db = getDb();
  const { title, desc = '', category = '产品', module = '用户端', priority = '中', assignee = '', creator = '', dueDate = '', tags = [], images = [] } = req.body;
  const stmt = db.prepare(`INSERT INTO requirements (title, description, category, module, priority, status, assignee, creator, due_date, tags, images)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  stmt.run(title, desc||'', category, module, priority, '待评估', assignee, creator, dueDate, JSON.stringify(tags), JSON.stringify(images));
  const id = db.prepare('SELECT last_insert_rowid()').raw().get()?.[0] ?? 0;

  // 保存到文件
  saveDbDirect();

  // 异步触发 AI 分析（不阻塞响应）
  if (id > 0 && desc) {
    setTimeout(() => {
      const req = http.request({ hostname: 'localhost', port: 3001, path: `/api/requirements/${id}/analyze`, method: 'POST' }, (res) => {});
      req.on('error', (e) => { console.error('[AI] 自动触发失败:', e.message); });
      req.end();
    }, 100);
  }

  res.json({ success: true, id });
});

// 更新
app.put('/:id', (req, res) => {
  const db = getDb();
  const { title, desc, category, module, priority, status, assignee, creator, dueDate, tags, images, workflow_handler } = req.body;
  const id = parseInt(req.params.id);

  // 如果状态变更，记录流转历史
  const oldRow = queryOne(db, 'SELECT status, workflow_history FROM requirements WHERE id = ?', [id]);
  let workflowHistory = [];
  try { workflowHistory = JSON.parse(oldRow?.[1] || '[]'); } catch {}
  if (oldRow && oldRow[0] !== status) {
    workflowHistory.push({
      from: oldRow[0],
      to: status,
      handler: workflow_handler || '',
      time: new Date().toLocaleString('zh-CN'),
    });
  }

  const stmt = db.prepare(`UPDATE requirements SET
    title = ?, description = ?, category = ?, module = ?, priority = ?, status = ?,
    assignee = ?, creator = ?, due_date = ?, tags = ?, images = ?,
    workflow_handler = ?, workflow_history = ?,
    updated_at = datetime('now', 'localtime')
    WHERE id = ?`);
  db.prepare(`UPDATE requirements SET
    title = ?, description = ?, category = ?, module = ?, priority = ?, status = ?,
    assignee = ?, creator = ?, due_date = ?, tags = ?, images = ?,
    workflow_handler = ?, workflow_history = ?,
    updated_at = datetime('now', 'localtime')
    WHERE id = ?`).run(
    title||'', desc||'', category||'', module||'用户端', priority||'', status||'',
    assignee||'', creator||'', dueDate||'', JSON.stringify(tags||[]), JSON.stringify(images||[]),
    workflow_handler||'', JSON.stringify(workflowHistory), id);
  res.json({ success: true });
});

// 删除
app.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM requirements WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

// AI 分析
app.post('/:id/analyze', async (req, res) => {
  const db = getDb();
  const row = queryOne(db, 'SELECT id, title, description, tags, images FROM requirements WHERE id = ?', [parseInt(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const [id, title, description, tags, images] = [row[0], row[1], row[2]||'', JSON.parse(row[3]||'[]'), JSON.parse(row[4]||'[]')];

  // 从本地数据库读取模型（优先启用+默认的，其次仅启用的，最后任意）
  let modelName = '', provider = '', baseUrl = '', apiKey = '', modelId = '';
  const allRows = db.prepare('SELECT name, provider, base_url, api_key, model_id, enabled, is_default FROM models').raw().all();
  if (allRows.length === 0) {
    return res.status(400).json({ error: '无可用模型，请先在模型配置中添加模型' });
  }
  // 排序：已启用+默认 > 已启用 > 未启用
  const sorted = [...allRows].sort((a, b) => {
    const aEnabled = a[5], bEnabled = b[5];
    const aDefault = a[6], bDefault = b[6];
    const aScore = (aEnabled ? 2 : 0) + (aDefault ? 1 : 0);
    const bScore = (bEnabled ? 2 : 0) + (bDefault ? 1 : 0);
    return bScore - aScore;
  });
  const [mName, mProvider, mBaseUrl, mApiKey, mModelId] = sorted[0];
  modelName = mName; provider = mProvider; baseUrl = mBaseUrl; apiKey = mApiKey; modelId = mModelId;

  let aiSummary = '';
  let aiTags = [];
  let imageDescriptions = [];

  // 根据 provider 确定 API 端点（baseUrl 已经是完整路径，直接使用）
  const getEndpoint = (provider, baseUrl) => {
    const base = baseUrl.replace(/\/$/, '');
    // Anthropic 兼容端点
    const endpoints = {
      'deepseek': '/chat/completions',
      'openai': '/chat/completions',
      'anthropic': '/messages',
      'anthropic-sub': '/messages',
      'google': '/v1beta/openai/chat/completions',
      'moonshot': '/chat/completions',
      'zhipu': '/chat/completions',
      'dashscope': '/services/aigc/text-generation/generation',
      'volcengine': '/chat/completions',
      'tencent': '/chat/completions',
      'qianfan': '/chat/completions',
      'xfyun': '/chat',
      'minimax': '/v1/messages',
      'minimax-api': '/v1/messages',
    };
    const suffix = endpoints[provider] || '/chat/completions';
    // 如果 base 已经包含完整路径（包含 /anthropic 或 /v1 等），直接追加 suffix
    return base + suffix;
  };

  const fullUrl = getEndpoint(provider, baseUrl);

  // 使用原生 https/http 模块发请求，避免 Node.js fetch 的兼容性问题
  const doRequest = (urlStr, bodyObj) => {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const mod = isHttps ? https : http;
      const body = JSON.stringify(bodyObj);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(provider === 'minimax' ? { 'X-Api-Key': apiKey } : { 'Authorization': `Bearer ${apiKey}` }),
        },
      };
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, text: data }));
      });
      req.on('error', e => reject(e));
      req.write(body);
      req.end();
    });
  };

  // 1. 摘要提炼
  if (description) {
    try {
      const sumRes = await doRequest(fullUrl, {
        model: modelId,
        messages: [
          { role: 'system', content: '你是需求分析助手，直接输出简短中文总结（4-20字），不要加引号前缀解释。' },
          { role: 'user', content: `标题：${title}\n描述：${description}` }
        ],
        max_tokens: 150,
        temperature: 0.1,
      });
            let sumData;
      try { sumData = JSON.parse(sumRes.text); } catch { sumData = { error: { message: sumRes.text } }; }
      if (sumData.error) {
        console.error('[AI] 摘要失败', sumData.error.message || sumData.error);
      } else {
        const rawContent = sumData.choices?.[0]?.message?.content?.trim() || '';
        const contentArray = sumData.content || [];
        const textItem = contentArray.find(c => c.type === 'text');
        const reasoningItem = contentArray.find(c => c.type === 'thinking');
        const miniMaxText = textItem?.text?.trim() || '';
        const miniMaxReasoning = reasoningItem?.thinking || '';
        const reasoning = sumData.choices?.[0]?.message?.reasoning_content || miniMaxReasoning;
        let summary = '';

        if (rawContent && rawContent.length >= 4 && !rawContent.includes('总结需求')) {
          summary = rawContent.replace(/^[""']|[""']$/g, '').substring(0, 40);
        } else if (miniMaxText && miniMaxText.length >= 4) {
          summary = miniMaxText.replace(/^[""']|[""']$/g, '').substring(0, 40);
        } else if (reasoning) {
          const segs = reasoning.split(/[。？?！!；;\n]/);
          const ChineseSegs = segs.map(s => s.trim()).filter(s => /[一-龥]{4,40}/.test(s));
          if (ChineseSegs.length > 0) {
            const last = ChineseSegs[ChineseSegs.length - 1];
            const m = last.match(/[一-龥]{4,40}/);
            if (m) summary = m[0];
          }
          if (!summary) summary = reasoning.substring(0, 40).replace(/[^一-龥a-zA-Z0-9]/g, '');
        }
        aiSummary = summary;
      }
    } catch (e) { console.error('[AI] 摘要失败', e.message); }
  }

  // 2. 自动打标
  try {
    const tagRes = await doRequest(fullUrl, {
      model: modelId,
      messages: [{ role: 'user', content: `根据标题和描述提取标签，已有标签：${JSON.stringify(tags)}。输出JSON：{"keep":[],"new":["标签1","标签2"]}` }],
      max_tokens: 150,
      temperature: 0.3,
    });
    let tagData;
    try { tagData = JSON.parse(tagRes.text); } catch { tagData = { error: { message: tagRes.text } }; }
    if (tagData.error) {
      console.error('[AI] 打标失败', tagData.error.message || tagData.error);
    } else {
      const raw = (tagData.choices?.[0]?.message?.content || tagData.choices?.[0]?.message?.reasoning_content || '').trim();
      try {
        const parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
        const existingSet = new Set(tags.map(t => t.toLowerCase()));
        aiTags = [...(parsed.keep || []).filter(t => !existingSet.has(t.toLowerCase())), ...(parsed.new || [])];
      } catch { aiTags = []; }
    }
  } catch (e) { console.error('[AI] 打标失败', e.message); }

  // 3. 图片识别（仅 URL 图片）
  for (const imgUrl of images) {
    if (imgUrl.startsWith('http') || imgUrl.startsWith('/')) {
      try {
        const imgRes = await doRequest(`${baseUrl}/${modelId}`, {
          messages: [{ role: 'user', content: [{ type: 'text', text: `描述这张图片的内容，20字以内：` }, { type: 'image_url', image_url: { url: imgUrl } }] }],
          max_tokens: 80,
        });
        const imgData = JSON.parse(imgRes.text);
        const desc = imgData.choices?.[0]?.message?.content?.trim() || '';
        if (desc) imageDescriptions.push(desc);
      } catch (e) { console.error('[AI] 图片识别失败', imgUrl, e.message); }
    }
  }

  // 保存结果
  db.prepare(`UPDATE requirements SET ai_summary = ?, ai_tags = ?, image_descriptions = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(
    aiSummary, JSON.stringify(aiTags), JSON.stringify(imageDescriptions), id);

  // AI 分析完成后，自动在知识库创建文档
  if (aiSummary && id) {
    try {
      const docTitle = aiSummary.length > 50 ? aiSummary.substring(0, 50) : aiSummary;
      const docContent = `## ${title}\n\n${description}\n\n---\n**AI 摘要**: ${aiSummary}\n**模块**: ${row[3] || '用户端'}\n**优先级**: ${row[5] || '中'}\n**状态**: ${row[6] || '待评估'}`;
      db.prepare('INSERT INTO documents (title, category, type, tags, content) VALUES (?, ?, ?, ?, ?)').run(
        docTitle, '需求', 'MD', JSON.stringify(aiTags), docContent);
      console.log('[AI] Auto-created document for requirement:', id);
    } catch (e) {
      console.error('[AI] Auto-create document failed:', e.message);
    }
  }

  res.json({ aiSummary, aiTags, imageDescriptions });
});

// 上传图片
app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

export default app;