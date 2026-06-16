import { useState, useEffect } from 'react';
import { getChannels, saveChannelConfig, connectChannel, disconnectChannel, type ChannelDef } from '../api/cowagent';
import { RefreshCwIcon, WifiIcon, WifiOffIcon, PlugIcon, UnplugIcon, MessageSquareIcon, GlobeIcon, SmartphoneIcon, HeadphonesIcon } from 'lucide-react';
import { toast } from 'sonner';

const ICON_MAP: Record<string, any> = {
  feishu: MessageSquareIcon,
  dingtalk: MessageSquareIcon,
  wechat: MessageSquareIcon,
  telegram: GlobeIcon,
  discord: HeadphonesIcon,
  slack: MessageSquareIcon,
  qq: SmartphoneIcon,
};

export default function CowChannelsTab() {
  const [channels, setChannels] = useState<ChannelDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [configForms, setConfigForms] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => { fetchChannels(); }, []);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const list = await getChannels();
      setChannels(list);
      // Initialize form values
      const forms: Record<string, Record<string, string>> = {};
      for (const ch of list) {
        forms[ch.name] = {};
        for (const f of ch.fields) {
          forms[ch.name][f.key] = f.value || f.default || '';
        }
      }
      setConfigForms(forms);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleConnect = async (ch: ChannelDef) => {
    const config = configForms[ch.name] || {};
    const ok = await connectChannel(ch.name, config);
    if (ok) { toast.success(`${ch.label} 已连接`); fetchChannels(); }
    else toast.error('连接失败');
  };

  const handleDisconnect = async (ch: ChannelDef) => {
    const ok = await disconnectChannel(ch.name);
    if (ok) { toast.success(`${ch.label} 已断开`); fetchChannels(); }
    else toast.error('断开失败');
  };

  const handleSave = async (ch: ChannelDef) => {
    const config = configForms[ch.name] || {};
    const ok = await saveChannelConfig(ch.name, config);
    if (ok) { toast.success(`${ch.label} 配置已保存`); }
    else toast.error('保存失败');
  };

  return (
    <div className="flex flex-col gap-4 py-4 px-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--wiki-text)' }}>IM 通道</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--wiki-text2)' }}>连接微信、飞书、Telegram 等 IM 平台</p>
        </div>
        <button onClick={fetchChannels} disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
          <RefreshCwIcon size={12} className={loading ? 'animate-spin' : ''} />刷新
        </button>
      </div>

      {channels.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <WifiOffIcon size={48} style={{ color: 'var(--wiki-text3)', opacity: 0.3 }} />
          <p className="mt-3 text-sm" style={{ color: 'var(--wiki-text2)' }}>暂无可用通道</p>
          <p className="text-xs mt-1" style={{ color: 'var(--wiki-text3)' }}>CowAgent 后端连接后自动加载通道列表</p>
        </div>
      )}

      {channels.map(ch => {
        const iconKey = ch.name.toLowerCase();
        const Icon = ICON_MAP[iconKey] || MessageSquareIcon;
        const form = configForms[ch.name] || {};
        const isActive = ch.active;

        return (
          <div key={ch.name} className="rounded-lg overflow-hidden" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: isActive ? 'rgba(16,185,129,0.12)' : 'var(--wiki-surface2)' }}>
                  <Icon size={18} style={{ color: isActive ? '#10b981' : 'var(--wiki-text3)' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>
                      {typeof ch.label === 'string' ? ch.label : (ch.label['zh'] || ch.name)}
                    </span>
                    {isActive ? (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                        <WifiIcon size={10} />已连接
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text3)' }}>
                        未连接
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--wiki-text3)' }}>{ch.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {isActive ? (
                  <button onClick={() => handleDisconnect(ch)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium"
                    style={{ background: 'var(--wiki-danger-bg)', color: 'var(--wiki-danger)' }}>
                    <UnplugIcon size={12} />断开
                  </button>
                ) : (
                  <button onClick={() => handleConnect(ch)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium"
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                    <PlugIcon size={12} />连接
                  </button>
                )}
              </div>
            </div>

            {/* Config fields */}
            {ch.fields.length > 0 && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-3" style={{ borderTop: '1px solid var(--wiki-border)' }}>
                {ch.fields.map(field => (
                  <div key={field.key} className="pt-3">
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>{field.label}</label>
                    <div className="flex gap-1.5">
                      <input value={form[field.key] || ''} onChange={e => setConfigForms(prev => ({
                        ...prev, [ch.name]: { ...prev[ch.name], [field.key]: e.target.value }
                      }))}
                        type={field.type === 'password' ? 'password' : 'text'}
                        placeholder={field.default || `输入${field.label}`}
                        className="flex-1 px-2.5 py-1.5 rounded text-xs outline-none"
                        style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
                      <button onClick={() => handleSave(ch)} className="px-2 py-1.5 rounded text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
                        保存
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
