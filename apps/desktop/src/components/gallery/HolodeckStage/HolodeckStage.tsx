import { Canvas } from "@react-three/fiber";
import { Suspense, memo, useCallback, useState, useEffect, useRef } from "react";
import type { GalleryAsset, GalleryStageMode } from "@/types/ui";
import { ASSET_TYPE_ICONS } from "@/features/gallery/useGalleryState";
import { StageController } from "./StageController";
import { AssetModel, preloadModel } from "./AssetModel";
import { FallbackPlane } from "./FallbackPlane";

interface HolodeckStageProps {
  asset: GalleryAsset | null;
  mode: GalleryStageMode;
  isLoading: boolean;
  featuredAssets: GalleryAsset[];
  /** Reduced motion preference (from prefers-reduced-motion) */
  reducedMotion?: boolean;
}

/**
 * Stage content rendered inside R3F Canvas
 */
function StageContent({
  asset,
  mode,
  reducedMotion,
  onLoadComplete,
  onLoadError,
}: {
  asset: GalleryAsset | null;
  mode: GalleryStageMode;
  reducedMotion: boolean;
  onLoadComplete: () => void;
  onLoadError: (error: Error) => void;
}) {
  const isGhost = mode === "hover-preview";
  const enableAutoOrbit = mode === "featured";
  // Enable user controls when asset is selected (not hover preview, not featured auto-rotate)
  const enableUserControls = mode === "selected" && asset !== null;

  // Target center of model (models are ~3 units tall, sitting on ground at y=0)
  const cameraTarget: [number, number, number] = [0, 1.2, 0];

  return (
    <>
      <StageController
        target={cameraTarget}
        animating={false}
        enableAutoOrbit={enableAutoOrbit}
        enableUserControls={enableUserControls}
        reducedMotion={reducedMotion}
      />

      {asset && (
        <>
          {asset.modelUrl && asset.has3D ? (
            <AssetModel
              modelUrl={asset.modelUrl}
              isGhost={isGhost}
              reducedMotion={reducedMotion}
              onLoad={onLoadComplete}
              onError={onLoadError}
            />
          ) : (
            <FallbackPlane
              type={asset.type}
              name={asset.name}
              thumbnailUrl={asset.thumbnailUrl}
              isGhost={isGhost}
              reducedMotion={reducedMotion}
            />
          )}
        </>
      )}
    </>
  );
}

/**
 * HolodeckStage - 3D asset preview stage with R3F Canvas
 *
 * Features:
 * - GLB model loading with auto-scaling
 * - Fallback plane for assets without 3D
 * - 3-point lighting setup
 * - Camera settle animation on selection
 * - Slow orbit in featured mode
 * - Ghost preview for hover state
 * - Reduced motion support
 */
export const HolodeckStage = memo(function HolodeckStage({
  asset,
  mode,
  isLoading: externalLoading,
  featuredAssets,
  reducedMotion: reducedMotionProp,
}: HolodeckStageProps) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingAssetRef = useRef<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);

  // Detect reduced motion preference
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const reducedMotion = reducedMotionProp ?? systemReducedMotion;

  // Preload featured assets in background
  useEffect(() => {
    featuredAssets.forEach((a) => {
      if (a.modelUrl && a.has3D) {
        preloadModel(a.modelUrl);
      }
    });
  }, [featuredAssets]);

  // Loading callbacks
  const handleLoadComplete = useCallback(() => {
    setIsModelLoading(false);
    setLoadError(null);
  }, []);

  const handleLoadError = useCallback((error: Error) => {
    setIsModelLoading(false);
    setLoadError(error.message);
  }, []);

  // Track loading state when asset changes
  useEffect(() => {
    const assetId = asset?.id ?? null;
    const hasModel = asset?.modelUrl && asset?.has3D;

    if (hasModel && loadingAssetRef.current !== assetId) {
      loadingAssetRef.current = assetId;
      setIsModelLoading(true);
      setLoadError(null);
    } else if (!hasModel) {
      loadingAssetRef.current = null;
      setIsModelLoading(false);
    }
  }, [asset?.id, asset?.modelUrl, asset?.has3D]);

  // Determine states
  const isEmpty = !asset && featuredAssets.length === 0;
  const isLoading = externalLoading || isModelLoading;
  const showGhost = mode === "hover-preview";

  return (
    <div className={`holodeck-stage ${mode}`}>
      {/* R3F Canvas */}
      <div className="holodeck-stage-canvas-wrapper">
        <Canvas
          camera={{ position: [0, 2.5, 5], fov: 45 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          style={{ background: "transparent" }}
        >
          <Suspense fallback={null}>
            <StageContent
              asset={asset}
              mode={mode}
              reducedMotion={reducedMotion}
              onLoadComplete={handleLoadComplete}
              onLoadError={handleLoadError}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="holodeck-stage-loading">
          <div className="holodeck-stage-spinner" />
          <span>Loading model...</span>
        </div>
      )}

      {/* Error overlay */}
      {loadError && (
        <div className="holodeck-stage-error">
          <div className="holodeck-stage-error-icon">⚠️</div>
          <span>Failed to load model</span>
          <span className="holodeck-stage-error-detail">{loadError}</span>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="holodeck-stage-empty">
          <div className="holodeck-stage-empty-icon">🎨</div>
          <div className="holodeck-stage-empty-text">No assets available</div>
          <div className="holodeck-stage-empty-hint">
            Add assets to your project to see them here
          </div>
        </div>
      )}

      {/* Asset info overlay */}
      {asset && !isEmpty && (
        <div className={`holodeck-stage-info ${showGhost ? "ghost" : ""}`}>
          <span className="holodeck-stage-name">{asset.name}</span>
          <span className="holodeck-stage-type">
            {ASSET_TYPE_ICONS[asset.type]} {asset.type}
          </span>
          {asset.has3D && <span className="holodeck-stage-3d-badge">3D</span>}
        </div>
      )}

      {/* Featured rotation hint */}
      {mode === "featured" && featuredAssets.length > 1 && asset && (
        <div className="holodeck-stage-featured-hint">
          <span>Featured</span>
          <span className="holodeck-stage-featured-count">
            {featuredAssets.findIndex((a) => a.id === asset.id) + 1} / {featuredAssets.length}
          </span>
        </div>
      )}

      {/* Mode indicator */}
      {!isEmpty && (
        <div className="holodeck-stage-mode-indicator">
          {mode === "selected" && "Selected"}
          {mode === "hover-preview" && "Preview"}
          {mode === "featured" && "Featured"}
        </div>
      )}

      {/* Hint for no selection */}
      {mode === "featured" && asset && (
        <div className="holodeck-stage-select-hint">Select an asset to inspect</div>
      )}
    </div>
  );
});

export default HolodeckStage;
