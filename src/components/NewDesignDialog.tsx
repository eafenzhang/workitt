// ─── NewDesignDialog — New design creation dialog (inspired by Open Design) ──

import { useState } from 'react'
import { XIcon, PaintbrushIcon, SmartphoneIcon, MonitorIcon, LayoutIcon, SparklesIcon, ArrowRightIcon } from 'lucide-react'

interface Template {
  id: string
  label: string
  icon: any
  color: string
  desc: string
  /** Canvas width hint */
  width: number
}

const TEMPLATES: Template[] = [
  { id: 'web', label: '网页', icon: MonitorIcon, color: '#6366f1', desc: '桌面端网页设计', width: 1440 },
  { id: 'mobile', label: '移动端', icon: SmartphoneIcon, color: '#10b981', desc: '手机应用界面', width: 375 },
  { id: 'prototype', label: '原型', icon: LayoutIcon, color: '#f59e0b', desc: '低保真线框图', width: 1024 },
  { id: 'dashboard', label: '仪表盘', icon: LayoutIcon, color: '#8b5cf6', desc: '数据面板布局', width: 1440 },
  { id: 'landing', label: '落地页', icon: MonitorIcon, color: '#06b6d4', desc: '营销活动页面', width: 1440 },
  { id: 'blank', label: '空白画板', icon: PaintbrushIcon, color: '#64748b', desc: '从零开始', width: 1024 },
]

const STYLES = [
  { id: 'auto', label: '自动', colors: ['#6366f1', '#10b981', '#f59e0b'] },
  { id: 'minimal', label: '极简', colors: ['#1a1a1a', '#f5f5f5', '#e0e0e0'] },
  { id: 'dark', label: '深色', colors: ['#0d0d0d', '#1a1a2e', '#6b7280'] },
  { id: 'warm', label: '温暖', colors: ['#b45309', '#fef3c7', '#fde68a'] },
  { id: 'cool', label: '冷色', colors: ['#1e3a5f', '#2563eb', '#93c5fd'] },
]

const PRESET_SCHEMES: Record<string, string[]> = {
  auto: [],
  minimal: ['#1a1a1a', '#f5f5f5', '#e0e0e0'],
  dark: ['#0d0d0d', '#1a1a2e', '#6b7280'],
  warm: ['#b45309', '#fef3c7', '#fde68a'],
  cool: ['#1e3a5f', '#2563eb', '#93c5fd'],
}

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (params: {
    title: string
    template: string
    style: string
    width: number
  }) => void
}

export default function NewDesignDialog({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('blank')
  const [selectedStyle, setSelectedStyle] = useState('auto')

  if (!open) return null

  const template = TEMPLATES.find(t => t.id === selectedTemplate)!
  const styleColors = PRESET_SCHEMES[selectedStyle] || []

  const handleCreate = () => {
    onCreate({
      title: title.trim() || `${template.label}设计稿`,
      template: selectedTemplate,
      style: selectedStyle,
      width: template.width,
    })
    setTitle('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[640px] max-h-[85vh] rounded-2xl overflow-y-auto" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <SparklesIcon size={16} style={{ color: 'var(--accent-foreground)' }} />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>新建设计稿</h2>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>选择模板和风格开始创作</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted" style={{ color: 'var(--muted-foreground)' }}>
            <XIcon size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Project name */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>项目名称</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：产品落地页"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
              style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            />
          </div>

          {/* Template picker */}
          <div>
            <label className="block text-xs font-medium mb-2.5" style={{ color: 'var(--foreground)' }}>选择模板</label>
            <div className="grid grid-cols-3 gap-2.5">
              {TEMPLATES.map(t => {
                const Icon = t.icon
                const isActive = selectedTemplate === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all"
                    style={{
                      background: isActive ? t.color + '15' : 'var(--muted)',
                      border: `1px solid ${isActive ? t.color : 'var(--border)'}`,
                    }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: isActive ? t.color + '25' : 'var(--background)' }}>
                      <Icon size={16} style={{ color: isActive ? t.color : 'var(--muted-foreground)' }} />
                    </div>
                    <span className="text-xs font-medium" style={{ color: isActive ? t.color : 'var(--foreground)' }}>{t.label}</span>
                    <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{t.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Style picker */}
          <div>
            <label className="block text-xs font-medium mb-2.5" style={{ color: 'var(--foreground)' }}>设计风格</label>
            <div className="flex gap-2.5">
              {STYLES.map(s => {
                const isActive = selectedStyle === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStyle(s.id)}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all flex-1"
                    style={{
                      background: isActive ? 'var(--accent)' : 'var(--muted)',
                      border: `1px solid ${isActive ? 'transparent' : 'var(--border)'}`,
                    }}
                  >
                    <div className="flex gap-1">
                      {s.colors.map((c, i) => (
                        <div key={i} className="w-4 h-4 rounded-full" style={{ background: c, border: '1px solid rgba(0,0,0,0.1)' }} />
                      ))}
                    </div>
                    <span className="text-[11px] font-medium" style={{
                      color: isActive ? 'var(--accent-foreground)' : 'var(--foreground)'
                    }}>{s.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted"
            style={{ color: 'var(--foreground)' }}>
            取消
          </button>
          <button onClick={handleCreate}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--foreground)', color: 'var(--background)' }}>
            <span>创建画板</span>
            <ArrowRightIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
