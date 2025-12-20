"use client";

/**
 * Glia Missions v0.1 — Provider
 * React context for mission runtime state management
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { defaultPersistenceAdapter } from "./persistence";
import {
  createInitialState,
  generateRunId,
  getCurrentStep,
  getMissionProgress,
  getNextStepId,
  isStepCompletionSatisfied,
  missionReducer,
  shouldTriggerCheckpoint,
} from "./runtime";
import type {
  MissionDefinition,
  MissionDispatchEvent,
  MissionEvent,
  MissionPersistenceAdapter,
  MissionRunId,
  MissionState,
  MissionStepId,
  MissionToolContext,
  MissionToolId,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Context Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionRuntimeContextValue {
  /** Current mission definition */
  definition: MissionDefinition | null;
  /** Current mission state */
  state: MissionState | null;
  /** Whether a mission is currently loaded */
  isLoaded: boolean;
  /** Dispatch a mission event */
  dispatch: (event: MissionDispatchEvent) => void;

  // High-level actions
  /** Create and start a new mission run */
  createRun: (definition: MissionDefinition, autoStart?: boolean) => MissionRunId;
  /** Load an existing run from persistence */
  loadRun: (runId: MissionRunId, definition: MissionDefinition) => boolean;
  /** Start the current mission (if idle) */
  startMission: () => void;
  /** Pause the current mission */
  pauseMission: () => void;
  /** Resume a paused mission */
  resumeMission: () => void;
  /** Abort the current mission */
  abortMission: (reason?: string) => void;
  /** Complete the current mission */
  completeMission: () => void;

  // Step actions
  /** Activate a specific step */
  activateStep: (stepId: MissionStepId) => void;
  /** Complete the current step */
  completeCurrentStep: () => void;
  /** Skip the current step */
  skipCurrentStep: (reason?: string) => void;
  /** Advance to the next step */
  advanceToNextStep: () => void;

  // Tool actions
  /** Open a tool */
  openTool: (toolId: MissionToolId) => void;
  /** Close a tool */
  closeTool: (toolId: MissionToolId) => void;
  /** Set active tool */
  setActiveTool: (toolId: MissionToolId) => void;

  // Checkpoint actions
  /** Acknowledge a checkpoint */
  ackCheckpoint: (checkpointId: string) => void;

  // Derived state
  /** Progress (0-1) */
  progress: number;
  /** Elapsed seconds */
  elapsedSeconds: number;
  /** Whether the mission is paused */
  isPaused: boolean;
  /** Whether the mission is active */
  isActive: boolean;
  /** Whether mission is complete */
  isComplete: boolean;

  // Event log for dev panel
  eventLog: MissionEvent[];
}

