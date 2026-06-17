// ─── Typed Event Emitter ──────────────────────────────────────────
// Ported from MinoPencil pen-engine

export class TypedEventEmitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>()

  on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(cb as (...args: unknown[]) => void)
    return () => this.off(event, cb)
  }

  off<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): void {
    this.listeners.get(event)?.delete(cb as (...args: unknown[]) => void)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners.get(event)?.forEach(cb => cb(payload))
  }

  clear(): void {
    this.listeners.clear()
  }
}
