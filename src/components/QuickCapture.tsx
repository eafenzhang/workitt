import { apiFetch } from '../api';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ClipboardIcon, XIcon, SparklesIcon, ClipboardPasteIcon, ChevronLeftIcon, ChevronRightIcon, FileTextIcon, FileIcon, ArchiveIcon, CodeIcon } from 'lucide-react';
import { toast } from 'sonner';
import { parseChatMessages, buildSenderColorMap } from '../utils/chatParser';
import { captureItemsToBlocks, extractTextFromBlocks, extractImagesFromBlocks } from '../utils/contentBlocks';
import OfficePreview from './OfficePreview';
import { DOC_EXTS, ARCHIVE_EXTS, getFileExt, getFileCategory, formatFileSize } from './FileChip';
import { downloadFile } from '../utils/download';

interface CaptureItem {
  type: 'text' | 'image' | 'video' | 'file' | 'table';
  content: string; // text content / image dataURL / video dataURL / file dataURL
  name?: string;   // file name (for 'file' type)
  size?: number;   // file size in bytes (for 'file' type)
  path?: string;   // original file path (for 'file'/'video' type, used to open externally)
  rows?: string[][];  // 表格数据（table 类型时）
  headers?: string[]; // 表头（table 类型时可选）
}

interface CaptureData {
  items: CaptureItem[];
}

const modules = ['系统后台', '机构后台', '品牌门店', '收银终端', '用户端', '开放平台'];
const priorities = ['高', '中', '低'];

/** Check if a string looks like a file path (Windows: C:\... or UNC: \\server\...) */
function looksLikeFilePath(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  // Windows absolute path: C:\..., D:/...
  if (/^[a-zA-Z]:[\\\/]/.test(t)) return true;
  // UNC path: \\server\share
  if (/^\\\\/.test(t)) return true;
  return false;
}

/** Parse text for file paths and convert to CaptureItems. Returns null if no file paths found. */
async function resolveTextFileItems(text: string, api: any): Promise<CaptureItem[] | null> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items: CaptureItem[] = [];
  let hasFiles = false;

  for (const line of lines) {
    // WeChat/WeCom file markers: [文件:filename] or [文件：filename]
    const fileMarkerRx = /^\[文件[：:](.+?)\]$/;
    const fileMatch = line.match(fileMarkerRx);
    if (fileMatch) {
      items.push({ type: 'file', content: '', name: fileMatch[1].trim(), size: undefined });
      hasFiles = true;
      continue;
    }
    // Check if line is a file:// URL
    if (line.startsWith('file://')) {
      const fp = fileUrlToPath(line);
      const name = getFileNameFromPath(fp);
      const ext = getFileExt(name);
      const cat = getFileCategory(ext);
      if (cat === 'image' || cat === 'video') {
        if (api?.readLocalFile) {
          const dataUrl = await api.readLocalFile(fp);
          if (dataUrl) { items.push({ type: cat, content: dataUrl }); hasFiles = true; continue; }
        }
      } else {
        let dataUrl: string | null = null;
        if (api?.readLocalFile) dataUrl = await api.readLocalFile(fp);
        items.push({ type: 'file', content: dataUrl || line, name, size: undefined });
        hasFiles = true;
        continue;
      }
    }

    // Check if line looks like a file path
    if (looksLikeFilePath(line)) {
      const name = getFileNameFromPath(line);
      const ext = getFileExt(name);
      if (ext) { // Has an extension → likely a file
        const cat = getFileCategory(ext);
        if (cat === 'image' || cat === 'video') {
          if (api?.readLocalFile) {
            const dataUrl = await api.readLocalFile(line);
            if (dataUrl) { items.push({ type: cat, content: dataUrl }); hasFiles = true; continue; }
          }
        } else {
          let dataUrl: string | null = null;
          if (api?.readLocalFile) dataUrl = await api.readLocalFile(line);
          items.push({ type: 'file', content: dataUrl || line, name, size: undefined });
          hasFiles = true;
          continue;
        }
      }
    }

    // Not a file path → treat as text
    items.push({ type: 'text', content: line });
  }

  return hasFiles ? items : null;
}

