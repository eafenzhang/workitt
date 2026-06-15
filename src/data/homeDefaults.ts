export const WELCOME_MESSAGES: string[] = [
  '有什么我可以帮你的？',
  '今天想做什么？',
  '开始新的一天，从需求开始',
  '知识沉淀，从这里开始',
];

/** Return a time-based greeting string, optionally with a name */
export function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  let prefix = '上午好';
  if (hour < 6) prefix = '夜深了';
  else if (hour < 12) prefix = '上午好';
  else if (hour < 14) prefix = '中午好';
  else if (hour < 18) prefix = '下午好';
  else prefix = '晚上好';
  return name ? `${prefix}，${name}` : `${prefix}`;
}

/** Format today's date as Chinese locale date string */
export function getTodayDate(): string {
  const now = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const w = weekdays[now.getDay()];
  return `${y}年${m}月${d}日 星期${w}`;
}

/** Generate a unique ID for chat messages */
export function generateMessageId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
