// ─── CowAgent HTTP API Client ─────────────────────────────
// Frontend client for the CowAgent Python backend.
// Used by Home page for streaming chat and by AppEcosystem for skills/tools.

export const DEFAULT_BACKEND_PORT = 9899
const API_BASE = `http://localhost:${DEFAULT_BACKEND_PORT}`

// ─── Types ────────────────────────────────────────────────

export interface BackendStatus {
  running: boolean
  port: number
  pid: number | null
}

export interface ChatStreamEvent {
  type: 'delta' | 'done' | 'error' | 'tool_start' | 'tool_end' | 'reasoning' | 'cancelled'
  content?: string
  tool?: string
  arguments?: Record<string, unknown>
  status?: string
  result?: string
  execution_time?: number
  message?: string
}

export interface SessionInfo {
  session_id?: string
  id?: string
  title?: string
  created_at?: string
  updated_at?: string
}

export interface SkillInfo {
  name: string
  description?: string
  version?: string
  author?: string
  enabled?: boolean
}

export interface ToolInfo {
  name: string
  description: string
}

export type ChatCallbacks = {
  onDelta: (text: string) => void
  onDone: (text: string) => void
  onError: (err: Error) => void
  onToolStart?: (tool: string, args?: Record<string, unknown>) => void
  onToolEnd?: (tool: string, status: string, result?: string) => void
  onReasoning?: (text: string) => void
}

// ─── Backend Status ───────────────────────────────────────

/** Check if the CowAgent backend is running via Electron IPC. */
export async function checkBackendStatus(): Promise<BackendStatus> {
  const api = (window as any).electronAPI
  if (api?.getBackendStatus) {
    try {
      return await api.getBackendStatus()
    } catch {
      // Fall through to HTTP check
    }
  }
  // Fallback: direct HTTP health check
  try {
    const res = await fetch(`${API_BASE}/api/version`, { signal: AbortSignal.timeout(3000) })
    return { running: res.ok, port: DEFAULT_BACKEND_PORT, pid: null }
  } catch {
    return { running: false, port: DEFAULT_BACKEND_PORT, pid: null }
  }
}

// ─── Streaming Chat (SSE) ─────────────────────────────────

const ABORT_CONTROLLERS = new Map<string, AbortController>()

/**
 * Send a message to the CowAgent backend and stream the response via SSE.
 * Returns an AbortController that can be used to cancel the request.
 */
export function chatStream(
  query: string,
  sessionId: string,
  cb: ChatCallbacks,
): AbortController {
  const ctrl = new AbortController()
  ABORT_CONTROLLERS.set(sessionId, ctrl)

  ;(async () => {
    try {
      const res = await fetch(`${API_BASE}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, session_id: sessionId, stream: true }),
        signal: ctrl.signal,
      })

      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()
      if (data.status !== 'success') throw new Error(data.message || '发送失败')

      const rid = data.request_id
      const sse = await fetch(`${API_BASE}/stream?request_id=${encodeURIComponent(rid)}`, {
        signal: ctrl.signal,
        headers: { Accept: 'text/event-stream' },
      })

      if (!sse.ok) throw new Error(`SSE ${sse.status}`)
      const reader = sse.body?.getReader()
      if (!reader) throw new Error('No response body')

      const dec = new TextDecoder()
      let buf = ''
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          const t = line.trim()
          if (!t || t === ': keepalive' || !t.startsWith('data: ')) continue

          const raw = t.slice(6).trim()
          if (!raw) continue

          try {
            const ev: ChatStreamEvent = JSON.parse(raw)
            switch (ev.type) {
              case 'delta':
                fullText += ev.content || ''
                cb.onDelta(fullText)
                break
              case 'reasoning':
                cb.onReasoning?.(ev.content || '')
                break
              case 'tool_start':
                cb.onToolStart?.(ev.tool || '', ev.arguments)
                break
              case 'tool_end':
                cb.onToolEnd?.(ev.tool || '', ev.status || 'success', ev.result)
                break
              case 'done':
                if (ev.content) fullText += ev.content
                cb.onDelta(fullText)
                cb.onDone(fullText)
                return
              case 'cancelled':
                cb.onDone(fullText)
                return
              case 'error':
                throw new Error(ev.message || 'Error from CowAgent')
            }
          } catch (p) {
            if (!(p instanceof SyntaxError)) throw p
            if (raw) {
              fullText += raw
              cb.onDelta(fullText)
            }
          }
        }
      }
      cb.onDone(fullText)
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        cb.onError(e as Error)
      }
    }
  })()

  return ctrl
}

/** Cancel an ongoing streaming chat for a session. */
export function cancelChat(sessionId: string): void {
  const ctrl = ABORT_CONTROLLERS.get(sessionId)
  if (ctrl) {
    ctrl.abort()
    ABORT_CONTROLLERS.delete(sessionId)
  }
  // Also tell the backend to cancel
  fetch(`${API_BASE}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  }).catch(() => { /* best effort */ })
}

// ─── Sessions ─────────────────────────────────────────────

export async function getSessions(page = 1): Promise<SessionInfo[]> {
  try {
    const r = await fetch(`${API_BASE}/api/sessions?page=${page}&page_size=50`)
    if (!r.ok) return []
    const d = await r.json()
    return d.sessions || []
  } catch { return [] }
}

export async function createSession(title?: string): Promise<SessionInfo | null> {
  try {
    const r = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || '' }),
    })
    return r.ok ? await r.json() : null
  } catch { return null }
}

