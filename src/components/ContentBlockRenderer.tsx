import { useState, useEffect, useCallback, lazy, Suspense, useMemo, memo } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, FileTextIcon } from 'lucide-react';
import type { ContentBlock } from '../types/content';
import FileChip, { getFileExt, DOC_EXTS } from './FileChip';
import { downloadFile } from '../utils/download';

const OfficePreview = lazy(() => import('./OfficePreview'));

// ========== URL regex for auto-detection ==========
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

// ========== Internal sub-components ==========

/** Render plain text with URL auto-detection as clickable links */
function TextBlock({ block }: { block: ContentBlock }) {
  if (!block.content) {
    return <div className="text-xs text-wiki-text3 italic">（空内容）</div>;
  }

  const parts = block.content.split(URL_REGEX);

  if (block.chatFormat && block.sender) {
    // Chat bubble mode
    return (
      <div className="flex flex-col mb-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium" style={{ color: '#6366f1' }}>
            {block.sender}
          </span>
          {block.timestamp && (
            <span className="text-[10px] text-wiki-text3">{block.timestamp}</span>
          )}
        </div>
        <div
          className="text-xs text-wiki-text leading-relaxed whitespace-pre-wrap pl-2 border-l-2"
          style={{ borderColor: '#6366f140' }}
        >
          {parts.map((part, i) =>
            /^https?:\/\//.test(part) ? (
              <a
                key={i}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline hover:text-blue-400 break-all"
              >
                {part}
              </a>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </div>
      </div>
    );
  }

  // Plain text mode
  return (
    <div className="text-sm text-wiki-text2 leading-relaxed whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline hover:text-blue-400 break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </div>
  );
}

/** Render image thumbnail with click-to-open-lightbox */
function ImageBlock({
  block,
  imageIndex,
  onImageClick,
}: {
  block: ContentBlock;
  imageIndex: number;
  onImageClick?: (index: number) => void;
}) {
  if (!block.content) {
    // Placeholder for missing image data
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px]"
        style={{
          background: 'var(--wiki-surface)',
          color: 'var(--wiki-text3)',
          border: '1px solid var(--wiki-border)',
        }}
      >
        🖼 图片
      </div>
    );
  }

  return (
    <img
      src={block.content}
      alt={block.fileName || '图片'}
      className="w-20 h-16 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
      style={{ border: '1px solid var(--wiki-border)' }}
      onClick={() => onImageClick?.(imageIndex)}
    />
  );
}

/** Render video player — click to fullscreen */
function VideoBlock({ block }: { block: ContentBlock }) {
  const [fullscreen, setFullscreen] = useState(false);

  if (!block.content) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px]"
        style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text3)', border: '1px solid var(--wiki-border)' }}
        title="剪贴板未包含视频数据，请手动上传视频文件"
      >
        🎥 视频（无数据）
      </div>
    );
  }

  const isDataUrl = block.content.startsWith('data:');

  return (
    <>
      <div className="relative group max-w-full cursor-pointer" style={{ maxWidth: '480px' }} onClick={() => setFullscreen(true)}>
        <video
          key={block.content?.substring(0, 40)}
          src={block.content}
          controls
          preload="metadata"
          crossOrigin={isDataUrl ? undefined : 'anonymous'}
          className="rounded max-w-full pointer-events-none"
          style={{ border: '1px solid var(--wiki-border)', maxHeight: '320px', width: '100%' }}
          onError={(e) => {
            const el = e.currentTarget;
            el.style.display = 'none';
            const fallback = el.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = 'flex';
          }}
        >
          您的浏览器不支持视频播放
        </video>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21" /></svg>
          </div>
        </div>
        <div
          className="hidden items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px]"
          style={{ background: 'var(--wiki-surface)', color: '#ef4444', border: '1px solid #ef444430' }}
        >
          ⚠️ 视频加载失败 — {block.content?.startsWith('data:') ? '数据不完整' : 'URL 不可访问或跨域限制'}
        </div>
      </div>

      {/* Fullscreen overlay */}
      {fullscreen && (
        <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: '#000' }}>
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="text-white/60 text-sm truncate">{block.fileName || '视频'}</div>
            <button onClick={() => setFullscreen(false)} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <video src={block.content} controls autoPlay className="max-w-full max-h-full" />
          </div>
        </div>
      )}
    </>
  );
}

