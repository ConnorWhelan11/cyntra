/**
 * Tag-related utilities
 */

export const ESCALATION_TAGS = new Set([
  'escalation',
  'needs-human',
  '@human-escalated',
  'human-escalated',
]);

/**
 * Remove escalation tags from a tag list
 * @param tags - Array of tags
 * @returns Array without escalation tags
 */
export function stripEscalationTags(tags: string[] | null | undefined): string[] {
  return (tags ?? []).filter((tag) => !ESCALATION_TAGS.has(tag));
}

/**
 * Parse comma or newline-separated tags input
 * @param raw - Raw input string
 * @returns Array of trimmed, non-empty tags
 */
export function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,\n]/g)
    .map((t) => t.trim())
    .filter(Boolean);
}
