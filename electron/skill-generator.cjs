// skill-generator.cjs — Auto-generate skills from conversation patterns
// Analyzes chat history to detect repeatable patterns and create reusable skills
const { log, query, run, callAI } = require('./database.cjs');

const MIN_PATTERN_OCCURRENCES = 3;
const ANALYSIS_INTERVAL_MS = 12 * 60 * 60 * 1000; // Every 12 hours

let _timer = null;

function startSkillGenerator(db) {
  log('SkillGenerator: starting');
  setTimeout(() => analyzeAndGenerate(db), 120000); // First run after 2 min
  _timer = setInterval(() => analyzeAndGenerate(db), ANALYSIS_INTERVAL_MS);
}

function stopSkillGenerator() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

/**
 * Analyze recent AI feedback to discover patterns worth turning into skills.
 */
async function analyzeAndGenerate(db) {
  try {
    // Find frequently downvoted topics — these need better skills
    const downvoted = query(db,
      "SELECT context, COUNT(*) as cnt FROM ai_feedback WHERE type='thumbs_down' AND created_at >= datetime('now','-7 days') GROUP BY context HAVING cnt >= ?",
      [MIN_PATTERN_OCCURRENCES]);

    // Find successful (upvoted) patterns — these could become templates
    const upvoted = query(db,
      "SELECT context, COUNT(*) as cnt FROM ai_feedback WHERE type='thumbs_up' AND created_at >= datetime('now','-7 days') GROUP BY context HAVING cnt >= ?",
      [MIN_PATTERN_OCCURRENCES]);

    if (downvoted.length === 0 && upvoted.length === 0) return;

    // Get existing skill names to avoid duplicates
    const existing = new Set(query(db, 'SELECT name FROM skills WHERE enabled = 1').map(r => r[0].toLowerCase()));

    // Generate skills from successful patterns
    for (const row of upvoted.slice(0, 3)) {
      const context = (row[0] || '').substring(0, 500);
      if (!context || context.length < 20) continue;

      const prompt = `分析以下用户与AI的成功对话，提取可复用的技能定义。输出JSON（不要markdown）：\n{"name":"技能名称(英文)","description":"中文描述","instructions":"给AI的指令"}\n\n对话内容：${context}`;

      try {
        const result = await callAI(db, prompt);
        if (!result) continue;
        const parsed = safeJson(result);
        if (!parsed.name || existing.has(parsed.name.toLowerCase())) continue;

        const genId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
        run(db, 'INSERT OR IGNORE INTO skills (id, name, description, source, enabled, config) VALUES (?,?,?,?,?,?)',
          [genId, parsed.name, parsed.description || '', 'auto-generated', 0, JSON.stringify({ instructions: parsed.instructions || '' })]);

        log('SkillGenerator: created skill "' + parsed.name + '" from successful patterns');
        existing.add(parsed.name.toLowerCase());
      } catch (e) { log('SkillGenerator: generation failed', e); }
    }

    // Generate improvement suggestions for downvoted patterns
    for (const row of downvoted.slice(0, 3)) {
      const context = (row[0] || '').substring(0, 300);
      if (!context || context.length < 20) continue;

      const prompt = `用户对以下AI回复不满意。请分析问题并给出改进建议（一句话）：\n\n${context}`;
      try {
        const suggestion = await callAI(db, prompt);
        if (suggestion) {
          upsertMemory(db, { key: 'improvement_' + Date.now(), value: suggestion, source: 'auto-analysis' });
          log('SkillGenerator: improvement suggestion recorded');
        }
      } catch {}
    }
  } catch (e) { log('SkillGenerator: analysis error', e); }
}

function safeJson(str) {
  try {
    const cleaned = str.replace(/```[a-z]*\n?/g, '').replace(/`/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch { return {}; }
}

// Local upsert for memories (avoiding circular dependency)
function upsertMemory(db, { key, value, source }) {
  const existing = query(db, 'SELECT id FROM agent_memories WHERE key = ?', [key]);
  if (existing.length > 0) {
    run(db, 'UPDATE agent_memories SET value = ?, source = ?, updated_at = datetime("now","localtime") WHERE key = ?', [value, source || '', key]);
  } else {
    run(db, 'INSERT INTO agent_memories (key, value, source) VALUES (?, ?, ?)', [key, value, source || '']);
  }
}

module.exports = { startSkillGenerator, stopSkillGenerator };
