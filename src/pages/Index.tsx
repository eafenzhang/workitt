import React, { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react';
import Sidebar from '../components/Sidebar';
import TitleBar from '../components/TitleBar';
import { XIcon, Trash2Icon } from 'lucide-react';
import { useAgentOS } from '../context/AgentOSContext';
import AgentOSDesktop from '../components/agent-os/AgentOSDesktop';

/** Extracted base style for tab bar buttons */
const TAB_STYLE: React.CSSProperties = {
  maxWidth: '120px',
  fontSize: '13px',
  WebkitAppRegion: 'no-drag',
};

// Lazy-loaded pages (code splitting for faster initial load)
const Home = lazy(() => import('./Home'));
const Requirements = lazy(() => import('./Requirements'));
const Knowledge = lazy(() => import('./Knowledge'));
const AppEcosystem = lazy(() => import('./AppEcosystem'));
const Model = lazy(() => import('./Model'));
const Browser = lazy(() => import('./Browser'));
const Settings = lazy(() => import('./Settings'));
const DesignStudio = lazy(() => import('./DesignStudio'));
const Workflows = lazy(() => import('./Workflows'));
const CowChannelsTab = lazy(() => import('../components/CowChannelsTab'));
const CowMemoryTab = lazy(() => import('../components/CowMemoryTab'));
const CowSchedulerTab = lazy(() => import('../components/CowSchedulerTab'));
const CowLogsTab = lazy(() => import('../components/CowLogsTab'));

// Loading fallback spinner
const Loading = () => (
  <div className="flex items-center justify-center h-full">
    <div className="animate-spin w-6 h-6 border-2 border-wiki-text border-t-transparent rounded-full" />
  </div>
);

const Lazy = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<Loading />}>{children}</Suspense>
);

interface GlobalTab {
  id: string;
  title: string;
  type: string;
  reqId?: number;
  params?: Record<string, any>;
}

const MAX_TABS = 10;

const MENU_MAP: Record<string, { type: string; title: string }> = {
  home: { type: 'home', title: '会话' },
  requirements: { type: 'requirements', title: '采集库' },
  knowledge: { type: 'knowledge', title: '知识库' },
  'design-studio': { type: 'design-studio', title: '设计稿' },
  model: { type: 'model', title: '模型配置' },
  mcp: { type: 'mcp', title: '工具' },
  channels: { type: 'channels', title: 'IM通道' },
  memory: { type: 'memory', title: '记忆' },
  scheduler: { type: 'scheduler', title: '定时任务' },
  workflows: { type: 'workflows', title: '工作流' },
  browser: { type: 'browser', title: '浏览器' },
  logs: { type: 'logs', title: '日志' },
  settings: { type: 'settings', title: '系统设置' },
};

