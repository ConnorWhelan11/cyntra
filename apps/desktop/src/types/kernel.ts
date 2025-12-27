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
  progress: number;
  progressStage: string;
}

/**
 * UI-focused workcell representation with derived state for display
 */
export interface WorkcellInfo {
  id: string;
  issueId: string;
  state: "idle" | "running" | "complete" | "failed" | "done" | "error";
  toolchain?: string | null;
  path?: string;
  speculateTag?: string | null;
  progress?: number;
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

// ============================================================================
// PLAYABILITY GATE TYPES - NitroGen-based gameplay testing metrics
// ============================================================================

/**
 * Playability gate verdict
 */
export type PlayabilityVerdict = "pass" | "fail" | "pending" | "not_run";

/**
 * Playability gate failure codes
 */
export type PlayabilityFailureCode =
  | "PLAY_STUCK_TOO_LONG"
  | "PLAY_NO_EXPLORATION"
  | "PLAY_LOW_COVERAGE"
  | "PLAY_NO_INTERACTIONS"
  | "PLAY_CRASH_DETECTED"
  | "PLAY_NITROGEN_TIMEOUT";

/**
 * Per-metric playability scores
 */
export interface PlayabilityMetrics {
  framesProcessed: number;
  totalPlaytimeSeconds: number;
  stuckRatio: number; // 0-1, lower is better
  coverageEstimate: number; // 0-1, higher is better
  interactionRate: number; // 0-1, higher is better
  movementDistance: number;
  jumpAttempts: number;
  interactionAttempts: number;
  crashCount: number;
  nitrogenTimeouts: number;
}

/**
 * NitroGen client connection metrics
 */
export interface NitrogenConnectionMetrics {
  avgLatencyMs: number;
  totalRetries: number;
  successRate: number;
  connectionState: "connected" | "degraded" | "failed" | "disconnected";
}

/**
 * Complete playability gate result for a world
 */
export interface PlayabilityGateResult {
  worldId: string;
  gateConfigId: string;
  runId?: string;
  timestamp: string;
  verdict: PlayabilityVerdict;
  success: boolean;
  failures: PlayabilityFailureCode[];
  warnings: string[];
  metrics: PlayabilityMetrics;
  nitrogenMetrics?: NitrogenConnectionMetrics;
  environmentType?: string;
  seed?: number;
}

/**
 * Aggregated playability stats for a world
 */
export interface PlayabilityStats {
  worldId: string;
  totalRuns: number;
  passed: number;
  failed: number;
  passRate: number;
  avgStuckRatio: number;
  avgCoverage: number;
  avgInteractionRate: number;
  failureCodes: Record<string, number>;
  warningCodes: Record<string, number>;
}
