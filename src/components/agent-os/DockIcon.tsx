import { useState } from 'react';
import type { DockItem } from '../../types/agent-os';
import type { IconStyle } from './DockIcons';

interface DockIconProps {
  item: DockItem;
  isOpen: boolean;
  /** Whether this app has a minimized window running in the background */
  isMinimized: boolean;
  /** For browser: suppress dot when no windows exist at all */
  noDot?: boolean;
  color: string;
  iconStyle: IconStyle;
  onClick: (type: string) => void;
  onContextMenu?: (type: string, e: React.MouseEvent) => void;
}

/**
 * A single icon in the Dock bar with filled icon, brand color,
 * glass hover effect, running indicator, and tooltip.
 *
 * Linear style: raw lucide icons with hover color transitions and drop-shadow.
 * Gradient style: custom SVG gradient icons (styling handled by the SVG itself).
 */
export default function DockIcon({ item, isOpen, isMinimized, noDot, color, iconStyle, onClick, onContextMenu }: DockIconProps) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = item.icon;

  return (
    <button
      onClick={() => onClick(item.type)}
      onContextMenu={(e) => onContextMenu?.(item.type, e)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex flex-col items-center justify-end relative focus:outline-none"
      style={{
        width: '48px',
        height: '56px',
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: 'default',
      }}
      aria-label={item.label}
      title={item.label}
    >
      {/* ── Icon with glass badge ── */}
      <div
        className="flex items-center justify-center rounded-xl transition-all duration-200 ease-out"
        style={{
          width: '44px',
          height: '44px',
          background: isHovered
            ? `${color}22`
            : isOpen ? `${color}14` : 'transparent',
          transform: isHovered ? 'scale(1.15) translateY(-2px)' : 'scale(1)',
          boxShadow: isHovered
            ? `0 8px 16px ${color}33`
            : 'none',
        }}
      >
        {iconStyle === 'linear' ? (
          <Icon
            size={26}
            style={{
              color: isOpen || isHovered ? color : 'var(--wiki-text3)',
              filter: isHovered ? `drop-shadow(0 2px 4px ${color}44)` : 'none',
              transition: 'color 0.2s, filter 0.2s',
            }}
            strokeWidth={isOpen || isHovered ? 2.4 : 1.6}
          />
        ) : (
          <Icon size={44} />
        )}
      </div>

      {/* ── Running indicator ── */}
      <div
        className="transition-all duration-200"
        style={{
          width: isOpen || isMinimized ? '5px' : '4px',
          height: isOpen || isMinimized ? '5px' : '4px',
          borderRadius: '50%',
          background: isOpen ? color : isMinimized ? '#10b981' : 'var(--wiki-text3)',
          marginTop: '3px',
          opacity: (isOpen || isMinimized) && !noDot ? 1 : 0,
          boxShadow: isOpen ? `0 0 6px ${color}80` : isMinimized ? '0 0 6px rgba(16,185,129,0.6)' : 'none',
        }}
      />

      {/* ── Tooltip ── */}
      <span
        className="absolute left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap z-50 pointer-events-none transition-all duration-150"
        style={{
          bottom: '100%',
          marginBottom: '10px',
          background: isHovered ? 'var(--wiki-text)' : 'transparent',
          color: isHovered ? 'var(--wiki-bg)' : 'transparent',
          opacity: isHovered ? 1 : 0,
          transform: isHovered ? 'translateY(0)' : 'translateY(4px)',
        }}
      >
        {item.label}
      </span>
    </button>
  );
}
