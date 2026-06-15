import { useState, useEffect, useCallback } from 'react';
import { apiFetch, API } from '../api';
import { TerminalIcon, Edit2Icon, TrashIcon, DownloadIcon, CheckCircleIcon, XCircleIcon, PackagePlusIcon, LoaderIcon, SaveIcon, XIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

interface CliItem {
  id: string; name: string; description: string; source: string;
  enabled: boolean; config: Record<string, any>; createdAt: string;
}

// Rich default catalog with install hints for Windows
const DEFAULT_CATALOG = [
  { name: "git",          description: "Git 版本控制 — 仓库克隆、提交、分支管理",           source: "built-in",   config: { command: "git",          installHint: "winget install Git.Git" } },
  { name: "gh",           description: "GitHub CLI — Issues、PR、Actions、Release 管理",     source: "marketplace", config: { command: "gh",           installHint: "winget install GitHub.cli" } },
  { name: "python",       description: "Python 解释器 — 脚本执行、数据处理、AI/ML",         source: "built-in",   config: { command: "python",       installHint: "winget install Python.Python.3.13" } },
  { name: "node",         description: "Node.js 运行时 — 前端构建、后端服务、工具链",        source: "built-in",   config: { command: "node",         installHint: "winget install OpenJS.NodeJS" } },
  { name: "npm",          description: "Node.js 包管理器 — 依赖安装、脚本运行",              source: "built-in",   config: { command: "npm",          installHint: "随 Node.js 附带" } },
  { name: "docker",       description: "Docker 容器 CLI — 镜像构建、容器管理",              source: "marketplace",config: { command: "docker",       installHint: "winget install Docker.DockerDesktop" } },
  { name: "kubectl",      description: "Kubernetes CLI — 集群管理、Pod/Service 操作",       source: "marketplace",config: { command: "kubectl",      installHint: "winget install Kubernetes.kubectl" } },
  { name: "wecom-cli",    description: "企业微信 CLI — 消息、文档、通讯录、待办、会议、日程",source: "marketplace",config: { command: "wecom-cli",    installHint: "npm install -g @wecom/cli" } },
  { name: "curl",         description: "HTTP 请求工具 — API 测试、文件下载",                source: "built-in",   config: { command: "curl",         installHint: "Windows 10+ 内置" } },
  { name: "winget",       description: "Windows 包管理器 — 应用搜索、安装、升级",           source: "built-in",   config: { command: "winget",       installHint: "Windows 11+ 内置" } },
  { name: "pwsh",         description: "PowerShell 7 — 跨平台 Shell 脚本",                 source: "built-in",   config: { command: "pwsh",         installHint: "winget install Microsoft.PowerShell" } },
  { name: "rg",           description: "ripgrep — 高性能递归文本搜索",                     source: "marketplace",config: { command: "rg",           installHint: "winget install BurntSushi.ripgrep.MSVC" } },
];

const sourceLabels: Record<string, string> = { 'built-in': '内置', 'marketplace': '市场', 'custom': '自定义', 'url': 'URL' };

export default function CliToolsTab({ hideToolbar }: { hideToolbar?: boolean }) {
  const [items, setItems] = useState<CliItem[]>([]);
  const [installStatus, setInstallStatus] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; configJson: string }>({ name: '', description: '', configJson: '{}' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<{ name: string; description: string; configJson: string }>({ name: '', description: '', configJson: '{}' });

  useEffect(() => { fetchItems(); }, []);

  useEffect(() => {
    if (items.length > 0) checkAllInstallStatus();
  }, [items.length]);

  const fetchItems = () => {
    apiFetch(API.cliTools).then(r => r.json()).then(data => {
      setItems(Array.isArray(data) ? data : []);
    }).catch(() => {});
  };

  const checkSingleStatus = useCallback(async (command: string) => {
    const api = (window as any).electronAPI;
    if (!api?.cliCheckCommand) return false;
    try { const { exists } = await api.cliCheckCommand(command); return exists; }
    catch { return false; }
  }, []);

  const checkAllInstallStatus = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.cliCheckCommand || items.length === 0) return;
    const status: Record<string, boolean> = {};
    for (const item of items) {
      status[item.name] = await checkSingleStatus(item.config?.command || item.name);
    }
    setInstallStatus(status);
  }, [items, checkSingleStatus]);

  const toggleItem = (item: CliItem) => {
    apiFetch(API.cliToolsById(item.id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !item.enabled }),
    }).then(() => { fetchItems(); toast.success(item.enabled ? '已禁用' : '已启用'); });
  };

  const deleteItem = async (item: CliItem) => {
    if (!confirm(`确定删除「${item.name}」？`)) return;
    apiFetch(API.cliToolsById(item.id), { method: 'DELETE' })
      .then(() => { fetchItems(); toast.success(`已删除 ${item.name}`); })
      .catch(() => toast.error('删除失败'));
  };

  // ── Edit ──
  const startEdit = (item: CliItem) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      description: item.description || '',
      configJson: JSON.stringify(item.config || {}, null, 2),
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId) return;
    let config: Record<string, any>;
    try { config = JSON.parse(editForm.configJson); }
    catch { toast.error('config JSON 格式错误'); return; }
    await apiFetch(API.cliToolsById(editingId), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editForm.name, description: editForm.description, config }),
    });
    setEditingId(null);
    fetchItems();
    toast.success('已保存');
  };

  // ── Install ──
  const handleInstall = async (toolName: string, installHint: string) => {
    const api = (window as any).electronAPI;
    if (!api?.cliInstall) {
      navigator.clipboard.writeText(installHint);
      toast.success(`已复制安装命令: ${installHint}`);
      return;
    }
    setInstalling(prev => ({ ...prev, [toolName]: true }));
    try {
      const result = await api.cliInstall(installHint);
      if (result.success) {
        toast.success(`${toolName} 安装成功`);
        // Wait a moment then re-check this tool's status
        setTimeout(async () => {
          const exists = await checkSingleStatus(toolName);
          setInstallStatus(prev => ({ ...prev, [toolName]: exists }));
        }, 2000);
      } else {
        toast.error(`${toolName} 安装失败: ${result.error || '未知错误'}`);
      }
    } catch {
      toast.error(`${toolName} 安装失败`);
    }
    setInstalling(prev => ({ ...prev, [toolName]: false }));
  };

  const importAllDefaults = async () => {
    let count = 0;
    for (const tool of DEFAULT_CATALOG) {
      if (items.find(t => t.name === tool.name)) continue;
      try {
        await apiFetch(API.cliTools, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: tool.name, description: tool.description, source: tool.source, config: tool.config }),
        });
        count++;
      } catch { /* skip */ }
    }
    if (count > 0) { fetchItems(); toast.success(`已添加 ${count} 个工具`); }
    else toast('所有默认工具已添加');
  };

  const handleCustomAdd = async () => {
    if (!addForm.name.trim()) { toast.error('请输入命令名'); return; }
    let config: Record<string, any>;
    try { config = JSON.parse(addForm.configJson); } catch { toast.error('config JSON 格式错误'); return; }
    await apiFetch(API.cliTools, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addForm.name.trim(), description: addForm.description, source: 'custom', config }),
    });
    setShowAddForm(false);
    setAddForm({ name: '', description: '', configJson: '{}' });
    fetchItems();
    toast.success(`已添加 ${addForm.name}`);
  };

  // ── RENDER ──
  return (
    <div className="flex flex-col">
      {!hideToolbar && (
      <div className="flex items-center justify-end gap-2 px-8 py-3">
        <button onClick={checkAllInstallStatus}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
          style={{ color: 'var(--wiki-text3)' }}>
          刷新状态
        </button>
        <button onClick={() => { setAddForm({ name: '', description: '', configJson: '{}' }); setShowAddForm(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text2)' }}>
          <PlusIcon size={14} />添加自定义
        </button>
        <button onClick={importAllDefaults}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          <PackagePlusIcon size={14} />添加默认工具集
        </button>
      </div>
      )}

      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <TerminalIcon size={48} style={{ color: 'var(--wiki-text3)' }} />
          <p className="mt-4 text-sm" style={{ color: 'var(--wiki-text2)' }}>暂无 CLI 工具</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--wiki-text3)' }}>添加 CLI 工具后，AI 可以直接调用命令行执行任务</p>
        </div>
      )}

      <div className="flex flex-col gap-3 pb-4">
        {items.map(item => {
          const cmd = item.config?.command || item.name;
          const installed = installStatus[item.name];
          const installHint = item.config?.installHint;
          const notFound = installStatus[item.name] === false;
          const isInstalling = installing[item.name];
          const isEditing = editingId === item.id;

          return (
            <div key={item.id} className="rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: item.enabled ? 'rgba(20,184,166,0.12)' : 'var(--wiki-surface2)' }}>
                    <TerminalIcon size={18} style={{ color: item.enabled ? '#14b8a6' : 'var(--wiki-text3)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>{item.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text3)' }}>
                        {sourceLabels[item.source] || item.source}
                      </span>
                      {installed !== undefined && (
                        installed
                          ? <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--wiki-success)' }}><CheckCircleIcon size={10} />已安装</span>
                          : <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--wiki-danger)' }}><XCircleIcon size={10} />未找到</span>
                      )}
                    </div>
                    {item.description && (
                      <div className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--wiki-text3)' }}>{item.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {notFound && installHint && (
                      <button onClick={() => handleInstall(cmd, installHint)} disabled={isInstalling}
                        className="px-2.5 py-1.5 rounded text-[11px] font-medium flex items-center gap-1 disabled:opacity-50"
                        style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                        {isInstalling ? <><LoaderIcon size={12} className="animate-spin" />安装中</> : <><DownloadIcon size={12} />安装</>}
                      </button>
                    )}
                    <button onClick={() => toggleItem(item)}
                      className="px-3 py-1.5 rounded text-xs font-medium"
                      style={{ background: item.enabled ? 'var(--wiki-danger-bg)' : 'var(--wiki-success-bg)', color: item.enabled ? 'var(--wiki-danger)' : 'var(--wiki-success)' }}>
                      {item.enabled ? '禁用' : '启用'}
                    </button>
                    <button onClick={() => startEdit(item)}
                      className="p-1.5 rounded hover:bg-wiki-surface2" title="编辑">
                      <Edit2Icon size={14} style={{ color: 'var(--wiki-text3)' }} />
                    </button>
                    <button onClick={() => deleteItem(item)}
                      className="p-1.5 rounded hover:bg-wiki-surface2" title="删除">
                      <TrashIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Edit panel */}
              {isEditing && (
                <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--wiki-border)' }}>
                  <div className="pt-3 flex flex-col gap-2">
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>命令名</label>
                      <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded text-xs outline-none"
                        style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>描述</label>
                      <input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded text-xs outline-none"
                        style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>Config (JSON)</label>
                      <textarea value={editForm.configJson} onChange={e => setEditForm({ ...editForm, configJson: e.target.value })}
                        rows={5} className="w-full px-2.5 py-1.5 rounded text-xs outline-none font-mono resize-vertical"
                        style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
                    </div>
                    <div className="flex items-center gap-2 justify-end pt-1">
                      <button onClick={cancelEdit}
                        className="flex items-center gap-1 px-3 py-1.5 rounded text-xs"
                        style={{ color: 'var(--wiki-text3)' }}>
                        <XIcon size={12} />取消
                      </button>
                      <button onClick={saveEdit}
                        className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium"
                        style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
                        <SaveIcon size={12} />保存修改
                      </button>
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
              <h3 className="text-sm font-semibold text-wiki-text">添加自定义 CLI 工具</h3>
              <button onClick={() => setShowAddForm(false)}><XIcon size={16} style={{ color: 'var(--wiki-text3)' }} /></button>
            </div>
            <div className="flex flex-col gap-2.5">
              <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>命令名</label>
                <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="git"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              </div>
              <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>描述</label>
                <input value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} placeholder="Git 版本控制"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              </div>
              <div><label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>Config (JSON)</label>
                <textarea value={addForm.configJson} onChange={e => setAddForm({ ...addForm, configJson: e.target.value })}
                  rows={4} className="w-full px-2.5 py-1.5 rounded text-xs outline-none font-mono resize-vertical"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}
                  placeholder='{&#10;  "command": "git"&#10;}' />
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
