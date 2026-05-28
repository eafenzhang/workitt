#!/usr/bin/env node
import { stdin, stdout } from 'process';

const TAPD_API = 'https://api.tapd.cn';

let token = '';

function send(resp) {
  stdout.write(JSON.stringify(resp) + '\n');
}

function parseMessage(line) {
  try {
    return JSON.parse(line);
  } catch { return null; }
}

async function tapdRequest(path, options = {}) {
  const res = await fetch(`${TAPD_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`TAPD API error: ${res.status}`);
  return res.json();
}

const tools = {
  'tapd_get_stories': {
    description: '获取 TAPD 需求列表',
    input: { workspace_id: 'string', page: 'number?', limit: 'number?' },
    async handler({ workspace_id, page = 1, limit = 20 }) {
      const data = await tapdRequest(`/stories?workspace_id=${workspace_id}&page=${page}&limit=${limit}`);
      return { stories: data.data || [], total: data.total };
    },
  },
  'tapd_get_story': {
    description: '获取单个 TAPD 需求详情',
    input: { id: 'string', workspace_id: 'string' },
    async handler({ id, workspace_id }) {
      const data = await tapdRequest(`/stories/${id}?workspace_id=${workspace_id}`);
      return { story: data };
    },
  },
  'tapd_search_stories': {
    description: '搜索 TAPD 需求',
    input: { workspace_id: 'string', keyword: 'string', status: 'string?' },
    async handler({ workspace_id, keyword, status }) {
      let path = `/stories?workspace_id=${workspace_id}&title=${encodeURIComponent(keyword)}`;
      if (status) path += `&status=${status}`;
      const data = await tapdRequest(path);
      return { stories: data.data || [], total: data.total };
    },
  },
};

stdin.on('data', (chunk) => {
  const lines = chunk.toString().trim().split('\n');
  for (const line of lines) {
    const msg = parseMessage(line);
    if (!msg || msg.jsonrpc !== '2.0') continue;

    const { id, method, params } = msg;

    if (method === 'initialize') {
      send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'tapd-mcp', version: '1.0.0' } } });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: { type: 'object', properties: Object.fromEntries(Object.entries(t.input).map(([k, v]) => [k, { type: v }])), required: Object.keys(t.input) } })) } });
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params;
      if (name === 'set_token') {
        token = args.token;
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Token set successfully` }] } });
      } else if (tools[name]) {
        tools[name].handler(args).then(r => send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(r) }] } })).catch(e => send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } }));
      } else {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } });
      }
    }
  }
});