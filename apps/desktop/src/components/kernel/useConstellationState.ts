import { useReducer, useCallback, useMemo } from "react";
import type { KernelWorkcell, KernelEvent, KernelSnapshot } from "@/types";

// ============================================================================
// Types
// ============================================================================

export interface ConstellationNode {
  id: string;
  issueId: string;
  toolchain: string | null;
  status: "idle" | "running" | "success" | "failed";
  progress: number;
  lastEvent: KernelEvent | null;
  color: string;
  brightness: number;
  ringFill: number;
}

export interface ConstellationEdge {
  id: string;
  source: string;
  target: string;
  type: "same_issue" | "dependency" | "speculate_variant";
  strength: number;
}

export type ConstellationMode = "browse" | "watch" | "triage";
export type TimeRange = "all" | "1h" | "24h" | "7d";

export interface ConstellationState {
  // Selection
  selectedWorkcellId: string | null;
  selectedIssueId: string | null;
  selectedRunId: string | null;
  hoveredWorkcellId: string | null;

  // Mode
  mode: ConstellationMode;

  // Filters
  filterToolchain: string | null;
  filterStatus: string | null;
  timeRange: TimeRange;

  // Camera
  cameraTarget: [number, number, number] | null;
  isAnimating: boolean;

  // Graph (derived from snapshot)
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];

  // Inspector
  inspectorOpen: boolean;
  inspectorTab: "issue" | "workcell" | "run";
}

// ============================================================================
// Constants
// ============================================================================

export const TOOLCHAIN_COLORS: Record<string, string> = {
  claude: "#8b5cf6", // violet
  codex: "#22d3ee", // cyan
  opencode: "#f97316", // orange
  crush: "#ef4444", // red
  default: "#6b7280", // gray
};

export const STATUS_BRIGHTNESS: Record<string, number> = {
  idle: 0.3,
  running: 0.9,
  success: 0.7,
  failed: 0.5,
};

// ============================================================================
// Actions
// ============================================================================

type ConstellationAction =
  | { type: "SELECT_WORKCELL"; id: string | null }
  | { type: "SELECT_ISSUE"; id: string | null }
  | { type: "SELECT_RUN"; id: string | null }
  | { type: "HOVER_WORKCELL"; id: string | null }
  | { type: "SET_MODE"; mode: ConstellationMode }
  | { type: "SET_FILTER_TOOLCHAIN"; toolchain: string | null }
  | { type: "SET_FILTER_STATUS"; status: string | null }
  | { type: "SET_TIME_RANGE"; range: TimeRange }
  | { type: "FLY_TO"; target: [number, number, number] | null }
  | { type: "SET_ANIMATING"; isAnimating: boolean }
  | { type: "UPDATE_GRAPH"; nodes: ConstellationNode[]; edges: ConstellationEdge[] }
  | { type: "SET_INSPECTOR_OPEN"; open: boolean }
  | { type: "SET_INSPECTOR_TAB"; tab: "issue" | "workcell" | "run" }
  | { type: "ESCAPE" };

// ============================================================================
// Initial State
// ============================================================================

const initialState: ConstellationState = {
  selectedWorkcellId: null,
  selectedIssueId: null,
  selectedRunId: null,
  hoveredWorkcellId: null,
  mode: "browse",
  filterToolchain: null,
  filterStatus: null,
  timeRange: "all",
  cameraTarget: null,
  isAnimating: false,
  nodes: [],
  edges: [],
  inspectorOpen: false,
  inspectorTab: "workcell",
};

// ============================================================================
// Reducer
// ============================================================================