const MissionRuntimeContext = createContext<MissionRuntimeContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider Props
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionRuntimeProviderProps {
  children: React.ReactNode;
  /** Initial definition to load */
  initialDefinition?: MissionDefinition;
  /** Initial run ID to restore */
  initialRunId?: MissionRunId;
  /** Auto-start when definition is loaded */
  autoStart?: boolean;
  /** Persistence adapter (defaults to localStorage) */
  persistence?: MissionPersistenceAdapter;
  /** Enable timer ticks (default: true) */
  enableTimer?: boolean;
  /** Timer interval in ms (default: 1000) */
  timerInterval?: number;
  /** Callback when mission completes */
  onComplete?: (state: MissionState) => void;
  /** Callback on any event */
  onEvent?: (event: MissionEvent) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Component
// ─────────────────────────────────────────────────────────────────────────────

export function MissionRuntimeProvider({
  children,
  initialDefinition,
  initialRunId,
  autoStart = false,
  persistence = defaultPersistenceAdapter,
  enableTimer = true,
  timerInterval = 1000,
  onComplete,
  onEvent,
}: MissionRuntimeProviderProps) {
  const [definition, setDefinition] = useState<MissionDefinition | null>(
    initialDefinition ?? null
  );
  const [state, setState] = useState<MissionState | null>(null);

  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize on mount
  useEffect(() => {
    if (initialDefinition) {
      if (initialRunId) {
        // Try to restore from persistence
        const savedState = persistence.load(initialRunId);
        if (savedState) {
          setState(savedState);
          if (savedState.startedAt) {
            startTimeRef.current = savedState.startedAt;
          }
        } else {
          // Create new state with specified runId
          const newState = createInitialState(initialDefinition, initialRunId);
          setState(newState);
        }
      } else {
        // Create fresh state
        const newState = createInitialState(initialDefinition);
        setState(newState);
        if (autoStart) {
          // Will be started via effect below
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispatch function
  const dispatch = useCallback(
    (partialEvent: MissionDispatchEvent) => {
      if (!state || !definition) return;

      const event = {
        ...partialEvent,
        runId: state.runId,
        at: Date.now(),
      } as MissionEvent;

      const nextState = missionReducer(state, event, definition);

      setState(nextState);
      persistence.save(nextState);
      onEvent?.(event);

      // Check for mission completion
      if (nextState.status === "completed" && state.status !== "completed") {
        onComplete?.(nextState);
      }
    },
    [state, definition, persistence, onEvent, onComplete]
  );

  // Timer effect
  useEffect(() => {
    if (!enableTimer || !state || state.status !== "active") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (!startTimeRef.current && state.startedAt) {
      startTimeRef.current = state.startedAt;
    }

    timerRef.current = setInterval(() => {
      if (!startTimeRef.current) return;

      const now = Date.now();
      const elapsed = (now - startTimeRef.current) / 1000 - state.metrics.pausedSeconds;

      dispatch({ type: "timer/tick", elapsedSeconds: Math.floor(elapsed) });

      // Check for checkpoint triggers
      if (definition) {
        const checkpointId = shouldTriggerCheckpoint(state, definition, elapsed);
        if (checkpointId && !state.checkpoint) {
          dispatch({ type: "checkpoint/open", checkpointId });
        }
      }

      // Check for time-based step auto-advance
      if (definition && state.activeStepId) {
        const currentStepData = getCurrentStep(state, definition);
        if (currentStepData) {
          const { step, stepState } = currentStepData;
          const stepElapsed = stepState.elapsedSeconds ?? 0;

          if (
            step.completion.kind === "time" &&
            step.completion.autoAdvance &&
            isStepCompletionSatisfied(step.completion, stepState, stepElapsed)
          ) {
            dispatch({ type: "step/complete", stepId: step.id });
          }
        }
      }
    }, timerInterval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state?.status, state?.activeStepId, enableTimer, timerInterval, definition, dispatch, state]);

  // High-level actions
  const createRun = useCallback(
    (def: MissionDefinition, autoStartRun = false): MissionRunId => {
      const runId = generateRunId();
      const newState = createInitialState(def, runId);
      setDefinition(def);
      setState(newState);
      persistence.save(newState);

      if (autoStartRun) {
        // Dispatch start after state is set
        setTimeout(() => {
          dispatch({ type: "mission/start" });
        }, 0);
      }

      return runId;
    },
    [persistence, dispatch]
  );

  const loadRun = useCallback(
    (runId: MissionRunId, def: MissionDefinition): boolean => {
      const savedState = persistence.load(runId);
      if (!savedState) return false;

      setDefinition(def);
      setState(savedState);
      if (savedState.startedAt) {
        startTimeRef.current = savedState.startedAt;
      }
      return true;
    },
    [persistence]
  );

  const startMission = useCallback(() => {
    if (state?.status !== "idle") return;
    startTimeRef.current = Date.now();
    dispatch({ type: "mission/start" });
  }, [state?.status, dispatch]);

  const pauseMission = useCallback(() => {
    dispatch({ type: "mission/pause" });
  }, [dispatch]);

  const resumeMission = useCallback(() => {
    dispatch({ type: "mission/resume" });
  }, [dispatch]);

  const abortMission = useCallback(
    (reason?: string) => {
      dispatch({ type: "mission/abort", reason });
    },
    [dispatch]
  );

  const completeMission = useCallback(() => {
    dispatch({ type: "mission/complete" });
  }, [dispatch]);

  // Step actions
  const activateStep = useCallback(
    (stepId: MissionStepId) => {
      dispatch({ type: "step/activate", stepId });
    },
    [dispatch]
  );

  const completeCurrentStep = useCallback(() => {
    if (!state?.activeStepId) return;
    dispatch({ type: "step/complete", stepId: state.activeStepId });
  }, [state?.activeStepId, dispatch]);

  const skipCurrentStep = useCallback(
    (reason?: string) => {
      if (!state?.activeStepId) return;
      dispatch({ type: "step/skip", stepId: state.activeStepId, reason });
    },
    [state?.activeStepId, dispatch]
  );

  const advanceToNextStep = useCallback(() => {
    if (!state) return;
    const nextId = getNextStepId(state);
    if (nextId) {
      dispatch({ type: "step/activate", stepId: nextId });
    }
  }, [state, dispatch]);

  // Tool actions
  const openTool = useCallback(
    (toolId: MissionToolId) => {
      dispatch({ type: "tool/open", toolId });
    },
    [dispatch]
  );

  const closeTool = useCallback(
    (toolId: MissionToolId) => {
      dispatch({ type: "tool/close", toolId });
    },
    [dispatch]
  );

  const setActiveTool = useCallback(
    (toolId: MissionToolId) => {
      if (state && !state.openToolIds.includes(toolId)) {
        dispatch({ type: "tool/open", toolId });
      } else if (state) {
        // Just update activeToolId without event (internal state)
        setState((prev) => (prev ? { ...prev, activeToolId: toolId } : null));
      }
    },
    [state, dispatch]
  );

  // Checkpoint actions
  const ackCheckpoint = useCallback(
    (checkpointId: string) => {
      dispatch({ type: "checkpoint/ack", checkpointId });
    },
    [dispatch]
  );

  // Derived state
  const progress = useMemo(() => (state ? getMissionProgress(state) : 0), [state]);
  const elapsedSeconds = state?.metrics.elapsedSeconds ?? 0;
  const isPaused = state?.status === "paused";
  const isActive = state?.status === "active";
  const isComplete = state?.status === "completed";
  const eventLog = state?.eventLog ?? [];

  const contextValue: MissionRuntimeContextValue = useMemo(
    () => ({
      definition,
      state,
      isLoaded: !!state,
      dispatch,
      createRun,
      loadRun,
      startMission,
      pauseMission,
      resumeMission,
      abortMission,
      completeMission,
      activateStep,
      completeCurrentStep,
      skipCurrentStep,
      advanceToNextStep,
      openTool,
      closeTool,
      setActiveTool,
      ackCheckpoint,
      progress,
      elapsedSeconds,
      isPaused,
      isActive,
      isComplete,
      eventLog,
    }),
    [
      definition,
      state,
      dispatch,
      createRun,
      loadRun,
      startMission,
      pauseMission,
      resumeMission,
      abortMission,
      completeMission,
      activateStep,
      completeCurrentStep,
      skipCurrentStep,
      advanceToNextStep,
      openTool,
      closeTool,
      setActiveTool,
      ackCheckpoint,
      progress,
      elapsedSeconds,
      isPaused,
      isActive,
      isComplete,
      eventLog,
    ]
  );

  return (
    <MissionRuntimeContext.Provider value={contextValue}>
      {children}
    </MissionRuntimeContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useMissionRuntime(): MissionRuntimeContextValue {
  const context = useContext(MissionRuntimeContext);
  if (!context) {
    throw new Error("useMissionRuntime must be used within a MissionRuntimeProvider");
  }
  return context;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Context Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useMissionToolContext(toolId: MissionToolId): MissionToolContext | null {
  const { definition, state, dispatch } = useMissionRuntime();

  return useMemo(() => {
    if (!definition || !state) return null;

    const stepState = state.activeStepId ? state.steps[state.activeStepId] : undefined;

    return {
      runId: state.runId,
      definition,
      state,
      dispatch,
      stepState,
    };
  }, [definition, state, dispatch, toolId]);
}

