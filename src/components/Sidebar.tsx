import { useNavigate } from 'react-router-dom';
import { DatabaseIcon, LightbulbIcon, LayoutDashboardIcon, SparklesIcon, SettingsIcon, ServerIcon, CpuIcon, MessageSquareIcon } from 'lucide-react';

interface SidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const navItems = [
  { id: 'dashboard', label: `仪表盘`, icon: LayoutDashboardIcon, color: 'var(--wiki-text)', path: '/' },
  { id: 'requirements', label: `采集库`, icon: SparklesIcon, color: 'var(--wiki-text)', path: '/requirements' },
  { id: 'knowledge', label: `知识库`, icon: DatabaseIcon, color: 'var(--wiki-text)', path: '/knowledge' },
  { id: 'insights', label: `洞察分析`, icon: LightbulbIcon, color: '#10b981', path: '/insights' },
  { id: 'model', label: `模型配置`, icon: CpuIcon, color: '#f59e0b', path: '/model' },
  { id: 'mcp', label: `MCP工具`, icon: ServerIcon, color: '#ef4444', path: '/mcp' },
  { id: 'messages', label: `消息中心`, icon: MessageSquareIcon, color: '#ec4899', path: '/messages' },
];

export default function Sidebar({
  activeTab = 'dashboard',
  onTabChange = () => {},
  collapsed = false,
  onCollapsedChange = () => {},
}: SidebarProps) {
  const navigate = useNavigate();

  const isActive = (item: typeof navItems[0]) => {
    return item.id === activeTab;
  };

  const handleNavClick = (item: typeof navItems[0]) => {
    navigate(item.path);
    onTabChange(item.id);
  };

  const handleSettingsClick = () => {
    navigate('/settings');
    onTabChange('settings');
  };

  const width = collapsed ? '0px' : '52px';
  const minWidth = collapsed ? '0px' : '52px';

  return (
    <aside
      data-cmp="Sidebar"
      className="flex flex-col h-full relative transition-[width,min-width] duration-300 ease-in-out"
      style={{
        width,
        minWidth,
        background: 'var(--wiki-surface)',
        borderRight: collapsed ? 'none' : '1px solid var(--wiki-border)',
        overflow: 'hidden',
      }}
    >
      {/* Nav */}
      <nav className="flex flex-col gap-1 px-1.5 pt-6 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin" style={{ width: '52px', minWidth: '52px' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              title={item.label}
              className="flex items-center px-1.5 rounded-lg transition-all duration-200 text-left relative group"
              style={{
                background: 'transparent',
                border: '1px solid transparent',
                justifyContent: 'center',
                gap: '0',
                height: '44px',
                width: '100%',
              }}
            >
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 transition-all duration-200"
                style={{
                  background: active ? 'var(--wiki-surface2)' : 'transparent',
                }}
              >
                <Icon size={18} style={{ color: active ? 'var(--wiki-text)' : 'var(--wiki-text3)' }} />
              </div>
              {/* Hover tooltip */}
              <span className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50"
                style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Settings */}
        <button
          onClick={handleSettingsClick}
          title="系统设置"
          className="flex items-center px-1.5 rounded-lg transition-all duration-200 text-left hover:bg-wiki-surface2 relative group"
          style={{
            justifyContent: 'center',
            gap: '0',
            background: 'transparent',
            border: '1px solid transparent',
            height: '44px',
            width: '100%',
          }}
        >
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 transition-all duration-200"
            style={{
              background: activeTab === 'settings' ? 'var(--wiki-surface2)' : 'transparent',
            }}
          >
            <SettingsIcon size={18} style={{ color: activeTab === 'settings' ? 'var(--wiki-text)' : 'var(--wiki-text3)' }} />
          </div>
          <span className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50"
            style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>系统设置</span>
        </button>
      </nav>

      {/* User */}
      <div className="px-1.5 pb-4">
        <div
          className="relative flex items-center justify-center px-1.5 rounded-lg transition-all duration-200"
          style={{ height: '44px' }}
        >
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--wiki-text2)' }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>
      </div>
    </aside>
  );
}
