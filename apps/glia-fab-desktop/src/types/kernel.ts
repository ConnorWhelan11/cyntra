/**
 * Kernel, Beads, and workcell related types
 */

export interface BeadsIssue {
  id: string;
  title: string;
  status: string;
  created?: string | null;
  updated?: string | null;
  description?: string | null;
  tags: string[];
  dkPriority?: string | null;
  dkRisk?: string | null;
  dkSize?: string | null;
  dkToolHint?: string | null;
  dkSpeculate?: boolean | null;
  dkEstimatedTokens?: number | null;
  dkAttempts?: number | null;
  dkMaxAttempts?: number | null;
  ready: boolean;
}

export type BeadsIssuePatch = Partial<{
  status: string;
  title: string;
  description: string | null;
  tags: string[];
  dkPriority: string | null;
  dkRisk: string | null;
  dkSize: string | null;
  dkToolHint: string | null;
  dkSpeculate: boolean | null;
  dkEstimatedTokens: number | null;
  dkAttempts: number | null;
  dkMaxAttempts: number | null;
}>;

export interface BeadsDep {
  fromId: string;
  toId: string;
  depType: string;
  created?: string | null;
}

export interface KernelWorkcell {
  id: string;
  issueId: string;
  created?: string | null;
  path: string;
  speculateTag?: string | null;
  toolchain?: string | null;
  proofStatus?: string | null;
}

export interface KernelEvent {
  type: string;
  timestamp?: string | null;
  issueId?: string | null;
  workcellId?: string | null;
  data: unknown;
  durationMs?: number | null;
  tokensUsed?: number | null;
  costUsd?: number | null;
}

export interface KernelSnapshot {
  beadsPresent: boolean;
  issues: BeadsIssue[];
  deps: BeadsDep[];
  workcells: KernelWorkcell[];
  events: KernelEvent[];
}
