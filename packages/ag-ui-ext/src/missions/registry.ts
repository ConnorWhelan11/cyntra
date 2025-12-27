/**
 * Glia Missions v0.1 — Registry
 * Tool and Layout preset registries
 */

import type {
  MissionLayoutPreset,
  MissionLayoutPresetId,
  MissionTool,
  MissionToolId,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Registry
// ─────────────────────────────────────────────────────────────────────────────

const toolRegistry = new Map<MissionToolId, MissionTool>();

export function registerTool(tool: MissionTool): void {
  if (toolRegistry.has(tool.id)) {
    console.warn(`[MissionRegistry] Overwriting existing tool: ${tool.id}`);
  }
  toolRegistry.set(tool.id, tool);
}

export function getTool(toolId: MissionToolId): MissionTool | undefined {
  return toolRegistry.get(toolId);
}

export function getAllTools(): MissionTool[] {
  return Array.from(toolRegistry.values());
}

export function hasToolRegistered(toolId: MissionToolId): boolean {
  return toolRegistry.has(toolId);
}

export function unregisterTool(toolId: MissionToolId): boolean {
  return toolRegistry.delete(toolId);
}

export function clearToolRegistry(): void {
  toolRegistry.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Preset Registry
// ─────────────────────────────────────────────────────────────────────────────

const layoutRegistry = new Map<MissionLayoutPresetId, MissionLayoutPreset>();

export function registerLayout(layout: MissionLayoutPreset): void {
  if (layoutRegistry.has(layout.id)) {
    console.warn(`[MissionRegistry] Overwriting existing layout: ${layout.id}`);
  }
  layoutRegistry.set(layout.id, layout);
}

export function getLayout(layoutId: MissionLayoutPresetId): MissionLayoutPreset | undefined {
  return layoutRegistry.get(layoutId);
}

export function getAllLayouts(): MissionLayoutPreset[] {
  return Array.from(layoutRegistry.values());
}

export function hasLayoutRegistered(layoutId: MissionLayoutPresetId): boolean {
  return layoutRegistry.has(layoutId);
}

export function unregisterLayout(layoutId: MissionLayoutPresetId): boolean {
  return layoutRegistry.delete(layoutId);
}

export function clearLayoutRegistry(): void {
  layoutRegistry.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Registration Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function registerTools(tools: MissionTool[]): void {
  tools.forEach(registerTool);
}

export function registerLayouts(layouts: MissionLayoutPreset[]): void {
  layouts.forEach(registerLayout);
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard Tool IDs (constants for type safety)
// ─────────────────────────────────────────────────────────────────────────────

export const TOOL_IDS = {
  NOTES: "glia.notes",
  DRAWBOARD: "glia.drawboard",
  PRACTICE_QUESTION: "glia.practiceQuestion",
  COMMS: "glia.comms",
  STUDY_TIMELINE: "glia.studyTimeline",
  TUTOR: "glia.tutor",
} as const;

export type StandardToolId = (typeof TOOL_IDS)[keyof typeof TOOL_IDS];
