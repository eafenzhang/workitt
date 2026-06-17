// ─── DesignEngine — Main Facade ───────────────────────────────────
// Ported from MinoPencil pen-engine

import { TypedEventEmitter } from './event-emitter'
import { DocumentManager, genId } from './document-manager'
import { HistoryManager } from './history-manager'
import { SelectionManager } from './selection-manager'
import { ViewportController } from './viewport-controller'
import { createNodeByTool } from './node-creator'
import type {
  PenDocument, DesignNode, DesignEngineEvents,
  ToolType, ViewportState, SelectionState,
  PenVector, PenSize,
} from './types'

export class DesignEngine {
  readonly events = new TypedEventEmitter<DesignEngineEvents>()
  readonly documentManager: DocumentManager
  readonly historyManager: HistoryManager
  readonly selectionManager: SelectionManager
  readonly viewportController: ViewportController

  private _tool: ToolType = 'select'

  constructor(initialDocument?: PenDocument) {
    this.historyManager = new HistoryManager((canUndo, canRedo) => {
      this.events.emit('history:change', { canUndo, canRedo })
    })
    this.selectionManager = new SelectionManager(
      (ids, active) => {
        this.events.emit('selection:change', { selection: { selectedIds: ids, activeId: active } })
      },
      (nodeId) => {
        this.events.emit('node:hover', { nodeId })
      },
    )
    this.viewportController = new ViewportController((zoom, scrollX, scrollY) => {
      this.events.emit('viewport:change', { viewport: { zoom, scrollX, scrollY } })
    })

    this.documentManager = new DocumentManager(initialDocument, (doc) => {
      this.events.emit('document:change', { document: doc })
      this.historyManager.pushSnapshot(this.documentManager.getDocumentJson())
    })
  }

  // ── Tool ──

  get tool(): ToolType { return this._tool }
  setTool(t: ToolType): void {
    this._tool = t
    this.events.emit('tool:change', { tool: t })
  }

  // ── Document ──

  loadDocument(doc: PenDocument): void {
    this.historyManager.clear()
    this.selectionManager.clear()
    this.documentManager.loadDocument(doc)
  }

  getDocument(): PenDocument {
    return this.documentManager.document
  }

  // ── Nodes ──

  addNode(node: DesignNode, parentId?: string): void {
    this.documentManager.addNode(node, parentId)
    this.selectionManager.select([node.id], node.id)
  }

  createNodeByTool(tool: string, x?: number, y?: number): DesignNode | null {
    const node = createNodeByTool(tool, x, y)
    if (node) this.addNode(node)
    return node
  }

  updateNode(id: string, patch: Partial<DesignNode>): void {
    this.documentManager.updateNode(id, patch)
  }

  removeSelected(): void {
    const ids = this.selectionManager.selectedIds
    if (ids.length === 0) return
    for (const id of ids) this.documentManager.removeNode(id)
    this.selectionManager.clear()
  }

  duplicateSelected(): void {
    const id = this.selectionManager.activeId
    if (!id) return
    const newId = this.documentManager.duplicateNode(id)
    if (newId) this.selectionManager.select([newId], newId)
  }

  moveNode(id: string, dx: number, dy: number): void {
    this.documentManager.moveNode(id, dx, dy)
  }

  setNodePosition(id: string, pos: Partial<PenVector>): void {
    this.documentManager.setNodePosition(id, pos)
  }

  setNodeSize(id: string, size: Partial<PenSize>): void {
    this.documentManager.setNodeSize(id, size)
  }

  groupSelected(): void {
    const ids = this.selectionManager.selectedIds
    if (ids.length < 2) return
    const groupId = this.documentManager.groupNodes(ids)
    if (groupId) this.selectionManager.select([groupId], groupId)
  }

  ungroupSelected(): void {
    const id = this.selectionManager.activeId
    if (!id) return
    this.documentManager.ungroupNode(id)
    this.selectionManager.clear()
  }

  // ── Selection ──

  select(ids: string[], activeId?: string | null): void {
    this.selectionManager.select(ids, activeId)
  }

  clearSelection(): void {
    this.selectionManager.clear()
  }

  get selectedIds(): string[] { return this.selectionManager.selectedIds }
  get activeId(): string | null { return this.selectionManager.activeId }

  // ── Viewport ──

  setZoom(z: number, cx?: number, cy?: number): void {
    this.viewportController.setZoom(z, cx, cy)
  }

  pan(dx: number, dy: number): void {
    this.viewportController.pan(dx, dy)
  }

  get viewport(): ViewportState {
    return {
      zoom: this.viewportController.zoom,
      scrollX: this.viewportController.scrollX,
      scrollY: this.viewportController.scrollY,
    }
  }

  // ── History ──

  undo(): void {
    const current = this.documentManager.getDocumentJson()
    const snapshot = this.historyManager.undo(current)
    if (snapshot) this.documentManager.loadFromJson(snapshot)
  }

  redo(): void {
    const current = this.documentManager.getDocumentJson()
    const snapshot = this.historyManager.redo(current)
    if (snapshot) this.documentManager.loadFromJson(snapshot)
  }

  get canUndo(): boolean { return this.historyManager.canUndo() }
  get canRedo(): boolean { return this.historyManager.canRedo() }

  // ── Cleanup ──

  dispose(): void {
    this.events.clear()
  }
}