function constellationReducer(
  state: ConstellationState,
  action: ConstellationAction
): ConstellationState {
  switch (action.type) {
    case "SELECT_WORKCELL":
      return {
        ...state,
        selectedWorkcellId: action.id,
        selectedIssueId: null,
        selectedRunId: null,
        inspectorOpen: action.id !== null,
        inspectorTab: action.id !== null ? "workcell" : state.inspectorTab,
      };

    case "SELECT_ISSUE":
      return {
        ...state,
        selectedWorkcellId: null,
        selectedIssueId: action.id,
        selectedRunId: null,
        inspectorOpen: action.id !== null,
        inspectorTab: action.id !== null ? "issue" : state.inspectorTab,
      };

    case "SELECT_RUN":
      return {
        ...state,
        selectedWorkcellId: null,
        selectedIssueId: null,
        selectedRunId: action.id,
        inspectorOpen: action.id !== null,
        inspectorTab: action.id !== null ? "run" : state.inspectorTab,
      };

    case "HOVER_WORKCELL":
      return { ...state, hoveredWorkcellId: action.id };

    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "SET_FILTER_TOOLCHAIN":
      return { ...state, filterToolchain: action.toolchain };

    case "SET_FILTER_STATUS":
      return { ...state, filterStatus: action.status };

    case "SET_TIME_RANGE":
      return { ...state, timeRange: action.range };

    case "FLY_TO":
      return { ...state, cameraTarget: action.target, isAnimating: true };

    case "SET_ANIMATING":
      if (state.isAnimating === action.isAnimating) return state;
      return { ...state, isAnimating: action.isAnimating };

    case "UPDATE_GRAPH":
      return { ...state, nodes: action.nodes, edges: action.edges };

    case "SET_INSPECTOR_OPEN":
      return { ...state, inspectorOpen: action.open };

    case "SET_INSPECTOR_TAB":
      return { ...state, inspectorTab: action.tab };

    case "ESCAPE":
      return {
        ...state,
        selectedWorkcellId: null,
        selectedIssueId: null,
        selectedRunId: null,
        cameraTarget: null,
        inspectorOpen: false,
      };

    default:
      return state;
  }
}

// ============================================================================
// Graph Derivation
// ============================================================================

function deriveStatus(proofStatus: string | null | undefined): ConstellationNode["status"] {
  if (!proofStatus) return "idle";
  const s = proofStatus.toLowerCase();
  if (s.includes("running") || s.includes("pending")) return "running";
  if (s.includes("pass") || s.includes("success")) return "success";
  if (s.includes("fail") || s.includes("error")) return "failed";
  return "idle";
}

function deriveProgress(workcell: KernelWorkcell, _events: KernelEvent[]): number {
  // Check workcell's own progress if available
  if (typeof workcell.progress === "number") {
    return Math.min(1, Math.max(0, workcell.progress));
  }

  // Derive from proof status
  const status = deriveStatus(workcell.proofStatus);
  if (status === "success") return 1;
  if (status === "failed") return 1;
  if (status === "running") return 0.5;
  return 0;
}

function findLastEvent(workcellId: string, events: KernelEvent[]): KernelEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].workcellId === workcellId) {
      return events[i];
    }
  }
  return null;
}

function groupBy<T>(items: T[], key: (item: T) => string | undefined): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    if (k !== undefined) {
      if (!result[k]) result[k] = [];
      result[k].push(item);
    }
  }
  return result;
}

export function deriveGraph(snapshot: KernelSnapshot | null): {
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
} {
  if (!snapshot) {
    return { nodes: [], edges: [] };
  }

  const { workcells, events, deps } = snapshot;

  // Build nodes
  const nodes: ConstellationNode[] = workcells.map((wc) => {
    const status = deriveStatus(wc.proofStatus);
    const toolchain = wc.toolchain ?? null;
    const color = TOOLCHAIN_COLORS[toolchain ?? "default"] ?? TOOLCHAIN_COLORS.default;

    return {
      id: wc.id,
      issueId: wc.issueId,
      toolchain,
      status,
      progress: deriveProgress(wc, events),
      lastEvent: findLastEvent(wc.id, events),
      color,
      brightness: STATUS_BRIGHTNESS[status],
      ringFill: deriveProgress(wc, events),
    };
  });

  const edges: ConstellationEdge[] = [];

  // 1. Same-issue edges
  const byIssue = groupBy(nodes, (n) => n.issueId);
  for (const [_issueId, wcNodes] of Object.entries(byIssue)) {
    if (wcNodes.length > 1) {
      // Connect first node to all others (star pattern)
      for (let i = 1; i < wcNodes.length; i++) {
        edges.push({
          id: `same_issue_${wcNodes[0].id}_${wcNodes[i].id}`,
          source: wcNodes[0].id,
          target: wcNodes[i].id,
          type: "same_issue",
          strength: 0.8,
        });
      }
    }
  }

  // 2. Speculate+vote edges (workcells with same speculateTag)
  const bySpecTag = groupBy(workcells, (w) => w.speculateTag ?? undefined);
  for (const [_tag, wcs] of Object.entries(bySpecTag)) {
    if (wcs.length > 1) {
      for (let i = 1; i < wcs.length; i++) {
        edges.push({
          id: `speculate_${wcs[0].id}_${wcs[i].id}`,
          source: wcs[0].id,
          target: wcs[i].id,
          type: "speculate_variant",
          strength: 1.0,
        });
      }
    }
  }

  // 3. Issue dependency edges
  if (deps) {
    for (const dep of deps) {
      const sourceWcs = byIssue[dep.fromId];
      const targetWcs = byIssue[dep.toId];
      if (sourceWcs?.length && targetWcs?.length) {
        edges.push({
          id: `dep_${dep.fromId}_${dep.toId}`,
          source: sourceWcs[0].id,
          target: targetWcs[0].id,
          type: "dependency",
          strength: 0.3,
        });
      }
    }
  }

  return { nodes, edges };
}

