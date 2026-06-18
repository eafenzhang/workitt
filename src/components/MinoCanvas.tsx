// ─── MinoCanvas — MinoPencil engine + Skia rendering ──────────────
// Layout matches original MinoPencil editor:
//   TopBar + [LayerPanel | Canvas(floating toolbar) | RightPanel]

import { useEffect, useState, useRef, useCallback } from 'react'
import { XIcon, SaveIcon, UploadIcon, MessageCircleIcon, PanelLeftIcon } from 'lucide-react'
import {
  DesignProvider,
  useDesignEngine,
  DesignCanvas,
  LayerPanel,
  PropertyPanel,
  StatusBar,
  BooleanToolbar,
} from '@minopencil/pen-react'
import HorizontalToolbar from './HorizontalToolbar'
import CanvasAiChat from './CanvasAiChat'
import CanvasCodePanel from './CanvasCodePanel'
import { useCanvasShortcuts } from './useCanvasShortcuts'
import { toast } from 'sonner'
import { apiFetch, API } from '../api'
import type { PenDocument } from '@minopencil/pen-types'

const openDocIds = new Set<number>()

function genId() { return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) }

function exportAsSVG(nodes: any[]): string {
  const parts: string[] = []
  const walk = (n: any) => {
    const f = Array.isArray(n.fill) ? n.fill[0]?.color : n.fill
    const s = `fill:${f || 'none'};opacity:${n.opacity ?? 1}`
    switch (n.type) {
      case 'rect': case 'rectangle': parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${n.cornerRadius||0}" style="${s}"/>`); break
      case 'ellipse': parts.push(`<ellipse cx="${n.x+n.width/2}" cy="${n.y+n.height/2}" rx="${n.width/2}" ry="${n.height/2}" style="${s}"/>`); break
      case 'text': parts.push(`<text x="${n.x}" y="${n.y+(n.fontSize||16)}" font-size="${n.fontSize||14}" fill="${n.color||'#333'}">${n.content||''}</text>`); break
      case 'frame': parts.push(`<g transform="translate(${n.x},${n.y})">`); n.children?.forEach(walk); parts.push('</g>'); break
    }
  }
  nodes.forEach(walk)
  return `<svg xmlns="http://www.w3.org/2000/svg">\n${parts.join('\n')}\n</svg>`
}

interface Props { docId?: number; initialDoc?: any; onClose: () => void }

export default function MinoCanvas({ docId, initialDoc, onClose }: Props) {
  return (
    <DesignProvider>
      <CanvasInner docId={docId} initialDoc={initialDoc} onClose={onClose} />
    </DesignProvider>
  )
}

