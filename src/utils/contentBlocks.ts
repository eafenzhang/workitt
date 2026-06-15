import type { ContentBlock } from '../types/content';

/** CaptureItem 接口（与 QuickCapture 保持一致） */
interface CaptureItem {
  type: 'text' | 'image' | 'video' | 'file' | 'table';
  content: string;
  name?: string;
  size?: number;
  rows?: string[][];
  headers?: string[];
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
    const attachMatch = trimmed.match(attachRx);
    if (attachMatch) {
      blocks.push({ type: 'file', content: attachMatch[2], fileName: attachMatch[1] });
      continue;
    }
    const fileMatch = trimmed.match(fileMarkerRx);
    if (fileMatch) {
      blocks.push({ type: 'file', content: '', fileName: fileMatch[1].trim() });
      continue;
    }
    // [视频] marker — create video block (without content for legacy data)
    if (trimmed === '[视频]') {
      blocks.push({ type: 'video', content: '' });
      continue;
    }
    blocks.push({ type: 'text', content: trimmed });
  }
  for (const img of images || []) {
    if (img) blocks.push({ type: 'image', content: img });
  }
  return blocks;
}

/** 从 ContentBlock[] 提取纯文本（用于 desc 兼容字段） */
export function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks.filter(b => b.type === 'text').map(b => b.content).join('\n');
}

/** 从 ContentBlock[] 提取图片 URL（用于 images 兼容字段） */
export function extractImagesFromBlocks(blocks: ContentBlock[]): string[] {
  return blocks.filter(b => b.type === 'image' && b.content).map(b => b.content);
}
