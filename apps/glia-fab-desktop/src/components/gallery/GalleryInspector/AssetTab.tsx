import { memo } from "react";
import type { GalleryAsset } from "@/types/ui";
import { ASSET_TYPE_ICONS } from "@/features/gallery/useGalleryState";

interface AssetTabProps {
  asset: GalleryAsset | null;
}

export const AssetTab = memo(function AssetTab({ asset }: AssetTabProps) {
  if (!asset) {
    return (
      <div className="gallery-inspector-empty">
        <span className="gallery-inspector-empty-icon">📦</span>
        <span>Select an asset to inspect</span>
      </div>
    );
  }

  return (
    <div className="gallery-inspector-tab-content">
      {/* Type & World */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Classification</span>
        <div className="gallery-inspector-meta-row">
          <span className="gallery-inspector-type-badge">
            {ASSET_TYPE_ICONS[asset.type]} {asset.type}
          </span>
          <span className="gallery-inspector-world-badge">
            🌍 {asset.world}
          </span>
        </div>
      </div>

      {/* Generation & Fitness */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Evolution</span>
        <div className="gallery-inspector-stats-grid">
          <div className="gallery-inspector-stat">
            <span className="gallery-inspector-stat-label">Generation</span>
            <span className="gallery-inspector-stat-value">{asset.generation}</span>
          </div>
          <div className="gallery-inspector-stat">
            <span className="gallery-inspector-stat-label">Fitness</span>
            <span
              className="gallery-inspector-stat-value"
              style={{
                color:
                  asset.fitness >= 0.7
                    ? "var(--signal-success)"
                    : asset.fitness >= 0.4
                    ? "var(--signal-warning)"
                    : "var(--signal-error)",
              }}
            >
              {(asset.fitness * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Dimensions */}
      {asset.dimensions && (
        <div className="gallery-inspector-section">
          <span className="gallery-inspector-section-label">Dimensions</span>
          <div className="gallery-inspector-dimensions">
            <span>
              {asset.dimensions.x.toFixed(2)} ×{" "}
              {asset.dimensions.y.toFixed(2)} ×{" "}
              {asset.dimensions.z.toFixed(2)} m
            </span>
          </div>
        </div>
      )}

      {/* Geometry */}
      {asset.vertices && (
        <div className="gallery-inspector-section">
          <span className="gallery-inspector-section-label">Geometry</span>
          <div className="gallery-inspector-stat">
            <span className="gallery-inspector-stat-label">Vertices</span>
            <span className="gallery-inspector-stat-value">
              {asset.vertices.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Materials */}
      {asset.materials && asset.materials.length > 0 && (
        <div className="gallery-inspector-section">
          <span className="gallery-inspector-section-label">
            Materials ({asset.materials.length})
          </span>
          <div className="gallery-inspector-materials">
            {asset.materials.map((mat) => (
              <span key={mat} className="gallery-inspector-material-chip">
                {mat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {asset.tags.length > 0 && (
        <div className="gallery-inspector-section">
          <span className="gallery-inspector-section-label">Tags</span>
          <div className="gallery-inspector-tags">
            {asset.tags.map((tag) => (
              <span key={tag} className="gallery-inspector-tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3D Model Status */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">3D Model</span>
        <div className="gallery-inspector-3d-status">
          {asset.has3D ? (
            <span className="gallery-inspector-status-available">
              ✓ Available
            </span>
          ) : (
            <span className="gallery-inspector-status-unavailable">
              ✗ Not available
            </span>
          )}
        </div>
      </div>

      {/* Footer with ID */}
      <div className="gallery-inspector-footer">
        <code className="gallery-inspector-id">{asset.id}</code>
      </div>
    </div>
  );
});

export default AssetTab;
