// ─── React Context + Provider + Hooks ─────────────────────────────
// Ported from MinoPencil pen-react

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { DesignEngine } from './design-engine'
import type { PenDocument, DesignNode, ToolType } from './types'

// ── Context ──

const DesignEngineContext = createContext<DesignEngine | null>(null)

export function useDesignEngine(): DesignEngine {
  const ctx = useContext(DesignEngineContext)
  if (!ctx) throw new Error('useDesignEngine must be used within a DesignProvider')
  return ctx
}

// ── Provider ──

interface DesignProviderProps {
  children: ReactNode
  initialDocument?: PenDocument
  onDocumentChange?: (doc: PenDocument) => void
}

export function DesignProvider({ children, initialDocument, onDocumentChange }: DesignProviderProps) {
  const engineRef = useRef<DesignEngine | null>(null)
  const [, forceUpdate] = useState(0)

  if (!engineRef.current) {
    engineRef.current = new DesignEngine(initialDocument)
  }

  const engine = engineRef.current

  useEffect(() => {
    if (!onDocumentChange) return
    const unsub = engine.events.on('document:change', ({ document }) => {
      onDocumentChange(document)
    })
    return unsub
  }, [engine, onDocumentChange])

  useEffect(() => {
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [engine])

  return (
    <DesignEngineContext.Provider value={engine}>
      {children}
    </DesignEngineContext.Provider>
  )
}

// ── Hooks ──

export function useDocument(): PenDocument {
  const engine = useDesignEngine()
  const [doc, setDoc] = useState(() => engine.getDocument())

  useEffect(() => {
    return engine.events.on('document:change', ({ document }) => {
      setDoc({ ...document })
    })
  }, [engine])

  return doc
}

export function useActivePage() {
  const engine = useDesignEngine()
  const doc = useDocument()
  return doc.pages[0] || doc.pages[0]
}

export function useActiveNode(): DesignNode | null {
  const engine = useDesignEngine()
  const doc = useDocument()
  const activeId = engine.activeId
  if (!activeId) return null

  const walk = (nodes: DesignNode[]): DesignNode | null => {
    for (const n of nodes) {
      if (n.id === activeId) return n
      if ('children' in n && n.children) {
        const found = walk(n.children)
        if (found) return found
      }
    }
    return null
  }
  return walk(doc.pages[0]?.children || [])
}

export function useSelection(): { selectedIds: string[]; activeId: string | null } {
  const engine = useDesignEngine()
  const [sel, setSel] = useState(() => ({
    selectedIds: engine.selectedIds,
    activeId: engine.activeId,
  }))

  useEffect(() => {
    return engine.events.on('selection:change', ({ selection }) => {
      setSel({ selectedIds: selection.selectedIds, activeId: selection.activeId })
    })
  }, [engine])

  return sel
}

export function useHistory(): { canUndo: boolean; canRedo: boolean } {
  const engine = useDesignEngine()
  const [state, setState] = useState(() => ({ canUndo: engine.canUndo, canRedo: engine.canRedo }))

  useEffect(() => {
    return engine.events.on('history:change', ({ canUndo, canRedo }) => {
      setState({ canUndo, canRedo })
    })
  }, [engine])

  return state
}

export function useViewport() {
  const engine = useDesignEngine()
  const [vp, setVp] = useState(() => engine.viewport)

  useEffect(() => {
    return engine.events.on('viewport:change', ({ viewport }) => {
      setVp({ ...viewport })
    })
  }, [engine])

  return vp
}

export function useActiveTool(): [ToolType, (t: ToolType) => void] {
  const engine = useDesignEngine()
  const [tool, setTool] = useState(() => engine.tool)

  useEffect(() => {
    return engine.events.on('tool:change', ({ tool: t }) => {
      setTool(t)
    })
  }, [engine])

  const set = useCallback((t: ToolType) => engine.setTool(t), [engine])
  return [tool, set]
}

export function useHover(): string | null {
  const engine = useDesignEngine()
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    return engine.events.on('node:hover', ({ nodeId }) => setHovered(nodeId))
  }, [engine])

  return hovered
}

export function useEngineReady(): boolean {
  return true
}
