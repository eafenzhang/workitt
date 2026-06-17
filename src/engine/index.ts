// ─── MinoPencil Engine with Compat Layer ──────────────────────────
// Direct re-exports from MinoPencil packages, plus thin adapters
// that maintain backward compatibility with our DesignStudio API.

import { DesignEngine as MinoDesignEngine } from '@minopencil/pen-engine/core/design-engine'
import { DocumentManager as MinoDocumentManager } from '@minopencil/pen-engine/core/document-manager'
import { HistoryManager as MinoHistoryManager } from '@minopencil/pen-engine/core/history-manager'
import { SelectionManager as MinoSelectionManager } from '@minopencil/pen-engine/core/selection-manager'
import { ViewportController as MinoViewportController } from '@minopencil/pen-engine/core/viewport-controller'
import { TypedEventEmitter } from '@minopencil/pen-engine/core/event-emitter'

import { DesignProvider as MinoDesignProvider } from '@minopencil/pen-react'
import { useDesignEngine as minoUseEngine } from '@minopencil/pen-react'
import { useDocument as minoUseDoc } from '@minopencil/pen-react'
import { useViewport as minoUseViewport } from '@minopencil/pen-react'
import { useActiveTool as minoUseTool } from '@minopencil/pen-react'

import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback,
  type ReactNode,
} from 'react'
import type { PenNode, PenDocument, PenPage, ToolType, ViewportState } from '@minopencil/pen-types'

// ── Types ────────────────────────────────────────────────────────

export type { PenNode, PenDocument, PenPage, ToolType, ViewportState }
export type DesignNode = PenNode

// ── Compat DesignEngine wrapper ──────────────────────────────────

export class DesignEngine {
  private _e: MinoDesignEngine

  constructor(initialDocument?: PenDocument) {
    this._e = new MinoDesignEngine()
    if (initialDocument) this._e.loadDocument(initialDocument)
  }

  // Direct delegations (method name changed)
  get tool(): ToolType { return this._e.getActiveTool() }
  setTool(t: ToolType) { this._e.setActiveTool(t) }

  loadDocument(doc: PenDocument) {
    // Normalize: our format {id, name, pages:[{id,name,children}]} → Mino {version, name, children, pages}
    const normalized: any = { version: '1.0', name: doc.name || 'Untitled', children: [] }
    if ((doc as any).pages && (doc as any).pages.length > 0) {
      normalized.children = (doc as any).pages[0].children || []
      normalized.pages = (doc as any).pages
    } else if (doc.children) {
      normalized.children = doc.children
      normalized.pages = doc.pages
    }
    this._e.loadDocument(normalized)
  }

  getDocument(): any {
    const doc = this._e.getDocument()
    // Denormalize back to our format
    return {
      id: (doc as any).id || 'doc_1',
      name: doc.name || 'Untitled',
      pages: doc.pages || [{ id: 'page_1', name: 'Page 1', children: doc.children || [] }],
      viewport: undefined,
    }
  }

