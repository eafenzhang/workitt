import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { XIcon, Loader2Icon, PlusIcon, ClockIcon, ChevronDownIcon, MessageCircleIcon, Trash2Icon, WrenchIcon, ChevronUpIcon, BotIcon, ZapIcon, TerminalIcon, PuzzleIcon, SettingsIcon, StopCircleIcon, PaperclipIcon } from 'lucide-react';
import HomeInput, { type HomeSendPayload } from '../components/HomeInput';
import PortalDropdown from '../components/PortalDropdown';
import AIFeedback from '../components/AIFeedback';
import { toast } from 'sonner';

// Shared inline style objects
const HL = {
  input: {background:'var(--wiki-surface2)',border:'1px solid var(--wiki-border)',color:'var(--wiki-text)'} as React.CSSProperties,
  panel: {background:'var(--wiki-surface)',border:'1px solid var(--wiki-border)'} as React.CSSProperties,
  surface: {background:'var(--wiki-surface2)'} as React.CSSProperties,
};
import { apiFetch, API } from '../api';
import { checkBackendStatus, chatStream, cancelChat, createSession } from '../api/cowagent';
import { getGreeting, getTodayDate, generateMessageId, WELCOME_MESSAGES } from '../data/homeDefaults';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Provider display names (synced with src/data/providers.ts)
const PROVIDER_NAMES: Record<string, string> = {
  deepseek: 'DeepSeek', minimax: 'MiniMax', mimo: 'Mimo AI', zhipu: '智谱 AI',
  moonshot: 'Moonshot', dashscope: '阿里云百炼', volcengine: '火山引擎', tencent: '腾讯混元',
  qianfan: '百度千帆', siliconflow: '硅基流动', openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google',
};

interface HomeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
  _meta?: {
    type?: 'tool_call' | 'final_response';
    toolName?: string;
    args?: Record<string, any>;
    result?: string;
    toolCallCount?: number;
  };
}

const LS_KEY = 'home_messages';

