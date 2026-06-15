import type React from 'react';
import { MonitorIcon, LayoutGridIcon } from 'lucide-react';
import { useCallback } from 'react';

interface OSToggleButtonProps {
  isOSMode: boolean;
  onToggle: () => void;
}

/**
 * Toggle button that switches between classic layout and Agent OS desktop mode.
 *
 * Renders inside the TitleBar's window-control area, using a compact 32×32px
 * hit-target with lucide-react icons.
 */
export default function OSToggleButton({ isOSMode, onToggle }: OSToggleButtonProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle();
    },
    [onToggle],
  );

  return (
    <button
      onClick={handleClick}
      className="w-11 h-full flex items-center justify-center hover:bg-wiki-surface2 transition-colors focus:outline-none"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      aria-label={isOSMode ? '切换到应用模式' : '切换到桌面模式'}
      title={isOSMode ? '切换到应用模式' : '切换到桌面模式'}
    >
      {isOSMode ? (
        <LayoutGridIcon size={15} style={{ color: 'var(--wiki-text2)' }} />
      ) : (
        <MonitorIcon size={15} style={{ color: 'var(--wiki-text2)' }} />
      )}
    </button>
  );
}
