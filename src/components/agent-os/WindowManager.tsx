import { useMemo, type MouseEvent, useCallback } from 'react';
import { useAgentOS } from '../../context/AgentOSContext';
import { useWindowManager, type ResizeEdge } from '../../hooks/useWindowManager';
import { useWebviewTier } from '../../hooks/useWebviewTier';
import Window from './Window';

/**
 * Renders all non-minimized OS windows sorted by zIndex.
 *
 * Integrates `useWindowManager` for drag/resize orchestration and
 * delegates individual window rendering to the `Window` component.
 */
type DockState = 'show' | 'hide' | 'float';

export default function WindowManager({ dockState = 'show' }: { dockState?: DockState }) {
  const { state, closeWindow, focusWindow, minimizeWindow, toggleMaximize, moveWindow, resizeWindow, getWindowPageComponent, setWindowTier, previousActiveId } =
    useAgentOS();

  const { windows, activeWindowId } = state;

  // ── Webview tier management ────────────────────────────────────
  useWebviewTier({ windows, activeWindowId, previousActiveId, setWindowTier });

  // ── Drag/resize hook ───────────────────────────────────────────

  const wm = useWindowManager(moveWindow, resizeWindow);

  // ── Sort windows by zIndex ─────────────────────────────────────

  const sortedWindows = useMemo(() => {
    return [...windows].sort((a, b) => a.zIndex - b.zIndex);
  }, [windows]);

  // ── Callback wrappers ──────────────────────────────────────────

  const handleStartDrag = (windowId: string, x: number, y: number, e: MouseEvent<HTMLDivElement>) => {
    wm.startDrag(windowId, x, y, e);
  };

  const handleStartResize = (
    windowId: string,
    edge: ResizeEdge,
    x: number,
    y: number,
    w: number,
    h: number,
    e: MouseEvent,
  ) => {
    wm.startResize(windowId, edge, x, y, w, h, e);
  };

  // ── Handle maximize with dynamic dock offset ──────────────────
  // The container is absolute inset-0 with CSS bottom offset managed
  // by DesktopArea. We mirror that logic here for maximize rect:
  //   menuBar 32px (top) + dock 76px (bottom, only when dock='show')
  const MENUBAR_HEIGHT = 32;
  const DOCK_HEIGHT = 76; // mirrors DOCK_RESERVED_HEIGHT in DesktopArea
  const handleMaximize = (id: string) => {
    const bottomMargin = dockState === 'show' ? DOCK_HEIGHT : 0;
    const desktopWidth = window.innerWidth;
    const desktopHeight = window.innerHeight - MENUBAR_HEIGHT - bottomMargin;
    toggleMaximize(id, { x: 0, y: 0, width: desktopWidth, height: desktopHeight });
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <>
      {sortedWindows.map((win) => {
        // Cold-tier browser windows: don't render React component (save VRAM + CPU)
        const isColdBrowser = win.type === 'browser' && win.webviewTier === 'cold';
        const isBrowser = win.type === 'browser';
        const tier = win.webviewTier ?? 'hot';

        return (
        <Window
          key={win.id}
          window={win}
          isFocused={win.id === activeWindowId}
          onClose={closeWindow}
          onFocus={(id) => {
            focusWindow(id);
            // Always promote focused browser window to hot tier
            const winTarget = windows.find(w => w.id === id);
            if (winTarget?.type === 'browser') {
              setWindowTier(id, 'hot', winTarget.snapshot);
            }
          }}
          onMinimize={(id) => {
            minimizeWindow(id);
            // Demote minimized browser to warm to save resources
            const winTarget = windows.find(w => w.id === id);
            if (winTarget?.type === 'browser') {
              setWindowTier(id, 'warm', winTarget.snapshot);
            }
          }}
          onMaximize={handleMaximize}
          onStartDrag={handleStartDrag}
          onStartResize={handleStartResize}
          tempDragRect={wm.tempDragRect}
          tempResizeRect={wm.tempResizeRect}
          pageComponent={isColdBrowser ? undefined : getWindowPageComponent(win.type)}
          tier={isBrowser ? tier : undefined}
          snapshot={win.snapshot}
        />
        );
      })}
    </>
  );
}
