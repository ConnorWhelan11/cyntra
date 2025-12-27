"use client";

import { Canvas } from "@react-three/fiber";
import React, { useCallback, useState } from "react";
import * as THREE from "three";

import { cn } from "../../../lib/utils";
import type { GraphNodeId } from "../Graph3D/types";

import { GraphLensScene } from "./GraphLensScene";
import { GLYPH_DIALOGUES, type GraphLensMode, type GraphLensProps } from "./types";

/**
 * GraphLens - Full graph visualization lens with HUD
 *
 * Core Question: "How does everything in my life connect right now?"
 */
export const GraphLens: React.FC<GraphLensProps> = ({
  graph,
  mode: initialMode = "overview",
  focusNodeId: initialFocusNodeId,
  goalNodeId,
  routeNodeIds = [],
  highImpactNodeIds = [],
  distractionNodeIds = [],
  layout = "fibonacci",
  className,
  onFocusChange,
  onModeChange,
  onPlanRequest,
  onLeaksRequest,
  onNodeDoubleClick,
}) => {
  // Local state for controlled/uncontrolled mode
  const [internalMode, setInternalMode] = useState<GraphLensMode>(initialMode);
  const [internalFocusNodeId, setInternalFocusNodeId] = useState<GraphNodeId | undefined>(
    initialFocusNodeId
  );

  const mode = initialMode ?? internalMode;
  const focusNodeId = initialFocusNodeId ?? internalFocusNodeId;

  // Handle focus change
  const handleFocusChange = useCallback(
    (nodeId: GraphNodeId | null) => {
      setInternalFocusNodeId(nodeId ?? undefined);
      onFocusChange?.(nodeId);
    },
    [onFocusChange]
  );

  // Handle mode change
  const handleModeChange = useCallback(
    (newMode: GraphLensMode) => {
      setInternalMode(newMode);
      onModeChange?.(newMode);
    },
    [onModeChange]
  );

  // Handle "Plan this" CTA
  const handlePlanThis = useCallback(() => {
    if (focusNodeId) {
      onPlanRequest?.({
        focusNodeId,
        goalNodeId,
      });
    }
  }, [focusNodeId, goalNodeId, onPlanRequest]);

  // Handle "Show leaks" CTA
  const handleShowLeaks = useCallback(() => {
    onLeaksRequest?.(distractionNodeIds);
  }, [distractionNodeIds, onLeaksRequest]);

  // Get dialogue for current mode
  const dialogue = GLYPH_DIALOGUES[mode];

  // Find focus node label
  const focusNode = graph.nodes.find((n) => n.id === focusNodeId);

  return (
    <div
      className={cn(
        "relative w-full h-[600px] rounded-2xl border border-white/10",
        "bg-gradient-to-br from-[#020312] via-black to-[#050818] overflow-hidden",
        className
      )}
    >
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 5, 15], fov: 45 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.9,
        }}
      >
        <GraphLensScene
          graph={graph}
          mode={mode}
          focusNodeId={focusNodeId}
          goalNodeId={goalNodeId}
          routeNodeIds={routeNodeIds}
          highImpactNodeIds={highImpactNodeIds}
          distractionNodeIds={distractionNodeIds}
          layout={layout}
          onFocusChange={handleFocusChange}
          onModeChange={handleModeChange}
          onNodeDoubleClick={onNodeDoubleClick}
        />
      </Canvas>

      {/* HUD Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top Bar - Mode Indicator */}
        <div className="absolute top-4 left-4 flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Mode</span>
            <span className="ml-2 text-sm font-mono text-cyan-300">{mode}</span>
          </div>

          {focusNode && (
            <div className="px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 backdrop-blur-sm">
              <span className="text-[10px] uppercase tracking-widest text-white/40">Focus</span>
              <span className="ml-2 text-sm font-mono text-white/80">{focusNode.label}</span>
            </div>
          )}
        </div>

        {/* Bottom Bar - Dialogue + CTAs */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 w-full max-w-2xl px-4">
          {/* Dialogue */}
          <div className="px-5 py-2.5 rounded-full bg-black/80 border border-white/20 backdrop-blur-md shadow-xl shadow-cyan-900/20">
            <span className="text-sm font-mono text-cyan-200">&quot;{dialogue}&quot;</span>
          </div>

          {/* CTAs */}
          <div className="flex gap-3 pointer-events-auto">
            {mode !== "overview" && focusNodeId && (
              <button
                onClick={handlePlanThis}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium",
                  "bg-cyan-500/20 border border-cyan-400/30 text-cyan-200",
                  "hover:bg-cyan-500/30 hover:border-cyan-400/50",
                  "transition-all duration-200"
                )}
              >
                Plan this
              </button>
            )}

            {mode === "attentionLeaks" && distractionNodeIds.length > 0 && (
              <button
                onClick={handleShowLeaks}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium",
                  "bg-red-500/20 border border-red-400/30 text-red-200",
                  "hover:bg-red-500/30 hover:border-red-400/50",
                  "transition-all duration-200"
                )}
              >
                Prune distractions
              </button>
            )}

            {mode !== "overview" && (
              <button
                onClick={() => handleModeChange("overview")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium",
                  "bg-white/5 border border-white/10 text-white/60",
                  "hover:bg-white/10 hover:text-white/80",
                  "transition-all duration-200"
                )}
              >
                Zoom out
              </button>
            )}
          </div>

          {/* Status Pills */}
          <div className="flex gap-4 text-[10px] uppercase tracking-widest text-white/30">
            <span>
              {graph.nodes.length} nodes · {graph.edges.length} edges
            </span>
            {mode === "attentionLeaks" && (
              <span className="text-red-400/60">{distractionNodeIds.length} leaks detected</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GraphLens;
