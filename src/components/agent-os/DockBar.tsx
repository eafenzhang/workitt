import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useAgentOS } from '../../context/AgentOSContext';
import type { DockItem, OSWindow } from '../../types/agent-os';
import DockIcon from './DockIcon';
import { GlobeIcon, LayersIcon } from 'lucide-react';
import { getIconStyle, getIconsForStyle, type IconStyle } from './DockIcons';

// ── Dock items with dynamic icon style ──

function getDockItems(style: IconStyle): (DockItem & { color: string })[] {
  const icons = getIconsForStyle(style);
  return [
    { id: 'home', label: '会话', icon: icons['home'], type: 'home', color: '#6366f1' },
    { id: 'requirements', label: '采集库', icon: icons['requirements'], type: 'requirements', color: '#f59e0b' },
    { id: 'knowledge', label: '知识库', icon: icons['knowledge'], type: 'knowledge', color: '#10b981' },
    { id: 'design-studio', label: '设计稿', icon: icons['design-studio'], type: 'design-studio', color: '#ec4899' },
    { id: 'model', label: '模型配置', icon: icons['model'], type: 'model', color: '#ef4444' },
    { id: 'mcp', label: '工具', icon: icons['mcp'], type: 'mcp', color: '#06b6d4' },
    { id: 'channels', label: 'IM通道', icon: icons['channels'], type: 'channels', color: '#14b8a6' },
    { id: 'memory', label: '记忆', icon: icons['memory'], type: 'memory', color: '#8b5cf6' },
    { id: 'scheduler', label: '定时任务', icon: icons['scheduler'], type: 'scheduler', color: '#f59e0b' },
    { id: 'workflows', label: '工作流', icon: icons['workflows'], type: 'workflows', color: '#6366f1' },
    { id: 'browser', label: '浏览器', icon: icons['browser'], type: 'browser', color: '#3b82f6' },
    { id: 'logs', label: '日志', icon: icons['logs'], type: 'logs', color: '#64748b' },
    { id: 'settings', label: '系统设置', icon: icons['settings'], type: 'settings', color: '#64748b' },
  ];
}

type DockState = 'show' | 'hide' | 'float';

/** macOS-style Dock icon for 最近任务 */
function TaskIcon({ onClick, style }: { onClick: () => void; style: IconStyle }) {
  const [hovered, setHovered] = useState(false);
  const color = '#6b7280';
  const icons = getIconsForStyle(style);
  const Icon = icons['recent-tasks'];
  const isGradient = style === 'gradient';
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className="flex flex-col items-center justify-end relative focus:outline-none"
      style={{ width: '48px', height: '56px', border: 'none', background: 'transparent', padding: 0 }}
      aria-label="最近任务" title="最近任务">
      <div className="flex items-center justify-center rounded-xl transition-all duration-200 ease-out"
        style={{ width: '44px', height: '44px', background: hovered ? `${color}22` : 'transparent',
          transform: hovered ? 'scale(1.15) translateY(-2px)' : 'scale(1)', boxShadow: hovered ? `0 8px 16px ${color}33` : 'none' }}>
        {isGradient ? (
          <Icon size={44} />
        ) : (
          <Icon size={26} strokeWidth={hovered ? 2.4 : 1.6}
            style={{ color: hovered ? color : 'var(--wiki-text3)',
              filter: hovered ? `drop-shadow(0 2px 4px ${color}44)` : 'none',
              transition: 'color 0.2s, filter 0.2s' }} />
        )}
      </div>
      <div style={{ width: '4px', height: '4px', marginTop: '3px', opacity: 0 }} />
      <span className="absolute left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap z-50 pointer-events-none transition-all duration-150"
        style={{ bottom: '100%', marginBottom: '10px', background: hovered ? 'var(--wiki-text)' : 'transparent',
          color: hovered ? 'var(--wiki-bg)' : 'transparent', opacity: hovered ? 1 : 0, transform: hovered ? 'translateY(0)' : 'translateY(4px)' }}>
        最近任务
      </span>
    </button>
  );
}

/**
 * macOS-style bottom Dock bar positioned absolute in the shared container.
 *
 * DesktopArea fills the full container (wallpaper covers entire area),
 * DockBar sits on top with glassmorphism overlay.
 *
 * Behavior (all wrt. maximized windows only — see AgentOSDesktop):
 *  - show:  Normal glassmorphism bar, always interactive.
 *  - hide:  Hidden entirely.
 *  - float: Semi-transparent overlay that appears on hover.
 */
