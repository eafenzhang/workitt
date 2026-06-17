// ─── Viewport Controller ──────────────────────────────────────────
// Ported from MinoPencil pen-engine

export const MIN_ZOOM = 1 / 64
export const MAX_ZOOM = 64

export class ViewportController {
  private _zoom = 1
  private _scrollX = 0
  private _scrollY = 0
  private onChange: ((zoom: number, scrollX: number, scrollY: number) => void) | null = null

  constructor(
    onChange?: (zoom: number, scrollX: number, scrollY: number) => void,
  ) {
    this.onChange = onChange || null
  }

  get zoom(): number { return this._zoom }
  get scrollX(): number { return this._scrollX }
  get scrollY(): number { return this._scrollY }

  setZoom(z: number, cx?: number, cy?: number): void {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
    if (cx !== undefined && cy !== undefined) {
      // Zoom toward a point (e.g. mouse cursor)
      this._scrollX = cx - (cx - this._scrollX) * (clamped / this._zoom)
      this._scrollY = cy - (cy - this._scrollY) * (clamped / this._zoom)
    }
    this._zoom = clamped
    this.notify()
  }

  pan(dx: number, dy: number): void {
    this._scrollX += dx
    this._scrollY += dy
    this.notify()
  }

  scrollTo(x: number, y: number): void {
    this._scrollX = x
    this._scrollY = y
    this.notify()
  }

  screenToScene(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this._scrollX) / this._zoom,
      y: (sy - this._scrollY) / this._zoom,
    }
  }

  sceneToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: x * this._zoom + this._scrollX,
      y: y * this._zoom + this._scrollY,
    }
  }

  zoomToRect(
    x: number, y: number, w: number, h: number,
    canvasW: number, canvasH: number,
  ): void {
    const z = Math.min(canvasW / w, canvasH / h, 1)
    this._zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
    this._scrollX = (canvasW - w * this._zoom) / 2 - x * this._zoom
    this._scrollY = (canvasH - h * this._zoom) / 2 - y * this._zoom
    this.notify()
  }

  reset(): void {
    this._zoom = 1
    this._scrollX = 0
    this._scrollY = 0
    this.notify()
  }

  private notify(): void {
    this.onChange?.(this._zoom, this._scrollX, this._scrollY)
  }
}
