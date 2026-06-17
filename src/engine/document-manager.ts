// ─── Document Manager ─────────────────────────────────────────────
// Ported from MinoPencil pen-engine

import type { PenDocument, PenPage, DesignNode, PenVector, PenSize } from './types'

let _counter = 0
export function genId(): string {
  _counter++
  return 'n_' + Date.now().toString(36) + '_' + _counter
}

export function genPageId(): string {
  return 'p_' + Date.now().toString(36)
}

export class DocumentManager {
  private _document: PenDocument
  private onMutate: ((doc: PenDocument) => void) | null = null

  constructor(initial?: PenDocument, onMutate?: (doc: PenDocument) => void) {
    this._document = initial || this.createDefaultDocument()
    this.onMutate = onMutate || null
  }

  get document(): PenDocument { return this._document }

  private clone(): PenDocument {
    return JSON.parse(JSON.stringify(this._document))
  }

  private mutate(next: PenDocument): void {
    this._document = next
    this.onMutate?.(this._document)
  }

  // ── Document ──

  loadDocument(doc: PenDocument): void {
    this.mutate(JSON.parse(JSON.stringify(doc)))
  }

  createDefaultDocument(): PenDocument {
    return {
      id: genId(),
      name: '未命名画板',
      pages: [{
        id: genPageId(),
        name: '页面 1',
        children: [],
      }],
    }
  }

  // ── Pages ──

  get activePage(): PenPage {
    return this._document.pages[0] || this._document.pages[0]
  }

  getPage(id: string): PenPage | undefined {
    return this._document.pages.find(p => p.id === id)
  }

  addPage(page?: Partial<PenPage>): string {
    const doc = this.clone()
    const newPage: PenPage = {
      id: genPageId(),
      name: page?.name || `页面 ${doc.pages.length + 1}`,
      children: page?.children || [],
      background: page?.background,
    }
    doc.pages.push(newPage)
    this.mutate(doc)
    return newPage.id
  }

  removePage(id: string): void {
    if (this._document.pages.length <= 1) return // keep at least 1 page
    const doc = this.clone()
    doc.pages = doc.pages.filter(p => p.id !== id)
    this.mutate(doc)
  }

  // ── Node CRUD ──

  addNode(node: DesignNode, parentId?: string): void {
    const doc = this.clone()
    const page = doc.pages[0]
    if (parentId) {
      const parent = this.findNodeById(page, parentId)
      if (parent && 'children' in parent) {
        parent.children = [...(parent.children || []), node]
      }
    } else {
      page.children = [...page.children, node]
    }
    this.mutate(doc)
  }

  updateNode(id: string, patch: Partial<DesignNode>): void {
    const doc = this.clone()
    const page = doc.pages[0]
    const node = this.findNodeById(page, id)
    if (node) Object.assign(node, patch)
    this.mutate(doc)
  }

  removeNode(id: string): void {
    const doc = this.clone()
    const page = doc.pages[0]
    const remove = (children: DesignNode[]): DesignNode[] =>
      children.filter(n => {
        if (n.id === id) return false
        if ('children' in n && n.children) n.children = remove(n.children)
        return true
      })
    page.children = remove(page.children)
    this.mutate(doc)
  }

  moveNode(id: string, dx: number, dy: number): void {
    const doc = this.clone()
    const page = doc.pages[0]
    const node = this.findNodeById(page, id)
    if (node) {
      node.x += dx
      node.y += dy
    }
    this.mutate(doc)
  }

  setNodePosition(id: string, pos: Partial<PenVector>): void {
    const doc = this.clone()
    const page = doc.pages[0]
    const node = this.findNodeById(page, id)
    if (node) {
      if (pos.x !== undefined) node.x = pos.x
      if (pos.y !== undefined) node.y = pos.y
    }
    this.mutate(doc)
  }

  setNodeSize(id: string, size: Partial<PenSize>): void {
    const doc = this.clone()
    const page = doc.pages[0]
    const node = this.findNodeById(page, id)
    if (node) {
      if (size.width !== undefined) node.width = size.width
      if (size.height !== undefined) node.height = size.height
    }
    this.mutate(doc)
  }

  duplicateNode(id: string): string | null {
    const doc = this.clone()
    const page = doc.pages[0]
    const node = this.findNodeById(page, id)
    if (!node) return null
    const copy = JSON.parse(JSON.stringify(node)) as DesignNode
    copy.id = genId()
    copy.x += 20
    copy.y += 20
    copy.name = (copy.name || 'Node') + ' copy'
    page.children = [...page.children, copy]
    this.mutate(doc)
    return copy.id
  }

  groupNodes(ids: string[]): string | null {
    if (ids.length < 2) return null
    const doc = this.clone()
    const page = doc.pages[0]
    const groupId = genId()
    const children = ids.map(id => this.findNodeById(page, id)).filter(Boolean) as DesignNode[]
    if (children.length < 2) return null
    const minX = Math.min(...children.map(n => n.x))
    const minY = Math.min(...children.map(n => n.y))
    const maxX = Math.max(...children.map(n => n.x + n.width))
    const maxY = Math.max(...children.map(n => n.y + n.height))
    const group: DesignNode = {
      id: groupId, type: 'group', name: 'Group',
      x: minX, y: minY, width: maxX - minX, height: maxY - minY,
      rotation: 0, opacity: 1, visible: true, locked: false,
      children: children.map(c => ({ ...c, x: c.x - minX, y: c.y - minY })),
    } as DesignNode
    page.children = [...page.children.filter(n => !ids.includes(n.id)), group]
    this.mutate(doc)
    return groupId
  }

