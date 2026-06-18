// ─── OpenDesign — AI-powered project creation (Open Design style) ─────
// Layout matches DesignStudio: sidebar + list + detail view

import { useState, useEffect, useRef } from 'react'
import { apiFetch, API } from '../api'
import { chatStream, createSession } from '../api/cowagent'
import { toast } from 'sonner'
import {
  PlusIcon, TrashIcon, SparklesIcon, SparkleIcon, LoaderIcon,
  MonitorIcon, SmartphoneIcon, LayoutIcon, PaintbrushIcon,
  CheckCircleIcon, AlertCircleIcon, XIcon, EyeIcon, ArrowLeftIcon,
} from 'lucide-react'
import UnifiedSidebar, { SidebarItem } from '../components/UnifiedSidebar'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'

interface AIDoc { id: number; title: string; category: string; date: string; tags: string[]; content?: string; }

const TEMPLATES = [
  { id: 'web', label: '网页', icon: MonitorIcon, color: '#6366f1', desc: '桌面端网页设计', width: 1440 },
  { id: 'mobile', label: '移动端', icon: SmartphoneIcon, color: '#10b981', desc: '手机应用界面', width: 375 },
  { id: 'prototype', label: '原型', icon: LayoutIcon, color: '#f59e0b', desc: '低保真线框图', width: 1024 },
  { id: 'dashboard', label: '仪表盘', icon: LayoutIcon, color: '#8b5cf6', desc: '数据面板布局', width: 1440 },
  { id: 'landing', label: '落地页', icon: MonitorIcon, color: '#06b6d4', desc: '营销活动页面', width: 1440 },
  { id: 'blank', label: '空白', icon: PaintbrushIcon, color: '#64748b', desc: '从零开始', width: 1024 },
]

const STYLES = [
  { id: 'auto', label: '自动', colors: ['#6366f1', '#10b981', '#f59e0b'] },
  { id: 'minimal', label: '极简', colors: ['#1a1a1a', '#f5f5f5', '#e0e0e0'] },
  { id: 'dark', label: '深色', colors: ['#0d0d0d', '#1a1a2e', '#6b7280'] },
  { id: 'warm', label: '温暖', colors: ['#b45309', '#fef3c7', '#fde68a'] },
  { id: 'cool', label: '冷色', colors: ['#1e3a5f', '#2563eb', '#93c5fd'] },
]

const TPL_CFG: Record<string,{color:string;icon:any}> = {
  'web':{color:'#6366f1',icon:MonitorIcon}, 'mobile':{color:'#10b981',icon:SmartphoneIcon},
  'prototype':{color:'#f59e0b',icon:LayoutIcon}, 'dashboard':{color:'#8b5cf6',icon:LayoutIcon},
  'landing':{color:'#06b6d4',icon:MonitorIcon}, 'blank':{color:'#64748b',icon:PaintbrushIcon},
}

