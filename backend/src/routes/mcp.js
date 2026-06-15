import express from 'express';
import { getDb } from '../db/index.js';

const app = express.Router();

// List all MCP servers
app.get('/', (req, res) => {
  const db = getDb();
  const rows = db.exec("SELECT id, name, type, command, args, env, enabled, config, created_at FROM mcp_servers ORDER BY id")[0]?.values || [];
  res.json(rows.map(r => ({
    id: r[0], name: r[1], type: r[2], command: r[3],
    args: JSON.parse(r[4] || '[]'), env: JSON.parse(r[5] || '{}'),
    enabled: r[6] === 1, config: JSON.parse(r[7] || '{}'),
    createdAt: r[8],
  })));
});

// Add new MCP server
app.post('/', (req, res) => {
  const db = getDb();
  const { name, type, command, args = [], env = {}, config = {}, enabled = false } = req.body;
  const stmt = db.prepare(`INSERT INTO mcp_servers (name, type, command, args, env, config, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  stmt.run([name, type, command, JSON.stringify(args), JSON.stringify(env), JSON.stringify(config), enabled ? 1 : 0]);
  stmt.free();
  res.json({ success: true });
});

// Update MCP server
app.put('/:id', (req, res) => {
  const db = getDb();
  const { name, type, command, args, env, config, enabled } = req.body;
  const stmt = db.prepare(`UPDATE mcp_servers SET name=?, type=?, command=?, args=?, env=?, config=?, enabled=? WHERE id=?`);
  stmt.run([name||'', type||'', command||'', JSON.stringify(args||[]), JSON.stringify(env||{}), JSON.stringify(config||{}), enabled?1:0, req.params.id]);
  stmt.free();
  res.json({ success: true });
});

// Delete MCP server
app.delete('/:id', (req, res) => {
  getDb().run(`DELETE FROM mcp_servers WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// Update token for a server
app.put('/:id/token', (req, res) => {
  const db = getDb();
  const { token } = req.body;
  const row = db.exec(`SELECT config FROM mcp_servers WHERE id=${req.params.id}`)[0]?.values[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  const config = JSON.parse(row[0] || '{}');
  config.token = token;
  const stmt = db.prepare(`UPDATE mcp_servers SET config=? WHERE id=?`);
  stmt.run([JSON.stringify(config), req.params.id]);
  stmt.free();
  res.json({ success: true });
});

export default app;