export default function DockBar({
  settingsVersion,
  dockState = 'show',
}: {
  settingsVersion?: number;
  dockState?: DockState;
}) {
  const { state, openWindow, openNewBrowserWindow, focusWindow, minimizeWindow, closeWindow } = useAgentOS();
  const { windows } = state;

  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  const [dockHovered, setDockHovered] = useState(false);
  const [iconStyle, setIconStyle] = useState<IconStyle>(getIconStyle);

  const DOCK_ITEMS = useMemo(() => getDockItems(iconStyle), [iconStyle]);

  const browserWindows = useMemo(
    () => windows.filter((w: OSWindow) => w.type === 'browser' && !w.isMinimized),
    [windows],
  );

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Listen for icon style changes from settings
  useEffect(() => {
    const handler = () => setIconStyle(getIconStyle());
    window.addEventListener('agent-os-icon-style-changed', handler);
    return () => window.removeEventListener('agent-os-icon-style-changed', handler);
  }, []);

  const isOpen = useCallback(
    (type: string) => windows.some((w: OSWindow) => w.type === type && !w.isMinimized),
    [windows],
  );

  const isMinimized = useCallback(
    (type: string) => windows.some((w: OSWindow) => w.type === type && w.isMinimized),
    [windows],
  );

  const handleDockClick = useCallback(
    (type: string) => {
      const item = DOCK_ITEMS.find((d) => d.type === type);
      if (!item) return;
      if (type === 'browser') {
        const existingBrowser = windows.find((w: OSWindow) => w.type === 'browser');
        if (existingBrowser) {
          if (existingBrowser.isMinimized) {
            focusWindow(existingBrowser.id);
          } else {
            minimizeWindow(existingBrowser.id);
          }
        } else {
          openNewBrowserWindow();
        }
        return;
      }
      const existing = windows.find((w: OSWindow) => w.type === type);
      if (existing) {
        if (existing.isMinimized) {
          focusWindow(existing.id);
        } else {
          minimizeWindow(existing.id);
        }
      } else {
        openWindow(type, item.label);
      }
    },
    [windows, openWindow, openNewBrowserWindow, focusWindow, minimizeWindow],
  );

  // Right-click: browser → Finder modal; others → context menu
  const [contextMenu, setContextMenu] = useState<{ type: string; label: string; x: number; y: number } | null>(null);

  const handleContextMenu = useCallback(
    (type: string, e: React.MouseEvent) => {
      e.preventDefault();
      if (type === 'browser') {
        setBrowserModalOpen(true);
        return;
      }
      const item = DOCK_ITEMS.find((d) => d.type === type);
      setContextMenu({ type, label: item?.label || type, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const isFloat = dockState === 'float';
  const isHide = dockState === 'hide';

  // Float: always visible at full opacity, click-through when not hovered
  // Hide (auto-hide): hidden by default, fades in on bottom hover
  // Show: always visible
  const showDock = isHide ? dockHovered : true;

  // ── Browser context menu modal (Finder-style centered overlay) ──
  const [browserModalOpen, setBrowserModalOpen] = useState(false);

  // Keyboard: Escape to close browser modal
  useEffect(() => {
    if (!browserModalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBrowserModalOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [browserModalOpen]);

  // Keyboard: Escape to close context menu
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [contextMenu]);

  // ── 最近任务 (all running windows, not just minimized) ──
  const [taskManagerOpen, setTaskManagerOpen] = useState(false);
  const [taskManagerAnim, setTaskManagerAnim] = useState(false);
  const runningWindows = useMemo(
    () => (windows as OSWindow[]).filter(w => !w.isMinimized),
    [windows],
  );

  // Fade animation on open/close
  const openTaskManager = useCallback(() => {
    setTaskManagerOpen(true);
    requestAnimationFrame(() => setTaskManagerAnim(true));
  }, []);
  const closeTaskManager = useCallback(() => {
    setTaskManagerAnim(false);
    setTimeout(() => setTaskManagerOpen(false), 250);
  }, []);

  // Escape key to close task manager
  useEffect(() => {
    if (!taskManagerOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTaskManager(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [taskManagerOpen, closeTaskManager]);

  return (
    <>
      {/* ── Hover trigger zone for auto-hide mode ── */}
      {isHide && (
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: '72px', zIndex: 9998 }}
          onMouseEnter={() => setDockHovered(true)}
          onMouseLeave={() => setDockHovered(false)}
        />
      )}

      <div
        className="absolute bottom-0 left-0 right-0 flex justify-center pb-2"
        style={{ zIndex: isFloat || isHide ? 9999 : 50 }}
        onMouseEnter={() => { if (isHide) setDockHovered(true); }}
        onMouseLeave={() => { if (isHide) setDockHovered(false); }}
      >
        <div
          className="flex items-center gap-1 px-3 py-2"
          style={{
            height: '68px',
            borderRadius: '20px',
            background: isDark
              ? 'rgba(20,20,25,0.78)'
              : 'rgba(248,248,252,0.82)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: isDark
              ? '1px solid rgba(255,255,255,0.08)'
              : '1px solid rgba(255,255,255,0.6)',
            boxShadow: isDark
              ? '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)'
              : '0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
            opacity: showDock ? 1 : 0,
            transform: showDock ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
            pointerEvents: isHide && !dockHovered ? 'none' : 'auto',
          }}
        >
        {/* ── 最近任务 button (DockIcon replica) ── */}
        <TaskIcon onClick={openTaskManager} style={iconStyle} />{''}

        {DOCK_ITEMS.map((item) => (
          <DockIcon
            key={item.id}
            item={item}
            color={item.color}
            iconStyle={iconStyle}
            isOpen={isOpen(item.type)}
            isMinimized={isMinimized(item.type)}
            noDot={item.type === 'browser' ? windows.filter(w => w.type === 'browser').length === 0 : undefined}
            onClick={handleDockClick}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      {/* ── Browser window list modal (Finder-style centered) ── */}
      {browserModalOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{
            background: 'rgba(0,0,0,0.45)',
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => setBrowserModalOpen(false)}
        >
          <div
            className="rounded-xl overflow-hidden w-[420px] max-h-[440px] flex flex-col mx-4"
            style={{
              background: 'var(--wiki-surface)',
              border: '1px solid var(--wiki-border)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--wiki-border)' }}
            >
              <div className="flex items-center gap-2">
                <GlobeIcon size={15} style={{ color: 'var(--wiki-text2)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>
                  浏览器窗口 ({browserWindows.length})
                </span>
              </div>
              <button
                onClick={() => setBrowserModalOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-wiki-surface2 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 11 11"><line x1="1.5" y1="1.5" x2="9.5" y2="9.5" stroke="var(--wiki-text3)" strokeWidth="1.2"/><line x1="9.5" y1="1.5" x2="1.5" y2="9.5" stroke="var(--wiki-text3)" strokeWidth="1.2"/></svg>
              </button>
            </div>

            {/* ── Window list ── */}
            <div className="flex-1 overflow-y-auto">
              {browserWindows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <GlobeIcon size={28} style={{ color: 'var(--wiki-text3)', opacity: 0.4 }} />
                  <span className="text-sm" style={{ color: 'var(--wiki-text3)' }}>无打开窗口</span>
                </div>
              ) : (
                browserWindows.map((bw) => (
                  <div
                    key={bw.id}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors group"
                    style={{ borderBottom: '1px solid var(--wiki-border)', color: 'var(--wiki-text)', fontSize: '13px' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--wiki-surface2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => {
                      focusWindow(bw.id);
                      setBrowserModalOpen(false);
                    }}
                  >
                    <GlobeIcon size={15} style={{ color: bw.webviewTier === 'warm' ? '#f59e0b' : 'var(--wiki-text3)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate flex items-center gap-1" style={{ color: 'var(--wiki-text)' }}>
                        {bw.title || bw.initialUrl || '新标签页'}
                        {bw.webviewTier === 'warm' && (
                          <span className="text-xs px-1 rounded" style={{ background: '#f59e0b20', color: '#f59e0b' }}>后台</span>
                        )}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--wiki-text3)' }}>
                        {bw.initialUrl || bw.params?.url || ''}
                      </div>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1 rounded hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeWindow(bw.id);
                        if (browserWindows.length <= 1) setBrowserModalOpen(false);
                      }}
                      title="关闭"
                    >
                      <svg width="11" height="11" viewBox="0 0 11 11"><line x1="2" y1="2" x2="9" y2="9" stroke="var(--wiki-text3)" strokeWidth="1.2"/><line x1="9" y1="2" x2="2" y2="9" stroke="var(--wiki-text3)" strokeWidth="1.2"/></svg>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid var(--wiki-border)' }}>
              <button
                className="flex-1 py-1.5 text-xs rounded-md hover:bg-wiki-surface2 transition-colors"
                style={{ color: 'var(--wiki-accent)' }}
                onClick={() => {
                  openNewBrowserWindow();
                  setBrowserModalOpen(false);
                }}
              >
                新建窗口
              </button>
              {browserWindows.length > 0 && (
                <button
                  className="flex-1 py-1.5 text-xs rounded-md hover:bg-red-50 transition-colors"
                  style={{ color: 'var(--wiki-danger)' }}
                  onClick={() => {
                    browserWindows.forEach(bw => closeWindow(bw.id));
                    setBrowserModalOpen(false);
                  }}
                >
                  关闭全部 ({browserWindows.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Dock icon context menu (non-browser apps) ── */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-[10001]"
          onClick={() => setContextMenu(null)}
        >
          <div
            className="absolute rounded-xl overflow-hidden"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              background: isDark
                ? 'rgba(28,28,33,0.92)'
                : 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: isDark
                ? '1px solid rgba(255,255,255,0.1)'
                : '1px solid rgba(0,0,0,0.08)',
              boxShadow: isDark
                ? '0 8px 32px rgba(0,0,0,0.5)'
                : '0 8px 32px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                windows
                  .filter((w: OSWindow) => w.type === contextMenu.type)
                  .forEach((w) => closeWindow(w.id));
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-wiki-surface2 transition-colors flex items-center gap-2 whitespace-nowrap"
              style={{ color: 'var(--wiki-text)' }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13">
                <line x1="2" y1="2" x2="11" y2="11" stroke="var(--wiki-text3)" strokeWidth="1.2" strokeLinecap="round"/>
                <line x1="11" y1="2" x2="2" y2="11" stroke="var(--wiki-text3)" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              关闭窗口
            </button>
          </div>
        </div>
      )}

    </div>
      {/* ── 最近任务 - fullscreen semi-transparent overlay ── */}
      {taskManagerOpen && (
        <div
          className="fixed inset-0 z-[99999] flex flex-col"
          style={{
            background: 'rgba(0,0,0,0.62)',
            backdropFilter: 'blur(16px) saturate(120%)',
            WebkitBackdropFilter: 'blur(16px) saturate(120%)',
            opacity: taskManagerAnim ? 1 : 0,
            transition: 'opacity 0.22s ease-out',
          }}
          onClick={closeTaskManager}
        >
          {/* Title */}
          <div className="flex-shrink-0 pt-12 pb-4 text-center" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold tracking-wide" style={{ color: 'rgba(255,255,255,0.9)' }}>
              最近任务
            </h2>
          </div>

          {/* Scrollable grid */}
          <div
            className="flex-1 overflow-y-auto px-8 pb-4 scrollbar-thin"
          >
            {runningWindows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <LayersIcon size={48} style={{ color: 'rgba(255,255,255,0.2)' }} />
                <span className="mt-4 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>无运行中应用</span>
              </div>
            ) : (
              <div className="w-full max-w-[840px] mx-auto grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {runningWindows.map(w => {
                  const item = DOCK_ITEMS.find(d => d.type === w.type);
                  const Icon = item?.icon || GlobeIcon;
                  return (
                    <button
                      key={w.id}
                      onClick={() => { focusWindow(w.id); closeTaskManager(); }}
                      className="group flex flex-col gap-3 p-4 rounded-xl text-left transition-all duration-200 hover:scale-[1.02]"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: item?.color + '25' || 'rgba(255,255,255,0.08)' }}>
                          <Icon size={18} style={{ color: item?.color || 'rgba(255,255,255,0.7)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{w.title}</div>
                          <div className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{item?.label || w.type}</div>
                        </div>
                      </div>
                      <div className="w-full h-20 rounded-lg overflow-hidden" style={{
                        background: `linear-gradient(135deg, ${item?.color || '#3b82f6'}20, ${item?.color || '#6366f1'}0a)`,
                        border: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <div className="flex items-center justify-center h-full">
                          <Icon size={28} style={{ color: 'rgba(255,255,255,0.12)' }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sticky clear-all button */}
          {runningWindows.length > 0 && (
            <div className="flex-shrink-0 flex justify-center pb-10 pt-2" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => { runningWindows.forEach(w => closeWindow(w.id)); closeTaskManager(); }}
                className="px-5 py-2 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  color: 'rgba(252,165,165,0.9)',
                  border: '1px solid rgba(239,68,68,0.25)',
                }}
              >
                一键清空 ({runningWindows.length})
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
