// ─── CanvasCodePanel — Code preview for MinoCanvas ────────────────

import { useState, useMemo } from 'react'

interface Props {
  nodes: any[]
}

function generateHTML(nodes: any[]): string {
  let html = '<div class="design">\n'
  const walk = (n: any, indent = 2) => {
    const pad = '  '.repeat(indent)
    switch (n.type) {
      case 'rect': case 'rectangle':
        html += `${pad}<div style="position:absolute;left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;border-radius:${n.cornerRadius||0}px;background:${getFill(n)}"></div>\n`
        break
      case 'ellipse':
        html += `${pad}<div style="position:absolute;left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;border-radius:50%;background:${getFill(n)}"></div>\n`
        break
      case 'text':
        html += `${pad}<span style="position:absolute;left:${n.x}px;top:${n.y}px;font-size:${n.fontSize||14}px;font-weight:${n.fontWeight||400};color:${n.color||'#333'}">${n.content||''}</span>\n`
        break
      case 'frame':
        html += `${pad}<div style="position:absolute;left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;background:${getFill(n)};border-radius:${n.cornerRadius||0}px">\n`
        n.children?.forEach((c: any) => walk(c, indent + 1))
        html += `${pad}</div>\n`
        break
    }
  }
  nodes.forEach(n => walk(n))
  html += '</div>'
  return html
}

function getFill(n: any): string {
  return Array.isArray(n.fill) ? n.fill[0]?.color || 'transparent' : n.fill || 'transparent'
}

export default function CanvasCodePanel({ nodes }: Props) {
  const [tab, setTab] = useState<'json' | 'html'>('json')
  const html = useMemo(() => generateHTML(nodes), [nodes])

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-border">
        {[{ k: 'json', l: 'JSON' }, { k: 'html', l: 'HTML' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className="flex-1 py-2 text-xs font-medium transition-colors"
            style={{
              color: tab === t.k ? 'var(--foreground)' : 'var(--muted-foreground)',
              borderBottom: tab === t.k ? '2px solid var(--foreground)' : '2px solid transparent',
            }}>{t.l}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'json' ? (
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all"
            style={{ color: 'var(--foreground)' }}>
            {JSON.stringify(nodes, null, 2)}
          </pre>
        ) : (
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all"
            style={{ color: 'var(--foreground)' }}>
            {html}
          </pre>
        )}
      </div>
    </div>
  )
}
