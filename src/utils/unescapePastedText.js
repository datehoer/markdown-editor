/**
 * Turn single-line clipboard text with escape sequences into real multi-line text.
 *
 * Typical case: copy a one-line Markdown payload from JSON/logs/chat where
 * newlines appear as the two characters "\\" + "n" instead of real line breaks.
 *
 * Multi-line pastes (already containing real \\r/\\n) are returned unchanged.
 *
 * @param {string} text
 * @returns {string}
 */
export function unescapePastedText(text) {
  if (!text || typeof text !== 'string') return text;

  // Real newlines already present — do not rewrite
  if (/[\r\n]/.test(text)) return text;

  // Nothing that looks like an escape sequence
  if (!/\\[nrt"'\\]/.test(text)) return text;

  let s = text;

  // Optional wrapping quotes (JSON / JS string literal paste)
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    s = trimmed.slice(1, -1);
  }

  // Unescape: protect real backslashes first so "\\n" stays "\n" (backslash + n)
  const BS = '\uE000'; // private-use placeholder (avoids no-control-regex)
  return s
    .replace(/\\\\/g, BS)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(new RegExp(BS, 'g'), '\\');
}
