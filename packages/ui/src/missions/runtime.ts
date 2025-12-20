/**
 * Glia Missions v0.1 — Runtime
 * State machine + event reducer for mission execution
 */

import type {
  MissionDefinition,
  MissionEvent,
  MissionPhase,
  MissionRunId,
  MissionRunStatus,
  MissionState,
  MissionStepCompletion,
  MissionStepId,
  MissionStepState,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_EVENT_LOG_SIZE = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function generateRunId(): MissionRunId {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createInitialState(
  definition: MissionDefinition,
  runId?: MissionRunId
): MissionState {
  const now = Date.now();
  const actualRunId = runId ?? generateRunId();

  // Initialize steps in order
  const stepOrder = definition.steps.map((s) => s.id);
  const steps: Record<MissionStepId, MissionStepState> = {};

  definition.steps.forEach((step, index) => {
    steps[step.id] = {
      stepId: step.id,
      status: index === 0 ? "available" : "locked",
      toolEventCounts: {},
    };
  });

  // Find default open tools
  const openToolIds = definition.tools
    .filter((t) => t.placement?.defaultOpen)
    .map((t) => t.toolId);

  // Default active tool is the first tool in primary slot, or first open tool
  const primaryTool = definition.tools.find(
    (t) => t.placement?.slot === "primary" && t.placement?.defaultOpen
  );
  const activeToolId = primaryTool?.toolId ?? openToolIds[0] ?? null;

  return {
    runId: actualRunId,
    definitionId: definition.id,
    status: "idle",
    phase: "briefing",
    activeStepId: null,
    stepOrder,
    steps,
    openToolIds,
    activeToolId,
    checkpoint: null,
    metrics: {
      elapsedSeconds: 0,
      pausedSeconds: 0,
    },
    eventLog: [
      {
        type: "mission/created",
        runId: actualRunId,
        at: now,
        definitionId: definition.id,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Completion Evaluation
// ─────────────────────────────────────────────────────────────────────────────

export function isStepCompletionSatisfied(
  completion: MissionStepCompletion,
  stepState: MissionStepState,
  elapsedStepSeconds: number
): boolean {
  switch (completion.kind) {
    case "manual":
      return false; // Must be explicitly completed

    case "time":
      return elapsedStepSeconds >= completion.seconds;

    case "toolEvent": {
      const count = stepState.toolEventCounts?.[completion.name] ?? 0;
      const requiredCount = completion.count ?? 1;
      return count >= requiredCount;
    }

    case "allOf":
      return completion.of.every((c) =>
        isStepCompletionSatisfied(c, stepState, elapsedStepSeconds)
      );

    case "anyOf":
      return completion.of.some((c) =>
        isStepCompletionSatisfied(c, stepState, elapsedStepSeconds)
      );

    default:
      return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived State Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getCompletedStepCount(state: MissionState): number {
  return Object.values(state.steps).filter((s) => s.status === "completed").length;
}

export function getTotalStepCount(state: MissionState): number {
  return state.stepOrder.length;
}

export function getMissionProgress(state: MissionState): number {
  const total = getTotalStepCount(state);
  if (total === 0) return 0;
  return getCompletedStepCount(state) / total;
}

export function getCurrentStep(
  state: MissionState,
  definition: MissionDefinition
): { step: MissionDefinition["steps"][0]; stepState: MissionStepState } | null {
  if (!state.activeStepId) return null;
  const step = definition.steps.find((s) => s.id === state.activeStepId);
  const stepState = state.steps[state.activeStepId];
  if (!step || !stepState) return null;
  return { step, stepState };
}

export function getNextStepId(state: MissionState): MissionStepId | null {
  const activeIndex = state.activeStepId
    ? state.stepOrder.indexOf(state.activeStepId)
    : -1;
  const nextIndex = activeIndex + 1;
  if (nextIndex >= state.stepOrder.length) return null;
  return state.stepOrder[nextIndex];
}

export function isLastStep(state: MissionState): boolean {
  if (!state.activeStepId) return false;
  const activeIndex = state.stepOrder.indexOf(state.activeStepId);
  return activeIndex === state.stepOrder.length - 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Reducer
// ─────────────────────────────────────────────────────────────────────────────

export function missionReducer(
  state: MissionState,
  event: MissionEvent,
  _definition: MissionDefinition
): MissionState {
  // Append to event log (capped)
  const eventLog = [...state.eventLog, event].slice(-MAX_EVENT_LOG_SIZE);

  switch (event.type) {
    // ─────────────────────────────────────────────────────────────────────────
    // Mission Lifecycle
    // ─────────────────────────────────────────────────────────────────────────
    case "mission/start": {
      if (state.status !== "idle") return { ...state, eventLog };

      const firstStepId = state.stepOrder[0];
      const now = event.at;

      return {
        ...state,
        status: "active",
        phase: "running",
        startedAt: now,
        activeStepId: firstStepId,
        steps: {
          ...state.steps,
          [firstStepId]: {
            ...state.steps[firstStepId],
            status: "active",
            startedAt: now,
          },
        },
        eventLog,
      };
    }

    case "mission/pause": {
      if (state.status !== "active") return { ...state, eventLog };

      return {
        ...state,
        status: "paused",
        pausedAt: event.at,
        eventLog,
      };
    }

    case "mission/resume": {
      if (state.status !== "paused") return { ...state, eventLog };

      const pausedDuration = state.pausedAt ? event.at - state.pausedAt : 0;

      return {
        ...state,
        status: "active",
        pausedAt: undefined,
        metrics: {
          ...state.metrics,
          pausedSeconds: state.metrics.pausedSeconds + pausedDuration / 1000,
        },
        eventLog,
      };
    }

    case "mission/abort": {
      return {
        ...state,
        status: "aborted",
        endedAt: event.at,
        eventLog,
      };
    }

    case "mission/enterPhase": {
      return {
        ...state,
        phase: event.phase,
        eventLog,
      };
    }

    case "mission/complete": {
      return {
        ...state,
        status: "completed",
        phase: "debrief",
        endedAt: event.at,
        eventLog,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step Management
    // ─────────────────────────────────────────────────────────────────────────
    case "step/activate": {
      const stepId = event.stepId;
      const stepState = state.steps[stepId];
      if (!stepState) return { ...state, eventLog };

      // Mark previous active step as available if not completed
      const updates: Record<MissionStepId, MissionStepState> = {};
      if (state.activeStepId && state.activeStepId !== stepId) {
        const prevState = state.steps[state.activeStepId];
        if (prevState && prevState.status === "active") {
          updates[state.activeStepId] = {
            ...prevState,
            status: "available",
          };
        }
      }

      updates[stepId] = {
        ...stepState,
        status: "active",
        startedAt: stepState.startedAt ?? event.at,
      };

      return {
        ...state,
        activeStepId: stepId,
        steps: { ...state.steps, ...updates },
        eventLog,
      };
    }

    case "step/complete": {
      const stepId = event.stepId;
      const stepState = state.steps[stepId];
      if (!stepState) return { ...state, eventLog };

      const updates: Record<MissionStepId, MissionStepState> = {
        [stepId]: {
          ...stepState,
          status: "completed",
          completedAt: event.at,
        },
      };

      // Unlock next step
      const nextStepId = getNextStepId({ ...state, activeStepId: stepId });
      if (nextStepId) {
        const nextStepState = state.steps[nextStepId];
        if (nextStepState && nextStepState.status === "locked") {
          updates[nextStepId] = {
            ...nextStepState,
            status: "available",
          };
        }
      }

      // Check if this was the last step
      const currentIndex = state.stepOrder.indexOf(stepId);
      const isLast = currentIndex === state.stepOrder.length - 1;

      return {
        ...state,
        activeStepId: isLast ? null : state.activeStepId,
        phase: isLast ? "debrief" : state.phase,
        steps: { ...state.steps, ...updates },
        eventLog,
      };
    }

    case "step/skip": {
      const stepId = event.stepId;
      const stepState = state.steps[stepId];
      if (!stepState) return { ...state, eventLog };

      const updates: Record<MissionStepId, MissionStepState> = {
        [stepId]: {
          ...stepState,
          status: "skipped",
        },
      };

      // Unlock next step
      const nextStepId = getNextStepId({ ...state, activeStepId: stepId });
      if (nextStepId) {
        const nextStepState = state.steps[nextStepId];
        if (nextStepState && nextStepState.status === "locked") {
          updates[nextStepId] = {
            ...nextStepState,
            status: "available",
          };
        }
      }

      return {
        ...state,
        steps: { ...state.steps, ...updates },
        eventLog,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tool Events
    // ─────────────────────────────────────────────────────────────────────────
    case "tool/open": {
      if (state.openToolIds.includes(event.toolId)) {
        return { ...state, eventLog };
      }
      return {
        ...state,
        openToolIds: [...state.openToolIds, event.toolId],
        activeToolId: event.toolId,
        eventLog,
      };
    }

    case "tool/close": {
      const newOpenIds = state.openToolIds.filter((id) => id !== event.toolId);
      const newActiveId =
        state.activeToolId === event.toolId
          ? newOpenIds[newOpenIds.length - 1] ?? null
          : state.activeToolId;

      return {
        ...state,
        openToolIds: newOpenIds,
        activeToolId: newActiveId,
        eventLog,
      };
    }

    case "tool/event": {
      // Track tool events for step completion
      if (!state.activeStepId) return { ...state, eventLog };

      const activeStepState = state.steps[state.activeStepId];
      if (!activeStepState) return { ...state, eventLog };

      const eventKey = `${event.toolId}:${event.name}`;
      const currentCount = activeStepState.toolEventCounts?.[eventKey] ?? 0;

      const updatedStepState: MissionStepState = {
        ...activeStepState,
        toolEventCounts: {
          ...activeStepState.toolEventCounts,
          [eventKey]: currentCount + 1,
          // Also track by just the name for simpler completion checks
          [event.name]: (activeStepState.toolEventCounts?.[event.name] ?? 0) + 1,
        },
      };

      return {
        ...state,
        steps: {
          ...state.steps,
          [state.activeStepId]: updatedStepState,
        },
        eventLog,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Checkpoints
    // ─────────────────────────────────────────────────────────────────────────
    case "checkpoint/open": {
      return {
        ...state,
        phase: "checkpoint",
        checkpoint: {
          id: event.checkpointId,
          openedAt: event.at,
        },
        eventLog,
      };
    }

    case "checkpoint/ack": {
      return {
        ...state,
        phase: "running",
        checkpoint: null,
        eventLog,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Timer
    // ─────────────────────────────────────────────────────────────────────────
    case "timer/tick": {
      if (state.status !== "active") return { ...state, eventLog };

      // Update step elapsed time
      let updatedSteps = state.steps;
      if (state.activeStepId) {
        const activeStep = state.steps[state.activeStepId];
        if (activeStep && activeStep.startedAt) {
          const stepElapsed = (event.at - activeStep.startedAt) / 1000;
          updatedSteps = {
            ...state.steps,
            [state.activeStepId]: {
              ...activeStep,
              elapsedSeconds: stepElapsed,
            },
          };
        }
      }

      return {
        ...state,
        metrics: {
          ...state.metrics,
          elapsedSeconds: event.elapsedSeconds,
        },
        steps: updatedSteps,
        eventLog,
      };
    }

    default:
      return { ...state, eventLog };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase Transition Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function canTransitionTo(
  from: { status: MissionRunStatus; phase: MissionPhase },
  to: { status?: MissionRunStatus; phase?: MissionPhase }
): boolean {
  const { status, phase } = from;

  // Status transitions
  if (to.status) {
    switch (status) {
      case "idle":
        return to.status === "active";
      case "active":
        return ["paused", "completed", "aborted"].includes(to.status);
      case "paused":
        return ["active", "aborted"].includes(to.status);
      case "completed":
      case "aborted":
        return false;
    }
  }

  // Phase transitions
  if (to.phase) {
    switch (phase) {
      case "briefing":
        return to.phase === "running";
      case "running":
        return ["checkpoint", "debrief"].includes(to.phase);
      case "checkpoint":
        return to.phase === "running";
      case "debrief":
        return false;
    }
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint Trigger Check
// ─────────────────────────────────────────────────────────────────────────────

export function shouldTriggerCheckpoint(
  state: MissionState,
  definition: MissionDefinition,
  elapsedSeconds: number
): string | null {
  if (!definition.checkpoints || state.phase !== "running") return null;

  for (const checkpoint of definition.checkpoints) {
    // Skip if already acknowledged (check event log)
    const wasAcked = state.eventLog.some(
      (e) => e.type === "checkpoint/ack" && e.checkpointId === checkpoint.id
    );
    if (wasAcked) continue;

    // Check trigger conditions
    if (checkpoint.trigger.kind === "time") {
      if (elapsedSeconds >= checkpoint.trigger.secondsFromStart) {
        return checkpoint.id;
      }
    } else if (checkpoint.trigger.kind === "stepBoundary") {
      const stepState = state.steps[checkpoint.trigger.stepId];
      if (stepState?.status === "completed") {
        return checkpoint.id;
      }
    }
  }

  return null;
}

