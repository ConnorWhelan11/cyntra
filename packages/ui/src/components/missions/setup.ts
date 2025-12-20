/**
 * Mission system setup — registers default tools and layouts
 * Call this once at app/story initialization
 */

import { registerLayouts, registerTools } from "../../missions/registry";
import type { MissionLayoutPreset, MissionTool } from "../../missions/types";

import { NotesTool } from "./tools/NotesTool";
import { DrawboardTool } from "./tools/DrawboardTool";
import { PracticeQuestionTool } from "./tools/PracticeQuestionTool";
import { CommsTool } from "./tools/CommsTool";
import { GlyphWorkspaceTool } from "./tools/GlyphWorkspaceTool";

import { FocusSplitLayout } from "./layouts/FocusSplitLayout";
import { TabsWorkspaceLayout } from "./layouts/TabsWorkspaceLayout";
import { ExternalSidecarLayout } from "./layouts/ExternalSidecarLayout";

// ─────────────────────────────────────────────────────────────────────────────
// Default Tools
// ─────────────────────────────────────────────────────────────────────────────

export const defaultTools: MissionTool[] = [
  NotesTool,
  DrawboardTool,
  PracticeQuestionTool,
  CommsTool,
  GlyphWorkspaceTool,
];

// ─────────────────────────────────────────────────────────────────────────────
// Default Layout Presets
// ─────────────────────────────────────────────────────────────────────────────

export const defaultLayouts: MissionLayoutPreset[] = [
  {
    id: "FocusSplit",
    title: "Focus Split",
    description: "Deep focus on a primary tool with a stable right rail",
    Component: FocusSplitLayout,
  },
  {
    id: "TabsWorkspace",
    title: "Tabs Workspace",
    description: "Fast switching between multiple tool surfaces",
    Component: TabsWorkspaceLayout,
  },
  {
    id: "ExternalSidecar",
    title: "External Sidecar",
    description: "Work in external apps with mission tracking",
    Component: ExternalSidecarLayout,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Setup Function
// ─────────────────────────────────────────────────────────────────────────────

let isInitialized = false;

export function setupMissionSystem(): void {
  if (isInitialized) return;

  registerTools(defaultTools);
  registerLayouts(defaultLayouts);

  isInitialized = true;
}

// Auto-setup when module is imported (for convenience in Storybook)
if (typeof window !== "undefined") {
  setupMissionSystem();
}
