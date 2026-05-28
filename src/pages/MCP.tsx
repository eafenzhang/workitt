import { apiFetch } from '../api';
import { useEffect, useState } from 'react';
import { ServerIcon, PlusIcon, TrashIcon, XIcon, KeyIcon, CheckCircleIcon, CircleIcon, PlugIcon } from 'lucide-react';
import { toast } from 'sonner';

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

export default function MCP() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showToken, setShowToken] = useState<number | null>(null);
  const [tokenInput, setTokenInput] = useState('');

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = () => {
    apiFetch('/api/mcp')
      .then(r => r.json())
      .then(data => setServers(data))
      .catch(() => {}); // 后端未就绪时静默处理
  };

  const toggleServer = (server: MCPServer) => {
    apiFetch(`/api/mcp/${server.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...server, enabled: !server.enabled }),
    }).then(() => {
      fetchServers();
      toast.success(server.enabled ? 'MCP已禁用' : 'MCP已启用');
    });
  };

  const deleteServer = (id: number) => {
    if (!confirm('确定删除？')) return;
    apiFetch(`/api/mcp/${id}`, { method: 'DELETE' })
      .then(() => { fetchServers(); toast.success('已删除'); });
  };

  const saveToken = (serverId: number) => {
    if (!tokenInput.trim()) return;
    apiFetch(`/api/mcp/${serverId}/token`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenInput }),
    }).then(() => {
      toast.success('Token已保存');
      setShowToken(null);
      setTokenInput('');
    });
  };

  return (
    <div className="flex flex-col gap-6 p-8 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-wiki-text">MCP工具</h1>
          <p className="text-sm text-wiki-text2 mt-1">管理和配置 MCP 服务器</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          <PlusIcon size={16} />添加服务
        </button>
      </div>

      {servers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <ServerIcon size={48} style={{ color: 'var(--wiki-text3)' }} />
          <p className="mt-4 text-wiki-text2 text-sm">暂无 MCP 服务</p>
          <p className="mt-1 text-wiki-text3 text-xs">点击「添加服务」开始配置</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {servers.map((server) => (
          <div key={server.id} className="rounded-lg p-6" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: server.enabled ? 'var(--wiki-surface2)' : 'var(--wiki-surface)' }}>
                {server.enabled ? <CheckCircleIcon size={24} style={{ color: '#10b981' }} /> : <PlugIcon size={24} style={{ color: 'var(--wiki-text3)' }} />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-wiki-text">{server.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>{server.type}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-wiki-text3">
                  <span>{server.command} {server.args.join(' ')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {server.type === 'tapd' && (
                  <button
                    onClick={() => setShowToken(showToken === server.id ? null : server.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--wiki-surface2)', color: server.config.token ? '#10b981' : 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}
                  >
                    <KeyIcon size={12} />
                    {server.config.token ? 'Token 已配置' : '设置 Token'}
                  </button>
                )}
                <button
                  onClick={() => toggleServer(server)}
                  className="px-4 py-2 rounded-lg text-xs font-medium"
                  style={{ background: server.enabled ? 'rgba(239,68,68,0.1)' : 'var(--wiki-surface2)', color: server.enabled ? '#ef4444' : '#10b981' }}
                >
                  {server.enabled ? '禁用' : '启用'}
                </button>
                <button onClick={() => deleteServer(server.id)} className="p-2 rounded-lg hover:bg-wiki-surface2 transition-colors">
                  <TrashIcon size={16} style={{ color: 'var(--wiki-text3)' }} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Token Input Modal */}
      {showToken !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-[480px] rounded-lg p-6" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <KeyIcon size={18} style={{ color: 'var(--wiki-text)' }} />
                <h2 className="text-lg font-semibold text-wiki-text">设置 TAPD Token</h2>
              </div>
              <button onClick={() => { setShowToken(null); setTokenInput(''); }} className="p-1 rounded-md hover:bg-wiki-surface2">
                <XIcon size={18} style={{ color: 'var(--wiki-text3)' }} />
              </button>
            </div>
            <p className="text-sm text-wiki-text3 mb-4">输入您的 TAPD 个人令牌，用于认证 API 请求</p>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>Token</label>
              <input
                type="password"
                placeholder="输入 TAPD 个人令牌..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowToken(null); setTokenInput(''); }}
                className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>取消</button>
              <button onClick={() => saveToken(showToken!)}
                className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>保存 Token</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Server Modal */}
      {showAdd && <AddServerModal onClose={() => setShowAdd(false)} onAdd={fetchServers} />}
    </div>
  );
}

function AddServerModal({ onClose, onAdd }: { onClose: () => void; onAdd: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('custom');
  const [command, setCommand] = useState('node');
  const [args, setArgs] = useState('');

  const handleSubmit = () => {
    if (!name || !command) return;
    apiFetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, type, command,
        args: args ? args.split(' ').filter(Boolean) : [],
        env: {}, config: {}, enabled: false,
      }),
    }).then(() => {
      onAdd();
      onClose();
      toast.success('MCP服务器已添加');
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-[480px] rounded-lg p-6" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-wiki-text">添加 MCP 服务器</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-wiki-surface2">
            <XIcon size={18} style={{ color: 'var(--wiki-text3)' }} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="TAPD"
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>类型</label>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}>
            <option value="tapd">TAPD</option>
            <option value="custom">自定义</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>命令</label>
          <input value={command} onChange={(e) => setCommand(e.target.value)}
            placeholder="node"
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wiki-text)' }}>参数（用空格分隔）</label>
          <input value={args} onChange={(e) => setArgs(e.target.value)}
            placeholder="path/to/script.js"
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
        </div>

        <button onClick={handleSubmit}
          className="w-full py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          添加
        </button>
      </div>
    </div>
  );
}
