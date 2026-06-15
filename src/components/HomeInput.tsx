import { useState, useRef, useCallback } from 'react';
import { ArrowUpIcon, StopCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface HomeSendPayload {
  content: string;
  providerId: string;
  modelId: string;
  toolsEnabled: boolean;
}

interface HomeInputProps {
  onSend: (payload: HomeSendPayload) => void;
  onStop?: () => void;
  disabled?: boolean;
  selectedProvider: string;
  selectedModel: string;
  /** Bottom-left toolbar rendered INSIDE the input box */
  toolbar?: ReactNode;
}

function HomeInput({ onSend, onStop, disabled, selectedProvider, selectedModel, toolbar }: HomeInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend({ content: trimmed, providerId: selectedProvider, modelId: selectedModel, toolsEnabled: true });
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [value, disabled, onSend, selectedProvider, selectedModel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  return (
    <div data-cmp="HomeInput" className="w-full max-w-[696px] mx-auto">
      <div className="rounded-xl" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            const el = textareaRef.current;
            if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
          }}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent outline-none text-sm px-4 pt-3 pb-1 placeholder:text-wiki-text3 disabled:opacity-50"
          style={{ color: 'var(--wiki-text)', maxHeight: '160px' }}
        />
        <div className="flex items-center justify-between px-3 pb-2">
          {/* Bottom-left: toolbar slots */}
          <div className="flex items-center gap-1">
            {toolbar}
          </div>
          {/* Bottom-right: send or stop */}
          {disabled ? (
            <button
              onClick={onStop}
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
            >
              <StopCircleIcon size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!value.trim()}
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30"
              style={{ background: value.trim() ? 'var(--wiki-text)' : 'var(--wiki-surface2)', color: value.trim() ? 'var(--wiki-bg)' : 'var(--wiki-text3)' }}
            >
              <ArrowUpIcon size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default HomeInput;
