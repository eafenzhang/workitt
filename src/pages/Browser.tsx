import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, RotateCwIcon, ExternalLinkIcon, StarIcon, ClockIcon, XIcon, PlusIcon } from 'lucide-react';
import { useAgentOS } from '../context/AgentOSContext';
import ErrorBoundary from '../components/ErrorBoundary';

declare global { namespace JSX { interface IntrinsicElements { webview: any; } } }

interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

interface Props {
  initialUrl?: string;
  windowId?: string;
  onUrlChange?: (url: string) => void;
  onTitleChange?: (title: string) => void;
  onOpenNewTab?: (url?: string) => void;
  visible?: boolean;
  tier?: 'hot' | 'warm' | 'cold';
  snapshot?: { url: string; title: string };
}

interface Bookmark { url: string; title: string; addedAt: number; }
interface HistoryEntry { url: string; title: string; visitedAt: number; }

const BM_KEY = 'workit_browser_bookmarks';
const HIST_KEY = 'workit_browser_history';

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

function faviconUrl(url: string): string {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=16`; } catch { return ''; }
}

function generateTabId(): string { return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export default function Browser({ initialUrl, windowId, onUrlChange, onTitleChange, onOpenNewTab, visible, tier = 'hot', snapshot }: Props) {
  const { closeWindow, state, setWindowData } = useAgentOS();

  // ── Tab state (init from persisted window data) ──
  const [tabs, setTabs] = useState<BrowserTab[]>(() => {
    const win = state.windows.find(w => w.id === windowId);
    if (win?.browserTabs && win.browserTabs.length > 0) return win.browserTabs;
    const firstId = generateTabId();
    return [{ id: firstId, url: initialUrl || 'about:blank', title: initialUrl ? initialUrl.replace(/^https?:\/\//, '').substring(0, 30) : '新标签页' }];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const win = state.windows.find(w => w.id === windowId);
    return win?.activeBrowserTabId || tabs[0]?.id || '';
  });
  // Track external tab additions (e.g., from openNewBrowserWindow)
  const [externalTabNonce, setExternalTabNonce] = useState(() => {
    const win = state.windows.find(w => w.id === windowId);
    return win?.browserTabNonce ?? 0;
  });

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || { id: '', url: '', title: '新标签页' };
  const url = activeTab.url || '';
  const [inputUrl, setInputUrl] = useState(activeTab.url || '');

  // Sync inputUrl when switching tabs
  useEffect(() => { setInputUrl(activeTab?.url || ''); }, [activeTabId]);

  // Persist tab state to OS window (debounced)
  useEffect(() => {
    if (!windowId) return;
    const timer = setTimeout(() => {
      setWindowData(windowId, {
        browserTabs: tabs,
        activeBrowserTabId: activeTabId,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [tabs, activeTabId, windowId, setWindowData]);

  // Sync tabs from window data when externally modified (e.g., openNewBrowserWindow adds a tab)
  useEffect(() => {
    const win = state.windows.find(w => w.id === windowId);
    const nonce = win?.browserTabNonce ?? 0;
    if (nonce > externalTabNonce && win?.browserTabs) {
      setTabs(win.browserTabs);
      if (win.activeBrowserTabId) setActiveTabId(win.activeBrowserTabId);
      setExternalTabNonce(nonce);
    }
  }, [windowId, state.windows, externalTabNonce]);

  const wvContainerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<any>(null);
  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
  const tabsRef = useRef(tabs); tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId); activeTabIdRef.current = activeTabId;
  const onUrlChangeRef = useRef(onUrlChange); onUrlChangeRef.current = onUrlChange;
  const onTitleChangeRef = useRef(onTitleChange); onTitleChangeRef.current = onTitleChange;
  const pageTitleRef = useRef('');

  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => load(BM_KEY, []));
  const [history, setHistory] = useState<HistoryEntry[]>(() => load(HIST_KEY, []));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'bookmarks' | 'history'>('bookmarks');
  const [browserLoading, setBrowserLoading] = useState(false);

  // Context menu with fade animation
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; animating: boolean } | null>(null);
  useEffect(() => {
    if (!ctxMenu) return;
    // Trigger fade-in
    requestAnimationFrame(() => {
      setCtxMenu(prev => prev ? { ...prev, animating: true } : null);
    });
    const animateClose = () => {
      setCtxMenu(prev => prev ? { ...prev, animating: false } : null);
      setTimeout(() => setCtxMenu(null), 150);
    };
    const handler = () => animateClose();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [ctxMenu?.x, ctxMenu?.y]);

  // ── Tab operations ──
  const updateTabUrl = useCallback((tabId: string, newUrl: string, newTitle?: string) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, url: newUrl, title: newTitle || newUrl.replace(/^https?:\/\//, '').substring(0, 30) } : t,
    ));
  }, []);

  const openNewTab = useCallback((tabUrl?: string) => {
    const id = generateTabId();
    const newTab: BrowserTab = {
      id, url: tabUrl || 'about:blank',
      title: tabUrl ? tabUrl.replace(/^https?:\/\//, '').substring(0, 30) : '新标签页',
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length <= 1) { if (windowId) closeWindow(windowId); return prev; }
      const remaining = prev.filter(t => t.id !== tabId);
      if (activeTabIdRef.current === tabId) {
        const idx = prev.findIndex(t => t.id === tabId);
        const newActive = remaining[Math.min(idx, remaining.length - 1)];
        if (newActive) setActiveTabId(newActive.id);
      }
      return remaining;
    });
  }, [windowId, closeWindow]);

  // ── Webview lifecycle ──
  const tierRef = useRef(tier); tierRef.current = tier;

  const handleWebviewLoad = useCallback((e: any) => {
    try {
      const wvUrl = e.target?.getURL?.() || webviewRef.current?.getURL?.();
      if (wvUrl && wvUrl !== 'about:blank') {
        setInputUrl(wvUrl);
        updateTabUrl(activeTabIdRef.current, wvUrl);
        onUrlChangeRef.current?.(wvUrl);
      }
    } catch {}
  }, [updateTabUrl]);

  const handlePageTitle = useCallback((e: any) => {
    const title = e.title || '';
    if (title && title !== 'about:blank') {
      pageTitleRef.current = title;
      onTitleChangeRef.current?.(title);
      const curTab = tabsRef.current.find(t => t.id === activeTabIdRef.current);
      if (curTab) {
        updateTabUrl(curTab.id, curTab.url, title);
        const cur = curTab.url;
        setHistory(prev => {
          const f = prev.filter(en => en.url !== cur);
          const n = [{ url: cur, title: title.substring(0, 40), visitedAt: Date.now() }, ...f].slice(0, 100);
          try { localStorage.setItem(HIST_KEY, JSON.stringify(n)); } catch {}
          return n;
        });
      }
    }
  }, [updateTabUrl]);

  const handleWillNavigate = useCallback((e: any) => {
    const navUrl = e.url;
    if (navUrl && /^https?:\/\//.test(navUrl)) {
      setInputUrl(navUrl);
      updateTabUrl(activeTabIdRef.current, navUrl);
      onUrlChangeRef.current?.(navUrl);
    }
  }, [updateTabUrl]);

  const handleStartLoading = useCallback(() => setBrowserLoading(true), []);
  const handleStopLoading = useCallback(() => setBrowserLoading(false), []);

  // ── Minimize cleanup: destroy webview after delay to free memory ──
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (visible === false && webviewRef.current) {
      // Start cleanup timer — destroy webview after 10s of being hidden
      cleanupTimerRef.current = setTimeout(() => {
        if (webviewRef.current) {
          try { webviewRef.current.stop(); webviewRef.current.remove(); } catch {}
          webviewRef.current = null;
        }
      }, 10000);
    } else if (visible === true && !webviewRef.current) {
      // Window restored — recreate webview (triggers activeTabId effect)
      if (cleanupTimerRef.current) { clearTimeout(cleanupTimerRef.current); cleanupTimerRef.current = null; }
      // Force recreation by toggling a key — handled by tier effect
    }
    return () => {
      if (cleanupTimerRef.current) { clearTimeout(cleanupTimerRef.current); cleanupTimerRef.current = null; }
    };
  }, [visible]);

  const attachWebviewEvents = useCallback((wv: any) => {
    wv.addEventListener('did-finish-load', handleWebviewLoad);
    wv.addEventListener('page-title-updated', handlePageTitle);
    wv.addEventListener('will-navigate', handleWillNavigate);
    wv.addEventListener('did-start-loading', handleStartLoading);
    wv.addEventListener('did-stop-loading', handleStopLoading);
    // new-window fallback (Electron < 22) — intercepted by main process on 22+
    wv.addEventListener('new-window', (e: any) => {
      const newUrl = e.url;
      if (newUrl && /^https?:\/\//.test(newUrl)) openNewTab(newUrl);
    });
  }, [handleWebviewLoad, handlePageTitle, handleWillNavigate, handleStartLoading, handleStopLoading, openNewTab]);

  // Listen for browser:new-window IPC from main process (Electron 22+ setWindowOpenHandler)
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onBrowserNewWindow) return;
    const unsub = api.onBrowserNewWindow((url: string) => {
      if (url && /^https?:\/\//.test(url)) openNewTab(url);
    });
    return () => { unsub?.(); };
  }, [openNewTab]);

  // Webview recreation trigger — MUST be declared before the effect below
  const [recreateKey, setRecreateKey] = useState(0);

  // Create / recreate webview only on tab switch (not on tier change)
  useEffect(() => {
    try {
      const container = wvContainerRef.current;
      if (!container) return;

      const removeWebview = () => {
        if (webviewRef.current) {
          try { webviewRef.current.stop(); webviewRef.current.remove(); } catch {}
          webviewRef.current = null;
        }
      };
      removeWebview();

      if (tier === 'cold') return;

      const wv = document.createElement('webview') as any;
      if (!wv) return;
      wv.className = 'flex-1 w-full border-0';
      wv.style.cssText = 'height:100%;display:flex;';
      wv.setAttribute('allowpopups', '');
      wv.setAttribute('partition', `persist:browser:${windowId || 'default'}`);
      wv.setAttribute('src', (activeTabRef.current?.url || activeTab?.url || 'about:blank'));
      attachWebviewEvents(wv);

      container.appendChild(wv);
      webviewRef.current = wv;

      return () => { removeWebview(); };
    } catch (e) {
      console.error('[Browser] webview creation failed:', e);
    }
  }, [activeTabId, recreateKey]);

  // Tier-based visibility: only hide/show, never destroy
  useEffect(() => {
    if (!webviewRef.current) return;
    if (tier === 'cold') {
      try { webviewRef.current.stop(); webviewRef.current.remove(); } catch {}
      webviewRef.current = null;
    } else if (tier === 'warm') {
      // Use visibility:hidden instead of display:none — Chrome/Electron
      // browserplugin reloads the page when display:none is removed.
      webviewRef.current.style.visibility = 'hidden';
    } else {
      webviewRef.current.style.visibility = 'visible';
      webviewRef.current.style.display = 'flex';
    }
  }, [tier]);

  // ── Navigation ──
  const navigateTo = (u: string) => {
    let go = u.trim();
    if (!/^https?:\/\//.test(go)) go = /\./.test(go) && !/\s/.test(go) ? `https://${go}` : `https://www.google.com/search?q=${encodeURIComponent(go)}`;
    setInputUrl(go);
    updateTabUrl(activeTabRef.current.id, go);
    if (webviewRef.current) {
      try { webviewRef.current.loadURL(go); } catch {}
    }
  };

  const goBack = () => { try { webviewRef.current?.goBack(); } catch {} };
  const goForward = () => { try { webviewRef.current?.goForward(); } catch {} };
  const reload = () => {
    try { webviewRef.current?.reload(); } catch {
      try { const c = webviewRef.current?.getURL?.() || activeTabRef.current?.url; if (c) webviewRef.current?.loadURL(c); } catch {}
    }
  };

  // Track initialUrl changes (from parent)
  useEffect(() => {
    if (initialUrl && (!activeTab?.url || activeTab?.url === 'about:blank') && webviewRef.current) {
      try { webviewRef.current.loadURL(initialUrl); updateTabUrl(activeTabRef.current.id, initialUrl); } catch {}
    }
  }, [initialUrl]);

  // Keep webview alive when window hidden; recreate if previously destroyed
  useEffect(() => {
    if (visible === false) {
      if (webviewRef.current) {
        webviewRef.current.style.visibility = 'hidden';
      }
    } else if (visible === true) {
      if (webviewRef.current) {
        webviewRef.current.style.visibility = 'visible';
        webviewRef.current.style.display = 'flex';
      } else {
        // Webview was destroyed by cleanup timer — trigger recreation
        setRecreateKey(k => k + 1);
      }
    }
  }, [visible]);

  // ── UI handlers ──
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') navigateTo(inputUrl); };
  const openExternal = () => { const u = activeTabRef.current?.url; if (u) { try { window.open(u, '_blank', 'noopener,noreferrer'); } catch {} } };
  const openSidebar = (tab: 'bookmarks' | 'history') => { setSidebarTab(tab); setSidebarOpen(true); };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (windowId) { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, animating: false }); }
  }, [windowId]);

  const animateCloseMenu = useCallback(() => {
    setCtxMenu(prev => prev ? { ...prev, animating: false } : null);
    setTimeout(() => setCtxMenu(null), 150);
  }, []);

  const handleCloseAllBrowsers = useCallback(() => {
    state.windows.filter(w => w.type === 'browser' && !w.isMinimized).forEach(w => closeWindow(w.id));
    animateCloseMenu();
  }, [state.windows, closeWindow, animateCloseMenu]);

  const handleCloseBrowser = useCallback(() => {
    if (windowId) closeWindow(windowId);
    animateCloseMenu();
  }, [windowId, closeWindow, animateCloseMenu]);

  const toggleBookmark = () => {
    const u = activeTabRef.current?.url; if (!u) return;
    const t = pageTitleRef.current || u.replace(/^https?:\/\//, '').substring(0, 30);
    setBookmarks(prev => {
      const exists = prev.find(b => b.url === u);
      const next = exists ? prev.filter(b => b.url !== u) : [{ url: u, title: t, addedAt: Date.now() }, ...prev].slice(0, 50);
      try { localStorage.setItem(BM_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const isBookmarked = bookmarks.some(b => b.url === activeTabRef.current?.url);

  return (
    <ErrorBoundary label="浏览器">
    <div className="flex flex-col h-full relative">
      {/* ── URL bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ background: 'var(--wiki-surface)', borderBottom: '1px solid var(--wiki-border)' }}>
        <button onClick={goBack} className="p-1 rounded hover:bg-wiki-surface2 transition-colors"><ArrowLeftIcon size={14} style={{ color: 'var(--wiki-text2)' }} /></button>
        <button onClick={goForward} className="p-1 rounded hover:bg-wiki-surface2 transition-colors"><ArrowRightIcon size={14} style={{ color: 'var(--wiki-text2)' }} /></button>
        <button onClick={reload} className="p-1 rounded hover:bg-wiki-surface2 transition-colors"><RotateCwIcon size={14} style={{ color: 'var(--wiki-text2)' }} /></button>
        <input value={inputUrl} onChange={e => setInputUrl(e.target.value)} onKeyDown={handleKeyDown}
          className="flex-1 px-3 py-1.5 rounded text-xs outline-none browser-url-input"
          style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)', border: '1px solid var(--wiki-border)' }} placeholder="输入网址或搜索..." />
        <button onClick={toggleBookmark} className="p-1 rounded hover:bg-wiki-surface2 transition-colors" title={isBookmarked ? '取消收藏' : '加入收藏'}>
          <StarIcon size={14} style={{ color: isBookmarked ? 'var(--wiki-warning)' : 'var(--wiki-text2)' }} /></button>
        <button onClick={() => openSidebar('bookmarks')} className="p-1 rounded hover:bg-wiki-surface2 transition-colors" title="收藏夹 & 历史">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1" stroke="var(--wiki-text2)" strokeWidth="1.1" fill="none"/><line x1="10" y1="1" x2="10" y2="13" stroke="var(--wiki-text2)" strokeWidth="1"/></svg>
        </button>
        <button onClick={openExternal} className="p-1 rounded hover:bg-wiki-surface2 transition-colors" title="系统浏览器" data-bypass-interceptor>
          <ExternalLinkIcon size={14} style={{ color: 'var(--wiki-text2)' }} /></button>
      </div>

      {/* ── Tab bar (compact bookmarks-style chips) ── */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 flex-shrink-0 overflow-x-auto" style={{ background: 'var(--wiki-surface)', borderBottom: '1px solid var(--wiki-border)' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className="group flex items-center gap-1 px-2 py-1 rounded cursor-pointer flex-shrink-0 transition-colors"
            style={{
              background: tab.id === activeTabId ? 'var(--wiki-surface2)' : 'transparent',
            }}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.url && tab.url !== 'about:blank' && (
              <img src={faviconUrl(tab.url)} className="w-3.5 h-3.5 flex-shrink-0" alt="" loading="lazy"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <span className="text-[11px] truncate max-w-[120px]" style={{ color: tab.id === activeTabId ? 'var(--wiki-text)' : 'var(--wiki-text2)' }}>
              {tab.title || '新标签页'}
            </span>
            <button
              onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
              className="hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full text-[10px] hover:text-red-500 flex-shrink-0"
              style={{ color: 'var(--wiki-text3)' }}
            >×</button>
          </div>
        ))}
        <button onClick={() => openNewTab()} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-wiki-surface2 transition-colors" title="新建标签页">
          <PlusIcon size={13} style={{ color: 'var(--wiki-text3)' }} />
        </button>
      </div>

      {/* ── Unified Sidebar (Bookmarks + History) ── */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setSidebarOpen(false)} />
          <div
            className="absolute top-0 right-0 bottom-0 w-[280px] flex flex-col z-[10000]"
            style={{ background: 'var(--wiki-surface)', borderLeft: '1px solid var(--wiki-border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
          >
            {/* Tab header */}
            <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
              <button
                onClick={() => setSidebarTab('bookmarks')}
                className="flex-1 py-2.5 text-xs font-medium transition-colors"
                style={{
                  color: sidebarTab === 'bookmarks' ? 'var(--wiki-text)' : 'var(--wiki-text3)',
                  borderBottom: sidebarTab === 'bookmarks' ? '2px solid var(--wiki-accent)' : '2px solid transparent',
                }}
              >收藏夹 ({bookmarks.length})</button>
              <button
                onClick={() => setSidebarTab('history')}
                className="flex-1 py-2.5 text-xs font-medium transition-colors"
                style={{
                  color: sidebarTab === 'history' ? 'var(--wiki-text)' : 'var(--wiki-text3)',
                  borderBottom: sidebarTab === 'history' ? '2px solid var(--wiki-accent)' : '2px solid transparent',
                }}
              >历史记录 ({history.length})</button>
              <button onClick={() => setSidebarOpen(false)} className="w-8 flex items-center justify-center hover:bg-wiki-surface2">
                <XIcon size={12} style={{ color: 'var(--wiki-text3)' }} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {sidebarTab === 'bookmarks' ? (
                bookmarks.length === 0 ? (
                  <div className="text-xs text-wiki-text3 p-4 text-center">暂无收藏<br/><span className="text-[10px]">点击地址栏 ☆ 添加收藏</span></div>
                ) : (
                  bookmarks.map(bm => (
                    <div key={bm.url} className="flex items-center gap-2 px-3 py-2.5 group hover:bg-wiki-surface2 transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid var(--wiki-border)' }}
                      onClick={() => { navigateTo(bm.url); setSidebarOpen(false); }}>
                      <img src={faviconUrl(bm.url)} className="w-4 h-4 flex-shrink-0 rounded-sm" alt="" loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate" style={{ color: 'var(--wiki-text)' }}>{bm.title}</div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--wiki-text3)' }}>{bm.url}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setBookmarks(prev => { const n = prev.filter(b => b.url !== bm.url); try { localStorage.setItem(BM_KEY, JSON.stringify(n)); } catch {} return n; }); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-opacity">
                        <XIcon size={10} style={{ color: 'var(--wiki-text3)' }} />
                      </button>
                    </div>
                  ))
                )
              ) : (
                history.length === 0 ? (
                  <div className="text-xs text-wiki-text3 p-4 text-center">暂无历史记录</div>
                ) : (
                  history.slice(0, 100).map(e => (
                    <div key={e.url + e.visitedAt} className="flex items-center gap-2 px-3 py-2.5 group hover:bg-wiki-surface2 transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid var(--wiki-border)' }}
                      onClick={() => { navigateTo(e.url); setSidebarOpen(false); }}>
                      <img src={faviconUrl(e.url)} className="w-4 h-4 flex-shrink-0 rounded-sm" alt="" loading="lazy"
                        onError={e2 => { (e2.target as HTMLImageElement).style.display = 'none'; }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate" style={{ color: 'var(--wiki-text)' }}>{e.title}</div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--wiki-text3)' }}>{e.url}</div>
                      </div>
                      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--wiki-text3)' }}>
                        {new Date(e.visitedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </>
      )}

      {/* Loading progress */}
      <style>{`
        .browser-progress { height: 2px; background: linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1); background-size: 200% 100%; animation: progress-pulse 1.5s ease-in-out infinite; }
        @keyframes progress-pulse { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
      `}</style>
      {browserLoading && <div className="browser-progress" />}

      {/* New tab page — shown when no URL (separate from webview container) */}
      {(!activeTab?.url || activeTab.url === 'about:blank') && tier !== 'cold' && (
        <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--wiki-bg)' }}>
          <div className="text-center">
            <div className="text-4xl mb-4 opacity-30" style={{ color: 'var(--wiki-text)' }}>Workitt</div>
            <div className="text-sm text-wiki-text2 mb-2">内置浏览器</div>
            <div className="text-xs text-wiki-text3">
              在地址栏输入网址或搜索内容开始浏览
            </div>
          </div>
        </div>
      )}

      {/* Cold tier placeholder */}
      {tier === 'cold' && (
        <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--wiki-surface2)' }}>
          <div className="text-center px-6">
            <div className="text-xs text-wiki-text3 mb-1">浏览器已休眠</div>
            <div className="text-[11px] text-wiki-text3 opacity-60 truncate max-w-[300px]">
              {snapshot?.title || '无标题'}
            </div>
          </div>
        </div>
      )}

      {/* Webview container — DOM-managed, no React children */}
      <div
        ref={wvContainerRef}
        className="flex-1 flex flex-col overflow-hidden"
        style={{ display: (!activeTab?.url || activeTab.url === 'about:blank' || tier === 'cold') ? 'none' : 'flex' }}
        onContextMenu={handleContextMenu}
      />

      {/* Context menu with fade animation */}
      {ctxMenu && (
        <div className="fixed z-[10000]" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <div className="rounded-lg py-1 shadow-lg" style={{
            background: 'var(--wiki-surface)',
            border: '1px solid var(--wiki-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            minWidth: '180px',
            opacity: ctxMenu.animating ? 1 : 0,
            transform: ctxMenu.animating ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-4px)',
            transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
          }}
            onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-wiki-surface2 transition-colors text-sm" style={{ color: 'var(--wiki-text)' }} onClick={handleCloseBrowser}>
            <XIcon size={14} style={{ color: 'var(--wiki-danger)' }} />
            <span>关闭此窗口</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-wiki-surface2 transition-colors text-sm" style={{ color: 'var(--wiki-text)', borderTop: '1px solid var(--wiki-border)' }}
            onClick={handleCloseAllBrowsers}>
            <XIcon size={14} style={{ color: 'var(--wiki-danger)' }} />
            <span>关闭所有窗口</span>
          </div>
        </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
