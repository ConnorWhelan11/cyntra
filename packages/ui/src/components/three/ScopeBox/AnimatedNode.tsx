import { Html, Trail } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import type { MutableRefObject, RefObject } from "react";
import { useRef, useState } from "react";
import * as THREE from "three";
import { NodeLine } from "./NodeLine";
import type { IntroPhase, NodeData } from "./types";
import { easeOutCubic } from "./utils";

/**
 * Color mapping for node types:
 * - cyan: Core subjects / study orbits (BIO, CHEM, CARS, etc.)
 * - magenta: Special/hacked nodes
 * - yellow: Villains / gatekeepers (AAMC, MCAT) - warm amber
 * - emerald: Long-term identity / outcomes (MD, DO, PHD)
 */
const NODE_COLOR_MAP = {
  cyan: {
    sphereHex: "#1f9ad6", // core subjects
    labelClass:
      "text-cyan-100 drop-shadow-[0_0_4px_rgba(31,154,214,0.9)]",
  },
  magenta: {
    sphereHex: "#e879f9", // rare 'hacked' nodes
    labelClass:
      "text-fuchsia-100 drop-shadow-[0_0_4px_rgba(232,121,249,0.9)]",
  },
  yellow: {
    sphereHex: "#f97316", // villains
    labelClass:
      "text-amber-200 drop-shadow-[0_0_4px_rgba(251,191,36,0.95)]",
  },
  emerald: {
    sphereHex: "#22c55e", // outcomes
    labelClass:
      "text-emerald-200 drop-shadow-[0_0_4px_rgba(34,197,94,0.9)]",
  },
};


// Default fallback color
const DEFAULT_NODE_COLOR = {
  sphereHex: "#22d3ee",
  labelClass: "text-cyan-neon drop-shadow-[0_0_2px_rgba(34,211,238,0.9)]",
};

// Helper to determine if a node is "penetrating" in Phase 2
const isPenetrating = (id: string, phase: number) =>
  phase === 2 && ["bug", "hack", "debt"].includes(id);

