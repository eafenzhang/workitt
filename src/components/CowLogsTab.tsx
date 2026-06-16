import { useState, useEffect, useRef } from 'react';
import { connectLogStream } from '../api/cowagent';
import { RefreshCwIcon, TerminalIcon, DownloadIcon, Trash2Icon, PauseIcon, PlayIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function CowLogsTab() {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bufRef = useRef<string[]>([]);

  useEffect(() => {
    const ctrl = connectLogStream(
      (line) => {
        bufRef.current.push(line);
        if (bufRef.current.length > 100) bufRef.current.shift();
        if (!paused) setLines([...bufRef.current]);
      },
      (init) => {
        bufRef.current = init.split('\n').filter(Boolean);
        setLines([...bufRef.current]);
        setConnected(true);
      },
    );
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, paused]);

  const handleClear = () => { bufRef.current = []; setLines([]); };
  const handleExport = () => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cowagent-logs-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('日志已导出');
  };

  return (
    <div className="flex flex-col gap-3 py-4 px-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--wiki-text)' }}>CowAgent 实时日志</h1>
        </div>
        <div className="flex items-center gap-1.5">
          {connected && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>已连接</span>}
          <button onClick={() => setPaused(!paused)} className="p-1.5 rounded hover:bg-wiki-surface2" title={paused ? '继续' : '暂停'}>
            {paused ? <PlayIcon size={13} style={{ color: 'var(--wiki-text3)' }} /> : <PauseIcon size={13} style={{ color: 'var(--wiki-text3)' }} />}
          </button>
          <button onClick={handleExport} className="p-1.5 rounded hover:bg-wiki-surface2" title="导出"><DownloadIcon size={13} style={{ color: 'var(--wiki-text3)' }} /></button>
          <button onClick={handleClear} className="p-1.5 rounded hover:bg-wiki-surface2" title="清空"><Trash2Icon size={13} style={{ color: 'var(--wiki-text3)' }} /></button>
        </div>
      </div>

      <div ref={scrollRef} className="rounded-lg flex-1 min-h-0 overflow-y-auto scrollbar-thin font-mono text-xs p-3" style={{ background: '#1a1a2e', color: '#e0e0e0', border: '1px solid var(--wiki-border)' }}>
        {lines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: '#666' }}>
            {connected ? '等待日志输出...' : '连接 CowAgent 后端以接收日志...'}
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="py-0.5 leading-relaxed hover:bg-white/5" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line}
            </div>
          ))
        )}
        {paused && lines.length > 0 && (
          <div className="sticky bottom-0 text-center py-1 text-[10px]" style={{ background: 'rgba(255,255,255,0.05)', color: '#888' }}>已暂停</div>
        )}
      </div>
    </div>
  );
}
