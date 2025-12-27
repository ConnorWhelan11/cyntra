/**
 * Glia Missions v0.1 — Wedge Definitions
 * Example mission definitions from spec
 */

import type { MissionDefinition } from "../../missions/types";

// ─────────────────────────────────────────────────────────────────────────────
// Wedge A: Solo Deep Work Study Mission
// ─────────────────────────────────────────────────────────────────────────────

export const MasterOrganicChemistry: MissionDefinition = {
  id: "mission.master-organic-chemistry",
  version: "0.1",
  title: "Master Organic Chemistry",
  description: "Deep work + recall checks focused on core O-Chem mechanisms.",
  kind: "study",
  mode: "solo",
  difficulty: "Hard",
  estimatedDurationMinutes: 60,
  rewardXP: 800,
  layout: "FocusSplit",
  tools: [
    {
      toolId: "glia.glyphWorkspace",
      placement: { slot: "secondary", defaultOpen: true, tabLabel: "Workspace" },
    },
    {
      toolId: "glia.notes",
      required: true,
      placement: { slot: "primary", defaultOpen: true },
    },
    {
      toolId: "glia.practiceQuestion",
      placement: { slot: "dock", defaultOpen: true, tabLabel: "Recall Check" },
    },
    {
      toolId: "glia.studyTimeline",
      placement: { slot: "dock", defaultOpen: false },
    },
  ],
  steps: [
    {
      id: "s1-brief",
      title: "Briefing: Set your targets",
      description: "Identify what you want to learn in this session.",
      kind: "instruction",
      primaryToolId: "glia.notes",
      completion: { kind: "toolEvent", toolId: "glia.notes", name: "notes/changed", count: 1 },
    },
    {
      id: "s2-deepwork",
      title: "Deep work: mechanisms + annotations (25 min)",
      description: "Focus on understanding reaction mechanisms. Annotate your notes.",
      kind: "deepWork",
      primaryToolId: "glia.notes",
      completion: { kind: "time", seconds: 25 * 60, autoAdvance: true },
    },
    {
      id: "s3-checkpoint",
      title: "Checkpoint: quick self-audit",
      description: "Take a moment to assess your understanding.",
      kind: "instruction",
      completion: { kind: "manual" },
    },
    {
      id: "s4-recall",
      title: "Recall check: 5 questions",
      description: "Test your recall with practice questions.",
      kind: "practice",
      primaryToolId: "glia.practiceQuestion",
      completion: {
        kind: "toolEvent",
        toolId: "glia.practiceQuestion",
        name: "practice/submitted",
        count: 5,
      },
    },
    {
      id: "s5-debrief",
      title: "Debrief: summarize + next steps",
      description: "Summarize what you learned and plan next steps.",
      kind: "instruction",
      primaryToolId: "glia.notes",
      completion: { kind: "manual" },
    },
  ],
  checkpoints: [
    {
      id: "cp-30m",
      title: "Midpoint checkpoint",
      trigger: { kind: "time", secondsFromStart: 30 * 60 },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Wedge B: Pod Lecture Mission
// ─────────────────────────────────────────────────────────────────────────────

export const FrankStarlingPodWorkshop: MissionDefinition = {
  id: "mission.frank-starling-pod-workshop",
  version: "0.1",
  title: "Frank–Starling Pod Workshop",
  description: "Collaborative concept build: diagrams + shared notes + discussion prompts.",
  kind: "lecture",
  mode: "pod",
  difficulty: "Medium",
  estimatedDurationMinutes: 75,
  rewardXP: 600,
  layout: "TabsWorkspace",
  tools: [
    {
      toolId: "glia.glyphWorkspace",
      placement: { slot: "primary", defaultOpen: true, tabLabel: "Workspace" },
    },
    {
      toolId: "glia.notes",
      required: true,
      placement: { slot: "primary", defaultOpen: true, tabLabel: "Notes" },
    },
    {
      toolId: "glia.drawboard",
      required: true,
      placement: { slot: "primary", defaultOpen: true, tabLabel: "Drawboard" },
    },
    {
      toolId: "glia.comms",
      required: true,
      placement: { slot: "primary", defaultOpen: true, tabLabel: "Comms" },
    },
  ],
  steps: [
    {
      id: "p1-brief",
      title: "Briefing: align on objective + roles",
      description: "Discuss goals and assign roles within the pod.",
      kind: "discussion",
      completion: { kind: "manual" },
    },
    {
      id: "p2-model",
      title: "Build the Frank–Starling curve together (20 min)",
      description: "Collaboratively draw and annotate the Frank-Starling curve.",
      kind: "discussion",
      primaryToolId: "glia.drawboard",
      completion: { kind: "time", seconds: 20 * 60 },
    },
    {
      id: "p3-checkpoint",
      title: "Checkpoint: each person explains the curve in 2 sentences",
      description: "Take turns explaining the concept to verify understanding.",
      kind: "discussion",
      completion: { kind: "manual" },
    },
    {
      id: "p4-apply",
      title: "Apply: preload/afterload scenarios",
      description: "Work through clinical scenarios involving preload and afterload changes.",
      kind: "discussion",
      primaryToolId: "glia.notes",
      completion: { kind: "manual" },
    },
    {
      id: "p5-debrief",
      title: "Debrief: action items + weak points",
      description: "Identify areas for further study and create action items.",
      kind: "discussion",
      completion: { kind: "manual" },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Additional Example: External Sidecar Mission
// ─────────────────────────────────────────────────────────────────────────────

export const UWorldPracticeSession: MissionDefinition = {
  id: "mission.uworld-practice-session",
  version: "0.1",
  title: "UWorld Practice Session",
  description: "Timed practice in UWorld with quick notes capture.",
  kind: "practice",
  mode: "solo",
  difficulty: "Medium",
  estimatedDurationMinutes: 45,
  rewardXP: 400,
  layout: "ExternalSidecar",
  tools: [
    {
      toolId: "glia.notes",
      required: true,
      placement: { slot: "secondary", defaultOpen: true, tabLabel: "Quick Notes" },
    },
    {
      toolId: "glia.glyphWorkspace",
      placement: { slot: "rail", defaultOpen: true, tabLabel: "Workspace" },
    },
  ],
  steps: [
    {
      id: "ext-1-setup",
      title: "Setup: Open UWorld and select block",
      description: "Navigate to UWorld and start a timed practice block.",
      kind: "external",
      completion: { kind: "manual" },
    },
    {
      id: "ext-2-practice",
      title: "Practice: Complete 20 questions (35 min)",
      description: "Work through questions at a steady pace. Capture key insights in notes.",
      kind: "external",
      completion: { kind: "time", seconds: 35 * 60 },
    },
    {
      id: "ext-3-review",
      title: "Review: Note down missed concepts",
      description: "Review incorrect answers and note patterns for future study.",
      kind: "instruction",
      primaryToolId: "glia.notes",
      completion: { kind: "manual" },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// All Definitions Export
// ─────────────────────────────────────────────────────────────────────────────

export const missionDefinitions: MissionDefinition[] = [
  MasterOrganicChemistry,
  FrankStarlingPodWorkshop,
  UWorldPracticeSession,
];

export const getMissionDefinition = (id: string): MissionDefinition | undefined => {
  return missionDefinitions.find((d) => d.id === id);
};
