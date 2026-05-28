// Unified API layer - uses IPC in Electron, fetch in dev
const api = (window as any).electronAPI;
let ipcLogged = false;
let preloadWarned = false;

async function call(method: string, table: string, data?: any, id?: number | string): Promise<any> {
  if (api) {
    if (!ipcLogged) { ipcLogged = true; }
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

function upload(table: string, formData: FormData): Promise<any> {
  if (api) return api.dbUpload(table, Array.from((formData.get('file') as File)?.arrayBuffer() || []));
  return fetch(`/api/${table}/upload`, { method: 'POST', body: formData }).then(r => r.json());
}

function uploadImage(formData: FormData): Promise<any> {
  if (api) return api.dbUpload('requirements', Array.from((formData.get('image') as File)?.arrayBuffer() || []));
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
    const data = await call(method, table, body, id);
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
