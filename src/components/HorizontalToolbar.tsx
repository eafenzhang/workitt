// ─── HorizontalToolbar — Clean horizontal toolbar ──────────────────
// All tools expanded, no background/border/shadow, smaller icons.

import type { ReactNode } from 'react';
import {
  MousePointer2, Square, Circle, Minus, Triangle, Spline,
  Type, Frame, Hand, Undo2, Redo2,
} from 'lucide-react';
import { ToolButton, useHistory } from '@minopencil/pen-react';

export interface HorizontalToolbarProps {
  trailing?: ReactNode;
  className?: string;
}

const SHAPE_TOOLS = [
  { tool: 'rectangle' as const, icon: <Square size={15} />, label: '矩形' },
  { tool: 'ellipse' as const, icon: <Circle size={15} />, label: '椭圆' },
  { tool: 'line' as const, icon: <Minus size={15} />, label: '线条' },
  { tool: 'polygon' as const, icon: <Triangle size={15} />, label: '多边形' },
  { tool: 'path' as const, icon: <Spline size={15} />, label: '钢笔' },
];

const TOOL_ICON_SIZE = 15;

export default function HorizontalToolbar({ trailing, className }: HorizontalToolbarProps) {
  const { canUndo, canRedo, undo, redo } = useHistory();

  const sep = () => <div className="w-px h-5 mx-1 bg-border" />;

  return (
    <div className={`flex items-center gap-0.5 ${className ?? ''}`}>
      {/* Select */}
      <ToolButton tool="select" icon={<MousePointer2 size={TOOL_ICON_SIZE} />} label="选择" shortcut="V" />
      {sep()}

      {/* All shape tools — expanded, no dropdown */}
      {SHAPE_TOOLS.map(t => (
        <ToolButton key={t.tool} tool={t.tool} icon={t.icon} label={t.label} />
      ))}
      {sep()}

      {/* Text + Frame + Hand */}
      <ToolButton tool="text" icon={<Type size={TOOL_ICON_SIZE} />} label="文本" shortcut="T" />
      <ToolButton tool="frame" icon={<Frame size={TOOL_ICON_SIZE} />} label="画框" shortcut="F" />
      <ToolButton tool="hand" icon={<Hand size={TOOL_ICON_SIZE} />} label="手型" shortcut="H" />
      {sep()}

      {/* Undo / Redo */}
      <button type="button" onClick={undo} disabled={!canUndo} className="toolbar-btn disabled:opacity-30" title="撤销 (Ctrl+Z)">
        <Undo2 size={TOOL_ICON_SIZE} />
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} className="toolbar-btn disabled:opacity-30" title="重做 (Ctrl+Shift+Z)">
        <Redo2 size={TOOL_ICON_SIZE} />
      </button>

      {/* Trailing slot (image import) */}
      {trailing && <>{sep()}{trailing}</>}
    </div>
  );
}
