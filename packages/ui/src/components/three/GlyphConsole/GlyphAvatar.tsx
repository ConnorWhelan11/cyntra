"use client";

import { useFrame } from "@react-three/fiber";
import React, { useRef } from "react";
import * as THREE from "three";
import { GlyphObject } from "../Glyph/GlyphObject";
import type { GlyphConsole3DProps } from "./types";

interface GlyphAvatarProps {
  glyphState: GlyphConsole3DProps["glyphState"];
}

export const GlyphAvatar: React.FC<GlyphAvatarProps> = ({ glyphState }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    // Base hover motion
    const baseY = 0.8 + Math.sin(t * 1.2) * 0.05;
    const baseX = 0.9 + Math.sin(t * 0.3) * 0.05;
    groupRef.current.position.set(baseX, baseY, 0);

    if (glyphState === "thinking") {
      groupRef.current.rotation.y += 0.02;
    } else if (glyphState === "responding") {
      groupRef.current.scale.setScalar(1 + Math.sin(t * 6) * 0.03);
    } else {
      // Gentle reset
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        0,
        0.05
      );
      groupRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
    }
  });

  // Map glyphState to GlyphObject state prop
  // GlyphObject supports: "idle" | "listening" | "thinking" | "responding" | "error"
  // Our prop matches directly.

  return (
    <group ref={groupRef}>
      <GlyphObject state={glyphState} />
    </group>
  );
};
