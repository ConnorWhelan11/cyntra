import { Html, Line } from "@react-three/drei";
import { RootState, ThreeEvent, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ScopeBox } from "../ScopeBox/ScopeBox";

export interface TimelineEpisode {
  id: string;
  number: number;
  track: "HUMAN" | "MODEL" | "BRIDGE";
  title?: string;
}

interface EpisodeTimelineProps {
  episodes: TimelineEpisode[];
  selectedEpisode?: string;
  onEpisodeClick?: (id: string) => void;
}

export const EpisodeTimeline = ({
  episodes,
  selectedEpisode,
  onEpisodeClick,
}: EpisodeTimelineProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useFrame((state: RootState) => {
    if (groupRef.current) {
      // Gentle floating
      groupRef.current.rotation.y =
        Math.sin(state.clock.elapsedTime * 0.1) * 0.05;
    }
  });

  const episodeNodes = useMemo(() => {
    const count = episodes.length;
    const lineLength = 6;
    const startX = -lineLength / 2;
    const step = lineLength / (count + 1);

    return episodes.map((ep, index) => {
      const x = startX + step * (index + 1);
      let y = 0;
      let z = 0;
      let color = "#ffffff";

      // Offsets based on track
      if (ep.track === "HUMAN") {
        y = 0.5 + Math.random() * 0.5; // Float up
        z = 0.5;
        color = "#00f0ff"; // Cyan
      } else if (ep.track === "MODEL") {
        y = -0.5 - Math.random() * 0.5; // Float down
        z = -0.5;
        color = "#f000ff"; // Magenta
      } else {
        // BRIDGE - stays on path
        y = 0;
        z = 0;
        color = "#00ff99"; // Emerald
      }

      return {
        ...ep,
        position: [x, y, z] as [number, number, number],
        color,
      };
    });
  }, [episodes]);

  return (
    <group ref={groupRef}>
      {/* The Scope Box Context */}
      <ScopeBox showNodes={false} />

      {/* The Timeline "Happy Path" */}
      <Line
        points={[
          [-3, 0, 0],
          [3, 0, 0],
        ]}
        color="white"
        opacity={0.2}
        transparent
        lineWidth={1}
      />

      {/* Episode Nodes */}
      {episodeNodes.map((node) => {
        const isSelected = selectedEpisode === node.id;
        const isHovered = hoveredId === node.id;

        return (
          <group key={node.id} position={node.position}>
            {/* Connection line to main path if off-path */}
            {node.track !== "BRIDGE" && (
              <Line
                points={[
                  [0, 0, 0],
                  [0, -node.position[1], -node.position[2]],
                ]}
                color={node.color}
                opacity={0.2}
                transparent
                lineWidth={1}
              />
            )}

            {/* Node Mesh */}
            <mesh
              onClick={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                onEpisodeClick?.(node.id);
              }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                setHoveredId(node.id);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                setHoveredId(null);
                document.body.style.cursor = "auto";
              }}
            >
              <sphereGeometry args={[isSelected ? 0.15 : 0.1, 32, 32]} />
              <meshBasicMaterial
                color={node.color}
                transparent
                opacity={isSelected ? 1 : 0.8}
              />
            </mesh>

            {/* Glow halo for selected */}
            {isSelected && (
              <mesh>
                <sphereGeometry args={[0.2, 32, 32]} />
                <meshBasicMaterial
                  color={node.color}
                  transparent
                  opacity={0.2}
                />
              </mesh>
            )}

            {/* Label on Hover or Selection */}
            {(isHovered || isSelected) && (
              <Html distanceFactor={10} position={[0, 0.2, 0]}>
                <div
                  className={`
                  px-2 py-1 bg-black/80 backdrop-blur border rounded
                  text-[10px] font-mono whitespace-nowrap z-50
                  ${
                    node.track === "HUMAN"
                      ? "border-cyan-neon text-cyan-neon"
                      : node.track === "MODEL"
                        ? "border-magenta-neon text-magenta-neon"
                        : "border-emerald-neon text-emerald-neon"
                  }
                `}
                >
                  EP-{String(node.number).padStart(2, "0")}
                  {node.title && (
                    <div className="text-white/80 text-[8px] max-w-[100px] truncate">
                      {node.title}
                    </div>
                  )}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
};
