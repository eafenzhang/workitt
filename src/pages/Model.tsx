import { apiFetch, API } from '../api';
import { useEffect, useState } from 'react';
import { StarIcon, RefreshCwIcon, PlusIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PROVIDERS, type ProviderConfig, type ModelItem } from '../data/providers';
import ProviderCard from '../components/ProviderCard';
import ModelStatsBar from '../components/ModelStatsBar';
import ApiKeyInput from '../components/ApiKeyInput';
import ModelSelector from '../components/ModelSelector';
import { saveCowAgentModelConfig } from '../api/cowagent';

const TOAST = {
  deleted: '已删除',
  saved: '已保存',
  updated: '已更新',
  setDefault: '已设为默认',
  setDefaultFailed: '设置失败',
  connOk: '连接成功',
  connFail: '连接失败',
  connFail2: '连接失败',
} as const;

export default function Model() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editProvider, setEditProvider] = useState<string>('');
  const [form, setForm] = useState({
    apiKey: '',
    modelId: '',
    provider: '',
    customName: '',
    customBaseUrl: '',
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState<number | null>(null);
  const [formEndpoint, setFormEndpoint] = useState('/chat/completions');

  const checkBalance = async (modelId: number) => {
    setCheckingBalance(modelId);
    const api = (window as any).electronAPI;
    try {
      const r = await api?.modelCheckBalance?.(modelId);
      if (r?.balance) toast.success(`余额: ${r.balance}`);
      else if (r?.error) toast.error(r.error);
    } catch { toast.error('查询失败'); }
    setCheckingBalance(null);
    fetchModels(); // Refresh to show updated balance
  };

  /* ---- data fetching ---- */

  useEffect(() => {
    fetchModels();
  }, []);


  const fetchModels = () => {
    setLoading(true);
    apiFetch(API.models)
      .then((r) => r.json())
      .then((d) => {
        setModels(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  /* ---- modal helpers ---- */

  const openAdd = (pid?: string) => {
    setEditingId(null);
    if (pid) {
      setEditProvider(pid);
      const p = PROVIDERS.find((x) => x.id === pid);
      setForm({
        apiKey: '', modelId: p?.models[0]?.id || 'custom',
        provider: pid, customName: '', customBaseUrl: '',
      });
      setFormEndpoint(p?.endpoint || '/chat/completions');
    } else {
      // Custom provider mode
      setEditProvider('custom');
      setForm({
        apiKey: '', modelId: 'custom',
        provider: 'custom-' + Date.now(), customName: '', customBaseUrl: '',
      });
      setFormEndpoint('/chat/completions');
    }
    setShowModal(true);
  };

  const openEdit = (m: ModelItem) => {
    setEditingId(m.id);
    setEditProvider(m.provider);
    setForm({
      apiKey: m.hasApiKey ? (m.apiKey || '••••••••') : '',
      modelId: m.modelId,
      provider: m.provider,
      customName: '',
      customBaseUrl: m.baseUrl,
    });
    setFormEndpoint(m.endpoint || '/chat/completions');
    setShowModal(true);
  };

  /* ---- actions ---- */

  const handleSave = async () => {
    const f = form;
    if (!f.apiKey.trim() && !editingId) {
      toast.error('请输入 API Key');
      return;
    }
    setSaving(true);
    const isCustom = !PROVIDERS.find((p) => p.id === f.provider);
    const p = PROVIDERS.find((x) => x.id === f.provider);
    const mn = p?.models.find((m) => m.id === f.modelId)?.name || f.modelId;
    try {
      const url = editingId ? API.modelsById(editingId) : API.models;
      const method = editingId ? 'PUT' : 'POST';
      const body: Record<string, unknown> = { modelId: f.modelId };
      if (editingId) {
        if (f.apiKey && !/^\*{3,}/.test(f.apiKey) && f.apiKey !== '••••••••') body.apiKey = f.apiKey;
        body.baseUrl = isCustom ? f.customBaseUrl : p?.baseUrl || '';
        body.endpoint = formEndpoint;
      } else {
        body.name = isCustom ? f.customName : `${p?.name} - ${mn}`;
        body.provider = f.provider;
        body.baseUrl = isCustom ? f.customBaseUrl : p?.baseUrl || '';
        body.endpoint = formEndpoint;
        body.apiKey = f.apiKey;
      }
      const r = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.success) {
        toast.success(editingId ? TOAST.updated : TOAST.saved);
        fetchModels();
        setShowModal(false);

        // Sync to CowAgent when model is saved
        const isCustom = !PROVIDERS.find((p) => p.id === f.provider);
        const providerId = isCustom ? 'custom' : f.provider;
        // Only send API key if it's unmasked (new model) or explicitly changed
        const rawKey = f.apiKey;
        const isMasked = /^\*{3,}/.test(rawKey) || rawKey === '••••••••';
        const apiKey = isMasked ? '' : rawKey;
        const apiBase = isCustom ? f.customBaseUrl : (p?.baseUrl || '');
        try {
          // Prefer direct file write via IPC (bypasses CowAgent HTTP auth)
          const electronAPI = (window as any).electronAPI;
          let ok = false;
          if (electronAPI?.saveCowAgentConfig) {
            const cowUpdates: Record<string, any> = { model: f.modelId };
            cowUpdates.bot_type = isCustom ? 'custom' : f.provider;
            if (apiKey) {
              cowUpdates.custom_api_key = apiKey;
              cowUpdates.deepseek_api_key = apiKey;
            }
            if (apiBase) cowUpdates.custom_api_base = apiBase;
            const result = await electronAPI.saveCowAgentConfig(cowUpdates);
            ok = result?.success;
          } else {
            // Fallback: HTTP API
            ok = await saveCowAgentModelConfig({
              provider: providerId, model: f.modelId, apiKey, apiBase,
            });
          }
          if (ok) {
            if (apiKey) toast.success('模型与 API Key 已同步到 CowAgent');
            else toast.success('模型已同步到 CowAgent');
          } else {
            toast.error('同步到 CowAgent 失败');
          }
        } catch (e) {
          toast.error('同步到 CowAgent 异常');
        }
      } else {
        toast.error(d.error || '操作失败');
      }
    } catch {
      toast.error('保存失败');
    }
    setSaving(false);
  };

  const testConn = async () => {
    if (!form.apiKey.trim()) { toast.error('请输入 API Key'); return; }
    setTesting(true);
    try {
      let modelIdToTest = editingId;
      if (!modelIdToTest) {
        // New config: save first to get an ID for testing
        const p = PROVIDERS.find((x) => x.id === form.provider);
        const mn = p?.models.find((m) => m.id === form.modelId)?.name || form.modelId;
        const r = await apiFetch(API.models, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: form.provider, baseUrl: p?.baseUrl || form.customBaseUrl || '',
            apiKey: form.apiKey, modelId: form.modelId,
            name: p ? `${p.name} - ${mn}` : (form.customName || `${form.provider} - ${form.modelId}`),
          }),
        });
        const d = await r.json();
        if (d?.id) { modelIdToTest = d.id; fetchModels(); }
        else { toast.error('请先保存'); setTesting(false); return; }
      }
      const ok = await (window as any).electronAPI?.testModelConnection?.(modelIdToTest);
      toast.success(ok ? TOAST.connOk : TOAST.connFail);
    } catch { toast.error(TOAST.connFail2); }
    setTesting(false);
  };

  const setDefault = async (id: number) => {
    const r = await apiFetch(API.modelsById(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    });
    const d = await r.json();
    if (d.success) {
      toast.success(TOAST.setDefault);
      fetchModels();
      // Sync default model to CowAgent
      const m = models.find(x => x.id === id);
      if (m) {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.saveCowAgentConfig) {
          await electronAPI.saveCowAgentConfig({
            model: m.modelId,
            bot_type: 'custom',
          });
        } else {
          await saveCowAgentModelConfig({
            provider: m.provider, model: m.modelId, apiKey: '', apiBase: m.baseUrl || '',
          });
        }
      }
    } else {
      toast.error(d.error || TOAST.setDefaultFailed);
    }
  };

  const toggleModel = async (m: ModelItem) => {
    await apiFetch(API.modelsById(m.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !m.enabled }),
    });
    fetchModels();
  };

  const delModel = async (id: number) => {
    if (!confirm('确定删除？')) return;
    await apiFetch(API.modelsById(id), { method: 'DELETE' });
    toast.success(TOAST.deleted);
    fetchModels();
  };

  /* ---- derived ---- */

  const isCustom = (provider: string) => !PROVIDERS.find((p) => p.id === provider);
  const pConfig: ProviderConfig | null = editProvider ? PROVIDERS.find((p) => p.id === editProvider) ?? null : null;

  /* ---- render ---- */

  return (
    <div className="flex flex-col gap-6 px-6 py-6 h-full overflow-y-auto scrollbar-thin">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-wiki-text">模型配置</h1>
          <p className="text-sm text-wiki-text2 mt-1">接入主流大模型</p>
        </div>
        <button onClick={() => openAdd()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          <PlusIcon size={16} />自定义添加
        </button>
      </div>

      {/* Stats bar */}
      <ModelStatsBar models={models} />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCwIcon size={24} className="animate-spin" style={{ color: 'var(--wiki-text3)' }} />
        </div>
      )}

      {/* Provider grid — show all presets, click to add/edit */}
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map((p) => {
          const saved = models.find((m) => m.provider === p.id);
          return (
            <ProviderCard
              key={p.id}
              provider={p}
              saved={saved}
              onClick={() => (saved ? openEdit(saved) : openAdd(p.id))}
              onSetDefault={saved && !saved.isDefault ? () => setDefault(saved.id) : undefined}
              onCheckBalance={saved?.hasApiKey ? () => checkBalance(saved.id) : undefined}
              checkingBalance={checkingBalance === saved?.id}
            />
          );
        })}
      </div>

      {/* Configured custom providers */}
      {models.filter((m) => isCustom(m.provider)).length > 0 && (
        <div>
          <div className="text-xs font-medium text-wiki-text3 mb-2">自定义供应商</div>
          <div className="grid grid-cols-2 gap-3">
            {models
              .filter((m) => isCustom(m.provider))
              .map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-colors"
                  style={{
                    background: 'var(--wiki-surface)',
                    border: `1px solid ${m.isDefault ? 'var(--wiki-warning)' : 'var(--wiki-border)'}`,
                  }}
                  onClick={() => openEdit(m)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--wiki-surface2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--wiki-surface)'; }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-wiki-text">{m.name}</span>
                      {m.isDefault && <StarIcon size={12} style={{ color: 'var(--wiki-warning)' }} />}
                    </div>
                    <div className="text-xs text-wiki-text3 mt-0.5">{m.baseUrl}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={(e)=>{e.stopPropagation();toggleModel(m);}}
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: m.enabled ? 'var(--wiki-danger-bg)' : 'var(--wiki-success-bg)', color: m.enabled ? 'var(--wiki-danger)' : 'var(--wiki-success)' }}>
                      {m.enabled ? '禁用' : '启用'}
                    </button>
                    {!m.isDefault && (
                      <button onClick={(e)=>{e.stopPropagation();setDefault(m.id);}}
                        className="text-xs px-2 py-1 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>
                        默认
                      </button>
                    )}
                    <button onClick={(e)=>{e.stopPropagation();delModel(m.id);}} className="p-1 rounded hover:bg-wiki-surface2">
                      <XIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ============ ConfigModal ============ */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'var(--wiki-overlay-heavy)' }}
        >
          <div
            className="w-[480px] rounded-xl p-6 max-h-[85vh] overflow-y-auto"
            style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-wiki-text">
                {editingId ? '编辑模型配置' : '添加模型配置'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg hover:bg-wiki-surface2"
              >
                <XIcon size={18} style={{ color: 'var(--wiki-text3)' }} />
              </button>
            </div>

            {/* Provider name (add & edit mode) */}
            {editProvider && pConfig && (
              <div className="mb-4 px-3 py-2 rounded-lg" style={{ background: 'var(--wiki-surface2)' }}>
                <div className="text-xs font-semibold text-wiki-text">{pConfig.name}</div>
                <div className="text-xs text-wiki-text3">{pConfig.baseUrl}</div>
              </div>
            )}
            {editProvider && !pConfig && (
              <div className="mb-4 px-3 py-2 rounded-lg" style={{ background: 'var(--wiki-surface2)' }}>
                <div className="text-xs font-semibold text-wiki-text">{form.customName || '自定义供应商'}</div>
                <div className="text-xs text-wiki-text3">自行配置 API 地址和模型</div>
              </div>
            )}

            {/* Custom provider fields — show when provider is not in presets */}
            {editProvider && !pConfig && (
              <div className="mb-4 flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-medium text-wiki-text3 mb-1">名称</label>
                  <input
                    value={form.customName}
                    onChange={(e) => setForm((f) => ({ ...f, customName: e.target.value }))}
                    placeholder="供应商名称"
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{
                      background: 'var(--wiki-surface2)',
                      border: '1px solid var(--wiki-border)',
                      color: 'var(--wiki-text)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-wiki-text3 mb-1">API 地址</label>
                  <input
                    value={form.customBaseUrl}
                    onChange={(e) => setForm((f) => ({ ...f, customBaseUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{
                      background: 'var(--wiki-surface2)',
                      border: '1px solid var(--wiki-border)',
                      color: 'var(--wiki-text)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Model selector */}
            <div className="mb-4">
              <ModelSelector
                models={pConfig?.models ?? []}
                value={form.modelId}
                onChange={(v) => setForm((f) => ({ ...f, modelId: v }))}
              />
            </div>

            {/* Protocol type — only for custom providers */}
            {editProvider && !pConfig && (<div className="mb-4">
              <label className="block text-xs font-medium text-wiki-text3 mb-1.5">协议类型</label>
              <select value={formEndpoint} onChange={(e) => setFormEndpoint(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}>
                <option value="/chat/completions">OpenAI 兼容 (/chat/completions)</option>
                <option value="/v1/messages">Anthropic 协议 (/v1/messages)</option>
              </select>
            </div>)}

            {/* API Key */}
            <div className="mb-6">
              <ApiKeyInput
                value={form.apiKey}
                onChange={(v) => setForm((f) => ({ ...f, apiKey: v }))}
                masked={editingId !== null && form.apiKey === '••••••••'}
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={testConn}
                disabled={testing}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{
                  background: 'var(--wiki-surface2)',
                  color: 'var(--wiki-text2)',
                  border: '1px solid var(--wiki-border)',
                }}
              >
                <RefreshCwIcon size={14} className={testing ? 'animate-spin' : ''} />
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}
              >
                {saving ? '保存中...' : editingId ? '更新' : '添加'}
              </button>
              {editingId && (
                <button
                  onClick={() => {
                    delModel(editingId);
                    setShowModal(false);
                  }}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--wiki-danger-bg)', color: 'var(--wiki-danger)' }}
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
