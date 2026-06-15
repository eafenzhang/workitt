import { apiFetch, API } from '../api';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ClipboardIcon, XIcon, SparklesIcon, ClipboardPasteIcon, FileTextIcon, FileIcon, ArchiveIcon, CodeIcon } from 'lucide-react';
import Lightbox from './Lightbox';
import { toast } from 'sonner';

// ── Toast message constants ──
const TOAST = {
  clipboardEmpty: '剪贴板为空或无法读取',
  clipboardReadFailed: '无法读取剪贴板',
  imageAdded: '图片已添加',
  imageUploadFailed: '图片上传失败',
  videoAdded: '视频已添加',
  fileAdded: '文件已添加',
  descOrFileRequired: '请输入需求描述或添加文件',
  captureFailed: (id: unknown) => `采集失败 (id=${id})`,
  captureFailedSimple: '采集失败',
  captured: '需求采集成功',
  aiAnalyzing: '正在 AI 分析...',
  aiDone: 'AI 分析完成',
  noContent: '未检测到可采集的内容',
} as const;

import { parseChatMessages, buildSenderColorMap } from '../utils/chatParser';
import { captureItemsToBlocks, extractTextFromBlocks, extractImagesFromBlocks } from '../utils/contentBlocks';
import OfficePreview from './OfficePreview';
import { DOC_EXTS, ARCHIVE_EXTS, getFileExt, getFileCategory, formatFileSize } from './FileChip';
import { downloadFile } from '../utils/download';
import {
  type CaptureItem,
  type CaptureData,
  handlePaste,
  resolveFileItem,
  parseHtmlToItems,
  resolveTextFileItems,
  getFileNameFromPath,
} from '../utils/pasteHandler';

const modules = ['系统后台', '机构后台', '品牌门店', '收银终端', '用户端', '开放平台'];
const priorities = ['高', '中', '低'];

/** Extracted static style for FileChip component */
const FILE_CHIP_STYLE: React.CSSProperties = {
  background: 'var(--wiki-surface)',
  border: '1px solid var(--wiki-border)',
  maxWidth: '280px',
};

/** File chip component for displaying file items in the capture list */
function FileChip({ item, onRemove, onPreview }: { item: CaptureItem; onRemove: () => void; onPreview?: () => void }) {
  const ext = getFileExt(item.name || '');
  const cat = getFileCategory(ext);
  const Icon = cat === 'archive' ? ArchiveIcon : cat === 'doc' ? FileTextIcon : cat === 'code' ? CodeIcon : FileIcon;
  const colors: Record<string, string> = { archive: 'var(--wiki-warning)', doc: 'var(--wiki-info)', code: 'var(--wiki-success)', file: '#8b5cf6' };
  const color = colors[cat] || colors.file;
  const canPreview = !!item.content && (item.content.startsWith('data:') || item.content.startsWith('http'));

  return (
    <div className="relative group inline-flex items-center gap-2 px-3 py-2 rounded-lg" style={{ ...FILE_CHIP_STYLE, cursor: canPreview ? 'pointer' : 'default' }} onClick={canPreview && onPreview ? onPreview : undefined}>
      <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: color + '20' }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-wiki-text truncate">{item.name || '未知文件'}</div>
        {item.size != null && <div className="text-[10px] text-wiki-text3">{formatFileSize(item.size)}</div>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    </div>
  );
}