  // addNode: our API (node, parentId?) → Mino (parentId, node)
  addNode(node: PenNode, parentId?: string) {
    this._e.addNode(parentId || null, node)
  }
  createNodeByTool(tool: string, x?: number, y?: number): any {
    const map: Record<string, Partial<PenNode>> = {
      frame: { type: 'frame', width: 320, height: 208, fill: [{ type: 'solid', color: '#f8f9fa' }], cornerRadius: 8 },
      rect: { type: 'rect', width: 128, height: 64, fill: [{ type: 'solid', color: '#6366f1' }], cornerRadius: 8 },
      rectangle: { type: 'rect', width: 128, height: 64, fill: [{ type: 'solid', color: '#6366f1' }], cornerRadius: 8 },
      ellipse: { type: 'ellipse', width: 80, height: 80, fill: [{ type: 'solid', color: '#10b981' }] },
      text: { type: 'text', width: 208, height: 32, content: '文本', fontSize: 16, color: '#333' },
      image: { type: 'image', width: 200, height: 160, cornerRadius: 8 },
      line: { type: 'line', width: 100, height: 0, stroke: { color: '#666', width: 2 } },
    }
    const tmpl = map[tool]
    if (!tmpl) return null
    const node = {
      ...tmpl,
      id: 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2),
      name: (tmpl as any).type || 'Node',
      x: x ?? 40, y: y ?? 40,
      rotation: 0, opacity: 1, visible: true, locked: false,
    } as PenNode
    this._e.addNode(null, node)
    this._e.select([node.id])
    return node
  }

  updateNode(id: string, patch: Partial<PenNode>) { this._e.updateNode(id, patch) }
  removeNode(id: string) { this._e.removeNode(id) }

  removeSelected() {
    const ids = this._e.getSelection()
    for (const id of ids) this._e.removeNode(id)
    this._e.clearSelection()
  }

  moveNode(id: string, dx: number, dy: number) {
    const node = this._e.getNodeById(id)
    if (node) this._e.updateNode(id, { x: (node.x ?? 0) + dx, y: (node.y ?? 0) + dy } as any)
  }

  setNodePosition(id: string, pos: { x?: number; y?: number }) {
    this._e.updateNode(id, pos as any)
  }
  setNodeSize(id: string, size: { width?: number; height?: number }) {
    this._e.updateNode(id, size as any)
  }

  select(ids: string[], activeId?: string | null) {
    this._e.select(ids)
  }
  clearSelection() { this._e.clearSelection() }

  get selectedIds(): string[] { return this._e.getSelection() }
  get activeId(): string | null {
    const s = this._e.getSelection()
    return s.length > 0 ? s[0] : null
  }

  duplicateSelected() {
    const active = this.activeId
    if (!active) return
    const newId = this._e.duplicateNode(active)
    if (newId) this._e.select([newId])
  }

  duplicateNode(id: string): string | null {
    return this._e.duplicateNode(id)
  }

  groupSelected() {
    const ids = this.selectedIds
    if (ids.length < 2) return
    const gid = this._e.groupNodes(ids)
    if (gid) this._e.select([gid])
  }

  ungroupSelected() {
    const active = this.activeId
    if (active) this._e.ungroupNode(active)
  }

  undo() { this._e.undo() }
  redo() { this._e.redo() }
  get canUndo(): boolean { return this._e.canUndo }
  get canRedo(): boolean { return this._e.canRedo }

  // Viewport delegates
  setZoom(z: number, cx?: number, cy?: number) {
    if (cx !== undefined && cy !== undefined) {
      this._e.setViewport(z, this._e.panX, this._e.panY) // simple zoom
    } else {
      this._e.setViewport(z, this._e.panX, this._e.panY)
    }
  }
  pan(dx: number, dy: number) {
    this._e.setViewport(this._e.zoom, this._e.panX + dx, this._e.panY + dy)
  }
  get viewport(): ViewportState {
    return { zoom: this._e.zoom, panX: this._e.panX, panY: this._e.panY }
  }

  // Events — MinoPencil emits spread args, we wrap to payload objects
  on(event: string, cb: (payload: any) => void): () => void {
    return (this._e as any).on(event, (...args: any[]) => {
      // MinoPencil passes data directly, we wrap as {eventName: data}
      // Adapt based on event type
      if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
        cb(args[0]) // It's already an object (e.g., ViewportState)
      } else {
        cb(args[0])
      }
    })
  }
  off(event: string, cb: any) { (this._e as any).off(event, cb) }

  // Events proxy for code that uses .events.on()
  events = {
    _engine: this._e,
    on: (event: string, cb: (payload: any) => void) => this.on(event, cb),
    emit: (event: string, payload: any) => { (this._e as any).emit(event, payload) },
    clear: () => { try { (this._e as any).dispose?.() } catch {} },
  }

  // Direct access to document manager methods (compat)
  documentManager = {
    _engine: this._e,
    get document() { return this._engine._e.getDocument() },
    findNodeById(_page: any, id: string): any | null {
      return this._engine._e.getNodeById(id) || null
    },
    getFlatNodes(_page: any): any[] {
      const doc = this._engine._e.getDocument()
      const allChildren = doc.children || (doc.pages?.[0]?.children) || []
      const result: any[] = []
      const walk = (nodes: any[]) => {
        for (const n of nodes) { result.push(n); if (n.children) walk(n.children) }
      }
      walk(allChildren)
      return result
    },
    duplicateNode(id: string): string | null { return this._engine._e.duplicateNode(id) },
    removeNode(id: string) { this._engine._e.removeNode(id) },
    _getChildren() { const d=this._engine._e.getDocument(); return d.children || d.pages?.[0]?.children || []; },
    moveNodeUp(id: string) {
      const children = this._getChildren()
      const idx = children.findIndex((n: any) => n.id === id)
      if (idx > 0) { [children[idx - 1], children[idx]] = [children[idx], children[idx - 1]] }
    },
    moveNodeDown(id: string) {
      const children = this._getChildren()
      const idx = children.findIndex((n: any) => n.id === id)
      if (idx >= 0 && idx < children.length - 1) { [children[idx], children[idx + 1]] = [children[idx + 1], children[idx]] }
    },
    moveNodeToTop(id: string) {
      const children = this._getChildren()
      const idx = children.findIndex((n: any) => n.id === id)
      if (idx >= 0) { const [n] = children.splice(idx, 1); children.push(n) }
    },
    moveNodeToBottom(id: string) {
      const children = this._getChildren()
      const idx = children.findIndex((n: any) => n.id === id)
      if (idx >= 0) { const [n] = children.splice(idx, 1); children.unshift(n) }
    },
    alignNodes(ids: string[], dir: string) {
      const nodes = ids.map(id => this._engine._e.getNodeById(id)).filter(Boolean) as PenNode[]
      if (nodes.length < 2) return
      const l = Math.min(...nodes.map(n => n.x ?? 0))
      const t = Math.min(...nodes.map(n => n.y ?? 0))
      const r = Math.max(...nodes.map(n => (n.x ?? 0) + ((n as any).width ?? 0)))
      const b = Math.max(...nodes.map(n => (n.y ?? 0) + ((n as any).height ?? 0)))
      const cx = (l + r) / 2; const cy = (t + b) / 2
      for (const n of nodes) {
        switch (dir) {
          case 'left': this._engine._e.updateNode(n.id, { x: l } as any); break
          case 'right': this._engine._e.updateNode(n.id, { x: r - ((n as any).width ?? 0) } as any); break
          case 'center-h': this._engine._e.updateNode(n.id, { x: cx - ((n as any).width ?? 0) / 2 } as any); break
          case 'top': this._engine._e.updateNode(n.id, { y: t } as any); break
          case 'bottom': this._engine._e.updateNode(n.id, { y: b - ((n as any).height ?? 0) } as any); break
          case 'center-v': this._engine._e.updateNode(n.id, { y: cy - ((n as any).height ?? 0) / 2 } as any); break
        }
      }
    },
    groupNodes(ids: string[]): string | null { return this._engine._e.groupNodes(ids) },
    ungroupNode(id: string) { this._engine._e.ungroupNode(id) },
    loadFromJson(json: string) { try { this._engine._e.loadDocument(JSON.parse(json)) } catch {} },
    getDocumentJson(): string { return JSON.stringify(this._engine._e.getDocument()) },
  } as any

  // Lifecycle
  dispose() { (this._e as any).dispose?.() }
  on(event: string, cb: any) { return (this._e as any).on(event, cb) }
  off(event: string, cb: any) { (this._e as any).off(event, cb) }
}

