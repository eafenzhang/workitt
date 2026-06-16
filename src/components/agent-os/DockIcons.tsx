// macOS-inspired dock icons — two styles: gradient (filled SVG) and linear (outline lucide)
import React from 'react';
import {
  BotMessageSquareIcon, SparklesIcon, DatabaseIcon, PaletteIcon,
  LightbulbIcon, PackageIcon, CpuIcon, GlobeIcon, MessageSquareIcon,
  SettingsIcon as SettingsLucideIcon, UserIcon, LayersIcon,
  BrainCircuitIcon, ClockIcon, WorkflowIcon, TerminalIcon,
} from 'lucide-react';

interface AppIconProps { size?: number }

// ── Shared gradient-bg icon (retained from macOS-style) ──
function AppIcon({ gradient, Icon, iconColor, size: s = 44 }: {
  gradient: [string, string]; Icon: any; iconColor: string; size?: number;
}) {
  const id = `g-${gradient[0].slice(1)}-${gradient[1].slice(1)}`;
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={gradient[0]} />
          <stop offset="100%" stopColor={gradient[1]} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="11.5" fill={`url(#${id})`} />
      <foreignObject x="10" y="10" width="28" height="28">
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={24} strokeWidth={1.8} style={{ color: iconColor }} />
        </div>
      </foreignObject>
    </svg>
  );
}

// ── Gradient icons ──
export const HomeIcon = (p: AppIconProps) => <AppIcon gradient={['#6366f1', '#8b5cf6']} Icon={BotMessageSquareIcon} iconColor="#ffffff" size={p.size} />;
export const RequirementsIcon = (p: AppIconProps) => <AppIcon gradient={['#f59e0b', '#ef4444']} Icon={SparklesIcon} iconColor="#ffffff" size={p.size} />;
export const KnowledgeIcon = (p: AppIconProps) => <AppIcon gradient={['#10b981', '#06b6d4']} Icon={DatabaseIcon} iconColor="#ffffff" size={p.size} />;
export const DesignStudioIcon = (p: AppIconProps) => <AppIcon gradient={['#ec4899', '#f97316']} Icon={PaletteIcon} iconColor="#ffffff" size={p.size} />;
export const AppEcosystemIcon = (p: AppIconProps) => <AppIcon gradient={['#06b6d4', '#3b82f6']} Icon={PackageIcon} iconColor="#ffffff" size={p.size} />;
export const ModelIcon = (p: AppIconProps) => <AppIcon gradient={['#ef4444', '#f59e0b']} Icon={CpuIcon} iconColor="#ffffff" size={p.size} />;
export const BrowserIcon = (p: AppIconProps) => <AppIcon gradient={['#3b82f6', '#6366f1']} Icon={GlobeIcon} iconColor="#ffffff" size={p.size} />;
export const MessagesIcon = (p: AppIconProps) => <AppIcon gradient={['#14b8a6', '#10b981']} Icon={MessageSquareIcon} iconColor="#ffffff" size={p.size} />;
export const SettingsIcon = (p: AppIconProps) => <AppIcon gradient={['#64748b', '#475569']} Icon={SettingsLucideIcon} iconColor="#ffffff" size={p.size} />;
export const RecentTasksIcon = (p: AppIconProps) => <AppIcon gradient={['#6b7280', '#4b5563']} Icon={LayersIcon} iconColor="#ffffff" size={p.size} />;

// ── New gradient icons for added items ──
export const ChannelsIcon = (p: AppIconProps) => <AppIcon gradient={['#14b8a6', '#0d9488']} Icon={MessageSquareIcon} iconColor="#ffffff" size={p.size} />;
export const BrainIcon = (p: AppIconProps) => <AppIcon gradient={['#8b5cf6', '#6d28d9']} Icon={BrainCircuitIcon} iconColor="#ffffff" size={p.size} />;
export const ClockGradIcon = (p: AppIconProps) => <AppIcon gradient={['#f59e0b', '#d97706']} Icon={ClockIcon} iconColor="#ffffff" size={p.size} />;
export const WorkflowGradIcon = (p: AppIconProps) => <AppIcon gradient={['#6366f1', '#4f46e5']} Icon={WorkflowIcon} iconColor="#ffffff" size={p.size} />;
export const LogsIcon = (p: AppIconProps) => <AppIcon gradient={['#64748b', '#475569']} Icon={TerminalIcon} iconColor="#ffffff" size={p.size} />;

