/**
 * Glia Missions v0.1 — Public API
 */

// Types
export type {
  MissionActor,
  MissionCheckpoint,
  MissionDebrief,
  MissionDefinition,
  MissionDefinitionId,
  MissionDifficulty,
  MissionDispatchEvent,
  MissionEvent,
  MissionKind,
  MissionLayoutPreset,
  MissionLayoutPresetId,
  MissionLayoutRenderProps,
  MissionLayoutSlotId,
  MissionMode,
  MissionPersistenceAdapter,
  MissionPhase,
  MissionPodSyncAdapter,
  MissionRunId,
  MissionRunStatus,
  MissionState,
  MissionStep,
  MissionStepCompletion,
  MissionStepId,
  MissionStepState,
  MissionStepStatus,
  MissionTool,
  MissionToolContext,
  MissionToolId,
  MissionToolPlacement,
  MissionToolRef,
  MissionToolRenderProps,
} from "./types";

// Runtime
export {
  canTransitionTo,
  createInitialState,
  generateRunId,
  getCompletedStepCount,
  getCurrentStep,
  getMissionProgress,
  getNextStepId,
  getTotalStepCount,
  isLastStep,
  isStepCompletionSatisfied,
  missionReducer,
  shouldTriggerCheckpoint,
} from "./runtime";

// Provider & Hooks
export { MissionRuntimeProvider, useMissionRuntime, useMissionToolContext } from "./provider";
export type { MissionRuntimeContextValue, MissionRuntimeProviderProps } from "./provider";

// Persistence
export {
  createLocalStoragePersistenceAdapter,
  createNoOpPersistenceAdapter,
  defaultPersistenceAdapter,
} from "./persistence";

// Registry
export {
  clearLayoutRegistry,
  clearToolRegistry,
  getAllLayouts,
  getAllTools,
  getLayout,
  getTool,
  hasLayoutRegistered,
  hasToolRegistered,
  registerLayout,
  registerLayouts,
  registerTool,
  registerTools,
  TOOL_IDS,
  unregisterLayout,
  unregisterTool,
} from "./registry";
export type { StandardToolId } from "./registry";
