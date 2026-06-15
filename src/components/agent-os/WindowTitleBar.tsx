import { useCallback, type MouseEvent } from 'react';

// ── macOS button colors (hardcoded per design spec) ──────────────

const BTN_RED = '#FF5F57';
const BTN_YELLOW = '#FFBD2E';
const BTN_GREEN = '#28CA41';

interface WindowTitleBarProps {
  title: string;
  isFocused: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMouseDown: (e: MouseEvent<HTMLDivElement>) => void;
}

/**
 * macOS-style window title bar (36px height).
 *
 * Features three traffic-light buttons (close / minimize / maximize)
 * with hover-reveal symbols, a centered title, and drag initiation.
 */
export default function WindowTitleBar({
  title,
  isFocused,
  onClose,
  onMinimize,
  onMaximize,
  onMouseDown,
}: WindowTitleBarProps) {
  const handleButtonClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>, handler: () => void) => {
      e.stopPropagation();
      handler();
    },
    [],
  );

  return (
    <div
      className="flex items-center h-9 flex-shrink-0 select-none relative"
      style={{
        background: 'var(--wiki-surface)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid var(--wiki-border)',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        opacity: isFocused ? 1 : 0.6,
        cursor: 'default',
      }}
      onMouseDown={onMouseDown}
    >
      {/* ── Traffic light buttons ── */}
      <div className="flex items-center gap-2 absolute left-3 top-1/2 -translate-y-1/2">
        {/* Close (red) */}
        <button
          onClick={(e) => handleButtonClick(e, onClose)}
          className="flex items-center justify-center rounded-full transition-colors group focus:outline-none"
          style={{
            width: '12px',
            height: '12px',
            backgroundColor: BTN_RED,
            border: 'none',
            padding: 0,
            lineHeight: 0,
          }}
          aria-label="关闭窗口"
          title="关闭"
        >
          <svg
            width="6"
            height="6"
            viewBox="0 0 6 6"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
          >
            <line
              x1="1"
              y1="1"
              x2="5"
              y2="5"
              stroke="#4A0000"
              strokeWidth="1"
              strokeLinecap="round"
            />
            <line
              x1="5"
              y1="1"
              x2="1"
              y2="5"
              stroke="#4A0000"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Minimize (yellow) */}
        <button
          onClick={(e) => handleButtonClick(e, onMinimize)}
          className="flex items-center justify-center rounded-full transition-colors group focus:outline-none"
          style={{
            width: '12px',
            height: '12px',
            backgroundColor: BTN_YELLOW,
            border: 'none',
            padding: 0,
            lineHeight: 0,
          }}
          aria-label="最小化窗口"
          title="最小化"
        >
          <svg
            width="6"
            height="6"
            viewBox="0 0 6 6"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
          >
            <line
              x1="1"
              y1="3"
              x2="5"
              y2="3"
              stroke="#4A3800"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Maximize (green) */}
        <button
          onClick={(e) => handleButtonClick(e, onMaximize)}
          className="flex items-center justify-center rounded-full transition-colors group focus:outline-none"
          style={{
            width: '12px',
            height: '12px',
            backgroundColor: BTN_GREEN,
            border: 'none',
            padding: 0,
            lineHeight: 0,
          }}
          aria-label="全屏窗口"
          title="全屏"
        >
          <svg
            width="6"
            height="6"
            viewBox="0 0 6 6"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
          >
            <path
              d="M1.5 0.5v1.5H0m6 0H4.5v1.5M0 4h1.5v1.5M6 4H4.5v1.5"
              stroke="#003A00"
              strokeWidth="0.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>
      </div>

      {/* ── Title ── */}
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 truncate pointer-events-none"
        style={{
          fontSize: '13px',
          color: 'var(--wiki-text2)',
          maxWidth: '50%',
        }}
      >
        {title}
      </span>
    </div>
  );
}
