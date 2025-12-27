import type { GlyphState } from "../Glyph/types";
import type { GraphNodeId, GraphSnapshot, LayoutMode } from "../Graph3D/types";

/**
 * Graph Lens Modes
 * Each mode answers a different question about the life graph
 */
export type GraphLensMode =
  | "overview" // "How does everything connect?"
  | "shrinkToNow" // "What matters right now?"
  | "routePlanning" // "How do I get to this goal?"
  | "attentionLeaks"; // "What's pulling me off-course?"

/**
 * Props for the GraphLens component
 */
export interface GraphLensProps {
  /** The full LifeGraph snapshot */
  graph: GraphSnapshot;

  /** Current view mode */
  mode: GraphLensMode;

  /** Focus node (required for non-overview modes) */
  focusNodeId?: GraphNodeId;

  /** Target goal for route planning */
  goalNodeId?: GraphNodeId;

  /** Computed path from focus to goal */
  routeNodeIds?: GraphNodeId[];

  /** Hot nodes (deadlines, high priority) */
  highImpactNodeIds?: GraphNodeId[];

  /** Distraction nodes for leaks mode */
  distractionNodeIds?: GraphNodeId[];

  /** Layout algorithm */
  layout?: LayoutMode;

  /** Custom class for container */
  className?: string;

  // --- Callbacks ---
  /** Called when user selects a node */
  onFocusChange?: (nodeId: GraphNodeId | null) => void;

  /** Called when mode should change */
  onModeChange?: (mode: GraphLensMode) => void;

  /** Called when user wants to plan from current focus */
  onPlanRequest?: (context: { focusNodeId: string; goalNodeId?: string }) => void;

  /** Called when user wants to address leaks */
  onLeaksRequest?: (distractionIds: string[]) => void;

  /** Called when user double-clicks a node */
  onNodeDoubleClick?: (nodeId: GraphNodeId) => void;
}

/**
 * Props for the inner 3D scene component
 */
export interface GraphLensSceneProps extends Omit<
  GraphLensProps,
  "className" | "onPlanRequest" | "onLeaksRequest"
> {
  /** Whether to show the HUD overlay */
  showHUD?: boolean;
}

/**
 * Derived state from mode for rendering
 */
export interface GraphLensModeConfig {
  glyphState: GlyphState;
  highlightedNodeIds: GraphNodeId[];
  focusedPath: GraphNodeId[];
  maxLabels: number;
  dimUnhighlighted: boolean;
}

/**
 * Dialogue content for Glyph based on mode
 */
export const GLYPH_DIALOGUES: Record<GraphLensMode, string> = {
  overview: "This is your whole life graph – everything connected in one place.",
  shrinkToNow: "Here's what matters most right now.",
  routePlanning: "I'm weaving a route to your goal...",
  attentionLeaks: "These branches leak away from your goal.",
};

/**
 * Compute mode-specific configuration
 */
export function getModeConfig(
  mode: GraphLensMode,
  focusNodeId?: GraphNodeId,
  highImpactNodeIds: GraphNodeId[] = [],
  routeNodeIds: GraphNodeId[] = [],
  distractionNodeIds: GraphNodeId[] = []
): GraphLensModeConfig {
  switch (mode) {
    case "overview":
      return {
        glyphState: "idle",
        highlightedNodeIds: [],
        focusedPath: [],
        maxLabels: 40,
        dimUnhighlighted: false,
      };

    case "shrinkToNow":
      return {
        glyphState: "responding",
        highlightedNodeIds: [focusNodeId!, ...highImpactNodeIds].filter(Boolean),
        focusedPath: [],
        maxLabels: 0,
        dimUnhighlighted: true,
      };

    case "routePlanning":
      return {
        glyphState: "thinking",
        highlightedNodeIds: [],
        focusedPath: routeNodeIds,
        maxLabels: 0,
        dimUnhighlighted: true,
      };

    case "attentionLeaks":
      return {
        glyphState: "responding",
        highlightedNodeIds: distractionNodeIds,
        focusedPath: focusNodeId ? [focusNodeId] : [],
        maxLabels: 0,
        dimUnhighlighted: true,
      };
  }
}
