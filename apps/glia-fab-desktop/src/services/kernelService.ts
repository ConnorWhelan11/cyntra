/**
 * Kernel and Beads-related Tauri IPC service
 */

import { invoke } from '@tauri-apps/api/core';
import type { KernelSnapshot, BeadsIssue, BeadsIssuePatch } from '@/types';

export async function kernelSnapshot(params: {
  projectRoot: string;
  limitEvents: number;
}): Promise<KernelSnapshot> {
  return invoke<KernelSnapshot>('kernel_snapshot', { params });
}

export async function beadsInit(projectRoot: string): Promise<void> {
  return invoke('beads_init', { params: { projectRoot } });
}

export async function createIssue(params: {
  projectRoot: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  dkPriority: string | null;
  dkRisk: string | null;
  dkSize: string | null;
  dkToolHint: string | null;
}): Promise<BeadsIssue> {
  return invoke<BeadsIssue>('beads_create_issue', { params });
}

export async function updateIssue(params: {
  projectRoot: string;
  issueId: string;
} & BeadsIssuePatch): Promise<BeadsIssue> {
  return invoke<BeadsIssue>('beads_update_issue', { params });
}
