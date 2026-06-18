// ─── OpenDesign port — Mirrors the original Open Design UI/flow ─────
// AI engine (CowAgent) is the only custom part; everything else follows
// the upstream EntryShell + NewProjectPanel + ProjectView pattern.

import { useState, useEffect, useRef } from 'react'
import { apiFetch, API } from '../api'
import { chatStream, createSession } from '../api/cowagent'
import { toast } from 'sonner'
import {
  PlusIcon, TrashIcon, SparklesIcon, SparkleIcon, LoaderIcon,
  MonitorIcon, SmartphoneIcon, LayoutIcon, PaintbrushIcon,
  CheckCircleIcon, AlertCircleIcon, ClockIcon, PaletteIcon,
  Grid3X3Icon, PanelLeftCloseIcon, PanelLeftIcon, SettingsIcon,
  HomeIcon, FolderOpenIcon, PuzzleIcon, PaletteIcon as StyleIcon,
  BotIcon, ArrowLeftIcon, ZapIcon,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────
interface Project { id: number; title: string; date: string; tags: string[]; content?: string; }
type View = 'home' | 'projects' | 'detail'

const TEMPLATES = [
  { id: 'web', label: '网页', icon: MonitorIcon, color: '#6366f1', desc: '桌面端', width: 1440 },
  { id: 'mobile', label: '移动端', icon: SmartphoneIcon, color: '#10b981', desc: '手机端', width: 375 },
  { id: 'prototype', label: '原型', icon: LayoutIcon, color: '#f59e0b', desc: '线框图', width: 1024 },
  { id: 'dashboard', label: '仪表盘', icon: LayoutIcon, color: '#8b5cf6', desc: '数据面板', width: 1440 },
  { id: 'landing', label: '落地页', icon: MonitorIcon, color: '#06b6d4', desc: '营销页', width: 1440 },
  { id: 'blank', label: '空白', icon: PaintbrushIcon, color: '#64748b', desc: '从零开始', width: 1024 },
]

const STYLES = [
  { id: 'auto', label: '自动', colors: ['#6366f1', '#10b981', '#f59e0b'] },
  { id: 'minimal', label: '极简', colors: ['#1a1a1a', '#f5f5f5', '#e0e0e0'] },
  { id: 'dark', label: '深色', colors: ['#0d0d0d', '#1a1a2e', '#6b7280'] },
  { id: 'warm', label: '温暖', colors: ['#b45309', '#fef3c7', '#fde68a'] },
  { id: 'cool', label: '冷色', colors: ['#1e3a5f', '#2563eb', '#93c5fd'] },
]

const NAV_ITEMS = [
  { id: 'home' as View, label: '首页', icon: HomeIcon },
  { id: 'projects' as View, label: '项目', icon: FolderOpenIcon },
]

// ── Component ────────────────────────────────────────────────────────
export default function OpenDesign() {
  const [view, setView] = useState<View>('home')
  const [railOpen, setRailOpen] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // New project panel state
  const [showNewProject, setShowNewProject] = useState(false)
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
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  useEffect(() => { createSession('AI 设计').then(s => { if (s?.session_id) setSessionId(s.session_id) }) }, [])
  const fetchProjects = () => { apiFetch(`${API.documents}?category=AI设计`).then(r => r.json()).then((d: any[]) => { setProjects(Array.isArray(d) ? d : []) }).catch(() => {}) }
  useEffect(fetchProjects, [])

  const tpl = TEMPLATES.find(t => t.id === template)!

  // ── Generate ──
  const handleGenerate = async () => {
    if (!title.trim() && !prompt.trim()) { toast.error('请输入项目名称或设计需求'); return }
    if (!sessionId) { toast.error('CowAgent 后端未就绪'); return }
    setGenerating(true); setResult(null); setStreamText(''); setStatus('generating')

    const styleNotes: Record<string, string> = {
      auto: '自行选择最适合的色彩方案', minimal: '极简，黑白灰',
      dark: '深色模式', warm: '温暖橙色/棕色', cool: '冷色蓝色系',
    }
    const msg = `你是一个设计助手。生成一个${tpl.label}页面（${tpl.desc}，宽度${tpl.width}px）。
风格：${STYLES.find(s => s.id === style)?.label} - ${styleNotes[style]}
要求：输出完整 HTML+CSS，不需 markdown 包裹。\n\n用户需求：${prompt.trim() || title.trim() || '自动生成一个精美的页面'}`

    try {
      const r = await apiFetch(API.documents, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || `${tpl.label}设计`, category: 'AI设计', type: 'AI', size: '1KB', tags: [template, style], content: JSON.stringify({ prompt: prompt.trim() || '' }) }),
      })
      const d = await r.json()
      if (!d.success) { toast.error('保存失败'); setGenerating(false); return }
      fetchProjects()
    } catch { toast.error('保存失败'); setGenerating(false); return }

    const ctrl = chatStream(msg, sessionId, {
      onDelta(text) { setStreamText(text) },
      onDone(finalText) {
        setGenerating(false); setStatus('done')
        let html = finalText; const block = finalText.match(/```(?:html)?\s*([\s\S]*?)```/); if (block?.[1]) html = block[1]
        setResult(html); toast.success('设计稿已生成'); fetchProjects()
      },
      onError(err) { setGenerating(false); setStatus('error'); setResult(`生成失败: ${err}`); toast.error('AI 生成失败') },
    })
    abortRef.current = ctrl
  }
  const handleStop = () => { abortRef.current?.abort(); setGenerating(false); setStatus('idle') }

  const openProject = (p: Project) => {
    setSelectedProject(p)
    setView('detail')
    try { const c = JSON.parse(p.content || '{}'); setResult(c.html || null) } catch { setResult(null) }
  }

  // ── Detail View ──
  if (view === 'detail' && selectedProject) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center h-11 px-3 border-b border-border bg-card flex-shrink-0 gap-2">
          <button onClick={() => { setView('home'); setSelectedProject(null); setResult(null) }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"><ArrowLeftIcon size={16} /></button>
          <span className="text-sm font-medium text-foreground flex-1">{selectedProject.title}</span>
          {result && (
            <button onClick={() => { navigator.clipboard.writeText(result); toast.success('已复制') }}
              className="text-xs px-2 py-1 rounded text-muted-foreground hover:bg-muted border border-border">复制代码</button>
          )}
        </div>
        {result ? (
          <iframe className="flex-1 w-full border-0" srcDoc={result} style={{ background: '#fff' }} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            <div className="text-center"><PaletteIcon size={32} className="mx-auto mb-2 opacity-30" /><p>暂无预览内容</p></div>
          </div>
        )}
      </div>
    )
  }

  // ── Home / Projects View ──
  return (
    <div className="flex h-full bg-background">
      {/* ── Left Rail (like Open Design's EntryNavRail) ── */}
      <div className={`flex-shrink-0 border-r border-border bg-card transition-all duration-200 flex flex-col ${sidebarOpen ? 'w-48' : 'w-12'}`}>
        <div className="flex items-center h-11 px-2 border-b border-border">
          <button onClick={() => setSidebarOpen(v => !v)} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
            {sidebarOpen ? <PanelLeftCloseIcon size={16} /> : <PanelLeftIcon size={16} />}
          </button>
          {sidebarOpen && <span className="text-xs font-semibold text-foreground ml-2">AI 设计</span>}
        </div>
        <div className="flex-1 py-2">
          {NAV_ITEMS.map(item => {
            const active = view === item.id
            return (
              <button key={item.id} onClick={() => setView(item.id)}
                className={`flex items-center gap-2 w-full px-2 py-2 text-xs transition-colors ${sidebarOpen ? 'px-3' : 'justify-center'}`}
                style={{ color: active ? 'var(--foreground)' : 'var(--muted-foreground)', background: active ? 'var(--accent)' : 'transparent' }}>
                <item.icon size={16} />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            )
          })}
        </div>
        <div className="p-2 border-t border-border">
          <button className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded"
            style={{ justifyContent: sidebarOpen ? undefined : 'center' }}>
            <SettingsIcon size={14} />
            {sidebarOpen && <span>设置</span>}
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center h-11 px-4 border-b border-border bg-card flex-shrink-0 gap-2">
          <button onClick={() => setShowNewProject(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--foreground)', color: 'var(--background)' }}>
            <PlusIcon size={13} /> 新建设计
          </button>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">{projects.length} 个项目</span>
        </div>

        {/* Content scroll area */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {view === 'home' && !showNewProject && (
            /* ── Home / Hero ── */
            <div className="max-w-2xl mx-auto p-8 text-center space-y-6">
              <div className="pt-12">
                <SparkleIcon size={36} className="mx-auto text-amber-500 mb-3" />
                <h1 className="text-2xl font-bold text-foreground mb-2">用 AI 设计</h1>
                <p className="text-sm text-muted-foreground">选择模板，描述需求，AI 自动生成</p>
              </div>
              <div className="space-y-3 text-left">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">最近项目</p>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">暂无项目，点击上方「新建设计」开始</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {projects.slice(0, 6).map(p => (
                      <button key={p.id} onClick={() => openProject(p)}
                        className="text-left p-3 rounded-lg text-sm hover:bg-muted transition-colors"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <div className="font-medium text-foreground truncate">{p.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">{p.date}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setView('projects')}
                className="text-xs text-muted-foreground hover:text-foreground underline">查看全部项目</button>
            </div>
          )}

          {view === 'projects' && !showNewProject && (
            /* ── Projects List ── */
            <div className="max-w-4xl mx-auto p-6">
              <div className="grid grid-cols-3 gap-3">
                {projects.length === 0 ? (
                  <div className="col-span-3 text-center py-12 text-sm text-muted-foreground">暂无项目</div>
                ) : projects.map(p => (
                  <div key={p.id} onClick={() => openProject(p)}
                    className="p-4 rounded-lg cursor-pointer hover:bg-muted transition-colors group"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between">
                      <div className="text-sm font-medium text-foreground truncate flex-1">{p.title}</div>
                      <button onClick={e => { e.stopPropagation(); apiFetch(API.documentsById(p.id), { method: 'DELETE' }).then(() => { fetchProjects(); toast.success('已删除') }) }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted flex-shrink-0 ml-1"><TrashIcon size={12} className="text-muted-foreground" /></button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">{p.date}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── New Project Panel (modal overlay, like Open Design's NewProjectPanel) ── */}
          {showNewProject && (
            <div className="max-w-3xl mx-auto p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">新建设计</h2>
                <button onClick={() => setShowNewProject(false)} className="p-1 rounded hover:bg-muted text-muted-foreground"><ArrowLeftIcon size={16} /></button>
              </div>

              {status !== 'generating' && (
                <>
                  <div>
                    <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
                      placeholder="描述你想要的设计，例如：一个简洁的 SaaS 产品落地页，包含导航栏、Hero 区域、功能列表和底部 CTA"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none bg-card border border-border text-foreground placeholder:text-muted-foreground" />
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="项目名称（可选）"
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none bg-card border border-border text-foreground placeholder:text-muted-foreground mt-2" />
                  </div>

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
                </>
              )}

              <div className="flex gap-2">
                {status !== 'generating' ? (
                  <button onClick={handleGenerate}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: 'var(--foreground)', color: 'var(--background)' }}>
                    <SparklesIcon size={15} /> 开始生成
                  </button>
                ) : (
                  <button onClick={handleStop}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white">
                    <LoaderIcon size={15} className="animate-spin" /> 停止
                  </button>
                )}
              </div>

              {status === 'generating' && streamText && (
                <div className="p-3 rounded-lg text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto font-mono"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
                  {streamText.slice(-2000)}
                </div>
              )}

              {status === 'done' && result && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-600 font-medium text-sm"><CheckCircleIcon size={15} /> 已生成</div>
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    <iframe className="w-full border-0" style={{ height: '500px', background: '#fff' }} srcDoc={result} />
                  </div>
                </div>
              )}

              {status === 'error' && result && (
                <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                  <AlertCircleIcon size={15} /> {result}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
