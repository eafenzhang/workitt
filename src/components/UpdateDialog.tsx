import { useState, useEffect, useCallback } from 'react';
import { XIcon, DownloadIcon, RotateCwIcon, CheckCircleIcon } from 'lucide-react';

interface UpdateInfo {
  version: string;
  currentVersion: string;
  releaseNotes?: string;
}

type Phase = 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'hidden';

export default function UpdateDialog() {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');
  const [animating, setAnimating] = useState(false);
  const [installerPath, setInstallerPath] = useState('');

  const api = (window as any).electronAPI;

  // Listen for auto-update events
  useEffect(() => {
    if (!api?.onUpdateEvent) return;
    const unsub = api.onUpdateEvent((type: string, data: any) => {
      switch (type) {
        case 'available':
          setInfo({ version: data.version, currentVersion: data.currentVersion || '', releaseNotes: data.releaseNotes || '' });
          setPhase('available');
          setAnimating(true);
          break;
        case 'progress':
        case 'download-progress':
          setPercent(data?.percent ?? data ?? 0);
          setPhase('downloading');
          break;
        case 'downloaded':
          setPercent(100);
          if (data?.version && !info?.version) setInfo(prev=>({...prev,version:data.version,currentVersion:prev?.currentVersion||''}));
          setPhase('downloaded');
          break;
        case 'error':
          setError(data?.message || '更新失败');
          setPhase('error');
          break;
      }
    });
    return () => unsub?.();
  }, [api]);

  // Fade in animation
  useEffect(() => {
    if (phase !== 'hidden') requestAnimationFrame(() => setAnimating(true));
  }, [phase]);

  const handleCheck = useCallback(async () => {
    setPhase('checking');
    setError('');
    setAnimating(true);
    try {
      const r = await api?.checkForUpdate?.();
      if (r?.available) {
        setInfo({ version: r.version, currentVersion: r.current || '', releaseNotes: r.releaseNotes || '' });
        setPhase('available');
      } else if (r?.error) {
        setError(r.error);
        setPhase('error');
      } else {
        setInfo({ version: '', currentVersion: r?.current || '', releaseNotes: '' });
        setPhase('error');
        setError('已是最新版本');
      }
    } catch (e: any) {
      setError(e?.message || '检查失败');
      setPhase('error');
    }
  }, [api]);

  const handleDownload = useCallback(async () => {
    setPhase('downloading');
    setPercent(0);
    setError('');
    try {
      const r = await api?.downloadUpdate?.();
      if (r?.ok && r?.installerPath) {
        setInstallerPath(r.installerPath);
      } else {
        setError(r?.error || '下载失败');
        setPhase('error');
      }
    } catch (e: any) {
      setError(e?.message || '下载失败');
      setPhase('error');
    }
  }, [api]);

  const handleInstall = useCallback(async () => {
    await api?.installUpdate?.(installerPath);
  }, [api, installerPath]);

  const handleClose = useCallback(() => {
    setAnimating(false);
    setTimeout(() => {
      // Don't fully hide if downloaded — user must restart
      if (phase === 'downloaded') return;
      setPhase('hidden');
    }, 200);
  }, [phase]);

  // Listen for manual update check request from Settings
  useEffect(() => {
    const h = () => handleCheck();
    window.addEventListener('trigger-update-check', h);
    return () => window.removeEventListener('trigger-update-check', h);
  }, [handleCheck]);

  if (phase === 'hidden') return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        opacity: animating ? 1 : 0,
        transition: 'opacity 0.25s ease-out',
      }}
      onClick={handleClose}
    >
      <div
        className="rounded-2xl overflow-hidden w-[420px] max-w-[95vw] flex flex-col"
        style={{
          background: 'var(--wiki-surface)',
          border: '1px solid var(--wiki-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          transform: animating ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(12px)',
          transition: 'transform 0.25s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--wiki-text)" }}>Workitt</div>
              <div className="text-xs" style={{ color: 'var(--wiki-text3)' }}>软件更新</div>
            </div>
          </div>
          <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-wiki-surface2 transition-colors">
            <XIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Checking */}
          {phase === 'checking' && (
            <div className="flex flex-col items-center py-6 gap-3">
              <RotateCwIcon size={28} className="animate-spin" style={{ color: 'var(--wiki-text3)' }} />
              <span className="text-sm" style={{ color: 'var(--wiki-text2)' }}>正在检查更新...</span>
            </div>
          )}

          {/* Available */}
          {phase === 'available' && info && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--wiki-text3)' }}>当前版本</span>
                <span className="text-xs font-mono" style={{ color: 'var(--wiki-text2)' }}>{info.currentVersion || '--'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--wiki-text3)' }}>最新版本</span>
                <span className="text-sm font-semibold" style={{ color: '#10b981' }}>v{info.version}</span>
              </div>
              {info.releaseNotes && (
                <div>
                  <div className="text-xs mb-2" style={{ color: 'var(--wiki-text3)' }}>更新内容</div>
                  <div className="text-xs rounded-lg p-3 max-h-32 overflow-y-auto scrollbar-thin" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', whiteSpace: 'pre-wrap' }}>
                    {info.releaseNotes}
                  </div>
                </div>
              )}
              <button
                onClick={handleDownload}
                className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all hover:opacity-90"
                style={{ background: 'var(--wiki-brand-gradient)', color: '#fff' }}
              >
                <DownloadIcon size={15} /> 立即升级
              </button>
            </>
          )}

          {/* Downloading */}
          {phase === 'downloading' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--wiki-text)' }}>正在下载更新</span>
                <span className="text-xs font-mono" style={{ color: 'var(--wiki-text2)' }}>{percent}%</span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--wiki-surface2)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: percent + '%',
                    background: 'var(--wiki-brand-gradient)',
                  }}
                />
              </div>
              <div className="flex items-center gap-2 justify-center">
                <RotateCwIcon size={12} className="animate-spin" style={{ color: 'var(--wiki-text3)' }} />
                <span className="text-xs" style={{ color: 'var(--wiki-text3)' }}>请勿关闭应用</span>
              </div>
            </div>
          )}

          {/* Downloaded */}
          {phase === 'downloaded' && (
            <div className="flex flex-col items-center py-6 gap-4">
              <CheckCircleIcon size={40} style={{ color: '#10b981' }} />
              <div className="text-center">
                <div className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>更新已就绪</div>
                <div className="text-xs mt-1" style={{ color: 'var(--wiki-text3)' }}>
                  {info ? `v${info.version} 已下载完成` : '下载完成'}
                </div>
              </div>
              <button
                onClick={handleInstall}
                className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all hover:opacity-90"
                style={{ background: 'var(--wiki-success)', color: '#fff' }}
              >
                <RotateCwIcon size={15} /> 重启并安装
              </button>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <XIcon size={20} style={{ color: '#ef4444' }} />
              </div>
              <div className="text-center">
                <div className="text-sm font-medium" style={{ color: 'var(--wiki-text)' }}>{error || '检查失败'}</div>
              </div>
              <button
                onClick={handleCheck}
                className="px-6 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-90"
                style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}
              >
                重新检查
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
