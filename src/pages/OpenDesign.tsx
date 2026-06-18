// ─── OpenDesign — AI design creation (inspired by Open Design) ────────
// Single-page creation flow with sidebar for history.
// AI engine uses CowAgent for generation.

import { useState, useEffect, useRef } from 'react'
import { apiFetch, API } from '../api'
import { chatStream, createSession } from '../api/cowagent'
import { toast } from 'sonner'
import {
  PlusIcon, TrashIcon, SparklesIcon, SparkleIcon, LoaderIcon,
  MonitorIcon, SmartphoneIcon, LayoutIcon, PaintbrushIcon,
  CheckCircleIcon, AlertCircleIcon, ArrowLeftIcon, ClockIcon, PaletteIcon,
} from 'lucide-react'

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

const TPL_CFG: Record<string, { color: string; icon: any }> = {
  web: { color: '#6366f1', icon: MonitorIcon }, mobile: { color: '#10b981', icon: SmartphoneIcon },
  prototype: { color: '#f59e0b', icon: LayoutIcon }, dashboard: { color: '#8b5cf6', icon: LayoutIcon },
  landing: { color: '#06b6d4', icon: MonitorIcon }, blank: { color: '#64748b', icon: PaintbrushIcon },
}

export default function OpenDesign() {
  const [docs, setDocs] = useState<AIDoc[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [del, setDel] = useState<number | null>(null)

  // Create flow
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [template, setTemplate] = useState('web')
  const [style, setStyle] = useState('auto')
  const [generating, setGenerating] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<AIDoc | null>(null)

  useEffect(() => { createSession('AI 设计').then(s => { if (s?.session_id) setSessionId(s.session_id) }) }, [])
  const fetchDocs = () => { apiFetch(`${API.documents}?category=AI设计`).then(r => r.json()).then((d: any[]) => { setDocs(Array.isArray(d) ? d : []) }).catch(() => {}) }
  useEffect(fetchDocs, [])

  const tpl = TEMPLATES.find(t => t.id === template)!

  const handleGenerate = async () => {
    if (!title.trim() && !prompt.trim()) { toast.error('请输入项目名称或设计需求'); return }
    if (!sessionId) { toast.error('CowAgent 后端未就绪'); return }
    setGenerating(true); setResult(null); setStreamText(''); setStatus('generating'); setSelectedDoc(null)

    const styleNotes: Record<string, string> = {
      auto: '自行选择最适合的色彩方案', minimal: '极简，黑白灰，大量留白',
      dark: '深色模式，深色背景配浅色文字', warm: '温暖，橙色/棕色为主', cool: '冷色，蓝色系为主',
    }
    const msg = `你是一个设计助手。生成一个${tpl.label}页面（${tpl.desc}，宽度${tpl.width}px）。
风格：${STYLES.find(s => s.id === style)?.label} - ${styleNotes[style]}
要求：输出完整 HTML+CSS，页面美观，不需 markdown 包裹。\n\n用户需求：${prompt.trim() || title.trim() || '自动生成一个精美的页面'}`

    try {
      const r = await apiFetch(API.documents, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || `${tpl.label}设计`, category: 'AI设计', type: 'AI', size: '1KB', tags: [template, style], content: JSON.stringify({ prompt: prompt.trim() || '' }) }),
      })
      const d = await r.json()
      if (!d.success) { toast.error('保存失败'); setGenerating(false); return }
      fetchDocs()
    } catch { toast.error('保存失败'); setGenerating(false); return }

    const ctrl = chatStream(msg, sessionId, {
      onDelta(text) { setStreamText(text) },
      onDone(finalText) {
        setGenerating(false); setStatus('done')
        let html = finalText; const block = finalText.match(/```(?:html)?\s*([\s\S]*?)```/); if (block?.[1]) html = block[1]
        setResult(html); toast.success('设计稿已生成'); fetchDocs()
      },
      onError(err) { setGenerating(false); setStatus('error'); setResult(`生成失败: ${err}`); toast.error('AI 生成失败') },
    })
    abortRef.current = ctrl
  }

  const handleStop = () => { abortRef.current?.abort(); setGenerating(false); setStatus('idle') }
  const openDoc = (d: AIDoc) => {
    setSelectedDoc(d); setResult(null); setStatus('idle')
    try { const c = JSON.parse(d.content || '{}'); setTitle(d.title); setPrompt(c.prompt || '') } catch {}
  }

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar — Project History */}
      {showHistory && (
        <div className="w-56 flex-shrink-0 border-r border-border bg-card overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <span className="text-xs font-medium text-foreground">历史项目</span>
            <button onClick={() => setShowHistory(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
              <ArrowLeftIcon size={14} />
            </button>
          </div>
          {docs.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8 px-3">暂无项目</div>
          ) : docs.map(d => {
            const tag = (d.tags?.[0] || 'web') as string
            const cfg = TPL_CFG[tag] || TPL_CFG['web']
            return (
              <div key={d.id} onClick={() => openDoc(d)}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer text-xs hover:bg-muted transition-colors"
                style={{ background: selectedDoc?.id === d.id ? 'var(--muted)' : 'transparent', color: 'var(--foreground)' }}>
                <cfg.icon size={12} style={{ color: cfg.color }} />
                <span className="truncate flex-1">{d.title}</span>
                <button onClick={e => { e.stopPropagation(); setDel(d.id) }} className="p-0.5 rounded hover:bg-muted opacity-0 hover:opacity-100">
                  <TrashIcon size={10} className="text-muted-foreground" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center h-11 px-4 border-b border-border bg-card flex-shrink-0 gap-3">
          <button onClick={() => setShowHistory(v => !v)} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="历史项目">
            <ClockIcon size={16} />
          </button>
          {selectedDoc && status !== 'generating' ? (
            <>
              <span className="text-sm font-medium text-foreground">{selectedDoc.title}</span>
              <button onClick={() => { setSelectedDoc(null); setResult(null); setStatus('idle') }}
                className="ml-auto text-xs px-2 py-1 rounded text-muted-foreground hover:bg-muted border border-border">新建设计</button>
            </>
          ) : (
            <>
              <SparkleIcon size={16} className="text-amber-500" />
              <span className="text-sm font-medium text-foreground">AI 设计</span>
              <span className="text-xs text-muted-foreground">AI 自动生成设计稿</span>
            </>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {/* When viewing a historical project */}
          {selectedDoc && status !== 'generating' && (
            <div className="h-full flex flex-col">
              {result ? (
                <iframe className="flex-1 w-full border-0" srcDoc={result} style={{ background: '#fff' }} />
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  <div className="text-center">
                    <PaletteIcon size={32} className="mx-auto mb-2 opacity-30" />
                    <p>没有预览内容</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Create / Generate Flow (when not viewing history) */}
          {(!selectedDoc || status === 'generating') && (
            <div className="max-w-3xl mx-auto p-6 space-y-5">
              {/* Prompt Area — like Open Design's hero */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <SparkleIcon size={18} className="text-amber-500" />
                  <h2 className="text-lg font-semibold text-foreground">描述你的设计</h2>
                </div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
                  placeholder="描述你想要的设计，例如：一个简洁的 SaaS 产品落地页，包含导航栏、Hero 区域、功能列表和底部 CTA"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none bg-card border border-border text-foreground placeholder:text-muted-foreground" />
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="项目名称（可选）"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none bg-card border border-border text-foreground placeholder:text-muted-foreground mt-2" />
              </div>

              {/* Template Selection */}
              <div>
                <label className="block text-xs font-medium mb-2.5 text-muted-foreground uppercase tracking-wider">选择模板</label>
                <div className="grid grid-cols-6 gap-2">
                  {TEMPLATES.map(t => {
                    const a = template === t.id; const Icon = t.icon
                    return (
                      <button key={t.id} onClick={() => setTemplate(t.id)}
                        className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all"
                        style={{ background: a ? t.color + '15' : 'var(--card)', border: `1px solid ${a ? t.color : 'var(--border)'}` }}>
                        <Icon size={16} style={{ color: a ? t.color : 'var(--muted-foreground)' }} />
                        <span className="text-xs font-medium" style={{ color: a ? t.color : 'var(--foreground)' }}>{t.label}</span>
                        <span className="text-[9px] text-muted-foreground">{t.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Style Selection */}
              <div>
                <label className="block text-xs font-medium mb-2.5 text-muted-foreground uppercase tracking-wider">色彩风格</label>
                <div className="flex gap-2">
                  {STYLES.map(s => {
                    const a = style === s.id
                    return (
                      <button key={s.id} onClick={() => setStyle(s.id)}
                        className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all flex-1"
                        style={{ background: a ? 'var(--accent)' : 'var(--card)', border: `1px solid ${a ? 'transparent' : 'var(--border)'}` }}>
                        <div className="flex gap-1">{s.colors.map((c, i) => <div key={i} className="w-3.5 h-3.5 rounded-full" style={{ background: c }} />)}</div>
                        <span className="text-[10px] font-medium" style={{ color: a ? 'var(--accent-foreground)' : 'var(--foreground)' }}>{s.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Generate / Stop */}
              <div className="flex gap-2">
                {status !== 'generating' ? (
                  <button onClick={handleGenerate} disabled={generating}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
                    style={{ background: 'var(--foreground)', color: 'var(--background)' }}>
                    <SparklesIcon size={15} /> 开始生成
                  </button>
                ) : (
                  <button onClick={handleStop}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white">
                    <LoaderIcon size={15} className="animate-spin" /> 停止生成
                  </button>
                )}
              </div>

              {/* Streaming Progress */}
              {status === 'generating' && streamText && (
                <div className="p-3 rounded-lg text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto font-mono"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
                  {streamText.slice(-2000)}
                </div>
              )}

              {/* Result Preview */}
              {result && status === 'done' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                    <CheckCircleIcon size={15} /> 设计稿已生成
                  </div>
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    <iframe className="w-full border-0" style={{ height: '500px', background: '#fff' }} srcDoc={result} />
                  </div>
                </div>
              )}

              {result && status === 'error' && (
                <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                  <AlertCircleIcon size={15} /> {result}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirm */}
      {del !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-80 rounded-xl p-5" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-medium text-foreground mb-4">确定删除此项目？</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDel(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>取消</button>
              <button onClick={async () => { await apiFetch(API.documentsById(del), { method: 'DELETE' }); setDocs(prev => prev.filter(x => x.id !== del)); setDel(null); toast.success('已删除') }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: '#ef4444' }}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
