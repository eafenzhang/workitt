import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  type AgentOSState,
  type AgentOSAction,
  type OSWindow,
  type WindowRect,
  type WindowPageMap,
  type WebviewTier,
  type BrowserSnapshot,
  createInitialState,
  agentOSReducer,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_DEFAULT_HEIGHT,
  LS_MODE_KEY,
  LS_WINDOWS_KEY,
} from '../types/agent-os';

// ── Lazy-loaded page components (mirrors Index.tsx) ──────────────

const HomePage = React.lazy(() => import('../pages/Home'));
const RequirementsPage = React.lazy(() => import('../pages/Requirements'));
const KnowledgePage = React.lazy(() => import('../pages/Knowledge'));
const AppEcosystemPage = React.lazy(() => import('../pages/AppEcosystem'));
const ModelPage = React.lazy(() => import('../pages/Model'));
const SettingsPage = React.lazy(() => import('../pages/Settings'));
const BrowserPage = React.lazy(() => import('../pages/Browser'));

const WorkflowsPage = React.lazy(() => import('../pages/Workflows'));
const DesignStudioPage = React.lazy(() => import('../pages/DesignStudio'));
const OpenDesignPage = React.lazy(() => import('../pages/OpenDesign'));

/** Maps window.type → lazy page component */
export const PAGE_COMPONENT_MAP: WindowPageMap = {
  home: HomePage,
  requirements: RequirementsPage,
  'requirements-detail': RequirementsPage,
  'requirements-create': RequirementsPage,
  'requirements-edit': RequirementsPage,
  knowledge: KnowledgePage,
  'knowledge-detail': KnowledgePage,
  'knowledge-create': KnowledgePage,
  'knowledge-edit': KnowledgePage,
  'design-studio': DesignStudioPage,
  'design-studio-detail': DesignStudioPage,
  'design-studio-create': DesignStudioPage,
  'open-design': OpenDesignPage,
  mcp: AppEcosystemPage,
  model: ModelPage,
  browser: BrowserPage,
  settings: SettingsPage,
  workflows: WorkflowsPage,
};

// ── Context type ─────────────────────────────────────────────────

export interface AgentOSContextType {
  state: AgentOSState;
  openWindow: (type: string, title: string, extra?: Record<string, any>) => void;
  /** Open a NEW window (always creates, no dedup) with extra params for sub-views */
  openSubWindow: (type: string, title: string, extra?: Record<string, any>) => void;
  /** Open the browser — adds a tab to the existing window or creates a new one (single window with tabs) */
  openNewBrowserWindow: (initialUrl?: string) => void;
  /** Open a browser window with a specific URL */
  openBrowserWithUrl: (url: string, title?: string) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  toggleMaximize: (id: string, desktopRect: WindowRect) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, width: number, height: number, x?: number, y?: number) => void;
  toggleOSMode: () => void;
  getWindowPageComponent: (type: string) => React.LazyExoticComponent<React.ComponentType<Record<string, unknown>>> | undefined;
  /** Set webview cache tier and optional snapshot for a window */
  setWindowTier: (id: string, tier: WebviewTier, snapshot?: BrowserSnapshot) => void;
  /** Update arbitrary window data (e.g. browserTabs for persistence) */
  setWindowData: (id: string, data: Partial<OSWindow>) => void;
  /** Track which window was active before the current one */
  previousActiveId: React.RefObject<string | null>;
}

const AgentOSContext = createContext<AgentOSContextType | null>(null);

// ── Provider ─────────────────────────────────────────────────────

interface AgentOSProviderProps {
  children: ReactNode;
}

