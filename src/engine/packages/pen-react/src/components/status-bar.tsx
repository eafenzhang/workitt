import { Minus, Plus } from 'lucide-react';
import { useDesignEngine } from '../hooks/use-design-engine.js';
import { useViewport } from '../hooks/use-viewport.js';

export interface StatusBarProps {
  className?: string;
}

export function StatusBar({ className }: StatusBarProps) {
  const engine = useDesignEngine();
  const { zoom } = useViewport();

  const zoomPercent = Math.round(zoom * 100);

  const applyZoom = (newZoom: number) => {
    (engine as any).setZoom?.(newZoom);
  };

  const handleZoomOut = () => applyZoom(zoom / 1.2);
  const handleZoomIn = () => applyZoom(zoom * 1.2);
  const handleZoomReset = () => applyZoom(1);

  return (
    <div
      className={`h-7 bg-card border border-border rounded-lg flex items-center px-1 gap-0.5 shadow-md ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={handleZoomOut}
        aria-label="缩小"
        className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        onClick={handleZoomReset}
        className="min-w-[48px] h-5 text-[11px] text-muted-foreground hover:text-foreground tabular-nums text-center cursor-pointer bg-transparent border-none"
        aria-label="重置缩放"
      >
        {zoomPercent}%
      </button>
      <button
        type="button"
        onClick={handleZoomIn}
        aria-label="放大"
        className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
