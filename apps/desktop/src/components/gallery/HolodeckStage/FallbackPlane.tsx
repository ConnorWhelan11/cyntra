import { useFrame } from "@react-three/fiber";
import { Text, RoundedBox } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";
import type { AssetType } from "@/types/ui";

interface FallbackPlaneProps {
  /** Asset type for icon display */
  type: AssetType;
  /** Asset name */
  name: string;
  /** Thumbnail URL (optional) */
  thumbnailUrl?: string;
  /** Whether this is a ghost preview */
  isGhost?: boolean;
  /** Reduced motion preference */
  reducedMotion?: boolean;
}

// Type icons as text (matching ASSET_TYPE_ICONS)
const TYPE_ICONS: Record<AssetType, string> = {
  building: "🏢",
  furniture: "🪑",
  vehicle: "🚗",
  lighting: "💡",
  structure: "🏗️",
  prop: "📦",
};

/**
 * FallbackPlane - Displayed when no GLB model is available
 *
 * Shows a stylized card with:
 * - Type icon
 * - Asset name
 * - Visual indication that 3D is not available
 */
export function FallbackPlane({
  type,
  name,
  thumbnailUrl: _thumbnailUrl,
  isGhost = false,
  reducedMotion = false,
}: FallbackPlaneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // Gentle floating animation
  useFrame(({ clock }) => {
    if (reducedMotion || !groupRef.current) return;

    const t = clock.getElapsedTime();
    groupRef.current.position.y = Math.sin(t * 0.5) * 0.1;
    groupRef.current.rotation.y = Math.sin(t * 0.3) * 0.02;

    // Pulse the glow
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.1;
    }
  });

  const opacity = isGhost ? 0.5 : 1;
  const iconScale = 0.8;

  return (
    <group ref={groupRef}>
      {/* Main card background */}
      <RoundedBox args={[2.5, 3, 0.1]} radius={0.1} smoothness={4} position={[0, 0, 0]}>
        <meshStandardMaterial
          color="#1a2a4a"
          metalness={0.1}
          roughness={0.8}
          transparent
          opacity={opacity * 0.9}
        />
      </RoundedBox>

      {/* Inner glow border */}
      <mesh ref={glowRef} position={[0, 0, 0.06]}>
        <planeGeometry args={[2.4, 2.9]} />
        <meshStandardMaterial
          color="#0a1628"
          emissive="#7fdbff"
          emissiveIntensity={0.3}
          transparent
          opacity={opacity * 0.6}
        />
      </mesh>

      {/* Type icon */}
      <Text
        position={[0, 0.5, 0.08]}
        fontSize={iconScale}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {TYPE_ICONS[type] || "📦"}
      </Text>

      {/* Asset name */}
      <Text
        position={[0, -0.5, 0.08]}
        fontSize={0.2}
        color="#a0b4d0"
        anchorX="center"
        anchorY="middle"
        maxWidth={2.2}
        textAlign="center"
      >
        {name}
      </Text>

      {/* "No 3D" indicator */}
      <Text
        position={[0, -1, 0.08]}
        fontSize={0.12}
        color="#5a6a8a"
        anchorX="center"
        anchorY="middle"
      >
        No 3D model
      </Text>

      {/* Decorative corner accents */}
      {[
        [-1, 1],
        [1, 1],
        [-1, -1],
        [1, -1],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x * 1.1, y * 1.35, 0.07]}>
          <planeGeometry args={[0.15, 0.15]} />
          <meshStandardMaterial
            color="#7fdbff"
            emissive="#7fdbff"
            emissiveIntensity={0.5}
            transparent
            opacity={opacity * 0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

export default FallbackPlane;
