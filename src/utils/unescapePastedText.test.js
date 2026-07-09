import { unescapePastedText } from './unescapePastedText';

describe('unescapePastedText', () => {
  test('converts single-line escaped newlines to real line breaks', () => {
    const input = '# Title\\n\\nHello **world**\\n- item';
    expect(unescapePastedText(input)).toBe('# Title\n\nHello **world**\n- item');
  });

  test('leaves multi-line pastes unchanged', () => {
    const input = '# Title\n\nHello';
    expect(unescapePastedText(input)).toBe(input);
  });

  test('leaves plain single-line text unchanged', () => {
    expect(unescapePastedText('hello world')).toBe('hello world');
  });

  test('strips wrapping JSON quotes then unescapes', () => {
    const input = '"# Title\\n\\nBody"';
    expect(unescapePastedText(input)).toBe('# Title\n\nBody');
  });

  test('preserves escaped backslash before n (\\\\n)', () => {
    // \\n in source → after protect, should become \n (backslash + n), not newline
    const input = 'path\\\\nname';
    expect(unescapePastedText(input)).toBe('path\\nname');
  });

  test('converts tabs', () => {
    expect(unescapePastedText('a\\tb')).toBe('a\tb');
  });
});
