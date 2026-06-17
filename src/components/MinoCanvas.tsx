// ─── MinoCanvas — MinoPencil engine + Skia rendering ──────────────
// Uses original MinoPencil UI components with optimized layout:
//   - Horizontal expanded toolbar (top center, clean style)
//   - Left: LayerPanel (always visible, wider)
//   - Center: DesignCanvas with grid background + BooleanToolbar + StatusBar
//   - Right: PropertyPanel (fixed, wider)
//   - Top bar: close, title, save
//   - Bottom: floating AI chat button

import { useEffect, useState, useRef } from 'react'
import { XIcon, SaveIcon, UploadIcon, MessageCircleIcon } from 'lucide-react'
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
import ResizablePanel from './ResizablePanel'
import CanvasCodePanel from './CanvasCodePanel'
import { useCanvasShortcuts } from './useCanvasShortcuts'
import { toast } from 'sonner'
import { apiFetch, API } from '../api'
import type { PenDocument } from '@minopencil/pen-types'

// ── Track open docs to prevent duplicate tabs ──────────────
const openDocIds = new Set<number>()

// ── SVG export ────────────────────────────────────────────
function exportAsSVG(nodes: any[]): string {
  const parts: string[] = []
  const walk = (n: any) => {
    const f = Array.isArray(n.fill) ? n.fill[0]?.color : n.fill
    const s = `fill:${f || 'none'};opacity:${n.opacity ?? 1}`
    switch (n.type) {
      case 'rect': case 'rectangle':
        parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${n.cornerRadius || 0}" style="${s}"/>`); break
      case 'ellipse':
        parts.push(`<ellipse cx="${n.x + n.width / 2}" cy="${n.y + n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}" style="${s}"/>`); break
      case 'text':
        parts.push(`<text x="${n.x}" y="${n.y + (n.fontSize || 16)}" font-size="${n.fontSize || 14}" fill="${n.color || '#333'}">${n.content || ''}</text>`); break
      case 'frame':
        parts.push(`<g transform="translate(${n.x},${n.y})">`); n.children?.forEach(walk); parts.push('</g>'); break
    }
  }
  nodes.forEach(walk)
  return `<svg xmlns="http://www.w3.org/2000/svg">\n${parts.join('\n')}\n</svg>`
}

// ── Props ─────────────────────────────────────────────────
interface Props { docId?: number; initialDoc?: any; onClose: () => void }

// ── Main ──────────────────────────────────────────────────
export default function MinoCanvas({ docId, initialDoc, onClose }: Props) {
  return (
    <DesignProvider>
      <CanvasInner docId={docId} initialDoc={initialDoc} onClose={onClose} />
    </DesignProvider>
  )
}

