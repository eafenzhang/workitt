// ─── useCanvasShortcuts — Keyboard shortcuts for MinoCanvas ───────
// Tool switching: V(select) R(rect) O(ellipse) Y(polygon) T(text) F(frame) H(hand)
// Edit: Delete/Backspace(del) Cmd+C(copy) Cmd+V(paste) Cmd+D(duplicate) Cmd+G(group)
// History: Cmd+Z(undo) Cmd+Shift+Z(redo)
// Arrow keys: nudge 1px, Shift+Arrow = 10px

import { useEffect, useRef } from 'react'
import type { DesignEngine } from '@minopencil/pen-engine'

const TOOL_KEYS: Record<string, string> = {
  v: 'select', r: 'rectangle', o: 'ellipse', y: 'polygon',
  t: 'text', f: 'frame', h: 'hand', p: 'path',
}

export function useCanvasShortcuts(
  engine: DesignEngine | null,
  selIds: string[],
) {
  const clipRef = useRef<any[]>([])

  useEffect(() => {
    if (!engine) return
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const mod = e.ctrlKey || e.metaKey

      // Tool switching (no modifier)
      if (!mod && !e.shiftKey) {
        const tool = TOOL_KEYS[e.key.toLowerCase()]
        if (tool) {
          e.preventDefault()
          engine.setActiveTool(tool as any)
          return
        }
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        for (const id of selIds) engine.removeNode(id)
        engine.clearSelection()
        return
      }

      // Escape
      if (e.key === 'Escape') {
        engine.clearSelection()
        engine.setActiveTool('select')
        return
      }

      // Modifier shortcuts
      if (mod) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) engine.redo()
            else engine.undo()
            return
          case 'a':
            e.preventDefault()
            const doc = engine.getDocument()
            const all = (doc as any).children?.map((n: any) => n.id) || []
            if (all.length) engine.select(all)
            return
          case 'c':
            e.preventDefault()
            clipRef.current = selIds.map(id => {
              const n = engine.getNodeById(id)
              return n ? JSON.parse(JSON.stringify(n)) : null
            }).filter(Boolean)
            return
          case 'v':
            e.preventDefault()
            for (const n of clipRef.current) {
              const c = { ...n, id: genId(), x: n.x + 20, y: n.y + 20 }
              engine.addNode(null, c as any)
            }
            return
          case 'd':
            e.preventDefault()
            if (selIds.length > 0) {
              for (const id of selIds) {
                const n = engine.getNodeById(id)
                if (n) {
                  const c = { ...JSON.parse(JSON.stringify(n)), id: genId(), x: (n as any).x + 20, y: (n as any).y + 20 }
                  engine.addNode(null, c as any)
                }
              }
            }
            return
          case 'g':
            e.preventDefault()
            if (selIds.length >= 2) {
              const g = (engine as any).groupNodes?.(selIds)
              if (g) engine.select([g])
            }
            return
        }
        return
      }

      // Arrow keys: nudge
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (selIds.length === 0) return
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        for (const id of selIds) {
          const n = engine.getNodeById(id) as any
          if (!n) continue
          switch (e.key) {
            case 'ArrowUp': engine.updateNode(id, { y: n.y - step } as any); break
            case 'ArrowDown': engine.updateNode(id, { y: n.y + step } as any); break
            case 'ArrowLeft': engine.updateNode(id, { x: n.x - step } as any); break
            case 'ArrowRight': engine.updateNode(id, { x: n.x + step } as any); break
          }
        }
      }
    }

    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [engine, selIds])
}

function genId() {
  return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2)
}