/** Render file card with fullscreen modal preview */
function FileBlock({ block }: { block: ContentBlock }) {
  const fname = block.fileName || getFileNameFromUrl(block.content);
  const ext = getFileExt(fname);
  const url = block.content || '';
  const [expanded, setExpanded] = useState(false);
  const [manualDataUrl, setManualDataUrl] = useState<string | null>(null);

  // Resolve preview URL: blob URL for data URLs, direct for HTTP
  const resolveEmbedUrl = (rawUrl: string): string => {
    if (!rawUrl || rawUrl === '') return '';
    if (rawUrl.startsWith('http')) return rawUrl;
    if (rawUrl.startsWith('data:')) {
      try {
        const [hdr, b64] = rawUrl.split(',');
        const mime = (hdr.split(':')[1] || '').split(';')[0] || 'application/pdf';
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: mime });
        return URL.createObjectURL(blob);
      } catch { return rawUrl; }
    }
    return rawUrl;
  };

  const embedUrl = manualDataUrl ? resolveEmbedUrl(manualDataUrl) : resolveEmbedUrl(url);

  const handleDownload = () => downloadFile(url, fname || 'download' + ext);

  // Handle manual file upload
  const handleManualUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setManualDataUrl(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const canPreview = ext === '.pdf' || ['.doc','.docx','.xls','.xlsx','.ppt','.pptx'].includes(ext);
  const hasContent = !!embedUrl;
  const showExpand = canPreview && hasContent;

  // ── Fullscreen preview overlay ──
  const PreviewOverlay = expanded && showExpand ? (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: '#1a1a2e' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="text-white/80 text-sm truncate max-w-[60%]">{fname}</div>
        <div className="flex items-center gap-3">
          <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-white/80 hover:text-white hover:bg-white/10 transition-colors" title="下载">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            下载
          </button>
          <button onClick={() => setExpanded(false)} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* PDF */}
        {ext === '.pdf' && (
          <embed src={embedUrl} type="application/pdf" className="w-full h-full border-0" />
        )}
        {/* Office: data URL — JS render */}
        {['.doc','.docx','.xls','.xlsx','.ppt','.pptx'].includes(ext) && url.startsWith('data:') && (
          <div className="w-full h-full" style={{ background: '#fff' }}>
            <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-400 text-sm">加载预览...</div>}>
              <OfficePreview dataUrl={url} fileName={fname} />
            </Suspense>
          </div>
        )}
        {/* Office: HTTP URL — Google Docs viewer */}
        {['.doc','.docx','.xls','.xlsx','.ppt','.pptx'].includes(ext) && url.startsWith('http') && (
          <iframe src={'https://docs.google.com/viewer?url=' + encodeURIComponent(url) + '&embedded=true'} className="w-full h-full border-0" title={fname} sandbox="allow-scripts allow-same-origin" />
        )}
      </div>
    </div>
  ) : null;

  // ── Chip button ──
  const chipLabel = canPreview && hasContent
    ? '点击预览'
    : canPreview && !hasContent
    ? '剪贴板无文件数据'
    : ext
    ? '下载'
    : '';

  // PDF preview chip
  if (ext === '.pdf' && embedUrl) {
    return (
      <>
        <button onClick={() => setExpanded(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity text-left"
          style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#ef444420' }}>
            <FileTextIcon size={16} style={{ color: '#ef4444' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-wiki-text truncate">{fname}</div>
            <div className="text-[10px] text-wiki-text3">点击全屏预览 PDF</div>
          </div>
        </button>
        {PreviewOverlay}
      </>
    );
  }

  // Office docs with data: URL
  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext) && url.startsWith('data:')) {
    return (
      <>
        <button onClick={() => setExpanded(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity text-left"
          style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#6366f120' }}>
            <FileTextIcon size={16} style={{ color: '#6366f1' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-wiki-text truncate">{fname}</div>
            <div className="text-[10px] text-wiki-text3">点击全屏预览文档</div>
          </div>
        </button>
        {PreviewOverlay}
      </>
    );
  }

  // Office docs: HTTP Google Docs Viewer
  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext) && url.startsWith('http')) {
    return (
      <>
        <button onClick={() => setExpanded(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity text-left"
          style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#6366f120' }}>
            <FileTextIcon size={16} style={{ color: '#6366f1' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-wiki-text truncate">{fname}</div>
            <div className="text-[10px] text-wiki-text3">点击全屏预览（Google Docs）</div>
          </div>
        </button>
        {PreviewOverlay}
      </>
    );
  }

  // PDF/Office with empty content — show manual upload
  if ((ext === '.pdf' || ['.doc','.docx','.xls','.xlsx','.ppt','.pptx'].includes(ext)) && !embedUrl) {
    return (
      <div className="flex flex-col gap-1">
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#f59e0b20' }}>
            <FileTextIcon size={16} style={{ color: '#f59e0b' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-wiki-text truncate">{fname}</div>
            <div className="text-[10px] text-wiki-text3">剪贴板无文件数据</div>
          </div>
          <button
            onClick={handleManualUpload}
            className="px-2 py-1 rounded text-[11px] text-white flex-shrink-0 hover:opacity-80"
            style={{ background: '#6366f1' }}
          >
            上传文件
          </button>
        </div>
        {manualDataUrl && (
          <embed
            src={embedUrl}
            type="application/pdf"
            className="rounded w-full"
            style={{ border: '1px solid var(--wiki-border)', height: '500px' }}
          />
        )}
      </div>
    );
  }

  // Images / videos / archives / code / other — use FileChip download link
  return (
    <FileChip
      fileName={fname}
      fileSize={block.fileSize}
      mimeType={block.mimeType}
      downloadUrl={url || undefined}
    />
  );
}

/** Render table block */
function TableBlock({ block }: { block: ContentBlock }) {
  const rows = block.rows || [];
  if (rows.length === 0) return <div className="text-xs text-wiki-text3 italic">（空表格）</div>;
  const hasHeaders = block.headers && block.headers.length > 0;
  return (
    <div className="overflow-x-auto rounded" style={{ border: '1px solid var(--wiki-border)' }}>
      <table className="w-full text-xs text-wiki-text2" style={{ borderCollapse: 'collapse' }}>
        {hasHeaders && (
          <thead>
            <tr style={{ background: 'var(--wiki-surface2)' }}>
              {block.headers!.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-wiki-text" style={{ borderBottom: '2px solid var(--wiki-border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--wiki-surface)' }}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5" style={{ borderBottom: '1px solid var(--wiki-border)' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Extract filename from URL */
function getFileNameFromUrl(url: string): string {
  if (!url) return '未知文件';
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1] || url);
  } catch {
    // Not a valid URL, try extracting from path
    const parts = url.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || '未知文件';
  }
}

// ========== Main exported component ==========

export interface ContentBlockRendererProps {
  /** Ordered content blocks to render */
  blocks: ContentBlock[];
  /** Callback when an image is clicked (for parent-controlled lightbox) */
  onImageClick?: (index: number) => void;
  /** Pre-built list of all image URLs (for lightbox navigation) */
  imageList?: string[];
}

/**
 * Shared content block renderer.
 * Renders ContentBlock[] in sequential order.
 * Supports text (with URL detection), image (with lightbox), video, and file blocks.
 *
 * Used by both QuickCapture preview and Requirements detail page.
 */
export default memo(function ContentBlockRenderer({
  blocks,
  onImageClick,
  imageList,
}: ContentBlockRendererProps) {
  // Internal lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Compute all image URLs from blocks for lightbox navigation
  const allImageUrls = useMemo(
    () =>
      imageList ||
      blocks.filter((b) => b.type === 'image' && b.content).map((b) => b.content),
    [imageList, blocks]
  );

  // Build a map: image block index → global image URL index
  const imageIndexMap = useMemo(() => {
    const map: number[] = [];
    let globalImgIdx = 0;
    for (const block of blocks) {
      if (block.type === 'image' && block.content) {
        map.push(globalImgIdx);
        globalImgIdx++;
      } else if (block.type === 'image') {
        map.push(-1);
      }
    }
    return map;
  }, [blocks]);

  const openLightbox = useCallback(
    (blockImageIdx: number) => {
      if (onImageClick) {
        onImageClick(blockImageIdx);
      } else {
        const globalIdx = imageIndexMap[blockImageIdx];
        if (globalIdx >= 0) {
          setLightboxIndex(globalIdx);
        }
      }
    },
    [onImageClick, imageIndexMap]
  );

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevImage = useCallback(() => {
    setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);
  const nextImage = useCallback(() => {
    setLightboxIndex((i) =>
      i !== null && i < allImageUrls.length - 1 ? i + 1 : i
    );
  }, [allImageUrls.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') prevImage();
      else if (e.key === 'ArrowRight') nextImage();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIndex, closeLightbox, prevImage, nextImage]);

  if (!blocks || blocks.length === 0) {
    return (
      <div className="text-xs text-wiki-text3 italic py-2">暂无内容</div>
    );
  }

  // Track image block index within the loop
  let imageBlockIdx = 0;

  return (
    <>
      <div data-cmp="ContentBlockRenderer" className="flex flex-col gap-2">
        {blocks.map((block, i) => {
          switch (block.type) {
            case 'text':
              return <TextBlock key={i} block={block} />;

            case 'image': {
              const currentImgIdx = imageBlockIdx++;
              return (
                <ImageBlock
                  key={i}
                  block={block}
                  imageIndex={currentImgIdx}
                  onImageClick={openLightbox}
                />
              );
            }

            case 'video':
              return <VideoBlock key={i} block={block} />;

            case 'file':
              return <FileBlock key={i} block={block} />;

            case 'table':
              return <TableBlock key={i} block={block} />;

            default:
              return null;
          }
        })}
      </div>

      {/* Internal lightbox */}
      {lightboxIndex !== null && allImageUrls.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={closeLightbox}
        >
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {lightboxIndex + 1} / {allImageUrls.length}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl"
          >
            ×
          </button>
          {allImageUrls.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                prevImage();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <ChevronLeftIcon size={24} />
            </button>
          )}
          {allImageUrls.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                nextImage();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <ChevronRightIcon size={24} />
            </button>
          )}
          <img
            src={allImageUrls[lightboxIndex]}
            className="max-w-[85vw] max-h-[85vh] rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
            alt="预览"
          />
        </div>
      )}
    </>
  );
});