export const AnimatedNode = ({
  node,
  isHighlighted,
  isNodeHovered,
  onHover,
  onLeave,
  onClick,
  containmentProgress,
  htmlPortal,
  introPhase,
  phase,
}: {
  node: NodeData;
  isHighlighted: boolean;
  isNodeHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
  containmentProgress: MutableRefObject<number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  htmlPortal?: RefObject<any>;
  introPhase: IntroPhase;
  phase: number;
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const currentPos = useRef(node.chaosPos.clone());
  const driftOffset = useRef(
    new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    )
  );
  
  // Track if node is behind the box (for label occlusion)
  const [isBehindBox, setIsBehindBox] = useState(false);

  useFrame((state) => {
    if (!meshRef.current) return;

    const t = state.clock.elapsedTime;
    const progress = easeOutCubic(containmentProgress.current);

    // Penetration logic for phase 2 (scroll-based)
    const penetrating = isPenetrating(node.id, phase);
    let targetPos = node.orbitalPos.clone();

    if (penetrating) {
      targetPos.multiplyScalar(0.4);
    }

    // Lerp from chaos to orbital based on containment progress
    const lerpedPos = new THREE.Vector3().lerpVectors(
      node.chaosPos,
      targetPos,
      progress
    );

    // Add chaos drift when not fully contained
    const chaosAmount = 1 - progress;
    if (chaosAmount > 0.01) {
      const drift = driftOffset.current;
      lerpedPos.x += Math.sin(t * 2 + drift.x * 10) * chaosAmount * 0.5;
      lerpedPos.y += Math.cos(t * 1.7 + drift.y * 10) * chaosAmount * 0.4;
      lerpedPos.z += Math.sin(t * 2.3 + drift.z * 10) * chaosAmount * 0.3;
    }

    // Smooth position update
    currentPos.current.lerp(lerpedPos, 0.08);
    meshRef.current.position.copy(currentPos.current);

    // Check if node label should be hidden for occlusion
    // Hide labels when:
    // 1. Node is inside the glass slab volume (anywhere within the cube)
    // 2. Node is directly behind the slab footprint (avoid hiding side orbitals)
    // 3. Node is near the center panel area where MissionIntroPanel renders
    const pos = currentPos.current;
    const slabHalf = 1.5; // slightly smaller than actual box (3) to avoid edge flicker
    const isInsideSlab =
      Math.abs(pos.x) < slabHalf && Math.abs(pos.y) < slabHalf && Math.abs(pos.z) < slabHalf;

    // Behind the box only when within the box footprint to avoid hiding side nodes
    const footprintHalf = 1.6;
    const isWithinFootprint = Math.abs(pos.x) < footprintHalf && Math.abs(pos.y) < footprintHalf;
    const isBehindFootprint = isWithinFootprint && pos.z < -0.1;

    // Center panel occlusion: hide labels near the center where MissionIntroPanel renders
    // Panel is at (0, -0.1, 0) and covers roughly a ~1.5 unit radius in XY
    const panelRadius = 1.6;
    const distFromCenter = Math.sqrt(pos.x * pos.x + (pos.y + 0.1) * (pos.y + 0.1));
    const isInPanelZone = distFromCenter < panelRadius && Math.abs(pos.z) < 1.2;

    const shouldHideLabel = isInsideSlab || isBehindFootprint || isInPanelZone;
    
    if (shouldHideLabel !== isBehindBox) {
      setIsBehindBox(shouldHideLabel);
    }

    // Opacity based on containment (fade in as they settle)
    const opacity = 0.3 + progress * 0.7;
    const mat = meshRef.current.children[0] as THREE.Mesh;
    if (mat?.material && "opacity" in mat.material) {
      (mat.material as THREE.MeshBasicMaterial).opacity =
        isHighlighted || isNodeHovered ? 1 : opacity * 0.8;
    }
  });

  // Get color from map with fallback
  const colorConfig =
    NODE_COLOR_MAP[node.color as keyof typeof NODE_COLOR_MAP] || DEFAULT_NODE_COLOR;
  const nodeColor = colorConfig.sphereHex;

  return (
    <group ref={meshRef} position={currentPos.current}>
      <mesh
        onClick={() => {
          // Disable click during intro
          if (introPhase !== "done") return;
          onClick();
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          // Disable hover during intro to prevent animation glitches
          if (introPhase !== "done") return;
          document.body.style.cursor = "pointer";
          onHover();
        }}
        onPointerOut={() => {
          if (introPhase !== "done") return;
          document.body.style.cursor = "auto";
          onLeave();
        }}
      >
        <sphereGeometry
          args={[isHighlighted || isNodeHovered ? 0.14 : 0.07, 16, 16]}
        />
        <meshBasicMaterial
          color={nodeColor}
          transparent
          opacity={isHighlighted || isNodeHovered ? 1 : 0.8}
        />
      </mesh>

      {/* Trail for penetrating nodes */}
      {isPenetrating(node.id, phase) && (
        <Trail
          width={2}
          length={8}
          color={new THREE.Color("#ff0055")}
          attenuation={(t) => t * t}
        >
          <mesh>
            <sphereGeometry args={[0.01, 4, 4]} />
            <meshBasicMaterial color="red" />
          </mesh>
        </Trail>
      )}

      {(isHighlighted || isNodeHovered) && (
        <mesh>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshBasicMaterial
            color={nodeColor}
            transparent
            opacity={0.2}
            wireframe
          />
        </mesh>
      )}

      <Html
        distanceFactor={10}
        zIndexRange={[0, 0]}
        portal={htmlPortal}
      >
        <div
          className={`
            pointer-events-none select-none
            text-[8px] font-bold font-mono tracking-wider
            transition-opacity duration-300
            ${isBehindBox ? "opacity-0" : containmentProgress.current > 0.3 ? "opacity-100" : "opacity-0"}
            ${colorConfig.labelClass}
          `}
        >
          {node.label}
          {isNodeHovered && (
            <div className="text-[6px] opacity-70 font-normal">
              {node.type}
            </div>
          )}
        </div>
      </Html>

      {/* Connection line rendered via NodeLine component for reactive updates */}
      <NodeLine
        nodeRef={meshRef}
        color={nodeColor}
        containmentProgress={containmentProgress}
      />
    </group>
  );
};

