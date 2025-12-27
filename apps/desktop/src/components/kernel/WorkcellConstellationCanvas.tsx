import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useConstellationLayout, type NodePosition } from "./useConstellationLayout";
import type {
  ConstellationNode,
  ConstellationEdge,
  ConstellationStateReturn,
} from "./useConstellationState";

interface WorkcellConstellationCanvasProps {
  state: ConstellationStateReturn;
  onSelectNode?: (id: string | null) => void;
  onHoverNode?: (id: string | null) => void;
}

// ============================================================================
// Ambient Glow (empty state)
// ============================================================================

function AmbientGlow() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.elapsedTime;
      meshRef.current.scale.setScalar(1 + Math.sin(t * 0.5) * 0.1);
      meshRef.current.rotation.z = t * 0.05;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[2, 1]} />
      <meshBasicMaterial color="#f5c54220" wireframe transparent opacity={0.3} />
    </mesh>
  );
}

// ============================================================================
// Camera Controller
// ============================================================================

function CameraController({
  target,
  positions,
  selectedId,
  onAnimationComplete,
}: {
  target: [number, number, number] | null;
  positions: Map<string, NodePosition>;
  selectedId: string | null;
  onAnimationComplete?: () => void;
}) {
  const { camera } = useThree();
  const overviewPos = useMemo(() => new THREE.Vector3(0, 0, 18), []);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const prevFocusKeyRef = useRef<string>("");
  const isFlyingRef = useRef(false);

  const focusKey = useMemo(() => {
    if (target) return `t:${target.join(",")}`;
    if (selectedId) return `n:${selectedId}`;
    return "overview";
  }, [target, selectedId]);

  // Compute camera target based on selected node
  const cameraTarget = useMemo(() => {
    if (target) {
      return new THREE.Vector3(...target).add(new THREE.Vector3(0, 0, 6));
    }
    if (selectedId) {
      const pos = positions.get(selectedId);
      if (pos) {
        return new THREE.Vector3(pos.x, pos.y, pos.z + 6);
      }
    }
    return null;
  }, [target, selectedId, positions]);

  const lookAtTarget = useMemo(() => {
    if (target) {
      return new THREE.Vector3(...target);
    }
    if (selectedId) {
      const pos = positions.get(selectedId);
      if (pos) {
        return new THREE.Vector3(pos.x, pos.y, pos.z);
      }
    }
    return new THREE.Vector3(0, 0, 0);
  }, [target, selectedId, positions]);

  useEffect(() => {
    if (prevFocusKeyRef.current === "") {
      prevFocusKeyRef.current = focusKey;
      if (focusKey !== "overview") {
        isFlyingRef.current = true;
      }
      return;
    }
    if (prevFocusKeyRef.current !== focusKey) {
      prevFocusKeyRef.current = focusKey;
      isFlyingRef.current = true;
    }
  }, [focusKey]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.copy(lookAtTarget);
    controls.update();
  }, [lookAtTarget]);

  useFrame(() => {
    if (!isFlyingRef.current) return;

    const destination = cameraTarget ?? overviewPos;
    camera.position.lerp(destination, 0.06);
    camera.lookAt(lookAtTarget);

    if (camera.position.distanceTo(destination) < 0.01) {
      isFlyingRef.current = false;
      onAnimationComplete?.();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={true}
      enableZoom={true}
      enableDamping={true}
      minDistance={4}
      maxDistance={35}
      dampingFactor={0.12}
      rotateSpeed={0.5}
    />
  );
}

// ============================================================================
// Constellation Node
// ============================================================================

interface ConstellationNodeMeshProps {
  node: ConstellationNode;
  position: NodePosition;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

function ConstellationNodeMesh({
  node,
  position,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: ConstellationNodeMeshProps) {
  const nodeGroupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // Animate running nodes
  useFrame((state) => {
    if (!nodeGroupRef.current) return;

    const t = state.clock.elapsedTime;

    const targetScale = node.status === "running" ? 1 + Math.sin(t * 3) * 0.15 : 1;
    nodeGroupRef.current.scale.setScalar(
      THREE.MathUtils.lerp(nodeGroupRef.current.scale.x, targetScale, 0.15)
    );

    // Rotate ring for running nodes
    if (node.status === "running" && ringRef.current) {
      ringRef.current.rotation.z = t * 2;
    }

    // Subtle float for all nodes
    nodeGroupRef.current.position.y = Math.sin(t * 0.5 + position.x) * 0.05;

    // Glow pulse on hover/select
    if (glowRef.current) {
      const glowScale = isHovered ? 1.8 : isSelected ? 1.5 : 0;
      glowRef.current.scale.setScalar(
        THREE.MathUtils.lerp(glowRef.current.scale.x, glowScale, 0.1)
      );
    }
  });

  // Node color based on status
  const nodeColor = useMemo(() => {
    if (node.status === "success") return "#22c55e";
    if (node.status === "failed") return "#ef4444";
    if (node.status === "running") return node.color;
    return node.color;
  }, [node.status, node.color]);

  // Emissive intensity
  const emissiveIntensity = useMemo(() => {
    if (isHovered) return 1.0;
    if (isSelected) return 0.8;
    return node.brightness * 0.5;
  }, [isHovered, isSelected, node.brightness]);

  return (
    <group position={[position.x, position.y, position.z]}>
      <group
        ref={nodeGroupRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
          onHover(node.id);
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
          onHover(null);
        }}
      >
        {/* Main sphere */}
        <mesh>
          <sphereGeometry args={[0.35, 24, 24]} />
          <meshStandardMaterial
            color={nodeColor}
            emissive={nodeColor}
            emissiveIntensity={emissiveIntensity}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>

        {/* Progress ring for running nodes */}
        {node.status === "running" && (
          <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.55, 0.04, 8, 32, Math.PI * 2 * node.progress]} />
            <meshBasicMaterial color={nodeColor} transparent opacity={0.9} />
          </mesh>
        )}

        {/* Outer ring for running nodes */}
        {node.status === "running" && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.55, 0.02, 8, 32]} />
            <meshBasicMaterial color={nodeColor} transparent opacity={0.2} />
          </mesh>
        )}

        {/* Selection/hover glow */}
        <mesh ref={glowRef} scale={0}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshBasicMaterial color={nodeColor} transparent opacity={0.15} />
        </mesh>

        {/* Success checkmark indicator */}
        {node.status === "success" && (
          <mesh position={[0.3, 0.3, 0.3]} scale={0.15}>
            <octahedronGeometry args={[1]} />
            <meshBasicMaterial color="#22c55e" />
          </mesh>
        )}

        {/* Failed indicator */}
        {node.status === "failed" && (
          <mesh position={[0.3, 0.3, 0.3]} rotation={[0, 0, Math.PI / 4]} scale={0.12}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#ef4444" />
          </mesh>
        )}

        {/* Hover tooltip */}
        {isHovered && (
          <Html
            position={[0, 0.8, 0]}
            center
            style={{
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            <div className="constellation-tooltip">
              <span className="constellation-tooltip-id">{node.id.slice(-8)}</span>
              <span className="constellation-tooltip-status">{node.status}</span>
              {node.toolchain && (
                <span className="constellation-tooltip-toolchain">{node.toolchain}</span>
              )}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

// ============================================================================
// Constellation Edge
// ============================================================================

interface ConstellationEdgeLineProps {
  edge: ConstellationEdge;
  positions: Map<string, NodePosition>;
  isHighlighted: boolean;
}

function ConstellationEdgeLine({ edge, positions, isHighlighted }: ConstellationEdgeLineProps) {
  const sourcePos = positions.get(edge.source);
  const targetPos = positions.get(edge.target);

  // Edge styling based on type - compute unconditionally to satisfy hooks rules
  const { color, opacity, lineWidth, dashed } = useMemo(() => {
    const base = {
      same_issue: { color: "#ffffff", opacity: 0.25, lineWidth: 1, dashed: false },
      dependency: { color: "#22d3ee", opacity: 0.15, lineWidth: 1, dashed: true },
      speculate_variant: { color: "#a855f7", opacity: 0.4, lineWidth: 2, dashed: false },
    };
    const style = base[edge.type] ?? base.same_issue;

    if (isHighlighted) {
      return {
        ...style,
        opacity: Math.min(style.opacity * 2.5, 1),
        lineWidth: style.lineWidth + 1,
      };
    }
    return style;
  }, [edge.type, isHighlighted]);

  const points = useMemo(
    () =>
      sourcePos && targetPos
        ? [
            new THREE.Vector3(sourcePos.x, sourcePos.y, sourcePos.z),
            new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z),
          ]
        : [],
    [sourcePos, targetPos]
  );

  // Return null after hooks have been called
  if (!sourcePos || !targetPos) return null;

  return (
    <Line
      points={points}
      color={color}
      lineWidth={lineWidth}
      opacity={opacity}
      transparent
      dashed={dashed}
      dashSize={dashed ? 0.2 : undefined}
      gapSize={dashed ? 0.1 : undefined}
    />
  );
}

// ============================================================================
// Constellation Scene
// ============================================================================

function ConstellationScene({
  nodes,
  edges,
  positions,
  selectedId,
  hoveredId,
  onSelectNode,
  onHoverNode,
}: {
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
  selectedId: string | null;
  hoveredId: string | null;
  positions: Map<string, NodePosition>;
  onSelectNode?: (id: string | null) => void;
  onHoverNode?: (id: string | null) => void;
}) {
  // Determine which edges to highlight (connected to selected/hovered node)
  const highlightedEdges = useMemo(() => {
    const focusId = hoveredId ?? selectedId;
    if (!focusId) return new Set<string>();

    return new Set(
      edges.filter((e) => e.source === focusId || e.target === focusId).map((e) => e.id)
    );
  }, [edges, selectedId, hoveredId]);

  // Empty state
  if (nodes.length === 0) {
    return (
      <>
        <AmbientGlow />
        <Stars radius={50} depth={50} count={1000} factor={2} saturation={0} fade speed={0.5} />
      </>
    );
  }

  return (
    <>
      {/* Background stars */}
      <Stars radius={60} depth={60} count={800} factor={2.5} saturation={0.1} fade speed={0.2} />

      {/* Edges (render first, behind nodes) */}
      {edges.map((edge) => (
        <ConstellationEdgeLine
          key={edge.id}
          edge={edge}
          positions={positions}
          isHighlighted={highlightedEdges.has(edge.id)}
        />
      ))}

      {/* Nodes */}
      {nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;

        return (
          <ConstellationNodeMesh
            key={node.id}
            node={node}
            position={pos}
            isSelected={node.id === selectedId}
            isHovered={node.id === hoveredId}
            onSelect={onSelectNode ?? (() => {})}
            onHover={onHoverNode ?? (() => {})}
          />
        );
      })}

      {/* Central axis helper (subtle) */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.1} />
      </mesh>
    </>
  );
}

// ============================================================================
// Main Canvas
// ============================================================================

export function WorkcellConstellationCanvas({
  state,
  onSelectNode,
  onHoverNode,
}: WorkcellConstellationCanvasProps) {
  // Compute layout positions once (shared between render + camera)
  const positions = useConstellationLayout(state.nodes, state.edges);

  return (
    <Canvas
      camera={{ position: [0, 0, 18], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
      onPointerMissed={() => {
        // Click on empty space clears selection
        onSelectNode?.(null);
      }}
    >
      <Suspense fallback={null}>
        <ConstellationScene
          nodes={state.nodes}
          edges={state.edges}
          positions={positions}
          selectedId={state.selectedWorkcellId}
          hoveredId={state.hoveredWorkcellId}
          onSelectNode={onSelectNode}
          onHoverNode={onHoverNode}
        />

        <CameraController
          target={state.cameraTarget}
          positions={positions}
          selectedId={state.selectedWorkcellId}
          onAnimationComplete={() => state.setAnimating(false)}
        />

        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.6} />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color="#8b5cf6" />
      </Suspense>
    </Canvas>
  );
}
