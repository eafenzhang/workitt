export interface ChatMessage {
  sender: string;
  time: string;
  content: string;
}

const SENDER_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6'];

export function senderColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length];
}

/** Assign distinct colors to senders in order of first appearance */
export function buildSenderColorMap(messages: ChatMessage[]): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  for (const msg of messages) {
    if (!map.has(msg.sender)) {
      map.set(msg.sender, SENDER_COLORS[idx % SENDER_COLORS.length]);
      idx++;
    }
  }
  return map;
}

export function parseChatMessages(text: string): ChatMessage[] | null {
  const lines = text.split('\n');
  const messages: ChatMessage[] = [];
  let current: ChatMessage | null = null;
  // Pattern: "姓名 5/27 17:42:18" or "姓名  2025/5/27 17:42:18" (1+ spaces)
  const headerRx = /^(.+?)\s+(\d{1,4}\/\d{1,2}\/?\d{0,2}\s+\d{1,2}:\d{2}:\d{2})\s*$/;
  let headerCount = 0;

  for (const line of lines) {
    const m = line.match(headerRx);
    if (m) {
      headerCount++;
      if (current) messages.push(current);
      current = { sender: m[1].trim(), time: m[2].trim(), content: '' };
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line;
    }
  }
  if (current) messages.push(current);
  // Require at least 2 header lines to consider it a chat conversation
  return headerCount >= 2 ? messages : null;
}
