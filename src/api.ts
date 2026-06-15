// Unified API layer - uses IPC in Electron, fetch in dev
const api = (window as any).electronAPI;
let ipcLogged = false;
let preloadWarned = false;

async function call(method: string, table: string, data?: any, id?: number | string): Promise<any> {
  if (api) {
    if (!ipcLogged) { console.log('[api] Using Electron IPC path (electronAPI detected)'); ipcLogged = true; }
    const result = await api.dbQuery(method, table, { data, id });
    return result;
  }
  // Dev mode: use fetch
  if (!preloadWarned) { console.warn('[api] electronAPI not found — preload may not be loaded, falling back to fetch'); preloadWarned = true; }
  let url = `/api/${table}`;
  const opts: RequestInit = { headers: { 'Content-Type': 'application/json' } };
  if (id !== undefined) url += `/${id}`;
  if (method === 'GET') {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${res.statusText} - ${body.substring(0, 500)}`);
    }
    return res.text().then(t => { try { return JSON.parse(t); } catch { return t; } });
  }
  opts.method = method;
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${res.statusText} - ${body.substring(0, 500)}`);
  }
  return res.text().then(t => { try { return JSON.parse(t); } catch { return t; } });
}

// Drop-in replacement for fetch('/api/...') for existing pages
// Returns a Response-like object so existing .json() calls work
export async function apiFetch(url: string, opts?: RequestInit): Promise<any> {
  if (api) {
    const [urlPath, queryStr] = url.split('?');
    const parts = urlPath.replace('/api/', '').split('/');
    const method = opts?.method || 'GET';
    let body = undefined;
    if (opts?.body && typeof opts.body === 'string') {
      try { body = JSON.parse(opts.body); }
      catch { body = opts.body; }
    }
    const query: Record<string, string> = {};
    if (queryStr) {
      for (const pair of queryStr.split('&')) {
        const [k, v] = pair.split('=');
        if (k) query[decodeURIComponent(k)] = v !== undefined ? decodeURIComponent(v) : 'true';
      }
    }
    let table = parts[0];
    let id: number | undefined = undefined;
    if (parts.length >= 2) {
      if (/^\d+$/.test(parts[1])) {
        id = parseInt(parts[1]);
        if (parts.length > 2) table = parts.join('/');
      } else {
        table = parts.join('/');
      }
    }
    // For GET requests, pass query params inside data so they reach handleRequirements
    const dataPayload = method === 'GET' && Object.keys(query).length > 0
      ? query
      : body;
    const data = await call(method, table, dataPayload || undefined, id);
    return { json: () => Promise.resolve(data), data };
  }
  const res = await fetch(url, opts);
  let data: any;
  try { data = await res.json(); }
  catch { data = await res.text(); }
  return { json: () => Promise.resolve(data), data };
}

/** API path constants */
export const API = {
  requirements: '/api/requirements',
  requirementsUploadImage: '/api/requirements/upload-image',
  requirementsAnalyze: (id: number) => `/api/requirements/${id}/analyze`,
  requirementsById: (id: number) => `/api/requirements/${id}`,
  documents: '/api/documents',
  documentsUpload: '/api/documents/upload',
  documentsById: (id: number) => `/api/documents/${id}`,
  documentsPreview: (id: number) => `/api/documents/${id}/preview`,
  documentsSummarize: (id: number) => `/api/documents/${id}/summarize`,
  models: '/api/models',
  modelsById: (id: number) => `/api/models/${id}`,
  storageStats: '/api/storage/stats',
  knowledgeCategories: '/api/knowledge_categories',
  mcp: '/api/mcp',
  mcpById: (id: number) => `/api/mcp/${id}`,
  mcpToken: (serverId: number) => `/api/mcp/${serverId}/token`,
  mcpServers: '/api/mcp_servers',
  skills: '/api/skills',
  skillsById: (id: string) => `/api/skills/${id}`,
  plugins: '/api/claude_code_plugins',
  pluginsById: (id: string) => `/api/claude_code_plugins/${id}`,
  cliTools: '/api/cli_tools',
  cliToolsById: (id: string) => `/api/cli_tools/${id}`,
  reqModules: '/api/requirement_modules',
  reqModulesById: (id: number) => `/api/requirement_modules/${id}`,
} as const;
