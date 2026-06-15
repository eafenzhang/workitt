/**
 * Paste handler module for QuickCapture.
 * Extracted from QuickCapture.tsx to keep the component lean.
 *
 * Main export: handlePaste — the paste event handler.
 * Also exports helper functions used by the float-button click handler.
 */
import { getFileExt, getFileCategory } from '../components/FileChip';

// ── Types ──

export interface CaptureItem {
  type: 'text' | 'image' | 'video' | 'file' | 'table';
  content: string; // text content / image dataURL / video dataURL / file dataURL
  name?: string;   // file name (for 'file' type)
  size?: number;   // file size in bytes (for 'file' type)
  path?: string;   // original file path (for 'file'/'video' type, used to open externally)
  rows?: string[][];  // 表格数据（table 类型时）
  headers?: string[]; // 表头（table 类型时可选）
}

export interface CaptureData {
  items: CaptureItem[];
}

// ── Path helpers ──

/**
 * Check if a string looks like a Windows absolute file path.
 * Matches patterns like `C:\...` or `D:/...`.
 * @param s - The string to check
 * @returns true if the string looks like a file path
 */
export function looksLikeFilePath(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  // Windows absolute path: C:\..., D:/...
  if (/^[a-zA-Z]:[\\\/]/.test(t)) return true;
  // UNC path: \\server\share
  if (/^\\\\/.test(t)) return false;
  return false;
}

/**
 * Convert a `file://` URL to a native filesystem path.
 * Handles Windows paths (e.g. `file:///C:/Users/...`).
 * @param url - The file:// URL to convert
 * @returns The native filesystem path
 */
export function fileUrlToPath(url: string): string {
  let fp = url.replace(/^file:\/\//, '').replace(/^localhost\//, '');
  if (/^\/[a-zA-Z]:/.test(fp)) fp = fp.slice(1);
  fp = decodeURIComponent(fp);
  fp = fp.replace(/\//g, String.fromCharCode(92));
  return fp;
}

/**
 * Extract just the filename from a full filesystem path.
 * @param fp - The full filesystem path
 * @returns The filename component (last segment)
 */
export function getFileNameFromPath(fp: string): string {
  const parts = fp.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || fp;
}

// ── Text-file resolution ──

/** Parse text for file paths and convert to CaptureItems. Returns null if no file paths found. */
export async function resolveTextFileItems(text: string, api: any): Promise<CaptureItem[] | null> {
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

// ── File resolution (was useCallback in QuickCapture) ──

/**
 * Resolve a `file://` URL or native filesystem path to a CaptureItem.
 * For images/videos: reads the local file and returns a data URL item.
 * For other files: returns a file-type item with metadata.
 * @param src - The file:// URL or native path to resolve
 * @param api - Electron API bridge for reading local files
 * @returns A CaptureItem or null if resolution fails
 */
export async function resolveFileItem(src: string, api: any): Promise<CaptureItem | null> {
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
}

// ── HTML-to-items parser (was useCallback in QuickCapture) ──

/**
 * Parse HTML clipboard content into ordered CaptureItem[].
 * Strategy: use plainText as primary content source, HTML only for media extraction.
 * @param html - Raw HTML from clipboard
 * @param plainText - Plain text from clipboard
 * @param api - Electron API bridge
 * @param clipboardFiles - Pre-resolved file data from readClipboardFiles IPC (to replace placeholders)
 */
export async function parseHtmlToItems(
  html: string,
  plainText: string,
  api: any,
  clipboardFiles?: any[],
): Promise<CaptureItem[]> {
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
    }
  }

  // 4. Build items: use plainText unless HTML contains table/video structures
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
        return;
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
}

// ── Main paste handler ──

/**
 * Handle the paste event for QuickCapture.
 * Reads clipboard data (text, HTML, files, images, videos) and populates
 * the captured state.
 *
 * @param e - The ClipboardEvent from the 'paste' listener
 * @param api - Electron API bridge (window.electronAPI)
 * @param setCaptured - State setter for captured items
 * @param setShowModal - State setter for modal visibility
 * @param setDesc - State setter for description text (reset to '')
 * @param mountedRef - Ref indicating whether the component is still mounted
 */
export async function handlePaste(
  e: ClipboardEvent,
  api: any,
  setCaptured: (value: React.SetStateAction<CaptureData | null>) => void,
  setShowModal: (value: React.SetStateAction<boolean>) => void,
  setDesc: (value: React.SetStateAction<string>) => void,
  mountedRef: React.MutableRefObject<boolean>,
): Promise<void> {
  const dt = e.clipboardData;
  if (!dt) return;

  let text = '', html = '';
  try { text = dt.getData('text/plain') || ''; } catch { /* ignore */ }
  try { html = dt.getData('text/html') || ''; } catch { /* ignore */ }

  // Diagnostic: log what browser event gives us
  const dtTypes = dt.types ? Array.from(dt.types) : [];
  console.log('[qc-diag] browser paste — dt.types:', dtTypes, '| text-len:', text.length, '| html-len:', html.length);

  // Fallback: use Electron IPC for text/HTML if browser paste has none
  // (WeCom uses custom clipboard formats that browser ClipboardEvent can't read)
  if (!text && api?.readClipboardText) {
    try { text = await api.readClipboardText() || ''; } catch { /* ignore */ }
  }
  if (!html && api?.readClipboardHTML) {
    try { html = await api.readClipboardHTML() || ''; } catch { /* ignore */ }
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
  const pasteFiles: CaptureItem[] = [];
  console.log('[qc-diag] dt.files:', dt.files ? dt.files.length : 'null', 'dt.types:', dtTypes);
  if (dt.files && dt.files.length > 0) {
    for (const f of Array.from(dt.files)) {
      const name = f.name || '文件';
      const ext = getFileExt(name);
      const cat = getFileCategory(ext);
      if (cat === 'video') {
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
    } catch { /* ignore */ }
  }

  // Fallback: navigator.clipboard.read() — works for Files-type paste (WeChat video)
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
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
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
}
