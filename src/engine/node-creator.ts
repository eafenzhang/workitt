// ─── Node Creator — factory functions ─────────────────────────────
// Ported from MinoPencil pen-engine

import { genId } from './document-manager'
import type {
  DesignNode, FrameNode, RectangleNode, EllipseNode,
  TextNode, ImageNode, LineNode, GroupNode, PenFill, PenStroke,
} from './types'

let _posCounter = 0
function nextPos(): number {
  _posCounter++
  return 40 + (_posCounter % 10) * 40
}

export function createFrame(x?: number, y?: number): FrameNode {
  return {
    id: genId(), type: 'frame', name: 'Frame',
    x: x ?? nextPos(), y: y ?? nextPos(),
    width: 320, height: 208,
    rotation: 0, opacity: 1, visible: true, locked: false,
    layout: 'vertical', gap: 12, padding: 16,
    cornerRadius: 8,
    fill: [{ type: 'solid', color: '#f8f9fa' }],
    children: [],
  }
}

export function createRect(x?: number, y?: number): RectangleNode {
  return {
    id: genId(), type: 'rect', name: 'Rectangle',
    x: x ?? nextPos(), y: y ?? nextPos(),
    width: 128, height: 64,
    rotation: 0, opacity: 1, visible: true, locked: false,
    cornerRadius: 8,
    fill: [{ type: 'solid', color: '#6366f1' }],
  }
}

export function createEllipse(x?: number, y?: number): EllipseNode {
  return {
    id: genId(), type: 'ellipse', name: 'Ellipse',
    x: x ?? nextPos(), y: y ?? nextPos(),
    width: 80, height: 80,
    rotation: 0, opacity: 1, visible: true, locked: false,
    fill: [{ type: 'solid', color: '#10b981' }],
  }
}

export function createText(x?: number, y?: number, content?: string): TextNode {
  return {
    id: genId(), type: 'text', name: 'Text',
    x: x ?? nextPos(), y: y ?? nextPos(),
    width: 208, height: 32,
    rotation: 0, opacity: 1, visible: true, locked: false,
    content: content || '文本',
    fontSize: 16, fontWeight: 400,
    fontFamily: 'system-ui',
    color: '#333',
  }
}

export function createImage(x?: number, y?: number, src?: string): ImageNode {
  return {
    id: genId(), type: 'image', name: 'Image',
    x: x ?? nextPos(), y: y ?? nextPos(),
    width: 200, height: 160,
    rotation: 0, opacity: 1, visible: true, locked: false,
    src: src || '',
    cornerRadius: 8,
  }
}

export function createLine(x?: number, y?: number): LineNode {
  return {
    id: genId(), type: 'line', name: 'Line',
    x: x ?? nextPos(), y: y ?? nextPos(),
    width: 0, height: 0,
    rotation: 0, opacity: 1, visible: true, locked: false,
    stroke: { color: '#666', width: 2 },
    endX: 100, endY: 0,
  }
}

export function createGroup(children?: DesignNode[]): GroupNode {
  return {
    id: genId(), type: 'group', name: 'Group',
    x: 0, y: 0, width: 100, height: 100,
    rotation: 0, opacity: 1, visible: true, locked: false,
    children: children || [],
  }
}

export function createNodeByTool(tool: string, x?: number, y?: number): DesignNode | null {
  switch (tool) {
    case 'frame':  return createFrame(x, y)
    case 'rect':   return createRect(x, y)
    case 'ellipse': return createEllipse(x, y)
    case 'text':   return createText(x, y)
    case 'image':  return createImage(x, y)
    case 'line':   return createLine(x, y)
    default:       return null
  }
}

// ─── Fill / Stroke helpers ──
export function solidFill(color: string, opacity?: number): PenFill {
  return { type: 'solid', color, opacity }
}

export function noStroke(): PenStroke | undefined {
  return undefined
}
