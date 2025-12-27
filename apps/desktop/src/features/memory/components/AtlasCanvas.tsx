import React, { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls, Html, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useMemoryAtlasContext, MemoryType, Agent } from "../hooks/useMemoryAtlas";
import type { MemoryItem } from "@/types";

// Color mappings (converted from CSS vars for Three.js)
const TYPE_COLORS: Record<MemoryType, string> = {
  pattern: "#d4a574", // accent-primary (warm gold)
  failure: "#e07a5f", // signal-error (coral)
  dynamic: "#64d2c8", // signal-active (cyan)
  context: "#7eb8da", // signal-info (soft blue)
  playbook: "#a17dc9", // violet
  frontier: "#72d181", // teal-green
};

const AGENT_COLORS: Record<Agent, string> = {
  claude: "#c9846b", // terracotta
  codex: "#6bc9a8", // emerald
  opencode: "#a17dc9", // violet
  crush: "#6bb8c9", // electric blue
};

const TYPE_ICONS: Record<MemoryType, string> = {
  pattern: "◈",
  failure: "⚠",
  dynamic: "◎",
  context: "◐",
  playbook: "▤",
  frontier: "⟁",
};

// Camera controller for fly-to animations
function CameraController() {
  const { state, actions } = useMemoryAtlasContext();
  const { camera: _camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Animate camera to target
  useFrame(() => {
    if (state.camera.isAnimating && controlsRef.current) {
      const target = new THREE.Vector3(...state.camera.target);
      const currentTarget = controlsRef.current.target;

      // Lerp target position
      currentTarget.lerp(target, 0.08);

      // Check if close enough to stop animating
      if (currentTarget.distanceTo(target) < 0.01) {
        actions.setCameraAnimating(false);
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minDistance={3}
      maxDistance={20}
      maxPolarAngle={Math.PI * 0.85}
      minPolarAngle={Math.PI * 0.15}
    />
  );
}

// Ambient star field background
function AmbientEnvironment() {
  return (
    <>
      {/* Background star field - more subtle, deeper */}
      <Stars radius={80} depth={60} count={3000} factor={4} saturation={0.05} fade speed={0.3} />

      {/* Depth fog for spatial feel */}
      <fog attach="fog" args={["#08080f", 10, 30]} />

      {/* Main ambient light - slightly warm */}
      <ambientLight intensity={0.25} color="#fffaf0" />

      {/* Key light - warm gold accent */}
      <pointLight position={[8, 12, 8]} intensity={0.6} color="#d4a574" distance={30} decay={2} />

      {/* Fill light - cool cyan */}
      <pointLight
        position={[-10, -5, -10]}
        intensity={0.4}
        color="#64d2c8"
        distance={25}
        decay={2}
      />

      {/* Rim light - subtle blue */}
      <pointLight position={[0, -8, 12]} intensity={0.2} color="#7eb8da" distance={20} decay={2} />
    </>
  );
}

// Single memory node (for non-instanced approach, simpler for hover/click)
interface MemoryNodeProps {
  memory: MemoryItem;
  position: [number, number, number];
  isSelected: boolean;
  isHovered: boolean;
  isFiltered: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}

function MemoryNode({
  memory,
  position,
  isSelected,
  isHovered,
  isFiltered,
  onSelect,
  onHover,
}: MemoryNodeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const typeColor = TYPE_COLORS[memory.type as MemoryType] || TYPE_COLORS.pattern;
  const agentColor = AGENT_COLORS[memory.agent as Agent] || AGENT_COLORS.claude;

  // Base size from importance
  const baseSize = 0.3 + memory.importance * 0.4;
  const targetScale = isSelected ? 1.5 : isHovered ? 1.25 : 1;

  // Animate scale, glow, and subtle rotation
  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    // Group scale animation
    if (groupRef.current) {
      const currentScale = groupRef.current.scale.x;
      const newScale = THREE.MathUtils.lerp(currentScale, targetScale, delta * 6);
      groupRef.current.scale.setScalar(newScale);
    }

    // Glow opacity animation
    if (glowRef.current) {
      const targetOpacity = isSelected ? 0.5 : isHovered ? 0.35 : 0.12;
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, delta * 6);

      // Subtle pulse for selected
      if (isSelected) {
        const pulse = 1 + Math.sin(time * 3) * 0.1;
        glowRef.current.scale.setScalar(baseSize * 3 * pulse);
      }
    }

    // Pulse ring animation (selected only)
    if (pulseRef.current) {
      const targetOpacity = isSelected ? 0.3 : 0;
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, delta * 8);

      if (isSelected) {
        const pulse = 1 + Math.sin(time * 2) * 0.15;
        pulseRef.current.scale.setScalar(baseSize * 2.2 * pulse);
      }
    }

    // Agent ring rotation
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.3;
    }
  });

  // Opacity for filtered state
  const opacity = isFiltered ? 1 : 0.08;
  const glowOpacity = isFiltered ? 0.12 : 0.02;

  return (
    <group ref={groupRef} position={position}>
      {/* Outer glow sphere */}
      <mesh ref={glowRef} scale={baseSize * 3}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial
          color={typeColor}
          transparent
          opacity={glowOpacity}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Selection pulse ring */}
      <mesh ref={pulseRef} rotation={[Math.PI / 2, 0, 0]} scale={baseSize * 2}>
        <torusGeometry args={[1, 0.02, 8, 64]} />
        <meshBasicMaterial
          color={typeColor}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Main sphere */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          if (isFiltered) onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (isFiltered) {
            onHover(true);
            document.body.style.cursor = "pointer";
          }
        }}
        onPointerOut={() => {
          onHover(false);
          document.body.style.cursor = "auto";
        }}
        scale={baseSize}
      >
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          color={typeColor}
          emissive={typeColor}
          emissiveIntensity={isSelected ? 1.2 : isHovered ? 0.7 : 0.25}
          transparent
          opacity={opacity}
          metalness={0.4}
          roughness={0.3}
        />
      </mesh>

      {/* Agent ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} scale={baseSize * 1.4}>
        <torusGeometry args={[1, 0.06, 8, 48]} />
        <meshBasicMaterial color={agentColor} transparent opacity={opacity * 0.9} />
      </mesh>

      {/* Tooltip on hover */}
      {isHovered && isFiltered && (
        <Html position={[0, baseSize * 1.8, 0]} center style={{ pointerEvents: "none" }}>
          <div
            className="px-3 py-2 rounded-lg text-xs max-w-[200px] whitespace-nowrap overflow-hidden text-ellipsis"
            style={{
              background: "rgba(10, 10, 20, 0.95)",
              border: `1px solid ${typeColor}40`,
              color: "#e8e8e8",
              boxShadow: `0 0 20px ${typeColor}30`,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: typeColor }}>{TYPE_ICONS[memory.type as MemoryType]}</span>
              <span className="font-medium">{memory.type}</span>
              <span className="text-gray-500">·</span>
              <span style={{ color: agentColor }}>{memory.agent}</span>
            </div>
            <div className="text-gray-300 truncate">
              {memory.content.substring(0, 50)}
              {memory.content.length > 50 ? "..." : ""}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// All memory nodes
function MemoryNodes() {
  const { state, actions, memories, filteredMemories, nodePositions } = useMemoryAtlasContext();

  const filteredIds = useMemo(() => new Set(filteredMemories.map((m) => m.id)), [filteredMemories]);

  return (
    <group>
      {memories.map((memory) => {
        const position = nodePositions.get(memory.id);
        if (!position) return null;

        return (
          <MemoryNode
            key={memory.id}
            memory={memory}
            position={position}
            isSelected={state.selectedMemoryId === memory.id}
            isHovered={state.hoveredMemoryId === memory.id}
            isFiltered={filteredIds.has(memory.id)}
            onSelect={() => actions.selectMemory(memory.id)}
            onHover={(hovering) => actions.setHoveredMemory(hovering ? memory.id : null)}
          />
        );
      })}
    </group>
  );
}

// Edge lines between linked memories
function MemoryEdges() {
  const { memories, nodePositions, filteredMemories } = useMemoryAtlasContext();

  const filteredIds = useMemo(() => new Set(filteredMemories.map((m) => m.id)), [filteredMemories]);

  const edges = useMemo(() => {
    const lines: { from: THREE.Vector3; to: THREE.Vector3; color: string }[] = [];

    memories.forEach((memory) => {
      if (!memory.links || !filteredIds.has(memory.id)) return;

      const fromPos = nodePositions.get(memory.id);
      if (!fromPos) return;

      memory.links.forEach((link) => {
        const toPos = nodePositions.get(link.targetId);
        if (!toPos || !filteredIds.has(link.targetId)) return;

        lines.push({
          from: new THREE.Vector3(...fromPos),
          to: new THREE.Vector3(...toPos),
          color: TYPE_COLORS[memory.type as MemoryType] || "#666",
        });
      });
    });

    return lines;
  }, [memories, nodePositions, filteredIds]);

  return (
    <group>
      {edges.map((edge, i) => {
        return (
          <Line
            key={i}
            points={[edge.from, edge.to]}
            color={edge.color}
            transparent
            opacity={0.2}
            lineWidth={1}
          />
        );
      })}
    </group>
  );
}

// Click handler for empty space
function ClickHandler() {
  const { actions } = useMemoryAtlasContext();

  return (
    <mesh position={[0, 0, 0]} onClick={() => actions.selectMemory(null)} visible={false}>
      <sphereGeometry args={[100, 8, 8]} />
      <meshBasicMaterial side={THREE.BackSide} />
    </mesh>
  );
}

// Hint overlay when no selection
function SelectionHint() {
  const { state, filteredMemories } = useMemoryAtlasContext();

  if (state.selectedMemoryId || filteredMemories.length === 0) return null;

  return (
    <Html center position={[0, -2, 0]}>
      <div className="text-center text-tertiary text-sm animate-pulse">
        Click a memory node to explore
      </div>
    </Html>
  );
}

// Empty state
function EmptyState() {
  const { memories, filteredMemories } = useMemoryAtlasContext();

  if (memories.length > 0 && filteredMemories.length > 0) return null;

  const message =
    memories.length === 0 ? "No memories in this project yet" : "No memories match current filters";

  return (
    <Html center>
      <div className="text-center">
        <div className="text-4xl mb-4 opacity-30">◇</div>
        <div className="text-tertiary text-sm">{message}</div>
      </div>
    </Html>
  );
}

// Main canvas component
interface AtlasCanvasProps {
  className?: string;
}

export function AtlasCanvas({ className = "" }: AtlasCanvasProps) {
  return (
    <div className={`absolute inset-0 ${className}`}>
      <Canvas
        camera={{
          position: [0, 5, 12],
          fov: 50,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ background: "transparent" }}
      >
        <AmbientEnvironment />
        <CameraController />
        <MemoryNodes />
        <MemoryEdges />
        <ClickHandler />
        <SelectionHint />
        <EmptyState />
      </Canvas>
    </div>
  );
}

export default AtlasCanvas;
