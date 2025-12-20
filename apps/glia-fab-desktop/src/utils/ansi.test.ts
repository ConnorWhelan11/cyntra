import { describe, it, expect } from 'vitest';
import { stripAnsi } from './ansi';

describe('ansi utilities', () => {
  describe('stripAnsi', () => {
    it('should remove ANSI escape codes', () => {
      const input = '\u001b[31mRed text\u001b[0m';
      const expected = 'Red text';

      expect(stripAnsi(input)).toBe(expected);
    });

    it('should handle multiple ANSI codes', () => {
      const input = '\u001b[1m\u001b[31mBold Red\u001b[0m\u001b[32mGreen\u001b[0m';
      const expected = 'Bold RedGreen';

      expect(stripAnsi(input)).toBe(expected);
    });

    it('should handle strings without ANSI codes', () => {
      const input = 'Plain text';

      expect(stripAnsi(input)).toBe(input);
    });

    it('should handle empty strings', () => {
      expect(stripAnsi('')).toBe('');
    });

    it('should handle complex ANSI sequences', () => {
      const input = '\u001b[38;5;226mYellow\u001b[0m \u001b[48;5;18mBlue BG\u001b[0m';
      const expected = 'Yellow Blue BG';

      expect(stripAnsi(input)).toBe(expected);
    });
  });
});
