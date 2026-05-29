import { useState, useEffect, type ReactNode } from 'react';
import { PanelLeftCloseIcon, PanelLeftOpenIcon, GlobeIcon } from 'lucide-react';

function getAPI() {
  return (window as any).electronAPI;
}

interface Props {
  children?: ReactNode;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export default function TitleBar({ children, sidebarCollapsed = false, onToggleSidebar }: Props) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = getAPI();
    // P1-05: Store unsubscribe function and clean up on unmount
    const unsub = api?.onMaximizeChange?.((v: boolean) => setMaximized(v));
    api?.isMaximized?.().then(setMaximized);
    return () => { if (unsub) unsub(); };
  }, []);

  const handleMinimize = () => { getAPI()?.minimize?.(); };
  const handleMaximize = () => { getAPI()?.maximize?.(); };
  const handleClose = () => { getAPI()?.close?.(); };

  return (
    <div
      className="flex items-center h-10 flex-shrink-0 select-none w-full group"
      style={{ background: 'var(--wiki-surface)', borderBottom: '1px solid var(--wiki-border)', WebkitAppRegion: 'drag' } as any}
    >
      {/* Sidebar toggle button */}
      <button
        onClick={onToggleSidebar}
        className="h-full flex items-center justify-center hover:bg-wiki-surface2 transition-colors flex-shrink-0"
        style={{ width: '52px', WebkitAppRegion: 'no-drag' } as any}
      >
        {sidebarCollapsed
          ? <PanelLeftOpenIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
          : <PanelLeftCloseIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
        }
      </button>

      {/* Tab bar slot — children render here */}
      <div className="flex items-center h-full flex-1 overflow-hidden">
        {children}
      </div>

      {/* Window controls */}
      <div className="flex h-full flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Browser button */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-browser-tab', { detail: { url: '', newTab: true } }))}
          className="w-11 h-full flex items-center justify-center hover:bg-wiki-surface2 transition-colors"
          title="内置浏览器"
        >
          <GlobeIcon size={15} style={{ color: 'var(--wiki-text2)' }} />
        </button>
        <button onClick={handleMinimize} className="w-11 h-full flex items-center justify-center hover:bg-wiki-surface2 transition-colors">
          <svg width="10" height="10" viewBox="0 0 12 12"><rect y="5" width="12" height="1.5" fill="var(--wiki-text2)"/></svg>
        </button>
        <button onClick={handleMaximize} className="w-11 h-full flex items-center justify-center hover:bg-wiki-surface2 transition-colors">
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 13 13"><rect x="2.5" y="0.5" width="9" height="9" rx="1" fill="var(--wiki-surface)" stroke="var(--wiki-text2)" strokeWidth="0.8"/><rect x="0.5" y="2.5" width="9" height="9" rx="1" fill="var(--wiki-surface)" stroke="var(--wiki-text2)" strokeWidth="1.2"/></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 13 13"><rect x="1" y="1" width="11" height="11" rx="1" fill="none" stroke="var(--wiki-text2)" strokeWidth="1.2"/></svg>
          )}
        </button>
        <button onClick={handleClose} className="w-11 h-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors window-close">
          <svg width="10" height="10" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}