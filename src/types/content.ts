/** 内容块类型 */
export type BlockType = 'text' | 'image' | 'video' | 'file' | 'table';

/** 内容块数据 */
export interface ContentBlock {
  type: BlockType;
  content: string;        // text内容 / image URL / video URL / file URL(dataURL或持久URL)
  fileName?: string;      // 文件名（file 类型时必填）
  fileSize?: number;      // 文件字节数
  mimeType?: string;      // MIME 类型，用于区分 doc/pdf/zip
  chatFormat?: boolean;   // 是否为聊天消息格式（text 类型可选）
  sender?: string;        // 发送者（chatFormat=true 时）
  timestamp?: string;     // 消息时间（chatFormat=true 时）
  rows?: string[][];      // 表格数据（二维数组，table 类型时）
  headers?: string[];     // 表头（table 类型时可选）
}

/** 类型守卫：判断是否为有效的 ContentBlock */
export function isContentBlock(obj: unknown): obj is ContentBlock {
  if (!obj || typeof obj !== 'object') return false;
  const b = obj as Record<string, unknown>;
  if (typeof b.type !== 'string' || !['text', 'image', 'video', 'file', 'table'].includes(b.type)) return false;
  if (typeof b.content !== 'string') return false;
  return true;
}

/** 类型守卫：判断 ContentBlock 数组 */
export function isValidContentBlocks(arr: unknown): arr is ContentBlock[] {
  if (!Array.isArray(arr)) return false;
  return arr.every(isContentBlock);
}
