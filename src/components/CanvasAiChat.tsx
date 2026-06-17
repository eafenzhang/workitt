// ─── CanvasAiChat — AI Chat Panel for MinoCanvas ──────────────────
// Connects to CowAgent backend for AI-powered design assistance.
// Handles tool events and can execute actions against the design engine.

import { useState, useRef, useCallback, useEffect } from 'react'
import { XIcon, BotIcon, ArrowUpIcon, LoaderIcon, StopCircleIcon, HammerIcon, CheckCircleIcon } from 'lucide-react'
import { chatStream, createSession } from '../api/cowagent'
import type { ChatCallbacks } from '../api/cowagent'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ToolStatus {
  tool: string
  status: 'running' | 'done' | 'error'
  result?: string
}

interface Props {
  onClose: () => void
  /** Callback when CowAgent emits a tool event — parent can execute engine operations */
  onToolAction?: (action: string, args?: Record<string, unknown>) => void
  /** Called with the full final response text when streaming completes */
  onResponse?: (text: string) => void
}

export default function CanvasAiChat({ onClose, onToolAction, onResponse }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '你好！我是 AI 设计助手，可以帮你生成设计稿、修改节点属性、解答设计问题。有什么需要帮助的吗？' },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [runningTool, setRunningTool] = useState<ToolStatus | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const bufferRef = useRef('') // streaming JSONL buffer
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentSessionId = useRef('')

  // Create session on mount
  useEffect(() => {
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current) }
  }, [])
  useEffect(() => {
    createSession('画板助手').then(s => { if (s?.session_id) setSessionId(s.session_id) })
  }, [])

  // Auto scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, runningTool])

  const SYSTEM_PROMPT = '你是一个 AI 设计助手，可以帮用户生成设计稿。\n重要规则：如果你生成了设计元素，请在回复中直接输出 JSONL 格式数据，每行一个节点对象，不要包装在代码块中。\n格式示例：\n{"id":"r1","type":"rect","_parent":null,"x":100,"y":100,"width":200,"height":150,"fill":"#6366f1","cornerRadius":8}\n{"id":"t1","type":"text","_parent":null,"x":320,"y":100,"content":"Hello","fontSize":24,"color":"#333"}\n注意：每个节点必须有唯一 id，_parent 为父节点id（根节点为 null）。支持的 type: rect, ellipse, text, frame, image。节点之间用换行分隔，不要加逗号和方括号。'

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending || !sessionId) return
    setInput('')
    setSending(true)
    const augmentedMessage = SYSTEM_PROMPT + '\n\n用户需求：' + text
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setRunningTool(null)

    const idleTimeout = 45000 // 45s idle = stuck
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: '⏱️ 请求超时，AI 思考时间过长。请重试或换一个更简单的需求。' }])
      setSending(false)
      setRunningTool(null)
    }, idleTimeout)

    const callbacks: ChatCallbacks = {
      onDelta(t: string) {
        // Reset idle timer on each delta
        if (idleTimer.current) clearTimeout(idleTimer.current)
        idleTimer.current = setTimeout(() => {
          setMessages(prev => [...prev, { role: 'assistant', content: '⏱️ 请求超时，AI 思考时间过长。请重试。' }])
          setSending(false)
          setRunningTool(null)
        }, idleTimeout)
        // Update displayed text — strip JSONL lines from view
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant') {
            const updated = [...prev]
            const displayText = t.split('\n').filter(l => !l.trim().startsWith('{"id":"')).join('\n').trim() || last.content
            updated[updated.length - 1] = { ...last, content: displayText }
            return updated
          }
          return [...prev, { role: 'assistant', content: t }]
        })
        // Parse ONLY NEW JSONL lines (track via offset)
        const prevLen = bufferRef.current.length
        const newText = t.slice(prevLen)
        bufferRef.current = t
        if (newText) {
          for (const line of newText.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('{"id":"')) continue
            try {
              const node = JSON.parse(trimmed)
              if (node.id && node.type && typeof onToolAction === 'function') {
                onToolAction('insert_node', node)
              }
            } catch {}
          }
        }
      },
      onToolStart(tool, args) {
        // Skip internal/system tools like bash, read, write — they're CowAgent internals
        const systemTools = ['bash', 'read', 'write', 'execute_command', 'think', 'finish', '完成任务']
        if (systemTools.includes(tool)) {
          return // don't show in UI
        }
        setRunningTool({ tool, status: 'running' })
        onToolAction?.(tool, args)
      },
      onToolEnd(tool, status, result) {
        const systemTools = ['bash', 'read', 'write', 'execute_command', 'think', 'finish', '完成任务']
        if (systemTools.includes(tool)) return
        setRunningTool({ tool, status: status === 'success' ? 'done' : 'error', result })
      },
      onReasoning(text) {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant' && last.content === '') {
            const updated = [...prev]
            updated[updated.length - 1] = { ...last, content: `🧠 ${text}` }
            return updated
          }
          return prev
        })
      },
      onDone(finalText) {
        if (idleTimer.current) clearTimeout(idleTimer.current)
        setSending(false)
        setRunningTool(null)
        let cleanText = finalText
          .replace(/```json[\s\S]*?```/g, '')
          .replace(/\[\s*\{[^]]*\}\s*\]/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: cleanText || last.content }
          }
          return updated
        })
        onResponse?.(finalText)
      },
      onError(err) {
        if (idleTimer.current) clearTimeout(idleTimer.current)
        setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${err}` }])
        setSending(false)
        setRunningTool(null)
      },
    }

    const ctrl = chatStream(augmentedMessage, sessionId, callbacks)
    abortRef.current = ctrl
  }, [input, sending, sessionId, onToolAction, onResponse])

  const cancelStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setSending(false)
    setRunningTool(null)
    if (idleTimer.current) clearTimeout(idleTimer.current)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }, [send])

  return (
    <div className="flex flex-col w-80 h-96 rounded-xl shadow-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <BotIcon size={16} className="text-primary" />
        <span className="text-xs font-medium text-foreground flex-1">AI 设计助手</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
          <XIcon size={14} />
        </button>
      </div>

      {/* Messages — scrollbar hidden */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Tool execution indicator */}
        {runningTool && (
          <div className="flex justify-start">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
              runningTool.status === 'done' ? 'bg-green-500/10 text-green-600' :
              runningTool.status === 'error' ? 'bg-red-500/10 text-red-600' :
              'bg-blue-500/10 text-blue-600'
            }`}>
              {runningTool.status === 'running' ? <HammerIcon size={12} className="animate-bounce" /> :
               runningTool.status === 'done' ? <CheckCircleIcon size={12} /> :
               <XIcon size={12} />}
              <span>{runningTool.tool}</span>
            </div>
          </div>
        )}

        {sending && !runningTool && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground flex items-center gap-1.5">
              <LoaderIcon size={12} className="animate-spin" />
              <span>思考中...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input — matches HomeInput style */}
      <div className="px-2 pt-1.5 pb-2 border-t border-border">
        <div className="rounded-xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              const el = textareaRef.current
              if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 80) + 'px' }
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            rows={1}
            className="w-full resize-none bg-transparent outline-none text-xs px-3 pt-2 pb-1 placeholder:text-muted-foreground"
            style={{ color: 'var(--foreground)', maxHeight: '80px' }}
          />
          <div className="flex items-center justify-end px-2 pb-1.5">
            {sending ? (
              <button onClick={cancelStream} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                <StopCircleIcon size={13} />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{ background: input.trim() ? 'var(--foreground)' : 'var(--muted)', color: input.trim() ? 'var(--background)' : 'var(--muted-foreground)' }}
              >
                <ArrowUpIcon size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