function fileUrlToPath(url: string): string {
  let fp = url.replace(/^file:\/\//, '').replace(/^localhost\//, '');
  if (/^\/[a-zA-Z]:/.test(fp)) fp = fp.slice(1);
  fp = decodeURIComponent(fp);
  fp = fp.replace(/\//g, String.fromCharCode(92));
  return fp;
}

function getFileNameFromPath(fp: string): string {
  const parts = fp.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || fp;
}

function FileChip({ item, onRemove, onPreview }: { item: CaptureItem; onRemove: () => void; onPreview?: () => void }) {
  const ext = getFileExt(item.name || '');
  const cat = getFileCategory(ext);
  const Icon = cat === 'archive' ? ArchiveIcon : cat === 'doc' ? FileTextIcon : cat === 'code' ? CodeIcon : FileIcon;
  const colors: Record<string, string> = { archive: '#f59e0b', doc: '#6366f1', code: '#10b981', file: '#8b5cf6' };
  const color = colors[cat] || colors.file;
  const canPreview = !!item.content && (item.content.startsWith('data:') || item.content.startsWith('http'));

  return (
    <div className="relative group inline-flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)', maxWidth: '280px', cursor: canPreview ? 'pointer' : 'default' }} onClick={canPreview && onPreview ? onPreview : undefined}>
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
  const autoAnalyzeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (autoAnalyzeRef.current) clearTimeout(autoAnalyzeRef.current); }, []);

  const allImages = useMemo(() => captured?.items.filter(i => i.type === 'image').map(i => i.content || '') || [], [captured]);
  const capturedText = useMemo(() => captured?.items.filter(i => i.type === 'text').map(i => i.content).join('\n') || '', [captured]);
  const chatMessages = capturedText ? parseChatMessages(capturedText) : null;
  const senderColorMap = useMemo(() => chatMessages ? buildSenderColorMap(chatMessages) : new Map(), [chatMessages]);

  const openPreview = useCallback((idx: number) => setPreviewIndex(idx), []);
  const closePreview = useCallback(() => setPreviewIndex(null), []);
  const prevImage = useCallback(() => setPreviewIndex(i => i !== null && i > 0 ? i - 1 : i), []);
  const nextImage = useCallback(() => setPreviewIndex(i => i !== null && i < allImages.length - 1 ? i + 1 : i), [allImages.length]);

  useEffect(() => {
    if (previewIndex === null && !previewItem) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closePreview(); setPreviewItem(null); }
      else if (e.key === 'ArrowLeft') prevImage();
      else if (e.key === 'ArrowRight') nextImage();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewIndex, previewItem, closePreview, prevImage, nextImage]);

  useEffect(() => {
    mountedRef.current = true;
    try {
      const saved = localStorage.getItem('quick_collect_enabled');
      setEnabled(saved === 'true');
    } catch {}
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      setEnabled(customEvent.detail.enabled);
    };
    window.addEventListener('quick-collect-toggle', handler);
    return () => { window.removeEventListener('quick-collect-toggle', handler); mountedRef.current = false; };
  }, []);

  // Resolve a file:// URL or path to a CaptureItem
  const resolveFileItem = useCallback(async (src: string, api: any): Promise<CaptureItem | null> => {
    const fp = src.startsWith('file://') ? fileUrlToPath(src) : src;
    const name = getFileNameFromPath(fp);
    const ext = getFileExt(name);
    const cat = getFileCategory(ext);


    if (cat === 'image' || cat === 'video') {
      if (api?.readLocalFile) {
        const dataUrl = await api.readLocalFile(fp);
        if (dataUrl) return { type: cat, content: dataUrl };
      }
      return null;
    }

    let dataUrl: string | null = null;
    if (api?.readLocalFile) {
      dataUrl = await api.readLocalFile(fp);
    }
    return { type: 'file', content: dataUrl || fp, name, size: undefined };
  }, []);

  // Parse HTML into ordered CaptureItem[]
  // Strategy: use plainText as primary content source, HTML only for media extraction
  // clipboardFiles: pre-resolved file data from readClipboardFiles IPC (to replace placeholders)
  const parseHtmlToItems = useCallback(async (html: string, plainText: string, api: any, clipboardFiles?: any[]): Promise<CaptureItem[]> => {
    // 1. Clean HTML: normalize &nbsp; and <br> for consistent processing
    const cleanedHtml = html
      .replace(/&nbsp;/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/ /g, ' ');

    // 2. Extract media URLs from HTML
    const mediaUrls: string[] = [];
    const imgRx = /<img[^>]+src\s*=\s*["']([^"']+?)["']/gi;
    let m;
    while ((m = imgRx.exec(cleanedHtml)) !== null) {
      if (m[1]) mediaUrls.push(m[1]);
    }
    const videoRx = /<(?:video|source)[^>]+src\s*=\s*["']([^"']+?)["']/gi;
    while ((m = videoRx.exec(cleanedHtml)) !== null) {
      if (m[1]) mediaUrls.push(m[1]);
    }
    const linkRx = /<a[^>]+href\s*=\s*["'](file:\/\/[^"']+)["']/gi;
    while ((m = linkRx.exec(cleanedHtml)) !== null) {
      if (m[1]) mediaUrls.push(m[1]);
    }

    // 3. Resolve media URLs to CaptureItems
    const resolvedMedia: CaptureItem[] = [];
    for (const url of mediaUrls) {
      if (url.startsWith('data:')) {
        resolvedMedia.push({ type: 'image', content: url });
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        resolvedMedia.push({ type: 'image', content: url });
      } else if (url.startsWith('file://') && api?.readLocalFile) {
        const item = await resolveFileItem(url, api);
        if (item) resolvedMedia.push(item);
      } else {
      }
    }

    // 4. Build items: use plainText unless HTML contains table/video structures
    // (plainText flattens tables & can't represent video; HTML-only walk() handles both)
    // Pre-index clipboardFiles by type for in-place replacement
    const cfVideos = (clipboardFiles || []).filter((f: any) => f.type === 'video');
    const cfFiles = (clipboardFiles || []).filter((f: any) => f.type === 'file');
    let cfVideoIdx = 0;
    let cfFileIdx = 0;

    const hasTableOrVideo = /<table\b|<video\b/i.test(cleanedHtml);
    if (plainText && !hasTableOrVideo) {
      const lines = plainText.split('\n');
      let mediaIdx = 0;
      // Track if any text markers were actually consumed
      let markersConsumed = false;
      const items: CaptureItem[] = [];
      // Regex for [文件:filename] or [文件：filename] (half-width or full-width colon)
      const fileMarkerRx = /^\[文件[：:](.+?)\]$/;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check for [文件:filename] marker — use clipboardFiles data if available
        const fileMatch = trimmed.match(fileMarkerRx);
        if (fileMatch) {
          const fileName = fileMatch[1].trim();
          if (cfFileIdx < cfFiles.length) {
            const cf = cfFiles[cfFileIdx++];
            items.push({ type: 'file', content: cf.dataUrl || cf.content || cf.path || '', name: cf.name || fileName, size: cf.size, path: cf.path });
          } else {
            items.push({ type: 'file', content: '', name: fileName, size: undefined });
          }
          continue;
        }

        // Replace [图片] / [视频] markers with resolved media from HTML or clipboardFiles
        if (trimmed === '[图片]' || trimmed === '[视频]') {
          const markerType = trimmed === '[图片]' ? 'image' : 'video';
          if (markerType === 'video' && cfVideoIdx < cfVideos.length) {
            // Use pre-resolved video data from clipboardFiles IPC
            const vf = cfVideos[cfVideoIdx++];
            items.push({ type: 'video', content: vf.dataUrl || vf.content, name: vf.name, size: vf.size, path: vf.path });
            mediaIdx++; markersConsumed = true;
          } else if (mediaIdx < resolvedMedia.length) {
            items.push(resolvedMedia[mediaIdx]);
            mediaIdx++; markersConsumed = true;
          } else {
            // No actual media data — create placeholder item
            items.push({ type: markerType, content: '' });
            mediaIdx++;
          }
        } else if (trimmed.includes('[图片]') || trimmed.includes('[视频]')) {
          // Line contains mixed text and media markers
          const parts = trimmed.split(/(\[图片\]|\[视频\])/);
          for (const part of parts) {
            if (part === '[图片]' || part === '[视频]') {
              const markerType = part === '[图片]' ? 'image' : 'video';
          if (markerType === 'video' && cfVideoIdx < cfVideos.length) {
            const vf = cfVideos[cfVideoIdx++];
            items.push({ type: 'video', content: vf.dataUrl || vf.content, name: vf.name, size: vf.size, path: vf.path });
            mediaIdx++; markersConsumed = true;
          } else if (mediaIdx < resolvedMedia.length) {
            items.push(resolvedMedia[mediaIdx]);
            mediaIdx++; markersConsumed = true;
          } else {
            items.push({ type: markerType, content: '' });
            mediaIdx++;
          }
            } else if (part.trim()) {
              items.push({ type: 'text', content: part });
            }
          }
        } else {
          items.push({ type: 'text', content: trimmed });
        }
      }

      // Only append remaining resolvedMedia if text markers were consumed (avoids web-page images at bottom)
      if (markersConsumed) {
        while (mediaIdx < resolvedMedia.length) {
          items.push(resolvedMedia[mediaIdx]);
          mediaIdx++;
        }
      }
      // Clipboard files from IPC always append (they're from WXWork/WeChat, not web)
      while (cfVideoIdx < cfVideos.length) {
        const vf = cfVideos[cfVideoIdx++];
        items.push({ type: 'video', content: vf.dataUrl || vf.content, name: vf.name, size: vf.size, path: vf.path });
      }
      while (cfFileIdx < cfFiles.length) {
        const cf = cfFiles[cfFileIdx++];
        items.push({ type: 'file', content: cf.dataUrl || cf.content || cf.path || '', name: cf.name, size: cf.size, path: cf.path });
      }

      return items;
    }

    // 5. No plain text: fall back to HTML-only parsing
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanedHtml, 'text/html');
    const body = doc.body;
    const items: CaptureItem[] = [];
    const BLOCK_TAGS = ['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'tr', 'section', 'article'];
    const SKIP_TAGS = ['script', 'style', 'noscript', 'head', 'meta', 'link', 'title'];

    const walk = async (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent || '').replace(/ /g, ' ').trim();
        if (t) items.push({ type: 'text', content: t });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (SKIP_TAGS.includes(tag)) return;
        if (tag === 'a') {
          const href = el.getAttribute('href');
          const text = (el.textContent || '').trim();
          if (href && /^https?:\/\//.test(href)) {
            items.push({ type: 'text', content: text + '\n' + href });
          } else if (text) {
            items.push({ type: 'text', content: text });
          }
          return;
        }
        if (tag === 'img') {
          const src = el.getAttribute('src');
          if (src && src.startsWith('file://') && api?.readLocalFile) {
            const resolved = await resolveFileItem(src, api);
            if (resolved) items.push(resolved);
            else items.push({ type: 'image', content: src });
          } else if (src) {
            items.push({ type: 'image', content: src });
          }
          return;
        }
        if (tag === 'video') {
          const src = el.getAttribute('src') || el.querySelector('source')?.getAttribute('src');
          if (src) {
            if (src.startsWith('file://')) {
              const resolved = await resolveFileItem(src, api);
              if (resolved) items.push(resolved);
              else items.push({ type: 'video', content: src });
            } else {
              items.push({ type: 'video', content: src });
            }
          }
          return;
        }
        if (tag === 'table') {
          const rows: string[][] = [];
          const headers: string[] = [];
          for (const tr of Array.from(el.querySelectorAll('tr'))) {
            const cells: string[] = [];
            for (const cell of Array.from(tr.children)) {
              const isHeader = cell.tagName === 'TH';
              const text = (cell.textContent || '').trim();
              cells.push(text);
              if (isHeader && headers.length === 0) headers.push(text);
            }
            if (cells.length > 0) rows.push(cells);
          }
          items.push({ type: 'table', content: '', rows, headers: headers.length > 0 ? headers : undefined });
          return; // don't recurse into table children
        }
        for (const child of Array.from(el.childNodes)) await walk(child);
        if (BLOCK_TAGS.includes(tag)) {
          const last = items[items.length - 1];
          if (last?.type === 'text' && !last.content.endsWith('\n')) {
            last.content += '\n';
          }
        }
      }
    };

    for (const child of Array.from(body.childNodes)) await walk(child);

    // Merge adjacent text items
    const merged: CaptureItem[] = [];
    for (const item of items) {
      const last = merged[merged.length - 1];
      if (item.type === 'text' && last?.type === 'text') {
        last.content += item.content;
      } else {
        merged.push(item);
      }
    }

    const cleaned = merged.filter(item => item.type !== 'text' || item.content.trim());
    return cleaned;
  }, [resolveFileItem]);

  // Paste handler
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const api = (window as any).electronAPI;

      let text = '', html = '';
      try { text = dt.getData('text/plain') || ''; } catch {}
      try { html = dt.getData('text/html') || ''; } catch {}
      
      // Diagnostic: log what browser event gives us
      const dtTypes = dt.types ? Array.from(dt.types) : [];
      console.log('[qc-diag] browser paste — dt.types:', dtTypes, '| text-len:', text.length, '| html-len:', html.length);

      // Fallback: use Electron IPC for text/HTML if browser paste has none
      // (WeCom uses custom clipboard formats that browser ClipboardEvent can't read)
      if (!text && api?.readClipboardText) {
        try { text = await api.readClipboardText() || ''; } catch {}
      }
      if (!html && api?.readClipboardHTML) {
        try { html = await api.readClipboardHTML() || ''; } catch {}
      }

      // Grab raw blobs from clipboard items
      const rawBlobs: { type: 'image' | 'video'; blob: Blob }[] = [];
      if (dt.items) {
        for (const item of Array.from(dt.items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) rawBlobs.push({ type: 'image', blob: file });
          } else if (item.type.startsWith('video/')) {
            const file = item.getAsFile();
            if (file) rawBlobs.push({ type: 'video', blob: file });
          }
        }
      }

      const blobToDataUrl = (blob: Blob): Promise<string> =>
        new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });

      let newItems: CaptureItem[] = [];


      // Handle Files-type clipboard (WeChat/WeCom video/file paste: dt.types=['Files'])
      // Browser provides file references directly — no need for backend IPC
      const pasteFiles: CaptureItem[] = [];
      console.log('[qc-diag] dt.files:', dt.files ? dt.files.length : 'null', 'dt.types:', dtTypes);
      if (dt.files && dt.files.length > 0) {
        for (const f of Array.from(dt.files)) {
          const name = f.name || '文件';
          const ext = getFileExt(name);
          const cat = getFileCategory(ext);
          if (cat === 'video') {
            // Read video file as data URL for preview
            const dataUrl = await new Promise<string>(resolve => {
              const r = new FileReader();
              r.onload = () => resolve(r.result as string);
              r.onerror = () => resolve('');
              r.readAsDataURL(f);
            });
            pasteFiles.push({ type: 'video', content: dataUrl, name, size: f.size });
          } else if (cat === 'image') {
            const dataUrl = await new Promise<string>(resolve => {
              const r = new FileReader();
              r.onload = () => resolve(r.result as string);
              r.onerror = () => resolve('');
              r.readAsDataURL(f);
            });
            pasteFiles.push({ type: 'image', content: dataUrl, name, size: f.size });
          } else {
            const dataUrl = await new Promise<string>(resolve => {
              const r = new FileReader();
              r.onload = () => resolve(r.result as string);
              r.onerror = () => resolve('');
              r.readAsDataURL(f);
            });
            pasteFiles.push({ type: 'file', content: dataUrl, name, size: f.size });
          }
        }
        console.log('[qc-diag] pasteFiles from dt.files:', pasteFiles.length, pasteFiles.map(p => p.type + ':' + (p.name || '?')));
      }

      // Pre-read clipboardFiles for in-place placeholder replacement
      let clipboardFilesData: any[] = [];
      if (api?.readClipboardFiles) {
        try {
          const cfResult = await api.readClipboardFiles();
          if (Array.isArray(cfResult)) clipboardFilesData = cfResult;
        } catch {}
      }

      // Fallback: navigator.clipboard.read() — works for Files-type paste (WeChat video)
      // Run when we have no usable media data from other sources
      const hasUsableMedia = clipboardFilesData.some((f: any) => f.dataUrl) || rawBlobs.length > 0;
      if (!hasUsableMedia && navigator.clipboard?.read) {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            for (const type of item.types) {
              if (type.startsWith('video/')) {
                const blob = await item.getType(type);
                const dataUrl = await blobToDataUrl(blob);
                if (dataUrl) {
                  rawBlobs.push({ type: 'video', blob });
                  console.log('[qc-diag] clipboard.read video:', type, 'size:', blob.size);
                }
              } else if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                rawBlobs.push({ type: 'image', blob });
              }
            }
          }
        } catch {}
      }

      if (html) {
        newItems = await parseHtmlToItems(html, text, api, clipboardFilesData);
      }

      // Directly use clipboardFilesData when no text/html (Files-type paste: WeChat video)
      if (newItems.length === 0 && clipboardFilesData.length > 0) {
        for (const cf of clipboardFilesData) {
          if (cf.type === 'video' && cf.dataUrl) {
            newItems.push({ type: 'video', content: cf.dataUrl, name: cf.name, size: cf.size, path: cf.path });
          } else if (cf.type === 'image' && cf.dataUrl) {
            newItems.push({ type: 'image', content: cf.dataUrl, name: cf.name, size: cf.size });
          } else if (cf.type === 'file') {
            newItems.push({ type: 'file', content: cf.dataUrl || cf.path || '', name: cf.name, size: cf.size, path: cf.path });
          }
        }
        console.log('[qc-diag] created items from clipboardFilesData:', newItems.length);
      }

      if (newItems.length === 0 && text) {
        const fileItems = await resolveTextFileItems(text, api);
        if (fileItems) {
          newItems = fileItems;
        } else {
          newItems.push({ type: 'text', content: text });
        }
      }

      // Merge Files-type paste items (from dt.files, e.g. WeChat video)
      if (pasteFiles.length > 0) {
        newItems = [...newItems, ...pasteFiles];
      }

      // Fallback: check native clipboard files for videos/files that HTML didn't capture
      // Replace empty placeholders IN-PLACE instead of appending
      const emptyMediaItems = newItems.filter(i => (i.type === 'video' || i.type === 'file') && !i.content);
      if (emptyMediaItems.length > 0 && clipboardFilesData.length > 0) {
        try {
          const mediaFiles = clipboardFilesData.filter((f: any) =>
            typeof f === 'object' && (f.type === 'video' || f.type === 'file') && f.dataUrl
          );
          let vidIdx = 0;
          newItems = newItems.map(item => {
            if ((item.type === 'video' || item.type === 'file') && !item.content && vidIdx < mediaFiles.length) {
              const vf = mediaFiles[vidIdx++];
              return { type: vf.type, content: vf.dataUrl || vf.content, name: vf.name, size: vf.size, path: vf.path };
            }
            return item;
          });
        } catch {}
      }

      for (const rb of rawBlobs) {
        const dataUrl = await blobToDataUrl(rb.blob);
        if (dataUrl) newItems.push({ type: rb.type, content: dataUrl });
      }

      console.log('[qc-diag] final items:', newItems.length, 'types:', newItems.map(i => i.type + (i.name ? ':' + i.name : '')).join(', '));

      if (newItems.length === 0) { console.log('[qc-diag] no items, abort'); return; }

      if (!mountedRef.current) return;
      setCaptured(prev => ({
        items: [...(prev?.items || []), ...newItems],
      }));
      setShowModal(true);
      setDesc('');
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [parseHtmlToItems]);

  // Float button click handler
  const handleFloatClick = async () => {
    try {
      const api = (window as any).electronAPI;
      let text = '';
      const images: string[] = [];
      const fileItems: CaptureItem[] = [];

      // 1. Read images/media via Electron native clipboard
      if (api?.readClipboardImages) {
        try {
          const nativeImages = await api.readClipboardImages();
          if (Array.isArray(nativeImages)) images.push(...nativeImages.filter(Boolean));
        } catch {}
      }

      // 2. Read file references from clipboard (now returns structured objects with dataUrl)
      if (api?.readClipboardFiles) {
        try {
          const files = await api.readClipboardFiles();
          if (Array.isArray(files)) {
            for (const f of files) {
              if (!f) continue;
              // New format: { path, name, type, dataUrl, size }
              if (typeof f === 'object' && f.type) {
                if (f.dataUrl) {
                  // Has data — directly add as CaptureItem
                  if (f.type === 'video') {
                    fileItems.push({ type: 'video', content: f.dataUrl, name: f.name, size: f.size, path: f.path });
                  } else if (f.type === 'image') {
                    if (!images.includes(f.dataUrl)) images.push(f.dataUrl);
                  } else {
                    fileItems.push({ type: 'file', content: f.dataUrl, name: f.name, size: f.size, path: f.path });
                  }
                } else if (f.path) {
                  // Has path but no dataUrl — resolve via readLocalFile
                  const item = await resolveFileItem(f.path, api);
                  if (item) { item.path = f.path; fileItems.push(item); }
                } else {
                  // No data, no path — placeholder
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
        } catch {}
      }

      // 3. Read text
      if (api?.readClipboardText) {
        try { text = await api.readClipboardText() || ''; } catch {}
      }

      // 4. Read HTML for ordered content (pass clipboardFiles for in-place placeholder replacement)
      let htmlItems: CaptureItem[] = [];
      if (api?.readClipboardHTML) {
        try {
          const html = await api.readClipboardHTML();
          if (html) htmlItems = await parseHtmlToItems(html, text, api, fileItems);
        } catch {}
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
              try { text = await (await item.getType('text/plain')).text(); } catch {}
            }
          }
        } catch {}
      }

      // 6. Fallback: browser readText
      if (!text && navigator.clipboard.readText) {
        try { text = await navigator.clipboard.readText() || ''; } catch {}
      }

      if (!text && images.length === 0 && htmlItems.length === 0 && fileItems.length === 0) {
        toast.error('剪贴板为空或无法读取');
        return;
      }

      // Build final items: merge fileItems into htmlItems placeholders IN-PLACE
      let finalItems: CaptureItem[];
      if (htmlItems.length > 0) {
        // Replace empty placeholders in htmlItems with real data from readClipboardFiles
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
        // Check if text contains file paths (e.g. from file explorer copy)
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
      toast.error('无法读取剪贴板');
    }
  };

  const handleUploadFile = async (file: File) => {
    if (file.type.startsWith('image/')) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await apiFetch('/api/documents/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
          setCaptured(prev => prev ? { items: [...prev.items, { type: 'image', content: data.url }] } : null);
          toast.success('图片已添加');
        }
      } catch { toast.error('图片上传失败'); }
    } else if (file.type.startsWith('video/')) {
      const dataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
      if (dataUrl) {
        setCaptured(prev => prev ? { items: [...prev.items, { type: 'video', content: dataUrl }] } : null);
        toast.success('视频已添加');
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
      toast.success('文件已添加');
    }
  };

  const removeItem = (idx: number) => {
    setCaptured(prev => prev ? { items: prev.items.filter((_, i) => i !== idx) } : null);
  };

  const handleDownload = useCallback((item: CaptureItem) => {
    if (!item.content) return;
    // If local file path, open with system
    if (item.path) { (window as any).electronAPI?.openPathExternal?.(item.path); return; }
    downloadFile(item.content, item.name || 'download' + getFileExt(item.name || ''));
  }, []);

  const refreshMainList = () => {
    window.dispatchEvent(new CustomEvent('requirements-changed'));
    (window as any).electronAPI?.notifyRequirementsChanged?.();
  };

  const handleSubmit = async () => {
    const images = allImages.filter(Boolean); // filter out empty strings
    const hasContent = captured?.items.some(i => i.type !== 'text' || i.content.trim()) || desc.trim();
    if (!hasContent) { toast.error('请输入需求描述或添加文件'); return; }

    // Build final items: upload file items first, replace data URLs with persistent URLs
    const finalItems = captured ? [...captured.items] : [];

    // Upload file items and replace content with persistent URLs
    for (const item of finalItems) {
      if (item.type === 'file' && item.content && item.content.startsWith('data:')) {
        try {
          const blob = await fetch(item.content).then(r => r.blob());
          const formData = new FormData();
          formData.append('file', blob, item.name || 'file');
          const res = await apiFetch('/api/documents/upload', { method: 'POST', body: formData });
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
      const res = await apiFetch('/api/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, desc: fullDesc, module, priority, images: compatImages, content_blocks: contentBlocksStr }),
      });
      const result = res.data;
      const extractedId = result?.id;
      if (!extractedId) { toast.error('采集失败 (id=' + extractedId + ')'); return; }
      newId = extractedId;
    } catch (e) { console.error('[qc-submit] save error', e); toast.error('采集失败'); return; }

    try { setShowModal(false); setCaptured(null); setDesc(''); toast.success('需求采集成功'); refreshMainList(); } catch {}

    if (newId) {
      autoAnalyzeRef.current = setTimeout(async () => {
        try {
          const autoEnabled = (() => { try { return localStorage.getItem('ai_auto_analyze') === 'true'; } catch { return false; } })();
          if (!autoEnabled) return;
          const modelsRes = await apiFetch('/api/models');
          const models = modelsRes.data;
          if (Array.isArray(models) && models.some((m: any) => m.enabled)) {
            toast.success('正在 AI 分析...');
            const aRes = await apiFetch(`/api/requirements/${newId}/analyze`, { method: 'POST' });
            const aData = aRes.data;
            if (aData.error) { toast.error(aData.error); return; }
            toast.success('AI 分析完成');
            refreshMainList();
          }
        } catch (e) { console.error('[qc-auto-analyze] error', e); }
      }, 800);
    }
  };

  const isStandalone = !!(window as any).electronAPI?.__isQCPopup;

  return (
    <>
      {!isStandalone && enabled && (
      <button
        onClick={handleFloatClick}
        className="fixed bottom-6 right-6 w-10 h-10 rounded-full flex items-center justify-center shadow-lg z-40 transition-all duration-200 hover:scale-110 opacity-80 hover:opacity-100"
        style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}
        title="快速采集"
      >
        <ClipboardPasteIcon size={20} style={{ color: 'var(--wiki-bg)' }} />
      </button>
      )}

      {(showModal || isStandalone) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: isStandalone ? 'transparent' : 'rgba(0,0,0,0.6)', backdropFilter: isStandalone ? 'none' : 'blur(4px)' }}>
          <div className="w-[672px] max-h-[85vh] overflow-y-auto p-5 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "var(--wiki-text)", color: "var(--wiki-bg)" }}>
                  <SparklesIcon size={14} style={{ color: 'var(--wiki-bg)' }} />
                </div>
                <span className="text-sm font-semibold text-wiki-text">快速采集</span>
              </div>
              {!isStandalone && (
              <button onClick={() => { setShowModal(false); setCaptured(null); setDesc(''); }} className="p-1 rounded-md hover:bg-wiki-surface2">
                <XIcon size={16} style={{ color: 'var(--wiki-text3)' }} />
              </button>
              )}
            </div>

            {/* Mixed content display: items in copy order */}
            {captured && captured.items.length > 0 && (
              <div className="mb-4 p-3 rounded-lg max-h-60 overflow-y-auto" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
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
                              // [图片] marker
                              if (trimmedLine === '[图片]') {
                                const imgIdx = chatMessages.slice(0, i).reduce((n, m) => n + (m.content.match(/\[图片\]/g) || []).length, 0) + j;
                                const img = allImages[Math.min(imgIdx, allImages.length - 1)];
                                return img ? <img key={j} src={img} className="w-12 h-12 rounded object-cover my-1 cursor-pointer hover:opacity-80" onClick={() => openPreview(Math.min(imgIdx, allImages.length - 1))} /> : <div key={j} className="inline-flex items-center gap-1 px-2 py-1 my-0.5 rounded text-[10px]" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text3)', border: '1px solid var(--wiki-border)' }}><ClipboardIcon size={10} /> 图片</div>;
                              }
                              // [视频] marker — click to preview if we have data
                              if (trimmedLine === '[视频]') {
                                // Find matching video item from captured items
                                const videoItemIdx = captured.items.findIndex(it => it.type === 'video' && it.content);
                                if (videoItemIdx >= 0) {
                                  const vi = captured.items[videoItemIdx];
                                  return <div key={j} className="inline-flex items-center gap-1 px-2 py-1 my-0.5 rounded text-[10px] cursor-pointer hover:opacity-80 transition-opacity" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }} onClick={() => setPreviewItem(vi)}>🎥 视频</div>;
                                }
                                return <div key={j} className="inline-flex items-center gap-1 px-2 py-1 my-0.5 rounded text-[10px]" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text3)', border: '1px solid var(--wiki-border)' }}>🎥 视频</div>;
                              }
                              // [文件:filename] marker — click to preview if we have data
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
                      if (item.type === 'text') {
                        return <div key={i} className="text-xs text-wiki-text leading-relaxed whitespace-pre-wrap">{item.content}</div>;
                      }
                      if (item.type === 'image') {
                        if (!item.content) {
                          // Placeholder for image without data
                          return (
                            <div key={i} className="relative group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px]" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text3)', border: '1px solid var(--wiki-border)' }}>
                              <ClipboardIcon size={12} /> 图片
                              <button onClick={() => removeItem(i)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                            </div>
                          );
                        }
                        const imgIdx = captured.items.slice(0, i).filter(it => it.type === 'image' && it.content).length;
                        return (
                          <div key={i} className="relative group inline-flex">
                            <img src={item.content} className="w-16 h-16 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity" style={{ border: '1px solid var(--wiki-border)' }} onClick={() => openPreview(imgIdx)} />
                            <button onClick={() => removeItem(i)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                          </div>
                        );
                      }
                      if (item.type === 'video') {
                        if (!item.content) {
                          // Placeholder for video without data
                          return (
                            <div key={i} className="relative group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px]" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text3)', border: '1px solid var(--wiki-border)' }}>
                              🎥 视频
                              <button onClick={() => removeItem(i)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                            </div>
                          );
                        }
                        // Video thumbnail with click-to-preview
                        return (
                          <div key={i} className="relative group inline-flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} onClick={() => setPreviewItem(item)}>
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
                        return <FileChip key={i} item={item} onRemove={() => removeItem(i)} onPreview={() => setPreviewItem(item)} />;
                      }
                      if (item.type === 'table') {
                        return (
                          <div key={i} className="overflow-x-auto rounded" style={{ border: '1px solid var(--wiki-border)' }}>
                            <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
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
              <button onClick={() => document.getElementById('capture-file-input')?.click()} className="flex items-center gap-2 px-3 py-2 rounded-md text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}>
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
                onClick={() => { if (isStandalone) (window as any).electronAPI?.closeQCForm?.(); else { setShowModal(false); setCaptured(null); setDesc(''); } }}
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={closePreview}>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">{previewIndex + 1} / {allImages.length}</div>
          <button onClick={e => { e.stopPropagation(); closePreview(); }} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl">×</button>
          {allImages.length > 1 && (
            <button onClick={e => { e.stopPropagation(); prevImage(); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
              <ChevronLeftIcon size={24} />
            </button>
          )}
          {allImages.length > 1 && (
            <button onClick={e => { e.stopPropagation(); nextImage(); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
              <ChevronRightIcon size={24} />
            </button>
          )}
          <img src={allImages[previewIndex]} className="max-w-[85vw] max-h-[85vh] rounded-md object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Video / File preview modal — fullscreen */}
      {previewItem && (
        <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: '#1a1a2e' }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-white/80 text-sm truncate max-w-[70%]">{previewItem.name || (previewItem.type === 'video' ? '视频' : '文件')}</div>
            <div className="flex items-center gap-3">
              {/* Download button */}
              {previewItem.content && (
                <button
                  onClick={() => handleDownload(previewItem)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  title="下载文件"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  下载
                </button>
              )}
              <button onClick={() => setPreviewItem(null)} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
            </div>
          </div>
          {/* Content */}
          <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={e => e.stopPropagation()}>
            {previewItem.type === 'video' && previewItem.content && (
              <video src={previewItem.content} controls autoPlay className="max-w-full max-h-full rounded" style={{ background: '#000' }} />
            )}
            {previewItem.type === 'file' && previewItem.content && previewItem.content.startsWith('data:') && (
              <div className="w-full h-full overflow-hidden" style={{ background: '#fff' }}>
                {(() => {
                  const ext = getFileExt(previewItem.name || '');
                  const mime = previewItem.content.match(/^data:([^;]+)/)?.[1] || '';
                  // PDF
                  if (mime === 'application/pdf' || ext === '.pdf') {
                    return <iframe src={previewItem.content} className="w-full h-full border-0" title="PDF Preview" />;
                  }
                  // Image files rendered as file type
                  if (mime.startsWith('image/')) {
                    return <img src={previewItem.content} className="max-w-full max-h-full object-contain mx-auto" alt="Preview" />;
                  }
                  // Text-based files (code, txt, etc. — csv handled by OfficePreview)
                  if (mime.startsWith('text/') || ['.json', '.xml', '.yaml', '.yml', '.md', '.txt', '.log', '.sql', '.sh', '.bat', '.ps1', '.py', '.js', '.ts', '.css', '.html', '.htm'].includes(ext)) {
                    try {
                      const base64 = previewItem.content.split(',')[1];
                      const text = decodeURIComponent(escape(atob(base64)));
                      return <pre className="w-full h-full overflow-auto p-6 text-sm font-mono whitespace-pre-wrap" style={{ color: '#1a1a1a' }}>{text}</pre>;
                    } catch {
                      return <div className="flex items-center justify-center h-full text-gray-500">无法预览此文件</div>;
                    }
                  }
                  // Office documents — render with JS libraries
                  if (DOC_EXTS.includes(ext)) {
                    return <OfficePreview dataUrl={previewItem.content} fileName={previewItem.name} />;
                  }
                  // Archives — show icon + download prompt
                  if (ARCHIVE_EXTS.includes(ext)) {
                    return (
                      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                        <ArchiveIcon size={64} />
                        <div className="text-lg">{previewItem.name || '压缩包'}</div>
                        <div className="text-sm text-gray-400">{previewItem.size != null ? formatFileSize(previewItem.size) : ''}</div>
                        <button onClick={() => handleDownload(previewItem)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm hover:opacity-90 transition-opacity" style={{ background: '#6366f1' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          下载文件
                        </button>
                      </div>
                    );
                  }
                  // Unknown — fallback with download
                  return (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                      <FileIcon size={64} />
                      <div className="text-lg">{previewItem.name || '文件'}</div>
                      <div className="text-sm text-gray-400">{previewItem.size != null ? formatFileSize(previewItem.size) : ''}</div>
                      <button onClick={() => handleDownload(previewItem)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm hover:opacity-90 transition-opacity" style={{ background: '#6366f1' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
