/**
 * Terminal/PTY session types
 */

export interface PtySessionInfo {
  id: string;
  cwd: string | null;
  command: string | null;
}
