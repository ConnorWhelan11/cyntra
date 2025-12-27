/**
 * Glia Missions v0.1 — Core Types
 * Data-driven, event-driven study experience system
 */
import type { ComponentType, ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Identifiers
// ─────────────────────────────────────────────────────────────────────────────

export type MissionDefinitionId = string;
export type MissionRunId = string;
export type MissionStepId = string;
export type MissionToolId = string;

// ─────────────────────────────────────────────────────────────────────────────
// Enums & Literal Types
// ─────────────────────────────────────────────────────────────────────────────

export type MissionMode = "solo" | "pod";
export type MissionKind = "study" | "practice" | "review" | "lecture";
export type MissionDifficulty = "Easy" | "Medium" | "Hard" | "Expert";

export type MissionPhase = "briefing" | "running" | "checkpoint" | "debrief";
export type MissionRunStatus = "idle" | "active" | "paused" | "completed" | "aborted";

export type MissionLayoutPresetId = "FocusSplit" | "TabsWorkspace" | "ExternalSidecar";
export type MissionLayoutSlotId = "primary" | "secondary" | "rail" | "dock" | "modal" | "external";

export type MissionStepStatus = "locked" | "available" | "active" | "completed" | "skipped";

// ─────────────────────────────────────────────────────────────────────────────
// Mission Definition (Template)
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionDefinition {
  id: MissionDefinitionId;
  version: "0.1";
  title: string;
  description?: string;

  kind: MissionKind;
  mode: MissionMode;
  difficulty?: MissionDifficulty;

  estimatedDurationMinutes?: number;
  rewardXP?: number;

  layout: MissionLayoutPresetId;

  tools: MissionToolRef[];
  steps: MissionStep[];

  checkpoints?: MissionCheckpoint[];
}

export interface MissionToolRef {
  toolId: MissionToolId;
  required?: boolean;
  config?: Record<string, unknown>;
  placement?: MissionToolPlacement;
}

export interface MissionToolPlacement {
  slot?: MissionLayoutSlotId;
  defaultOpen?: boolean;
  tabLabel?: string;
  order?: number;
}

export interface MissionStep {
  id: MissionStepId;
  title: string;
  description?: string;

  kind: "instruction" | "deepWork" | "practice" | "discussion" | "external";

  primaryToolId?: MissionToolId;
  toolIds?: MissionToolId[];

  completion: MissionStepCompletion;
}

export type MissionStepCompletion =
  | { kind: "manual" }
  | { kind: "time"; seconds: number; autoAdvance?: boolean }
  | { kind: "toolEvent"; toolId: MissionToolId; name: string; count?: number }
  | { kind: "allOf"; of: MissionStepCompletion[] }
  | { kind: "anyOf"; of: MissionStepCompletion[] };

export interface MissionCheckpoint {
  id: string;
  title: string;
  trigger:
    | { kind: "time"; secondsFromStart: number }
    | { kind: "stepBoundary"; stepId: MissionStepId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mission Events
// ─────────────────────────────────────────────────────────────────────────────

export type MissionActor =
  | { type: "system" }
  | { type: "user"; userId: string }
  | { type: "tool"; toolId: MissionToolId }
  | { type: "pod"; podId: string; userId: string };

export type MissionEvent =
  | { type: "mission/created"; runId: MissionRunId; at: number; definitionId: MissionDefinitionId }
  | { type: "mission/start"; runId: MissionRunId; at: number; actor?: MissionActor }
  | { type: "mission/pause"; runId: MissionRunId; at: number; actor?: MissionActor }
  | { type: "mission/resume"; runId: MissionRunId; at: number; actor?: MissionActor }
  | {
      type: "mission/abort";
      runId: MissionRunId;
      at: number;
      actor?: MissionActor;
      reason?: string;
    }
  | { type: "mission/enterPhase"; runId: MissionRunId; at: number; phase: MissionPhase }
  | {
      type: "mission/complete";
      runId: MissionRunId;
      at: number;
      actor?: MissionActor;
      debrief?: MissionDebrief;
    }
  | { type: "step/activate"; runId: MissionRunId; at: number; stepId: MissionStepId }
  | { type: "step/complete"; runId: MissionRunId; at: number; stepId: MissionStepId }
  | { type: "step/skip"; runId: MissionRunId; at: number; stepId: MissionStepId; reason?: string }
  | { type: "tool/open"; runId: MissionRunId; at: number; toolId: MissionToolId }
  | { type: "tool/close"; runId: MissionRunId; at: number; toolId: MissionToolId }
  | {
      type: "tool/event";
      runId: MissionRunId;
      at: number;
      toolId: MissionToolId;
      name: string;
      data?: Record<string, unknown>;
    }
  | { type: "checkpoint/open"; runId: MissionRunId; at: number; checkpointId: string }
  | { type: "checkpoint/ack"; runId: MissionRunId; at: number; checkpointId: string }
  | { type: "timer/tick"; runId: MissionRunId; at: number; elapsedSeconds: number };

export interface MissionDebrief {
  summary?: string;
  wins?: string[];
  gaps?: string[];
  nextSteps?: string[];
  rating?: 1 | 2 | 3 | 4 | 5;
  xpAwarded?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mission State (Runtime)
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionStepState {
  stepId: MissionStepId;
  status: MissionStepStatus;
  startedAt?: number;
  completedAt?: number;
  toolEventCounts?: Record<string, number>;
  elapsedSeconds?: number;
}

export interface MissionState {
  runId: MissionRunId;
  definitionId: MissionDefinitionId;

  status: MissionRunStatus;
  phase: MissionPhase;

  startedAt?: number;
  pausedAt?: number;
  endedAt?: number;

  activeStepId: MissionStepId | null;
  stepOrder: MissionStepId[];
  steps: Record<MissionStepId, MissionStepState>;

  // Shell-level UI state
  openToolIds: MissionToolId[];
  activeToolId: MissionToolId | null;

  checkpoint?: { id: string; openedAt: number } | null;

  metrics: {
    elapsedSeconds: number;
    pausedSeconds: number;
  };

  // v0.1: local-only event log (capped)
  eventLog: MissionEvent[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool System
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionToolContext {
  runId: MissionRunId;
  definition: MissionDefinition;
  state: MissionState;
  dispatch: (event: MissionDispatchEvent) => void;
  stepState?: MissionStepState;
}

export interface MissionToolRenderProps {
  toolId: MissionToolId;
  config?: Record<string, unknown>;
  context: MissionToolContext;
}

export interface MissionTool {
  id: MissionToolId;
  title: string;
  description?: string;
  icon?: ReactNode;

  Panel: ComponentType<MissionToolRenderProps>;
  Widget?: ComponentType<MissionToolRenderProps>;

  /** Tool supports its own event handling */
  handlesEvents?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Presets
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionLayoutRenderProps {
  definition: MissionDefinition;
  state: MissionState;
  renderTool: (toolId: MissionToolId, slot: MissionLayoutSlotId) => ReactNode;
  /** Widgets to render in rail/HUD area */
  widgets?: ReactNode;
  className?: string;
}

export interface MissionLayoutPreset {
  id: MissionLayoutPresetId;
  title: string;
  description?: string;
  Component: ComponentType<MissionLayoutRenderProps>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pod Sync Adapter Interface (v0.1 stub)
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionPodSyncAdapter {
  publish: (event: MissionEvent) => Promise<void> | void;
  subscribe: (runId: MissionRunId, onEvent: (event: MissionEvent) => void) => () => void;
  getParticipants?: (
    runId: MissionRunId
  ) => Promise<Array<{ userId: string; displayName?: string }>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence Adapter Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionPersistenceAdapter {
  load: (runId: MissionRunId) => MissionState | null;
  save: (state: MissionState) => void;
  clear: (runId: MissionRunId) => void;
  listRuns?: () => MissionRunId[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch Event Type (preserves union variant properties)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper type that distributes Omit over union members
 * This allows dispatch to accept variant-specific properties like stepId, toolId, etc.
 */
type DistributiveOmit<T, K extends keyof T> = T extends T ? Omit<T, K> : never;

/**
 * Event type for dispatch - omits runId and at which are auto-filled
 */
export type MissionDispatchEvent = DistributiveOmit<MissionEvent, "runId" | "at">;
