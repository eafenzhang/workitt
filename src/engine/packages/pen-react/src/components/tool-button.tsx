import type { ReactNode } from 'react';
import type { ToolType } from '@minopencil/pen-types';
import { useActiveTool } from '../hooks/use-active-tool.js';

interface ToolButtonProps {
  tool: ToolType;
  icon: ReactNode;
  label: string;
  shortcut?: string;
}

/**
 * Reusable tool button that reads/writes the active tool via pen-engine.
 * Uses `isActive` conditional className (not Radix data-state) per code style guide.
 */
export function ToolButton({ tool, icon, label, shortcut }: ToolButtonProps) {
  const [activeTool, setActiveTool] = useActiveTool();
  const isActive = activeTool === tool;

  return (
    <button
      type="button"
      onClick={() => setActiveTool(tool)}
      aria-label={label}
      aria-pressed={isActive}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors [&_svg]:size-3.5 [&_svg]:shrink-0 ${
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      }`}
    >
      {icon}
    </button>
  );
}
