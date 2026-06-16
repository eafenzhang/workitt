import { useState, useCallback, type ReactNode } from 'react';
import { ServerIcon, TerminalIcon, ZapIcon, WrenchIcon } from 'lucide-react';
import MCPTab from '../components/MCPTab';
import CliToolsTab from '../components/CliToolsTab';
import SkillsTab from '../components/SkillsTab';
import PluginsTab from '../components/PluginsTab';
import DataPage from '../components/DataPage';
import { SidebarItem } from '../components/UnifiedSidebar';
import EmptyState from '../components/EmptyState';

const TABS = [
  { id: 'mcp',       label: 'MCP工具',    icon: ServerIcon,   desc: '配置和管理MCP服务器' },
  { id: 'cli',       label: 'CLI工具',    icon: TerminalIcon, desc: '命令行工具管理' },
  { id: 'skills',    label: 'Skill技能',  icon: ZapIcon,      desc: '管理Agent技能' },
  { id: 'plugins',   label: 'Claude插件', icon: WrenchIcon,   desc: '插件扩展管理' },
] as const;

export default function AppEcosystem() {
  const [activeTab, setActiveTab] = useState<string>('mcp');
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tabActions, setTabActions] = useState<ReactNode>(null);

  const activeTabInfo = TABS.find(t => t.id === activeTab);

  const handleRenderActions = useCallback((actions: ReactNode) => {
    setTabActions(actions);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'mcp':       return <MCPTab key={`mcp-${refreshKey}`} hideToolbar onRenderActions={handleRenderActions} />;
      case 'cli':       return <CliToolsTab key={`cli-${refreshKey}`} hideToolbar onRenderActions={handleRenderActions} />;
      case 'skills':    return <SkillsTab key={`skills-${refreshKey}`} hideToolbar onRenderActions={handleRenderActions} />;
      case 'plugins':   return <PluginsTab key={`plugins-${refreshKey}`} hideToolbar onRenderActions={handleRenderActions} />;
      default:          return <EmptyState icon={WrenchIcon} title="选择工具" description="从左侧选择一个工具类别" />;
    }
  };

  return (
    <DataPage
      sidebarOpen={sidebarOpen}
      onToggleSidebar={() => setSidebarOpen(prev => !prev)}
      sidebarTitle="应用生态"
      sidebarItems={TABS.map(tab => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <SidebarItem
            key={tab.id}
            label={tab.label}
            active={active}
            onClick={() => setActiveTab(tab.id)}
            icon={<Icon size={14} style={{ color: active ? 'var(--wiki-accent)' : 'var(--wiki-text3)' }} />}
          />
        );
      })}
      title={activeTabInfo?.label || '应用生态'}
      description={activeTabInfo?.desc || '管理MCP工具、CLI命令、Skill技能和插件'}
      headerActions={tabActions}
      hideSearch
      hideViewToggle
      isEmpty={false}
    >
      {renderContent()}
    </DataPage>
  );
}