function CanvasInner({ docId, initialDoc, onClose }: any) {
  const engine = useDesignEngine()
  const isNew = !docId
  const initRef = useRef(false)
  const fileInp = useRef<HTMLInputElement>(null)
  const docIdNum = docId ? Number(docId) : 0
  const isSaving = useRef(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [title, setTitle] = useState(initialDoc?.title || '')
  const [saving, setSaving] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [layerOpen, setLayerOpen] = useState(true)
  const [rightTab, setRightTab] = useState('props')
  const [selIds, setSelIds] = useState<string[]>([])
  const [, forceUpdate] = useState(0)

  // Prevent duplicate tabs
  useEffect(() => {
    if (docIdNum > 0) {
      if (openDocIds.has(docIdNum)) { toast.warning('该设计稿已在其他窗口打开'); onClose?.(); return }
      openDocIds.add(docIdNum)
    }
    return () => { if (docIdNum > 0) openDocIds.delete(docIdNum) }
  }, [docIdNum])

  // Load document
  useEffect(() => {
    if (initRef.current) return; initRef.current = true
    if (initialDoc?.content) {
      try { const p = JSON.parse(initialDoc.content); engine.loadDocument({ version: '1.0', name: initialDoc.title || '未命名', children: p.children || p.elements || [] } as PenDocument) }
      catch { engine.loadDocument({ version: '1.0', name: '未命名', children: [] } as PenDocument) }
    } else { engine.loadDocument({ version: '1.0', name: '新建画板', children: [] } as PenDocument) }
  }, [engine])

  // Re-render on doc changes
  useEffect(() => { const unsub = engine.on('document:change', () => forceUpdate(v => v + 1)); return () => unsub?.() }, [engine])
  // Selection sync
  useEffect(() => { const unsub = engine.on('selection:change', () => setSelIds(engine.getSelection())); return () => unsub?.() }, [engine])
  // Auto-save
  useEffect(() => {
    const unsub = engine.on('document:change', () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => save(true), 3000)
    })
    return () => { unsub?.(); if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [engine])

  useCanvasShortcuts(engine, selIds)

  const doc = engine.getDocument()
  const nodes: any[] = (doc as any).children || []

  const save = async (auto = false) => {
    if (isSaving.current) return; isSaving.current = true
    if (!auto) setSaving(true)
    try {
      const d = engine.getDocument(); const children = (d as any).children || []
      const data: any = { title: title || '未命名画板', category: '设计稿-原型', content: JSON.stringify({ version: '1.0', viewport: { width: 1024, height: 768 }, children }) }
      if (!docId) {
        Object.assign(data, { type: 'OP', size: '1KB', date: new Date().toISOString().split('T')[0], tags: ['设计稿'], featured: false })
        const r = await apiFetch(API.documents, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); await r.json()
      } else { await apiFetch(API.documentsById(docId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) }
      if (!auto) toast.success('已保存')
    } catch { if (!auto) toast.error('保存失败') }
    isSaving.current = false; if (!auto) setSaving(false)
  }

  const exportPNG = useCallback(() => {
    const cvs = document.querySelector('canvas'); if (!cvs) return
    try { const link = document.createElement('a'); link.download = (title||'设计稿')+'.png'; link.href = cvs.toDataURL('image/png'); link.click(); toast.success('PNG 已导出') }
    catch { toast.error('导出失败') }
  }, [title])

  const gridBg = `repeating-linear-gradient(0deg, transparent, transparent 19px, var(--border) 19px, var(--border) 20px),
                  repeating-linear-gradient(90deg, transparent, transparent 19px, var(--border) 19px, var(--border) 20px)`

  return (
    <div className="flex flex-col h-full bg-background">
      {/* TopBar with centered toolbar */}
      <div className="flex items-center h-11 px-3 border-b border-border bg-card flex-shrink-0 gap-2">
        <button onClick={() => setLayerOpen(o => !o)} className="p-1.5 rounded hover:bg-muted" title="切换图层面板">
          <PanelLeftIcon size={16} className="text-muted-foreground" />
        </button>
        <input className="text-sm font-medium bg-transparent outline-none w-32 text-foreground flex-shrink-0" value={title} onChange={e => setTitle(e.target.value)} placeholder="未命名" />
        <div className="flex-1 flex justify-center">
          <HorizontalToolbar />
        </div>
        <button onClick={exportPNG} className="text-xs px-2 py-1 rounded text-muted-foreground hover:bg-muted border border-border">PNG</button>
        <button onClick={() => { navigator.clipboard.writeText(exportAsSVG(nodes)); toast.success('SVG 已复制') }} className="text-xs px-2 py-1 rounded text-muted-foreground hover:bg-muted border border-border">SVG</button>
        <button onClick={onClose} className="text-xs px-2 py-1 rounded text-muted-foreground hover:bg-muted border border-border">关闭</button>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Layer panel (toggleable) */}
        {layerOpen && (
          <div className="w-60 flex-shrink-0 border-r border-border bg-card">
            <LayerPanel />
          </div>
        )}

        {/* Canvas area */}
        <div className="flex-1 flex flex-col min-w-0 relative bg-muted/30">
          <div className="absolute left-3 top-3 z-20">
            <BooleanToolbar />
          </div>
          <div className="flex-1 relative" style={{ background: gridBg }}>
            <DesignCanvas className="w-full h-full" loadingFallback={
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
                <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">加载 Skia 画布引擎...</span>
              </div>
            } />
          </div>
          <div className="absolute bottom-4 right-4 z-20"><StatusBar /></div>
          <div className="absolute bottom-4 left-4 z-30 flex flex-col items-start gap-2">
            {!aiPanelOpen ? (
              <button onClick={() => setAiPanelOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-md border border-border bg-card text-foreground hover:bg-accent/40 transition-colors text-xs">
                <MessageCircleIcon size={14} /> AI 对话
              </button>
            ) : (
              <CanvasAiChat onClose={() => setAiPanelOpen(false)} onToolAction={(a, n) => {
                if (a === 'insert_node' && n?.type) {
                  let fill = n.fill; if (typeof fill === 'string') fill = [{ type: 'solid', color: fill }]
                  else if (!fill && n.type !== 'text' && n.type !== 'frame') fill = [{ type: 'solid', color: '#6366f1' }]
                  engine.addNode(n._parent === null ? null : (n._parent || undefined), { id: n.id || genId(), type: n.type, name: n.name || n.type, x: n.x ?? 100, y: n.y ?? 100, width: n.width ?? 150, height: n.height ?? 100, fill, color: n.color, content: n.content, fontSize: n.fontSize, rotation: n.rotation ?? 0, opacity: n.opacity ?? 1, visible: n.visible ?? true, locked: n.locked ?? false, cornerRadius: n.cornerRadius } as any)
                }
              }} />
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-64 flex-shrink-0 border-l border-border bg-card overflow-y-auto">
          <div className="flex border-b border-border">
            {[{ k: 'props', l: '属性' }, { k: 'code', l: '代码' }].map(t => (
              <button key={t.k} onClick={() => setRightTab(t.k)} className="flex-1 py-2 text-xs font-medium transition-colors" style={{ color: rightTab === t.k ? 'var(--foreground)' : 'var(--muted-foreground)', borderBottom: rightTab === t.k ? '2px solid var(--foreground)' : '2px solid transparent' }}>{t.l}</button>
            ))}
          </div>
          {rightTab === 'props' ? <PropertyPanel /> : <CanvasCodePanel nodes={nodes} />}
        </div>
      </div>
    </div>
  )
}
