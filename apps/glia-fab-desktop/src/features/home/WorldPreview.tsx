/**
 * WorldPreview - Dual-mode preview viewport
 *
 * Shows either a Three.js GLB preview or Godot Web iframe.
 * Hot-reloads GLB when URL changes.
 */

import React, { Suspense, useRef, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Center, Html } from "@react-three/drei";
import type { PreviewMode } from "@/types";

interface WorldPreviewProps {
  /** Preview mode */
  mode: PreviewMode;
  /** GLB URL for asset preview */
  glbUrl?: string;
  /** Godot Web export URL */
  godotUrl?: string;
}

/** Fallback when loading */
function LoadingFallback() {
  return (
    <div className="world-preview-loading">
      <div className="world-preview-loading-spinner" />
      <span>Loading preview...</span>
    </div>
  );
}

/** Empty state when no preview available */
function EmptyPreview({ message }: { message: string }) {
  return (
    <div className="world-preview-empty">
      <div className="world-preview-empty-icon">◌</div>
      <span>{message}</span>
    </div>
  );
}

/** GLB Model component with hot-reload */
function GLBModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);

  // Force re-render when URL changes
  useEffect(() => {
    return () => {
      useGLTF.clear(url);
    };
  }, [url]);

  return (
    <Center>
      <primitive object={scene.clone()} />
    </Center>
  );
}

/** Three.js GLB preview */
function AssetPreview({ glbUrl }: { glbUrl?: string }) {
  if (!glbUrl) {
    return <EmptyPreview message="Waiting for asset..." />;
  }

  return (
    <Canvas
      camera={{ position: [3, 3, 3], fov: 50 }}
      className="world-preview-canvas"
    >
      <Suspense
        fallback={
          <Html center>
            <LoadingFallback />
          </Html>
        }
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <GLBModel url={glbUrl} />
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          autoRotate={true}
          autoRotateSpeed={0.5}
        />
        <Environment preset="studio" background={false} />
      </Suspense>
    </Canvas>
  );
}

/** Godot Web iframe preview */
function GamePreview({ godotUrl }: { godotUrl?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Reset loading state when URL changes
  useEffect(() => {
    setIsLoading(true);
  }, [godotUrl]);

  // Handle iframe load
  const handleLoad = () => {
    setIsLoading(false);
  };

  if (!godotUrl) {
    return <EmptyPreview message="Godot export not yet available" />;
  }

  return (
    <div className="world-preview-game">
      {isLoading && <LoadingFallback />}
      <iframe
        ref={iframeRef}
        key={godotUrl}
        src={godotUrl}
        className="world-preview-game-iframe"
        onLoad={handleLoad}
        title="Godot Web Preview"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}

export function WorldPreview({ mode, glbUrl, godotUrl }: WorldPreviewProps) {
  return (
    <div className="world-preview" data-mode={mode}>
      <Suspense fallback={<LoadingFallback />}>
        {mode === "asset" ? (
          <AssetPreview glbUrl={glbUrl} />
        ) : (
          <GamePreview godotUrl={godotUrl} />
        )}
      </Suspense>
    </div>
  );
}

export default WorldPreview;
