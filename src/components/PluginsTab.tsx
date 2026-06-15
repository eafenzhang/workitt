import { useState, useEffect } from 'react';
import { apiFetch, API } from '../api';
import { WrenchIcon, Edit2Icon, TrashIcon, PackagePlusIcon, SaveIcon, XIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

interface PluginItem {
  id: string; name: string; description: string; source: string;
  enabled: boolean; config: Record<string, any>; createdAt: string;
}

const DEFAULT_CATALOG = [
  { name: 'code-reviewer',    description: 'AI 代码审查 — 分析代码质量、发现潜在 Bug、提供改进建议',             source: 'marketplace', config: { instructions: '当用户需要代码审查时使用此插件，分析代码质量并给出改进建议' } },
  { name: 'test-generator',   description: '自动测试生成 — 为代码自动生成单元测试和集成测试',                   source: 'built-in',    config: { instructions: '当用户需要生成测试代码时使用此插件' } },
  { name: 'doc-generator',    description: '文档自动生成 — 为代码生成 API 文档、README 和使用说明',              source: 'built-in',    config: { instructions: '当用户需要生成代码文档时使用此插件' } },
  { name: 'commit-helper',    description: 'Git 提交助手 — 自动生成规范的 commit message',                      source: 'marketplace', config: { instructions: '当用户准备提交代码时使用此插件，生成规范的 commit message' } },
  { name: 'security-scanner', description: '安全漏洞扫描 — 检测代码中的安全漏洞和风险',                          source: 'marketplace', config: { instructions: '当用户需要安全检查时使用此插件，扫描代码中的安全漏洞' } },
  { name: 'refactor-assistant',description: '代码重构助手 — 优化代码结构、提升可读性和可维护性',                  source: 'built-in',    config: { instructions: '当用户需要重构代码时使用此插件，提供重构建议和实现' } },
  { name: 'translation',      description: 'i18n 翻译插件 — 自动提取和翻译国际化文本',                          source: 'built-in',    config: { instructions: '当用户需要国际化翻译时使用此插件' } },
  { name: 'linter-config',    description: 'Linter 配置生成 — 自动生成 ESLint/Prettier 等配置文件',              source: 'built-in',    config: { instructions: '当用户需要代码规范配置时使用此插件' } },
  { name: 'dependency-check', description: '依赖检查 — 分析 package.json，检测过期和漏洞依赖',                   source: 'marketplace', config: { instructions: '当用户需要检查项目依赖时使用此插件' } },
  { name: 'perf-analyzer',    description: '性能分析 — 分析代码性能瓶颈，提供优化方案',                          source: 'marketplace', config: { instructions: '当用户需要性能优化分析时使用此插件' } },
];

const sourceLabels: Record<string, string> = { 'built-in': '内置', 'marketplace': '市场', 'custom': '自定义', 'url': 'URL' };

export default function PluginsTab({ hideToolbar }: { hideToolbar?: boolean }) {
  const [items, setItems] = useState<PluginItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; configJson: string }>({ name: '', description: '', configJson: '{}' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<{ name: string; description: string; configJson: string }>({ name: '', description: '', configJson: '{}' });

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = () => {
    apiFetch(API.plugins).then(r => r.json()).then(data => setItems(Array.isArray(data) ? data : [])).catch(() => {});
  };

  const toggleItem = (item: PluginItem) => {
    apiFetch(API.pluginsById(item.id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !item.enabled }),
    }).then(() => { fetchItems(); toast.success(item.enabled ? '已禁用' : '已启用'); });
  };

  const deleteItem = async (item: PluginItem) => {
    if (!confirm(`确定删除「${item.name}」？`)) return;
    apiFetch(API.pluginsById(item.id), { method: 'DELETE' }).then(() => { fetchItems(); toast.success(`已删除 ${item.name}`); }).catch(() => toast.error('删除失败'));
  };

  const startEdit = (item: PluginItem) => {
    setEditingId(item.id);
    setEditForm({ name: item.name, description: item.description || '', configJson: JSON.stringify(item.config || {}, null, 2) });
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async () => {
    if (!editingId) return;
    let config: Record<string, any>;
    try { config = JSON.parse(editForm.configJson); } catch { toast.error('config JSON 格式错误'); return; }
    await apiFetch(API.pluginsById(editingId), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editForm.name, description: editForm.description, config }),
    });
    setEditingId(null); fetchItems(); toast.success('已保存');
  };

  const importAllDefaults = async () => {
    let count = 0;
    for (const plugin of DEFAULT_CATALOG) {
      if (items.find(t => t.name === plugin.name)) continue;
      try {
        await apiFetch(API.plugins, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: plugin.name, description: plugin.description, source: plugin.source, config: plugin.config }),
        });
        count++;
      } catch { /* skip */ }
    }
    if (count > 0) { fetchItems(); toast.success(`已添加 ${count} 个插件`); } else toast('所有默认插件已添加');
  };

  const handleCustomAdd = async () => {
    if (!addForm.name.trim()) { toast.error('请输入插件名'); return; }
    let config: Record<string, any>;
    try { config = JSON.parse(addForm.configJson); } catch { toast.error('config JSON 格式错误'); return; }
    await apiFetch(API.plugins, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addForm.name.trim(), description: addForm.description, source: 'custom', config }),
    });
    setShowAddForm(false);
    setAddForm({ name: '', description: '', configJson: '{}' });
    fetchItems();
    toast.success(`已添加 ${addForm.name}`);
  };

  return (
    <div className="flex flex-col">
      {!hideToolbar && (
      <div className="flex items-center justify-end gap-2 px-8 py-3">
        <button onClick={() => { setAddForm({ name: '', description: '', configJson: '{}' }); setShowAddForm(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text2)' }}>
          <PlusIcon size={14} />添加自定义
        </button>
        <button onClick={importAllDefaults}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          <PackagePlusIcon size={14} />添加默认插件集
        </button>
      </div>
      )}

      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <WrenchIcon size={48} style={{ color: 'var(--wiki-text3)' }} />
          <p className="mt-4 text-sm" style={{ color: 'var(--wiki-text2)' }}>暂无 Claude 插件</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--wiki-text3)' }}>添加插件后，AI 可以通过系统提示自动调用相关功能</p>
        </div>
      )}

      <div className="flex flex-col gap-3 pb-4">
        {items.map(item => {
          const isEditing = editingId === item.id;
          return (
            <div key={item.id} className="rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: item.enabled ? 'rgba(245,158,11,0.12)' : 'var(--wiki-surface2)' }}>
                    <WrenchIcon size={18} style={{ color: item.enabled ? '#f59e0b' : 'var(--wiki-text3)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>{item.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text3)' }}>
                        {sourceLabels[item.source] || item.source}
                      </span>
                    </div>
                    {item.description && <div className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--wiki-text3)' }}>{item.description}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => toggleItem(item)}
                      className="px-3 py-1.5 rounded text-xs font-medium"
                      style={{ background: item.enabled ? 'var(--wiki-danger-bg)' : 'rgba(16,185,129,0.12)', color: item.enabled ? 'var(--wiki-danger)' : '#10b981' }}>
                      {item.enabled ? '禁用' : '启用'}
                    </button>
                    <button onClick={() => startEdit(item)} className="p-1.5 rounded hover:bg-wiki-surface2" title="编辑"><Edit2Icon size={14} style={{ color: 'var(--wiki-text3)' }} /></button>
                    <button onClick={() => deleteItem(item)} className="p-1.5 rounded hover:bg-wiki-surface2" title="删除"><TrashIcon size={14} style={{ color: 'var(--wiki-text3)' }} /></button>
                  </div>
                </div>
              </div>
              {isEditing && (
                <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--wiki-border)' }}>
                  <div className="pt-3 flex flex-col gap-2">
                    <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>名称</label>
                      <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded text-xs outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
                    </div>
                    <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>描述</label>
                      <input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded text-xs outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
                    </div>
                    <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>Config (JSON) — instructions 会注入 AI 系统提示</label>
                      <textarea value={editForm.configJson} onChange={e => setEditForm({ ...editForm, configJson: e.target.value })}
                        rows={5} className="w-full px-2.5 py-1.5 rounded text-xs outline-none font-mono resize-vertical" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
                    </div>
                    <div className="flex items-center gap-2 justify-end pt-1">
                      <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs" style={{ color: 'var(--wiki-text3)' }}><XIcon size={12} />取消</button>
                      <button onClick={saveEdit} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}><SaveIcon size={12} />保存修改</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom add form modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--wiki-overlay-heavy)', backdropFilter: 'blur(4px)' }} onClick={() => setShowAddForm(false)}>
          <div className="w-[400px] rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-wiki-text">添加自定义 Claude 插件</h3>
              <button onClick={() => setShowAddForm(false)}><XIcon size={16} style={{ color: 'var(--wiki-text3)' }} /></button>
            </div>
            <div className="flex flex-col gap-2.5">
              <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>名称</label>
                <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="my-plugin"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              </div>
              <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>描述</label>
                <input value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} placeholder="我的自定义插件"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              </div>
              <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>Config (JSON) — instructions 会注入 AI 系统提示</label>
                <textarea value={addForm.configJson} onChange={e => setAddForm({ ...addForm, configJson: e.target.value })}
                  rows={4} className="w-full px-2.5 py-1.5 rounded text-xs outline-none font-mono resize-vertical"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}
                  placeholder='{"instructions": "当用户需要...时使用此插件"}' />
              </div>
              <div className="flex items-center gap-2 justify-end pt-1">
                <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 rounded text-xs" style={{ color: 'var(--wiki-text3)' }}>取消</button>
                <button onClick={handleCustomAdd} className="px-4 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>添加</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
