// ─── OpenDesign — AI-powered project creation (Open Design style) ─────
// Separate from MinoPencil canvas. Uses own data via /api/ai_projects.

import { useState } from 'react'
import { apiFetch, API } from '../api'
import { toast } from 'sonner'
import {
  SparklesIcon, SparkleIcon, ArrowRightIcon, XIcon, MonitorIcon,
  SmartphoneIcon, LayoutIcon, PaintbrushIcon, LoaderIcon,
} from 'lucide-react'

interface Template {
  id: string; label: string; icon: any; color: string; desc: string; width: number
}

const TEMPLATES: Template[] = [
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

const API_PROJECTS = '/api/ai_projects'  // separate endpoint from /api/documents

export default function OpenDesign() {
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('web')
  const [selectedStyle, setSelectedStyle] = useState('auto')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const template = TEMPLATES.find(t => t.id === selectedTemplate)!

  const handleGenerate = async () => {
    if (!title.trim() && !prompt.trim()) {
      toast.error('请输入项目名称或设计需求')
      return
    }
    setGenerating(true)
    setResult(null)
    try {
      const r = await apiFetch(API_PROJECTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || `${template.label}设计`,
          prompt: prompt.trim() || title.trim() || '自动生成',
          template: selectedTemplate,
          style: selectedStyle,
          width: template.width,
        }),
      })
      const d = await r.json()
      if (d.success) {
        toast.success('项目已创建')
        setResult(d.id ? `项目 ID: ${d.id}` : '创建成功')
      } else {
        toast.error(d.error || '创建失败')
      }
    } catch {
      toast.error('创建失败，请检查后端服务')
    }
    setGenerating(false)
  }

  return (
    <div className="h-full overflow-y-auto bg-background" style={{ scrollbarWidth: 'none' }}>
      <div className="max-w-3xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
            <SparkleIcon size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">AI 设计</h1>
            <p className="text-sm text-muted-foreground">选择模板和风格，AI 自动生成设计稿</p>
          </div>
        </div>

        {/* Project name */}
        <div>
          <label className="block text-sm font-medium mb-2 text-foreground">项目名称</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：产品落地页"
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-colors bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-ring" />
        </div>

        {/* Design brief */}
        <div>
          <label className="block text-sm font-medium mb-2 text-foreground">设计需求</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
            placeholder="描述你想要的设计，例如：一个简洁的 SaaS 产品落地页，包含导航栏、Hero 区域、功能列表和底部 CTA"
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-colors bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-ring resize-none" />
        </div>

        {/* Template picker */}
        <div>
          <label className="block text-sm font-medium mb-3 text-foreground">选择模板</label>
          <div className="grid grid-cols-3 gap-3">
            {TEMPLATES.map(t => {
              const Icon = t.icon; const active = selectedTemplate === t.id
              return (
                <button key={t.id} onClick={() => setSelectedTemplate(t.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all"
                  style={{ background: active ? t.color + '15' : 'var(--card)', border: `1px solid ${active ? t.color : 'var(--border)'}` }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: active ? t.color + '25' : 'var(--muted)' }}>
                    <Icon size={17} style={{ color: active ? t.color : 'var(--muted-foreground)' }} />
                  </div>
                  <span className="text-sm font-medium" style={{ color: active ? t.color : 'var(--foreground)' }}>{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Style picker */}
        <div>
          <label className="block text-sm font-medium mb-3 text-foreground">色彩风格</label>
          <div className="flex gap-3">
            {STYLES.map(s => {
              const active = selectedStyle === s.id
              return (
                <button key={s.id} onClick={() => setSelectedStyle(s.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all flex-1"
                  style={{ background: active ? 'var(--accent)' : 'var(--card)', border: `1px solid ${active ? 'transparent' : 'var(--border)'}` }}>
                  <div className="flex gap-1">
                    {s.colors.map((c, i) => (
                      <div key={i} className="w-4 h-4 rounded-full" style={{ background: c, border: '1px solid rgba(0,0,0,0.1)' }} />
                    ))}
                  </div>
                  <span className="text-xs font-medium" style={{ color: active ? 'var(--accent-foreground)' : 'var(--foreground)' }}>{s.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Generate */}
        <button onClick={handleGenerate} disabled={generating}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ background: 'var(--foreground)', color: 'var(--background)' }}>
          {generating ? <><LoaderIcon size={16} className="animate-spin" /> 生成中...</> : <><SparklesIcon size={16} /> 开始生成</>}
        </button>

        {/* Result */}
        {result && (
          <div className="p-4 rounded-xl text-sm" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 text-green-600 font-medium mb-1">
              <SparkleIcon size={14} /> 项目已创建
            </div>
            <p className="text-muted-foreground">{result}</p>
          </div>
        )}
      </div>
    </div>
  )
}
