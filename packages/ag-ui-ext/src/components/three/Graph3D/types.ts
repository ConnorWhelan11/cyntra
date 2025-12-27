import * as THREE from "three";

export type GraphNodeId = string;

export interface GraphNode {
  id: GraphNodeId;
  label: string;
  category?: string;
  weight?: number; // importance / centrality (0-1)
  status?: "normal" | "active" | "candidate" | "completed" | "blocked";
  pinned?: boolean;
  positionHint?: [number, number, number]; // optional fixed/initial pos
  meta?: Record<string, unknown>; // arbitrary agent data
  // Runtime position (used by layout engine)
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface GraphEdge {
  id: string;
  source: GraphNodeId;
  target: GraphNodeId;
  type?: "default" | "requires" | "relates" | "suggested" | "agentPath" | "distraction";
  weight?: number; // strength
  directed?: boolean;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AgentActivity {
  mode: "idle" | "weaving" | "updating" | "explaining";
  activeNodeIds?: GraphNodeId[];
  activeEdgeIds?: string[];
}

export type LayoutMode = "fibonacci" | "force" | "ring" | "custom";

export interface LayoutOptions {
  spacing?: number;
  radius?: number;
  repelStrength?: number;
  linkStrength?: number;
  gravity?: number;
  animateLayout?: boolean;
  iterations?: number;
}

export interface Graph3DHandle {
  focusNode(id: GraphNodeId, options?: { animateCamera?: boolean }): void;
  pulseNode(id: GraphNodeId, options?: { duration?: number }): void;
  highlightPath(ids: GraphNodeId[], options?: { animate?: boolean }): void;
  showDiff(
    oldGraph: GraphSnapshot,
    newGraph: GraphSnapshot,
    options?: { mode?: "fade" | "morph" }
  ): void;
  setLayout(layout: LayoutMode, opts?: LayoutOptions): void;
  getNodePosition(id: GraphNodeId): THREE.Vector3 | undefined;
}
