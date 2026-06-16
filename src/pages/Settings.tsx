import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { SunIcon, MoonIcon, MonitorIcon, RefreshCwIcon, CogIcon, Trash2Icon, PaletteIcon, InfoIcon, CloudIcon, CloudOffIcon, BotIcon } from 'lucide-react';
import { APP_ICON } from '../constants/icon';
import { checkBackendStatus, getCowAgentConfig } from '../api/cowagent';
import { toast } from 'sonner';

export default function Settings() {
  const { theme, setTheme } = useTheme();

  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [cowStatus, setCowStatus] = useState<{running: boolean; port: number; pid: number|null}>({running: false, port: 9899, pid: null});
  const [cowVersion, setCowVersion] = useState('');

  useEffect(() => {
    const poll = () => {
      checkBackendStatus().then(s => setCowStatus(s));
      getCowAgentConfig().then(c => {
        if (c?.version) setCowVersion(String(c.version));
      });
    };
    poll();
    const timer = setInterval(poll, 5000); // poll every 5s
    return () => clearInterval(timer);
  }, []);
  const [quickCollect, setQuickCollect] = useState(() => {
    try { return localStorage.getItem('quick_collect_enabled') === 'true'; } catch { return false; }
  });
  const [autoAnalyze, setAutoAnalyze] = useState(() => {
    try { return localStorage.getItem('ai_auto_analyze') === 'true'; } catch { return true; }
  });
  const [currentVersion, setCurrentVersion] = useState('1.0.0');

  const api = window.electronAPI;

  useEffect(() => {
    api?.getVersion?.().then((v: string) => { if (v) setCurrentVersion(v); }).catch(() => {});
    api?.getSettings?.().then((s: any) => {
      if (s) { setMinimizeToTray(s.minimizeToTray); setOpenAtLogin(s.openAtLogin); }
    }).catch(() => {});
  }, []);

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!value)}
      className="relative w-12 h-6 rounded-full transition-colors flex-shrink-0"
      style={{ background: value ? 'var(--wiki-text)' : 'var(--wiki-surface2)' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full shadow transition-all"
        style={{ left: value ? '26px' : '4px', transition: 'left 0.2s', background: value ? 'var(--wiki-bg)' : 'var(--wiki-text3)' }} />
    </button>
  );

  const Section = ({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} strokeWidth={1.5} style={{ color: 'var(--wiki-accent)' }} />
        <h2 className="text-sm font-semibold text-wiki-text">{title}</h2>
      </div>
      <div className="rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
        {children}
      </div>
    </section>
  );

  return (
    <div data-cmp="Settings" className="h-full overflow-y-auto scrollbar-thin p-8">
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-wiki-text">系统设置</h1>
          <p className="text-sm text-wiki-text2 mt-1">管理应用行为、外观偏好和数据</p>
        </div>

        {/* 系统 */}
        <Section icon={CogIcon} title="系统">
          <div className="flex flex-col gap-3">
            {[
              { label: '开机启动', desc: '系统启动时自动运行 Workitt', value: openAtLogin, set: (v: boolean) => { setOpenAtLogin(v); api?.setOpenAtLogin(v).then(() => toast.success('已更新')).catch(() => toast.error('保存失败')); } },
              { label: '最小化到托盘', desc: '关闭窗口时隐藏到系统托盘而非退出', value: minimizeToTray, set: (v: boolean) => { setMinimizeToTray(v); api?.setMinimizeToTray(v).then(() => toast.success('已更新')).catch(() => toast.error('保存失败')); } },
              { label: '采集浮窗', desc: '开启后显示右下角采集按钮，点击可快速采集网页内容', value: quickCollect, set: (v: boolean) => { setQuickCollect(v); try { localStorage.setItem('quick_collect_enabled', String(v)); } catch {}; window.dispatchEvent(new CustomEvent('quick-collect-toggle', { detail: { enabled: v } })); } },
              { label: '保存后自动分析', desc: '新建需求或快速采集保存后，自动调用 AI 生成摘要和标签', value: autoAnalyze, set: (v: boolean) => { setAutoAnalyze(v); try { localStorage.setItem('ai_auto_analyze', String(v)); } catch {} } },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-wiki-text">{item.label}</div>
                  <div className="text-xs text-wiki-text3 mt-0.5">{item.desc}</div>
                </div>
                <Toggle value={item.value} onChange={item.set} />
              </div>
            ))}
          </div>
        </Section>

        {/* 外观 */}
        <Section icon={PaletteIcon} title="外观">
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'light', label: '浅色', icon: SunIcon, desc: '明亮主题' },
              { id: 'dark', label: '深色', icon: MoonIcon, desc: '深色主题' },
              { id: 'system', label: '跟随系统', icon: MonitorIcon, desc: '自动跟随' },
            ].map(opt => {
              const Icon = opt.icon;
              const isActive = theme === opt.id;
              return (
                <button key={opt.id} onClick={() => setTheme(opt.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg transition-all"
                  style={{ background: isActive ? 'var(--wiki-surface2)' : 'transparent', border: '1px solid var(--wiki-border)' }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: isActive ? 'var(--wiki-accent)' : 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
                    <Icon size={18} strokeWidth={1.5} style={{ color: isActive ? 'var(--wiki-bg)' : 'var(--wiki-text2)' }} />
                  </div>
                  <div className="text-sm font-medium" style={{ color: isActive ? 'var(--wiki-accent)' : 'var(--wiki-text2)' }}>{opt.label}</div>
                  <div className="text-xs text-wiki-text3">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* 数据 */}
        <Section icon={Trash2Icon} title="数据管理">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-wiki-text">清理浏览器缓存</div>
              <div className="text-xs text-wiki-text3 mt-1">清除 localStorage 和 sessionStorage，主题和布局保留</div>
            </div>
            <button onClick={() => {
              if (!window.confirm('确认清理缓存？')) return;
              try {
                const t = localStorage.getItem('theme');
                const qx = localStorage.getItem('qc-float-x');
                const qy = localStorage.getItem('qc-float-y');
                localStorage.clear(); sessionStorage.clear();
                if (t) localStorage.setItem('theme', t);
                if (qx) localStorage.setItem('qc-float-x', qx);
                if (qy) localStorage.setItem('qc-float-y', qy);
                toast.success('缓存已清理');
              } catch { toast.error('清理失败'); }
            }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
              style={{ background: 'var(--wiki-danger-bg)', color: 'var(--wiki-danger)' }}>
              <Trash2Icon size={12} />清理缓存
            </button>
          </div>
        </Section>

        {/* CowAgent 状态 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BotIcon size={16} strokeWidth={1.5} style={{ color: 'var(--wiki-accent)' }} />
            <h2 className="text-sm font-semibold text-wiki-text">CowAgent 引擎</h2>
          </div>
          <div className="rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {cowStatus.running ? (
                  <CloudIcon size={24} style={{color:'#10b981'}} />
                ) : (
                  <CloudOffIcon size={24} style={{color:'var(--wiki-text3)'}} />
                )}
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>
                    状态: {cowStatus.running ? '运行中' : '未连接'}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--wiki-text3)' }}>
                    {cowStatus.running
                      ? `端口 ${cowStatus.port} · PID ${cowStatus.pid}${cowVersion ? ' · v' + cowVersion : ''}`
                      : 'CowAgent Python 后端未启动，对话使用 Workitt 本地模型'}
                  </div>
                  {!cowStatus.running && (
                    <div className="text-xs mt-1.5 p-2 rounded" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                      请确保已安装 Python 3.10+（https://www.python.org/downloads/）<br />
                      安装后重启应用即可自动启动 CowAgent 引擎<br />
                      查看日志: <code style={{background:'var(--wiki-surface2)',padding:'1px 4px',borderRadius:'3px'}}>%APPDATA%\Workitt\workit.log</code>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => {
                checkBackendStatus().then(s => setCowStatus(s));
                getCowAgentConfig().then(c => { if (c?.version) setCowVersion(String(c.version)); });
              }} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
                <RefreshCwIcon size={12} />刷新
              </button>
            </div>
          </div>
        </section>

        {/* 关于 */}
        <Section icon={InfoIcon} title="关于">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={APP_ICON} alt="Workit" className="w-12 h-12 object-contain" loading="lazy" />
            </div>
            <div className="flex-1">
              <div className="text-lg font-bold text-wiki-text">Workitt</div>
              <div className="text-sm text-wiki-text3">智能体工作台</div>
              <div className="text-xs text-wiki-text3 mt-1">版本 {currentVersion}</div>
            </div>
            <button onClick={() => window.dispatchEvent(new CustomEvent('trigger-update-check'))}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
              <RefreshCwIcon size={12} />检查更新
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
