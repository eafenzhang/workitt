// model-router.cjs — Adaptive model router with fallback chain
// Routes AI calls to the best model based on task type, feedback stats, and cost

const { log, query } = require('./database.cjs');

// Task classification heuristics (lightweight, no extra AI call)
const TASK_PATTERNS = {
  summarize:   /^(总结|摘要|概括|简述|brief|summarize|TL;DR)/i,
  analyze:     /^(分析|审查|检查|审计|review|audit|analyze|scan)/i,
  generate:    /^(生成|创建|写|帮我|create|generate|write|build|制作)/i,
  translate:   /^(翻译|translate|译)/i,
  code:        /^(代码|编程|函数|class |function |修复|bug|fix|implement)/i,
  chat:        /./, // Default
};

const TASK_ROUTING = {
  summarize:   { prefer: ['haiku', 'deepseek-chat'],      fallback: 'sonnet',  maxTokens: 500,  temperature: 0.3 },
  analyze:     { prefer: ['sonnet', 'deepseek-reasoner'],  fallback: 'opus',   maxTokens: 4000, temperature: 0.2 },
  generate:    { prefer: ['sonnet', 'opus'],               fallback: 'deepseek-chat', maxTokens: 4000, temperature: 0.7 },
  translate:   { prefer: ['haiku', 'sonnet'],              fallback: 'deepseek-chat', maxTokens: 2000, temperature: 0.1 },
  code:        { prefer: ['sonnet', 'opus'],               fallback: 'deepseek-chat', maxTokens: 4000, temperature: 0.2 },
  chat:        { prefer: ['sonnet', 'deepseek-chat'],      fallback: 'haiku',  maxTokens: 2000, temperature: 0.5 },
};

/**
 * Classify the user's message into a task type.
 */
function classifyTask(messages) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const text = (lastUserMsg?.content || '').toString();
  for (const [task, pattern] of Object.entries(TASK_PATTERNS)) {
    if (pattern.test(text)) return task;
  }
  return 'chat';
}

/**
 * Route to the best available model.
 * @param {*} db - Database instance
 * @param {Array} messages - Chat messages
 * @param {{providerId?, modelId?}} explicitChoice - User-specified model (overrides routing)
 * @returns {{ model: object|null, taskType: string, config: object }}
 */
function routeModel(db, messages, explicitChoice) {
  // If user explicitly chose a model, use it
  if (explicitChoice?.providerId && explicitChoice?.modelId) {
    const rows = query(db, 'SELECT base_url, api_key, model_id, endpoint FROM models WHERE provider = ? AND model_id = ? AND enabled = 1 LIMIT 1',
      [explicitChoice.providerId, explicitChoice.modelId]);
    if (rows.length > 0) {
      const { decryptApiKey } = require('./database.cjs');
      return {
        model: { baseUrl: rows[0][0], apiKey: decryptApiKey(rows[0][1]), modelId: rows[0][2], endpoint: rows[0][3] || '' },
        taskType: 'explicit',
        config: { maxTokens: 4000, temperature: 0.5 },
      };
    }
  }

  const taskType = classifyTask(messages);
  const routing = TASK_ROUTING[taskType] || TASK_ROUTING.chat;

  // Get all enabled models
  const { decryptApiKey } = require('./database.cjs');
  const allModels = query(db, 'SELECT id, name, provider, base_url, api_key, model_id, endpoint FROM models WHERE enabled = 1 ORDER BY is_default DESC');

  if (allModels.length === 0) return { model: null, taskType, config: routing };

  // Try preferred models first (in order)
  for (const prefId of routing.prefer) {
    const match = allModels.find(m => m[5] === prefId || (m[2] || '').toLowerCase().includes(prefId));
    if (match) {
      log('ModelRouter: task=' + taskType + ' → ' + match[5] + ' (' + (match[2] || match[1]) + ')');
      return {
        model: { baseUrl: match[3], apiKey: decryptApiKey(match[4]), modelId: match[5], endpoint: match[6] || '' },
        taskType,
        config: { maxTokens: routing.maxTokens, temperature: routing.temperature },
      };
    }
  }

  // Fallback: use any enabled model
  const fallback = allModels[0];
  log('ModelRouter: task=' + taskType + ' → fallback: ' + fallback[5]);
  return {
    model: { baseUrl: fallback[3], apiKey: decryptApiKey(fallback[4]), modelId: fallback[5], endpoint: fallback[6] || '' },
    taskType,
    config: { maxTokens: routing.maxTokens, temperature: routing.temperature },
  };
}

/**
 * Get model with fallback chain — tries primary, then secondary, then any available.
 */
function getModelWithFallback(db, preferredModelId) {
  const { decryptApiKey } = require('./database.cjs');
  const all = query(db, 'SELECT id, name, provider, base_url, api_key, model_id, endpoint FROM models WHERE enabled = 1');

  // Try exact match first
  const exact = all.find(m => m[5] === preferredModelId);
  if (exact) return { baseUrl: exact[3], apiKey: decryptApiKey(exact[4]), modelId: exact[5], endpoint: exact[6] || '' };

  // Try any enabled
  const any = all[0];
  if (any) return { baseUrl: any[3], apiKey: decryptApiKey(any[4]), modelId: any[5], endpoint: any[6] || '' };

  return null;
}

module.exports = { routeModel, classifyTask, getModelWithFallback };