// ── Inner ─────────────────────────────────────────────────
function CanvasInner({ docId, initialDoc, onClose }: any) {
  const engine = useDesignEngine()
  const isNew = !docId
  const initRef = useRef(false)
  const fileInp = useRef<HTMLInputElement>(null)
  const docIdNum = docId ? Number(docId) : 0

  // Prevent duplicate tabs
  useEffect(() => {
    if (docIdNum > 0) {
      if (openDocIds.has(docIdNum)) {
        toast.warning('该设计稿已在其他窗口打开')
        onClose?.()
        return
      }
      openDocIds.add(docIdNum)
    }
    return () => {
      if (docIdNum > 0) openDocIds.delete(docIdNum)
    }
  }, [docIdNum])

  // Load document
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    if (initialDoc?.content) {
      try {
        const p = JSON.parse(initialDoc.content)
        const children = p.children || p.elements || []
        engine.loadDocument({ version: '1.0', name: initialDoc.title || '未命名', children } as PenDocument)
      } catch {
        engine.loadDocument({ version: '1.0', name: '未命名', children: [] } as PenDocument)
      }
    } else {
      engine.loadDocument({ version: '1.0', name: '新建画板', children: [] } as PenDocument)
    }
  }, [engine])

  // State
  const [title, setTitle] = useState(initialDoc?.title || '')
  const [saving, setSaving] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [rightTab, setRightTab] = useState('props')
  const [docVersion, setDocVersion] = useState(0) // trigger re-render on doc changes
  const isSaving = useRef(false) // prevent concurrent saves
  const doc = engine.getDocument()
  const nodes: any[] = (doc as any).children || []
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docIdRef = useRef(docId || null)
  const [selIds, setSelIds] = useState<string[]>([])

  // Sync selection from engine
  useEffect(() => {
    const unsub = engine.on('selection:change', () => {
      setSelIds(engine.getSelection())
    })
    return () => unsub?.()
  }, [engine])

  // Keyboard shortcuts
  useCanvasShortcuts(engine, selIds)

  // Re-render on document changes
  useEffect(() => {
    const unsub = engine.on('document:change', () => setDocVersion(v => v + 1))
    return () => unsub?.()
  }, [engine])

  // Auto-save: trigger on document changes
  useEffect(() => {
    const unsub = engine.on('document:change', () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => save(true), 3000)
    })
    return () => { unsub?.(); if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [engine])

  // Save
  const save = async (auto = false) => {
    if (isSaving.current && auto) return // skip concurrent auto-save
    if (isSaving.current) return // skip if already saving
    isSaving.current = true
    if (!auto) setSaving(true)
    try {
      const d = engine.getDocument()
      const children = (d as any).children || []
      const data: any = {
        title: title || '未命名画板',
        category: '设计稿-原型',
        content: JSON.stringify({ version: '1.0', viewport: { width: 1024, height: 768 }, children }),
      }
      if (!docIdRef.current) {
        Object.assign(data, { type: 'OP', size: '1KB', date: new Date().toISOString().split('T')[0], tags: ['设计稿'], featured: false })
        const r = await apiFetch(API.documents, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        const res = await r.json()
        if (res?.success && res?.id) docIdRef.current = res.id
      } else {
        await apiFetch(API.documentsById(docIdRef.current), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      }
      if (!auto) toast.success('已保存')
    } catch { if (!auto) toast.error('保存失败') }
    isSaving.current = false
    if (!auto) setSaving(false)
  }

  // Image import
  const triggerImageImport = () => fileInp.current?.click()
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = ev => {
      const id = 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2)
      engine.addNode(null, {
        id, type: 'image', name: '图片', x: 100, y: 100, width: 200, height: 150,
        rotation: 0, opacity: 1, visible: true, locked: false,
        src: ev.target?.result as string, cornerRadius: 8,
      } as any)
    }
    r.readAsDataURL(f)
    e.target.value = ''
  }

  // ── Inline text editing ──
  const [editingText, setEditingText] = useState<{ nodeId: string; content: string; x: number; y: number } | null>(null)
  const textOverlayRef = useRef<HTMLTextAreaElement>(null)

  // Start editing a text node
  const startTextEdit = useCallback((nodeId: string) => {
    const node = engine.getNodeById(nodeId) as any
    if (!node || node.type !== 'text') return
    setEditingText({ nodeId, content: node.content || '', x: node.x + 50, y: node.y + 50 })
    setTimeout(() => textOverlayRef.current?.focus(), 50)
  }, [engine])

  // Commit text edit
  const commitTextEdit = useCallback(() => {
    if (editingText) {
      engine.updateNode(editingText.nodeId, { content: editingText.content } as any)
      setEditingText(null)
    }
  }, [editingText, engine])

  // ── Export PNG ──
  const exportPNG = useCallback(() => {
    const cvs = document.querySelector('canvas')
    if (!cvs) return
    try {
      const dataUrl = cvs.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = (title || '设计稿') + '.png'
      link.href = dataUrl
      link.click()
      toast.success('PNG 已导出')
    } catch { toast.error('导出失败') }
  }, [title])

  // Canvas grid background
  const gridBg = `repeating-linear-gradient(0deg, transparent, transparent 19px, var(--border) 19px, var(--border) 20px),
                  repeating-linear-gradient(90deg, transparent, transparent 19px, var(--border) 19px, var(--border) 20px)`

  // ── Render ──
  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Top bar: title, center toolbar, save */}
      <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0 border-b border-border">
        {/* Left: close + title */}
        <div className="flex items-center gap-2 w-64 flex-shrink-0">
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" title="关闭">
            <XIcon size={15} className="text-muted-foreground" />
          </button>
          <input
            className="text-sm font-semibold bg-transparent outline-none w-48 text-foreground"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="未命名画板"
          />
        </div>

        {/* Center: toolbar */}
        <div className="flex-1 flex justify-center">
          <HorizontalToolbar
            trailing={
              <>
                <input type="file" ref={fileInp} accept="image/*" className="hidden" onChange={handleImageFile} />
                <button
                  onClick={triggerImageImport}
                  className="toolbar-btn"
                  aria-label="导入图片"
                  title="导入图片"
                >
                  <UploadIcon size={15} />
                </button>
              </>
            }
          />
        </div>

        {/* Right: export + save */}
        <div className="w-64 flex-shrink-0 flex items-center gap-2 justify-end">
          <button onClick={exportPNG}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors border border-border">
            PNG
          </button>
          <button onClick={() => { navigator.clipboard.writeText(exportAsSVG(nodes)); toast.success('SVG 已复制') }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors border border-border">
            SVG
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            <SaveIcon size={11} />{saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* Main: LayerPanel | Canvas | PropertyPanel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Layer panel (left) — resizable */}
        <ResizablePanel side="left" defaultWidth={280} minWidth={200} maxWidth={480}>
          <LayerPanel />
        </ResizablePanel>

        {/* Canvas area */}
        <div className="flex-1 flex flex-col min-w-0 relative bg-muted/30">
          {/* BooleanToolbar overlay */}
          <div className="absolute left-3 top-3 z-20">
            <BooleanToolbar />
          </div>

          {/* Skia canvas with grid background */}
          <div className="flex-1 relative" style={{ background: gridBg }}>
            <DesignCanvas
              className="w-full h-full"
              loadingFallback={
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
                  <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-muted-foreground">加载 Skia 画布引擎...</span>
                </div>
              }
            />
          </div>

          {/* Inline text editing overlay */}
          {editingText && (
            <textarea
              ref={textOverlayRef}
              autoFocus
              defaultValue={editingText.content}
              onChange={e => setEditingText({ ...editingText, content: e.target.value })}
              onBlur={commitTextEdit}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextEdit() }
                if (e.key === 'Escape') { setEditingText(null) }
                e.stopPropagation()
              }}
              className="absolute z-30 resize-none outline-none rounded"
              style={{
                left: editingText.x, top: editingText.y,
                minWidth: 120, minHeight: 28,
                background: 'var(--background)',
                border: '2px solid var(--ring)',
                color: 'var(--foreground)', fontSize: 14,
                padding: '2px 6px',
                overflow: 'hidden',
              }}
            />
          )}

          {/* AI entry at bottom-left of canvas — hidden when panel is open */}
          {!aiPanelOpen && (
          <div className="absolute bottom-4 left-4 z-30 flex flex-col items-start gap-2">
            <button
              onClick={() => setAiPanelOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-md border border-border bg-card text-foreground hover:bg-accent/40 transition-colors text-xs"
            >
              <MessageCircleIcon size={14} />
              <span>AI 对话</span>
            </button>
          </div>
          )}
          {aiPanelOpen && (
            <div className="absolute bottom-4 left-4 z-30">
              <CanvasAiChat
                onClose={() => setAiPanelOpen(false)}
                onToolAction={(action, node) => {
                  // Real-time streaming JSONL node insertion
                  if (action === 'insert_node' && node?.type) {
                    const id = node.id || 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2)
                    let fill = node.fill
                    if (typeof fill === 'string') fill = [{ type: 'solid', color: fill }]
                    else if (!fill && node.type !== 'text' && node.type !== 'frame') fill = [{ type: 'solid', color: '#6366f1' }]
                    const parentId = node._parent === null ? null : (node._parent || undefined)
                    engine.addNode(parentId, {
                      id,
                      type: node.type,
                      name: node.name || node.type,
                      x: node.x ?? 100,
                      y: node.y ?? 100,
                      width: node.width ?? 150,
                      height: node.height ?? 100,
                      fill,
                      color: node.color,
                      content: node.content,
                      fontSize: node.fontSize,
                      rotation: node.rotation ?? 0,
                      opacity: node.opacity ?? 1,
                      visible: node.visible ?? true,
                      locked: node.locked ?? false,
                      cornerRadius: node.cornerRadius,
                    } as any)
                  }
                }}
              />
            </div>
          )}

          {/* StatusBar at bottom-right of canvas */}
          <div className="absolute bottom-4 right-4 z-20">
            <StatusBar />
          </div>
        </div>

        {/* Right panel (resizable) — properties / code */}
        <ResizablePanel side="right" defaultWidth={280} minWidth={200} maxWidth={480}>
          <div className="flex border-b border-border bg-card">
            {[{ k: 'props', l: '属性' }, { k: 'code', l: '代码' }].map(t => (
              <button key={t.k} onClick={() => setRightTab(t.k as any)}
                className="flex-1 py-2 text-xs font-medium transition-colors"
                style={{
                  color: rightTab === t.k ? 'var(--foreground)' : 'var(--muted-foreground)',
                  borderBottom: rightTab === t.k ? '2px solid var(--foreground)' : '2px solid transparent',
                }}>{t.l}</button>
            ))}
          </div>
          {rightTab === 'props' ? <PropertyPanel /> : <CanvasCodePanel nodes={nodes} />}
        </ResizablePanel>
      </div>
    </div>
  )
}
