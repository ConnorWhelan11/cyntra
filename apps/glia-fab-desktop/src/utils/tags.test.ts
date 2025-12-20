import { describe, it, expect } from 'vitest';
import { stripEscalationTags, parseTagsInput, ESCALATION_TAGS } from './tags';

describe('tag utilities', () => {
  describe('ESCALATION_TAGS', () => {
    it('should contain known escalation tags', () => {
      expect(ESCALATION_TAGS.has('escalation')).toBe(true);
      expect(ESCALATION_TAGS.has('needs-human')).toBe(true);
      expect(ESCALATION_TAGS.has('@human-escalated')).toBe(true);
      expect(ESCALATION_TAGS.has('human-escalated')).toBe(true);
    });
  });

  describe('stripEscalationTags', () => {
    it('should remove escalation tags', () => {
      const tags = ['bug', 'escalation', 'needs-human', 'feature'];
      const result = stripEscalationTags(tags);

      expect(result).toEqual(['bug', 'feature']);
    });

    it('should handle null input', () => {
      expect(stripEscalationTags(null)).toEqual([]);
    });

    it('should handle undefined input', () => {
      expect(stripEscalationTags(undefined)).toEqual([]);
    });

    it('should handle empty array', () => {
      expect(stripEscalationTags([])).toEqual([]);
    });

    it('should preserve non-escalation tags', () => {
      const tags = ['bug', 'feature', 'priority:high'];
      const result = stripEscalationTags(tags);

      expect(result).toEqual(tags);
    });
  });

  describe('parseTagsInput', () => {
    it('should parse comma-separated tags', () => {
      const input = 'tag1, tag2, tag3';
      const result = parseTagsInput(input);

      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should parse newline-separated tags', () => {
      const input = 'tag1\ntag2\ntag3';
      const result = parseTagsInput(input);

      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should parse mixed separators', () => {
      const input = 'tag1, tag2\ntag3, tag4';
      const result = parseTagsInput(input);

      expect(result).toEqual(['tag1', 'tag2', 'tag3', 'tag4']);
    });

    it('should trim whitespace', () => {
      const input = '  tag1  ,   tag2  ';
      const result = parseTagsInput(input);

      expect(result).toEqual(['tag1', 'tag2']);
    });

    it('should filter empty strings', () => {
      const input = 'tag1,,tag2,,,tag3';
      const result = parseTagsInput(input);

      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle empty input', () => {
      expect(parseTagsInput('')).toEqual([]);
    });
  });
});