export async function getSessionHistory(sid: string, page = 1): Promise<{ role: string; content: string }[]> {
  try {
    const r = await fetch(`${API_BASE}/api/history?session_id=${encodeURIComponent(sid)}&page=${page}`)
    if (!r.ok) return []
    const d = await r.json()
    return d.messages || []
  } catch { return [] }
}

// ─── Skills ───────────────────────────────────────────────

export async function getSkills(): Promise<SkillInfo[]> {
  try {
    const r = await fetch(`${API_BASE}/api/skills`)
    if (!r.ok) return []
    const d = await r.json()
    return d.skills || []
  } catch { return [] }
}

export async function toggleSkill(name: string, action: 'open' | 'close'): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, name }),
    })
    return r.ok
  } catch { return false }
}

export async function installSkill(name: string, payload?: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'install', name, payload }),
    })
    const d = await r.json()
    return d.status === 'success'
  } catch { return false }
}

// ─── Tools ────────────────────────────────────────────────

export async function getCowAgentTools(): Promise<ToolInfo[]> {
  try {
    const r = await fetch(`${API_BASE}/api/tools`)
    if (!r.ok) return []
    const d = await r.json()
    return d.tools || []
  } catch { return [] }
}

// ─── Config ───────────────────────────────────────────────

export async function getCowAgentConfig(): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${API_BASE}/config`)
    return r.ok ? await r.json() : null
  } catch { return null }
}

// ─── Channels ──────────────────────────────────────────────

export interface ChannelDef {
  name: string
  label: string | Record<string, string>
  icon: string
  color: string
  active: boolean
  fields: { key: string; label: string; type: string; value?: string; default?: string }[]
}

export async function getChannels(): Promise<ChannelDef[]> {
  try {
    const r = await fetch(`${API_BASE}/api/channels`)
    if (!r.ok) return []
    const d = await r.json()
    return d.channels || []
  } catch { return [] }
}

export async function saveChannelConfig(channel: string, config: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', channel, config }),
    })
    return (await r.json()).status === 'success'
  } catch { return false }
}

export async function connectChannel(channel: string, config: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'connect', channel, config }),
    })
    return (await r.json()).status === 'success'
  } catch { return false }
}

export async function disconnectChannel(channel: string): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect', channel }),
    })
    return (await r.json()).status === 'success'
  } catch { return false }
}

// ─── Memory ────────────────────────────────────────────────

export interface MemoryItem {
  name: string
  path: string
  is_dir: boolean
  size?: number
  modified?: string
}

export async function getMemoryList(category = 'memory'): Promise<MemoryItem[]> {
  try {
    const r = await fetch(`${API_BASE}/api/memory?page=1&page_size=50&category=${category}`)
    if (!r.ok) return []
    const d = await r.json()
    const raw = d.list || d.files || d.items || []
    return raw.map((item: any) => ({
      name: item.filename || item.name || '',
      path: item.filename || item.path || '',
      is_dir: false,
      size: item.size,
      modified: item.updated_at || item.modified,
    }))
  } catch { return [] }
}

export async function getMemoryContent(filename: string, category = 'memory'): Promise<string> {
  try {
    const r = await fetch(`${API_BASE}/api/memory/content?filename=${encodeURIComponent(filename)}&category=${category}`)
    if (!r.ok) return ''
    const d = await r.json()
    return d.content || ''
  } catch { return '' }
}

// ─── Scheduler ─────────────────────────────────────────────

export interface TaskInfo {
  id: string
  name?: string
  cron?: string
  enabled?: boolean
  prompt?: string
  last_run?: string
  next_run?: string
}

export async function getSchedulerTasks(): Promise<TaskInfo[]> {
  try {
    const r = await fetch(`${API_BASE}/api/scheduler`)
    if (!r.ok) return []
    const d = await r.json()
    return d.tasks || []
  } catch { return [] }
}

export async function createSchedulerTask(name: string, cron: string, prompt: string): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/scheduler`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name, cron, prompt }),
    })
    return (await r.json()).status === 'success'
  } catch { return false }
}

// ─── Logs ──────────────────────────────────────────────────

export function connectLogStream(onLine: (line: string) => void, onInit: (lines: string) => void): AbortController {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/logs`, { signal: ctrl.signal, headers: { Accept: 'text/event-stream' } })
      if (!r.ok) return
      const reader = r.body?.getReader()
      if (!reader) return
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          const t = line.trim()
          if (!t || !t.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(t.slice(6))
            if (ev.type === 'init') onInit(ev.content || '')
            else if (ev.type === 'line') onLine(ev.content || '')
          } catch { /* skip malformed */ }
        }
      }
    } catch { /* connection closed */ }
  })()
  return ctrl
}