// ============================================================================
// Hook
// ============================================================================

export function useConstellationState(snapshot: KernelSnapshot | null) {
  const [state, dispatch] = useReducer(constellationReducer, initialState);

  // Derive graph from snapshot
  const graph = useMemo(() => deriveGraph(snapshot), [snapshot]);

  // Action creators
  const selectWorkcell = useCallback((id: string | null) => {
    dispatch({ type: "SELECT_WORKCELL", id: id === "" ? null : id });
  }, []);

  const selectIssue = useCallback((id: string | null) => {
    dispatch({ type: "SELECT_ISSUE", id: id === "" ? null : id });
  }, []);

  const selectRun = useCallback((id: string | null) => {
    dispatch({ type: "SELECT_RUN", id: id === "" ? null : id });
  }, []);

  const hoverWorkcell = useCallback((id: string | null) => {
    dispatch({ type: "HOVER_WORKCELL", id });
  }, []);

  const setMode = useCallback((mode: ConstellationMode) => {
    dispatch({ type: "SET_MODE", mode });
  }, []);

  const setFilterToolchain = useCallback((toolchain: string | null) => {
    dispatch({ type: "SET_FILTER_TOOLCHAIN", toolchain });
  }, []);

  const setFilterStatus = useCallback((status: string | null) => {
    dispatch({ type: "SET_FILTER_STATUS", status });
  }, []);

  const setTimeRange = useCallback((range: TimeRange) => {
    dispatch({ type: "SET_TIME_RANGE", range });
  }, []);

  const flyTo = useCallback((target: [number, number, number] | null) => {
    dispatch({ type: "FLY_TO", target });
  }, []);

  const setAnimating = useCallback((isAnimating: boolean) => {
    dispatch({ type: "SET_ANIMATING", isAnimating });
  }, []);

  const setInspectorOpen = useCallback((open: boolean) => {
    dispatch({ type: "SET_INSPECTOR_OPEN", open });
  }, []);

  const setInspectorTab = useCallback((tab: "issue" | "workcell" | "run") => {
    dispatch({ type: "SET_INSPECTOR_TAB", tab });
  }, []);

  const escape = useCallback(() => {
    dispatch({ type: "ESCAPE" });
  }, []);

  // Get selected entities from snapshot
  const selectedWorkcell = useMemo(() => {
    if (!snapshot || !state.selectedWorkcellId) return null;
    return snapshot.workcells.find((w) => w.id === state.selectedWorkcellId) ?? null;
  }, [snapshot, state.selectedWorkcellId]);

  const selectedIssue = useMemo(() => {
    if (!snapshot || !state.selectedIssueId) return null;
    return snapshot.issues.find((i) => i.id === state.selectedIssueId) ?? null;
  }, [snapshot, state.selectedIssueId]);

  // Filter nodes by mode
  const filteredNodes = useMemo(() => {
    let nodes = graph.nodes;

    // Mode filtering
    if (state.mode === "watch") {
      nodes = nodes.filter((n) => n.status === "running");
    } else if (state.mode === "triage") {
      nodes = nodes.filter((n) => n.status === "failed");
    }

    // Toolchain filter
    if (state.filterToolchain) {
      nodes = nodes.filter((n) => n.toolchain === state.filterToolchain);
    }

    // Status filter
    if (state.filterStatus) {
      nodes = nodes.filter((n) => n.status === state.filterStatus);
    }

    return nodes;
  }, [graph.nodes, state.mode, state.filterToolchain, state.filterStatus]);

  // Filter edges to only include those between visible nodes
  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [graph.edges, filteredNodes]);

  return {
    // State
    ...state,
    nodes: filteredNodes,
    edges: filteredEdges,
    allNodes: graph.nodes,
    allEdges: graph.edges,

    // Derived
    selectedWorkcell,
    selectedIssue,

    // Actions
    selectWorkcell,
    selectIssue,
    selectRun,
    hoverWorkcell,
    setMode,
    setFilterToolchain,
    setFilterStatus,
    setTimeRange,
    flyTo,
    setAnimating,
    setInspectorOpen,
    setInspectorTab,
    escape,
  };
}

export type ConstellationStateReturn = ReturnType<typeof useConstellationState>;
