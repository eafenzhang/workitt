import { apiFetch } from '../api';
import { useEffect, useState } from 'react';
import { CpuIcon, PlusIcon, TrashIcon, StarIcon, CheckCircleIcon, KeyIcon, RefreshCwIcon, XIcon, ChevronDownIcon } from 'lucide-react';
import { toast } from 'sonner';

interface ModelItem {
  id: number;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  modelId: string;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
}

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  endpoint: string;
  models: { id: string; name: string }[];
  authType: string;
}

const PROVIDER_LIST: Provider[] = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/deepseek-chat', endpoint: '/chat/completions', models: [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }, { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }, { id: 'deepseek-chat', name: 'DeepSeek Chat' }], authType: 'bearer' },
  { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimaxi.com/anthropic', endpoint: '/v1/messages', models: [{ id: 'MiniMax-M2.7', name: 'MiniMax M2.7' }, { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed' }, { id: 'MiniMax-M2.5', name: 'MiniMax M2.5' }, { id: 'MiniMax-M2.5-lightning', name: 'MiniMax M2.5 Lightning' }], authType: 'bearer' },
  { id: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', endpoint: '/chat/completions', models: [{ id: 'glm-4-plus', name: 'GLM-4 Plus' }, { id: 'glm-4-flash', name: 'GLM-4 Flash' }, { id: 'glm-4v-plus', name: 'GLM-4V Plus' }], authType: 'bearer' },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', endpoint: '/chat/completions', models: [{ id: 'moonshot-v1-8k', name: 'Moonshot V1 8K' }, { id: 'moonshot-v1-32k', name: 'Moonshot V1 32K' }, { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K' }], authType: 'bearer' },
  { id: 'dashscope', name: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/api/v1', endpoint: '/services/aigc/text-generation/generation', models: [{ id: 'qwen-max', name: 'Qwen Max' }, { id: 'qwen-plus', name: 'Qwen Plus' }, { id: 'qwen-turbo', name: 'Qwen Turbo' }], authType: 'bearer' },
  { id: 'volcengine', name: '火山引擎', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', endpoint: '/chat/completions', models: [{ id: 'doubao-pro-32k', name: '豆包 Pro 32K' }, { id: 'doubao-pro-128k', name: '豆包 Pro 128K' }, { id: 'doubao-lite-32k', name: '豆包 Lite 32K' }], authType: 'bearer' },
  { id: 'tencent', name: '腾讯云', baseUrl: 'https://hunyuan.cloud.tencent.com', endpoint: '/hunyuan/v1/chat/completions', models: [{ id: 'hunyuan-pro', name: '混元 Pro' }, { id: 'hunyuan-standard', name: '混元 Standard' }], authType: 'bearer' },
  { id: 'qianfan', name: '百度千帆', baseUrl: 'https://qianfan.baidubce.com/v2', endpoint: '/chat/completions', models: [{ id: 'ernie-4.0-8k', name: '文心一言 4.0 8K' }, { id: 'ernie-3.5-8k', name: '文心一言 3.5 8K' }], authType: 'bearer' },
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', endpoint: '/chat/completions', models: [{ id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5-72B' }, { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' }, { id: 'THUDM/GLM-4-9B-Chat', name: 'GLM-4-9B' }], authType: 'bearer' },
];

export default function Model() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: '' });
  const [modelDropdown, setModelDropdown] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => { fetchModels(); }, []);

  const fetchModels = () => {
    setLoading(true);
    apiFetch('/api/models').then(r => r.json()).then(data => {
      setModels(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => { setLoading(false); }); // 后端未就绪时静默处理
  };

  const handleProviderChange = (providerId: string) => {
    const provider = PROVIDER_LIST.find(p => p.id === providerId);
    setForm(f => ({ ...f, provider: providerId, modelId: provider?.models[0]?.id || '' }));
  };

  const handleTestConnection = async () => {
    if (!form.apiKey.trim()) { toast.error('请先输入 API Key'); return; }
    setTesting(true);
    const provider = PROVIDER_LIST.find(p => p.id === form.provider);
    try {
      const ok = await (window as any).electronAPI?.testModelConnection?.(
        provider?.baseUrl || '', form.apiKey, form.modelId
      );
      if (ok) toast.success('连接成功');
      else toast.error('连接失败，请检查配置');
    } catch {
      toast.error('连接失败');
    }
    setTesting(false);
  };

  const handleSubmit = async () => {
    if (!form.apiKey.trim()) { toast.error('请输入 API Key'); return; }
    const provider = PROVIDER_LIST.find(p => p.id === form.provider);
    const modelName = provider?.models.find(m => m.id === form.modelId)?.name || form.modelId;

    const url = editingId ? `/api/models/${editingId}` : '/api/models';
    const method = editingId ? 'PUT' : 'POST';
    const body: Record<string, string> = { modelId: form.modelId };
    if (editingId) {
      // 只更新 API key 和 model
      if (form.apiKey) body.apiKey = form.apiKey;
    } else {
      body.name = `${provider?.name} - ${modelName}`;
      body.provider = form.provider;
      body.baseUrl = provider?.baseUrl || '';
      body.apiKey = form.apiKey;
    }

    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) {
      toast.success(editingId ? '已更新' : '添加成功');
      setShowModal(false);
      setEditingId(null);
      setForm({ provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: '' });
      fetchModels();
    } else {
      toast.error(data.error || '操作失败');
    }
  };

  const handleEdit = (m: ModelItem) => {
    setEditingId(m.id);
    setForm({ provider: m.provider, modelId: m.modelId, apiKey: '' });
    setShowModal(true);
  };

  const setDefault = async (id: number) => {
    const res = await apiFetch(`/api/models/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_default: true }) });
    const data = await res.json();
    if (data.success) { toast.success('已设为默认'); fetchModels(); }
    else toast.error(data.error || '设置失败');
  };

  const deleteModel = async (id: number) => {
    if (!confirm('确定删除该模型配置？')) return;
    const res = await apiFetch(`/api/models/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { toast.success('已删除'); fetchModels(); }
  };

  const currentProvider = PROVIDER_LIST.find(p => p.id === form.provider);
  const currentModels = currentProvider?.models || [];

  return (
    <div className="flex flex-col gap-6 p-8 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-wiki-text">模型配置</h1>
          <p className="text-sm text-wiki-text2 mt-1">支持国内主流大模型供应商</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm({ provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: '' }); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          <PlusIcon size={16} />添加配置
        </button>
      </div>

      {/* Default Banner */}
      {models.find(m => m.isDefault) && (
        <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
          <StarIcon size={18} style={{ color: 'var(--wiki-text)' }} />
          <span className="text-sm text-wiki-text">默认模型：</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>{models.find(m => m.isDefault)?.name}</span>
        </div>
      )}

      {models.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <CpuIcon size={48} style={{ color: 'var(--wiki-text3)' }} />
          <p className="mt-4 text-wiki-text2 text-sm">暂无模型配置</p>
          <p className="mt-1 text-wiki-text3 text-xs">点击「添加配置」添加你的第一个模型</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {models.map(m => (
          <div key={m.id} className="rounded-lg p-6" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: m.hasApiKey ? 'var(--wiki-surface2)' : 'rgba(239,68,68,0.1)' }}>
                {m.hasApiKey ? <CheckCircleIcon size={24} style={{ color: '#10b981' }} /> : <CircleIcon size={24} style={{ color: '#ef4444' }} />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-wiki-text">{m.name}</span>
                  {m.isDefault && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>默认</span>}
                  {!m.enabled && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>已禁用</span>}
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>{m.provider}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-wiki-text3">
                  <span>{m.baseUrl}</span>
                  <span className="flex items-center gap-1">
                    {m.hasApiKey ? <KeyIcon size={10} style={{ color: '#10b981' }} /> : <KeyIcon size={10} style={{ color: '#ef4444' }} />}
                    {m.hasApiKey ? '已配置 Key' : '未配置'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Model Selector */}
                <div className="relative">
                  <button onClick={() => setModelDropdown(modelDropdown === m.id ? null : m.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}>
                    {/* P0-08: Use model's own provider for dropdown, not form.provider */}
                    <span>{(PROVIDER_LIST.find(p => p.id === m.provider)?.models || []).find(x => x.id === m.modelId)?.name || m.modelId}</span>
                    <ChevronDownIcon size={14} />
                  </button>
                  {modelDropdown === m.id && (
                    <div className="absolute top-full mt-1 right-0 w-56 rounded-lg py-1 z-50" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                      {/* P0-08: Use model's own provider for dropdown list */}
                      {(PROVIDER_LIST.find(p => p.id === m.provider)?.models || []).map(pm => (
                        <button key={pm.id} onClick={async () => {
                          setModelDropdown(null);
                          if (pm.id !== m.modelId) {
                            await apiFetch(`/api/models/${m.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId: pm.id }) });
                            toast.success(`已切换到 ${pm.name}`);
                            fetchModels();
                          }
                        }} className="w-full px-3 py-2 text-left text-sm hover:bg-wiki-surface2 flex items-center justify-between" style={{ color: 'var(--wiki-text)' }}>
                          <div><div>{pm.name}</div><div className="text-xs text-wiki-text3">{pm.id}</div></div>
                          {pm.id === m.modelId && <CheckCircleIcon size={14} style={{ color: 'var(--wiki-text)' }} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!m.isDefault && (
                  <button onClick={() => setDefault(m.id)} className="px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>设为默认</button>
                )}
                <button onClick={async () => {
                  await apiFetch(`/api/models/${m.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !m.enabled }) });
                  toast.success(m.enabled ? '已禁用' : '已启用');
                  fetchModels();
                }} className="px-3 py-2 rounded-lg text-xs font-medium" style={{ background: m.enabled ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.1)', color: m.enabled ? '#ef4444' : '#10b981' }}>
                  {m.enabled ? '禁用' : '启用'}
                </button>
                <button onClick={() => handleEdit(m)} className="px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>编辑</button>
                <button onClick={() => deleteModel(m.id)} className="p-2 rounded-lg hover:bg-wiki-surface2 transition-colors">
                  <TrashIcon size={16} style={{ color: 'var(--wiki-text3)' }} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center py-8"><RefreshCwIcon size={24} className="animate-spin" style={{ color: 'var(--wiki-text3)' }} /></div>}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-[480px] rounded-lg p-6" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-wiki-text">{editingId ? '编辑模型配置' : '添加模型配置'}</h2>
              <button onClick={() => { setShowModal(false); setEditingId(null); }} className="p-1 rounded-md hover:bg-wiki-surface2">
                <XIcon size={18} style={{ color: 'var(--wiki-text3)' }} />
              </button>
            </div>

            {/* Provider */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>供应商</label>
              <div className="grid grid-cols-3 gap-2">
                {PROVIDER_LIST.map(p => (
                  <button key={p.id} onClick={() => handleProviderChange(p.id)}
                    className="px-3 py-2 rounded-lg text-xs text-left" style={{
                      background: form.provider === p.id ? 'var(--wiki-surface2)' : 'var(--wiki-surface)',
                      border: `1px solid ${form.provider === p.id ? 'var(--wiki-border)' : 'var(--wiki-border)'}`,
                      color: 'var(--wiki-text)',
                    }}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>模型</label>
              <select value={form.modelId} onChange={e => setForm(f => ({ ...f, modelId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}>
                {currentModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            {/* API Key */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>API Key</label>
              <input type="password" value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder={editingId ? '不修改请留空' : '输入 API Key'}
                className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
            </div>

            <div className="flex gap-3 mb-4">
              <button onClick={handleTestConnection} disabled={testing}
                className="flex-1 py-2 rounded-lg text-xs font-medium border transition-colors"
                style={{ background: testing ? 'var(--wiki-surface2)' : 'transparent', color: testing ? 'var(--wiki-text3)' : 'var(--wiki-text)', borderColor: 'var(--wiki-border)' }}>
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button onClick={handleSubmit}
                className="flex-1 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
                {editingId ? '保存修改' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}