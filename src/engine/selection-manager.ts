// ─── Selection Manager ────────────────────────────────────────────
// Ported from MinoPencil pen-engine

export class SelectionManager {
  private _selectedIds: string[] = []
  private _activeId: string | null = null
  private _hoveredId: string | null = null
  private onChange: ((ids: string[], active: string | null) => void) | null = null
  private onHover: ((id: string | null) => void) | null = null

  constructor(
    onChange?: (ids: string[], active: string | null) => void,
    onHover?: (id: string | null) => void,
  ) {
    this.onChange = onChange || null
    this.onHover = onHover || null
  }

  get selectedIds(): string[] { return [...this._selectedIds] }
  get activeId(): string | null { return this._activeId }
  get hoveredId(): string | null { return this._hoveredId }

  select(ids: string[], activeId?: string | null): void {
    this._selectedIds = [...ids]
    this._activeId = activeId !== undefined ? activeId : (ids[0] || null)
    this.onChange?.(this._selectedIds, this._activeId)
  }

  clear(): void {
    this._selectedIds = []
    this._activeId = null
    this.onChange?.([], null)
  }

  setHover(id: string | null): void {
    this._hoveredId = id
    this.onHover?.(id)
  }

  toggleSelect(id: string): void {
    const idx = this._selectedIds.indexOf(id)
    if (idx >= 0) {
      this._selectedIds = this._selectedIds.filter(x => x !== id)
      if (this._activeId === id) this._activeId = this._selectedIds[0] || null
    } else {
      this._selectedIds = [...this._selectedIds, id]
      this._activeId = id
    }
    this.onChange?.(this._selectedIds, this._activeId)
  }

  get isSelected(): (id: string) => boolean {
    return (id: string) => this._selectedIds.includes(id)
  }
}
