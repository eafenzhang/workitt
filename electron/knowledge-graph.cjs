// knowledge-graph.cjs — Entity-relationship knowledge graph builder
// Extracts entities from memories and builds a queryable graph for context-aware AI
const { log, query, run, getMemories } = require('./database.cjs');

const BUILD_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily

let _timer = null;

function startKnowledgeGraph(db) {
  log('KnowledgeGraph: starting');
  // Ensure graph tables exist
  db.exec(`CREATE TABLE IF NOT EXISTS kg_entities (
    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, type TEXT, created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS kg_relations (
    id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL,
    relation TEXT NOT NULL, weight REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(source_id) REFERENCES kg_entities(id),
    FOREIGN KEY(target_id) REFERENCES kg_entities(id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_kg_rel_source ON kg_relations(source_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_kg_rel_target ON kg_relations(target_id)');

  setTimeout(() => buildGraph(db), 300000); // First run after 5 min
  _timer = setInterval(() => buildGraph(db), BUILD_INTERVAL_MS);
}

function stopKnowledgeGraph() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

/**
 * Build knowledge graph from agent memories.
 * Extracts entities (people, projects, tech) and relations (works_on, uses, responsible_for).
 */
function buildGraph(db) {
  try {
    const memories = getMemories(db);
    if (memories.length === 0) return;

    // Extract entities via regex heuristics
    const entities = new Map(); // name → { type, count }

    for (const mem of memories) {
      const text = (mem.key + ' ' + mem.value).toLowerCase();

      // Project names (Chinese + English)
      for (const m of text.matchAll(/项目[：:]\s*([^\s,，。]+)/g)) {
        const name = m[1].trim();
        if (name.length > 1) entities.set(name, { type: 'project', count: (entities.get(name)?.count || 0) + 1 });
      }

      // Tech stack
      for (const tech of ['react', 'vue', 'angular', 'typescript', 'python', 'java', 'go', 'rust', 'node', 'electron', 'sqlite', 'docker', 'kubernetes', 'tailwind', 'vite']) {
        if (text.includes(tech)) entities.set(tech, { type: 'technology', count: (entities.get(tech)?.count || 0) + 1 });
      }

      // People (extract from "负责"/"owner" patterns)
      for (const m of text.matchAll(/(负责|owner|assignee|creator)[：:]\s*([^\s,，。]+)/gi)) {
        const name = m[2].trim();
        if (name.length > 1 && name.length < 20) entities.set(name, { type: 'person', count: (entities.get(name)?.count || 0) + 1 });
      }
    }

    // Upsert entities (keep existing ones, add new)
    const crypto = require('crypto');
    for (const [name, info] of entities) {
      const id = crypto.createHash('md5').update(name).digest('hex').substring(0, 16);
      const existing = query(db, 'SELECT id FROM kg_entities WHERE name = ?', [name]);
      if (existing.length === 0) {
        run(db, 'INSERT OR IGNORE INTO kg_entities (id, name, type) VALUES (?,?,?)', [id, name, info.type]);
      }
    }

    // Build relations from memory key-value pairs
    for (const mem of memories) {
      const text = (mem.key + ': ' + mem.value);

      // "X 使用 Y" pattern
      for (const m of text.matchAll(/(\S+)\s*(?:使用|用|基于|built with|uses?)\s*(\S+)/gi)) {
        addRelation(db, m[1].toLowerCase(), m[2].toLowerCase(), 'uses');
      }

      // "X 负责 Y" pattern
      for (const m of text.matchAll(/(\S+)\s*(?:负责|管理|owns?|leads?)\s*(\S+)/gi)) {
        addRelation(db, m[1].toLowerCase(), m[2].toLowerCase(), 'responsible_for');
      }
    }

    log('KnowledgeGraph: built with ' + entities.size + ' entities');
  } catch (e) { log('KnowledgeGraph: build error', e); }
}

function addRelation(db, sourceName, targetName, relation) {
  const crypto = require('crypto');
  const srcId = crypto.createHash('md5').update(sourceName).digest('hex').substring(0, 16);
  const tgtId = crypto.createHash('md5').update(targetName).digest('hex').substring(0, 16);

  const srcExists = query(db, 'SELECT id FROM kg_entities WHERE id = ?', [srcId]);
  const tgtExists = query(db, 'SELECT id FROM kg_entities WHERE id = ?', [tgtId]);
  if (srcExists.length === 0 || tgtExists.length === 0) return;

  const relId = crypto.createHash('md5').update(srcId + relation + tgtId).digest('hex').substring(0, 16);
  const existing = query(db, 'SELECT id FROM kg_relations WHERE id = ?', [relId]);
  if (existing.length > 0) {
    run(db, 'UPDATE kg_relations SET weight = weight + 0.1 WHERE id = ?', [relId]);
  } else {
    run(db, 'INSERT OR IGNORE INTO kg_relations (id, source_id, target_id, relation) VALUES (?,?,?,?)', [relId, srcId, tgtId, relation]);
  }
}

/**
 * Query the knowledge graph for context relevant to a topic.
 * Returns related entities and their relationships.
 */
function queryContext(db, topic, limit = 10) {
  const crypto = require('crypto');
  const topicId = crypto.createHash('md5').update(topic.toLowerCase()).digest('hex').substring(0, 16);

  const related = query(db,
    `SELECT e.name, e.type, r.relation, r.weight FROM kg_relations r
     JOIN kg_entities e ON (r.target_id = e.id OR r.source_id = e.id)
     WHERE r.source_id = ? OR r.target_id = ?
     ORDER BY r.weight DESC LIMIT ?`,
    [topicId, topicId, limit]);

  if (related.length === 0) return '';
  return related.map(r => `- ${r[0]} (${r[1]}): ${r[2]}`).join('\n');
}

module.exports = { startKnowledgeGraph, stopKnowledgeGraph, queryContext };
