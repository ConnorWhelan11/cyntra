import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import React, { Suspense } from "react";
import * as THREE from "three";
import { GlyphObject } from "./GlyphObject";
import type { GlyphSceneProps } from "./types";

export const GlyphScene: React.FC<GlyphSceneProps> = ({
  state = "idle",
  scale = 1,
  position = [0, 0, 0],
  className,
  modelUrl,
}) => {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 30 }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.9, // Reduce overall brightness
        }}
      >
        {/* Background */}
        <color attach="background" args={["#040812"]} />

        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 8]} intensity={0.8} />
        <spotLight
          position={[-3, 3, 4]}
          angle={0.6}
          penumbra={0.7}
          intensity={0.5}
          color="#5DE0FF"
        />

        {/* Controls: keep for Storybook/dev; you can disable in production wrapper */}
        <OrbitControls enablePan={false} enableZoom={false} />

        <Suspense fallback={null}>
          <GlyphObject state={state} scale={scale} position={position} modelUrl={modelUrl} />
        </Suspense>

        {/* Subtle bloom - only VERY bright stuff blooms (rings) */}
        <EffectComposer enableNormalPass={false}>
          <Bloom
            mipmapBlur
            intensity={0.2} // was ~0.12–0.18
            luminanceThreshold={0.8} // let more of the rings bloom
            luminanceSmoothing={0.65}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
};
