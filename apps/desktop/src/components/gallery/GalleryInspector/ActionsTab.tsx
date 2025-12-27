import { memo, useCallback } from "react";
import type { GalleryAsset } from "@/types/ui";

interface ActionsTabProps {
  asset: GalleryAsset | null;
  onOpen?: (asset: GalleryAsset) => void;
  onExport?: (asset: GalleryAsset) => void;
}

export const ActionsTab = memo(function ActionsTab({ asset, onOpen, onExport }: ActionsTabProps) {
  const handleOpen = useCallback(() => {
    if (asset && onOpen) {
      onOpen(asset);
    }
  }, [asset, onOpen]);

  const handleExport = useCallback(() => {
    if (asset && onExport) {
      onExport(asset);
    }
  }, [asset, onExport]);

  if (!asset) {
    return (
      <div className="gallery-inspector-empty">
        <span className="gallery-inspector-empty-icon">⚡</span>
        <span>Select an asset to view actions</span>
      </div>
    );
  }

  return (
    <div className="gallery-inspector-tab-content">
      {/* Primary Actions */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Primary Actions</span>
        <div className="gallery-inspector-actions-grid">
          <button
            type="button"
            className="gallery-inspector-action primary"
            onClick={handleOpen}
            disabled={!asset.has3D}
            title={asset.has3D ? "Open in viewer" : "No 3D model available"}
          >
            <span className="gallery-inspector-action-icon">🔍</span>
            <span className="gallery-inspector-action-label">Open</span>
          </button>

          <button
            type="button"
            className="gallery-inspector-action"
            onClick={handleExport}
            disabled={!asset.modelUrl}
            title={asset.modelUrl ? "Export asset" : "No model to export"}
          >
            <span className="gallery-inspector-action-icon">📤</span>
            <span className="gallery-inspector-action-label">Export</span>
          </button>
        </div>
      </div>

      {/* World Actions */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">World Actions</span>
        <div className="gallery-inspector-actions-list">
          <button
            type="button"
            className="gallery-inspector-action-row"
            disabled
            title="Coming soon"
          >
            <span className="gallery-inspector-action-icon">🌍</span>
            <span className="gallery-inspector-action-text">
              Use in World
              <span className="gallery-inspector-action-hint">Add to active world</span>
            </span>
          </button>

          <button
            type="button"
            className="gallery-inspector-action-row"
            disabled
            title="Coming soon"
          >
            <span className="gallery-inspector-action-icon">📍</span>
            <span className="gallery-inspector-action-text">
              Pin to Collection
              <span className="gallery-inspector-action-hint">Save to favorites</span>
            </span>
          </button>
        </div>
      </div>

      {/* Evolution Actions */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Evolution Actions</span>
        <div className="gallery-inspector-actions-list">
          <button
            type="button"
            className="gallery-inspector-action-row"
            disabled
            title="Coming soon"
          >
            <span className="gallery-inspector-action-icon">🧬</span>
            <span className="gallery-inspector-action-text">
              Evolve From
              <span className="gallery-inspector-action-hint">Use as parent for mutation</span>
            </span>
          </button>

          <button
            type="button"
            className="gallery-inspector-action-row"
            disabled
            title="Coming soon"
          >
            <span className="gallery-inspector-action-icon">🔀</span>
            <span className="gallery-inspector-action-text">
              Compare
              <span className="gallery-inspector-action-hint">Side-by-side with another</span>
            </span>
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="gallery-inspector-section danger">
        <span className="gallery-inspector-section-label">Danger Zone</span>
        <div className="gallery-inspector-actions-list">
          <button
            type="button"
            className="gallery-inspector-action-row danger"
            disabled
            title="Coming soon"
          >
            <span className="gallery-inspector-action-icon">🗑️</span>
            <span className="gallery-inspector-action-text">
              Delete Asset
              <span className="gallery-inspector-action-hint">Remove permanently</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
});

export default ActionsTab;