// ── Compat React layer ───────────────────────────────────────────

const DesignEngineContext = createContext<DesignEngine | null>(null)

export function useDesignEngine(): DesignEngine {
  const ctx = useContext(DesignEngineContext)
  if (!ctx) throw new Error('useDesignEngine must be used within a DesignProvider')
  return ctx
}

export function DesignProvider({ children, initialDocument, onDocumentChange }: {
  children: ReactNode; initialDocument?: PenDocument; onDocumentChange?: (doc: PenDocument) => void
}) {
  const engineRef = useRef<DesignEngine | null>(null)
  if (!engineRef.current) engineRef.current = new DesignEngine(initialDocument)
  const engine = engineRef.current

  useEffect(() => {
    if (!onDocumentChange) return
    return engine.on('document:change', () => onDocumentChange(engine.getDocument()))
  }, [engine, onDocumentChange])

  useEffect(() => () => { engine.dispose(); engineRef.current = null }, [engine])

  return React.createElement(DesignEngineContext.Provider, { value: engine }, children)
}

// Compat hooks — match our old API, adapt to MinoPencil's raw event args
export function useDocument(): any {
  const engine = useDesignEngine()
  const [doc, setDoc] = useState(() => engine.getDocument())
  useEffect(() => engine.on('document:change', (d: any) => {
    // MinoPencil passes document directly (not {document: doc})
    setDoc(engine.getDocument())
  }), [engine])
  return doc
}

export function useSelection(): { selectedIds: string[]; activeId: string | null } {
  const engine = useDesignEngine()
  const [sel, setSel] = useState(() => ({ selectedIds: engine.selectedIds, activeId: engine.activeId }))
  useEffect(() => engine.on('selection:change', () => {
    setSel({ selectedIds: engine.selectedIds, activeId: engine.activeId })
  }), [engine])
  return sel
}

export function useHistory(): { canUndo: boolean; canRedo: boolean } {
  const engine = useDesignEngine()
  const [s, setS] = useState(() => ({ canUndo: engine.canUndo, canRedo: engine.canRedo }))
  useEffect(() => engine.on('history:change', () => {
    setS({ canUndo: engine.canUndo, canRedo: engine.canRedo })
  }), [engine])
  return s
}

export function useViewport() {
  const engine = useDesignEngine()
  const [v, setV] = useState(() => engine.viewport)
  useEffect(() => engine.on('viewport:change', () => {
    setV(engine.viewport)
  }), [engine])
  return v
}

export function useActiveTool(): [any, (t: any) => void] {
  const engine = useDesignEngine()
  const [t, setT] = useState(() => engine.tool)
  useEffect(() => engine.on('tool:change', () => {
    setT(engine.tool)
  }), [engine])
  return [t, (tool: any) => engine.setTool(tool)]
}

export function useActiveNode(): any {
  const engine = useDesignEngine()
  const doc = useDocument()
  const activeId = engine.activeId
  if (!activeId) return null
  return engine.documentManager.findNodeById(doc.pages?.[0] || doc, activeId)
}

export function useHover(): string | null {
  const engine = useDesignEngine()
  const [h, setH] = useState<string | null>(null)
  useEffect(() => engine.on('node:hover', (nodeId: any) => setH(nodeId)), [engine])
  return h
}

export function useActivePage() {
  const doc = useDocument()
  return doc.pages?.[0] || doc
}

// ── Re-exports ───────────────────────────────────────────────────
export { TypedEventEmitter } from '@minopencil/pen-engine/core/event-emitter'
export type { PenFill, PenStroke, PenEffect, PenNodeBase } from '@minopencil/pen-types'
