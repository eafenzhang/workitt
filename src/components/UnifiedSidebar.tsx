import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { type ReactNode } from 'react';

interface UnifiedSidebarProps {
  open: boolean;
  onToggle: () => void;
  title: string;
  children: ReactNode;
  /** Action buttons shown in title row (e.g. add/edit/delete) */
  actions?: ReactNode;
  /** Fixed content pinned to bottom of sidebar */
  footer?: ReactNode;
}

export default function UnifiedSidebar({ open, onToggle, title, children, actions, footer }: UnifiedSidebarProps) {
  return (
    <div
      className="flex flex-col flex-shrink-0 overflow-hidden"
      style={{
        width: open ? '18%' : '0px',
        minWidth: open ? '180px' : '0px',
        maxWidth: '220px',
        borderRight: open ? '1px solid var(--wiki-border)' : '1px solid transparent',
        background: 'var(--wiki-surface)',
        transition: 'width 200ms ease, min-width 200ms ease',
      }}
    >
      <div className="flex flex-col h-full p-5" style={{ opacity: open ? 1 : 0, transition: 'opacity 150ms ease' }}>
        {/* Title row */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs font-medium text-wiki-text3 uppercase tracking-wider">{title}</span>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>

        {/* Scrollable content */}
        <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          {children}
        </div>

        {/* Fixed footer */}
        {footer && <div className="mt-4 flex-shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

/** Toggle button shown next to the page title when sidebar is collapsed */
export function SidebarToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="p-1 rounded-md hover:bg-wiki-surface2 transition-colors flex-shrink-0"
      title={open ? '收起侧栏' : '展开侧栏'}
    >
      {open ? (
        <ChevronLeftIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
      ) : (
        <ChevronRightIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
      )}
    </button>
  );
}

/** Single sidebar item with optional badge count */
export function SidebarItem({
  label,
  active,
  count,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 hover:bg-wiki-surface2"
      style={{
        background: active ? 'var(--wiki-surface2)' : 'transparent',
        border: active ? '1px solid var(--wiki-border)' : '1px solid transparent',
      }}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span
        className="text-xs flex-1 truncate"
        style={{ color: active ? 'var(--wiki-text)' : 'var(--wiki-text2)' }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          className="text-xs px-1.5 py-0.5 rounded-lg flex-shrink-0"
          style={{
            background: active ? 'var(--wiki-border)' : 'var(--wiki-border)',
            color: active ? 'var(--wiki-text2)' : 'var(--wiki-text3)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
