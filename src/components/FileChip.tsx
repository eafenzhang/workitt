import { FileTextIcon, FileIcon, ArchiveIcon, CodeIcon } from 'lucide-react';

// File extension constants (shared across the app)
export const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.m4v'];
export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff'];
export const ARCHIVE_EXTS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz', '.z01', '.z02'];
export const DOC_EXTS = ['.doc', '.docx', '.pdf', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.rtf', '.odt', '.ods', '.odp'];
export const CODE_EXTS = ['.html', '.htm', '.md', '.markdown', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.conf', '.log', '.sql', '.sh', '.bat', '.ps1', '.py', '.js', '.ts', '.css', '.less', '.scss'];

/** Get file extension from filename */
export function getFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.substring(idx).toLowerCase() : '';
}

/** Categorize file by extension */
export function getFileCategory(ext: string): 'image' | 'video' | 'archive' | 'doc' | 'code' | 'file' {
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (ARCHIVE_EXTS.includes(ext)) return 'archive';
  if (DOC_EXTS.includes(ext)) return 'doc';
  if (CODE_EXTS.includes(ext)) return 'code';
  return 'file';
}

/** Format bytes to human-readable size */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/** Category icon and color mappings */
const categoryIcons: Record<string, typeof FileIcon> = {
  archive: ArchiveIcon,
  doc: FileTextIcon,
  code: CodeIcon,
  file: FileIcon,
};
const categoryColors: Record<string, string> = {
  archive: '#f59e0b',
  doc: '#6366f1',
  code: '#10b981',
  file: '#8b5cf6',
};

export interface FileChipProps {
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  onRemove?: () => void;
  onClick?: () => void;
  /** If true, renders as a download link using content as href */
  downloadUrl?: string;
}

/**
 * Shared FileChip component.
 * - When `onRemove` is provided: shows delete button (capture modal mode)
 * - When `downloadUrl` is provided: renders as clickable download link
 * - Otherwise: renders as static display card
 */
export default function FileChip({ fileName, fileSize, mimeType, onRemove, onClick, downloadUrl }: FileChipProps) {
  const ext = getFileExt(fileName || '');
  const cat = getFileCategory(ext);
  const Icon = categoryIcons[cat] || FileIcon;
  const color = categoryColors[cat] || categoryColors.file;

  const content = (
    <div
      data-cmp="FileChip"
      className="relative group inline-flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)', maxWidth: '280px' }}
      onClick={onClick}
    >
      <div
        className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
        style={{ background: color + '20' }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-wiki-text truncate" title={fileName || '未知文件'}>
          {fileName || '未知文件'}
        </div>
        {fileSize != null && (
          <div className="text-[10px] text-wiki-text3">{formatFileSize(fileSize)}</div>
        )}
      </div>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );

  if (downloadUrl) {
    return (
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex"
        style={{ textDecoration: 'none' }}
        download={fileName}
      >
        {content}
      </a>
    );
  }

  return content;
}
