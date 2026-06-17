// ipc.js — IPC handlers: db-query, db-upload, CRUD operations
const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  ALLOWED_TABLES,
  ALLOWED_METHODS,
  log,
  query,
  run,
  formatReq,
  formatReqList,
  formatDoc,
  callAI,
  chatWithAI,
  getDefaultModel,
  encryptApiKey,
  decryptApiKey,
  formatSkill,
  formatPlugin,
  formatCliTool,
  getMemories,
  upsertMemory,
  deleteMemory,
  clearMemories,
  getMemorySummary,
  listWorkflows,
  getWorkflow,
  saveWorkflow,
  deleteWorkflow,
  listWorkflowExecutions,
  submitFeedback,
  getFeedbackStats,
  getUserProfile,
  saveUserProfile,
} = require('./database.cjs');
const { executeWorkflow } = require('./workflow-engine.cjs');
const { getMainWindow, getQCWindow } = require('./window.cjs');
const { McpClientManager } = require('./mcp-manager.cjs');

function setupIPC(mainWindow, db) {
  let insightsCache = null;

  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.handle('window-minimize', () => getMainWindow()?.minimize());
  ipcMain.handle('window-maximize', () => {
    const w = getMainWindow();
    if (w?.isMaximized()) w.unmaximize(); else w?.maximize();
  });
  ipcMain.handle('window-close', () => getMainWindow()?.close());
  ipcMain.handle('window-is-maximized', () => getMainWindow()?.isMaximized() || false);
  ipcMain.handle('window-set-fullscreen', (_, flag) => getMainWindow()?.setFullScreen(!!flag));
  ipcMain.handle('window-is-fullscreen', () => getMainWindow()?.isFullScreen() || false);

  ipcMain.handle('db-query', async (event, method, table, args) => {
    try {
      // P1-09: Method whitelist validation
      if (!ALLOWED_METHODS.includes(method)) return { error: 'Method not allowed: ' + method };

      // P0-04: QC window source validation — only allow GET on requirements
      const qcWin = getQCWindow();
      if (qcWin && !qcWin.isDestroyed() && event.sender === qcWin.webContents) {
        if (method !== 'GET' || table !== 'requirements') {
          log('db-query BLOCKED from QC window: method=' + method + ' table=' + table);
          return { error: 'Access denied from QC window' };
        }
      }

      const { data, id } = args || {};
      const result = await handleDbQuery(method, table, data, id);
      const rtype = Array.isArray(result) ? 'array[' + result.length + ']' : (typeof result) + '/' + Object.keys(result||{}).slice(0,3).join(',');
      const extra = (result && result.id !== undefined) ? ' id=' + result.id : '';
      log('db-query: ' + method + ' ' + table + ' \u2192 ' + rtype + extra);
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

  // Chat with AI — uses conversation history + user agent config + tools/skills/plugins
  ipcMain.handle('chat:send', async (_, { providerId, modelId, messages, systemPrompt, toolsEnabled, responseFormat }) => {
    try {
      return await chatWithAI(db, { providerId, modelId, messages, systemPrompt, toolsEnabled, responseFormat });
    } catch (e) { return { error: e.message }; }
  });

  // ── CLI Tools: Check if command exists on PATH ──
  ipcMain.handle('cli:check', async (_, command) => {
    try {
      const { execSync } = require('child_process');
      const result = execSync(`where "${command}" 2>nul || which "${command}" 2>/dev/null || echo NOT_FOUND`, { encoding: 'utf8', timeout: 5000 });
      const found = !result.includes('NOT_FOUND') && result.trim().length > 0;
      return { exists: found, path: found ? result.trim().split('\n')[0] : null };
    } catch { return { exists: false, path: null }; }
  });

  // ── CLI Tools: Install by running install command ──
  ipcMain.handle('cli:install', async (_, { command }) => {
    try {
      const { execSync } = require('child_process');
      const output = execSync(command, { encoding: 'utf8', timeout: 120000, shell: 'powershell.exe', maxBuffer: 10 * 1024 * 1024 });
      return { success: true, output: output.trim() };
    } catch (e) {
      return { success: false, error: e.stderr || e.message || '安装失败' };
    }
  });

  // ── Agent Memory IPC handlers ──
  ipcMain.handle('memory:getAll', async () => {
    try { return getMemories(db); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('memory:upsert', async (_, { key, value, source }) => {
    try { return upsertMemory(db, { key, value, source }); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('memory:delete', async (_, key) => {
    try { return deleteMemory(db, key); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('memory:clear', async () => {
    try { return clearMemories(db); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('memory:summary', async () => {
    try { return getMemorySummary(db); } catch (e) { return { error: e.message }; }
  });

  // ── Model balance check ──
  ipcMain.handle('model:check-balance', async (_, modelId) => {
    try {
      const rows = query(db, 'SELECT provider, base_url, api_key, model_id FROM models WHERE id = ?', [modelId]);
      if (!rows.length) return { error: '模型未找到' };
      const [provider, baseUrl, encKey, mId] = [rows[0][0], rows[0][1], rows[0][2], rows[0][3]];
      const apiKey = decryptApiKey(encKey);
      if (!apiKey) return { error: '未配置API Key' };

      // Known provider balance endpoints
      /** @type {Record<string,string>} */
      const BALANCE_URLS = {
        'deepseek': 'https://api.deepseek.com/user/balance',
        'openai': 'https://api.openai.com/v1/dashboard/billing/subscription',
        'moonshot': 'https://api.moonshot.cn/v1/users/me/balance',
      };

      const balanceUrl = BALANCE_URLS[provider];
      if (!balanceUrl) return { balance: '该平台暂不支持查询' };

      const res = await fetch(balanceUrl, {
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { balance: '查询失败 (HTTP ' + res.status + ')' };
      const data = await res.json();

      // Parse balance for known providers
      var balance = '';
      if (provider === 'deepseek') {
        var infos = (data && data.balance_infos) ? data.balance_infos : [];
        var b = infos.find(function(i) { return i.currency === 'CNY'; });
        balance = b ? b.total_balance + ' ' + b.currency : JSON.stringify(data).substring(0, 100);
      } else if (provider === 'openai') {
        balance = data.hard_limit_usd ? '$' + data.hard_limit_usd : JSON.stringify(data).substring(0, 100);
      } else if (provider === 'moonshot') {
        balance = (data.data && data.data.total_balance) ? String(data.data.total_balance) : JSON.stringify(data).substring(0, 100);
      } else {
        balance = JSON.stringify(data).substring(0, 100);
      }

      // Save to DB
      run(db, "UPDATE models SET balance = ? WHERE id = ?", [balance, modelId]);
      return { balance };
    } catch (e) {
      return { error: e.message || '查询失败' };
    }
  });

  // ── Profile IPC handlers ──
  ipcMain.handle('profile:get', async () => {
    try { return getUserProfile(db) || {}; } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('profile:save', async (_, profile) => {
    try { return saveUserProfile(db, profile); } catch (e) { return { error: e.message }; }
  });

  // ── Feedback IPC handlers ──
  ipcMain.handle('feedback:submit', async (_, data) => {
    try { return submitFeedback(db, data); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('feedback:stats', async (_, opts) => {
    try { return getFeedbackStats(db, opts); } catch (e) { return { error: e.message }; }
  });

  // ── Workflow IPC handlers ──
  ipcMain.handle('workflow:list', async () => {
    try { return listWorkflows(db); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('workflow:get', async (_, id) => {
    try { return getWorkflow(db, id); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('workflow:save', async (_, wf) => {
    try { return saveWorkflow(db, wf); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('workflow:delete', async (_, id) => {
    try { return deleteWorkflow(db, id); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('workflow:execute', async (_, { workflowId, inputs }) => {
    try { return await executeWorkflow(db, workflowId, inputs); } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('workflow:executions', async (_, workflowId) => {
    try { return listWorkflowExecutions(db, workflowId); } catch (e) { return { error: e.message }; }
  });

  // P0-07: Test model connection — look up decrypted API key by modelId from DB
  ipcMain.handle('test-model-connection', async (_, modelId) => {
    try {
      const rows = query(db, 'SELECT base_url, api_key, model_id, endpoint FROM models WHERE id = ?', [modelId]);
      if (!rows.length) { log('Model test: model not found id=' + modelId); return false; }
      const baseUrl = rows[0][0];
      const apiKey = decryptApiKey(rows[0][1]);
      const modelIdFromDb = rows[0][2];
      const endpoint = rows[0][3];
      if (!apiKey) { log('Model test: no API key for id=' + modelId); return false; }

      const isAnthropic = (endpoint || '').includes('messages') || baseUrl.includes('anthropic');
      let url = baseUrl.replace(/\/+$/, '');
      if (endpoint) url += endpoint;
      else if (isAnthropic) url += '/v1/messages';
      else url += '/v1/chat/completions';

      log('Model test: ' + url);
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
        body: JSON.stringify({ model: modelIdFromDb, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      log('Model test response status=' + res.status + ' body=' + text.substring(0, 200));
      try {
        const data = JSON.parse(text);
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

  // ── CowAgent Backend Status IPC Handler ─────────────────────────
  const { getPythonManager } = require('./python-manager.cjs');

  ipcMain.handle('backend:status', async () => {
    try {
      const pyMgr = getPythonManager();
      return pyMgr.getStatus();
    } catch (e) { return { running: false, port: 9899, pid: null, error: e.message }; }
  });

  // ── CowAgent Backend Update ─────────────────────────────────────
  ipcMain.handle('cowagent:update', async () => {
    try {
      const pyMgr = getPythonManager();
      await pyMgr.update();
      return { success: true };
    } catch (e) {
      log('CowAgent update failed', e);
      return { success: false, error: e.message || '更新失败' };
    }
  });

  // ── MCP Runtime IPC Handlers ─────────────────────────────────────
  const mcpManager = McpClientManager.getInstance();

  // Get all tools from connected MCP servers
  ipcMain.handle('mcp:get-tools', async () => {
    try {
      return { tools: mcpManager.getTools() };
    } catch (e) { return { error: e.message }; }
  });

  // Get status snapshot for all MCP servers
  ipcMain.handle('mcp:get-status', async () => {
    try {
      return mcpManager.getStatusSnapshot();
    } catch (e) { return { error: e.message }; }
  });

  // Get tools for a specific MCP server (detail panel)
  ipcMain.handle('mcp:get-server-tools', async (_, serverId) => {
    try {
      return mcpManager.getServerTools(serverId);
    } catch (e) { return { error: e.message }; }
  });

  // Execute a tool call on a connected MCP server
  ipcMain.handle('mcp:execute-tool', async (_, serverId, toolName, args) => {
    try {
      return await mcpManager.executeToolCall(Number(serverId), toolName, args);
    } catch (e) { return { success: false, error: e.message }; }
  });

  // Connect to a specific MCP server by id
  ipcMain.handle('mcp:connect', async (_, serverId) => {
    try {
      const rows = query(db, 'SELECT * FROM mcp_servers WHERE id = ?', [Number(serverId)]);
      if (!rows.length) return { success: false, error: 'MCP server not found' };
      const row = rows[0];
      const config = {
        name: row[1],
        command: row[3],
        args: (() => { try { return JSON.parse(row[4] || '[]'); } catch { return []; } })(),
        env: (() => { try { return JSON.parse(row[5] || '{}'); } catch { return {}; } })(),
      };
      return await mcpManager.connect(Number(serverId), config);
    } catch (e) { return { success: false, error: e.message }; }
  });

  // Disconnect from a specific MCP server by id
  ipcMain.handle('mcp:disconnect', async (_, serverId) => {
    try {
      await mcpManager.disconnect(Number(serverId));
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  async function handleDbQuery(method, table, data, id) {
    table = String(table || '').split('?')[0];
    switch (table) {
      case 'requirements':
        return handleRequirements(method, data, id);
      case 'requirements/upload-file':
        return handleRequirementsUpload(data);
      case 'requirements/upload-image':
        return handleRequirementsUpload(data);
      case 'documents':
        return handleDocuments(method, data, id);
      case 'mcp':
      case 'mcp_servers':
        return handleMcp(method, data, id);
      case 'skills':
        return handleSkills(method, data, id);
      case 'claude_code_plugins':
        return handlePlugins(method, data, id);
      case 'cli_tools':
        return handleCliTools(method, data, id);
      case 'requirement_modules':
        return handleModules(method, data, id);
      case 'models':
        return handleModels(method, data, id);
      case 'insights/kpis': {
        // 4 KPIs aligned to InsightKPI interface: 总需求数、本月新增、已完成、进行中
        const total = query(db, 'SELECT COUNT(*) FROM requirements')[0][0];
        const monthStart = new Date().toISOString().slice(0, 8) + '01';
        const monthNew = query(db, "SELECT COUNT(*) FROM requirements WHERE created_at >= ?", [monthStart])[0][0];
        const completed = query(db, "SELECT COUNT(*) FROM requirements WHERE status='已完成'")[0][0];
        const inProgress = query(db, "SELECT COUNT(*) FROM requirements WHERE status='实现中'")[0][0];
        return [
          { label: '需求总数', value: String(total), change: '+' + total, up: true, icon: 'SparklesIcon', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
          { label: '本月新增', value: String(monthNew), change: '+' + monthNew, up: true, icon: 'PlusCircleIcon', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
          { label: '已完成', value: String(completed), change: total ? Math.round(completed / total * 100) + '%' : '0%', up: true, icon: 'CheckCircleIcon', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
          { label: '进行中', value: String(inProgress), change: inProgress + ' 项', up: true, icon: 'ZapIcon', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
        ];
      }
      case 'insights/charts': {
        const total = query(db, 'SELECT COUNT(*) FROM requirements')[0][0];
        const docCount = query(db, 'SELECT COUNT(*) FROM documents')[0][0];
        const docCats = query(db, 'SELECT category, COUNT(*) FROM documents GROUP BY category');
        const docTypes = query(db, 'SELECT type, COUNT(*) FROM documents GROUP BY type');
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
          barData: docCats.map(r => ({ name: r[0] || '未分类', value: r[1] })),
          pieData: docTypes.map(r => ({ name: r[0] || '未知', value: r[1] })),
        };
      }
      case 'insights/activities': {
        const rows = query(db, "SELECT id, title, status, updated_at FROM requirements ORDER BY updated_at DESC LIMIT 10");
        const iconMap = { '待评估': 'AlertCircleIcon', '设计中': 'EditIcon', '实现中': 'ArrowUpIcon', '测试中': 'SearchIcon', '已完成': 'CheckCircleIcon' };
        const colorMap = { '待评估': '#f59e0b', '设计中': '#6366f1', '实现中': '#06b6d4', '测试中': '#8b5cf6', '已完成': '#10b981' };
        return rows.map(r => ({
          id: r[0],
          icon: iconMap[r[2]] || 'ClockIcon',
          color: colorMap[r[2]] || '#888',
          text: r[1] || '',
          time: r[3],
          targetType: 'requirements',
          targetId: r[0],
        }));
      }
      case 'insights/ai-insights': {
        // GET: return cached insights; POST: generate fresh ones from AI
        if (method === 'POST') {
          // Gather all statistics for AI analysis
          const totalReqs = query(db, 'SELECT COUNT(*) FROM requirements')[0][0];
          const statusRows = query(db, "SELECT status, COUNT(*) FROM requirements GROUP BY status");
          const categoryRows = query(db, "SELECT category, COUNT(*) FROM requirements GROUP BY category");
          const priorityRows = query(db, "SELECT priority, COUNT(*) FROM requirements GROUP BY priority");
          const totalDocs = query(db, 'SELECT COUNT(*) FROM documents')[0][0];
          const docTypeRows = query(db, "SELECT type, COUNT(*) FROM documents GROUP BY type");
          const featuredDocs = query(db, "SELECT COUNT(*) FROM documents WHERE featured=1")[0][0];
          const recentCreated = query(db, "SELECT COUNT(*) FROM requirements WHERE created_at >= datetime('now','-7 days')")[0][0];
          const completedReqs = query(db, "SELECT COUNT(*) FROM requirements WHERE status='已完成'")[0][0];

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
            const model = getDefaultModel(db);
            if (!model) {
              return { error: '未配置大模型：请在「设置 → 模型配置」中添加并启用至少一个模型' };
            }
            if (!model.apiKey) {
              return { error: '模型缺少 API Key：请在模型配置中填写 ' + model.modelId + ' 的 API 密钥' };
            }
            const aiResult = await callAI(db, prompt);
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
          const docPaths = new Set(query(db, "SELECT file_path FROM documents WHERE file_path != ''").map(r => path.basename(r[0])));
          for (const f of files) { if (docPaths.has(f)) usedBytes += fs.statSync(path.join(uploadsDir, f)).size; }
          return { usedBytes };
        } catch { return { usedBytes: 0 }; }
      }
      // P1-14: Knowledge categories CRUD
      case 'knowledge_categories': {
        switch (method) {
          case 'GET':
            return query(db, 'SELECT id, name, created_at FROM knowledge_categories ORDER BY id ASC').map(r => ({
              id: String(r[0]), name: r[1], createdAt: r[2],
            }));
          case 'POST': {
            const { name } = data || {};
            if (!name || !name.trim()) return { error: '分类名称不能为空' };
            const existing = query(db, 'SELECT id FROM knowledge_categories WHERE name = ?', [name.trim()]);
            if (existing.length > 0) return { error: '分类名称已存在' };
            run(db, 'INSERT INTO knowledge_categories (name) VALUES (?)', [name.trim()]);
            return { success: true, id: String(query(db, 'SELECT MAX(id) FROM knowledge_categories')[0][0]) };
          }
          case 'DELETE': {
            if (!id) return { error: 'No id' };
            run(db, 'DELETE FROM knowledge_categories WHERE id = ?', [parseInt(String(id))]);
            return { success: true };
          }
          default: return { error: 'Unknown method' };
        }
      }
      default: {
        // Handle /analyze, /summarize, /preview sub-routes
        const actionMatch = table.match(/^(\w+)\/(\d+)\/(\w+)$/);
        if (actionMatch) {
          const [, resType, resId, action] = actionMatch;
          // P0-01: Validate dynamic table name against whitelist
          if (!ALLOWED_TABLES.includes(resType)) return { error: 'Invalid table: ' + resType };
          const req = query(db, `SELECT * FROM ${resType} WHERE id = ?`, [parseInt(resId)])[0];
          if (!req) return { error: 'Not found' };
          if (action === 'analyze') {
            const desc = (req[2] || '').trim();
            if (!desc) return { error: 'No description to analyze' };
            const aiResult = await callAI(db,
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
            run(db, `UPDATE ${resType} SET ai_summary = ?, ai_tags = ?, image_descriptions = ? WHERE id = ?`,
              [aiSummary, JSON.stringify(aiTags), JSON.stringify([]), parseInt(resId)]);
            return { success: true, aiSummary, aiTags, imageDescriptions: [] };
          }
          if (action === 'summarize') {
            const title = req[1] || '';
            const content = (req[11] || '').substring(0, 500);
            const summary = content ? (await callAI(db, '请用一句话总结以下内容：' + content.substring(0, 2000))) : title;
            run(db, `UPDATE documents SET content = ? WHERE id = ?`, [summary, parseInt(resId)]);
            return { success: true, summary };
          }
        }
        return { error: 'Unknown table: ' + table };
      }
    }
  }

  function handleRequirementsUpload(data) {
    try {
      const uploadsDir = path.join(app.getPath('userData'), 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      // data.file is the File object passed through IPC (as buffer)
      const filename = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const buf = data?.file || data;
      if (buf && Buffer.isBuffer(buf)) {
        const ext = data?.name ? path.extname(data.name) : '.bin';
        const filePath = path.join(uploadsDir, filename + ext);
        fs.writeFileSync(filePath, buf);
        return { url: `/uploads/${filename}${ext}` };
      }
      return { url: '' };
    } catch (e) { log('handleRequirementsUpload error', e); return { error: e.message }; }
  }

  function handleRequirements(method, data, id) {
    try {
    switch (method) {
      case 'GET':
        if (id) {
          const r = query(db, 'SELECT * FROM requirements WHERE id = ?', [id]);
          if (!r.length) return { error: 'Not found' };
          return formatReq(r[0]);
        }
        // List query with optional filtering + pagination (data = query params from URL)
        {
          const q = data && typeof data === 'object' && !Array.isArray(data) ? data : {};

          // Build parameterized SQL WHERE + ORDER BY + LIMIT/OFFSET
          const whereClauses = [];
          const params = [];

          if (q.search) {
            const s = '%' + String(q.search).toLowerCase() + '%';
            whereClauses.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)');
            params.push(s, s);
          }
          if (q.status && q.status !== '全部') {
            whereClauses.push('status = ?');
            params.push(q.status);
          }
          if (q.category && q.category !== '全部') {
            whereClauses.push('category = ?');
            params.push(q.category);
          }
          if (q.priority && q.priority !== '全部') {
            whereClauses.push('priority = ?');
            params.push(q.priority);
          }
          if (q.assignee && q.assignee !== '全部') {
            whereClauses.push('assignee = ?');
            params.push(q.assignee);
          }
          if (q.dateFrom) {
            whereClauses.push('created_at >= ?');
            params.push(q.dateFrom);
          }
          if (q.dateTo) {
            whereClauses.push('created_at <= ?');
            params.push(q.dateTo);
          }

          const sortCol = q.sort === 'priority' ? 'priority' :
                           q.sort === 'status' ? 'status' :
                           q.sort === 'title' ? 'title' : 'created_at';
          const sortDir = q.sortDir === 'asc' ? 'ASC' : 'DESC';
          const whereSQL = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';

          const page = parseInt(q._page) || 1;
          const ps = parseInt(q._pageSize) || 10;
          const offset = (page - 1) * ps;

          // Count total matching rows
          const countResult = query(db, 'SELECT COUNT(*) FROM requirements' + whereSQL, params);
          const total = countResult[0]?.[0] ?? 0;

          // Fetch page with LIMIT/OFFSET
          const all = query(db,
            'SELECT id,title,description,category,module,priority,status,assignee,creator,images,ai_summary,ai_tags,created_at FROM requirements' + whereSQL + ' ORDER BY ' + sortCol + ' ' + sortDir + ' LIMIT ? OFFSET ?',
            [...params, ps, offset]
          );
          const paged = all;

          // Unfiltered status counts for the status bar
          const allCounts = query(db, 'SELECT status, COUNT(*) FROM requirements GROUP BY status');
          const counts = { '待评估': 0, '设计中': 0, '实现中': 0, '测试中': 0, '已完成': 0 };
          for (const [s, c] of allCounts) {
            if (counts[s] !== undefined) counts[s] = c;
          }

          // If query params exist, return paginated format; else return raw array (backward compat)
          if (Object.keys(q).length > 0) {
            return { items: paged.map(formatReqList), total, counts, page, pageSize: ps };
          }
          return all.map(formatReqList);
        }
      case 'POST': {
        const { title, desc, category, module, priority, assignee, creator, dueDate, tags, images, content_blocks } = data || {};
        const contentBlocksStr = typeof content_blocks === 'string' ? content_blocks : JSON.stringify(content_blocks || []);
        run(db, `INSERT INTO requirements (title, description, category, module, priority, assignee, creator, due_date, tags, images, content_blocks) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [title||'', desc||'', category||'', module||'用户端', priority||'', assignee||'', creator||'', dueDate||'', JSON.stringify(tags||[]), JSON.stringify(images||[]), contentBlocksStr]);
        // Use MAX(id) instead of last_insert_rowid() — some sql.js versions return 0 from last_insert_rowid()
        const newId = query(db, 'SELECT MAX(id) FROM requirements')[0][0];
        log('handleReq POST: newId=' + newId + ' title=' + (title||'').substring(0, 30));
        return { success: true, id: newId };
      }
      case 'PUT': {
        if (!id) return { error: 'No id' };
        const { title, desc, category, module, priority, status, assignee, creator, dueDate, tags, images, workflow_handler, content_blocks } = data || {};
        let workflowHistory = [];
        try { workflowHistory = JSON.parse(query(db, 'SELECT workflow_history FROM requirements WHERE id = ?', [id])[0]?.[0] || '[]'); } catch {}
        if (status) {
          const old = query(db, 'SELECT status FROM requirements WHERE id = ?', [id])[0]?.[0];
          if (old && old !== status) workflowHistory.push({ from: old, to: status, handler: workflow_handler || '', time: new Date().toLocaleString('zh-CN') });
        }
        const contentBlocksStr = typeof content_blocks === 'string' ? content_blocks : JSON.stringify(content_blocks || []);
        run(db, `UPDATE requirements SET title=?, description=?, category=?, module=?, priority=?, status=?, assignee=?, creator=?, due_date=?, tags=?, images=?, content_blocks=?, workflow_history=?, updated_at=datetime('now','localtime') WHERE id=?`,
          [title||'', desc||'', category||'', module||'用户端', priority||'', status||'', assignee||'', creator||'', dueDate||'', JSON.stringify(tags||[]), JSON.stringify(images||[]), contentBlocksStr, JSON.stringify(workflowHistory), id]);
        return { success: true };
      }
      case 'DELETE': {
        if (id) run(db, 'DELETE FROM requirements WHERE id = ?', [id]);
        return { success: true };
      }
      default: return { error: 'Unknown method' };
    }
    } catch (e) { log('handleRequirements ERROR', e); return { error: 'Failed to load', message: e.message }; }
  }

  function handleDocuments(method, data, id) {
    try {
    switch (method) {
      case 'GET':
        if (id) {
          const r = query(db, 'SELECT * FROM documents WHERE id = ?', [id]);
          if (!r.length) return { error: 'Not found' };
          run(db, 'UPDATE documents SET views = views + 1 WHERE id = ?', [id]);
          return formatDoc(r[0]);
        }
        return query(db, 'SELECT id, title, category, type, size, views, stars, date, tags, featured, created_at FROM documents ORDER BY created_at DESC').map(r => ({
          id: r[0], title: r[1], category: r[2], type: r[3], size: r[4], views: r[5], stars: r[6], date: r[7], tags: JSON.parse(r[8] || '[]'), featured: r[9] === 1,
        }));
      case 'POST': {
        const { title, category, type, size, date, tags, featured, content, file_path } = data || {};
        run(db, 'INSERT INTO documents (title, category, type, size, date, tags, featured, content, file_path) VALUES (?,?,?,?,?,?,?,?,?)',
          [title||'', category||'guide', type||'MD', size||'', date||'', JSON.stringify(tags||[]), featured ? 1 : 0, content||'', file_path||'']);
        return { success: true, id: query(db, 'SELECT MAX(id) FROM documents')[0][0] };
      }
      case 'PUT': {
        if (!id) return { error: 'No id' };
        const { title, category, type, size, date, tags, featured, content } = data || {};
        run(db, "UPDATE documents SET title=?, category=?, type=?, size=?, date=?, tags=?, featured=?, content=?, updated_at=datetime('now','localtime') WHERE id=?",
          [title||'', category||'', type||'', size||'', date||'', JSON.stringify(tags||[]), featured?1:0, content||'', id]);
        return { success: true };
      }
      case 'DELETE': {
        if (id) run(db, 'DELETE FROM documents WHERE id = ?', [id]);
        return { success: true };
      }
      default: return { error: 'Unknown method' };
    }
    } catch (e) { log('handleDocuments ERROR', e); return { error: 'Failed to load', message: e.message }; }
  }

  function handleMcp(method, data, id) {
    try {
    switch (method) {
      case 'GET':
        return query(db, 'SELECT * FROM mcp_servers ORDER BY id DESC').map(r => ({
          id: r[0], name: r[1], type: r[2], command: r[3], args: JSON.parse(r[4]||'[]'), env: JSON.parse(r[5]||'{}'),
          enabled: !!r[6], config: JSON.parse(r[7]||'{}'), createdAt: r[8],
        }));
      case 'POST': {
        const { name, type, command, args, env, config } = data || {};
        run(db, 'INSERT INTO mcp_servers (name, type, command, args, env, config) VALUES (?,?,?,?,?,?)',
          [name||'', type||'', command||'', JSON.stringify(args||[]), JSON.stringify(env||{}), JSON.stringify(config||{})]);
        return { success: true };
      }
      case 'PUT': {
        if (!id) return { error: 'No id' };
        const { enabled, config, name, type, command, args, env } = data || {};
        const oldRow = query(db, 'SELECT * FROM mcp_servers WHERE id = ?', [id])[0];
        // P0-02: Use field whitelist for MCP PUT to prevent SQL injection
        const fields = []; const vals = [];
        if (enabled !== undefined) { fields.push('enabled=?'); vals.push(enabled?1:0); }
        if (config !== undefined) { fields.push('config=?'); vals.push(JSON.stringify(config)); }
        if (name !== undefined) { fields.push('name=?'); vals.push(name); }
        if (type !== undefined) { fields.push('type=?'); vals.push(type); }
        if (command !== undefined) { fields.push('command=?'); vals.push(command); }
        if (args !== undefined) { fields.push('args=?'); vals.push(JSON.stringify(args)); }
        if (env !== undefined) { fields.push('env=?'); vals.push(JSON.stringify(env)); }
        if (fields.length) { vals.push(id); run(db, `UPDATE mcp_servers SET ${fields.join(',')} WHERE id=?`, vals); }

        // ── Notify MCP manager of config changes ──
        if (oldRow) {
          const oldEnabled = !!oldRow[6];
          const oldCommand = oldRow[3];
          const oldArgsStr = oldRow[4] || '[]';
          const oldEnvStr = oldRow[5] || '{}';
          const oldName = oldRow[1];
          const newEnabled = enabled !== undefined ? !!enabled : oldEnabled;
          const newCommand = command !== undefined ? command : oldCommand;
          const newArgsStr = args !== undefined ? JSON.stringify(args) : oldArgsStr;
          const newEnvStr = env !== undefined ? JSON.stringify(env) : oldEnvStr;
          const newName = name !== undefined ? name : oldName;

          const configChanged = (newCommand !== oldCommand || newArgsStr !== oldArgsStr || newEnvStr !== oldEnvStr);
          const nameChanged = (newName !== oldName);

          // If name, command, or args changed while connected → reconnect
          if ((configChanged || nameChanged) && newEnabled) {
            log('McpNotify: config changed for server #' + id + ', reconnecting');
            const parsedArgs = (() => { try { return JSON.parse(newArgsStr); } catch { return []; } })();
            const parsedEnv = (() => { try { return JSON.parse(newEnvStr); } catch { return {}; } })();
            mcpManager.connect(id, { command: newCommand, args: parsedArgs, env: parsedEnv, name: newName }).catch(e => {
              log('McpNotify: reconnect failed for #' + id, e);
            });
          } else if (oldEnabled && !newEnabled) {
            // Enabled → Disabled: disconnect
            log('McpNotify: disabling server #' + id);
            mcpManager.disconnect(id).catch(e => log('McpNotify: disconnect error', e));
          } else if (!oldEnabled && newEnabled) {
            // Disabled → Enabled: connect
            log('McpNotify: enabling server #' + id);
            const parsedArgs = (() => { try { return JSON.parse(newArgsStr); } catch { return []; } })();
            const parsedEnv = (() => { try { return JSON.parse(newEnvStr); } catch { return {}; } })();
            mcpManager.connect(id, { command: newCommand, args: parsedArgs, env: parsedEnv, name: newName }).catch(e => {
              log('McpNotify: connect failed for #' + id, e);
            });
          }
        }

        return { success: true };
      }
      case 'DELETE': {
        if (id) {
          // Disconnect before deleting
          mcpManager.disconnect(id).catch(e => log('McpNotify: disconnect on delete error', e));
          run(db, 'DELETE FROM mcp_servers WHERE id = ?', [id]);
        }
        return { success: true };
      }
      default: return { error: 'Unknown method' };
    }
    } catch (e) { log('handleMcp ERROR', e); return { error: 'Failed to load', message: e.message }; }
  }

  function handleModels(method, data, id) {
    try {
    switch (method) {
      case 'GET':
        return query(db, 'SELECT * FROM models ORDER BY is_default DESC, id DESC').map(r => ({
          id: r[0], name: r[1], provider: r[2], baseUrl: r[3], apiKey: r[4] ? (() => { try { const dec = decryptApiKey(r[4]); return '******' + (dec ? dec.slice(-4) : ''); } catch { return '******'; } })() : '',
          hasApiKey: !!r[4], modelId: r[5], enabled: !!r[6], isDefault: !!r[7], endpoint: r[10] || '/chat/completions', createdAt: r[9], balance: r[11] || '',
        }));
      case 'POST': {
        const { name, provider, baseUrl, apiKey, modelId, endpoint } = data || {};
        // Check for duplicate provider+modelId
        const existing = query(db, 'SELECT id FROM models WHERE provider = ? AND model_id = ?', [provider || '', modelId || '']);
        if (existing.length > 0) return { error: '该模型已存在 (#' + existing[0][0] + ')' };
        const displayName = name || (provider + ' - ' + modelId);
        // P0-03: Encrypt API key before storage
        const encryptedKey = encryptApiKey(apiKey || '');
        run(db, 'INSERT INTO models (name, provider, base_url, api_key, model_id, endpoint, enabled) VALUES (?,?,?,?,?,?,1)',
          [displayName, provider||'', baseUrl||'', encryptedKey, modelId||'', endpoint||'/chat/completions']);
        return { success: true, id: query(db, 'SELECT MAX(id) FROM models')[0][0] };
      }
      case 'PUT': {
        if (!id) return { error: 'No id' };
        const { is_default, apiKey, modelId, name, enabled, endpoint, baseUrl } = data || {};
        if (is_default) run(db, 'UPDATE models SET is_default = 0');
        // P0-02: Use field whitelist for Models PUT to prevent SQL injection
        const fields = []; const vals = [];
        if (name !== undefined) { fields.push('name=?'); vals.push(name); }
        if (baseUrl !== undefined) { fields.push('base_url=?'); vals.push(baseUrl); }
        // P0-03: Encrypt API key on update
        if (apiKey !== undefined) { fields.push('api_key=?'); vals.push(encryptApiKey(apiKey)); }
        if (modelId !== undefined) { fields.push('model_id=?'); vals.push(modelId); }
        if (is_default !== undefined) { fields.push('is_default=?'); vals.push(is_default?1:0); }
        if (enabled !== undefined) { fields.push('enabled=?'); vals.push(enabled?1:0); }
        if (endpoint !== undefined) { fields.push('endpoint=?'); vals.push(endpoint); }
        if (fields.length) { vals.push(id); run(db, `UPDATE models SET ${fields.join(',')} WHERE id=?`, vals); }
        return { success: true };
      }
      case 'DELETE': { if (id) run(db, 'DELETE FROM models WHERE id = ?', [id]); return { success: true }; }
      default: return { error: 'Unknown method' };
    }
    } catch (e) { log('handleModels ERROR', e); return { error: 'Failed to load', message: e.message }; }
  }

  function handleSkills(method, data, id) {
    try {
      switch (method) {
        case 'GET':
          if (id) {
            const r = query(db, 'SELECT * FROM skills WHERE id = ?', [id]);
            return r.length ? formatSkill(r[0]) : { error: 'Not found' };
          }
          return query(db, 'SELECT * FROM skills ORDER BY created_at DESC').map(formatSkill);
        case 'POST': {
          const { name, description, source, enabled, config } = data || {};
          const genId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
          run(db, 'INSERT INTO skills (id, name, description, source, enabled, config) VALUES (?,?,?,?,?,?)',
            [genId, name||'', description||'', source||'', enabled !== false ? 1 : 0, JSON.stringify(config||{})]);
          return { success: true, id: genId };
        }
        case 'PUT': {
          if (!id) return { error: 'No id' };
          const { name, description, source, enabled, config } = data || {};
          const fields = [];
          const values = [];
          if (name !== undefined) { fields.push('name=?'); values.push(name); }
          if (description !== undefined) { fields.push('description=?'); values.push(description); }
          if (source !== undefined) { fields.push('source=?'); values.push(source); }
          if (enabled !== undefined) { fields.push('enabled=?'); values.push(enabled ? 1 : 0); }
          if (config !== undefined) { fields.push('config=?'); values.push(JSON.stringify(config)); }
          if (fields.length === 0) return { error: 'No fields to update' };
          fields.push("updated_at=datetime('now','localtime')");
          values.push(id);
          run(db, `UPDATE skills SET ${fields.join(',')} WHERE id=?`, values);
          return { success: true };
        }
        case 'DELETE':
          if (id) run(db, 'DELETE FROM skills WHERE id = ?', [id]);
          return { success: true };
        default: return { error: 'Unknown method' };
      }
    } catch (e) { log('handleSkills ERROR', e); return []; }
  }

  function handlePlugins(method, data, id) {
    try {
      switch (method) {
        case 'GET':
          if (id) {
            const r = query(db, 'SELECT * FROM claude_code_plugins WHERE id = ?', [id]);
            return r.length ? formatPlugin(r[0]) : { error: 'Not found' };
          }
          return query(db, 'SELECT * FROM claude_code_plugins ORDER BY created_at DESC').map(formatPlugin);
        case 'POST': {
          const { name, description, source, enabled, config } = data || {};
          const genId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
          run(db, 'INSERT INTO claude_code_plugins (id, name, description, source, enabled, config) VALUES (?,?,?,?,?,?)',
            [genId, name||'', description||'', source||'', enabled !== false ? 1 : 0, JSON.stringify(config||{})]);
          return { success: true, id: genId };
        }
        case 'PUT': {
          if (!id) return { error: 'No id' };
          const { name, description, source, enabled, config } = data || {};
          const fields = [];
          const values = [];
          if (name !== undefined) { fields.push('name=?'); values.push(name); }
          if (description !== undefined) { fields.push('description=?'); values.push(description); }
          if (source !== undefined) { fields.push('source=?'); values.push(source); }
          if (enabled !== undefined) { fields.push('enabled=?'); values.push(enabled ? 1 : 0); }
          if (config !== undefined) { fields.push('config=?'); values.push(JSON.stringify(config)); }
          if (fields.length === 0) return { error: 'No fields to update' };
          fields.push("updated_at=datetime('now','localtime')");
          values.push(id);
          run(db, `UPDATE claude_code_plugins SET ${fields.join(',')} WHERE id=?`, values);
          return { success: true };
        }
        case 'DELETE':
          if (id) run(db, 'DELETE FROM claude_code_plugins WHERE id = ?', [id]);
          return { success: true };
        default: return { error: 'Unknown method' };
      }
    } catch (e) { log('handlePlugins ERROR', e); return []; }
  }

  function handleCliTools(method, data, id) {
    try {
      switch (method) {
        case 'GET':
          if (id) {
            const r = query(db, 'SELECT * FROM cli_tools WHERE id = ?', [id]);
            return r.length ? formatCliTool(r[0]) : { error: 'Not found' };
          }
          return query(db, 'SELECT * FROM cli_tools ORDER BY created_at DESC').map(formatCliTool);
        case 'POST': {
          const { name, description, source, enabled, config } = data || {};
          const genId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
          run(db, 'INSERT INTO cli_tools (id, name, description, source, enabled, config) VALUES (?,?,?,?,?,?)',
            [genId, name||'', description||'', source||'', enabled !== false ? 1 : 0, JSON.stringify(config||{})]);
          return { success: true, id: genId };
        }
        case 'PUT': {
          if (!id) return { error: 'No id' };
          const { name, description, source, enabled, config } = data || {};
          const fields = [];
          const values = [];
          if (name !== undefined) { fields.push('name=?'); values.push(name); }
          if (description !== undefined) { fields.push('description=?'); values.push(description); }
          if (source !== undefined) { fields.push('source=?'); values.push(source); }
          if (enabled !== undefined) { fields.push('enabled=?'); values.push(enabled ? 1 : 0); }
          if (config !== undefined) { fields.push('config=?'); values.push(JSON.stringify(config)); }
          if (fields.length === 0) return { error: 'No fields to update' };
          fields.push("updated_at=datetime('now','localtime')");
          values.push(id);
          run(db, `UPDATE cli_tools SET ${fields.join(',')} WHERE id=?`, values);
          return { success: true };
        }
        case 'DELETE':
          if (id) run(db, 'DELETE FROM cli_tools WHERE id = ?', [id]);
          return { success: true };
        default: return { error: 'Unknown method' };
      }
    } catch (e) { log('handleCliTools ERROR', e); return []; }
  }

  function handleModules(method, data, id) {
    try {
      switch (method) {
        case 'GET':
          if (id) {
            const r = query(db, 'SELECT * FROM requirement_modules WHERE id = ?', [id]);
            return r.length ? { id: r[0][0], name: r[0][1], sortOrder: r[0][2] } : { error: 'Not found' };
          }
          return query(db, 'SELECT * FROM requirement_modules ORDER BY sort_order').map(r => ({ id: r[0], name: r[1], sortOrder: r[2] }));
        case 'POST': {
          const { name } = data || {};
          if (!name || !name.trim()) return { error: '名称不能为空' };
          run(db, 'INSERT INTO requirement_modules (name) VALUES (?)', [name.trim()]);
          const newId = query(db, 'SELECT MAX(id) FROM requirement_modules')[0][0];
          return { success: true, id: newId };
        }
        case 'PUT': {
          if (!id) return { error: 'No id' };
          const { name } = data || {};
          if (!name || !name.trim()) return { error: '名称不能为空' };
          run(db, 'UPDATE requirement_modules SET name = ? WHERE id = ?', [name.trim(), id]);
          return { success: true };
        }
        case 'DELETE':
          if (id) run(db, 'DELETE FROM requirement_modules WHERE id = ?', [id]);
          return { success: true };
        default: return { error: 'Unknown method' };
      }
    } catch (e) { log('handleModules ERROR', e); return []; }
  }
}

module.exports = { setupIPC };
