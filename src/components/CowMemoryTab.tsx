import { useState, useEffect } from 'react';
import { getMemoryList, getMemoryContent, type MemoryItem } from '../api/cowagent';
import { RefreshCwIcon, FileTextIcon, FolderIcon, ChevronRightIcon, ClockIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function CowMemoryTab() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => { fetchMemories(); }, []);

  const fetchMemories = async () => {
    setLoading(true);
    const list = await getMemoryList();
    setMemories(list);
    setLoading(false);
  };

  const openMemory = async (name: string) => {
    setSelected(name);
    setContentLoading(true);
    const text = await getMemoryContent(name);
    setContent(text);
    setContentLoading(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-8 pt-8 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--wiki-text)' }}>CowAgent 记忆</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--wiki-text2)' }}>浏览和管理 CowAgent 长期记忆</p>
        </div>
      </div>
      <div className="flex gap-4 flex-1 overflow-hidden px-8 pb-8">
        {/* File list */}
      <div className="w-64 flex-shrink-0 rounded-lg overflow-hidden" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--wiki-text2)' }}>记忆文件</span>
          <button onClick={fetchMemories} disabled={loading}
            className="p-1 rounded hover:bg-wiki-surface2"><RefreshCwIcon size={12} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--wiki-text3)' }} /></button>
        </div>
        <div className="overflow-y-auto max-h-[500px] scrollbar-thin">
          {memories.length === 0 && (
            <div className="px-3 py-8 text-center text-xs" style={{ color: 'var(--wiki-text3)' }}>暂无记忆</div>
          )}
          {memories.map(m => (
            <div key={m.name} onClick={() => openMemory(m.name)}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors"
              style={{ background: selected === m.name ? 'var(--wiki-surface2)' : 'transparent', borderBottom: '1px solid var(--wiki-border)' }}>
              <FileTextIcon size={13} style={{ color: 'var(--wiki-text3)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate" style={{ color: selected === m.name ? 'var(--wiki-text)' : 'var(--wiki-text2)' }}>{m.name}</div>
                {m.modified && <div className="text-[10px] mt-0.5" style={{ color: 'var(--wiki-text3)' }}>{m.modified}</div>}
              </div>
              <ChevronRightIcon size={11} style={{ color: 'var(--wiki-text3)' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 rounded-lg overflow-hidden" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
        {!selected ? (
          <div className="flex items-center justify-center h-48 text-xs" style={{ color: 'var(--wiki-text3)' }}>
            <div className="text-center">
              <FileTextIcon size={32} className="mx-auto mb-2" style={{ opacity: 0.3 }} />
              <p>选择一个记忆文件查看</p>
            </div>
          </div>
        ) : contentLoading ? (
          <div className="flex items-center justify-center h-48"><RefreshCwIcon size={20} className="animate-spin" style={{ color: 'var(--wiki-text3)' }} /></div>
        ) : (
          <div className="p-4 overflow-y-auto max-h-[500px] scrollbar-thin">
            <div className="text-xs font-semibold mb-3" style={{ color: 'var(--wiki-text2)' }}>{selected}</div>
            <div className="text-sm leading-relaxed" style={{ color: 'var(--wiki-text)' }}>
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
