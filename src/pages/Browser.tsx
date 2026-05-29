import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, RotateCwIcon, ExternalLinkIcon } from 'lucide-react';

interface Props {
  initialUrl?: string;
  onUrlChange?: (url: string) => void;
}

export default function Browser({ initialUrl, onUrlChange }: Props) {
  const [url, setUrl] = useState(initialUrl || '');
  const [inputUrl, setInputUrl] = useState(initialUrl || '');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevInitialUrl = useRef(initialUrl);

  // Sync with external URL changes (tab switch or link click)
  useEffect(() => {
    if (initialUrl && initialUrl !== prevInitialUrl.current) {
      const u = /^https?:\/\//.test(initialUrl) ? initialUrl : 'https://' + initialUrl;
      setUrl(u);
      setInputUrl(u);
      prevInitialUrl.current = initialUrl;
    }
  }, [initialUrl]);

  // Notify parent when URL changes (user navigates)
  useEffect(() => {
    if (url && url !== initialUrl) onUrlChange?.(url);
  }, [url, initialUrl, onUrlChange]);

  const navigate = useCallback((target: string) => {
    let u = target.trim();
    if (u && !/^https?:\/\//.test(u)) u = 'https://' + u;
    setUrl(u);
    setInputUrl(u);
  }, []);

  const goBack = () => { try { iframeRef.current?.contentWindow?.history?.back(); } catch {} };
  const goForward = () => { try { iframeRef.current?.contentWindow?.history?.forward(); } catch {} };
  const reload = () => { try { iframeRef.current?.contentWindow?.location?.reload(); } catch {} };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') navigate(inputUrl);
  };

  return (
    <div className="flex flex-col h-full">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ background: 'var(--wiki-surface)', borderBottom: '1px solid var(--wiki-border)' }}>
        <button onClick={goBack} className="p-1 rounded hover:bg-wiki-surface2 transition-colors" title="后退">
          <ArrowLeftIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
        </button>
        <button onClick={goForward} className="p-1 rounded hover:bg-wiki-surface2 transition-colors" title="前进">
          <ArrowRightIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
        </button>
        <button onClick={reload} className="p-1 rounded hover:bg-wiki-surface2 transition-colors" title="刷新">
          <RotateCwIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
        </button>
        <input
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 px-3 py-1.5 rounded text-xs outline-none"
          style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)', border: '1px solid var(--wiki-border)' }}
          placeholder="输入网址..."
        />
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-wiki-surface2 transition-colors" title="在系统浏览器打开" onClick={e => e.stopPropagation()}>
            <ExternalLinkIcon size={14} style={{ color: 'var(--wiki-text2)' }} />
          </a>
        )}
      </div>
      {/* Content */}
      {url ? (
        <iframe ref={iframeRef} src={url} className="flex-1 w-full border-0" title="内置浏览器" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-wiki-text3">
          输入网址开始浏览
        </div>
      )}
    </div>
  );
}
