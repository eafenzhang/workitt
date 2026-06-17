// ─── Core Design Types (ported from MinoPencil pen-types) ───────────

export type ToolType =
  | 'select'
  | 'frame'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'text'
  | 'image'
  | 'hand'
  | 'path'

export type SizingBehavior = 'number' | 'fit_content' | 'fill_container'

export type LayoutDirection = 'vertical' | 'horizontal' | 'none'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'

export type BlendMode =
  | 'src-over' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'

export type EffectType = 'shadow' | 'blur' | 'inner-shadow'

export interface PenVector {
  x: number
  y: number
}

export interface PenSize {
  width: number
  height: number
}

export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PenFill {
  type: 'solid' | 'gradient'
  color: string
  opacity?: number
  /** Gradient stops, e.g. ["#ff0000 0%", "#0000ff 100%"] */
  stops?: string[]
  angle?: number
}

export interface PenStroke {
  color: string
  width: number
  dash?: number[]
  lineCap?: 'butt' | 'round' | 'square'
  lineJoin?: 'miter' | 'round' | 'bevel'
}

export interface PenEffect {
  type: EffectType
  color?: string
  offsetX?: number
  offsetY?: number
  blur?: number
  spread?: number
}

export interface PenNodeBase {
  id: string
  type: string
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
}

export interface ContainerProps {
  width: number
  height: number
  layout?: LayoutDirection
  gap?: number
  padding?: Padding | number
  cornerRadius?: number
  fill?: PenFill[]
  stroke?: PenStroke
  effects?: PenEffect[]
}

export interface FrameNode extends PenNodeBase {
  type: 'frame'
  layout?: LayoutDirection
  gap?: number
  padding?: Padding | number
  cornerRadius?: number
  fill?: PenFill[]
  stroke?: PenStroke
  effects?: PenEffect[]
  children?: DesignNode[]
}

export interface RectangleNode extends PenNodeBase {
  type: 'rect'
  cornerRadius?: number
  fill?: PenFill[]
  stroke?: PenStroke
  effects?: PenEffect[]
}

export interface EllipseNode extends PenNodeBase {
  type: 'ellipse'
  fill?: PenFill[]
  stroke?: PenStroke
  effects?: PenEffect[]
}

export interface LineNode extends PenNodeBase {
  type: 'line'
  stroke: PenStroke
  endX?: number
  endY?: number
}

export interface TextNode extends PenNodeBase {
  type: 'text'
  content: string
  fontSize: number
  fontWeight?: number
  fontFamily?: string
  textAlign?: TextAlign
  lineHeight?: number
  color?: string
  fill?: PenFill[]
}

export interface ImageNode extends PenNodeBase {
  type: 'image'
  src?: string
  imagePrompt?: string
  cornerRadius?: number
  fill?: PenFill[]
}

export interface PathNode extends PenNodeBase {
  type: 'path'
  pathData: string
  fill?: PenFill[]
  stroke?: PenStroke
}

export interface GroupNode extends PenNodeBase {
  type: 'group'
  children: DesignNode[]
}

export type DesignNode =
  | FrameNode
  | RectangleNode
  | EllipseNode
  | LineNode
  | TextNode
  | ImageNode
  | PathNode
  | GroupNode

export interface PenPage {
  id: string
  name: string
  children: DesignNode[]
  background?: string
}

export interface PenDocument {
  id: string
  name: string
  pages: PenPage[]
  viewport?: ViewportState
}

export interface ViewportState {
  zoom: number
  scrollX: number
  scrollY: number
}

export interface SelectionState {
  selectedIds: string[]
  activeId: string | null
}

export interface DesignEngineEvents {
  'document:change': { document: PenDocument }
  'selection:change': { selection: SelectionState }
  'viewport:change': { viewport: ViewportState }
  'tool:change': { tool: ToolType }
  'history:change': { canUndo: boolean; canRedo: boolean }
  'node:hover': { nodeId: string | null }
}

export interface HistoryEntry {
  id: string
  timestamp: number
  snapshot: string
}
