// ─── ResizablePanel — Draggable side panel with min-width ──────────

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'

interface Props {
  children: ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  side: 'left' | 'right'
  className?: string
}

export default function ResizablePanel({
  children,
  defaultWidth = 280,
  minWidth = 200,
  maxWidth = 480,
  side,
  className = '',
}: Props) {
  const [width, setWidth] = useState(defaultWidth)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startW.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - startX.current
      const newW = side === 'left'
        ? Math.max(minWidth, Math.min(maxWidth, startW.current + dx))
        : Math.max(minWidth, Math.min(maxWidth, startW.current - dx))
      setWidth(newW)
    }
    const handleUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [side, minWidth, maxWidth])

  const isLeft = side === 'left'
  const handleStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    [isLeft ? 'right' : 'left']: 0,
    width: '4px',
    height: '100%',
    cursor: 'col-resize',
    zIndex: 10,
  }

  return (
    <div
      className={`flex-shrink-0 relative overflow-y-auto bg-card ${className}`}
      style={{ width }}
    >
      {children}
      {/* Drag handle */}
      <div
        style={handleStyle}
        onMouseDown={handleMouseDown}
        className="hover:bg-primary/20 active:bg-primary/40 transition-colors"
      />
    </div>
  )
}