function formatTime(date: Date): string { return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`; }

/** Conversation session */
interface Conversation { id: string; title: string; messages: HomeMessage[]; createdAt: string; }
const CONV_KS = 'home_conversations';

// ── Streaming card with Markdown rendering ──
function StreamingCard({ text, speed = 25 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!text) { setDisplayed(''); setIsComplete(false); return; }

    setDisplayed('');
    setIsComplete(false);
    let idx = 0;
    const chars = [...text];
    const timer = setInterval(() => {
      if (idx >= chars.length) { clearInterval(timer); setIsComplete(true); return; }
      setDisplayed(chars.slice(0, idx + 1).join(''));
      idx++;
    }, Math.max(speed, 5));

    return () => clearInterval(timer);
  }, [text, speed]);

  if (!displayed) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--wiki-text3)' }}>
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--wiki-text3)', animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--wiki-text3)', animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--wiki-text3)', animationDelay: '300ms' }} />
        </span>
        <span className="italic">AI 思考中...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {displayed}
      </ReactMarkdown>
      {!isComplete && (
        <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom animate-pulse"
          style={{ background: 'var(--wiki-text)' }} />
      )}
    </div>
  );
}

// Shared markdown component styles (table support + wider spacing)
const MD_COMPONENTS = {
  code({ className, children, ...props }: any) {
    const isInline = !className;
    if (isInline) {
      return <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-info)' }} {...props}>{children}</code>;
    }
    return (
      <pre className="overflow-x-auto rounded-lg p-3 my-2 text-xs" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
        <code className={className} {...props}>{children}</code>
      </pre>
    );
  },
  p({ children }: any) {
    return <p style={{ marginBottom: '1em', lineHeight: 2.0 }}>{children}</p>;
  },
  ul({ children }: any) {
    return <ul style={{ paddingLeft: '1.5em', marginBottom: '1em', lineHeight: 2.0 }}>{children}</ul>;
  },
  ol({ children }: any) {
    return <ol style={{ paddingLeft: '1.5em', marginBottom: '1em', lineHeight: 2.0 }}>{children}</ol>;
  },
  table({ children }: any) {
    return <table className="w-full my-2 border-collapse text-sm" style={{ border: '1px solid var(--wiki-border)' }}>{children}</table>;
  },
  th({ children }: any) {
    return <th className="px-3 py-2 text-xs font-semibold text-left" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}>{children}</th>;
  },
  td({ children }: any) {
    return <td className="px-3 py-2 text-xs" style={{ border: '1px solid var(--wiki-border)', color: 'var(--wiki-text2)' }}>{children}</td>;
  },
  blockquote({ children }: any) {
    return <blockquote className="border-l-2 pl-3 my-2 text-sm italic" style={{ borderColor: 'var(--wiki-accent)', color: 'var(--wiki-text2)' }}>{children}</blockquote>;
  },
};

// ── Markdown renderer (without streaming) ──
function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
}

// ── Simple memory extraction from conversation ──
// Extracts key facts/preferences from user messages using pattern matching.
// This runs client-side for performance — no extra AI call needed.
function extractMemoryFacts(messages: HomeMessage[]): { key: string; value: string }[] {
  const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content);
  const facts: { key: string; value: string }[] = [];

  // Pattern: "我喜欢/习惯/偏好/想要..." — capture as preference
  const preferenceMatch = userMsgs.join('\n').match(/(?:我喜欢|我习惯|我偏好|我想要|我希望|我倾向于|我一般)([^。\n]{3,60})[。\n]/g);
  if (preferenceMatch) {
    for (const m of preferenceMatch.slice(-5)) {
      const cleaned = m.replace(/^(?:我喜欢|我习惯|我偏好|我想要|我希望|我倾向于|我一般)/, '').replace(/[。\n]$/, '').trim();
      if (cleaned.length >= 3) facts.push({ key: '偏好', value: cleaned });
    }
  }

  // Pattern: project/task mentions
  const projectMatch = userMsgs.join('\n').match(/(?:项目|开发|构建|需求|部署|测试|上线)(?:[^。\n]*)[：:]\s*([^。\n]{3,60})/g);
  if (projectMatch) {
    for (const m of projectMatch.slice(-3)) {
      const cleaned = m.replace(/[。\n]$/, '').trim();
      if (cleaned.length >= 5) facts.push({ key: '当前工作', value: cleaned });
    }
  }

  // Pattern: naming convention — "叫我/称呼我/我是"
  const nameMatch = userMsgs.join('\n').match(/(?:叫我|称呼我|我是|我叫)([^。\n]{2,10})[。\n]/);
  if (nameMatch && nameMatch[1].trim().length >= 2) {
    facts.push({ key: '称呼', value: nameMatch[1].trim() });
  }

  // Pattern: tech stack mentions
  const techMatch = userMsgs.join('\n').match(/(?:技术栈|框架|语言|工具)\s*(?:是|用|使用|采用)?\s*([^。\n]{3,30})/g);
  if (techMatch) {
    for (const m of techMatch.slice(-2)) {
      const cleaned = m.trim();
      if (cleaned.length >= 5) facts.push({ key: '技术偏好', value: cleaned });
    }
  }

  // Deduplicate by key
  const seen = new Set<string>();
  return facts.filter(f => {
    const k = `${f.key}:${f.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function loadConversations(): Conversation[] {
  try {
    const r = localStorage.getItem(CONV_KS);
    if (!r) return [];
    const convs: Conversation[] = JSON.parse(r);
    // Sort newest first by createdAt (descending)
    convs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return convs;
  } catch { return []; }
}
const MAX_CONVERSATIONS = 50;

function saveConversations(convs: Conversation[]): void {
  const trimmed = convs.slice(-MAX_CONVERSATIONS);
  try { localStorage.setItem(CONV_KS, JSON.stringify(trimmed)); } catch {}
}

interface HomeProps { onOpenTab?: (type: string, title: string, extra?: Record<string, any>) => void; }

/** Tool call bubble with collapsible result and tool icon */
function ToolCallBubble({ msg }: { msg: HomeMessage }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = msg._meta?.toolName || '';
  const isMCP = toolName.includes('__') && !toolName.startsWith('cli__');
  const isCLI = toolName.startsWith('cli__');
  const ToolIcon = isCLI ? TerminalIcon : isMCP ? PuzzleIcon : WrenchIcon;
  const iconColor = isMCP ? '#6366f1' : isCLI ? '#10b981' : 'var(--wiki-text3)';
  const displayName = isCLI ? toolName.slice(5) : toolName;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2 cursor-pointer"
          style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}
          onClick={() => setExpanded(!expanded)}>
          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: iconColor + '20' }}>
            <ToolIcon size={11} style={{ color: iconColor }} />
          </div>
          <span className="font-mono text-xs" style={{ color: 'var(--wiki-text)' }}>{displayName}</span>
          {msg._meta?.args && <span className="text-xs text-wiki-text3 truncate max-w-[120px]">{JSON.stringify(msg._meta.args).substring(0, 40)}</span>}
          <span className="ml-auto">{expanded ? <ChevronUpIcon size={10} /> : <ChevronDownIcon size={10} />}</span>
        </div>
        {expanded && msg._meta?.result && (
          <pre className="mt-1 p-2 rounded text-xs max-h-48 overflow-y-auto scrollbar-thin"
            style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', whiteSpace: 'pre-wrap', border: '1px solid var(--wiki-border)', borderRadius: '8px' }}>
            {msg._meta.result.length > 2000
              ? msg._meta.result.substring(0, 2000) + '\n\n[结果已截断，完整长度: ' + msg._meta.result.length + ' 字符]'
              : msg._meta.result}
          </pre>
        )}
      </div>
    </div>
  );
}