/** Main QuickCapture component — floating button + capture modal */
export default function QuickCapture() {
  const [captured, setCaptured] = useState<CaptureData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [desc, setDesc] = useState('');
  const [module, setModule] = useState('用户端');
  const [priority, setPriority] = useState('中');
  const [enabled, setEnabled] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewItem, setPreviewItem] = useState<CaptureItem | null>(null);
  const mountedRef = useRef(true);
  const autoAnalyzeRef = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup auto-analyze timeout on unmount to prevent state updates on unmounted component
  useEffect(() => () => { if (autoAnalyzeRef.current) clearTimeout(autoAnalyzeRef.current); }, []);

  const allImages = useMemo(() => captured?.items.filter(i => i.type === 'image').map(i => i.content || '') || [], [captured]);
  const capturedText = useMemo(() => captured?.items.filter(i => i.type === 'text').map(i => i.content).join('\n') || '', [captured]);
  const chatMessages = capturedText ? parseChatMessages(capturedText) : null;
  const senderColorMap = useMemo(() => chatMessages ? buildSenderColorMap(chatMessages) : new Map(), [chatMessages]);

  const openPreview = useCallback((idx: number) => setPreviewIndex(idx), []);
  const closePreview = useCallback(() => setPreviewIndex(null), []);

  // Keyboard: Escape to close video/file preview (image lightbox handled by Lightbox component)
  useEffect(() => {
    if (!previewItem) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewItem(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewItem]);

  // Initialize: read enabled state from localStorage and listen for toggle events
  useEffect(() => {
    mountedRef.current = true;
    try {
      const saved = localStorage.getItem('quick_collect_enabled');
      setEnabled(saved === 'true');
    } catch { /* ignore */ }
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      setEnabled(customEvent.detail.enabled);
    };
    window.addEventListener('quick-collect-toggle', handler);
    return () => { window.removeEventListener('quick-collect-toggle', handler); mountedRef.current = false; };
  }, []);

  // Paste handler — uses extracted handlePaste from pasteHandler.ts
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      const api = window.electronAPI;
      // P1-12: Track if paste yielded any content
      let didCapture = false;
      const wrappedSetCaptured = (v: React.SetStateAction<CaptureData | null>) => { didCapture = true; setCaptured(v); };
      const wrappedSetShowModal = (v: React.SetStateAction<boolean>) => { didCapture = true; setShowModal(v); };
      await handlePaste(e, api, wrappedSetCaptured, wrappedSetShowModal, setDesc, mountedRef);
      // Check after a tick if nothing was captured despite clipboard having data
      setTimeout(() => {
        if (!didCapture) {
          const dt = e.clipboardData;
          const hasData = dt && (dt.types?.length > 0);
          if (hasData) toast.error(TOAST.noContent);
        }
      }, 200);
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, []);

  /** Handle float button click — read clipboard and open capture modal */
  const handleFloatClick = async () => {
    try {
      const api = window.electronAPI;
      let text = '';
      const images: string[] = [];
      const fileItems: CaptureItem[] = [];

      // 1. Read images/media via Electron native clipboard
      if (api?.readClipboardImages) {
        try {
          const nativeImages = await api.readClipboardImages();
          if (Array.isArray(nativeImages)) images.push(...nativeImages.filter(Boolean));
        } catch { /* ignore */ }
      }

      // 2. Read file references from clipboard (now returns structured objects with dataUrl)
      if (api?.readClipboardFiles) {
        try {
          const files = await api.readClipboardFiles();
          if (Array.isArray(files)) {
            for (const f of files) {
              if (!f) continue;
              if (typeof f === 'object' && f.type) {
                if (f.dataUrl) {
                  if (f.type === 'video') {
                    fileItems.push({ type: 'video', content: f.dataUrl, name: f.name, size: f.size, path: f.path });
                  } else if (f.type === 'image') {
                    if (!images.includes(f.dataUrl)) images.push(f.dataUrl);
                  } else {
                    fileItems.push({ type: 'file', content: f.dataUrl, name: f.name, size: f.size, path: f.path });
                  }
                } else if (f.path) {
                  const item = await resolveFileItem(f.path, api);
                  if (item) { item.path = f.path; fileItems.push(item); }
                } else {
                  if (f.type === 'video') {
                    fileItems.push({ type: 'video', content: '', name: f.name || '视频' });
                  } else if (f.type === 'file') {
                    fileItems.push({ type: 'file', content: '', name: f.name || '文件' });
                  }
                }
                continue;
              }
              // Legacy format: string path
              if (typeof f === 'string') {
                if (f.startsWith('data:') || f.startsWith('http')) {
                  if (!images.includes(f)) images.push(f);
                  continue;
                }
                const name = getFileNameFromPath(f);
                const ext = getFileExt(name);
                const cat = getFileCategory(ext);
                if (cat === 'image') continue;
                const item = await resolveFileItem(f, api);
                if (item) fileItems.push(item);
              }
            }
          }
        } catch { /* ignore */ }
      }

      // 3. Read text
      if (api?.readClipboardText) {
        try { text = await api.readClipboardText() || ''; } catch { /* ignore */ }
      }

      // 4. Read HTML for ordered content (pass clipboardFiles for in-place placeholder replacement)
      let htmlItems: CaptureItem[] = [];
      if (api?.readClipboardHTML) {
        try {
          const html = await api.readClipboardHTML();
          if (html) htmlItems = await parseHtmlToItems(html, text, api, fileItems);
        } catch { /* ignore */ }
      }

      // 5. Fallback: browser clipboard API
      if (images.length === 0 && navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                const dataUrl = await new Promise<string>(resolve => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => resolve('');
                  reader.readAsDataURL(blob);
                });
                if (dataUrl) images.push(dataUrl);
              } else if (type.startsWith('video/')) {
                const blob = await item.getType(type);
                const dataUrl = await new Promise<string>(resolve => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => resolve('');
                  reader.readAsDataURL(blob);
                });
                if (dataUrl) htmlItems.push({ type: 'video', content: dataUrl });
              }
            }
            if (!text && item.types.includes('text/plain')) {
              try { text = await (await item.getType('text/plain')).text(); } catch { /* ignore */ }
            }
          }
        } catch { /* ignore */ }
      }

      // 6. Fallback: browser readText
      if (!text && navigator.clipboard.readText) {
        try { text = await navigator.clipboard.readText() || ''; } catch { /* ignore */ }
      }

      if (!text && images.length === 0 && htmlItems.length === 0 && fileItems.length === 0) {
        toast.error(TOAST.clipboardEmpty);
        return;
      }

      // Build final items: merge fileItems into htmlItems placeholders IN-PLACE
      let finalItems: CaptureItem[];
      if (htmlItems.length > 0) {
        let fileItemIdx = 0;
        finalItems = htmlItems.map(item => {
          if (item.type === 'video' && !item.content && fileItemIdx < fileItems.length && fileItems[fileItemIdx].type === 'video') {
            return fileItems[fileItemIdx++];
          }
          if (item.type === 'file' && !item.content && fileItemIdx < fileItems.length && fileItems[fileItemIdx].type === 'file') {
            return fileItems[fileItemIdx++];
          }
          if (item.type === 'video' && !item.content && fileItemIdx < fileItems.length) {
            return fileItems[fileItemIdx++];
          }
          if (item.type === 'file' && !item.content && fileItemIdx < fileItems.length) {
            return fileItems[fileItemIdx++];
          }
          return item;
        });
        // Append any remaining images not covered by HTML
        const htmlImageCount = finalItems.filter(i => i.type === 'image').length;
        for (let i = htmlImageCount; i < images.length; i++) {
          finalItems.push({ type: 'image', content: images[i] });
        }
        // Append any remaining fileItems not consumed by placeholder replacement
        while (fileItemIdx < fileItems.length) {
          finalItems.push(fileItems[fileItemIdx++]);
        }
      } else {
        finalItems = [];
        if (text) {
          const textFileItems = await resolveTextFileItems(text, api);
          if (textFileItems) {
            finalItems.push(...textFileItems);
          } else {
            finalItems.push({ type: 'text', content: text });
          }
        }
        for (const img of images) finalItems.push({ type: 'image', content: img });
        finalItems.push(...fileItems);
      }

      setCaptured({ items: finalItems });
      setShowModal(true);
      setDesc('');
    } catch {
      toast.error(TOAST.clipboardReadFailed);
    }
  };

  /** Handle file upload from the "添加文件" button */
  const handleUploadFile = async (file: File) => {
    if (file.type.startsWith('image/')) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await apiFetch(API.documentsUpload, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
          setCaptured(prev => prev ? { items: [...prev.items, { type: 'image', content: data.url }] } : null);
          toast.success(TOAST.imageAdded);
        }
      } catch { toast.error(TOAST.imageUploadFailed); }
    } else if (file.type.startsWith('video/')) {
      const dataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
      if (dataUrl) {
        setCaptured(prev => prev ? { items: [...prev.items, { type: 'video', content: dataUrl }] } : null);
        toast.success(TOAST.videoAdded);
      }
    } else {
      // Document, archive, code, etc.
      const dataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
      setCaptured(prev => prev ? { items: [...prev.items, { type: 'file', content: dataUrl, name: file.name, size: file.size }] } : null);
      toast.success(TOAST.fileAdded);
    }
  };

  /** Remove an item at given index from captured list */
  const removeItem = (idx: number) => {
    setCaptured(prev => prev ? { items: prev.items.filter((_, i) => i !== idx) } : null);
  };

  /** Handle download of a captured file item */
  const handleDownload = useCallback((item: CaptureItem) => {
    if (!item.content) return;
    if (item.path) { window.electronAPI?.openPathExternal?.(item.path); return; }
    downloadFile(item.content, item.name || 'download' + getFileExt(item.name || ''));
  }, []);

  /** Notify parent windows that the requirements list has changed */
  const refreshMainList = () => {
    window.dispatchEvent(new CustomEvent('requirements-changed'));
    window.electronAPI?.notifyRequirementsChanged?.();
  };

  /** Submit captured items as a new requirement */
  const handleSubmit = async () => {
    const images = allImages.filter(Boolean);
    const hasContent = captured?.items.some(i => i.type !== 'text' || i.content.trim()) || desc.trim();
    if (!hasContent) { toast.error(TOAST.descOrFileRequired); return; }

    // Build final items: upload file items first, replace data URLs with persistent URLs
    const finalItems = captured ? [...captured.items] : [];

    // Upload file items and replace content with persistent URLs
    for (const item of finalItems) {
      if (item.type === 'file' && item.content && item.content.startsWith('data:')) {
        try {
          const blob = await fetch(item.content).then(r => r.blob());
          const formData = new FormData();
          formData.append('file', blob, item.name || 'file');
          const res = await apiFetch(API.documentsUpload, { method: 'POST', body: formData });
          const uploadData = await res.json();
          if (uploadData.url) item.content = uploadData.url;
        } catch (e) { console.error('[qc-submit] file upload error', e); }
      }
    }

    // Build content_blocks from items (preserves order)
    const contentBlocks = captureItemsToBlocks(finalItems);
    const contentBlocksStr = JSON.stringify(contentBlocks);

    // Build backward-compatible desc and images
    const textPart = extractTextFromBlocks(contentBlocks) || '';
    const compatImages = extractImagesFromBlocks(contentBlocks);
    const fileBlocks = contentBlocks.filter(b => b.type === 'file');
    const attachmentLines = fileBlocks.map(f => `[附件:${f.fileName || 'file'}|${f.content}]`);
    const fullDesc = textPart + (attachmentLines.length > 0 ? '\n' + attachmentLines.join('\n') : '') + (desc ? '\n' + desc : '');
    const title = textPart.substring(0, 30) || (compatImages.length > 0 ? '图片需求' : fileBlocks.length > 0 ? '文件需求' : '新建需求');

    let newId: number | null = null;
    try {
      const res = await apiFetch(API.requirements, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, desc: fullDesc, module, priority, images: compatImages, content_blocks: contentBlocksStr }),
      });
      const result = res.data;
      const extractedId = result?.id;
      if (!extractedId) { toast.error(TOAST.captureFailed(extractedId)); return; }
      newId = extractedId;
    } catch (e) { console.error('[qc-submit] save error', e); toast.error(TOAST.captureFailedSimple); return; }

    try { setShowModal(false); setCaptured(null); setDesc(''); toast.success(TOAST.captured); refreshMainList(); } catch { /* ignore */ }

    // Auto-analyze after successful submission
    if (newId) {
      autoAnalyzeRef.current = setTimeout(async () => {
        if (!mountedRef.current) return;
        try {
          const autoEnabled = (() => { try { return localStorage.getItem('ai_auto_analyze') === 'true'; } catch { return false; } })();
          if (!autoEnabled) return;
          const modelsRes = await apiFetch(API.models);
          const models = modelsRes.data;
          if (Array.isArray(models) && models.some((m: { enabled?: boolean }) => m.enabled)) {
            toast.success(TOAST.aiAnalyzing);
            const aRes = await apiFetch(`/api/requirements/${newId}/analyze`, { method: 'POST' });
            const aData = aRes.data;
            if (aData.error) { toast.error(aData.error); return; }
            toast.success(TOAST.aiDone);
            refreshMainList();
          }
        } catch (e) { console.error('[qc-auto-analyze] error', e); }
      }, 800);
    }
  };

  const isStandalone = !!window.electronAPI?.__isQCPopup;

  return (
    <>
      {!isStandalone && enabled && (
      <div
        className="fixed z-[99999]"
        style={{ right: '24px', bottom: '24px' }}
      >
        {/* Quick capture button */}
        <button
          onClick={handleFloatClick}
          className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 opacity-80 hover:opacity-100"
          style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}
          title="快速采集"
        >
          <ClipboardPasteIcon size={20} style={{ color: 'var(--wiki-bg)' }} />
        </button>
      </div>
      )}

      {(showModal || isStandalone) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: isStandalone ? 'transparent' : 'var(--wiki-overlay-heavy)', backdropFilter: isStandalone ? 'none' : 'blur(4px)' }}>
          <div className="w-[672px] max-h-[85vh] overflow-y-auto scrollbar-thin p-5 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--wiki-text)", color: "var(--wiki-bg)" }}>
                  <SparklesIcon size={14} style={{ color: 'var(--wiki-bg)' }} />
                </div>
                <span className="text-sm font-semibold text-wiki-text">快速采集</span>
              </div>
              {!isStandalone && (
              <button onClick={() => { setShowModal(false); setCaptured(null); setDesc(''); }} className="p-1 rounded-lg hover:bg-wiki-surface2">
                <XIcon size={16} style={{ color: 'var(--wiki-text3)' }} />
              </button>
              )}
            </div>

            {/* Mixed content display: items in copy order */}
            {captured && captured.items.length > 0 && (
              <div className="mb-4 p-3 rounded-lg max-h-60 overflow-y-auto scrollbar-thin" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
                {chatMessages && !captured.items.some(i => i.type !== 'text') ? (
                  <>
                    <div className="text-xs text-wiki-text3 mb-2">对话记录 ({chatMessages.length} 条)</div>
                    <div className="flex flex-col gap-2">
                      {chatMessages.map((msg, i) => (
                        <div key={i} className="flex flex-col">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium" style={{ color: senderColorMap.get(msg.sender) || '#6366f1' }}>{msg.sender}</span>
                            <span className="text-[10px] text-wiki-text3">{msg.time}</span>
                          </div>
                          <div className="text-xs text-wiki-text leading-relaxed whitespace-pre-wrap pl-2 border-l-2" style={{ borderColor: (senderColorMap.get(msg.sender) || '#6366f1') + '40' }}>
                            {msg.content.split('\n').map((line, j) => {
                              const trimmedLine = line.trim();
                              if (trimmedLine === '[图片]') {
                                const imgIdx = chatMessages.slice(0, i).reduce((n, m) => n + (m.content.match(/\[图片\]/g) || []).length, 0) + j;
                                const img = allImages[Math.min(imgIdx, allImages.length - 1)];
                                return img ? <img key={j} src={img} className="w-12 h-12 rounded object-cover my-1 cursor-pointer hover:opacity-80" loading="lazy" onClick={() => openPreview(Math.min(imgIdx, allImages.length - 1))} /> : <div key={j} className="inline-flex items-center gap-1 px-2 py-1 my-0.5 rounded text-[10px]" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text3)', border: '1px solid var(--wiki-border)' }}><ClipboardIcon size={10} /> 图片</div>;
                              }
                              if (trimmedLine === '[视频]') {
                                const videoItemIdx = captured.items.findIndex(it => it.type === 'video' && it.content);
                                if (videoItemIdx >= 0) {
                                  const vi = captured.items[videoItemIdx];
                                  return <div key={j} className="inline-flex items-center gap-1 px-2 py-1 my-0.5 rounded text-[10px] cursor-pointer hover:opacity-80 transition-opacity" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }} onClick={() => setPreviewItem(vi)}>🎥 视频</div>;
                                }
                                return <div key={j} className="inline-flex items-center gap-1 px-2 py-1 my-0.5 rounded text-[10px]" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text3)', border: '1px solid var(--wiki-border)' }}>🎥 视频</div>;
                              }
                              const fileMatch = trimmedLine.match(/^\[文件[：:](.+?)\]$/);
                              if (fileMatch) {
                                const fileName = fileMatch[1].trim();
                                const fileItem = captured.items.find(it => it.type === 'file' && it.name === fileName && it.content);
                                if (fileItem) {
                                  return <div key={j} className="inline-flex items-center gap-1 px-2 py-1 my-0.5 rounded text-[10px] cursor-pointer hover:opacity-80 transition-opacity" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }} onClick={() => setPreviewItem(fileItem)}><FileIcon size={10} /> {fileName}</div>;
                                }
                                return <div key={j} className="inline-flex items-center gap-1 px-2 py-1 my-0.5 rounded text-[10px]" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text3)', border: '1px solid var(--wiki-border)' }}><FileIcon size={10} /> {fileName}</div>;
                              }
                              return <div key={j}>{line || ' '}</div>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    {captured.items.map((item, i) => {
                      const itemKey = `${item.type}-${i}-${item.content?.substring(0, 20) || ''}`;
                      if (item.type === 'text') {
                        return <div key={itemKey} className="text-xs text-wiki-text leading-relaxed whitespace-pre-wrap">{item.content}</div>;
                      }
                      if (item.type === 'image') {
                        if (!item.content) {
                          return (
                            <div key={itemKey} className="relative group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px]" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text3)', border: '1px solid var(--wiki-border)' }}>
                              <ClipboardIcon size={12} /> 图片
                              <button onClick={() => removeItem(i)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                            </div>
                          );
                        }
                        const imgIdx = captured.items.slice(0, i).filter(it => it.type === 'image' && it.content).length;
                        return (
                          <div key={itemKey} className="relative group inline-flex">
                            <img src={item.content} className="w-16 h-16 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity" style={{ border: '1px solid var(--wiki-border)' }} loading="lazy" onClick={() => openPreview(imgIdx)} />
                            <button onClick={() => removeItem(i)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                          </div>
                        );
                      }
                      if (item.type === 'video') {
                        if (!item.content) {
                          return (
                            <div key={itemKey} className="relative group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px]" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text3)', border: '1px solid var(--wiki-border)' }}>
                              🎥 视频
                              <button onClick={() => removeItem(i)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                            </div>
                          );
                        }
                        return (
                          <div key={itemKey} className="relative group inline-flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} onClick={() => setPreviewItem(item)}>
                            <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#6366f120' }}>
                              <span style={{ fontSize: '16px' }}>🎥</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-wiki-text truncate">{item.name || '视频'}</div>
                              {item.size != null && <div className="text-[10px] text-wiki-text3">{formatFileSize(item.size)}</div>}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); removeItem(i); }} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                          </div>
                        );
                      }
                      if (item.type === 'file') {
                        return <FileChip key={itemKey} item={item} onRemove={() => removeItem(i)} onPreview={() => setPreviewItem(item)} />;
                      }
                      if (item.type === 'table') {
                        return (
                          <div key={itemKey} className="overflow-x-auto rounded" style={{ border: '1px solid var(--wiki-border)' }}>
                            <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }} role="table" aria-label="采集表格">
                              <tbody>
                                {(item.rows || []).map((row, ri) => (
                                  <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--wiki-surface)' }}>
                                    {row.map((cell, ci) => (
                                      <td key={ci} className="px-2 py-1" style={{ borderBottom: '1px solid var(--wiki-border)' }}>{cell}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs text-wiki-text3 mb-1.5 block">添加文件</label>
              <input type="file" className="hidden" id="capture-file-input" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUploadFile(file); e.target.value = ''; }} />
              <button onClick={() => document.getElementById('capture-file-input')?.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}>
                <ClipboardIcon size={12} /> 添加文件
              </button>
            </div>

            <div className="mb-4">
              <label className="text-xs text-wiki-text3 mb-1.5 block">补充描述</label>
              <textarea
                className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none resize-none"
                style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}
                rows={3}
                placeholder="补充更多信息..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>

            <div className="flex gap-3 mb-5">
              <div className="flex-1">
                <label className="text-xs text-wiki-text3 mb-1.5 block">模块</label>
                <select
                  className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}
                  value={module}
                  onChange={e => setModule(e.target.value)}
                >
                  {modules.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-wiki-text3 mb-1.5 block">优先级</label>
                <select
                  className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                >
                  {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  const close = () => { if (isStandalone) window.electronAPI?.closeQCForm?.(); else { setShowModal(false); setCaptured(null); setDesc(''); } };
                  close();
                }}
                className="flex-1 py-2 rounded-lg text-xs"
                style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-2 rounded-lg text-xs font-medium"
                style={{ background: "var(--wiki-text)", color: "var(--wiki-bg)" }}
              >
                提交需求
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image preview lightbox with prev/next navigation */}
      {previewIndex !== null && allImages.length > 0 && (
        <Lightbox images={allImages} index={previewIndex} onClose={closePreview} />
      )}

      {/* Video / File preview modal — fullscreen */}
      {previewItem && (
        <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: 'var(--wiki-surface)' }}>
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-white/80 text-sm truncate max-w-[70%]">{previewItem.name || (previewItem.type === 'video' ? '视频' : '文件')}</div>
            <div className="flex items-center gap-3">
              {previewItem.content && (
                <button
                  onClick={() => handleDownload(previewItem)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  title="下载文件"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  下载
                </button>
              )}
              <button onClick={() => setPreviewItem(null)} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={e => e.stopPropagation()}>
            {previewItem.type === 'video' && previewItem.content && (
              <video src={previewItem.content} controls autoPlay className="max-w-full max-h-full rounded" style={{ background: 'var(--wiki-surface)' }} />
            )}
            {previewItem.type === 'file' && previewItem.content && previewItem.content.startsWith('data:') && (
              <div className="w-full h-full overflow-hidden" style={{ background: 'var(--wiki-bg)' }}>
                {(() => {
                  const ext = getFileExt(previewItem.name || '');
                  const mime = previewItem.content.match(/^data:([^;]+)/)?.[1] || '';
                  if (mime === 'application/pdf' || ext === '.pdf') {
                    return <iframe src={previewItem.content} className="w-full h-full border-0" title="PDF Preview" />;
                  }
                  if (mime.startsWith('image/')) {
                    return <img src={previewItem.content} className="max-w-full max-h-full object-contain mx-auto" alt="Preview" />;
                  }
                  if (mime.startsWith('text/') || ['.json', '.xml', '.yaml', '.yml', '.md', '.txt', '.log', '.sql', '.sh', '.bat', '.ps1', '.py', '.js', '.ts', '.css', '.html', '.htm'].includes(ext)) {
                    try {
                      const base64 = previewItem.content.split(',')[1];
                      const text = decodeURIComponent(escape(atob(base64)));
                      return <pre className="w-full h-full overflow-auto scrollbar-thin p-6 text-sm font-mono whitespace-pre-wrap" style={{ color: 'var(--wiki-text)' }}>{text}</pre>;
                    } catch {
                      return <div className="flex items-center justify-center h-full text-gray-500">无法预览此文件</div>;
                    }
                  }
                  if (DOC_EXTS.includes(ext)) {
                    return <OfficePreview dataUrl={previewItem.content} fileName={previewItem.name} />;
                  }
                  if (ARCHIVE_EXTS.includes(ext)) {
                    return (
                      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                        <ArchiveIcon size={64} />
                        <div className="text-lg">{previewItem.name || '压缩包'}</div>
                        <div className="text-sm text-gray-400">{previewItem.size != null ? formatFileSize(previewItem.size) : ''}</div>
                        <button onClick={() => handleDownload(previewItem)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm hover:opacity-90 transition-opacity" style={{ background: 'var(--wiki-info)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          下载文件
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                      <FileIcon size={64} />
                      <div className="text-lg">{previewItem.name || '文件'}</div>
                      <div className="text-sm text-gray-400">{previewItem.size != null ? formatFileSize(previewItem.size) : ''}</div>
                      <button onClick={() => handleDownload(previewItem)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm hover:opacity-90 transition-opacity" style={{ background: '#6366f1' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        下载文件
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
