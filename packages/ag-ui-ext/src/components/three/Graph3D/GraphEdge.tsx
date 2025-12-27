import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { Line2 } from "three-stdlib";
import { GraphEdge as GraphEdgeData } from "./types";

interface GraphEdgeProps {
  edge: GraphEdgeData;
  start: THREE.Vector3;
  end: THREE.Vector3;
  isPathActive?: boolean;
  isDimmed?: boolean;
}

export const GraphEdge = ({ edge, start, end, isPathActive, isDimmed }: GraphEdgeProps) => {
  const lineRef = useRef<Line2>(null);

  // Determine style based on type and state
  const isAgentPath = edge.type === "agentPath";
  const isSuggested = edge.type === "suggested";
  const isDistraction = edge.type === "distraction";

  // Colors & Styles per spec
  // Path: Cyan tint, thicker
  // Suggested: Bright but transparent, dashed
  // Distraction: Warm orange/red, dashed
  // Default: Soft gray-blue

  const color =
    isPathActive || isAgentPath
      ? "#00f0ff" // Cyan
      : isDistraction
        ? "#ff6b4a" // Warm Orange/Red
        : isSuggested
          ? "#e0e7ff" // Cool white/blue
          : "#a0b0d0"; // Soft gray-blue

  const opacity = isDimmed
    ? 0.03 // Faded out
    : isPathActive || isAgentPath
      ? 0.85 // High visibility
      : isDistraction
        ? 0.6 // Visible but ghost-like
        : isSuggested
          ? 0.25 // Slightly reduced per feedback (was 0.35)
          : 0.08; // Subtle default

  const width = isPathActive || isAgentPath ? 2.5 : isDistraction ? 1.5 : 1;
  const dashed = isSuggested || isAgentPath || isPathActive || isDistraction;

  useFrame((_state, delta) => {
    // Animate flow for agent paths or active paths
    if (lineRef.current && (isAgentPath || isPathActive || isSuggested || isDistraction)) {
      if (lineRef.current.material) {
        // Speed varies by type
        const speed = isPathActive ? 1.5 : isAgentPath ? 1 : isDistraction ? 0.3 : 0.5;
        lineRef.current.material.dashOffset -= delta * speed;
      }
    }
  });

  return (
    <Line
      ref={lineRef}
      points={[start, end]}
      color={color}
      transparent
      opacity={opacity}
      lineWidth={width}
      dashed={dashed}
      dashScale={isSuggested ? 2 : isDistraction ? 3 : 1.4} // Distraction = wider dashes
      dashSize={isPathActive ? 0.22 : 0.16}
      gapSize={isPathActive ? 0.14 : 0.2}
      depthWrite={false} // Prevent z-fighting with nodes
      toneMapped={false} // Keep colors bright
    />
  );
};
