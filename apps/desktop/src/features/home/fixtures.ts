/**
 * Test fixtures for home feature components
 */

import type {
  WorldBuildState,
  AgentState,
  BuildEvent,
  RefinementMessage,
  BlueprintDraft,
  WorldTemplate,
  RecentWorld,
} from "@/types";

/** Default blueprint for testing */
export const mockBlueprint: BlueprintDraft = {
  name: "Test World",
  runtime: "three",
  outputs: ["viewer"],
  gates: [],
  tags: [],
};

/** Sample agent in running state */
export const mockAgentRunning: AgentState = {
  id: "wc-claude-001",
  toolchain: "claude",
  status: "running",
  fitness: 0.78,
  currentStage: "generating",
  events: [],
};

/** Sample agent that passed */
export const mockAgentPassed: AgentState = {
  id: "wc-codex-001",
  toolchain: "codex",
  status: "passed",
  fitness: 0.85,
  currentStage: "complete",
  events: [],
};

/** Sample agent that failed */
export const mockAgentFailed: AgentState = {
  id: "wc-opencode-001",
  toolchain: "opencode",
  status: "failed",
  fitness: 0.42,
  error: "Geometry critic failed",
  events: [],
};

/** Sample build events */
export const mockBuildEvents: BuildEvent[] = [
  {
    id: "evt-1",
    type: "system",
    message: "Workcell created",
    timestamp: Date.now() - 60000,
  },
  {
    id: "evt-2",
    agentId: "wc-claude-001",
    type: "agent",
    message: "fab.stage.generate",
    timestamp: Date.now() - 50000,
  },
  {
    id: "evt-3",
    agentId: "wc-claude-001",
    type: "critic",
    message: "Running alignment critic",
    timestamp: Date.now() - 30000,
    metadata: { fitness: 0.78 },
  },
  {
    id: "evt-4",
    agentId: "wc-claude-001",
    type: "error",
    message: "Geometry validation warning",
    timestamp: Date.now() - 10000,
  },
];

/** Agent with events for log testing */
export const mockAgentWithEvents: AgentState = {
  ...mockAgentRunning,
  events: mockBuildEvents.filter((e) => e.agentId === "wc-claude-001" || !e.agentId),
};

/** Sample refinement messages */
export const mockRefinements: RefinementMessage[] = [
  {
    id: "ref-1",
    text: "Add a potted plant near the window",
    timestamp: Date.now() - 30000,
    status: "queued",
    issueId: "issue-ref-1",
  },
  {
    id: "ref-2",
    text: "Make the lighting warmer",
    timestamp: Date.now() - 15000,
    status: "pending",
  },
];

/** World build state in generating phase */
export const mockBuildStateGenerating: WorldBuildState = {
  issueId: "issue-001",
  runId: "run-001",
  status: "generating",
  prompt: "A cozy reading nook with morning light streaming through tall windows",
  blueprint: mockBlueprint,
  isSpeculating: false,
  agents: [mockAgentRunning],
  leadingAgentId: "wc-claude-001",
  generation: 1,
  bestFitness: 0.78,
  currentStage: "generating",
  refinements: [],
  startedAt: Date.now() - 60000,
};

/** World build state with speculation (multiple agents) */
export const mockBuildStateSpeculating: WorldBuildState = {
  issueId: "issue-002",
  runId: "run-002",
  status: "critiquing",
  prompt: "A futuristic space station command center",
  blueprint: { ...mockBlueprint, name: "Space Station" },
  isSpeculating: true,
  agents: [
    { ...mockAgentRunning, fitness: 0.82 },
    { ...mockAgentPassed, id: "wc-codex-002", fitness: 0.75 },
  ],
  leadingAgentId: "wc-claude-001",
  generation: 3,
  bestFitness: 0.82,
  currentStage: "critiquing",
  refinements: mockRefinements,
  startedAt: Date.now() - 120000,
};

/** World build state that completed */
export const mockBuildStateComplete: WorldBuildState = {
  issueId: "issue-003",
  runId: "run-003",
  status: "complete",
  prompt: "A medieval tavern interior",
  blueprint: { ...mockBlueprint, name: "Medieval Tavern" },
  isSpeculating: true,
  agents: [
    { ...mockAgentPassed, id: "wc-claude-003", fitness: 0.91 },
    { ...mockAgentPassed, id: "wc-codex-003", fitness: 0.87 },
  ],
  leadingAgentId: "wc-claude-003",
  winnerAgentId: "wc-claude-003",
  generation: 5,
  bestFitness: 0.91,
  previewGlbUrl: "/preview/latest.glb",
  previewGodotUrl: "/godot-export/index.html",
  refinements: [],
  startedAt: Date.now() - 300000,
  completedAt: Date.now(),
};

/** World build state that failed */
export const mockBuildStateFailed: WorldBuildState = {
  issueId: "issue-004",
  status: "failed",
  prompt: "An underwater coral reef ecosystem",
  blueprint: mockBlueprint,
  isSpeculating: false,
  agents: [mockAgentFailed],
  generation: 2,
  bestFitness: 0.42,
  refinements: [],
  error: "Build failed: maximum iterations exceeded",
  startedAt: Date.now() - 180000,
};

/** World build state that is paused */
export const mockBuildStatePaused: WorldBuildState = {
  ...mockBuildStateGenerating,
  issueId: "issue-005",
  status: "paused",
};

/** Sample world template */
export const mockTemplate: WorldTemplate = {
  id: "cozy-room",
  title: "Cozy Room",
  description: "A warm, inviting interior space",
  icon: "\uD83C\uDFE0",
  promptText: "A cozy room with soft lighting and comfortable furniture",
  blueprintDefaults: {
    runtime: "three",
    outputs: ["viewer"],
    gates: ["fab-realism"],
    tags: ["interior"],
  },
  previewBullets: ["Soft lighting", "Cozy layout", "Natural materials"],
};

/** Sample recent world */
export const mockRecentWorld: RecentWorld = {
  id: "world-001",
  name: "My Test World",
  status: "complete",
  lastPrompt: "A test world prompt",
  updatedAt: Date.now() - 3600000,
  fitness: 0.85,
  generation: 4,
  lastRunOutcome: "pass",
};

/** Sample recent world that's building */
export const mockRecentWorldBuilding: RecentWorld = {
  id: "world-002",
  name: "Building World",
  status: "building",
  lastPrompt: "A world currently being built",
  updatedAt: Date.now(),
};
