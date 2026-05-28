import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { SunIcon, MoonIcon, MonitorIcon, PaletteIcon, InfoIcon, GlobeIcon, RefreshCwIcon, CheckIcon, CogIcon, SparklesIcon } from 'lucide-react';
import { APP_ICON } from '../constants/icon';

// Persist update state across tab switches (module-level, survives unmount)
let _updStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' = 'idle';
let _updVersion = '';
let _updProgress = 0;
let _updError = '';

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [quickCollect, setQuickCollect] = useState(() => {
    try { return localStorage.getItem('quick_collect_enabled') === 'true'; } catch { return false; }
  });
  const [updateStatus, setUpdateStatus] = useState(_updStatus);
  const [latestVersion, setLatestVersion] = useState(_updVersion);
  const [downloadProgress, setDownloadProgress] = useState(_updProgress);
  const [currentVersion, setCurrentVersion] = useState('1.0.0');
  const [updateError, setUpdateError] = useState(_updError);
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(() => {
    try { return localStorage.getItem('ai_auto_analyze') === 'true'; } catch { return true; }
  });

  const api = (window as any).electronAPI;

  // Sync to module-level + state
  const sync = (patch: Partial<{ status: typeof _updStatus; version: string; progress: number; error: string }>) => {
    if (patch.status !== undefined) { _updStatus = patch.status; setUpdateStatus(patch.status); }
    if (patch.version !== undefined) { _updVersion = patch.version; setLatestVersion(patch.version); }
    if (patch.progress !== undefined) { _updProgress = patch.progress; setDownloadProgress(patch.progress); }
    if (patch.error !== undefined) { _updError = patch.error; setUpdateError(patch.error); }
  };

  useEffect(() => {
    api?.getVersion?.().then((v: string) => { if (v) setCurrentVersion(v); }).catch(() => {});
    api?.getSettings?.().then((s: any) => {
      if (s) { setMinimizeToTray(s.minimizeToTray); setOpenAtLogin(s.openAtLogin); }
    }).catch(() => {});
    const unsubs: (() => void)[] = [];
    if (api?.onUpdateAvailable) {
      const unsub = api.onUpdateAvailable((v: string) => sync({ status: 'available', version: v }));
      if (unsub) unsubs.push(unsub);
    }
    if (api?.onUpdateProgress) {
      const unsub = api.onUpdateProgress((p: number) => {
        sync({ progress: p });
        if (p >= 100) sync({ status: 'ready' });
      });
      if (unsub) unsubs.push(unsub);
    }
    if (api?.onUpdateDownloaded) {
      const unsub = api.onUpdateDownloaded(() => sync({ status: 'ready' }));
      if (unsub) unsubs.push(unsub);
    }
    return () => { unsubs.forEach(fn => fn()); };
  }, []);

  const checkForUpdate = async () => {
    if (!api) return;
    sync({ status: 'checking', error: '' });
    try {
      const result = await api.checkForUpdate();
      if (result?.error) { sync({ status: 'error', error: result.error }); return; }
      if (result?.available) {
        sync({ status: 'downloading', version: result.version, progress: 0 });
        const dlResult = await api.downloadUpdate();
        if (dlResult?.error) {
          sync({ status: 'error', error: '下载失败: ' + dlResult.error });
        }
      } else {
        sync({ status: 'idle', error: '已是最新版本' });
        setTimeout(() => sync({ error: '' }), 3000);
      }
    } catch { sync({ status: 'error', error: '网络请求失败' }); }
  };

  const installUpdate = () => { api?.installUpdate(); };

  const toggleQuickCollect = (enabled: boolean) => {
    setQuickCollect(enabled);
    localStorage.setItem('quick_collect_enabled', String(enabled));
    window.dispatchEvent(new CustomEvent('quick-collect-toggle', { detail: { enabled } }));
  };

  const toggleAutoAnalyze = (enabled: boolean) => {
    setAutoAnalyze(enabled);
    localStorage.setItem('ai_auto_analyze', String(enabled));
  };

  const appearanceOptions = [
    { id: 'light', label: '浅色', icon: SunIcon, desc: '明亮主题' },
    { id: 'dark', label: '深色', icon: MoonIcon, desc: '深色主题' },
    { id: 'system', label: '跟随系统', icon: MonitorIcon, desc: '自动跟随系统' },
  ] as const;

  return (
    <div data-cmp="Settings" className="h-full p-8 overflow-y-auto overflow-x-hidden scrollbar-thin">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold text-wiki-text mb-1">系统设置</h1>
        <p className="text-wiki-text2 text-sm mb-8">配置 Workit 的外观和行为</p>

        {/* System Section — moved to top with icon */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <CogIcon size={18} strokeWidth={1.5} style={{ color: 'var(--wiki-accent)' }} />
            <h2 className="text-base font-semibold text-wiki-text">系统</h2>
          </div>
          <div className="flex flex-col gap-3 rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            {[{
              label: '开机启动', desc: '系统启动时自动运行 Workit',
              value: openAtLogin, set: (v: boolean) => { setOpenAtLogin(v); api?.setOpenAtLogin(v); }
            }, {
              label: '最小化到托盘', desc: '关闭窗口时隐藏到系统托盘而非退出',
              value: minimizeToTray, set: (v: boolean) => { setMinimizeToTray(v); api?.setMinimizeToTray(v); }
            }].map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-wiki-text">{item.label}</div>
                  <div className="text-xs text-wiki-text3 mt-0.5">{item.desc}</div>
                </div>
                <button onClick={() => item.set(!item.value)}
                  className="relative w-12 h-6 rounded-full transition-colors"
                  style={{ background: item.value ? 'var(--wiki-text)' : 'var(--wiki-surface2)' }}>
                  <span className="absolute top-0.5 w-5 h-5 rounded-full shadow transition-all"
                    style={{ left: item.value ? '26px' : '4px', transition: 'left 0.2s', background: item.value ? 'var(--wiki-bg)' : 'var(--wiki-text3)' }} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Appearance Section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <PaletteIcon size={18} strokeWidth={1.5} style={{ color: 'var(--wiki-accent)' }} />
            <h2 className="text-base font-semibold text-wiki-text">外观</h2>
          </div>

          <div className="rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="text-sm font-medium text-wiki-text mb-1">主题模式</div>
            <div className="text-xs text-wiki-text3 mb-4">选择浅色或深色主题</div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {appearanceOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setTheme(opt.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-md transition-all relative"
                    style={{
                      background: isActive ? 'var(--wiki-surface2)' : 'transparent',
                      border: '1px solid var(--wiki-border)',
                    }}
                  >
                    <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: isActive ? 'var(--wiki-accent)' : 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
                      <Icon size={18} strokeWidth={1.5} style={{ color: isActive ? 'var(--wiki-bg)' : 'var(--wiki-text2)' }} />
                    </div>
                    <div className="text-sm font-medium" style={{ color: isActive ? 'var(--wiki-accent)' : 'var(--wiki-text2)' }}>{opt.label}</div>
                    <div className="text-xs" style={{ color: 'var(--wiki-text3)' }}>{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Quick Collect Section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <GlobeIcon size={18} strokeWidth={1.5} style={{ color: 'var(--wiki-accent)' }} />
            <h2 className="text-base font-semibold text-wiki-text">快速采集</h2>
          </div>

          <div className="rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-wiki-text mb-1">采集浮窗</div>
                <div className="text-xs text-wiki-text3">开启后显示右下角采集按钮，点击可快速采集网页内容</div>
              </div>
              <button
                onClick={() => toggleQuickCollect(!quickCollect)}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ background: quickCollect ? "var(--wiki-text)" : "var(--wiki-surface2)" }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full shadow transition-all"
                  style={{ left: quickCollect ? '26px' : '4px', transition: 'left 0.2s', background: quickCollect ? "var(--wiki-bg)" : "var(--wiki-text3)" }}
                />
              </button>
            </div>
          </div>
        </section>

        {/* AI Auto-Analyze Section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <SparklesIcon size={18} strokeWidth={1.5} style={{ color: 'var(--wiki-accent)' }} />
            <h2 className="text-base font-semibold text-wiki-text">AI 自动分析</h2>
          </div>

          <div className="rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-wiki-text mb-1">保存后自动分析</div>
                <div className="text-xs text-wiki-text3">新建需求或快速采集保存后，自动调用 AI 模型生成摘要和标签（需配置模型）</div>
              </div>
              <button
                onClick={() => toggleAutoAnalyze(!autoAnalyze)}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ background: autoAnalyze ? "var(--wiki-text)" : "var(--wiki-surface2)" }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full shadow transition-all"
                  style={{ left: autoAnalyze ? '26px' : '4px', transition: 'left 0.2s', background: autoAnalyze ? "var(--wiki-bg)" : "var(--wiki-text3)" }}
                />
              </button>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <InfoIcon size={18} strokeWidth={1.5} style={{ color: 'var(--wiki-accent)' }} />
            <h2 className="text-base font-semibold text-wiki-text">关于</h2>
          </div>

          <div className="rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-lg flex items-center justify-center overflow-hidden">
                <img src={APP_ICON} alt="Workit" className="w-12 h-12 object-contain" />
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold text-wiki-text">Workit</div>
                <div className="text-sm text-wiki-text3">智能体工作台</div>
                <div className="text-xs text-wiki-text3 mt-1">版本 {currentVersion}</div>
              </div>
              {updateStatus === 'idle' && (
                <button onClick={checkForUpdate} className="flex items-center gap-2 px-3 py-2 rounded-md text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
                  <RefreshCwIcon size={12} /> 检查更新
                </button>
              )}
              {updateStatus === 'checking' && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--wiki-text3)' }}>
                  <RefreshCwIcon size={12} className="animate-spin" /> 检查中...
                </div>
              )}
              {updateStatus === 'downloading' && (
                <div className="flex flex-col gap-2">
                  <div className="text-xs" style={{ color: 'var(--wiki-text)' }}>
                    正在下载 v{latestVersion}...
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-44 h-2 rounded-full overflow-hidden" style={{ background: 'var(--wiki-surface2)' }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${downloadProgress}%`, background: 'var(--wiki-text)' }} />
                    </div>
                    <span className="text-xs" style={{ color: 'var(--wiki-text3)' }}>{downloadProgress}%</span>
                  </div>
                </div>
              )}
              {updateStatus === 'ready' && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md text-xs" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                    <CheckIcon size={12} /> 已下载
                  </div>
                  <button onClick={installUpdate} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
                    立即安装
                  </button>
                </div>
              )}
              {updateStatus === 'error' && (
                <div>
                  <button onClick={checkForUpdate} className="flex items-center gap-2 px-3 py-2 rounded-md text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    <RefreshCwIcon size={12} /> 重试
                  </button>
                  {updateError && <div className="text-xs mt-1" style={{ color: '#ef4444' }}>{updateError}</div>}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
