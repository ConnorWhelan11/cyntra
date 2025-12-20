/**
 * Glia Missions v0.1 — Runtime Unit Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createInitialState,
  missionReducer,
  getMissionProgress,
  getCompletedStepCount,
  getTotalStepCount,
  getNextStepId,
  isLastStep,
  isStepCompletionSatisfied,
  canTransitionTo,
  shouldTriggerCheckpoint,
} from "./runtime";
import type { MissionDefinition, MissionState, MissionStepState } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const testDefinition: MissionDefinition = {
  id: "test.mission",
  version: "0.1",
  title: "Test Mission",
  description: "A test mission for unit tests",
  kind: "study",
  mode: "solo",
  difficulty: "Medium",
  estimatedDurationMinutes: 30,
  rewardXP: 500,
  layout: "FocusSplit",
  tools: [
    { toolId: "glia.notes", required: true, placement: { slot: "primary", defaultOpen: true } },
  ],
  steps: [
    {
      id: "step-1",
      title: "First Step",
      kind: "instruction",
      completion: { kind: "manual" },
    },
    {
      id: "step-2",
      title: "Second Step",
      kind: "deepWork",
      completion: { kind: "time", seconds: 60, autoAdvance: true },
    },
    {
      id: "step-3",
      title: "Third Step",
      kind: "practice",
      completion: { kind: "toolEvent", toolId: "glia.notes", name: "notes/changed", count: 3 },
    },
  ],
  checkpoints: [
    { id: "cp-1", title: "Checkpoint 1", trigger: { kind: "time", secondsFromStart: 15 * 60 } },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Initial State
// ─────────────────────────────────────────────────────────────────────────────

describe("createInitialState", () => {
  it("creates state with correct initial values", () => {
    const state = createInitialState(testDefinition);

    expect(state.definitionId).toBe(testDefinition.id);
    expect(state.status).toBe("idle");
    expect(state.phase).toBe("briefing");
    expect(state.activeStepId).toBeNull();
    expect(state.stepOrder).toEqual(["step-1", "step-2", "step-3"]);
  });

  it("initializes first step as available, rest as locked", () => {
    const state = createInitialState(testDefinition);

    expect(state.steps["step-1"].status).toBe("available");
    expect(state.steps["step-2"].status).toBe("locked");
    expect(state.steps["step-3"].status).toBe("locked");
  });

  it("opens default tools", () => {
    const state = createInitialState(testDefinition);

    expect(state.openToolIds).toContain("glia.notes");
    expect(state.activeToolId).toBe("glia.notes");
  });

  it("uses provided runId if given", () => {
    const state = createInitialState(testDefinition, "custom-run-id");

    expect(state.runId).toBe("custom-run-id");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Mission Lifecycle Events
// ─────────────────────────────────────────────────────────────────────────────

describe("missionReducer - lifecycle events", () => {
  let state: MissionState;

  beforeEach(() => {
    state = createInitialState(testDefinition);
  });

  it("mission/start transitions from idle to active", () => {
    const event = { type: "mission/start" as const, runId: state.runId, at: Date.now() };
    const nextState = missionReducer(state, event, testDefinition);

    expect(nextState.status).toBe("active");
    expect(nextState.phase).toBe("running");
    expect(nextState.startedAt).toBeDefined();
    expect(nextState.activeStepId).toBe("step-1");
    expect(nextState.steps["step-1"].status).toBe("active");
  });

  it("mission/pause transitions from active to paused", () => {
    // Start first
    let nextState = missionReducer(state, { type: "mission/start", runId: state.runId, at: Date.now() }, testDefinition);
    
    // Then pause
    nextState = missionReducer(nextState, { type: "mission/pause", runId: state.runId, at: Date.now() }, testDefinition);

    expect(nextState.status).toBe("paused");
    expect(nextState.pausedAt).toBeDefined();
  });

  it("mission/resume transitions from paused to active", () => {
    // Start, then pause
    let nextState = missionReducer(state, { type: "mission/start", runId: state.runId, at: Date.now() }, testDefinition);
    nextState = missionReducer(nextState, { type: "mission/pause", runId: state.runId, at: Date.now() }, testDefinition);
    
    // Then resume
    nextState = missionReducer(nextState, { type: "mission/resume", runId: state.runId, at: Date.now() + 5000 }, testDefinition);

    expect(nextState.status).toBe("active");
    expect(nextState.pausedAt).toBeUndefined();
  });

  it("mission/abort transitions to aborted", () => {
    let nextState = missionReducer(state, { type: "mission/start", runId: state.runId, at: Date.now() }, testDefinition);
    nextState = missionReducer(nextState, { type: "mission/abort", runId: state.runId, at: Date.now(), reason: "User cancelled" }, testDefinition);

    expect(nextState.status).toBe("aborted");
    expect(nextState.endedAt).toBeDefined();
  });

  it("mission/complete transitions to completed", () => {
    let nextState = missionReducer(state, { type: "mission/start", runId: state.runId, at: Date.now() }, testDefinition);
    nextState = missionReducer(nextState, { type: "mission/complete", runId: state.runId, at: Date.now() }, testDefinition);

    expect(nextState.status).toBe("completed");
    expect(nextState.phase).toBe("debrief");
    expect(nextState.endedAt).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Step Events
// ─────────────────────────────────────────────────────────────────────────────

describe("missionReducer - step events", () => {
  let state: MissionState;

  beforeEach(() => {
    state = createInitialState(testDefinition);
    state = missionReducer(state, { type: "mission/start", runId: state.runId, at: Date.now() }, testDefinition);
  });

  it("step/complete marks step as completed and unlocks next", () => {
    const nextState = missionReducer(
      state,
      { type: "step/complete", runId: state.runId, at: Date.now(), stepId: "step-1" },
      testDefinition
    );

    expect(nextState.steps["step-1"].status).toBe("completed");
    expect(nextState.steps["step-1"].completedAt).toBeDefined();
    expect(nextState.steps["step-2"].status).toBe("available");
  });

  it("step/activate sets active step", () => {
    // Complete first step
    let nextState = missionReducer(state, { type: "step/complete", runId: state.runId, at: Date.now(), stepId: "step-1" }, testDefinition);
    
    // Activate second step
    nextState = missionReducer(nextState, { type: "step/activate", runId: state.runId, at: Date.now(), stepId: "step-2" }, testDefinition);

    expect(nextState.activeStepId).toBe("step-2");
    expect(nextState.steps["step-2"].status).toBe("active");
  });

  it("step/skip marks step as skipped", () => {
    const nextState = missionReducer(
      state,
      { type: "step/skip", runId: state.runId, at: Date.now(), stepId: "step-1", reason: "Skipped" },
      testDefinition
    );

    expect(nextState.steps["step-1"].status).toBe("skipped");
  });

  it("completing last step transitions to debrief phase", () => {
    // Complete all steps
    let nextState = missionReducer(state, { type: "step/complete", runId: state.runId, at: Date.now(), stepId: "step-1" }, testDefinition);
    nextState = missionReducer(nextState, { type: "step/activate", runId: state.runId, at: Date.now(), stepId: "step-2" }, testDefinition);
    nextState = missionReducer(nextState, { type: "step/complete", runId: state.runId, at: Date.now(), stepId: "step-2" }, testDefinition);
    nextState = missionReducer(nextState, { type: "step/activate", runId: state.runId, at: Date.now(), stepId: "step-3" }, testDefinition);
    nextState = missionReducer(nextState, { type: "step/complete", runId: state.runId, at: Date.now(), stepId: "step-3" }, testDefinition);

    expect(nextState.phase).toBe("debrief");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Tool Events
// ─────────────────────────────────────────────────────────────────────────────

describe("missionReducer - tool events", () => {
  let state: MissionState;

  beforeEach(() => {
    state = createInitialState(testDefinition);
    state = missionReducer(state, { type: "mission/start", runId: state.runId, at: Date.now() }, testDefinition);
  });

  it("tool/event increments event count for active step", () => {
    const nextState = missionReducer(
      state,
      { type: "tool/event", runId: state.runId, at: Date.now(), toolId: "glia.notes", name: "notes/changed" },
      testDefinition
    );

    expect(nextState.steps["step-1"].toolEventCounts?.["notes/changed"]).toBe(1);
  });

  it("tool/open adds tool to open list", () => {
    const nextState = missionReducer(
      state,
      { type: "tool/open", runId: state.runId, at: Date.now(), toolId: "glia.drawboard" },
      testDefinition
    );

    expect(nextState.openToolIds).toContain("glia.drawboard");
    expect(nextState.activeToolId).toBe("glia.drawboard");
  });

  it("tool/close removes tool from open list", () => {
    const nextState = missionReducer(
      state,
      { type: "tool/close", runId: state.runId, at: Date.now(), toolId: "glia.notes" },
      testDefinition
    );

    expect(nextState.openToolIds).not.toContain("glia.notes");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Checkpoint Events
// ─────────────────────────────────────────────────────────────────────────────

describe("missionReducer - checkpoint events", () => {
  let state: MissionState;

  beforeEach(() => {
    state = createInitialState(testDefinition);
    state = missionReducer(state, { type: "mission/start", runId: state.runId, at: Date.now() }, testDefinition);
  });

  it("checkpoint/open sets checkpoint state", () => {
    const nextState = missionReducer(
      state,
      { type: "checkpoint/open", runId: state.runId, at: Date.now(), checkpointId: "cp-1" },
      testDefinition
    );

    expect(nextState.phase).toBe("checkpoint");
    expect(nextState.checkpoint?.id).toBe("cp-1");
  });

  it("checkpoint/ack clears checkpoint and returns to running", () => {
    let nextState = missionReducer(state, { type: "checkpoint/open", runId: state.runId, at: Date.now(), checkpointId: "cp-1" }, testDefinition);
    nextState = missionReducer(nextState, { type: "checkpoint/ack", runId: state.runId, at: Date.now(), checkpointId: "cp-1" }, testDefinition);

    expect(nextState.phase).toBe("running");
    expect(nextState.checkpoint).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

describe("helper functions", () => {
  let state: MissionState;

  beforeEach(() => {
    state = createInitialState(testDefinition);
  });

  describe("getMissionProgress", () => {
    it("returns 0 for no completed steps", () => {
      expect(getMissionProgress(state)).toBe(0);
    });

    it("returns correct progress ratio", () => {
      state.steps["step-1"].status = "completed";
      expect(getMissionProgress(state)).toBeCloseTo(1 / 3);
    });
  });

  describe("getCompletedStepCount", () => {
    it("counts completed steps", () => {
      state.steps["step-1"].status = "completed";
      state.steps["step-2"].status = "completed";
      expect(getCompletedStepCount(state)).toBe(2);
    });
  });

  describe("getTotalStepCount", () => {
    it("returns total steps", () => {
      expect(getTotalStepCount(state)).toBe(3);
    });
  });

  describe("getNextStepId", () => {
    it("returns next step id", () => {
      state.activeStepId = "step-1";
      expect(getNextStepId(state)).toBe("step-2");
    });

    it("returns null for last step", () => {
      state.activeStepId = "step-3";
      expect(getNextStepId(state)).toBeNull();
    });
  });

  describe("isLastStep", () => {
    it("returns true for last step", () => {
      state.activeStepId = "step-3";
      expect(isLastStep(state)).toBe(true);
    });

    it("returns false for non-last step", () => {
      state.activeStepId = "step-1";
      expect(isLastStep(state)).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Step Completion Evaluation
// ─────────────────────────────────────────────────────────────────────────────

describe("isStepCompletionSatisfied", () => {
  const baseStepState: MissionStepState = {
    stepId: "test",
    status: "active",
    toolEventCounts: {},
  };

  it("returns false for manual completion", () => {
    expect(isStepCompletionSatisfied({ kind: "manual" }, baseStepState, 0)).toBe(false);
  });

  it("evaluates time completion", () => {
    expect(isStepCompletionSatisfied({ kind: "time", seconds: 60 }, baseStepState, 30)).toBe(false);
    expect(isStepCompletionSatisfied({ kind: "time", seconds: 60 }, baseStepState, 60)).toBe(true);
    expect(isStepCompletionSatisfied({ kind: "time", seconds: 60 }, baseStepState, 90)).toBe(true);
  });

  it("evaluates toolEvent completion", () => {
    const stateWithEvents: MissionStepState = {
      ...baseStepState,
      toolEventCounts: { "notes/changed": 2 },
    };

    expect(isStepCompletionSatisfied(
      { kind: "toolEvent", toolId: "glia.notes", name: "notes/changed", count: 3 },
      stateWithEvents,
      0
    )).toBe(false);

    expect(isStepCompletionSatisfied(
      { kind: "toolEvent", toolId: "glia.notes", name: "notes/changed", count: 2 },
      stateWithEvents,
      0
    )).toBe(true);
  });

  it("evaluates allOf completion", () => {
    const stateWithEvents: MissionStepState = {
      ...baseStepState,
      toolEventCounts: { "notes/changed": 1 },
    };

    const completion = {
      kind: "allOf" as const,
      of: [
        { kind: "time" as const, seconds: 30 },
        { kind: "toolEvent" as const, toolId: "glia.notes", name: "notes/changed", count: 1 },
      ],
    };

    expect(isStepCompletionSatisfied(completion, stateWithEvents, 20)).toBe(false);
    expect(isStepCompletionSatisfied(completion, stateWithEvents, 30)).toBe(true);
  });

  it("evaluates anyOf completion", () => {
    const completion = {
      kind: "anyOf" as const,
      of: [
        { kind: "time" as const, seconds: 60 },
        { kind: "manual" as const },
      ],
    };

    expect(isStepCompletionSatisfied(completion, baseStepState, 30)).toBe(false);
    expect(isStepCompletionSatisfied(completion, baseStepState, 60)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Phase Transitions
// ─────────────────────────────────────────────────────────────────────────────

describe("canTransitionTo", () => {
  it("allows idle -> active", () => {
    expect(canTransitionTo({ status: "idle", phase: "briefing" }, { status: "active" })).toBe(true);
  });

  it("allows active -> paused", () => {
    expect(canTransitionTo({ status: "active", phase: "running" }, { status: "paused" })).toBe(true);
  });

  it("allows paused -> active", () => {
    expect(canTransitionTo({ status: "paused", phase: "running" }, { status: "active" })).toBe(true);
  });

  it("disallows completed -> active", () => {
    expect(canTransitionTo({ status: "completed", phase: "debrief" }, { status: "active" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Checkpoint Trigger
// ─────────────────────────────────────────────────────────────────────────────

describe("shouldTriggerCheckpoint", () => {
  let state: MissionState;

  beforeEach(() => {
    state = createInitialState(testDefinition);
    state = missionReducer(state, { type: "mission/start", runId: state.runId, at: Date.now() }, testDefinition);
  });

  it("returns null when not in running phase", () => {
    state.phase = "briefing";
    expect(shouldTriggerCheckpoint(state, testDefinition, 20 * 60)).toBeNull();
  });

  it("triggers time-based checkpoint when elapsed time reached", () => {
    expect(shouldTriggerCheckpoint(state, testDefinition, 14 * 60)).toBeNull();
    expect(shouldTriggerCheckpoint(state, testDefinition, 15 * 60)).toBe("cp-1");
  });

  it("does not re-trigger acknowledged checkpoint", () => {
    // Add checkpoint ack to event log
    state.eventLog.push({
      type: "checkpoint/ack",
      runId: state.runId,
      at: Date.now(),
      checkpointId: "cp-1",
    });

    expect(shouldTriggerCheckpoint(state, testDefinition, 20 * 60)).toBeNull();
  });
});