export function AgentOSProvider({ children }: AgentOSProviderProps) {
  const [state, dispatch] = useReducer(agentOSReducer, undefined, createInitialState);
  const initializedRef = useRef(false);
  const previousActiveId = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── localStorage hydration (once on mount) ──

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    try {
      const modeRaw = localStorage.getItem(LS_MODE_KEY);
      const windowsRaw = localStorage.getItem(LS_WINDOWS_KEY);

      const isOSMode = modeRaw === 'true';
      let windows: OSWindow[] = [];
      let nextZIndex = 1;

      if (windowsRaw) {
        const parsed = JSON.parse(windowsRaw);
        if (Array.isArray(parsed.windows)) {
          windows = parsed.windows;
        }
        if (typeof parsed.nextZIndex === 'number') {
          nextZIndex = parsed.nextZIndex;
        }
      }

      dispatch({
        type: 'INIT_FROM_STORAGE',
        payload: { isOSMode, windows, nextZIndex },
      });
    } catch {
      // If localStorage is corrupted, start fresh
      dispatch({
        type: 'INIT_FROM_STORAGE',
        payload: { isOSMode: false, windows: [], nextZIndex: 1 },
      });
    }
  }, []);

  // ── Persistence (after every state change, debounced) ──

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state.isInitialized) return;

    // Debounce writes to avoid thrashing localStorage during drags
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(LS_MODE_KEY, String(state.isOSMode));
        localStorage.setItem(
          LS_WINDOWS_KEY,
          JSON.stringify({
            windows: state.windows,
            nextZIndex: state.nextZIndex,
          }),
        );
      } catch {
        // Silently ignore storage errors (quota exceeded, etc.)
      }
    }, 300);

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [state.isOSMode, state.windows, state.nextZIndex, state.isInitialized]);

  // ── Last-chance persistence on tab close (before debounce fires) ──
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(LS_MODE_KEY, String(stateRef.current.isOSMode));
        localStorage.setItem(
          LS_WINDOWS_KEY,
          JSON.stringify({
            windows: stateRef.current.windows,
            nextZIndex: stateRef.current.nextZIndex,
          }),
        );
      } catch {
        // Silently ignore
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  // ── Helpers ────────────────────────────────────────────────────

  function calcCascadePosition(windowCount: number) {
    // Desktop area = full viewport minus MenuBar (28px)
    const desktopH = window.innerHeight - 28;
    const cx = Math.max(0, Math.round((window.innerWidth - WINDOW_DEFAULT_WIDTH) / 2));
    const cy = Math.max(0, Math.round((desktopH - WINDOW_DEFAULT_HEIGHT) / 2));
    const offset = Math.max(0, windowCount - 1) * 24;
    return {
      x: Math.min(cx + offset, window.innerWidth - 200),
      y: Math.min(cy + offset, desktopH - 200),
    };
  }

  // ── Action creators ────────────────────────────────────────────

  const openWindow = useCallback(
    (type: string, title: string, extra?: Record<string, any>) => {
      const s = stateRef.current;
      // Check if a window of this type already exists (skip dedup for sub-views like detail/create)
      const isSubView = type.includes('-');
      if (!isSubView && !extra) {
        const existing = s.windows.find(w => w.type === type);
        if (existing) {
          dispatch({ type: 'FOCUS_WINDOW', payload: { id: existing.id } });
          return;
        }
      }

      const pos = calcCascadePosition(s.windows.length);
      const newWindow: OSWindow = {
        id: `${type}-${Date.now()}`,
        type,
        title,
        x: pos.x,
        y: pos.y,
        width: WINDOW_DEFAULT_WIDTH,
        height: WINDOW_DEFAULT_HEIGHT,
        zIndex: s.nextZIndex,
        isMinimized: false,
        isMaximized: false,
        preMaximizeRect: null,
        ...(extra?.initialTab ? { initialTab: extra.initialTab } : {}),
        ...(extra?.initialView ? { initialView: extra.initialView } : {}),
        ...(extra?.docId != null ? { docId: extra.docId } : {}),
      };

      dispatch({ type: 'OPEN_WINDOW', payload: { window: newWindow } });
    },
    [],
  );

  /** Open a sub-window — always creates new, no dedup, with full extra params */
  const openSubWindow = useCallback(
    (type: string, title: string, extra?: Record<string, any>) => {
      openWindow(type, title, extra);
    },
    [],
  );

  /** Open the browser — adds a tab to the existing window or creates a new one (single window with tabs) */
  const openNewBrowserWindow = useCallback((initialUrl?: string) => {
    const s = stateRef.current;

    // Single-window: if a browser window already exists, add a tab to it
    const existingBrowser = s.windows.find(w => w.type === 'browser');
    if (existingBrowser) {
      const newTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tabUrl = initialUrl || 'about:blank';
      const tabTitle = initialUrl
        ? initialUrl.replace(/^https?:\/\//, '').substring(0, 30)
        : '新标签页';
      const newTab = { id: newTabId, url: tabUrl, title: tabTitle };

      const existingTabs = existingBrowser.browserTabs || [];
      const updatedTabs = [...existingTabs, newTab];

      dispatch({ type: 'SET_WINDOW_DATA', payload: {
        id: existingBrowser.id,
        data: {
          browserTabs: updatedTabs,
          activeBrowserTabId: newTabId,
          browserTabNonce: (existingBrowser.browserTabNonce || 0) + 1,
        },
      }});
      dispatch({ type: 'FOCUS_WINDOW', payload: { id: existingBrowser.id } });
      // Promote to hot tier (handles cold-tier windows that were not rendering the React component)
      dispatch({ type: 'SET_WINDOW_TIER', payload: { id: existingBrowser.id, tier: 'hot' } });
      return;
    }

    // No existing browser window — create a new one
    const pos = calcCascadePosition(s.windows.length);
    const urlLabel = initialUrl ? ` — ${new URL(initialUrl).hostname}` : '';

    const firstTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const firstTab = {
      id: firstTabId,
      url: initialUrl || 'about:blank',
      title: initialUrl ? initialUrl.replace(/^https?:\/\//, '').substring(0, 30) : '新标签页',
    };

    const newWindow: OSWindow = {
      id: `browser-${Date.now()}`,
      type: 'browser',
      title: `浏览器${urlLabel}`,
      x: pos.x,
      y: pos.y,
      width: WINDOW_DEFAULT_WIDTH,
      height: WINDOW_DEFAULT_HEIGHT,
      zIndex: s.nextZIndex,
      isMinimized: false,
      isMaximized: false,
      preMaximizeRect: null,
      browserTabs: [firstTab],
      activeBrowserTabId: firstTabId,
      initialUrl,
    };
    dispatch({ type: 'OPEN_WINDOW', payload: { window: newWindow } });
  }, []);

  /** Open a browser window pre-loaded with a specific URL */
  const openBrowserWithUrl = useCallback((url: string, title?: string) => {
    openNewBrowserWindow(url);
  }, []);

  const closeWindow = useCallback((id: string) => {
    dispatch({ type: 'CLOSE_WINDOW', payload: { id } });
  }, []);

  const focusWindow = useCallback((id: string) => {
    const s = stateRef.current;
    if (s.activeWindowId && s.activeWindowId !== id) {
      previousActiveId.current = s.activeWindowId;
    }
    dispatch({ type: 'FOCUS_WINDOW', payload: { id } });
  }, []);

  const minimizeWindow = useCallback((id: string) => {
    dispatch({ type: 'MINIMIZE_WINDOW', payload: { id } });
  }, []);

  const toggleMaximize = useCallback((id: string, desktopRect: WindowRect) => {
    dispatch({ type: 'TOGGLE_MAXIMIZE', payload: { id, desktopRect } });
  }, []);

  const moveWindow = useCallback((id: string, x: number, y: number) => {
    // Clamp X to keep title bar always accessible (min 120px visible)
    const maxX = Math.max(0, window.innerWidth - 120);
    // Clamp Y: menu bar (32px) to bottom (keep title bar ~40px visible)
    const maxY = Math.max(32, window.innerHeight - 40);
    dispatch({ type: 'MOVE_WINDOW', payload: { id, x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 32), maxY) } });
  }, []);

  const resizeWindow = useCallback(
    (id: string, width: number, height: number, x?: number, y?: number) => {
      dispatch({ type: 'RESIZE_WINDOW', payload: { id, width, height, x, y } });
    },
    [],
  );

  const toggleOSMode = useCallback(() => {
    dispatch({ type: 'TOGGLE_OS_MODE' });
  }, []);

  const setWindowTier = useCallback((id: string, tier: WebviewTier, snapshot?: BrowserSnapshot) => {
    dispatch({ type: 'SET_WINDOW_TIER', payload: { id, tier, snapshot } });
  }, []);

  const setWindowData = useCallback((id: string, data: Partial<OSWindow>) => {
    dispatch({ type: 'SET_WINDOW_DATA', payload: { id, data } });
  }, []);

  const getWindowPageComponent = useCallback(
    (type: string) => PAGE_COMPONENT_MAP[type],
    [],
  );

  // ── Context value (memoized) ───────────────────────────────────

  const ctx = useMemo<AgentOSContextType>(
    () => ({
      state,
      openWindow,
      openSubWindow,
      openNewBrowserWindow,
      openBrowserWithUrl,
      closeWindow,
      focusWindow,
      minimizeWindow,
      toggleMaximize,
      moveWindow,
      resizeWindow,
      toggleOSMode,
      getWindowPageComponent,
      setWindowTier,
      setWindowData,
      previousActiveId,
    }),
    [
      state,
    ],
  );

  return <AgentOSContext.Provider value={ctx}>{children}</AgentOSContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────────

/** Access the AgentOS context. Must be used inside AgentOSProvider. */
export function useAgentOS(): AgentOSContextType {
  const ctx = useContext(AgentOSContext);
  if (!ctx) {
    throw new Error('useAgentOS must be used within an AgentOSProvider');
  }
  return ctx;
}

export default AgentOSContext;
