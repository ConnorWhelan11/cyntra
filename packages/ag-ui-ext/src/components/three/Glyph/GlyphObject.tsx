import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useLayoutEffect, useRef } from "react";
import { Group, Mesh, MeshStandardMaterial } from "three";
import type { GlyphObjectProps } from "./types";
import { useGlyphController } from "./useGlyphController";

const DEFAULT_GLYPH_URL = "/models/glyph.glb";

export const GlyphObject: React.FC<GlyphObjectProps> = ({
  state = "idle",
  scale = 1,
  position = [0, 0, 0],
  variant = "default",
  modelUrl,
}) => {
  const rootRef = useRef<Group>(null);
  const timeOffset = useRef(Math.random() * Math.PI * 2);

  const { scene, animations } = useGLTF(modelUrl ?? DEFAULT_GLYPH_URL);
  // Bind animations directly to the scene object to ensure paths match
  const { actions } = useAnimations(animations, scene);

  // Drive which actions play based on state
  const actionsMap = actions
    ? Object.fromEntries(
        Object.entries(actions).map(([key, value]) => [key, value === null ? undefined : value])
      )
    : {};
  useGlyphController(state, actionsMap);

  useLayoutEffect(() => {
    // Make sure we only flip once per loaded scene (R3F caches GLTFs)
    if (!scene.userData.__glyphFlipped) {
      scene.rotation.y += Math.PI;
      scene.userData.__glyphFlipped = true;
    }

    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;

      const mesh = obj;
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      const mats = Array.isArray(mesh.material)
        ? (mesh.material as MeshStandardMaterial[])
        : [mesh.material as MeshStandardMaterial];

      mats.forEach((m) => {
        if (!m) return;

        // --- classify materials more loosely ---
        const name = (m.name || "").toLowerCase();
        const meshName = (mesh.name || "").toLowerCase();

        const isCore = name.includes("core") || meshName.includes("core") || name.includes("body");
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

        // sane baseline
        m.flatShading = false;
        m.metalness = 0;
        m.roughness = 0.6;
        m.emissive.set("#000000");
        m.emissiveIntensity = 0;

        if (isCore) {
          // Core orb
          m.color.set("#A3E7FF");
          m.emissive.set("#7FDBFF");
          m.emissiveIntensity = variant === "inGraph" ? 0.6 : 0.22; // Boosted but not crazy
          m.roughness = 0.5;
          // Tone mapping on is better for preventing "white blob" look,
          // we just need high enough emissive to glow.
        } else if (isRingLike) {
          // *** RINGS – make them bright & neon ***
          m.color.set("#7FF2FF");
          m.emissive.set("#C8FFFF");
          m.emissiveIntensity = 1.0; // push this hard so it survives tone mapping
          m.roughness = 0.25;
          m.toneMapped = false; // keep them bright in ACES
        } else if (isFace) {
          // Face lines: readable, not glowing like a flashlight
          m.color.set("#6B7480");
          m.emissive.set("#7FDBFF");
          m.emissiveIntensity = 0.35; // this is the glow you liked
          m.roughness = 0.7;
        }

        m.needsUpdate = true;
      });
    });
  }, [scene, variant]);

  // Micro-wobble: subtle tilt motion to make Glyph feel alive
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + timeOffset.current;
    if (!rootRef.current) return;

    rootRef.current.rotation.x = 0.04 * Math.sin(t * 0.3);
    rootRef.current.rotation.y = 0.03 * Math.cos(t * 0.25);
  });

  return (
    <group ref={rootRef} position={position} scale={scale}>
      {/* Little local glow so he reads as an orb */}
      <pointLight
        position={[0, 0, 0.4]}
        intensity={variant === "inGraph" ? 0.8 : 0.6} // was 0.45
        distance={variant === "inGraph" ? 4 : 3}
        decay={2}
        color="#7FDBFF"
      />

      <primitive object={scene} />

      {/* Outer mist shell – subtle halo */}
      <mesh scale={1.08}>
        <sphereGeometry args={[1, 64, 32]} />
        <meshStandardMaterial
          transparent
          opacity={variant === "inGraph" ? 0.2 : 0.18} // was 0.12
          color="#9FE8FF"
          emissive="#6FE3FF"
          emissiveIntensity={variant === "inGraph" ? 0.25 : 0.16} // was 0.04
          roughness={0.85}
          metalness={0}
        />
      </mesh>
    </group>
  );
};

useGLTF.preload(DEFAULT_GLYPH_URL);
