// ─── History Manager (Undo / Redo) ────────────────────────────────
// Ported from MinoPencil pen-engine

import type { HistoryEntry } from './types'

const HISTORY_DEBOUNCE_MS = 300
const MAX_STATES = 300

export class HistoryManager {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private maxStates = MAX_STATES
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingEntry: HistoryEntry | null = null
  private batchDepth = 0
  private batchSnapshot: string | null = null

  private onChange: ((canUndo: boolean, canRedo: boolean) => void) | null = null

  constructor(onChange?: (canUndo: boolean, canRedo: boolean) => void) {
    this.onChange = onChange || null
  }

  /** Take a snapshot of the current state and push to undo stack */
  pushSnapshot(json: string): void {
    // During batch, only capture on first push
    if (this.batchDepth > 0) {
      if (!this.batchSnapshot) this.batchSnapshot = json
      return
    }

    // Debounce rapid changes
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.pendingEntry = this.makeEntry(json)
    this.debounceTimer = setTimeout(() => this.flushPending(), HISTORY_DEBOUNCE_MS)
  }

  /** Flush debounced snapshot immediately (call before critical operations) */
  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.flushPending()
  }

  private flushPending(): void {
    if (!this.pendingEntry) return
    // Dedupe: skip if same as top
    const top = this.undoStack[this.undoStack.length - 1]
    if (top && top.snapshot === this.pendingEntry.snapshot) return
    this.undoStack.push(this.pendingEntry)
    if (this.undoStack.length > this.maxStates) this.undoStack.shift()
    this.redoStack = []
    this.pendingEntry = null
    this.notify()
  }

  /** Start a batch — intermediate changes are coalesced into one entry */
  startBatch(): void {
    this.batchDepth++
    if (this.batchDepth === 1) {
      this.flush() // flush pending before batch
      this.batchSnapshot = null
    }
  }

  /** End a batch — capture the final state */
  endBatch(json: string): void {
    if (this.batchDepth > 0) this.batchDepth--
    if (this.batchDepth === 0 && this.batchSnapshot) {
      // Push a single entry with the final state
      const entry = this.makeEntry(json)
      const top = this.undoStack[this.undoStack.length - 1]
      if (!top || top.snapshot !== entry.snapshot) {
        this.undoStack.push(entry)
        if (this.undoStack.length > this.maxStates) this.undoStack.shift()
        this.redoStack = []
      }
      this.batchSnapshot = null
      this.notify()
    }
  }

  undo(currentJson: string): string | null {
    this.flush()
    if (this.undoStack.length === 0) return null
    const entry = this.undoStack.pop()!
    this.redoStack.push(this.makeEntry(currentJson))
    this.notify()
    return entry.snapshot
  }

  redo(currentJson: string): string | null {
    if (this.redoStack.length === 0) return null
    const entry = this.redoStack.pop()!
    this.undoStack.push(this.makeEntry(currentJson))
    this.notify()
    return entry.snapshot
  }

  canUndo(): boolean { return this.undoStack.length > 0 }
  canRedo(): boolean { return this.redoStack.length > 0 }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.pendingEntry = null
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = null
    this.notify()
  }

  private makeEntry(json: string): HistoryEntry {
    return { id: Date.now().toString(36), timestamp: Date.now(), snapshot: json }
  }

  private notify(): void {
    this.onChange?.(this.canUndo(), this.canRedo())
  }
}
