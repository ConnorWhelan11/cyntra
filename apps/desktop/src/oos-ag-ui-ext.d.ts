declare module "@oos/ag-ui-ext" {
  import * as React from "react";

  export type OosUiVariant = string;

  export interface OosUiBaseProps {
    className?: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }

  export const Button: React.ComponentType<OosUiBaseProps & { variant?: OosUiVariant }>;
  export const Badge: React.ComponentType<OosUiBaseProps & { variant?: OosUiVariant }>;
  export const PixelCanvas: React.ComponentType<
    OosUiBaseProps & {
      gap?: number;
      speed?: number;
      colors?: string[];
      variant?: "default" | "icon";
      noFocus?: boolean;
    }
  >;

  export const Dialog: React.ComponentType<
    OosUiBaseProps & {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }
  >;
  export const DialogContent: React.ComponentType<OosUiBaseProps>;
  export const DialogHeader: React.ComponentType<OosUiBaseProps>;
  export const DialogTitle: React.ComponentType<OosUiBaseProps>;

  export const Input: React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>;
  export const Textarea: React.ComponentType<React.TextareaHTMLAttributes<HTMLTextAreaElement>>;

  // ---------------------------------------------------------------------------
  // Graph3D (minimal typings for desktop app usage)
  // ---------------------------------------------------------------------------

  export type GraphNodeId = string;

  export interface GraphNode {
    id: GraphNodeId;
    label: string;
    category?: string;
    weight?: number;
    status?: "normal" | "active" | "candidate" | "completed" | "blocked";
    pinned?: boolean;
    positionHint?: [number, number, number];
    meta?: Record<string, unknown>;
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
    weight?: number;
    directed?: boolean;
  }

  export interface GraphSnapshot {
    nodes: GraphNode[];
    edges: GraphEdge[];
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
    getNodePosition(id: GraphNodeId): unknown;
  }

  export interface Graph3DProps {
    graph: GraphSnapshot;

    selectedNodeId?: GraphNodeId | null;
    focusedPath?: GraphNodeId[];
    highlightedNodeIds?: GraphNodeId[];
    dimUnhighlighted?: boolean;

    layout?: LayoutMode;
    layoutOptions?: LayoutOptions;

    agentActivity?: {
      mode: "idle" | "weaving" | "updating" | "explaining";
      activeNodeIds?: GraphNodeId[];
      activeEdgeIds?: string[];
    };

    onNodeClick?: (id: GraphNodeId) => void;
    onNodeDoubleClick?: (id: GraphNodeId) => void;
    onNodeHoverChange?: (id: GraphNodeId | null) => void;
    onBackgroundClick?: () => void;

    showGrid?: boolean;
    enableInstancing?: boolean;
    maxNodeCountForLabels?: number;
    embedMode?: boolean;
  }

  export const Graph3D: React.ForwardRefExoticComponent<
    Graph3DProps & React.RefAttributes<Graph3DHandle>
  >;
}
