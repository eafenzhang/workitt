import { useState, useEffect } from 'react';
import { apiFetch, API } from '../api';
import { getSkills as getCowSkills, toggleSkill, installSkill } from '../api/cowagent';
import { ZapIcon, Edit2Icon, TrashIcon, PackagePlusIcon, SaveIcon, XIcon, PlusIcon, BotIcon, CloudIcon, DownloadIcon } from 'lucide-react';
import { toast } from 'sonner';

interface SkillItem {
  id: string; name: string; description: string; source: string;
  enabled: boolean; config: Record<string, any>; createdAt: string;
}

interface CowSkill {
  name: string; description?: string; version?: string; author?: string; enabled?: boolean;
}

const DEFAULT_CATALOG = [
  { name: 'pdf',            description: 'PDF 文件处理 — 读取、编辑、合并、转换 PDF 文档',                source: 'built-in',   config: { instructions: '当用户需要处理 PDF 文件时使用此技能' } },
  { name: 'xlsx',           description: 'Excel 表格处理 — 读取、编辑、创建 .xlsx/.csv 文件',              source: 'built-in',   config: { instructions: '当用户需要处理 Excel/CSV 表格数据时使用此技能' } },
  { name: 'docx',           description: 'Word 文档处理 — 创建、读取、编辑 Word 文档',                     source: 'built-in',   config: { instructions: '当用户需要处理 Word 文档时使用此技能' } },
  { name: 'code-review',    description: '代码审查 — 分析代码质量、发现潜在问题、提供改进建议',             source: 'marketplace',config: { instructions: '当用户需要代码审查或代码质量分析时使用此技能' } },
  { name: 'github',         description: 'GitHub 集成 — Issues、PR、CI、Release 管理',                    source: 'marketplace',config: { instructions: '当用户需要与 GitHub 交互时使用此技能' } },
  { name: 'browser',        description: '浏览器自动化 — 网页截图、数据抓取、表单填写',                     source: 'built-in',   config: { instructions: '当用户需要浏览器操作或网页抓取时使用此技能' } },
  { name: 'translate',      description: '翻译 — 多语言翻译，支持中英日韩等主流语言',                       source: 'built-in',   config: { instructions: '当用户需要翻译文本时使用此技能' } },
];

const sourceLabels: Record<string, string> = { 'built-in': '内置', 'marketplace': '市场', 'custom': '自定义', 'url': 'URL' };

