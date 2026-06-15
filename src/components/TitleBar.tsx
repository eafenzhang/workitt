import { useState, useEffect, type ReactNode } from 'react';
import { PanelLeftCloseIcon, PanelLeftOpenIcon, GlobeIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import OSToggleButton from './agent-os/OSToggleButton';

function getAPI(): ElectronAPI | undefined {
  return window.electronAPI;
}

interface Props {
  children?: ReactNode;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenBrowser?: () => void;
  /** OS mode toggle callback — renders the toggle button when provided */
  onToggleOSMode?: () => void;
  /** Current OS mode state — controls toggle button icon */
  isOSMode?: boolean;
}

export default function TitleBar({ children, sidebarCollapsed = false, onToggleSidebar, onOpenBrowser, onToggleOSMode, isOSMode = false }: Props) {
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const api = getAPI();
    const unsub = api?.onMaximizeChange?.((v: boolean) => setMaximized(!!v));
    const unsubFS = api?.onFullscreenChange?.((v: boolean) => setFullscreen(!!v));
    api?.isMaximized?.().then((v: any) => setMaximized(!!v));
    api?.isFullScreen?.().then((v: any) => setFullscreen(!!v));
    return () => { if (unsub) unsub(); if (unsubFS) unsubFS(); };
  }, []);

  const handleMinimize = () => { getAPI()?.minimize?.(); };
  const handleMaximize = () => { getAPI()?.maximize?.(); };
  const handleClose = () => { getAPI()?.close?.(); };
  const handleFullscreen = () => { getAPI()?.setFullScreen?.(!fullscreen); };

  return (
    <div
      className="glass flex items-center h-10 flex-shrink-0 select-none w-full group"
      style={{ borderBottom: '1px solid var(--wiki-border)', WebkitAppRegion: 'drag' } as any}
    >
      {/* Sidebar toggle button — hidden in OS mode */}
      {!isOSMode && (
      <button
        onClick={onToggleSidebar}
        className="h-full flex items-center justify-center hover:bg-wiki-surface2 transition-colors flex-shrink-0 focus:outline-none"
        style={{ width: '52px', WebkitAppRegion: 'no-drag' } as any}
        aria-label="切换侧边栏"
        title="切换侧边栏"
      >
        {sidebarCollapsed
          ? <PanelLeftOpenIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
          : <PanelLeftCloseIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
        }
      </button>
      )}

      {/* Tab bar slot — children render here */}
      <div className="flex items-center h-full flex-1 overflow-hidden">
        {children}
      </div>

      {/* Window controls */}
      <div className="flex h-full flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Browser button — hidden in OS mode */}
        {!isOSMode && (
        <button
          onClick={() => onOpenBrowser?.()}
          className="w-11 h-full flex items-center justify-center hover:bg-wiki-surface2 transition-colors focus:outline-none"
          title="内置浏览器"
          aria-label="内置浏览器"
        >
          <GlobeIcon size={15} style={{ color: 'var(--wiki-text2)' }} />
        </button>
        )}
        {/* OS mode toggle button */}
        {onToggleOSMode && (
          <OSToggleButton isOSMode={isOSMode} onToggle={onToggleOSMode} />
        )}
        <button onClick={handleFullscreen} className="w-11 h-full flex items-center justify-center hover:bg-wiki-surface2 transition-colors focus:outline-none" aria-label="全屏" title="全屏">
          {fullscreen ? <Minimize2Icon size={15} style={{ color: 'var(--wiki-text2)' }} /> : <Maximize2Icon size={15} style={{ color: 'var(--wiki-text2)' }} />}
        </button>
        <button onClick={handleMinimize} className="w-11 h-full flex items-center justify-center hover:bg-wiki-surface2 transition-colors focus:outline-none" aria-label="最小化" title="最小化">
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><rect y="5" width="12" height="1.5" fill="var(--wiki-text2)"/></svg>
        </button>
        <button onClick={handleMaximize} className="w-11 h-full flex items-center justify-center hover:bg-wiki-surface2 transition-colors focus:outline-none" aria-label="最大化" title="最大化">
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 13 13" aria-hidden="true"><rect x="2.5" y="0.5" width="9" height="9" rx="1" fill="var(--wiki-surface)" stroke="var(--wiki-text2)" strokeWidth="0.8"/><rect x="0.5" y="2.5" width="9" height="9" rx="1" fill="var(--wiki-surface)" stroke="var(--wiki-text2)" strokeWidth="1.2"/></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 13 13" aria-hidden="true"><rect x="1" y="1" width="11" height="11" rx="1" fill="none" stroke="var(--wiki-text2)" strokeWidth="1.2"/></svg>
          )}
        </button>
        <button onClick={handleClose} className="w-11 h-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors window-close focus:outline-none" aria-label="关闭" title="关闭">
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}