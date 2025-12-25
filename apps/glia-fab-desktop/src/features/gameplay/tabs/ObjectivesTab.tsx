import React, { useMemo, useState, useCallback, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Graph3D } from "@oos/ui";
import type { GraphSnapshot, GraphNode, GraphEdge, LayoutMode, Graph3DHandle } from "@oos/ui";
import type { ObjectiveConfig, ObjectiveStatus, ObjectiveType } from "@/types";

interface ObjectivesTabProps {
  objectives: ObjectiveConfig[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  runtimeStates?: Record<string, ObjectiveStatus>;
  onAddObjective?: () => void;
}

/**
 * ObjectivesTab - Visualizes objectives as a 3D DAG using Graph3D
 *
 * Features:
 * - Force-directed layout for DAG visualization
 * - Color-coded by objective type (main, side, discovery, final)
 * - Status indicators (locked, active, completed, failed)
 * - Click to select and inspect objectives
 * - Keyboard navigation between nodes
 */
export function ObjectivesTab({
  objectives,
  selectedId,
  onSelect,
  runtimeStates = {},
  onAddObjective,
}: ObjectivesTabProps) {
  const [layout, setLayout] = useState<LayoutMode>("force");
  const graphRef = useRef<Graph3DHandle>(null);

  // Convert objectives to graph format
  const graphData: GraphSnapshot = useMemo(() => {
    const nodes: GraphNode[] = objectives.map((obj) => ({
      id: obj.id,
      label: obj.description,
      category: obj.type,
      weight: getObjectiveWeight(obj.type),
      status: mapObjectiveStatus(runtimeStates[obj.id] || "locked"),
      meta: {
        type: obj.type,
        requires: obj.requires || [],
        hint: obj.hint,
        hidden: obj.hidden,
      },
    }));

    const edges: GraphEdge[] = objectives.flatMap((obj) =>
      (obj.requires || []).map((reqId) => ({
        id: `${reqId}->${obj.id}`,
        source: reqId,
        target: obj.id,
        type: "requires" as const,
        directed: true,
        weight: 1,
      }))
    );

    return { nodes, edges };
  }, [objectives, runtimeStates]);

  const handleNodeClick = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect]
  );

  const handleNodeDoubleClick = useCallback(
    (id: string) => {
      // Focus camera on node
      graphRef.current?.focusNode(id, { animateCamera: true });
    },
    []
  );

  const handleBackgroundClick = useCallback(() => {
    onSelect(null);
  }, [onSelect]);

  const handleZoomToFit = useCallback(() => {
    // Reset camera position
    if (graphRef.current && objectives.length > 0) {
      graphRef.current.focusNode(objectives[0].id, { animateCamera: true });
    }
  }, [objectives]);

  // Get highlighted path from selected node
  const highlightedPath = useMemo(() => {
    if (!selectedId) return [];
    const selected = objectives.find((o) => o.id === selectedId);
    if (!selected) return [];
    return [selectedId, ...(selected.requires || [])];
  }, [selectedId, objectives]);

  return (
    <div className="objectives-tab">
      {/* Toolbar */}
      <div className="objectives-toolbar">
        <div className="objectives-toolbar-left">
          <label className="objectives-layout-label">
            Layout:
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value as LayoutMode)}
              className="objectives-layout-select"
            >
              <option value="force">Force</option>
              <option value="fibonacci">Fibonacci</option>
              <option value="ring">Ring</option>
            </select>
          </label>
        </div>
        <div className="objectives-toolbar-right">
          <button
            className="objectives-toolbar-btn"
            onClick={handleZoomToFit}
            title="Zoom to fit"
          >
            ⤢ Zoom to Fit
          </button>
          <button
            className="objectives-toolbar-btn objectives-toolbar-btn--primary"
            onClick={onAddObjective}
            disabled={!onAddObjective}
          >
            + Add Objective
          </button>
        </div>
      </div>

      {/* 3D Graph Canvas */}
      <div className="objectives-canvas">
        {objectives.length === 0 ? (
          <div className="objectives-empty">
            <p>No objectives defined</p>
            <p className="objectives-empty-hint">
              Add objectives to define the quest structure
            </p>
          </div>
        ) : (
          <Canvas
            camera={{ position: [0, 5, 15], fov: 50 }}
            dpr={[1, 2]}
            style={{ background: "transparent" }}
          >
            <ambientLight intensity={0.4} />
            <pointLight position={[10, 10, 10]} intensity={0.6} />

            <Graph3D
              ref={graphRef}
              graph={graphData}
              layout={layout}
              layoutOptions={{
                repelStrength: 30,
                linkStrength: 0.5,
                gravity: 0.02,
                animateLayout: true,
              }}
              selectedNodeId={selectedId}
              focusedPath={highlightedPath}
              dimUnhighlighted={!!selectedId}
              maxNodeCountForLabels={20}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onBackgroundClick={handleBackgroundClick}
              showGrid={false}
              embedMode
            />

            <OrbitControls
              enablePan
              enableZoom
              enableRotate
              minDistance={5}
              maxDistance={50}
            />
          </Canvas>
        )}
      </div>

      {/* Legend */}
      <div className="objectives-legend">
        <div className="objectives-legend-title">Legend</div>
        <div className="objectives-legend-items">
          <div className="objectives-legend-item">
            <span
              className="objectives-legend-dot"
              style={{ background: getTypeColor("main") }}
            />
            <span>Main Quest</span>
          </div>
          <div className="objectives-legend-item">
            <span
              className="objectives-legend-dot"
              style={{ background: getTypeColor("side") }}
            />
            <span>Side Quest</span>
          </div>
          <div className="objectives-legend-item">
            <span
              className="objectives-legend-dot"
              style={{ background: getTypeColor("discovery") }}
            />
            <span>Discovery</span>
          </div>
          <div className="objectives-legend-item">
            <span
              className="objectives-legend-dot"
              style={{ background: getTypeColor("final") }}
            />
            <span>Final</span>
          </div>
          <div className="objectives-legend-divider" />
          <div className="objectives-legend-item">
            <span className="objectives-legend-status">●</span>
            <span>Completed</span>
          </div>
          <div className="objectives-legend-item">
            <span className="objectives-legend-status objectives-legend-status--active">
              ◐
            </span>
            <span>Active</span>
          </div>
          <div className="objectives-legend-item">
            <span className="objectives-legend-status objectives-legend-status--locked">
              ○
            </span>
            <span>Locked</span>
          </div>
        </div>
      </div>

    </div>
  );
}

// Helper functions

function getObjectiveWeight(type: ObjectiveType): number {
  switch (type) {
    case "final":
      return 1;
    case "main":
      return 0.8;
    case "side":
      return 0.5;
    case "discovery":
      return 0.3;
    default:
      return 0.5;
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case "main":
      return "#6366f1"; // Indigo
    case "side":
      return "#fbbf24"; // Amber
    case "discovery":
      return "#4ade80"; // Green
    case "final":
      return "#f87171"; // Red
    default:
      return "#888888";
  }
}

function mapObjectiveStatus(
  status: ObjectiveStatus
): "normal" | "active" | "completed" | "blocked" {
  switch (status) {
    case "completed":
      return "completed";
    case "active":
      return "active";
    case "failed":
      return "blocked";
    case "locked":
    default:
      return "normal";
  }
}

export default ObjectivesTab;
