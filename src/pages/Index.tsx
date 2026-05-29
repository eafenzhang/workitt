import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import Sidebar from '../components/Sidebar';
import TitleBar from '../components/TitleBar';
import { XIcon, Trash2Icon } from 'lucide-react';

// Lazy-loaded pages (code splitting for faster initial load)
const Dashboard = lazy(() => import('./Dashboard'));
const Requirements = lazy(() => import('./Requirements'));
const Knowledge = lazy(() => import('./Knowledge'));
const Insights = lazy(() => import('./Insights'));
const MCP = lazy(() => import('./MCP'));
const Model = lazy(() => import('./Model'));
const Browser = lazy(() => import('./Browser'));
const Messages = lazy(() => import('./Messages'));
const Settings = lazy(() => import('./Settings'));

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
  dashboard: { type: 'dashboard', title: '仪表盘' },
  requirements: { type: 'requirements', title: '采集库' },
  knowledge: { type: 'knowledge', title: '知识库' },
  insights: { type: 'insights', title: '洞察分析' },
  mcp: { type: 'mcp', title: 'MCP工具' },
  model: { type: 'model', title: '模型配置' },
  messages: { type: 'messages', title: '消息中心' },
  settings: { type: 'settings', title: '系统设置' },
};

export default function Index() {
  const [tabs, setTabs] = useState<GlobalTab[]>([{ id: 'dashboard', title: '仪表盘', type: 'dashboard' }]);
  const [activeTabId, setActiveTabId] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Open a tab by type — if exists, switch to it; else create new
  const openTab = useCallback((type: string, title: string, extra?: Partial<GlobalTab>) => {
    setTabs(prev => {
      const existing = prev.find(t => t.type === type && t.reqId === extra?.reqId);
      if (existing) { setActiveTabId(existing.id); return prev; }
      const newTab: GlobalTab = { id: type + '-' + Date.now(), title, type, ...extra };
      setActiveTabId(newTab.id);
      // Limit max tabs: remove oldest when exceeding MAX_TABS
      const next = [...prev, newTab];
      return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next;
    });
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx]?.id || 'dashboard');
      }
      return next;
    });
  }, [activeTabId]);

  const switchTab = useCallback((tabId: string) => setActiveTabId(tabId), []);

  // Update browser tab URL in params (persists across tab switches)
  const updateBrowserUrl = useCallback((url: string) => {
    setTabs(prev => prev.map(t =>
      t.id === activeTabId && t.type === 'browser'
        ? { ...t, title: url.replace(/^https?:\/\//, '').substring(0, 30) || '浏览器', params: { ...t.params, url } }
        : t
    ));
  }, [activeTabId]);

  // Sidebar menu click → open tab
  const handleMenuClick = useCallback((menuType: string, menuTitle: string) => {
    openTab(menuType, menuTitle);
  }, [openTab]);

  const onCloseSelf = useCallback(() => closeTab(activeTabId), [closeTab, activeTabId]);
  const onToggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);

  // Listen for browser tab open requests
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ url: string; newTab?: boolean }>).detail;
      const url = detail?.url;
      if (url !== undefined) {
        const title = url ? url.replace(/^https?:\/\//, '').substring(0, 30) : '浏览器';
        const extra = { params: { url }, reqId: detail?.newTab ? Date.now() : undefined };
        openTab('browser', title || '浏览器', extra);
      }
    };
    window.addEventListener('open-browser-tab', handler);
    return () => window.removeEventListener('open-browser-tab', handler);
  }, [openTab]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Build tab bar content for TitleBar
  const tabBar = useMemo(() => (
    <div className="flex items-center h-full gap-0.5 w-full overflow-hidden">
      {tabs.map(tab => {
        const isActive = activeTabId === tab.id;
        return (
          <div key={tab.id} onClick={() => switchTab(tab.id)}
            className="flex items-center justify-between gap-1 px-2.5 h-7 rounded-md text-xs cursor-pointer select-none transition-colors group flex-shrink"
            style={{
              width: '88px',
              minWidth: '80px',
              background: isActive ? 'var(--wiki-surface2)' : 'transparent',
              color: isActive ? 'var(--wiki-text)' : 'var(--wiki-text3)',
              WebkitAppRegion: 'no-drag',
            } as any}>
            <span className="truncate">{tab.title}</span>
            {tabs.length > 1 && (
              <button onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                className="p-0.5 rounded hover:bg-wiki-surface2 flex-shrink-0 transition-opacity duration-150"
                style={{ opacity: isActive ? 1 : 0 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.opacity = '0'; }}>
                <XIcon size={10} />
              </button>
            )}
          </div>
        );
      })}
      {tabs.length > 1 && (
        <button onClick={() => { setTabs([{ id: 'dashboard', title: '仪表盘', type: 'dashboard' }]); setActiveTabId('dashboard'); }}
          className="px-1.5 h-7 rounded-md text-xs text-wiki-text3 hover:text-red-500 hover:bg-wiki-surface2 flex-shrink-0 flex items-center ml-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as any}>
          <Trash2Icon size={12} />
        </button>
      )}
    </div>
  ), [tabs, activeTabId, closeTab, switchTab]);

  // Render page content based on active tab
  const page = useMemo(() => {
    if (!activeTab) return null;
    switch (activeTab.type) {
      case 'dashboard':
        return <Dashboard onOpenSubTab={(title, type, extra) => openTab(type, title, extra)} />;
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
      case 'insights':
        return <Lazy><Insights /></Lazy>;
      case 'mcp':
        return <Lazy><MCP /></Lazy>;
      case 'model':
        return <Lazy><Model /></Lazy>;
      case 'messages':
        return <Lazy><Messages /></Lazy>;
      case 'browser':
        return <Lazy><Browser initialUrl={activeTab.params?.url} onUrlChange={updateBrowserUrl} /></Lazy>;
      case 'settings':
        return <Lazy><Settings /></Lazy>;
      default:
        return <Dashboard />;
    }
  }, [activeTab, openTab, onCloseSelf]);

  // Close inner tabs when closing a parent tab
  // (handled automatically by React unmounting)

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-wiki-bg">
      {/* Title bar spans full width */}
      <TitleBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
      >
        {tabBar}
      </TitleBar>

      {/* Below: Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab?.type === 'requirements' ? 'requirements' :
                     activeTab?.type === 'dashboard' ? 'dashboard' :
                     activeTab?.type === 'knowledge' ? 'knowledge' :
                     activeTab?.type === 'insights' ? 'insights' :
                     activeTab?.type === 'mcp' ? 'mcp' :
                     activeTab?.type === 'model' ? 'model' :
                     activeTab?.type === 'messages' ? 'messages' :
                     activeTab?.type === 'settings' ? 'settings' : 'dashboard'}
          onTabChange={(menuType) => {
            const item = MENU_MAP[menuType];
            if (item) handleMenuClick(item.type, item.title);
          }}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        {/* Main content area */}
        <main className="flex-1 overflow-hidden">
          <div className="h-full">
            <Suspense fallback={<Loading />}>{page}</Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}