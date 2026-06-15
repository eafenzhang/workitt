// memory-consolidator.cjs — Memory consolidation engine
// Runs periodically to merge old memories, prune low-importance ones, and generate summaries

const { log, query, run, callAI, upsertMemory, deleteMemory, getMemories, getMemorySummary } = require('./database.cjs');

const CONSOLIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
const MEMORY_AGE_THRESHOLD_DAYS = 7;
const MIN_MEMORIES_TO_CONSOLIDATE = 10;

let _timer = null;

function startMemoryConsolidator(db) {
  log('MemoryConsolidator: starting (interval=' + (CONSOLIDATION_INTERVAL_MS / 3600000) + 'h)');

  // Run immediately on startup (with delay)
  setTimeout(() => consolidateMemories(db), 60000);

  // Then run daily
  _timer = setInterval(() => consolidateMemories(db), CONSOLIDATION_INTERVAL_MS);
}

function stopMemoryConsolidator() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

/**
 * Main consolidation routine:
 * 1. Find memories older than threshold
 * 2. Score by importance (based on source and content)
 * 3. Merge similar memories using AI
 * 4. Delete low-importance stale memories
 * 5. Write consolidated summary as new memory
 */
async function consolidateMemories(db) {
  try {
    const all = getMemories(db);
    if (all.length < MIN_MEMORIES_TO_CONSOLIDATE) return;

    const threshold = new Date(Date.now() - MEMORY_AGE_THRESHOLD_DAYS * 86400000).toISOString();

    // Separate fresh (< 7 days) from old
    const fresh = all.filter(m => (m.updatedAt || m.createdAt) >= threshold);
    const old = all.filter(m => (m.updatedAt || m.createdAt) < threshold);

    if (old.length < 5) return; // Not enough old memories to consolidate

    // Score old memories by importance
    const scored = old.map(m => ({ ...m, score: scoreImportance(m) }));
    // Keep top 50% of old memories, consolidate the rest
    scored.sort((a, b) => b.score - a.score);
    const toKeep = scored.slice(0, Math.floor(scored.length / 2));
    const toConsolidate = scored.slice(Math.floor(scored.length / 2));

    if (toConsolidate.length < 3) return;

    log('MemoryConsolidator: consolidating ' + toConsolidate.length + ' old memories');

    // AI merge
    const prompt = [
      '合并以下用户记忆为精简摘要。保留关键信息，删除冗余和矛盾内容：',
      '',
      toConsolidate.map(m => `- [${m.key}] ${m.value} (来源: ${m.source || '未知'})`).join('\n'),
      '',
      '输出格式（纯文本，不超过500字）：',
      '【核心摘要】...',
    ].join('\n');

    const summary = await callAI(db, prompt);
    if (!summary) return;

    // Delete consolidated memories
    for (const m of toConsolidate) {
      try { deleteMemory(db, m.key); } catch {}
    }

    // Keep high-scoring ones + write consolidated summary
    upsertMemory(db, {
      key: 'consolidated_' + Date.now(),
      value: summary.substring(0, 2000),
      source: 'auto-consolidation',
    });

    log('MemoryConsolidator: merged ' + toConsolidate.length + ' memories, kept ' + toKeep.length);
  } catch (e) {
    log('MemoryConsolidator: error', e);
  }
}

/**
 * Score memory importance based on heuristics:
 * - User preferences ("我喜欢"/"我习惯") are high importance
 * - Tech stack info is medium
 * - Generic observations are low
 */
function scoreImportance(mem) {
  const value = (mem.value || '').toLowerCase();
  const key = (mem.key || '').toLowerCase();
  let score = 1;

  // Key-based scoring
  if (key.includes('preference') || key.includes('pref_')) score += 3;
  if (key.includes('tech') || key.includes('stack') || key.includes('project')) score += 2;
  if (key.includes('name') || key.includes('role')) score += 2;

  // Content-based scoring
  if (value.includes('喜欢') || value.includes('偏好') || value.includes('习惯')) score += 2;
  if (value.includes('技术栈') || value.includes('框架') || value.includes('语言')) score += 1;
  if (value.includes('项目') || value.includes('负责')) score += 1;

  return score;
}

/**
 * Get optimized memory context for system prompt injection.
 * Prioritizes fresh + high-importance memories, keeps total under 2000 chars.
 */
function getOptimizedMemoryContext(db) {
  const all = getMemories(db);
  if (all.length === 0) return '';

  // Score and sort
  const scored = all.map(m => ({ ...m, score: scoreImportance(m) }));
  scored.sort((a, b) => b.score - a.score);

  let result = '';
  for (const m of scored) {
    const line = `- ${m.key}: ${m.value}\n`;
    if (result.length + line.length > 2000) break;
    result += line;
  }
  return result;
}

module.exports = { startMemoryConsolidator, stopMemoryConsolidator, getOptimizedMemoryContext };
