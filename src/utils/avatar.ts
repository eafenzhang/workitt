/**
 * Extract the first display character from a nickname.
 * - Chinese: first character (e.g. "张三" → "张")
 * - English: first uppercase letter (e.g. "Alice" → "A")
 * - Emoji: first grapheme (e.g. "😀👍" → "😀")
 * - Fallback: "?"
 */
export function getAvatarChar(nickname: string): string {
  if (!nickname) return '?';
  const trimmed = nickname.trim();
  if (!trimmed) return '?';
  // Use spread to safely get the first Unicode grapheme cluster
  const first = [...trimmed][0];
  if (!first) return '?';
  // Chinese character range
  if (/[\u4e00-\u9fff]/.test(first)) return first;
  // Return uppercase for ASCII letters
  return first.toUpperCase();
}
