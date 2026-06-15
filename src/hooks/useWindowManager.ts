import { useState, useCallback, useEffect, useRef } from 'react';
import { WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT } from '../types/agent-os';

// ── Internal types ───────────────────────────────────────────────

interface DragState {
  windowId: string;
  startMouseX: number;
  startMouseY: number;
  startWindowX: number;
  startWindowY: number;
}

interface ResizeState {
  windowId: string;
  edge: ResizeEdge;
  startMouseX: number;
  startMouseY: number;
  startWindowX: number;
  startWindowY: number;
  startWidth: number;
  startHeight: number;
}

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

// ── Temp rect types (absolute coordinates) ───────────────────────

export interface TempDragRect {
  windowId: string;
  x: number;
  y: number;
}

export interface TempResizeRect {
  windowId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Result type ──────────────────────────────────────────────────

export interface UseWindowManagerResult {
  /** Start dragging a window. Pass the window's current x,y from context. */
  startDrag: (windowId: string, windowX: number, windowY: number, e: React.MouseEvent) => void;
  /** Start resizing from an edge/corner. Pass window's current rect. */
  startResize: (
    windowId: string,
    edge: ResizeEdge,
    windowX: number,
    windowY: number,
    windowWidth: number,
    windowHeight: number,
    e: React.MouseEvent,
  ) => void;
  /** Current temp drag rect (absolute), or null */
  tempDragRect: TempDragRect | null;
  /** Current temp resize rect (absolute), or null */
  tempResizeRect: TempResizeRect | null;
  /** Whether a drag is in progress */
  isDragging: boolean;
  /** Whether a resize is in progress */
  isResizing: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────

/**
 * Manages window drag & resize via native DOM events.
 *
 * Maintains temporary absolute-position state for the currently
 * dragged/resized window so the Window component can render
 * optimistically without waiting for context updates.
 *
 * On mouseup the final position/size is synced back to the AgentOS
 * context via the provided callbacks.
 */
export function useWindowManager(
  moveWindow: (id: string, x: number, y: number) => void,
  resizeWindow: (id: string, width: number, height: number, x?: number, y?: number) => void,
): UseWindowManagerResult {
  // ── Refs for internal tracking ──────────────────────────────────

  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const moveWindowRef = useRef(moveWindow);
  const resizeWindowRef = useRef(resizeWindow);
  // ── Latest ref pattern: keep callback refs in sync every render ──
  // eslint-disable-next-line react-hooks/refs
  moveWindowRef.current = moveWindow;
  // eslint-disable-next-line react-hooks/refs
  resizeWindowRef.current = resizeWindow;

  // ── Reactive state for rendering ────────────────────────────────

  const [tempDragRect, setTempDragRect] = useState<TempDragRect | null>(null);
  const [tempResizeRect, setTempResizeRect] = useState<TempResizeRect | null>(null);

  const isDragging = tempDragRect !== null;
  const isResizing = tempResizeRect !== null;

  // ── Start drag ──────────────────────────────────────────────────

  const startDrag = useCallback(
    (windowId: string, windowX: number, windowY: number, e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = {
        windowId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startWindowX: windowX,
        startWindowY: windowY,
      };
      setTempDragRect({ windowId, x: windowX, y: windowY });
    },
    [],
  );

  // ── Start resize ────────────────────────────────────────────────

  const startResize = useCallback(
    (
      windowId: string,
      edge: ResizeEdge,
      windowX: number,
      windowY: number,
      windowWidth: number,
      windowHeight: number,
      e: React.MouseEvent,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        windowId,
        edge,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startWindowX: windowX,
        startWindowY: windowY,
        startWidth: windowWidth,
        startHeight: windowHeight,
      };
      setTempResizeRect({
        windowId,
        x: windowX,
        y: windowY,
        width: windowWidth,
        height: windowHeight,
      });
    },
    [],
  );

  // ── Mouse move (attached to document) ───────────────────────────

  const onMouseMove = useCallback((e: MouseEvent) => {
    // ── Drag ──
    const drag = dragRef.current;
    if (drag) {
      const deltaX = e.clientX - drag.startMouseX;
      const deltaY = e.clientY - drag.startMouseY;
      // Clamp to keep title bar always accessible (min 120px X / 40px Y visible)
      const maxX = Math.max(0, window.innerWidth - 120);
      const maxY = Math.max(0, window.innerHeight - 40);
      setTempDragRect({
        windowId: drag.windowId,
        x: Math.max(0, Math.min(drag.startWindowX + deltaX, maxX)),
        y: Math.max(0, Math.min(drag.startWindowY + deltaY, maxY)),
      });
      return;
    }

    // ── Resize ──
    const resize = resizeRef.current;
    if (resize) {
      const deltaX = e.clientX - resize.startMouseX;
      const deltaY = e.clientY - resize.startMouseY;
      const { edge, startWindowX, startWindowY, startWidth, startHeight } = resize;

      let newX = startWindowX;
      let newY = startWindowY;
      let newW = startWidth;
      let newH = startHeight;

      // Horizontal edges
      if (edge.includes('e')) {
        newW = startWidth + deltaX;
      }
      if (edge.includes('w')) {
        newW = startWidth - deltaX;
        newX = startWindowX + deltaX;
      }

      // Vertical edges
      if (edge.includes('s')) {
        newH = startHeight + deltaY;
      }
      if (edge.includes('n')) {
        newH = startHeight - deltaY;
        newY = startWindowY + deltaY;
      }

      // Clamp minimum dimensions
      if (newW < WINDOW_MIN_WIDTH) {
        if (edge.includes('w')) {
          newX = startWindowX + startWidth - WINDOW_MIN_WIDTH;
        }
        newW = WINDOW_MIN_WIDTH;
      }
      if (newH < WINDOW_MIN_HEIGHT) {
        if (edge.includes('n')) {
          newY = startWindowY + startHeight - WINDOW_MIN_HEIGHT;
        }
        newH = WINDOW_MIN_HEIGHT;
      }

      setTempResizeRect({
        windowId: resize.windowId,
        x: newX,
        y: newY,
        width: newW,
        height: newH,
      });
    }
  }, []);

  // ── Mouse up (attached to document) ─────────────────────────────

  const onMouseUp = useCallback(() => {
    // Finalize drag
    const drag = dragRef.current;
    if (drag) {
      // Read latest state from setTempDragRect by using a ref trick
      // We need the final rect. The setTempDragRect is async so we
      // calculate it directly here.
      dragRef.current = null;
      setTempDragRect(prev => {
        if (prev && prev.windowId === drag.windowId) {
          moveWindowRef.current(drag.windowId, prev.x, prev.y);
        }
        return null;
      });
      return;
    }

    // Finalize resize
    const resize = resizeRef.current;
    if (resize) {
      resizeRef.current = null;
      setTempResizeRect(prev => {
        if (prev && prev.windowId === resize.windowId) {
          resizeWindowRef.current(
            resize.windowId,
            prev.width,
            prev.height,
            prev.x,
            prev.y,
          );
        }
        return null;
      });
    }
  }, []);

  // ── Document-level event listeners ──────────────────────────────

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMove = (e: MouseEvent) => onMouseMove(e);
    const handleUp = () => onMouseUp();

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, isResizing, onMouseMove, onMouseUp]);

  return {
    startDrag,
    startResize,
    tempDragRect,
    tempResizeRect,
    isDragging,
    isResizing,
  };
}

export default useWindowManager;
