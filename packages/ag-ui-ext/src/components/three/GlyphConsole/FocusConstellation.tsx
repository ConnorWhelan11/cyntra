"use client";

import React from "react";
import type { GlyphConsole3DProps } from "./types";

interface FocusConstellationProps {
  nodes: GlyphConsole3DProps["constellationNodes"];
  onNodeClick?: (id: string) => void;
}

const kindToColor = (kind: string) => {
  switch (kind) {
    case "mission":
      return "#22d3ee"; // cyan-400
    case "leak":
      return "#fbbf24"; // yellow-400
    case "comms":
      return "#f472b6"; // pink-400
    case "broadcast":
      return "#a78bfa"; // violet-400
    default:
      return "#94a3b8"; // slate-400
  }
};

export const FocusConstellation: React.FC<FocusConstellationProps> = ({ nodes, onNodeClick }) => {
  const radius = 4;

  return (
    <group position={[0, 0.5, -1]}>
      {nodes.map((node, index) => {
        const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * 0.4;

        return (
          <mesh
            key={node.id}
            position={[x, y, -1]}
            onClick={(e) => {
              e.stopPropagation();
              onNodeClick?.(node.id);
            }}
            onPointerOver={() => {
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "auto";
            }}
          >
            <sphereGeometry args={[0.12 * (1 + (node.importance ?? 0.4)), 16, 16]} />
            <meshBasicMaterial color={kindToColor(node.kind)} />

            {/* Optional glow halo */}
            {node.hasUnread && (
              <mesh scale={1.5}>
                <sphereGeometry args={[0.12, 16, 16]} />
                <meshBasicMaterial color={kindToColor(node.kind)} transparent opacity={0.3} />
              </mesh>
            )}
          </mesh>
        );
      })}
    </group>
  );
};
