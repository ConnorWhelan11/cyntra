/**
 * ANSI escape sequence utilities
 */

export const ANSI_ESCAPE_PATTERN =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Strip ANSI escape codes from a string
 * @param value - String with ANSI codes
 * @returns String without ANSI codes
 */
export function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}
