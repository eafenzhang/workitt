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
    return res.json();
  }
  opts.method = method;
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch(url, opts);
  return res.json();
}

async function upload(table: string, formData: FormData): Promise<any> {
  if (api) {
    const file = formData.get('file') as File | null;
    const buf = file ? await file.arrayBuffer() : new ArrayBuffer(0);
    return api.dbUpload(table, Array.from(new Uint8Array(buf)));
  }
  return fetch(`/api/${table}/upload`, { method: 'POST', body: formData }).then(r => r.json());
}

async function uploadImage(formData: FormData): Promise<any> {
  if (api) {
    const file = formData.get('image') as File | null;
    const buf = file ? await file.arrayBuffer() : new ArrayBuffer(0);
    return api.dbUpload('requirements', Array.from(new Uint8Array(buf)));
  }
  return fetch('/api/requirements/upload-image', { method: 'POST', body: formData }).then(r => r.json());
}

// Drop-in replacement for fetch('/api/...') for existing pages
// Returns a Response-like object so existing .json() calls work
export async function apiFetch(url: string, opts?: RequestInit): Promise<any> {
  if (api) {
    // Split off query string (?featured=true), only parse the path
    const [urlPath, queryStr] = url.split('?');
    const parts = urlPath.replace('/api/', '').split('/');
    const method = opts?.method || 'GET';
    let body = undefined;
    if (opts?.body && typeof opts.body === 'string') body = JSON.parse(opts.body);
    // Parse query string into object
    const query: Record<string, string> = {};
    if (queryStr) {
      for (const pair of queryStr.split('&')) {
        const [k, v] = pair.split('=');
        if (k) query[decodeURIComponent(k)] = v !== undefined ? decodeURIComponent(v) : 'true';
      }
    }
    // Build full table path (e.g. 'dashboard/stats', 'insights/kpis')
    let table = parts[0];
    let id: number | undefined = undefined;
    if (parts.length >= 2) {
      if (/^\d+$/.test(parts[1])) {
        id = parseInt(parts[1]);
        if (parts.length > 2) table = parts.join('/'); // e.g. requirements/123/analyze
      } else {
        table = parts.join('/');
      }
    }
    const dataPayload = method === 'GET' && Object.keys(query).length > 0
      ? query
      : body;
    const data = await call(method, table, dataPayload || undefined, id);
    return { json: () => Promise.resolve(data), data };
  }
  const res = await fetch(url, opts);
  const data = await res.json();
  return { json: () => Promise.resolve(data), data };
}

export const db = {
  requirements: {
    list: (params?: string) => call('GET', 'requirements').then(r => r),
    get: (id: number) => call('GET', 'requirements', null, id),
    create: (data: any) => call('POST', 'requirements', data),
    update: (id: number, data: any) => call('PUT', 'requirements', data, id),
    delete: (id: number) => call('DELETE', 'requirements', null, id),
    analyze: (id: number) => call('POST', `requirements/${id}/analyze`),
    uploadImage,
  },
  documents: {
    list: (params?: string) => call('GET', 'documents').then(r => r),
    get: (id: number) => call('GET', 'documents', null, id),
    create: (data: any) => call('POST', 'documents', data),
    update: (id: number, data: any) => call('PUT', 'documents', data, id),
    delete: (id: number) => call('DELETE', 'documents', null, id),
    upload,
    summarize: (id: number) => call('POST', `documents/${id}/summarize`),
    analyzeImages: (id: number) => call('POST', `documents/${id}/analyze-images`),
  },
  mcp: {
    list: () => call('GET', 'mcp'),
    delete: (id: number) => call('DELETE', 'mcp', null, id),
    update: (id: number, data: any) => call('PUT', 'mcp', data, id),
    create: (data: any) => call('POST', 'mcp', data),
    saveToken: (id: number, token: string) => call('PUT', `mcp/${id}/token`, { token }),
  },
  models: {
    list: () => call('GET', 'models'),
    delete: (id: number) => call('DELETE', 'models', null, id),
    update: (id: number, data: any) => call('PUT', 'models', data, id),
    create: (data: any) => call('POST', 'models', data),
  },
  dashboard: {
    stats: () => call('GET', 'dashboard/stats'),
    activities: () => call('GET', 'dashboard/activities'),
  },
  insights: {
    kpis: () => call('GET', 'insights/kpis'),
    charts: () => call('GET', 'insights/charts'),
    aiInsights: () => call('GET', 'insights/ai-insights'),
  },
  storage: {
    stats: () => call('GET', 'storage/stats'),
  },
};

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
  insights: {
    kpis: '/api/insights/kpis',
    charts: '/api/insights/charts',
    aiInsights: '/api/insights/ai-insights',
    activities: '/api/insights/activities',
  },
} as const;
