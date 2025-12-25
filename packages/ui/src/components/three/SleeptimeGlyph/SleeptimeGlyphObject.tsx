import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useLayoutEffect, useRef, useMemo } from "react";
import { Group, Mesh, MeshStandardMaterial } from "three";
import type { SleeptimeGlyphObjectProps } from "./types";
import {
  SLEEPTIME_COLORS,
  STATE_INTENSITIES,
  STATE_SPEEDS,
} from "./types";
import { useSleeptimeGlyphController } from "./useSleeptimeGlyphController";

const DEFAULT_GLYPH_URL = "/models/glyph.glb";

export const SleeptimeGlyphObject: React.FC<SleeptimeGlyphObjectProps> = ({
  state = "dormant",
  scale = 1,
  position = [0, 0, 0],
  progress = 0,
  modelUrl,
}) => {
  const rootRef = useRef<Group>(null);
  const timeOffset = useRef(Math.random() * Math.PI * 2);

  const { scene, animations } = useGLTF(modelUrl ?? DEFAULT_GLYPH_URL);
  const { actions } = useAnimations(animations, scene);

  // Build actions map
  const actionsMap = useMemo(
    () =>
      actions
        ? Object.fromEntries(
            Object.entries(actions).map(([key, value]) => [
              key,
              value === null ? undefined : value,
            ])
          )
        : {},
    [actions]
  );

  useSleeptimeGlyphController(state, actionsMap);

  const intensity = STATE_INTENSITIES[state];
  const speed = STATE_SPEEDS[state];

  // Apply sleeptime color scheme
  useLayoutEffect(() => {
    if (!scene.userData.__sleeptimeStyled) {
      scene.rotation.y += Math.PI;
      scene.userData.__sleeptimeStyled = true;
    }

    scene.traverse((obj) => {
      if (!(obj as any).isMesh) return;

      const mesh = obj as Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      const mats = Array.isArray(mesh.material)
        ? (mesh.material as MeshStandardMaterial[])
        : [mesh.material as MeshStandardMaterial];

      mats.forEach((m) => {
        if (!m) return;

        const name = (m.name || "").toLowerCase();
        const meshName = (mesh.name || "").toLowerCase();

        const isCore =
          name.includes("core") ||
          meshName.includes("core") ||
          name.includes("body");
        const isFace =
          name.includes("eye") ||
          name.includes("brow") ||
          meshName.includes("eye") ||
          meshName.includes("face");
        const isRingLike =
          name.includes("ring") ||
          name.includes("orbit") ||
          meshName.includes("ring") ||
          meshName.includes("orbit");

        // Reset baseline
        m.flatShading = false;
        m.metalness = 0;
        m.roughness = 0.6;
        m.emissive.set("#000000");
        m.emissiveIntensity = 0;

        if (isCore) {
          // Deep purple core
          m.color.set(SLEEPTIME_COLORS.core);
          m.emissive.set(SLEEPTIME_COLORS.coreEmissive);
          m.emissiveIntensity = 0.25 * intensity;
          m.roughness = 0.5;
        } else if (isRingLike) {
          // Bright violet rings
          m.color.set(SLEEPTIME_COLORS.rings);
          m.emissive.set(SLEEPTIME_COLORS.ringsEmissive);
          m.emissiveIntensity = 0.9 * intensity;
          m.roughness = 0.25;
          (m as any).toneMapped = false;
        } else if (isFace) {
          // Muted lavender face
          m.color.set(SLEEPTIME_COLORS.face);
          m.emissive.set(SLEEPTIME_COLORS.faceEmissive);
          m.emissiveIntensity = 0.3 * intensity;
          m.roughness = 0.7;
        }

        m.needsUpdate = true;
      });
    });
  }, [scene, intensity]);

  // Dreamy wobble animation - slower, more contemplative
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed + timeOffset.current;
    if (!rootRef.current) return;

    // Slower, larger amplitude wobble for dreamy feel
    rootRef.current.rotation.x = 0.06 * Math.sin(t * 0.2);
    rootRef.current.rotation.y = 0.05 * Math.cos(t * 0.15);

    // Subtle breathing scale for dormant state
    if (state === "dormant") {
      const breathe = 1 + 0.02 * Math.sin(t * 0.4);
      rootRef.current.scale.setScalar(scale * breathe);
    } else {
      rootRef.current.scale.setScalar(scale);
    }
  });

  // Pulsing glow intensity based on state
  const glowIntensity = useMemo(() => {
    const base = state === "dormant" ? 0.3 : 0.5;
    return base * intensity;
  }, [state, intensity]);

  return (
    <group ref={rootRef} position={position} scale={scale}>
      {/* Purple glow light */}
      <pointLight
        position={[0, 0, 0.4]}
        intensity={glowIntensity}
        distance={3.5}
        decay={2}
        color={SLEEPTIME_COLORS.glow}
      />

      <primitive object={scene} />

      {/* Outer mist shell - purple halo */}
      <mesh scale={1.12}>
        <sphereGeometry args={[1, 64, 32]} />
        <meshStandardMaterial
          transparent
          opacity={0.15 * intensity}
          color={SLEEPTIME_COLORS.halo}
          emissive={SLEEPTIME_COLORS.haloEmissive}
          emissiveIntensity={0.12 * intensity}
          roughness={0.85}
          metalness={0}
        />
      </mesh>

      {/* Progress ring (visible during active states) */}
      {state !== "dormant" && state !== "complete" && progress > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]}>
          <ringGeometry
            args={[
              0.8,
              0.85,
              64,
              1,
              0,
              Math.PI * 2 * Math.min(progress, 1),
            ]}
          />
          <meshBasicMaterial
            color={SLEEPTIME_COLORS.rings}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </group>
  );
};

useGLTF.preload(DEFAULT_GLYPH_URL);
