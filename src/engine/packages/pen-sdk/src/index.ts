/**
 * @minopencil/pen-sdk — MinoPencil SDK
 *
 * High-level API for working with MinoPencil (.op) design files.
 * Combines types, document operations, code generation, and Figma import.
 *
 * @example
 * ```ts
 * import {
 *   type PenDocument,
 *   createEmptyDocument,
 *   normalizePenDocument,
 *   parseFigFile,
 * } from '@minopencil/pen-sdk'
 * ```
 */

// ── Types ──────────────────────────────────────────────────────────────
export type {
  // Document model
  PenDocument,
  PenNode,
  PenNodeType,
  PenPage,
  PenNodeBase,
  ContainerProps,
  SizingBehavior,
  FrameNode,
  GroupNode,
  RectangleNode,
  EllipseNode,
  LineNode,
  PolygonNode,
  PathNode,
  TextNode,
  ImageNode,
  ImageFitMode,
  IconFontNode,
  RefNode,
  // Styles
  PenFill,
  PenStroke,
  PenEffect,
  SolidFill,
  LinearGradientFill,
  RadialGradientFill,
  ImageFill,
  GradientStop,
  BlendMode,
  BlurEffect,
  ShadowEffect,
  StyledTextSegment,
  // Variables
  VariableDefinition,
  VariableValue,
  ThemedValue,
  // Canvas
  ToolType,
  ViewportState,
  // UIKit
  UIKit,
  KitComponent,
  ComponentCategory,
  // Theme presets
  ThemePreset,
  ThemePresetFile,
} from '@minopencil/pen-types';

// ── Core: Document operations ──────────────────────────────────────────
export {
  // ID generation
  generateId,
  // Document creation & tree operations
  createEmptyDocument,
  DEFAULT_FRAME_ID,
  DEFAULT_PAGE_ID,
  findNodeInTree,
  findParentInTree,
  removeNodeFromTree,
  updateNodeInTree,
  flattenNodes,
  insertNodeInTree,
  isDescendantOf,
  getNodeBounds,
  // Page operations
  getActivePage,
  getActivePageChildren,
  setActivePageChildren,
  getAllChildren,
  migrateToPages,
  ensureDocumentNodeIds,
  // Variables
  isVariableRef,
  getDefaultTheme,
  resolveVariableRef,
  resolveColorRef,
  resolveNumericRef,
  resolveNodeForCanvas,
  replaceVariableRefsInTree,
  // Normalization
  normalizePenDocument,
  // Layout
  type Padding,
  resolvePadding,
  computeLayoutPositions,
  getNodeWidth,
  getNodeHeight,
  inferLayout,
  // Text measurement
  parseSizing,
  defaultLineHeight,
  estimateTextWidth,
  estimateTextHeight,
  resolveTextContent,
  hasCjkText,
  // Arc path
  buildEllipseArcPath,
  isArcEllipse,
  // Boolean operations
  type BooleanOpType,
  canBooleanOp,
  executeBooleanOp,
} from '@minopencil/pen-core';

// ── Codegen types (from pen-types) ──────────────────────────────────────
export type {
  Framework,
  PlannedChunk,
  CodePlanFromAI,
  ExecutableChunk,
  CodeExecutionPlan,
  ChunkContract,
  PropDef,
  SlotDef,
  ImportDef,
  ChunkResult,
  ChunkStatus,
  CodeGenProgress,
  ContractValidationResult,
  NodeSnapshot,
  ExecutableChunkPayload,
  ResolvedDepContract,
} from '@minopencil/pen-types';
export { FRAMEWORKS } from '@minopencil/pen-types';

// ── Engine: Headless design engine ────────────────────────────────────
export {
  DesignEngine,
  TypedEventEmitter,
  HistoryManager,
  DocumentManager,
  SelectionManager,
  PageManager,
  VariableManager,
  ViewportController,
  EngineSpatialIndex,
  createNodeForTool,
  isDrawingTool,
  parseSvgToNodes,
  type DesignEngineOptions,
  type DesignEngineEvents,
  type CodePlatform,
  type CodeResult,
} from '@minopencil/pen-engine';

// ── React: React hooks and components ─────────────────────────────────
export * from '@minopencil/pen-react';

// ── Renderer: CanvasKit/Skia rendering engine ────────────────────────
export {
  // Primary API
  loadCanvasKit,
  PenRenderer,
  // Low-level
  SkiaNodeRenderer,
  SkiaFontManager,
  SkiaImageLoader,
  SpatialIndex,
  flattenToRenderNodes,
  resolveRefs,
  premeasureTextHeights,
  // Viewport
  viewportMatrix,
  screenToScene,
  sceneToScreen,
  zoomToPoint,
  // Types
  type RenderNode,
  type PenRendererOptions,
  type IconLookupFn,
} from '@minopencil/pen-renderer';
