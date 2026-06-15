import { useState, useEffect, useCallback } from 'react';
import { PlusIcon, PlayIcon, TrashIcon, ClockIcon, ZapIcon, XIcon, ChevronDownIcon, CheckCircleIcon, XCircleIcon, LoaderIcon } from 'lucide-react';
import { toast } from 'sonner';

interface WorkflowStep {
  id: string;
  type: 'ai_call' | 'tool_call' | 'condition' | 'transform' | 'db_action';
  config: Record<string, any>;
  onError?: 'stop' | 'skip' | 'retry';
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  enabled: boolean;
  createdAt?: string;
}

interface Execution {
  id: string;
  workflowId: string;
  status: string;
  inputs: any;
  outputs: any;
  stepResults: { stepId: string; type: string; status: string; output?: any; error?: string }[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

const api = (window as any).electronAPI;

const STEP_TYPES = [
  { value: 'ai_call', label: 'AI 调用' },
  { value: 'tool_call', label: '工具调用' },
  { value: 'condition', label: '条件判断' },
  { value: 'transform', label: '数据转换' },
  { value: 'db_action', label: '数据库操作' },
] as const;

const DB_ACTIONS = [
  { value: 'create_requirement', label: '创建采集条目' },
  { value: 'create_document', label: '创建知识文档' },
];

const BUILTIN_TEMPLATES: { id: string; name: string; desc: string; steps: WorkflowStep[] }[] = [
  {
    id: 'template-analyze-req',
    name: '需求分析 → 自动创建',
    desc: '输入需求描述，AI分析后自动创建采集条目',
    steps: [
      { id: 'analyze', type: 'ai_call', config: { prompt: '分析以下需求并输出JSON：{"title":"简短标题","desc":"详细描述","priority":"高|中|低","tags":["标签1"]}\n\n需求：{{inputs.description}}', systemPrompt: '你是需求分析专家，只输出JSON' } },
      { id: 'create', type: 'db_action', config: { action: 'create_requirement', data: { title: '{{steps.analyze.output.content}}', desc: '{{inputs.description}}', priority: '中' } } },
    ],
  },
  {
    id: 'template-summarize-doc',
    name: '文档AI总结',
    desc: '输入文档内容，AI生成总结并创建知识文档',
    steps: [
      { id: 'summarize', type: 'ai_call', config: { prompt: '请总结以下文档内容，100字以内：\n\n{{inputs.content}}' } },
      { id: 'save', type: 'db_action', config: { action: 'create_document', data: { title: 'AI总结 - {{inputs.title}}', content: '{{steps.summarize.output.content}}' } } },
    ],
  },
  {
    id: 'template-weekly-report',
    name: '周报生成',
    desc: '统计本周数据，AI生成周报',
    steps: [
      { id: 'report', type: 'ai_call', config: { prompt: '请根据以下项目数据生成一份简洁的周报（包含：本周概况、关键进展、风险项、下周计划）：\n\n{{inputs.stats}}', systemPrompt: '你是项目管理助手，输出格式清晰的周报。' } },
      { id: 'save', type: 'db_action', config: { action: 'create_document', data: { title: '周报 - {{inputs.week}}', content: '{{steps.report.output.content}}' } } },
    ],
  },
];

export default function Workflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [activeWf, setActiveWf] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [inputsText, setInputsText] = useState('{}');
  const [expandedExec, setExpandedExec] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!api) return;
    api.workflowList().then((list: any[]) => {
      if (Array.isArray(list)) setWorkflows(list);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadExecutions = (wfId: string) => {
    setActiveWf(wfId);
    if (!api) return;
    api.workflowExecutions(wfId).then((list: any[]) => {
      if (Array.isArray(list)) setExecutions(list);
    });
  };

  const handleSave = () => {
    if (!editing || !api) return;
    api.workflowSave(editing).then((r: any) => {
      if (r.error) { toast.error(r.error); return; }
      toast.success('工作流已保存');
      setShowEditor(false);
      setEditing(null);
      refresh();
    });
  };

  const handleDelete = (id: string) => {
    if (!api) return;
    api.workflowDelete(id).then(() => { toast.success('已删除'); refresh(); if (activeWf === id) setActiveWf(null); });
  };

  const handleExecute = (wf: Workflow) => {
    if (!api) return;
    let inputs: any;
    try { inputs = JSON.parse(inputsText); } catch { toast.error('输入格式错误，请输入有效JSON'); return; }
    setExecuting(wf.id);
    api.workflowExecute(wf.id, inputs).then((r: any) => {
      if (r.success) toast.success('工作流执行完成');
      else toast.error(r.error || '执行失败');
      setExecuting(null);
      if (activeWf === wf.id) loadExecutions(wf.id);
    });
  };

  const openTemplate = (tmpl: typeof BUILTIN_TEMPLATES[0]) => {
    setEditing({
      id: 'wf_' + Date.now(),
      name: tmpl.name,
      description: tmpl.desc,
      steps: JSON.parse(JSON.stringify(tmpl.steps)),
      enabled: true,
    });
    setShowEditor(true);
  };

  // ── JSON step editor helper ──
  const addStep = () => {
    if (!editing) return;
    setEditing({ ...editing, steps: [...editing.steps, { id: 'step_' + (editing.steps.length + 1), type: 'ai_call', config: { prompt: '' } }] });
  };

  if (showEditor && editing) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <button onClick={() => { setShowEditor(false); setEditing(null); }} className="p-1 rounded hover:bg-wiki-surface2">
            <ChevronDownIcon size={18} style={{ color: 'var(--wiki-text2)', transform: 'rotate(90deg)' }} />
          </button>
          <input className="flex-1 bg-transparent text-lg font-semibold text-wiki-text outline-none" placeholder="工作流名称" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>保存</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
          <input className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text2 outline-none mb-4" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }} placeholder="描述" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
          <div className="text-xs font-medium text-wiki-text2 mb-2">步骤 ({editing.steps.length})</div>
          <div className="flex flex-col gap-3">
            {editing.steps.map((step, i) => (
              <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-wiki-text3">#{i + 1}</span>
                  <select className="text-xs px-2 py-1 rounded outline-none" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)', border: 'none' }}
                    value={step.type} onChange={e => {
                      const steps = [...editing.steps];
                      steps[i] = { ...steps[i], type: e.target.value as any };
                      setEditing({ ...editing, steps });
                    }}>
                    {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <select className="text-xs px-2 py-1 rounded outline-none ml-auto" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: 'none' }}
                    value={step.onError || 'stop'} onChange={e => {
                      const steps = [...editing.steps];
                      steps[i] = { ...steps[i], onError: e.target.value as any };
                      setEditing({ ...editing, steps });
                    }}>
                    <option value="stop">出错: 停止</option>
                    <option value="skip">出错: 跳过</option>
                    <option value="retry">出错: 重试</option>
                  </select>
                  <button onClick={() => { const steps = editing.steps.filter((_, j) => j !== i); setEditing({ ...editing, steps }); }}
                    className="p-1 rounded hover:bg-wiki-surface2"><TrashIcon size={12} style={{ color: 'var(--wiki-danger)' }} /></button>
                </div>
                {step.type === 'db_action' ? (
                  <div className="flex gap-2">
                    <select className="flex-1 text-xs px-2 py-1 rounded outline-none" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}
                      value={step.config.action || 'create_requirement'} onChange={e => {
                        const steps = [...editing.steps];
                        steps[i] = { ...steps[i], config: { ...steps[i].config, action: e.target.value } };
                        setEditing({ ...editing, steps });
                      }}>
                      {DB_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                ) : (
                  <textarea className="w-full px-2 py-1 rounded text-xs outline-none resize-none" rows={3}
                    style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)', border: 'none', fontFamily: 'monospace' }}
                    placeholder={step.type === 'ai_call' ? '{"prompt": "..."}' : step.type === 'condition' ? '{"expression": "..."}' : step.type === 'transform' ? '{"expression": "..."}' : '{"toolName": "..."}'}
                    value={JSON.stringify(step.config, null, 2)}
                    onChange={e => {
                      try { const cfg = JSON.parse(e.target.value); const steps = [...editing.steps]; steps[i] = { ...steps[i], config: cfg }; setEditing({ ...editing, steps }); } catch {}
                    }} />
                )}
              </div>
            ))}
          </div>
          <button onClick={addStep} className="mt-3 w-full py-2 rounded-lg text-xs border-dashed" style={{ border: '1px dashed var(--wiki-border)', color: 'var(--wiki-text3)' }}>
            <PlusIcon size={12} className="inline" /> 添加步骤
          </button>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
        <div className="flex-1 text-base font-semibold text-wiki-text">工作流</div>
        <button onClick={() => { setEditing({ id: 'wf_' + Date.now(), name: '', description: '', steps: [], enabled: true }); setShowEditor(true); }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          <PlusIcon size={14} />新建
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
        {/* Templates */}
        <div className="mb-6">
          <div className="text-xs font-medium text-wiki-text3 mb-3 uppercase tracking-wider">内置模板</div>
          <div className="flex flex-col gap-2">
            {BUILTIN_TEMPLATES.map(tmpl => (
              <div key={tmpl.id} onClick={() => openTemplate(tmpl)}
                className="p-4 rounded-lg cursor-pointer hover:border-[var(--wiki-info)]/40 transition-all duration-200"
                style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                <div className="text-sm font-semibold text-wiki-text">{tmpl.name}</div>
                <div className="text-xs text-wiki-text3 mt-1">{tmpl.desc}</div>
                <div className="text-xs text-wiki-text3 mt-2">{tmpl.steps.length} 个步骤</div>
              </div>
            ))}
          </div>
        </div>

        {/* User workflows */}
        <div className="mb-2">
          <div className="text-xs font-medium text-wiki-text3 uppercase tracking-wider">我的工作流</div>
        </div>
        {workflows.length === 0 ? (
          <div className="text-xs text-wiki-text3 py-8 text-center">暂无工作流，点击「新建」或选择上方模板开始</div>
        ) : (
          <div className="flex flex-col gap-2">
            {workflows.map(wf => (
              <div key={wf.id}>
                <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadExecutions(wf.id)}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-wiki-text">{wf.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: wf.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(128,128,128,0.12)', color: wf.enabled ? '#10b981' : 'var(--wiki-text3)' }}>{wf.enabled ? '启用' : '禁用'}</span>
                    </div>
                    <div className="text-xs text-wiki-text3 mt-0.5">{wf.description || '无描述'} · {wf.steps?.length || 0} 步</div>
                  </div>
                  <button onClick={() => handleExecute(wf)} disabled={executing === wf.id}
                    className="p-1.5 rounded-lg hover:bg-wiki-surface2" title="执行">
                    {executing === wf.id ? <LoaderIcon size={14} className="animate-spin" style={{ color: 'var(--wiki-text2)' }} />
                      : <PlayIcon size={14} style={{ color: '#10b981' }} />}
                  </button>
                  <button onClick={() => { setEditing({ ...wf }); setShowEditor(true); }}
                    className="p-1.5 rounded-lg hover:bg-wiki-surface2" title="编辑">
                    <ZapIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
                  </button>
                  <button onClick={() => handleDelete(wf.id)} className="p-1.5 rounded-lg hover:bg-wiki-surface2" title="删除">
                    <TrashIcon size={14} style={{ color: 'var(--wiki-danger)' }} />
                  </button>
                </div>

                {/* Execution history for active workflow */}
                {activeWf === wf.id && (
                  <div className="mt-2 ml-4 border-l-2 pl-4" style={{ borderColor: 'var(--wiki-border)' }}>
                    <div className="text-xs font-medium text-wiki-text3 mb-2">执行历史</div>
                    {executions.length === 0 ? (
                      <div className="text-xs text-wiki-text3 py-2">暂无执行记录</div>
                    ) : (
                      executions.map(ex => (
                        <div key={ex.id} className="mb-2">
                          <div className="flex items-center gap-2 py-1 cursor-pointer" onClick={() => setExpandedExec(expandedExec === ex.id ? null : ex.id)}>
                            {ex.status === 'completed' ? <CheckCircleIcon size={12} style={{ color: '#10b981' }} />
                              : ex.status === 'failed' ? <XCircleIcon size={12} style={{ color: '#ef4444' }} />
                              : <ClockIcon size={12} style={{ color: 'var(--wiki-text3)' }} />}
                            <span className="text-xs text-wiki-text2">{ex.status === 'completed' ? '完成' : ex.status === 'failed' ? '失败' : '运行中'}</span>
                            <span className="text-xs text-wiki-text3">{ex.startedAt ? new Date(ex.startedAt).toLocaleString('zh-CN') : ''}</span>
                            <ChevronDownIcon size={10} style={{ color: 'var(--wiki-text3)', transform: expandedExec === ex.id ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
                          </div>
                          {expandedExec === ex.id && (
                            <div className="ml-4 mb-3 p-2 rounded text-xs" style={{ background: 'var(--wiki-surface2)' }}>
                              {ex.error && <div className="text-red-400 mb-2">错误: {ex.error}</div>}
                              {ex.stepResults?.map((sr: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 py-0.5">
                                  <span className="text-wiki-text3">#{i + 1} {sr.type}</span>
                                  {sr.status === 'completed' ? <CheckCircleIcon size={10} style={{ color: '#10b981' }} />
                                    : <XCircleIcon size={10} style={{ color: '#ef4444' }} />}
                                  <span className="text-wiki-text2 truncate">{sr.stepId}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Execution input panel */}
        <div className="mt-6 p-4 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <div className="text-xs font-medium text-wiki-text2 mb-2">执行输入 (JSON)</div>
          <textarea
            className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none font-mono"
            style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)', border: 'none' }}
            rows={4}
            placeholder='{"description": "测试需求描述", "content": "文档内容..."}'
            value={inputsText}
            onChange={e => setInputsText(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
