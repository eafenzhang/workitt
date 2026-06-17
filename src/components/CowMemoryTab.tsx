import { useState, useEffect } from 'react';
import {
  getMemoryList,
  getMemoryContent,
  updateMemoryContent,
  deleteMemory,
  type MemoryItem,
} from '../api/cowagent';
import {
  RefreshCwIcon,
  FileTextIcon,
  ChevronRightIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  CheckIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ConfirmDialog from './ConfirmDialog';

export default function CowMemoryTab() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchMemories();
  }, []);

  const fetchMemories = async () => {
    setLoading(true);
    const list = await getMemoryList();
    setMemories(list);
    setLoading(false);
  };

  const openMemory = async (name: string) => {
    setEditing(false);
    setSelected(name);
    setContentLoading(true);
    const text = await getMemoryContent(name);
    setContent(text);
    setContentLoading(false);
  };

  const startEditing = () => {
    setEditContent(content);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditContent('');
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    const ok = await updateMemoryContent(selected, editContent);
    setSaving(false);
    if (ok) {
      setContent(editContent);
      setEditing(false);
    } else {
      alert('保存失败，请重试');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteMemory(deleteTarget);
    setDeleting(false);
    setDeleteTarget(null);
    if (ok) {
      // If the deleted item was currently selected, clear the content area
      if (selected === deleteTarget) {
        setSelected(null);
        setContent('');
        setEditing(false);
        setEditContent('');
      }
      // Refresh the list
      await fetchMemories();
    } else {
      alert('删除失败，请重试');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-6 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--wiki-text)' }}>
            CowAgent 记忆
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--wiki-text2)' }}>
            浏览和管理 CowAgent 长期记忆
          </p>
        </div>
      </div>

      <div className="flex gap-4 flex-1 overflow-hidden px-6 pb-6">
        {/* ─── File list ──────────────────────────────── */}
        <div
          className="w-64 flex-shrink-0 rounded-lg overflow-hidden"
          style={{
            background: 'var(--wiki-surface)',
            border: '1px solid var(--wiki-border)',
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ borderBottom: '1px solid var(--wiki-border)' }}
          >
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--wiki-text2)' }}
            >
              记忆文件
            </span>
            <button
              onClick={fetchMemories}
              disabled={loading}
              className="p-1 rounded hover:bg-wiki-surface2"
            >
              <RefreshCwIcon
                size={12}
                className={loading ? 'animate-spin' : ''}
                style={{ color: 'var(--wiki-text3)' }}
              />
            </button>
          </div>
          <div className="overflow-y-auto max-h-[500px] scrollbar-thin">
            {memories.length === 0 && (
              <div
                className="px-3 py-8 text-center text-xs"
                style={{ color: 'var(--wiki-text3)' }}
              >
                暂无记忆
              </div>
            )}
            {memories.map((m) => (
              <div
                key={m.name}
                className="group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors"
                style={{
                  background:
                    selected === m.name
                      ? 'var(--wiki-surface2)'
                      : 'transparent',
                  borderBottom: '1px solid var(--wiki-border)',
                }}
                onClick={() => openMemory(m.name)}
              >
                <FileTextIcon size={13} style={{ color: 'var(--wiki-text3)' }} />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-xs truncate"
                    style={{
                      color:
                        selected === m.name
                          ? 'var(--wiki-text)'
                          : 'var(--wiki-text2)',
                    }}
                  >
                    {m.name}
                  </div>
                  {m.modified && (
                    <div
                      className="text-[10px] mt-0.5"
                      style={{ color: 'var(--wiki-text3)' }}
                    >
                      {m.modified}
                    </div>
                  )}
                </div>
                {/* Delete button – visible on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(m.name);
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-wiki-surface2"
                  title="删除"
                >
                  <Trash2Icon size={12} style={{ color: 'var(--wiki-danger)' }} />
                </button>
                <ChevronRightIcon size={11} style={{ color: 'var(--wiki-text3)' }} />
              </div>
            ))}
          </div>
        </div>

        {/* ─── Content ──────────────────────────────── */}
        <div
          className="flex-1 rounded-lg overflow-hidden flex flex-col"
          style={{
            background: 'var(--wiki-surface)',
            border: '1px solid var(--wiki-border)',
          }}
        >
          {!selected ? (
            <div
              className="flex items-center justify-center h-48 text-xs flex-1"
              style={{ color: 'var(--wiki-text3)' }}
            >
              <div className="text-center">
                <FileTextIcon size={32} className="mx-auto mb-2" style={{ opacity: 0.3 }} />
                <p>选择一个记忆文件查看</p>
              </div>
            </div>
          ) : contentLoading ? (
            <div className="flex items-center justify-center h-48 flex-1">
              <RefreshCwIcon
                size={20}
                className="animate-spin"
                style={{ color: 'var(--wiki-text3)' }}
              />
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div
                className="flex items-center justify-between px-4 py-2"
                style={{ borderBottom: '1px solid var(--wiki-border)' }}
              >
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--wiki-text2)' }}
                >
                  {selected}
                </span>
                <div className="flex items-center gap-1">
                  {editing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="p-1.5 rounded hover:bg-wiki-surface2 transition-colors"
                        title="保存"
                      >
                        <CheckIcon
                          size={14}
                          style={{
                            color: saving
                              ? 'var(--wiki-text3)'
                              : 'var(--wiki-accent)',
                          }}
                          className={saving ? 'animate-spin' : ''}
                        />
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={saving}
                        className="p-1.5 rounded hover:bg-wiki-surface2 transition-colors"
                        title="取消"
                      >
                        <XIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={startEditing}
                        className="p-1.5 rounded hover:bg-wiki-surface2 transition-colors"
                        title="编辑"
                      >
                        <PencilIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(selected)}
                        className="p-1.5 rounded hover:bg-wiki-surface2 transition-colors"
                        title="删除"
                      >
                        <Trash2Icon size={14} style={{ color: 'var(--wiki-danger)' }} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Editor / Preview */}
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {editing ? (
                  <textarea
                    className="w-full h-full p-4 text-sm resize-none focus:outline-none"
                    style={{
                      background: 'transparent',
                      color: 'var(--wiki-text)',
                    }}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <div className="p-4 text-sm leading-relaxed" style={{ color: 'var(--wiki-text)' }}>
                    <ReactMarkdown>{content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Delete Confirmation Dialog ────────────── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除记忆"
        message={`确定要删除 "${deleteTarget || ''}" 吗？此操作不可撤销。`}
        confirmLabel={deleting ? '删除中...' : '删除'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