export default function OpenDesign() {
  const [docs, setDocs] = useState<AIDoc[]>([])
  const [cat, setCat] = useState('all')
  const [so, setSo] = useState(true)
  const [del, setDel] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [detailDoc, setDetailDoc] = useState<AIDoc | null>(null)

  // Create view state
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('web')
  const [selectedStyle, setSelectedStyle] = useState('auto')
  const [generating, setGenerating] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { createSession('AI 设计').then(s => { if (s?.session_id) setSessionId(s.session_id) }) }, [])
  useEffect(() => { apiFetch(`${API.documents}?category=AI设计`).then(r => r.json()).then((d: any[]) => { setDocs(Array.isArray(d) ? d : []) }).catch(() => {}) }, [])

  const cats = ['网页', '移动端', '原型', '仪表盘', '落地页']
  const filtered = cat === 'all' ? docs : docs.filter(d => d.tags?.includes(cat))

  const openDetail = (d: AIDoc) => {
    setDetailDoc(d)
    setView('detail')
    try { const c = JSON.parse(d.content || '{}'); setResult(c.html || null) } catch { setResult(null) }
  }

  const handleGenerate = async () => {
    if (!title.trim() && !prompt.trim()) { toast.error('请输入项目名称或设计需求'); return }
    if (!sessionId) { toast.error('CowAgent 后端未就绪'); return }
    setGenerating(true); setResult(null); setStreamText(''); setStatus('generating')

    const styleNotes: Record<string, string> = {
      minimal: '极简风格，黑白灰色调，大量留白', dark: '深色模式，深色背景配浅色文字',
      warm: '温暖色调，橙色/棕色为主', cool: '冷色调，蓝色系为主', auto: '自行选择最适合的色彩方案',
    }
    const tpl = TEMPLATES.find(t => t.id === selectedTemplate)!
    const styleName = STYLES.find(s => s.id === selectedStyle)?.label || '自动'
    const systemPrompt = `你是一个设计生成助手。根据用户的模板和风格需求，生成一个完整的 HTML 页面。
模板：${tpl.label}（${tpl.desc}，宽度${tpl.width}px）
风格：${styleName} - ${styleNotes[selectedStyle]}
要求：输出完整的 HTML 代码，包含内联 CSS，不需要 markdown 代码块包裹。页面美观、可直接在浏览器中预览。`
    const fullMessage = `${systemPrompt}\n\n用户需求：${prompt.trim() || title.trim() || '自动生成一个精美的页面'}`

    try {
      const r = await apiFetch(API.documents, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || `${tpl.label}设计`, category: 'AI设计', type: 'AI', size: '1KB', tags: [selectedTemplate, selectedStyle], content: JSON.stringify({ prompt: prompt.trim() || '' }) }),
      })
      const d = await r.json()
      if (!d.success) { toast.error('保存项目失败'); setGenerating(false); return }
    } catch { toast.error('保存失败'); setGenerating(false); return }

    const ctrl = chatStream(fullMessage, sessionId, {
      onDelta(text) { setStreamText(text) },
      onDone(finalText) {
        setGenerating(false); setStatus('done')
        let html = finalText
        const block = finalText.match(/```(?:html)?\s*([\s\S]*?)```/)
        if (block?.[1]) html = block[1]
        setResult(html)
        toast.success('设计稿已生成')
        apiFetch(`${API.documents}?category=AI设计`).then(r => r.json()).then((d: any[]) => setDocs(Array.isArray(d) ? d : [])).catch(() => {})
      },
      onError(err) { setGenerating(false); setStatus('error'); setResult(`生成失败: ${err}`); toast.error('AI 生成失败') },
    })
    abortRef.current = ctrl
  }

  const handleStop = () => { abortRef.current?.abort(); setGenerating(false); setStatus('idle') }
  const delDoc = async () => { if (!del) return; await apiFetch(API.documentsById(del), { method: 'DELETE' }); setDocs(prev => prev.filter(x => x.id !== del)); setDel(null); toast.success('已删除') }

  // ── Detail View ──
  if (view === 'detail' && detailDoc) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center h-11 px-3 border-b border-border bg-card flex-shrink-0 gap-2">
          <button onClick={() => setView('list')} className="p-1.5 rounded hover:bg-muted"><ArrowLeftIcon size={16} className="text-muted-foreground" /></button>
          <span className="text-sm font-medium text-foreground">{detailDoc.title}</span>
        </div>
        {result ? (
          <iframe className="flex-1 w-full border-0" srcDoc={result} style={{ background: '#fff' }} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">暂无预览内容</div>
        )}
      </div>
    )
  }

  // ── Create View ──
  if (view === 'create') {
    const tpl = TEMPLATES.find(t => t.id === selectedTemplate)!
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center h-11 px-3 border-b border-border bg-card flex-shrink-0 gap-2">
          <button onClick={() => setView('list')} className="p-1.5 rounded hover:bg-muted"><ArrowLeftIcon size={16} className="text-muted-foreground" /></button>
          <span className="text-sm font-medium text-foreground">新建设计</span>
        </div>
        <div className="flex-1 overflow-y-auto bg-background" style={{ scrollbarWidth: 'none' }}>
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            {status !== 'generating' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">项目名称</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：产品落地页"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-card border border-border text-foreground placeholder:text-muted-foreground" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">设计需求</label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="描述你想要的设计..."
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-card border border-border text-foreground placeholder:text-muted-foreground resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">选择模板</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {TEMPLATES.map(t => {
                      const a = selectedTemplate === t.id; const Icon = t.icon
                      return (
                        <button key={t.id} onClick={() => setSelectedTemplate(t.id)}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all"
                          style={{ background: a ? t.color + '15' : 'var(--card)', border: `1px solid ${a ? t.color : 'var(--border)'}` }}>
                          <Icon size={16} style={{ color: a ? t.color : 'var(--muted-foreground)' }} />
                          <span className="text-xs font-medium" style={{ color: a ? t.color : 'var(--foreground)' }}>{t.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">色彩风格</label>
                  <div className="flex gap-2.5">
                    {STYLES.map(s => {
                      const a = selectedStyle === s.id
                      return (
                        <button key={s.id} onClick={() => setSelectedStyle(s.id)}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all flex-1"
                          style={{ background: a ? 'var(--accent)' : 'var(--card)', border: `1px solid ${a ? 'transparent' : 'var(--border)'}` }}>
                          <div className="flex gap-1">{s.colors.map((c, i) => <div key={i} className="w-3.5 h-3.5 rounded-full" style={{ background: c }} />)}</div>
                          <span className="text-[10px] font-medium" style={{ color: a ? 'var(--accent-foreground)' : 'var(--foreground)' }}>{s.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
            {status !== 'generating' ? (
              <button onClick={handleGenerate} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--foreground)', color: 'var(--background)' }}>
                <SparklesIcon size={15} /> 开始生成
              </button>
            ) : (
              <button onClick={handleStop} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white">
                <LoaderIcon size={15} className="animate-spin" /> 停止生成
              </button>
            )}
            {status === 'generating' && streamText && (
              <div className="p-3 rounded-lg text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto font-mono"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
                {streamText.slice(-1500)}
              </div>
            )}
            {result && status === 'done' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600 font-medium text-sm"><CheckCircleIcon size={15} /> 设计稿已生成</div>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <iframe className="w-full border-0" style={{ height: '400px', background: '#fff' }} srcDoc={result} />
                </div>
              </div>
            )}
            {result && status === 'error' && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                <AlertCircleIcon size={15} /> {result}
              </div>
            )}
            <button onClick={() => setView('list')} className="w-full py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--card)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>返回列表</button>
          </div>
        </div>
      </div>
    )
  }

  // ── List View (default) ──
  return (
    <div className="flex h-full overflow-hidden">
      <UnifiedSidebar open={so} onToggle={() => setSo(false)} title="分类" actions={
        <button onClick={() => { setView('create'); setTitle(''); setPrompt(''); setResult(null); setStatus('idle') }}
          className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-wiki-surface2">
          <PlusIcon size={12} style={{ color: 'var(--wiki-text3)' }} />
        </button>}>
        <SidebarItem label="全部" active={cat === 'all'} onClick={() => setCat('all')} />
        {cats.map(c => <SidebarItem key={c} label={c} active={cat === c} onClick={() => setCat(cat === c ? 'all' : c)} />)}
      </UnifiedSidebar>
      <div className="flex flex-col flex-1 overflow-hidden">
        <PageHeader title="AI 设计" description="AI 自动生成设计稿" sidebarOpen={so} onToggleSidebar={() => setSo(!so)} actions={
          <button onClick={() => { setView('create'); setTitle(''); setPrompt(''); setResult(null); setStatus('idle') }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-accent)', color: 'var(--wiki-bg)' }}>
            <PlusIcon size={14} /> 新建设计
          </button>} />
        <div className="overflow-y-auto flex-1 px-6 pb-4" style={{ scrollbarWidth: 'none' }}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 pt-4">
            {filtered.length === 0 ? (
              <div className="col-span-full"><EmptyState icon={SparklesIcon} title="暂无 AI 设计" description="点击「新建设计」开始" /></div>
            ) : filtered.map(d => {
              const tag = (d.tags?.[0] || 'web') as string
              const cfg = TPL_CFG[tag] || TPL_CFG['web']
              return (
                <div key={d.id} onClick={() => openDetail(d)}
                  className="p-4 rounded-lg cursor-pointer hover:bg-wiki-surface2 transition-all duration-200 group"
                  style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: cfg.color + '18' }}>
                      <cfg.icon size={14} style={{ color: cfg.color }} />
                    </div>
                    <button onClick={e => { e.stopPropagation(); setDel(d.id) }}
                      className="opacity-0 group-hover:opacity-100 text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>删除</button>
                  </div>
                  <div className="text-sm font-semibold text-wiki-text mb-1 line-clamp-2">{d.title}</div>
                  <div className="text-xs text-wiki-text3 mt-1">{d.date}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <ConfirmDialog open={del !== null} title="确认删除" message="确定要删除？" onConfirm={delDoc} onCancel={() => setDel(null)} />
    </div>
  )
}
