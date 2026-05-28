import type { ContentBlock } from '../types/content';

/** CaptureItem 接口（与 QuickCapture 保持一致） */
interface CaptureItem {
  type: 'text' | 'image' | 'video' | 'file' | 'table';
  content: string;
  name?: string;
  size?: number;
  rows?: string[][];   // 表格数据（二维数组）
  headers?: string[];   // 表头（可选）
}

/** 从 CaptureItem[] 转为 ContentBlock[]（采集提交用） */
export function captureItemsToBlocks(items: CaptureItem[]): ContentBlock[] {
  return items.map((item): ContentBlock => ({
    type: item.type as ContentBlock['type'],
    content: item.content,
    fileName: item.name,
    fileSize: item.size,
    rows: item.rows,
    headers: item.headers,
  }));
}

/** 从 ContentBlock[] 转为 CaptureItem[]（采集弹窗预览用） */
export function blocksToCaptureItems(blocks: ContentBlock[]): CaptureItem[] {
  return blocks.map((block): CaptureItem => ({
    type: block.type as CaptureItem['type'],
    content: block.content,
    name: block.fileName,
    size: block.fileSize,
    rows: block.rows,
    headers: block.headers,
  }));
}

/** 从旧 desc + images 重建 ContentBlock[]（向后兼容） */
export function rebuildBlocksFromLegacy(desc: string, images: string[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (!desc && (!images || images.length === 0)) return blocks;

  const lines = desc.split('\n');
  const attachRx = /^\[附件[：:](.+?)\|(.+?)\]$/;
  const fileMarkerRx = /^\[文件[：:](.+?)\]$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for [附件:name|url] or [附件：name|url]
    const attachMatch = trimmed.match(attachRx);
    if (attachMatch) {
      blocks.push({
        type: 'file',
        content: attachMatch[2],
        fileName: attachMatch[1],
      });
      continue;
    }

    // Check for [文件:filename] or [文件：filename]
    const fileMatch = trimmed.match(fileMarkerRx);
    if (fileMatch) {
      blocks.push({
        type: 'file',
        content: '',
        fileName: fileMatch[1].trim(),
      });
      continue;
    }

    // Regular text
    blocks.push({ type: 'text', content: trimmed });
  }

  // Append images as image blocks
  for (const img of images || []) {
    if (img) {
      blocks.push({ type: 'image', content: img });
    }
  }

  return blocks;
}

/** JSON.stringify 安全序列化 */
export function serializeBlocks(blocks: ContentBlock[]): string {
  try {
    return JSON.stringify(blocks || []);
  } catch {
    return '[]';
  }
}

/** JSON.parse 安全反序列化 */
export function deserializeBlocks(raw: string): ContentBlock[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 判断是否为视频 URL */
export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov|avi|mkv|flv|wmv|m4v)(\?.*)?$/i.test(url) || url.includes('video');
}

/** 判断是否为图片 URL */
export function isImageUrl(url: string): boolean {
  if (!url) return false;
  return /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico|tiff)(\?.*)?$/i.test(url) || /^data:image\//.test(url);
}

/** 获取文件扩展名分类 */
export function getFileCategory(ext: string): 'image' | 'video' | 'archive' | 'doc' | 'code' | 'file' {
  const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff'];
  const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.m4v'];
  const ARCHIVE_EXTS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz', '.z01', '.z02'];
  const DOC_EXTS = ['.doc', '.docx', '.pdf', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.rtf', '.odt', '.ods', '.odp'];
  const CODE_EXTS = ['.html', '.htm', '.md', '.markdown', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.conf', '.log', '.sql', '.sh', '.bat', '.ps1', '.py', '.js', '.ts', '.css', '.less', '.scss'];

  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (ARCHIVE_EXTS.includes(ext)) return 'archive';
  if (DOC_EXTS.includes(ext)) return 'doc';
  if (CODE_EXTS.includes(ext)) return 'code';
  return 'file';
}

/** 从 ContentBlock[] 提取纯文本（用于 desc 兼容字段） */
export function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.type === 'text')
    .map(b => b.content)
    .join('\n');
}

/** 从 ContentBlock[] 提取图片 URL（用于 images 兼容字段） */
export function extractImagesFromBlocks(blocks: ContentBlock[]): string[] {
  return blocks
    .filter(b => b.type === 'image' && b.content)
    .map(b => b.content);
}