function Home({ onOpenTab }: HomeProps) {
  const userProfile = null;
  const [messages, setMessages] = useState<HomeMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Check CowAgent backend status on mount
  useEffect(() => {
    checkBackendStatus().then(status => setBackendAvailable(status.running));
  }, []);

  // Provider / Model / MCP state
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [showToolPanel, setShowToolPanel] = useState(false);
  // Tool category toggles
  const [toolCategories, setToolCategories] = useState({ mcp: true, cli: true, skills: true, plugins: true });
  const [toolCounts, setToolCounts] = useState({ mcp: 0, cli: 0, skills: 0, plugins: 0 });

  // Load tool counts on mount
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.mcpGetTools) { api.mcpGetTools().then((r: any) => setToolCounts(prev => ({ ...prev, mcp: r?.tools?.length || 0 }))).catch(() => {}); }
    if (api?.dbQuery) {
      api.dbQuery('GET', 'cli_tools').then((r: any) => { if (Array.isArray(r)) setToolCounts(prev => ({ ...prev, cli: r.filter((t:any)=>t.enabled).length })); }).catch(() => {});
      api.dbQuery('GET', 'skills').then((r: any) => { if (Array.isArray(r)) setToolCounts(prev => ({ ...prev, skills: r.filter((t:any)=>t.enabled).length })); }).catch(() => {});
      api.dbQuery('GET', 'claude_code_plugins').then((r: any) => { if (Array.isArray(r)) setToolCounts(prev => ({ ...prev, plugins: r.filter((t:any)=>t.enabled).length })); }).catch(() => {});
    }
  }, []);

  // Conversation management
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // ── Agent Memory state ──
  const [memorySummary, setMemorySummary] = useState<string>('');

  // Load memories from database on mount
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.memorySummary) {
      api.memorySummary().then((s: string) => { if (s) setMemorySummary(s); }).catch(() => {});
    }
  }, []);

  // Model data & dropdown state (flat list from API, grouped by provider for display)
  interface FlatModel { id: number; provider: string; modelId: string; name: string; enabled: boolean; isDefault: boolean }
  interface GroupedProvider { provider: string; label: string; models: { id: number; modelId: string; name: string }[] }
  const [providers, setProviders] = useState<GroupedProvider[]>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  useEffect(() => {
    const load = () => {
      apiFetch(API.models).then(r => r.json()).then((list: FlatModel[]) => {
        const arr = Array.isArray(list) ? list.filter(m => m.enabled) : [];
        const groups: Record<string, GroupedProvider> = {};
        for (const m of arr) {
          if (!groups[m.provider]) groups[m.provider] = { provider: m.provider, label: PROVIDER_NAMES[m.provider] || m.provider, models: [] };
          groups[m.provider].models.push({ id: m.id, modelId: m.modelId, name: m.name });
        }
        setProviders(Object.values(groups));
        const def = arr.find(m => m.isDefault);
        if (def) { setSelectedProvider(def.provider); setSelectedModel(String(def.modelId)); }
      }).catch(() => {});
    };
    load();
    window.addEventListener('focus', load);
    window.addEventListener('model-config-changed', load);
    return () => { window.removeEventListener('focus', load); window.removeEventListener('model-config-changed', load); };
  }, []);

  const currentModelLabel = (() => {
    for (const p of providers) {
      for (const m of p.models) {
        if (p.provider === selectedProvider && String(m.modelId) === selectedModel) {
          const name = m.name.includes(' - ') ? m.name.split(' - ').pop()! : m.name;
          return name;
        }
      }
    }
    return '选择模型';
  })();

  const greeting = getGreeting(userProfile?.nickname);
  const todayDate = getTodayDate();
  const welcomeSub = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  // ── Restore last active conversation on mount ──
  useEffect(() => {
    const convs = loadConversations();
    if (convs.length > 0) {
      const last = convs[0]; // sorted newest first
      setActiveConvId(last.id);
      setMessages(last.messages);
    }
  }, []);

  // Build agent system prompt from user role profile + persistent memories
  const buildSystemPrompt = useCallback(() => {
    const p = userProfile;
    if (!p || !p.role) return '';
    const nickname = p.nickname || 'Workitt';
    const parts = [
      `# 身份`,
      `你是「${nickname}」，一名专业的${p.role}。`,
      `你在科技公司工作，专注于需求管理、技术交付和团队协作。`,
    ];
    if (p.personality) parts.push(`\n# 人格特质\n${p.personality}`);
    if (p.memory_skills || p.skills) parts.push(`\n# 核心技能\n${p.memory_skills || p.skills}`);
    if (p.memory) parts.push(`\n# 用户画像记忆\n${p.memory}`);
    if (memorySummary) parts.push(`\n# 长期记忆\n${memorySummary}`);
    parts.push(`\n# 对话规则`);
    parts.push(`- 以${p.role}的专业视角思考和回答所有问题`);
    parts.push(`- 结合你的「人格特质」和「核心技能」来处理任务`);
    parts.push(`- 参考「用户画像记忆」和「长期记忆」来个性化回复`);
    parts.push(`- 使用中文，保持专业但友好的语气`);
    if (toolsEnabled) {
      const activeTools: string[] = [];
      if (toolCategories.mcp) activeTools.push('MCP工具');
      if (toolCategories.cli) activeTools.push('CLI命令');
      if (toolCategories.skills) activeTools.push('Skills技能');
      if (toolCategories.plugins) activeTools.push('Plugins插件');
      if (activeTools.length > 0) parts.push(`- 已启用的工具：${activeTools.join('、')}，在适当的时候主动调用`);
    }
    return parts.join('\n');
  }, [userProfile, memorySummary, toolsEnabled, toolCategories]);

  // Fallback send via Electron IPC — defined BEFORE handleSend to avoid TDZ
  const fallbackSend = useCallback(async (newMessages: HomeMessage[]) => {
    try {
      const api = (window as any).electronAPI;
      const systemPrompt = buildSystemPrompt();
      const conversation = newMessages.map(m => ({ role: m.role, content: m.content }));

      let replyContent: string;
      if (api?.chatSend) {
        const result = await api.chatSend({
          providerId: selectedProvider, modelId: selectedModel,
          messages: conversation, systemPrompt, toolsEnabled,
        });
        replyContent = result?.content || result?.error || '模型返回为空';
        const toolHistory = result?.toolCallHistory;
        if (toolHistory && Array.isArray(toolHistory) && toolHistory.length > 0) {
          const toolMsgs: HomeMessage[] = toolHistory.map(tc => ({
            id: generateMessageId(), role: 'assistant' as const,
            content: `[MCP Tool] ${tc.toolName}`, time: formatTime(new Date()),
            _meta: { type: 'tool_call', toolName: tc.toolName, args: tc.args, result: tc.result },
          }));
          const assistantMsg: HomeMessage = {
            id: generateMessageId(), role: 'assistant', content: replyContent, time: formatTime(new Date()),
            _meta: { type: 'final_response', toolCallCount: toolHistory.length },
          };
          const final = [...newMessages, ...toolMsgs, assistantMsg];
          setMessages(final); setSending(false); saveConversation(final); autoExtractMemories(final);
          return;
        }
      } else {
        replyContent = 'AI 对话未就绪（请在模型配置中设置 API Key）';
      }

      const assistantMsg: HomeMessage = { id: generateMessageId(), role: 'assistant', content: replyContent, time: formatTime(new Date()) };
      const final = [...newMessages, assistantMsg];
      setMessages(final); setSending(false); saveConversation(final); autoExtractMemories(final);
    } catch (e: any) {
      setMessages(prev => [...prev, { id: generateMessageId(), role: 'assistant', content: `请求失败：${e.message || '未知错误'}`, time: formatTime(new Date()) }]);
      setSending(false);
    }
  }, [buildSystemPrompt, selectedProvider, selectedModel, toolsEnabled]);

  const handleSend = useCallback(async (payload: HomeSendPayload) => {
    const now = new Date();
    const userMsg: HomeMessage = { id: generateMessageId(), role: 'user', content: payload.content, time: formatTime(now) };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setSending(true);
    setStreamingContent('');

    // Try CowAgent SSE streaming first
    if (backendAvailable) {
      let sessionId = activeConvId || 'default';
      try {
        const session = await createSession('Workitt 对话');
        if (session?.session_id) sessionId = session.session_id;
      } catch {}

      const ctrl = chatStream(payload.content, sessionId, {
        onDelta: (text) => setStreamingContent(text),
        onDone: (text) => {
          const assistantMsg: HomeMessage = {
            id: generateMessageId(), role: 'assistant', content: text, time: formatTime(new Date()),
          };
          const final = [...newMessages, assistantMsg];
          setMessages(final);
          setStreamingContent('');
          setSending(false);
          saveConversation(final);
          autoExtractMemories(final);
        },
        onError: () => fallbackSend(newMessages),
        onToolStart: (tool, args) => {
          const toolMsg: HomeMessage = {
            id: generateMessageId(), role: 'assistant', content: `[工具] ${tool}`,
            time: formatTime(new Date()),
            _meta: { type: 'tool_call', toolName: tool, args },
          };
          setMessages(prev => [...prev, toolMsg]);
        },
      });
      abortRef.current = ctrl;
      return;
    }

    // Fallback: Electron IPC
    await fallbackSend(newMessages);
  }, [messages, buildSystemPrompt, activeConvId, selectedProvider, selectedModel, toolsEnabled, backendAvailable, fallbackSend]);

  // Auto-extract memories (defined early to avoid TDZ)
  const autoExtractMemories = useCallback(async (finalMessages: HomeMessage[]) => {
    const api = (window as any).electronAPI;
    if (!api?.memoryUpsert) return;
    const facts = extractMemoryFacts(finalMessages);
    for (const fact of facts) {
      try {
        const source = finalMessages[0]?.content?.slice(0, 30) || '对话';
        await api.memoryUpsert(fact.key, fact.value, source);
      } catch {}
    }
    if (facts.length > 0 && api?.memorySummary) {
      try { const s = await api.memorySummary(); if (s) setMemorySummary(s); } catch {}
    }
  }, []);

  // Save conversation (defined early to avoid TDZ)
  const saveConversation = useCallback((finalMessages: HomeMessage[]) => {
    let convId = activeConvId;
    if (!convId) {
      convId = generateMessageId();
      setActiveConvId(convId);
    }
    setConversations(prev => {
      const updated = prev.map(c => c.id === convId ? { ...c, messages: finalMessages, title: finalMessages[0]?.content?.slice(0, 30) || c.title } : c);
      if (!updated.find(c => c.id === convId)) {
        updated.push({ id: convId!, title: finalMessages[0]?.content?.slice(0, 30) || '新对话', messages: finalMessages, createdAt: new Date().toISOString() });
      }
      saveConversations(updated);
      return updated;
    });
  }, [activeConvId]);

  const handleNewChat = useCallback(() => {
    if (messages.length > 0 && activeConvId) {
      // Save current conversation before starting new
      setConversations(prev => {
        const exists = prev.find(c => c.id === activeConvId);
        const updated = exists
          ? prev.map(c => c.id === activeConvId ? { ...c, messages, title: messages[0]?.content?.slice(0, 30) || '新对话' } : c)
          : [...prev, { id: activeConvId, title: messages[0]?.content?.slice(0, 30) || '新对话', messages, createdAt: new Date().toISOString() }];
        saveConversations(updated);
        return updated;
      });
    }
    const newId = generateMessageId();
    setActiveConvId(newId);
    setMessages([]);
    setShowHistory(false);
  }, [messages, activeConvId]);

  const handleOpenConv = useCallback((conv: Conversation) => {
    setActiveConvId(conv.id);
    setMessages(conv.messages);
    setShowHistory(false);
  }, []);

  const handleDeleteConv = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => { const next = prev.filter(c => c.id !== id); saveConversations(next); return next; });
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
  }, [activeConvId]);

  const handleClearHistory = useCallback(() => {
    if (!confirm('确定清空全部历史对话？')) return;
    setConversations([]);
    saveConversations([]);
    setActiveConvId(null);
    setMessages([]);
    setShowHistory(false);
    toast.success('历史对话已清空');
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <div data-cmp="Home" className="flex flex-col h-full">
      {/* Top bar: new chat left, history right */}
      <div className="flex items-center justify-between px-6 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
        <button onClick={handleNewChat}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors"
          style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}>
          <PlusIcon size={13} />新对话
        </button>

        <div className="relative">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}
            >
              <ClockIcon size={13} />历史对话
            </button>
            {showHistory && (
              <div className="absolute top-full mt-2 right-0 w-80 max-h-80 overflow-y-auto scrollbar-thin rounded-xl shadow-xl z-30" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                <div className="sticky top-0 px-4 py-2.5 text-xs font-semibold" style={{ background: 'var(--wiki-surface)', borderBottom: '1px solid var(--wiki-border)', color: 'var(--wiki-text2)' }}>
                  历史对话 ({conversations.length})
                </div>
                {conversations.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--wiki-text3)' }}>暂无历史对话</div>
                ) : (
                  conversations.map(c => (
                    <div key={c.id}
                      className="flex items-center gap-2 px-4 py-3 cursor-pointer transition-colors group"
                      style={{ background: c.id === activeConvId ? 'var(--wiki-surface2)' : 'transparent', borderBottom: '1px solid var(--wiki-border)' }}
                      onMouseEnter={e => { if (c.id !== activeConvId) e.currentTarget.style.background = 'var(--wiki-surface2)'; }}
                      onMouseLeave={e => { if (c.id !== activeConvId) e.currentTarget.style.background = 'transparent'; }}
                      onClick={() => handleOpenConv(c)}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: c.id === activeConvId ? 'var(--wiki-text)' : 'var(--wiki-surface2)' }}>
                        <MessageCircleIcon size={14} style={{ color: c.id === activeConvId ? 'var(--wiki-bg)' : 'var(--wiki-text3)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate" style={{ color: c.id === activeConvId ? 'var(--wiki-text)' : 'var(--wiki-text2)', fontWeight: c.id === activeConvId ? 600 : 400 }}>{c.title || '新对话'}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--wiki-text3)' }}>{c.messages.length} 条消息 · {c.createdAt?.slice(0, 10)}</div>
                      </div>
                      <button onClick={(e) => handleDeleteConv(c.id, e)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-50 transition-all flex-shrink-0" title="删除">
                        <XIcon size={12} style={{ color: 'var(--wiki-text3)' }} />
                      </button>
                    </div>
                  ))
                )}
                {conversations.length > 0 && (
                  <div className="sticky bottom-0 px-4 py-2" style={{ background: 'var(--wiki-surface)', borderTop: '1px solid var(--wiki-border)' }}>
                    <button onClick={handleClearHistory}
                      className="flex items-center gap-1.5 text-xs w-full justify-center py-1.5 rounded hover:bg-red-50 transition-colors"
                      style={{ color: 'var(--wiki-danger)' }}>
                      <Trash2Icon size={12} />清空全部
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-6">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full gap-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-semibold" style={{ color: 'var(--wiki-text)' }}>Hi，{greeting}</h1>
              <p className="text-sm" style={{ color: 'var(--wiki-text3)' }}>{welcomeSub}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--wiki-text3)' }}>{todayDate}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-4 max-w-2xl mx-auto w-full">
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const isToolCall = msg._meta?.type === 'tool_call';
              const isFinalResponse = msg._meta?.type === 'final_response';

              // Tool call bubble
              if (isToolCall) {
                return <ToolCallBubble key={msg.id} msg={msg} />;
              }

              // Regular message bubble
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                  <div className="relative max-w-[80%]">
                    {isFinalResponse && msg._meta?.toolCallCount && (
                      <div className="text-xs mb-1 flex items-center gap-1" style={{ color: 'var(--wiki-text3)' }}>
                        <WrenchIcon size={10} />
                        <span>已通过 {msg._meta.toolCallCount} 次工具调用获取信息</span>
                      </div>
                    )}
                    <div className="px-4 py-2.5 rounded-xl text-sm leading-relaxed break-words"
                      style={{ background: isUser ? 'var(--wiki-text)' : 'var(--wiki-surface2)', color: isUser ? 'var(--wiki-bg)' : 'var(--wiki-text)', borderBottomRightRadius: isUser ? '4px' : undefined, borderBottomLeftRadius: isUser ? undefined : '4px' }}>
                      {isUser ? (
                        <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                      ) : (
                        <MarkdownContent text={msg.content} />
                      )}
                    </div>
                    <div className="text-xs mt-1 flex items-center gap-2 justify-end" style={{ color: 'var(--wiki-text3)' }}>
                      <span>{msg.time}</span>
                      {!isUser && <AIFeedback messageId={msg.id} conversationId={activeConvId} context={msg.content?.substring(0, 500)} />}
                    </div>
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className="flex justify-start">
                <div className="px-4 py-2.5 rounded-xl" style={{ background: 'var(--wiki-surface2)' }}>
                  <Loader2Icon size={16} className="animate-spin" style={{ color: 'var(--wiki-text3)' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Fixed bottom bar — toolbar inside input */}
      <div className="flex-shrink-0 pb-3 pt-2 w-full flex justify-center" style={!hasMessages ? { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--wiki-bg)' } : {}}>
        <div style={{ width: '42rem', maxWidth: 'calc(100% - 2rem)' }}>
          <HomeInput
            onSend={handleSend}
            onStop={() => {
              if (abortRef.current) {
                cancelChat(activeConvId || "default");
                abortRef.current.abort();
                abortRef.current = null;
              }
              setSending(false);
              setStreamingContent("");
            }}
            disabled={sending}
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            toolbar={
              <>
                {/* Model selector */}
                <PortalDropdown
                  open={modelDropdownOpen}
                  onClose={() => setModelDropdownOpen(false)}
                  alignX="left" alignY="above"
                  trigger={
                    <button onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                      className="flex items-center gap-1 text-xs rounded-lg px-1.5 py-1 cursor-pointer transition-colors"
                      style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}>
                      <BotIcon size={11} />
                      <span className="truncate max-w-[80px]">{currentModelLabel}</span>
                      <ChevronDownIcon size={9} />
                    </button>
                  }
                >
                  <div className="w-52 max-h-36 overflow-y-auto scrollbar-thin rounded-lg shadow-lg"
                    style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                    {providers.map(p => (
                      <div key={p.provider}>
                        <div className="text-xs px-3 py-1 font-semibold text-wiki-text3" style={{ background: 'var(--wiki-surface2)' }}>{p.label}</div>
                        {p.models.map(m => (
                          <div key={p.provider+'|'+m.id}
                            onClick={() => { setSelectedProvider(p.provider); setSelectedModel(String(m.modelId)); try { localStorage.setItem('home_last_model', JSON.stringify({provider:p.provider,modelId:m.modelId})); } catch {} setModelDropdownOpen(false); }}
                            className="px-3 py-1 text-xs cursor-pointer hover:bg-wiki-surface2 transition-colors truncate"
                            style={{ color: selectedProvider===p.provider&&selectedModel===String(m.modelId)?'var(--wiki-text)':'var(--wiki-text2)' }}>
                            {m.name.includes(' - ')?m.name.split(' - ').pop():m.name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </PortalDropdown>

                {/* Tools */}
                <div className="relative">
                  <button onClick={() => setShowToolPanel(!showToolPanel)}
                    className={`flex items-center gap-1 text-xs rounded-lg px-1.5 py-1 cursor-pointer transition-colors ${toolsEnabled ? 'ring-1' : ''}`}
                    style={{ background: toolsEnabled ? 'rgba(99,102,241,0.12)' : 'var(--wiki-surface2)', color: toolsEnabled ? '#6366f1' : 'var(--wiki-text2)', border: toolsEnabled ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--wiki-border)' }}>
                    <WrenchIcon size={11} />
                    <span>工具</span>
                  </button>
                  {showToolPanel && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowToolPanel(false)} />
                      <div className="absolute bottom-full mb-1 left-0 w-40 rounded-lg shadow-xl z-30 p-1" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                        {[{ key: 'mcp', label: 'MCP工具', icon: PuzzleIcon, count: toolCounts.mcp },
                          { key: 'cli', label: 'CLI命令', icon: TerminalIcon, count: toolCounts.cli },
                          { key: 'skills', label: 'Skills', icon: ZapIcon, count: toolCounts.skills },
                          { key: 'plugins', label: 'Plugins', icon: SettingsIcon, count: toolCounts.plugins },
                        ].map(tc => {
                          const Icon = tc.icon; const enabled = (toolCategories as any)[tc.key];
                          return (
                            <div key={tc.key} className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-wiki-surface2 cursor-pointer"
                              onClick={() => {
                                const next = { ...toolCategories, [tc.key]: !enabled };
                                setToolCategories(next);
                                if (Object.values(next).some(Boolean) && !toolsEnabled) setToolsEnabled(true);
                                if (!Object.values(next).some(Boolean) && toolsEnabled) setToolsEnabled(false);
                              }}>
                              <div className="flex items-center gap-1">
                                <Icon size={10} style={{ color: enabled ? 'var(--wiki-text)' : 'var(--wiki-text3)' }} />
                                <span className="text-xs" style={{ color: enabled ? 'var(--wiki-text)' : 'var(--wiki-text3)' }}>{tc.label}</span>
                              </div>
                              <div className="relative w-7 h-3.5 rounded-full cursor-pointer" style={{background:enabled?'#6366f1':'var(--wiki-border)'}}>
                                <span className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all" style={{left:enabled?'15px':'2px',transition:'left 0.15s'}} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* File upload */}
                <label className="flex items-center gap-1 text-xs rounded-lg px-1.5 py-1 cursor-pointer transition-colors hover:bg-wiki-surface2"
                  style={{ color: 'var(--wiki-text2)' }} title="上传文件">
                  <PaperclipIcon size={11} />
                  <input type="file" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const text = ev.target?.result?.toString()?.substring(0, 5000) || '';
                        handleSend?.({ content: `[文件: ${file.name}]\n${text}`, providerId: selectedProvider, modelId: selectedModel });
                      };
                      if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|json|js|ts|py|html|css|xml|yaml|yml|log|csv)$/i)) {
                        reader.readAsText(file);
                      } else {
                        handleSend?.({ content: `请分析文件: ${file.name} (${(file.size/1024).toFixed(1)}KB, ${file.type})`, providerId: selectedProvider, modelId: selectedModel });
                      }
                      e.target.value = '';
                    }
                  }} />
                </label>
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}

export default memo(Home);
