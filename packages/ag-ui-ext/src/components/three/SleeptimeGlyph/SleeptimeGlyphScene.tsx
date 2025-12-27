import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import React, { Suspense } from "react";
import * as THREE from "three";
import { SleeptimeGlyphObject } from "./SleeptimeGlyphObject";
import type { SleeptimeGlyphSceneProps, SleeptimeStatus } from "./types";
import { SLEEPTIME_COLORS } from "./types";

interface StatusOverlayProps {
  status: SleeptimeStatus;
}

const StatusOverlay: React.FC<StatusOverlayProps> = ({ status }) => {
  const progress = status.completionsSinceLastRun / status.completionThreshold;
  const progressPercent = Math.min(100, Math.round(progress * 100));

  return (
    <div
      style={{
        position: "absolute",
        bottom: 8,
        left: 8,
        right: 8,
        padding: "8px 12px",
        background: "rgba(10, 6, 18, 0.85)",
        borderRadius: 8,
        border: "1px solid rgba(159, 122, 234, 0.3)",
        fontSize: 11,
        color: "rgba(255, 255, 255, 0.8)",
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span>{status.isConsolidating ? "Consolidating..." : "Dormant"}</span>
        <span style={{ color: SLEEPTIME_COLORS.rings }}>
          {status.completionsSinceLastRun}/{status.completionThreshold}
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 3,
          background: "rgba(159, 122, 234, 0.2)",
          borderRadius: 2,
          overflow: "hidden",
          marginBottom: 6,
        }}
      >
        <div
          style={{
            width: `${progressPercent}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${SLEEPTIME_COLORS.coreEmissive}, ${SLEEPTIME_COLORS.rings})`,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          opacity: 0.7,
        }}
      >
        <span>
          {status.patternsFound > 0 && (
            <>
              {status.patternsFound} patterns
              {status.trapsFound > 0 && ` | ${status.trapsFound} traps`}
            </>
          )}
          {status.patternsFound === 0 && "No patterns yet"}
        </span>
        {status.lastConsolidationTime && (
          <span>
            Last:{" "}
            {new Date(status.lastConsolidationTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
};

export const SleeptimeGlyphScene: React.FC<SleeptimeGlyphSceneProps> = ({
  state = "dormant",
  scale = 1,
  position = [0, 0, 0],
  progress,
  className,
  modelUrl,
  showStatus = false,
  status,
}) => {
  return (
    <div className={className} style={{ position: "relative" }}>
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 30 }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.85,
        }}
      >
        {/* Dark purple-tinted background */}
        <color attach="background" args={[SLEEPTIME_COLORS.background]} />

        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 8]} intensity={0.7} />
        <spotLight
          position={[-3, 3, 4]}
          angle={0.6}
          penumbra={0.7}
          intensity={0.4}
          color={SLEEPTIME_COLORS.glow}
        />

        <OrbitControls enablePan={false} enableZoom={false} />

        <Suspense fallback={null}>
          <SleeptimeGlyphObject
            state={state}
            scale={scale}
            position={position}
            progress={progress}
            modelUrl={modelUrl}
          />
        </Suspense>

        {/* Softer bloom for dreamy effect */}
        <EffectComposer enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.25} luminanceThreshold={0.7} luminanceSmoothing={0.7} />
        </EffectComposer>
      </Canvas>

      {showStatus && status && <StatusOverlay status={status} />}
    </div>
  );
};
