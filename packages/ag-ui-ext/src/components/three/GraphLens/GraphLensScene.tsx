"use client";

import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import React, { useCallback, useRef } from "react";
import * as THREE from "three";

import { GlyphObject } from "../Glyph/GlyphObject";
import type { GlyphState } from "../Glyph/types";
import { Graph3D } from "../Graph3D/Graph3D";
import type { Graph3DHandle, GraphNodeId } from "../Graph3D/types";

import { getModeConfig, type GraphLensSceneProps } from "./types";

/**
 * GraphGlyph - The animated Glyph that follows a target position
 */
interface GraphGlyphProps {
  state: GlyphState;
  targetPosRef: React.MutableRefObject<THREE.Vector3>;
  variant?: "default" | "inGraph";
}

const GraphGlyph: React.FC<GraphGlyphProps> = ({ state, targetPosRef, variant = "inGraph" }) => {
  const rootRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!rootRef.current) return;
    // Smoothly follow the target ref
    rootRef.current.position.lerp(targetPosRef.current, 0.05);
  });

  return (
    <group ref={rootRef}>
      <GlyphObject state={state} variant={variant} />
    </group>
  );
};

/**
 * GraphLensScene - The 3D scene for the Graph lens
 * Handles environment, Graph3D, Glyph, and post-processing
 */
export const GraphLensScene: React.FC<GraphLensSceneProps> = ({
  graph,
  mode,
  focusNodeId,
  goalNodeId,
  routeNodeIds = [],
  highImpactNodeIds = [],
  distractionNodeIds = [],
  layout = "fibonacci",
  onFocusChange,
  onModeChange,
  onNodeDoubleClick,
}) => {
  const graphRef = useRef<Graph3DHandle>(null);

  // Mutable ref for Glyph target position (avoids re-renders)
  const targetPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  // Compute mode-specific configuration
  const modeConfig = getModeConfig(
    mode,
    focusNodeId,
    highImpactNodeIds,
    routeNodeIds,
    distractionNodeIds
  );

  // Animate Glyph position based on mode
  useFrame((state) => {
    if (!graphRef.current) return;

    if (mode === "overview") {
      // Slow orbit around origin in overview mode
      const t = state.clock.getElapsedTime();
      targetPosRef.current.set(Math.sin(t * 0.2) * 5, 2, Math.cos(t * 0.2) * 5);
    } else if (focusNodeId) {
      // Follow focus node in other modes
      const nodePos = graphRef.current.getNodePosition(focusNodeId);
      if (nodePos) {
        targetPosRef.current.copy(nodePos).add(new THREE.Vector3(0, 2.5, 2));

        // In route planning, oscillate between focus and goal
        if (mode === "routePlanning" && goalNodeId) {
          const goalPos = graphRef.current.getNodePosition(goalNodeId);
          if (goalPos) {
            const time = state.clock.getElapsedTime();
            const alpha = (Math.sin(time) + 1) / 2; // 0 to 1
            const offsetGoal = goalPos.clone().add(new THREE.Vector3(0, 2.5, 2));
            targetPosRef.current.lerp(offsetGoal, alpha);
          }
        }
      }
    }
  });

  // Handle node click
  const handleNodeClick = useCallback(
    (nodeId: GraphNodeId) => {
      onFocusChange?.(nodeId);
    },
    [onFocusChange]
  );

  // Handle node double click
  const handleNodeDoubleClick = useCallback(
    (nodeId: GraphNodeId) => {
      onNodeDoubleClick?.(nodeId);
      // Toggle between overview and shrinkToNow if no specific handler
      if (!onNodeDoubleClick && onModeChange) {
        onModeChange(mode === "overview" ? "shrinkToNow" : "overview");
      }
    },
    [onNodeDoubleClick, onModeChange, mode]
  );

  // Handle background click
  const handleBackgroundClick = useCallback(() => {
    onFocusChange?.(null);
    if (mode !== "overview") {
      onModeChange?.("overview");
    }
  }, [onFocusChange, onModeChange, mode]);

  return (
    <>
      {/* Environment */}
      <color attach="background" args={["#050812"]} />
      <fog attach="fog" args={["#050812", 18, 60]} />

      {/* Cinematic Lighting */}
      <ambientLight intensity={0.12} />
      <directionalLight position={[8, 10, 5]} intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#4060ff" />
      <pointLight position={[-10, -5, -10]} intensity={0.3} color="#ff0080" />

      {/* The Graph */}
      <Graph3D
        ref={graphRef}
        graph={graph}
        layout={layout}
        dimUnhighlighted={modeConfig.dimUnhighlighted}
        highlightedNodeIds={modeConfig.highlightedNodeIds}
        focusedPath={modeConfig.focusedPath}
        selectedNodeId={focusNodeId}
        maxNodeCountForLabels={modeConfig.maxLabels}
        agentActivity={{
          mode: modeConfig.glyphState === "thinking" ? "weaving" : "idle",
        }}
        embedMode={true}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onBackgroundClick={handleBackgroundClick}
      />

      {/* The Glyph */}
      <GraphGlyph state={modeConfig.glyphState} targetPosRef={targetPosRef} variant="inGraph" />

      {/* Post Processing */}
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.25} luminanceThreshold={0.8} luminanceSmoothing={0.65} />
      </EffectComposer>
    </>
  );
};

export default GraphLensScene;