export default function SkillsTab({ hideToolbar }: { hideToolbar?: boolean }) {
  const [items, setItems] = useState<SkillItem[]>([]);
  const [cowSkills, setCowSkills] = useState<CowSkill[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; configJson: string }>({ name: '', description: '', configJson: '{}' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<{ name: string; description: string; configJson: string }>({ name: '', description: '', configJson: '{}' });
  const [activeSubTab, setActiveSubTab] = useState<'local' | 'cowagent'>('local');

  useEffect(() => { fetchWorkitSkills(); }, []);

  // Fetch CowAgent skills when sub-tab switches
  useEffect(() => {
    if (activeSubTab === 'cowagent') {
      fetchCowAgentSkills();
    }
  }, [activeSubTab]);

  const fetchWorkitSkills = () => {
    apiFetch(API.skills).then(r => r.json()).then(data => setItems(Array.isArray(data) ? data : [])).catch(() => {});
  };

  const fetchCowAgentSkills = async () => {
    try {
      const skills = await getCowSkills();
      setCowSkills(Array.isArray(skills) ? skills : []);
    } catch {
      // Backend not available — skills will be empty
    }
  };

  const toggleItem = (item: SkillItem) => {
    apiFetch(API.skillsById(item.id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !item.enabled }),
    }).then(() => { fetchWorkitSkills(); toast.success(item.enabled ? '已禁用' : '已启用'); });
  };

  const deleteItem = async (item: SkillItem) => {
    if (!confirm(`确定删除「${item.name}」？`)) return;
    apiFetch(API.skillsById(item.id), { method: 'DELETE' }).then(() => { fetchWorkitSkills(); toast.success(`已删除 ${item.name}`); }).catch(() => toast.error('删除失败'));
  };

  const startEdit = (item: SkillItem) => {
    setEditingId(item.id);
    setEditForm({ name: item.name, description: item.description || '', configJson: JSON.stringify(item.config || {}, null, 2) });
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async () => {
    if (!editingId) return;
    let config: Record<string, any>;
    try { config = JSON.parse(editForm.configJson); } catch { toast.error('config JSON 格式错误'); return; }
    await apiFetch(API.skillsById(editingId), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editForm.name, description: editForm.description, config }),
    });
    setEditingId(null); fetchWorkitSkills(); toast.success('已保存');
  };

  const importAllDefaults = async () => {
    let count = 0;
    for (const skill of DEFAULT_CATALOG) {
      if (items.find(t => t.name === skill.name)) continue;
      try {
        await apiFetch(API.skills, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: skill.name, description: skill.description, source: skill.source, config: skill.config }),
        });
        count++;
      } catch { /* skip */ }
    }
    if (count > 0) { fetchWorkitSkills(); toast.success(`已添加 ${count} 个技能`); } else toast('所有默认技能已添加');
  };

  const handleCustomAdd = async () => {
    if (!addForm.name.trim()) { toast.error('请输入技能名'); return; }
    let config: Record<string, any>;
    try { config = JSON.parse(addForm.configJson); } catch { toast.error('config JSON 格式错误'); return; }
    await apiFetch(API.skills, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addForm.name.trim(), description: addForm.description, source: 'custom', config }),
    });
    setShowAddForm(false);
    setAddForm({ name: '', description: '', configJson: '{}' });
    fetchWorkitSkills();
    toast.success(`已添加 ${addForm.name}`);
  };

  const handleCowToggle = async (skill: CowSkill) => {
    try {
      const action = skill.enabled !== false ? 'close' : 'open';
      await toggleSkill(skill.name, action);
      toast.success(action === 'open' ? '已启用' : '已禁用');
      fetchCowAgentSkills();
    } catch {
      toast.error('操作失败，请确认 CowAgent 后端运行中');
    }
  };

  const handleCowInstall = async (name: string) => {
    try {
      await installSkill(name);
      toast.success(`正在安装 ${name}...`);
      fetchCowAgentSkills();
    } catch {
      toast.error('安装失败，请确认 CowAgent 后端运行中');
    }
  };

  return (
    <div className="flex flex-col">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-4 py-2" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
        <button onClick={() => setActiveSubTab('local')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: activeSubTab === 'local' ? 'var(--wiki-surface2)' : 'transparent', color: activeSubTab === 'local' ? 'var(--wiki-text)' : 'var(--wiki-text3)' }}>
          <ZapIcon size={13} />Workit 技能
        </button>
        <button onClick={() => setActiveSubTab('cowagent')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: activeSubTab === 'cowagent' ? 'var(--wiki-surface2)' : 'transparent', color: activeSubTab === 'cowagent' ? 'var(--wiki-text)' : 'var(--wiki-text3)' }}>
          <BotIcon size={13} />CowAgent 技能
        </button>
      </div>

      {activeSubTab === 'local' && (
        <>
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
              <PackagePlusIcon size={14} />添加默认技能集
            </button>
          </div>
          )}

          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
              <ZapIcon size={48} style={{ color: 'var(--wiki-text3)' }} />
              <p className="mt-4 text-sm" style={{ color: 'var(--wiki-text2)' }}>暂无 Workit 技能</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--wiki-text3)' }}>添加技能后，AI 可以通过系统提示自动调用相关能力</p>
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
                        style={{ background: item.enabled ? 'rgba(99,102,241,0.12)' : 'var(--wiki-surface2)' }}>
                        <ZapIcon size={18} style={{ color: item.enabled ? '#6366f1' : 'var(--wiki-text3)' }} />
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
                        <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>Config (JSON)</label>
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

          {showAddForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--wiki-overlay-heavy)', backdropFilter: 'blur(4px)' }} onClick={() => setShowAddForm(false)}>
              <div className="w-[400px] rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-wiki-text">添加自定义 Workit 技能</h3>
                  <button onClick={() => setShowAddForm(false)}><XIcon size={16} style={{ color: 'var(--wiki-text3)' }} /></button>
                </div>
                <div className="flex flex-col gap-2.5">
                  <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>名称</label>
                    <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="my-skill"
                      className="w-full px-2.5 py-1.5 rounded text-xs outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
                  </div>
                  <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>描述</label>
                    <input value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} placeholder="我的自定义技能"
                      className="w-full px-2.5 py-1.5 rounded text-xs outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
                  </div>
                  <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>Config (JSON)</label>
                    <textarea value={addForm.configJson} onChange={e => setAddForm({ ...addForm, configJson: e.target.value })}
                      rows={4} className="w-full px-2.5 py-1.5 rounded text-xs outline-none font-mono resize-vertical"
                      style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}
                      placeholder='{"instructions": "当用户需要...时使用此技能"}' />
                  </div>
                  <div className="flex items-center gap-2 justify-end pt-1">
                    <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 rounded text-xs" style={{ color: 'var(--wiki-text3)' }}>取消</button>
                    <button onClick={handleCustomAdd} className="px-4 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>添加</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeSubTab === 'cowagent' && (
        <div className="py-4 px-4">
          {cowSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
              <BotIcon size={48} style={{ color: 'var(--wiki-text3)' }} />
              <p className="mt-4 text-sm" style={{ color: 'var(--wiki-text2)' }}>暂无 CowAgent 技能</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--wiki-text3)' }}>
                CowAgent 后端连接后自动加载技能列表
              </p>
              <button onClick={fetchCowAgentSkills}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
                <CloudIcon size={14} />刷新
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {cowSkills.map(skill => (
                <div key={skill.name} className="rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                  <div className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: skill.enabled !== false ? 'rgba(99,102,241,0.12)' : 'var(--wiki-surface2)' }}>
                        <BotIcon size={18} style={{ color: skill.enabled !== false ? '#6366f1' : 'var(--wiki-text3)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>{skill.name}</span>
                          {skill.version && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text3)' }}>
                              v{skill.version}
                            </span>
                          )}
                        </div>
                        {skill.description && (
                          <div className="text-xs mt-0.5" style={{ color: 'var(--wiki-text3)' }}>{skill.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => handleCowToggle(skill)}
                          className="px-3 py-1.5 rounded text-xs font-medium"
                          style={{ background: skill.enabled !== false ? 'var(--wiki-danger-bg)' : 'rgba(16,185,129,0.12)', color: skill.enabled !== false ? 'var(--wiki-danger)' : '#10b981' }}>
                          {skill.enabled !== false ? '禁用' : '启用'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Install new skill from marketplace */}
              <div className="mt-2 rounded-lg p-4" style={{ background: 'var(--wiki-surface)', border: '1px dashed var(--wiki-border)' }}>
                <div className="flex items-center gap-2">
                  <DownloadIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
                  <span className="text-xs" style={{ color: 'var(--wiki-text2)' }}>从 CowAgent 市场安装技能</span>
                  <input type="text" id="cow-skill-install" placeholder="技能名称..."
                    className="ml-auto px-2.5 py-1.5 rounded text-xs outline-none w-36"
                    style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) handleCowInstall(val);
                      }
                    }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
