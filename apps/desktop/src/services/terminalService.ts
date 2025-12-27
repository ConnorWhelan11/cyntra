/**
 * Terminal/PTY-related Tauri IPC service
 */

import { invoke } from "@tauri-apps/api/core";
import type { PtySessionInfo } from "@/types";

export async function createPty(params: {
  cwd: string | null;
  cols: number;
  rows: number;
}): Promise<string> {
  return invoke<string>("pty_create", { params });
}

export async function listPty(): Promise<PtySessionInfo[]> {
  return invoke<PtySessionInfo[]>("pty_list");
}

export async function writePty(params: { sessionId: string; data: string }): Promise<void> {
  return invoke("pty_write", { params });
}

export async function resizePty(params: {
  sessionId: string;
  cols: number;
  rows: number;
}): Promise<void> {
  return invoke("pty_resize", { params });
}

export async function killPty(sessionId: string): Promise<void> {
  return invoke("pty_kill", { params: { sessionId } });
}
