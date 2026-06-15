import { apiFetch, API } from '../api';
import { useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  ServerIcon, TrashIcon, XIcon, CheckCircleIcon, PlugIcon, UploadIcon, EditIcon,
  PlayIcon, ChevronDownIcon, ChevronUpIcon, RefreshCwIcon, WrenchIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import ImportModal from './ImportModal';
import { useMcpStatus, getStatusColor, getStatusLabel, type McpStatus } from '../hooks/useMcpStatus';

// ── Toast message constants ──
const TOAST = {
  mcpDisabled: 'MCP已禁用',
  mcpEnabled: 'MCP已启用',
  deleted: '已删除',
  invalidConfig: '无效的配置文件',
  imported: (n: number) => `已导入 ${n} 个服务`,
  fixFormErrors: '请修正表单中的错误',
  mcpAdded: 'MCP服务器已添加',
  addFailed: '添加失败',
  saveFailed: '保存失败',
  dataError: (msg: string) => msg || '添加失败',
  toolExecuted: '工具调用完成',
  toolExecFailed: '工具调用失败',
} as const;

interface MCPServer {
  id: number;
  name: string;
  type: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  config: Record<string, any>;
  createdAt: string;
}

interface McpToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
}

export default function MCPTab({ hideToolbar, onRenderActions }: { hideToolbar?: boolean; onRenderActions?: (actions: React.ReactNode) => void }) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ name?: string; command?: string }>({});
  const [showImport, setShowImport] = useState(false);

  // ── MCP Runtime State ──
  const { servers: mcpStatus, requestRefresh } = useMcpStatus();
  // Per-server expanded states: tools panel, test panel
  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({});
  const [expandedTest, setExpandedTest] = useState<Record<number, boolean>>({});
  const [serverTools, setServerTools] = useState<Record<number, McpToolInfo[]>>({});
  // Tool test panel state
  const [testJson, setTestJson] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [testLoading, setTestLoading] = useState<Record<string, boolean>>({});

  const MCP_TEMPLATE = [
    { name: 'filesystem', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:/temp'], env: {}, config: {}, description: '文件系统 MCP 服务', source: 'marketplace' },
    { name: 'github', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' }, config: {}, description: 'GitHub MCP 服务 (npx, 需填入 Token)', source: 'marketplace' },
    { name: 'fetch', type: 'stdio', command: 'uvx', args: ['mcp-server-fetch'], env: {}, config: {}, description: 'HTTP 请求 MCP 服务', source: 'marketplace' },
  ];

  useEffect(() => {
    fetchServers();
  }, []);

  // Expose action buttons to parent
  useEffect(() => {
    onRenderActions?.(
      <>
        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text2)' }}>
          <UploadIcon size={14} />导入 JSON
        </button>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          <ServerIcon size={14} />添加 MCP 服务器
        </button>
      </>
    );
  }, [onRenderActions]);

  const fetchServers = () => {
    apiFetch(API.mcp)
      .then(r => r.json())
      .then(data => setServers(data))
      .catch(() => {});
  };

  const toggleServer = (server: MCPServer) => {
    apiFetch(API.mcpById(server.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...server, enabled: !server.enabled }),
    }).then(() => {
      fetchServers();
      toast.success(server.enabled ? TOAST.mcpDisabled : TOAST.mcpEnabled);
    });
  };

  const deleteServer = (id: number) => {
    if (!confirm('确定删除？')) return;
    apiFetch(API.mcpById(id), { method: 'DELETE' })
      .then(() => { fetchServers(); toast.success(TOAST.deleted); });
  };

  // ── Tool detail panel: fetch tools ──
  const toggleToolsPanel = useCallback(async (serverId: number, serverName: string) => {
    const api = (window as any).electronAPI;
    if (expandedTools[serverId]) {
      setExpandedTools(prev => ({ ...prev, [serverId]: false }));
      return;
    }

    // Fetch tools if not yet cached
    if (!serverTools[serverId] && api?.mcpGetServerTools) {
      try {
        const tools = await api.mcpGetServerTools(serverId);
        setServerTools(prev => ({ ...prev, [serverId]: tools || [] }));
      } catch { setServerTools(prev => ({ ...prev, [serverId]: [] })); }
    }
    setExpandedTools(prev => ({ ...prev, [serverId]: true }));
    setExpandedTest(prev => ({ ...prev, [serverId]: false }));
  }, [expandedTools, serverTools]);

  // ── Tool test panel ──
  const toggleTestPanel = useCallback((serverId: number) => {
    setExpandedTest(prev => ({ ...prev, [serverId]: !prev[serverId] }));
    setExpandedTools(prev => ({ ...prev, [serverId]: false }));
  }, []);

  const executeToolTest = useCallback(async (serverId: number, toolName: string) => {
    const key = `${serverId}:${toolName}`;
    const jsonStr = testJson[key] || '{}';
    let args: any;
    try { args = JSON.parse(jsonStr); } catch {
      toast.error('JSON 参数格式错误');
      return;
    }

    setTestLoading(prev => ({ ...prev, [key]: true }));
    setTestResult(prev => ({ ...prev, [key]: '' }));

    const api = (window as any).electronAPI;
    if (!api?.mcpExecuteTool) {
      setTestResult(prev => ({ ...prev, [key]: 'MCP 运行时未就绪' }));
      setTestLoading(prev => ({ ...prev, [key]: false }));
      return;
    }

    try {
      const result = await api.mcpExecuteTool(serverId, toolName, args);
      if (result.success) {
        setTestResult(prev => ({ ...prev, [key]: result.content || '(空结果)' }));
        toast.success(TOAST.toolExecuted);
      } else {
        setTestResult(prev => ({ ...prev, [key]: '错误: ' + (result.error || '未知错误') }));
        toast.error(TOAST.toolExecFailed);
      }
    } catch (e: any) {
      setTestResult(prev => ({ ...prev, [key]: '调用失败: ' + (e.message || String(e)) }));
      toast.error(TOAST.toolExecFailed);
    } finally {
      setTestLoading(prev => ({ ...prev, [key]: false }));
    }
  }, [testJson]);

  // ── Manual connect / reconnect ──
  const handleConnect = useCallback(async (serverId: number) => {
    const api = (window as any).electronAPI;
    if (api?.mcpConnect) {
      try { await api.mcpConnect(serverId); } catch {}
    }
  }, []);

  const handleDisconnect = useCallback(async (serverId: number) => {
    const api = (window as any).electronAPI;
    if (api?.mcpDisconnect) {
      try { await api.mcpDisconnect(serverId); } catch {}
    }
  }, []);

  return (
    <>
      {/* Toolbar — buttons only (title handled by PageHeader) */}
      {!hideToolbar && (
      <div className="flex items-center justify-end gap-2 px-8 py-3">
        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text2)' }}>
          <UploadIcon size={14} />导入 JSON
        </button>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          <ServerIcon size={14} />添加 MCP 服务器
        </button>
      </div>
      )}

      {/* Empty state */}
      {servers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <ServerIcon size={48} style={{ color: 'var(--wiki-text3)' }} />
          <p className="mt-4 text-sm" style={{ color: 'var(--wiki-text2)' }}>暂无 MCP 服务</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--wiki-text3)' }}>添加 MCP 服务器后，AI 可以直接调用外部工具和服务</p>
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-medium"
              style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
              <ServerIcon size={14} />添加 MCP 服务器
            </button>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-medium"
              style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text2)' }}>
              <UploadIcon size={14} />导入 JSON
            </button>
          </div>
        </div>
      )}

      {/* Server list */}
      <div className="flex flex-col gap-4 pb-4">
        {servers.map((server) => {
          const status = mcpStatus[String(server.id)];
          const currentStatus: McpStatus = status?.status || 'disconnected';
          const toolCount = status?.toolCount || 0;
          const statusError = status?.error || '';
          const tools = serverTools[server.id] || [];
          const toolsExpanded = !!expandedTools[server.id];
          const testExpanded = !!expandedTest[server.id];

          return (
            <div key={server.id} className="rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
              {/* Main card */}
              <div className="p-4">
                <div className="flex items-center gap-4">
                  {/* Status indicator */}
                  <div className="relative">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'var(--wiki-surface2)' }}>
                      {server.enabled ? (
                        <>
                          <div className="w-3 h-3 rounded-full absolute top-2 right-2" style={{ background: getStatusColor(currentStatus) }} title={getStatusLabel(currentStatus)} />
                          <ServerIcon size={22} style={{ color: currentStatus === 'connected' ? 'var(--wiki-success)' : 'var(--wiki-text3)' }} />
                        </>
                      ) : (
                        <PlugIcon size={22} style={{ color: 'var(--wiki-text3)' }} />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-wiki-text">{server.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>{server.type}</span>
                      {/* Status badge */}
                      {server.enabled && (
                        <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{
                          background: getStatusColor(currentStatus) + '18',
                          color: getStatusColor(currentStatus),
                        }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: getStatusColor(currentStatus) }} />
                          {getStatusLabel(currentStatus)}
                        </span>
                      )}
                      {/* Tool count */}
                      {currentStatus === 'connected' && toolCount > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
                          {toolCount} 个工具
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-wiki-text3 truncate">
                      <span>{server.command} {server.args.join(' ')}</span>
                    </div>
                    {/* Error message */}
                    {statusError && (
                      <div className="mt-1.5 text-xs" style={{ color: 'var(--wiki-danger)' }}>
                        {statusError}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Connect/Disconnect buttons */}
                    {server.enabled && currentStatus !== 'connected' && (
                      <button
                        onClick={() => handleConnect(server.id)}
                        className="p-2 rounded-lg hover:bg-wiki-surface2 transition-colors"
                        title="连接"
                        disabled={currentStatus === 'connecting'}
                      >
                        <RefreshCwIcon size={15} style={{ color: 'var(--wiki-text3)', animation: currentStatus === 'connecting' ? 'spin 1s linear infinite' : 'none' }} />
                      </button>
                    )}
                    {server.enabled && currentStatus === 'connected' && (
                      <button
                        onClick={() => handleDisconnect(server.id)}
                        className="p-2 rounded-lg hover:bg-wiki-surface2 transition-colors"
                        title="断开"
                      >
                        <XIcon size={15} style={{ color: 'var(--wiki-text3)' }} />
                      </button>
                    )}
                    {/* Tools panel toggle */}
                    {server.enabled && (
                      <button
                        onClick={() => toggleToolsPanel(server.id, server.name)}
                        className="p-2 rounded-lg hover:bg-wiki-surface2 transition-colors"
                        title="查看工具"
                      >
                        <WrenchIcon size={15} style={{ color: toolsExpanded ? 'var(--wiki-text)' : 'var(--wiki-text3)' }} />
                      </button>
                    )}
                    {/* Test panel toggle */}
                    {server.enabled && currentStatus === 'connected' && (
                      <button
                        onClick={() => toggleTestPanel(server.id)}
                        className="p-2 rounded-lg hover:bg-wiki-surface2 transition-colors"
                        title="工具测试"
                      >
                        <PlayIcon size={15} style={{ color: testExpanded ? 'var(--wiki-success)' : 'var(--wiki-text3)' }} />
                      </button>
                    )}
                    {/* Enable/Disable */}
                    <button
                      onClick={() => toggleServer(server)}
                      className="px-4 py-2 rounded-lg text-xs font-medium"
                      style={{ background: server.enabled ? 'var(--wiki-danger-bg)' : 'var(--wiki-surface2)', color: server.enabled ? 'var(--wiki-danger)' : 'var(--wiki-success)' }}
                    >
                      {server.enabled ? '禁用' : '启用'}
                    </button>
                    <button onClick={() => { setEditingId(server.id); setShowAdd(true); }} className="p-2 rounded-lg hover:bg-wiki-surface2 transition-colors">
                      <EditIcon size={16} style={{ color: 'var(--wiki-text3)' }} />
                    </button>
                    <button onClick={() => deleteServer(server.id)} className="p-2 rounded-lg hover:bg-wiki-surface2 transition-colors">
                      <TrashIcon size={16} style={{ color: 'var(--wiki-text3)' }} />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Tools Detail Panel ── */}
              {toolsExpanded && (
                <div className="px-6 pb-4" style={{ borderTop: '1px solid var(--wiki-border)' }}>
                  <div className="pt-3">
                    <h4 className="text-sm font-semibold text-wiki-text mb-3">可用工具 ({tools.length})</h4>
                    {tools.length === 0 ? (
                      <p className="text-xs text-wiki-text3">暂无工具信息（服务器可能未连接或未返回工具列表）</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {tools.map(tool => (
                          <div key={tool.name} className="rounded-lg p-3" style={{ background: 'var(--wiki-surface2)' }}>
                            <div className="flex items-center gap-2">
                              <WrenchIcon size={13} style={{ color: 'var(--wiki-text2)' }} />
                              <span className="text-sm font-medium text-wiki-text">{tool.name}</span>
                            </div>
                            <p className="text-xs mt-1" style={{ color: 'var(--wiki-text3)' }}>{tool.description || '无描述'}</p>
                            {tool.inputSchema && Object.keys(tool.inputSchema).length > 0 && (
                              <details className="mt-1.5">
                                <summary className="text-xs cursor-pointer" style={{ color: 'var(--wiki-text3)' }}>参数 Schema</summary>
                                <pre className="text-xs mt-1 p-2 rounded overflow-x-auto" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text2)' }}>
                                  {JSON.stringify(tool.inputSchema, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tool Test Panel ── */}
              {testExpanded && (
                <div className="px-6 pb-4" style={{ borderTop: '1px solid var(--wiki-border)' }}>
                  <div className="pt-3">
                    <h4 className="text-sm font-semibold text-wiki-text mb-3">工具测试</h4>
                    {tools.length === 0 ? (
                      <p className="text-xs text-wiki-text3">请先连接服务器并加载工具列表</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {tools.map(tool => {
                          const key = `${server.id}:${tool.name}`;
                          const result = testResult[key];
                          const loading = testLoading[key];
                          return (
                            <div key={tool.name} className="rounded-lg p-3" style={{ background: 'var(--wiki-surface2)' }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-wiki-text">{tool.name}</span>
                                <button
                                  onClick={() => executeToolTest(server.id, tool.name)}
                                  disabled={loading}
                                  className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors"
                                  style={{ background: loading ? 'var(--wiki-surface)' : 'var(--wiki-success)', color: loading ? 'var(--wiki-text3)' : '#fff' }}
                                >
                                  {loading ? <RefreshCwIcon size={11} className="animate-spin" /> : <PlayIcon size={11} />}
                                  {loading ? '执行中...' : '运行'}
                                </button>
                              </div>
                              <textarea
                                value={testJson[key] || ''}
                                onChange={(e) => setTestJson(prev => ({ ...prev, [key]: e.target.value }))}
                                placeholder={JSON.stringify(tool.inputSchema?.properties ? Object.keys(tool.inputSchema.properties).reduce((acc: Record<string, string>, k: string) => { acc[k] = ''; return acc; }, {}) : {}, null, 2)}
                                rows={3}
                                className="w-full px-3 py-2 rounded text-xs font-mono resize-y"
                                style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}
                              />
                              {result !== undefined && (
                                <pre className="text-xs mt-2 p-2 rounded max-h-40 overflow-y-auto scrollbar-thin" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text2)', whiteSpace: 'pre-wrap' }}>
                                  {result}
                                </pre>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add / Edit Server Modal */}
      {showAdd && <AddServerModal
        onClose={() => { setShowAdd(false); setEditingId(null); setErrors({}); }}
        onAdd={fetchServers}
        editingId={editingId}
        editData={editingId ? servers.find(s => s.id === editingId) || null : null}
      />}

      {/* Import Modal */}
      <ImportModal open={showImport} onClose={() => setShowImport(false)} onImported={fetchServers}
        apiPrefix={API.mcp} title="导入 MCP 服务器" template={MCP_TEMPLATE} />
    </>
  );
}

function AddServerModal({ onClose, onAdd, editingId, editData }: {
  onClose: () => void;
  onAdd: () => void;
  editingId: number | null;
  editData: MCPServer | null;
}) {
  const isEdit = editingId !== null && editData !== null;
  const [name, setName] = useState(editData?.name || '');
  const [type, setType] = useState(editData?.type || 'custom');
  const [command, setCommand] = useState(editData?.command || 'node');
  const [args, setArgs] = useState(editData?.args?.join(' ') || '');
  const [envText, setEnvText] = useState(() => {
    const env = editData?.env || {};
    return Object.entries(env).map(([k, v]) => k + '=' + v).join('\n');
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; command?: string }>({});

  const parseEnv = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of envText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        // Strip surrounding <> which are often copy-pasted from docs (e.g. <ghp_xxx>)
        let val = trimmed.substring(eqIdx + 1).trim();
        val = val.replace(/^<|>$/g, '');
        out[trimmed.substring(0, eqIdx).trim()] = val;
      }
    }
    return out;
  };

  const handleSubmit = async () => {
    const newErrors: { name?: string; command?: string } = {};
    if (!name.trim()) newErrors.name = '名称不能为空';
    if (!command.trim()) newErrors.command = '命令不能为空';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast.error(TOAST.fixFormErrors);
      return;
    }
    setSaving(true);
    const url = isEdit ? API.mcpById(editingId) : API.mcp;
    const method = isEdit ? 'PUT' : 'POST';
    const envParsed = isEdit ? (editData!.env || {}) : parseEnv();
    const body = isEdit
      ? { name, type, command, args: args ? args.split(' ').filter(Boolean) : [], env: envParsed, config: editData!.config }
      : { name, type, command, args: args ? args.split(' ').filter(Boolean) : [], env: envParsed, config: {}, enabled: false };
    try {
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        onAdd();
        onClose();
        toast.success(isEdit ? 'MCP服务已更新' : TOAST.mcpAdded);
      } else {
        toast.error(TOAST.dataError(data.error));
      }
    } catch {
      toast.error(TOAST.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--wiki-overlay-heavy)', backdropFilter: 'blur(4px)' }}>
      <div className="w-[480px] rounded-lg p-6" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-wiki-text">{isEdit ? '编辑服务' : '添加 MCP 服务器'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-wiki-surface2">
            <XIcon size={18} style={{ color: 'var(--wiki-text3)' }} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>名称</label>
          <input value={name} onChange={(e) => { setName(e.target.value); setErrors(prev => ({ ...prev, name: undefined })); }}
            placeholder="TAPD"
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: errors.name ? '1px solid var(--wiki-danger)' : '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
          {errors.name && <div className="text-xs mt-1" style={{ color: 'var(--wiki-danger)' }}>{errors.name}</div>}
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>类型</label>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}>
            <option value="custom">自定义</option>
            <option value="stdio">STDIO</option>
            <option value="sse">SSE</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>命令</label>
          <input value={command} onChange={(e) => { setCommand(e.target.value); setErrors(prev => ({ ...prev, command: undefined })); }}
            placeholder="node"
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: errors.command ? '1px solid var(--wiki-danger)' : '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
          {errors.command && <div className="text-xs mt-1" style={{ color: 'var(--wiki-danger)' }}>{errors.command}</div>}
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>参数（用空格分隔）</label>
          <input value={args} onChange={(e) => setArgs(e.target.value)}
            placeholder="path/to/script.js"
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>环境变量（每行 KEY=VALUE）</label>
          <textarea value={envText} onChange={(e) => setEnvText(e.target.value)}
            placeholder={`GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx...\n# 注释行会被忽略`}
            rows={4}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)', fontFamily: 'monospace' }} />
        </div>

        <button onClick={handleSubmit} disabled={saving}
          className="w-full py-2 rounded-lg text-xs font-medium" style={{ background: saving ? 'var(--wiki-surface2)' : 'var(--wiki-text)', color: saving ? 'var(--wiki-text3)' : 'var(--wiki-bg)' }}>
          {saving ? '保存中...' : (isEdit ? '保存修改' : '添加')}
        </button>
      </div>
    </div>
  );
}
