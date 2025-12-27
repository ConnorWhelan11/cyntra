import { Html } from "@react-three/drei";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { motion } from "framer-motion";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { GraphNode as GraphNodeData } from "./types";
import { getCategoryColor, getNodeSize } from "./utils";

interface GraphNodeProps {
  node: GraphNodeData;
  position: THREE.Vector3;
  isSelected?: boolean;
  isHovered?: boolean;
  isPathActive?: boolean;
  isDimmed?: boolean;
  showLabel?: boolean;
  onClick?: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  onHover?: (id: string | null) => void;
}

export const GraphNode = ({
  node,
  position,
  isSelected,
  isHovered,
  isPathActive,
  isDimmed,
  showLabel,
  onClick,
  onDoubleClick,
  onHover,
}: GraphNodeProps) => {
  // Calculate size based on spec
  const baseSize = useMemo(() => getNodeSize(node.weight), [node.weight]);
  const color = useMemo(() => getCategoryColor(node.category), [node.category]);

  // Derived state flags
  const isHighlighted = isSelected || isHovered || isPathActive;

  // Emissive color logic: active path nodes shift slightly to cyan
  const emissiveColor = isPathActive
    ? new THREE.Color(color).lerp(new THREE.Color("#00f0ff"), 0.3)
    : color;

  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const didInitRef = useRef(false);
  const targetScaleRef = useRef(new THREE.Vector3(1, 1, 1));

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;

    const t = clock.elapsedTime;
    const positionAlpha = 1 - Math.exp(-delta * 8);
    const scaleAlpha = 1 - Math.exp(-delta * 12);

    const getScaleScalar = () => {
      if (isSelected) return 1.2;
      if (isHovered) return 1.1;
      if (isPathActive) {
        return 1 + 0.05 * Math.sin((t * Math.PI * 2) / 2.5);
      }
      return 1 + 0.02 * Math.sin((t * Math.PI * 2) / 10);
    };

    if (!didInitRef.current) {
      group.position.copy(position);
      mesh.scale.setScalar(getScaleScalar());
      didInitRef.current = true;
      return;
    }

    group.position.lerp(position, positionAlpha);

    targetScaleRef.current.setScalar(getScaleScalar());
    mesh.scale.lerp(targetScaleRef.current, scaleAlpha);
  });

  return (
    <group ref={groupRef}>
      {/* Main Sphere - Glassy/Metallic Look */}
      <mesh
        ref={meshRef}
        onClick={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onClick?.(node.id);
        }}
        onDoubleClick={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onDoubleClick?.(node.id);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover?.(node.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover?.(null);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[baseSize, 32, 32]} />
        <meshPhysicalMaterial
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={isSelected ? 0.8 : isHovered ? 0.6 : isPathActive ? 0.5 : 0.2}
          roughness={0.2}
          metalness={0.6}
          transparent
          opacity={isDimmed ? 0.15 : 0.9}
          transmission={0.2} // Slight glass effect
          thickness={0.5}
        />
      </mesh>

      {/* Halo / Outer Glow (only when highlighted or active) */}
      {isHighlighted && (
        <mesh>
          <sphereGeometry args={[baseSize * (isSelected ? 2 : 1.6), 32, 32]} />
          <meshBasicMaterial
            color={emissiveColor}
            transparent
            opacity={isSelected ? 0.15 : 0.1}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Selected Orbit Ring */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[baseSize * 1.8, baseSize * 1.85, 64]} />
          <meshBasicMaterial
            color={color}
            side={THREE.DoubleSide}
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {/* Label */}
      {(showLabel || isHighlighted) && (
        <Html distanceFactor={12} zIndexRange={[100, 0]} style={{ pointerEvents: "none" }}>
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: -12 }}
            transition={{ duration: 0.18 }}
            className={`
              flex flex-col items-center
              ${isHighlighted ? "scale-100" : "scale-95 opacity-40"}
            `}
          >
            <div
              className={`
                px-2 py-1 rounded-full border backdrop-blur-md transition-colors duration-300
                ${
                  isHighlighted
                    ? "bg-black/80 border-white/25 shadow-[0_0_12px_rgba(0,0,0,0.5)]"
                    : "bg-transparent border-transparent"
                }
              `}
            >
              <div
                className={`text-[9px] font-mono font-semibold whitespace-nowrap ${isHighlighted ? "text-white" : "text-white/55"}`}
              >
                {node.label}
              </div>
            </div>

            {/* Category Chip */}
            {isHighlighted && node.category && (
              <div
                className="text-[7px] uppercase tracking-[0.18em] font-bold mt-1 px-1.5 py-px rounded border bg-black/40 backdrop-blur-sm"
                style={{
                  color: color,
                  borderColor: `${color}33`,
                  boxShadow: `0 0 6px ${color}22`,
                }}
              >
                {node.category}
              </div>
            )}
          </motion.div>
        </Html>
      )}
    </group>
  );
};