  ungroupNode(id: string): void {
    const doc = this.clone()
    const page = doc.pages[0]
    const node = this.findNodeById(page, id)
    if (!node || node.type !== 'group' || !('children' in node)) return
    const group = node as { children: DesignNode[]; x: number; y: number }
    const ungrouped = group.children.map(c => ({ ...c, x: c.x + group.x, y: c.y + group.y }))
    page.children = [...page.children.filter(n => n.id !== id), ...ungrouped]
    this.mutate(doc)
  }

  // ── Layer ordering ──

  moveNodeUp(id: string): void {
    const doc = this.clone(); const page = doc.pages[0]
    const idx = page.children.findIndex(n => n.id === id)
    if (idx > 0) { [page.children[idx - 1], page.children[idx]] = [page.children[idx], page.children[idx - 1]]; this.mutate(doc) }
  }
  moveNodeDown(id: string): void {
    const doc = this.clone(); const page = doc.pages[0]
    const idx = page.children.findIndex(n => n.id === id)
    if (idx >= 0 && idx < page.children.length - 1) { [page.children[idx], page.children[idx + 1]] = [page.children[idx + 1], page.children[idx]]; this.mutate(doc) }
  }
  moveNodeToTop(id: string): void {
    const doc = this.clone(); const page = doc.pages[0]
    const idx = page.children.findIndex(n => n.id === id)
    if (idx >= 0) { const [n] = page.children.splice(idx, 1); page.children.push(n); this.mutate(doc) }
  }
  moveNodeToBottom(id: string): void {
    const doc = this.clone(); const page = doc.pages[0]
    const idx = page.children.findIndex(n => n.id === id)
    if (idx >= 0) { const [n] = page.children.splice(idx, 1); page.children.unshift(n); this.mutate(doc) }
  }

  // ── Alignment ──

  alignNodes(ids: string[], direction: 'left'|'center-h'|'right'|'top'|'center-v'|'bottom'|'dist-h'|'dist-v'): void {
    const doc = this.clone(); const page = doc.pages[0]
    const nodes = ids.map(id => this.findNodeById(page, id)).filter(Boolean) as DesignNode[]
    if (nodes.length < 2) return
    const bbox = { l:Math.min(...nodes.map(n=>n.x)), t:Math.min(...nodes.map(n=>n.y)), r:Math.max(...nodes.map(n=>n.x+n.width)), b:Math.max(...nodes.map(n=>n.y+n.height)) }
    const centerX = (bbox.l+bbox.r)/2, centerY = (bbox.t+bbox.b)/2
    for (const n of nodes) {
      switch(direction){
        case'left': n.x = bbox.l; break
        case'right': n.x = bbox.r - n.width; break
        case'center-h': n.x = centerX - n.width/2; break
        case'top': n.y = bbox.t; break
        case'bottom': n.y = bbox.b - n.height; break
        case'center-v': n.y = centerY - n.height/2; break
      }
    }
    if(direction==='dist-h'||direction==='dist-v'){
      const sorted = [...nodes]
      if(direction==='dist-h'){
        sorted.sort((a,b)=>a.x+a.width/2-(b.x+b.width/2))
        const step = (bbox.r-bbox.l-sorted.reduce((s,n)=>s+n.width,0))/(sorted.length-1)
        let cx = bbox.l + sorted[0].width/2
        for(let i=1;i<sorted.length-1;i++){ cx += sorted[i-1].width/2 + step + sorted[i].width/2; sorted[i].x = cx - sorted[i].width/2 }
      }else{
        sorted.sort((a,b)=>a.y+a.height/2-(b.y+b.height/2))
        const step = (bbox.b-bbox.t-sorted.reduce((s,n)=>s+n.height,0))/(sorted.length-1)
        let cy = bbox.t + sorted[0].height/2
        for(let i=1;i<sorted.length-1;i++){ cy += sorted[i-1].height/2 + step + sorted[i].height/2; sorted[i].y = cy - sorted[i].height/2 }
      }
    }
    this.mutate(doc)
  }

  // ── Queries ──

  findNodeById(page: PenPage, id: string): DesignNode | null {
    const search = (nodes: DesignNode[]): DesignNode | null => {
      for (const n of nodes) {
        if (n.id === id) return n
        if ('children' in n && n.children) {
          const found = search(n.children)
          if (found) return found
        }
      }
      return null
    }
    return search(page.children)
  }

  getFlatNodes(page: PenPage): DesignNode[] {
    const result: DesignNode[] = []
    const walk = (nodes: DesignNode[]) => {
      for (const n of nodes) {
        result.push(n)
        if ('children' in n && n.children) walk(n.children)
      }
    }
    walk(page.children)
    return result
  }

  getDocumentJson(): string {
    return JSON.stringify(this._document)
  }

  loadFromJson(json: string): void {
    try {
      const doc = JSON.parse(json)
      this.mutate(doc)
    } catch { /* ignore */ }
  }
}