// ── Linear icons — raw lucide components (DockIcon applies color/strokeWidth effects) ──
export const HomeLinearIcon = BotMessageSquareIcon;
export const RequirementsLinearIcon = SparklesIcon;
export const KnowledgeLinearIcon = DatabaseIcon;
export const DesignStudioLinearIcon = PaletteIcon;
export const AppEcosystemLinearIcon = PackageIcon;
export const ModelLinearIcon = CpuIcon;
export const ChannelsLinearIcon = MessageSquareIcon;
export const MemoryLinearIcon = BrainCircuitIcon;
export const SchedulerLinearIcon = ClockIcon;
export const WorkflowsLinearIcon = WorkflowIcon;
export const LogsLinearIcon = TerminalIcon;
export const BrowserLinearIcon = GlobeIcon;
export const MessagesLinearIcon = MessageSquareIcon;
export const SettingsLinearIcon = SettingsLucideIcon;
export const RecentTasksLinearIcon = LayersIcon;

// ── Gradient map ──
export const DOCK_APP_ICONS: Record<string, React.FC<AppIconProps>> = {
  'home': HomeIcon, 'requirements': RequirementsIcon, 'knowledge': KnowledgeIcon,
  'design-studio': DesignStudioIcon, 'model': ModelIcon, 'mcp': AppEcosystemIcon,
  'channels': ChannelsIcon, 'memory': BrainIcon, 'scheduler': ClockGradIcon,
  'workflows': WorkflowGradIcon, 'browser': BrowserIcon, 'messages': MessagesIcon,
  'logs': LogsIcon, 'settings': SettingsIcon, 'recent-tasks': RecentTasksIcon,
};

// ── Linear map ──
export const DOCK_LINEAR_ICONS: Record<string, React.FC<AppIconProps>> = {
  'home': HomeLinearIcon, 'requirements': RequirementsLinearIcon, 'knowledge': KnowledgeLinearIcon,
  'design-studio': DesignStudioLinearIcon, 'model': ModelLinearIcon, 'mcp': AppEcosystemLinearIcon,
  'channels': ChannelsLinearIcon, 'memory': MemoryLinearIcon, 'scheduler': SchedulerLinearIcon,
  'workflows': WorkflowsLinearIcon, 'browser': BrowserLinearIcon, 'messages': MessagesLinearIcon,
  'logs': LogsLinearIcon, 'settings': SettingsLinearIcon, 'recent-tasks': RecentTasksLinearIcon,
};

// ── Brand colors for each icon (used by DockIcon hover effects etc.) ──
export const DOCK_ICON_COLORS: Record<string, string> = {
  'home': '#6366f1', 'requirements': '#f59e0b', 'knowledge': '#10b981',
  'design-studio': '#ec4899', 'model': '#ef4444', 'mcp': '#06b6d4',
  'channels': '#14b8a6', 'memory': '#8b5cf6', 'scheduler': '#f59e0b',
  'workflows': '#6366f1', 'browser': '#3b82f6', 'messages': '#14b8a6',
  'logs': '#64748b', 'settings': '#64748b', 'recent-tasks': '#6b7280',
};

// ── Icon style type ──
export type IconStyle = 'gradient' | 'linear';

export function getIconStyle(): IconStyle {
  try { return (localStorage.getItem('agent-os-icon-style') as IconStyle) || 'linear'; }
  catch { return 'linear'; }
}

export function getIconsForStyle(style: IconStyle) {
  return style === 'linear' ? DOCK_LINEAR_ICONS : DOCK_APP_ICONS;
}
