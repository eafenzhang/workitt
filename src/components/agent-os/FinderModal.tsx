import { useState, useEffect, useCallback } from 'react';
import { XIcon, BookmarkIcon, Edit3Icon, CheckIcon, PlusIcon } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────

interface Bookmark {
  url: string;
  title: string;
  addedAt: number;
  /** Custom display name (user-editable) */
  displayName?: string;
  /** Custom favicon/emoticon (user-editable) */
  icon?: string;
}

interface FinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUrl: (url: string, title: string) => void;
}

const BM_KEY = 'workit_browser_bookmarks';

// ── Helpers ──────────────────────────────────────────────────────

function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(BM_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Corrupted data — return empty
  }
  return [];
}

function faviconUrl(url: string): string {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=16`;
  } catch {
    return '';
  }
}

// ── Component ────────────────────────────────────────────────────

export default function FinderModal({ isOpen, onClose, onOpenUrl }: FinderModalProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [animating, setAnimating] = useState(false);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editUrlValue, setEditUrlValue] = useState('');

  // ── New bookmark inline form ──
  const [showNewForm, setShowNewForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const saveNewBookmark = useCallback(() => {
    const u = newUrl.trim();
    if (!u) return;
    let finalUrl = u;
    if (!/^https?:\/\//.test(finalUrl)) finalUrl = 'https://' + finalUrl;
    const bm: Bookmark = {
      url: finalUrl,
      title: newTitle.trim() || finalUrl.replace(/^https?:\/\//, '').substring(0, 30),
      addedAt: Date.now(),
    };
    const next = [bm, ...bookmarks.filter(b => b.url !== finalUrl)].slice(0, 50);
    setBookmarks(next);
    try { localStorage.setItem(BM_KEY, JSON.stringify(next)); } catch {}
    setShowNewForm(false);
    setNewUrl('');
    setNewTitle('');
  }, [newUrl, newTitle, bookmarks]);

  // Fade animation
  useEffect(() => {
    if (isOpen) {
      setBookmarks(loadBookmarks());
      requestAnimationFrame(() => setAnimating(true));
    } else {
      setAnimating(false);
    }
  }, [isOpen]);

  const animateClose = useCallback(() => {
    setAnimating(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // ── Keyboard: Escape to close ──
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') animateClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, animateClose]);

  const handleRemoveBookmark = useCallback((url: string) => {
    const next = bookmarks.filter(b => b.url !== url);
    setBookmarks(next);
    try { localStorage.setItem(BM_KEY, JSON.stringify(next)); } catch {}
  }, [bookmarks]);

  const startEdit = useCallback((bm: Bookmark) => {
    setEditingUrl(bm.url);
    setEditName(bm.displayName || bm.title || '');
    setEditIcon(bm.icon || '');
    setEditUrlValue(bm.url);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingUrl) return;
    const normalizedUrl = editUrlValue.trim();
    if (!normalizedUrl) return;
    let finalUrl = normalizedUrl;
    if (!/^https?:\/\//.test(finalUrl)) finalUrl = 'https://' + finalUrl;
    const next = bookmarks.map(b =>
      b.url === editingUrl
        ? { ...b, url: finalUrl, displayName: editName || undefined, icon: editIcon || undefined }
        : b,
    );
    setBookmarks(next);
    try { localStorage.setItem(BM_KEY, JSON.stringify(next)); } catch {}
    setEditingUrl(null);
  }, [editingUrl, editName, editIcon, editUrlValue, bookmarks]);

  if (!isOpen && !animating) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.45)',
        opacity: animating ? 1 : 0,
        transition: 'opacity 0.2s ease-out',
      }}
      onClick={animateClose}
    >
      <div
        className="rounded-xl overflow-hidden w-[480px] max-h-[520px] flex flex-col mx-4"
        style={{
          background: 'var(--wiki-surface)',
          border: '1px solid var(--wiki-border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
          opacity: animating ? 1 : 0,
          transform: animating ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(8px)',
          transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--wiki-border)' }}
        >
          <div className="flex items-center gap-2">
            <BookmarkIcon size={16} style={{ color: 'var(--wiki-text2)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>
              访达 ({bookmarks.length})
            </span>
          </div>
          <button
            onClick={animateClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-wiki-surface2 transition-colors"
            aria-label="关闭"
          >
            <XIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
          </button>
        </div>

        {/* ── New bookmark form ── */}
        {showNewForm && (
          <div className="flex flex-col gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--wiki-border)', background: 'var(--wiki-surface2)' }}>
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="网址（如 https://example.com）"
              className="px-2 py-1.5 rounded text-xs outline-none"
              style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text)', border: '1px solid var(--wiki-border)' }}
            />
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="名称（可选）"
              className="px-2 py-1.5 rounded text-xs outline-none"
              style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text)', border: '1px solid var(--wiki-border)' }}
            />
            <div className="flex gap-1">
              <button onClick={saveNewBookmark} className="px-3 py-1 rounded text-xs" style={{ background: 'var(--wiki-accent)', color: 'var(--wiki-bg)' }}>
                <CheckIcon size={12} className="inline mr-1" />保存
              </button>
              <button onClick={() => { setShowNewForm(false); setNewUrl(''); setNewTitle(''); }} className="px-3 py-1 rounded text-xs" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text2)' }}>
                取消
              </button>
            </div>
          </div>
        )}

        {/* ── Bookmark list ── */}
        <div className="flex-1 overflow-y-auto">
          {bookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <BookmarkIcon size={32} style={{ color: 'var(--wiki-text3)', opacity: 0.4 }} />
              <span className="text-sm" style={{ color: 'var(--wiki-text3)' }}>
                暂无收藏
              </span>
            </div>
          ) : (
            bookmarks.map(bm => (
              <div
                key={bm.url + bm.addedAt}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-wiki-surface2 transition-colors"
                style={{ borderBottom: '1px solid var(--wiki-border)' }}
              >
                {editingUrl === bm.url ? (
                  <div className="flex flex-1 flex-col gap-2 py-1">
                    <input
                      value={editUrlValue}
                      onChange={e => setEditUrlValue(e.target.value)}
                      placeholder="网址（如 https://example.com）"
                      className="px-2 py-1 rounded text-xs outline-none"
                      style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)', border: '1px solid var(--wiki-border)' }}
                    />
                    <div className="flex gap-2">
                      <input
                        value={editIcon}
                        onChange={e => setEditIcon(e.target.value)}
                        placeholder="Icon(emoji)"
                        className="flex-1 px-2 py-1 rounded text-xs outline-none"
                        style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)', border: '1px solid var(--wiki-border)' }}
                      />
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder="名称"
                        className="flex-1 px-2 py-1 rounded text-xs outline-none"
                        style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)', border: '1px solid var(--wiki-border)' }}
                      />
                    </div>
                    <div className="flex gap-1">
                      <button onClick={saveEdit} className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--wiki-accent)', color: 'var(--wiki-bg)' }}>
                        <CheckIcon size={12} /> 保存
                      </button>
                      <button onClick={() => setEditingUrl(null)} className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => onOpenUrl(bm.url, bm.displayName || bm.title)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <span className="text-base flex-shrink-0">{bm.icon || <img
                        src={faviconUrl(bm.url)}
                        className="w-4 h-4 flex-shrink-0 rounded-sm"
                        alt=""
                        loading="lazy"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />}</span>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-xs truncate"
                          style={{ color: 'var(--wiki-text)' }}
                        >
                          {bm.displayName || bm.title || bm.url}
                        </div>
                        <div
                          className="text-[10px] truncate"
                          style={{ color: 'var(--wiki-text3)' }}
                        >
                          {bm.url}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(bm); }}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-wiki-surface transition-colors"
                        title="编辑"
                      >
                        <Edit3Icon size={11} style={{ color: 'var(--wiki-text3)' }} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveBookmark(bm.url); }}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 transition-colors"
                        title="删除"
                      >
                        <XIcon size={11} style={{ color: 'var(--wiki-danger)' }} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid var(--wiki-border)' }}>
          <button
            className="flex-1 py-1.5 text-xs rounded-md transition-colors flex items-center justify-center gap-1"
            style={{ color: 'var(--wiki-accent)' }}
            onClick={() => setShowNewForm(true)}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--wiki-surface2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <PlusIcon size={13} />
            新建书签
          </button>
        </div>
      </div>
    </div>
  );
}
