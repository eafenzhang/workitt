import { XIcon } from 'lucide-react';
import { type ReactNode } from 'react';

interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  /** Header content (title, metadata, actions) */
  header: ReactNode;
  /** Main scrollable content */
  children: ReactNode;
  /** Footer content (action buttons, etc.) shown only if provided */
  footer?: ReactNode;
  /** Width override, defaults to w-2/5 */
  width?: string;
}

export default function DetailPanel({
  open,
  onClose,
  header,
  children,
  footer,
  width = 'w-2/5',
}: DetailPanelProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ background: 'var(--wiki-overlay)' }}
      onClick={onClose}
    >
      <div
        className={`fixed inset-y-0 right-0 ${width} flex flex-col z-50`}
        style={{
          background: 'var(--wiki-surface)',
          borderLeft: '1px solid var(--wiki-border)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--wiki-border)' }}
        >
          <div className="flex-1 min-w-0">{header}</div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-wiki-surface2 focus:outline-none flex-shrink-0"
          >
            <XIcon size={18} style={{ color: 'var(--wiki-text3)' }} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="px-6 py-4 flex-shrink-0"
            style={{ borderTop: '1px solid var(--wiki-border)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