export default function Index() {

  // Agent OS mode — source of truth for all window/page state
  const { state: osState, toggleOSMode, openWindow, openNewBrowserWindow, closeWindow, focusWindow } = useAgentOS();
  const isOSMode = osState.isOSMode;

  // Derive classic mode tabs from OS windows (single source of truth)
  const tabs = React.useMemo<GlobalTab[]>(() => {
    if (osState.windows.length === 0) return [{ id: 'home', title: '首页', type: 'home' }];
    return osState.windows.map(w => ({
      id: w.id,
      title: w.title,
      type: w.type,
      reqId: w.initialTab?.reqId,
      docId: w.docId,
      params: w.params || (w.initialUrl ? { url: w.initialUrl } : w.initialTab?.params),
    }));
  }, [osState.windows]);
  const activeTabId = osState.activeWindowId || (tabs[0]?.id || 'home');

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const hasAutoOpenedRef = React.useRef(false);

  // Auto-open home window when entering OS mode for the first time
  useEffect(() => {
    if (isOSMode && osState.isInitialized && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      if (osState.windows.length === 0) {
        openWindow('home', '首页');
      }
    }
  }, [isOSMode, osState.isInitialized, osState.windows.length, openWindow]);

  // Reset auto-open flag when leaving OS mode
  useEffect(() => {
    if (!isOSMode) {
      hasAutoOpenedRef.current = false;
    }
  }, [isOSMode]);

  // Open a tab by type → unified: always opens an OS window
  const openTab = useCallback((type: string, title: string, extra?: Partial<GlobalTab>) => {
    const params: Record<string, any> = { params: extra?.params };
    if (extra?.reqId != null) params.initialTab = { type, reqId: extra.reqId, params: extra?.params };
    if (extra?.docId != null) params.docId = extra.docId;
    if (type.includes('knowledge-') || type.includes('design-studio-')) {
      params.initialView = type;
      if (extra?.docId != null) params.docId = extra.docId;
    }
    openWindow(type, title, params);
  }, [openWindow]);

  const closeTab = useCallback((tabId: string) => {
    // Don't close the last tab
    if (tabs.length <= 1) return;
    closeWindow(tabId);
  }, [tabs.length, closeWindow]);

  const switchTab = useCallback((tabId: string) => focusWindow(tabId), [focusWindow]);

  // Browser handlers — unused in classic mode now (Browser component handles its own state)
  const updateBrowserUrl = useCallback((tabId: string, url: string) => {
    // Browser component handles URL independently via AgentOSContext
  }, []);

  const updateBrowserTitle = useCallback((tabId: string, title: string) => {
    // Browser component handles title independently via AgentOSContext
  }, []);

  // Sidebar menu click → focus existing tab or open new one
  const handleMenuClick = useCallback((menuType: string, menuTitle: string) => {
    // Check if a tab/window of this type already exists
    const existing = tabs.find(t => t.type === menuType);
    if (existing) {
      focusWindow(existing.id);
      return;
    }
    openTab(menuType, menuTitle);
  }, [openTab, tabs, focusWindow]);

  const onCloseSelf = useCallback(() => closeTab(activeTabId), [closeTab, activeTabId]);
  const onToggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);

  // Open browser tab — always creates a NEW tab (fix #7)
  const onOpenBrowser = useCallback((url?: string) => {
    if (isOSMode) {
      openNewBrowserWindow();
      return;
    }
    const urlStr = url || '';
    const title = urlStr ? urlStr.replace(/^https?:\/\//, '').substring(0, 30) : '浏览器';
    openTab('browser', title || '浏览器', { params: { url: urlStr }, reqId: Date.now() });
  }, [openTab, isOSMode, openNewBrowserWindow]);

  // Listen for browser tab open requests from link clicks (App.tsx)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ url: string }>).detail;
      if (detail?.url) onOpenBrowser(detail.url);
    };
    window.addEventListener('open-browser-tab', handler);
    return () => window.removeEventListener('open-browser-tab', handler);
  }, [onOpenBrowser]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Build tab bar content for TitleBar
  const tabBar = useMemo(() => (
    <div className="flex items-center h-full gap-0.5 w-full overflow-hidden">
      <div className="flex items-center h-full gap-0.5 flex-1 overflow-hidden">
      {tabs.map(tab => {
        const isActive = activeTabId === tab.id;
        return (
          <div key={tab.id} onClick={() => switchTab(tab.id)}
            className="flex items-center justify-between gap-1 px-2.5 h-7 rounded-lg cursor-pointer select-none transition-colors group flex-1 min-w-0"
            style={{
              ...TAB_STYLE,
              background: isActive ? 'var(--wiki-surface2)' : 'transparent',
              color: isActive ? 'var(--wiki-text)' : 'var(--wiki-text3)',
            } as any}>
            <span className="truncate">{tab.title}</span>
            {tabs.length > 1 && (
              <button onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ opacity: isActive ? 1 : 0, background: 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#ef444420'; (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'inherit'; }}
                title="关闭标签页">
                <XIcon size={13} />
              </button>
            )}
          </div>
        );
      })}
      </div>
      {/* Close all tabs */}
      {tabs.length > 1 && (
        <button onClick={() => { osState.windows.filter(w => w.type !== 'home').forEach(w => closeWindow(w.id)); }}
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ WebkitAppRegion: 'no-drag', color: 'var(--wiki-text3)' } as any}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.background = 'var(--wiki-surface2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--wiki-text3)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          title="关闭全部标签页">
          <Trash2Icon size={14} />
        </button>
      )}
    </div>
  ), [tabs, activeTabId, closeTab, switchTab]);

  // Render page content based on active tab
  const page = useMemo(() => {
    if (!activeTab) return null;
    switch (activeTab.type) {
      case 'home':
        return <Home onOpenTab={(type: string) => openTab(type, MENU_MAP[type]?.title || type)} />;
      case 'requirements':
        return <Requirements
          key={activeTab.id}
          onOpenSubTab={(title, type, extra) => openTab(type, title, extra)}
        />;
      case 'requirements-detail':
      case 'requirements-create':
      case 'requirements-edit':
        return <Requirements
          key={activeTab.id}
          initialTab={{ type: activeTab.type, reqId: activeTab.reqId, params: activeTab.params }}
          onOpenSubTab={(title, type, extra) => openTab(type, title, extra)}
          onCloseSelf={onCloseSelf}
        />;
      case 'knowledge':
        return <Lazy><Knowledge
          key={activeTab.id}
          onOpenSubTab={(title, type, extra) => openTab(type, title, extra)}
        /></Lazy>;
      case 'knowledge-detail':
      case 'knowledge-create':
      case 'knowledge-edit':
        return <Lazy><Knowledge
          key={activeTab.id}
          initialView={activeTab.type}
          docId={activeTab.docId}
          onOpenSubTab={(title, type, extra) => openTab(type, title, extra)}
          onCloseSelf={onCloseSelf}
        /></Lazy>;
      case 'design-studio':
        return <Lazy><DesignStudio
          key={activeTab.id}
          onOpenSubTab={(title, type, extra) => openTab(type, title, extra)}
        /></Lazy>;
      case 'design-studio-detail':
      case 'design-studio-create':
        return <Lazy><DesignStudio
          key={activeTab.id}
          initialView={activeTab.type}
          docId={activeTab.docId}
          onOpenSubTab={(title, type, extra) => openTab(type, title, extra)}
          onCloseSelf={onCloseSelf}
        /></Lazy>;
      case 'mcp':
        return <Lazy><AppEcosystem /></Lazy>;
      case 'channels':
        return <Lazy><CowChannelsTab /></Lazy>;
      case 'memory':
        return <Lazy><CowMemoryTab /></Lazy>;
      case 'scheduler':
        return <Lazy><CowSchedulerTab /></Lazy>;
      case 'workflows':
        return <Lazy><Workflows /></Lazy>;
      case 'logs':
        return <Lazy><CowLogsTab /></Lazy>;
      case 'model':
        return <Lazy><Model /></Lazy>;
        return null; // browser tabs rendered separately below (kept alive with display:none)
      case 'settings':
        return <Lazy><Settings /></Lazy>;
      default:
        return <Home onOpenTab={(type: string) => openTab(type, MENU_MAP[type]?.title || type)} />;
    }
  }, [activeTab, openTab, onCloseSelf]);

  // Close inner tabs when closing a parent tab
  // (handled automatically by React unmounting)

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-wiki-bg">
      {/* Title bar — hidden in OS mode (merged with MenuBar) */}
      {!isOSMode && (
      <TitleBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        isOSMode={isOSMode}
        onToggleOSMode={toggleOSMode}
      >
        {tabBar}
      </TitleBar>
      )}

      {/* OS/App mode switch with fade transition */}
      <div key={isOSMode ? 'desktop' : 'app'} className="flex flex-col flex-1 overflow-hidden page-fade-enter">
      {isOSMode ? (
        <AgentOSDesktop />
      ) : (
        <>
          {/* Below: Sidebar + Content (classic mode) */}
          <div className="flex flex-1 overflow-hidden">
            <Sidebar
              activeTab={                     activeTab?.type === 'home' ? 'home' :
                             activeTab?.type === 'requirements' ? 'requirements' :
                             activeTab?.type === 'knowledge' ? 'knowledge' :
                             activeTab?.type === 'design-studio' ? 'design-studio' :
                             activeTab?.type === 'mcp' ? 'mcp' :
                             activeTab?.type === 'model' ? 'model' :
                             activeTab?.type === 'browser' ? 'browser' :
                             activeTab?.type === 'channels' ? 'channels' :
	                             activeTab?.type === 'memory' ? 'memory' :
	                             activeTab?.type === 'scheduler' ? 'scheduler' :
	                             activeTab?.type === 'workflows' ? 'workflows' :
	                             activeTab?.type === 'logs' ? 'logs' :
	                             activeTab?.type === 'settings' ? 'settings' : 'home'}
              onTabChange={(menuType) => {
                const item = MENU_MAP[menuType];
                if (item) handleMenuClick(item.type, item.title);
              }}
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
            />

            {/* Main content area */}
            <main className="flex-1 min-h-0">
              <div className="h-full relative">
                <div key={activeTabId} className="h-full page-fade-enter">
                  <Suspense fallback={<Loading />}>{page}</Suspense>
                </div>
                {/* Browser tabs — always rendered, hidden when inactive */}
                {tabs.filter(t => t.type === 'browser').map(tab => (
                  <div key={tab.id} className="h-full absolute inset-0"
                    style={{ display: tab.id === activeTabId ? undefined : 'none' }}>
                    <Suspense fallback={<Loading />}>
                      <Browser
                        initialUrl={tab.params?.url}
                        onUrlChange={(url) => updateBrowserUrl(tab.id, url)}
                        onTitleChange={(title) => updateBrowserTitle(tab.id, title)}
                        onOpenNewTab={onOpenBrowser}
                        visible={tab.id === activeTabId}
                      />
                    </Suspense>
                  </div>
                ))}
              </div>
            </main>
          </div>
        </>
      )}
      </div>

      {/* Profile Wizard — full-screen overlay for first-time setup */}
    </div>
  );
}
