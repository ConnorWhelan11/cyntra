import React, { memo, useCallback } from "react";
import type { GalleryAsset } from "@/types/ui";
import { ASSET_TYPE_ICONS } from "@/features/gallery/useGalleryState";

interface AssetTileProps {
  asset: GalleryAsset;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  style?: React.CSSProperties;
}

export const AssetTile = memo(function AssetTile({
  asset,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  style,
}: AssetTileProps) {
  const handleClick = useCallback(() => {
    onSelect(asset.id);
  }, [asset.id, onSelect]);

  const handleMouseEnter = useCallback(() => {
    onHover(asset.id);
  }, [asset.id, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(asset.id);
      }
    },
    [asset.id, onSelect]
  );

  // Fitness color: red (0) -> yellow (0.5) -> green (1)
  const fitnessColor = asset.fitness >= 0.7
    ? "var(--signal-success)"
    : asset.fitness >= 0.4
    ? "var(--signal-warning)"
    : "var(--signal-error)";

  return (
    <div
      className={`asset-tile ${isSelected ? "selected" : ""} ${isHovered ? "hovered" : ""}`}
      style={style}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-selected={isSelected}
      aria-label={`${asset.name}, ${asset.type}, fitness ${(asset.fitness * 100).toFixed(0)}%`}
    >
      {/* Thumbnail */}
      <div className="asset-tile-thumbnail">
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.name}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="asset-tile-placeholder">
            <span className="asset-tile-placeholder-icon">
              {ASSET_TYPE_ICONS[asset.type]}
            </span>
          </div>
        )}

        {/* 3D badge */}
        {asset.has3D && (
          <span className="asset-tile-badge-3d" title="Has 3D model">
            3D
          </span>
        )}

        {/* Gate verdict indicator */}
        {asset.gateVerdict && (
          <span
            className={`asset-tile-verdict asset-tile-verdict-${asset.gateVerdict}`}
            title={`Gate: ${asset.gateVerdict}`}
          >
            {asset.gateVerdict === "pass" ? "✓" : asset.gateVerdict === "fail" ? "✗" : "○"}
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="asset-tile-meta">
        <div className="asset-tile-name" title={asset.name}>
          {asset.name}
        </div>
        <div className="asset-tile-info">
          <span className="asset-tile-type">{asset.type}</span>
          <span className="asset-tile-fitness" style={{ color: fitnessColor }}>
            {(asset.fitness * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Selection ring (rendered via CSS) */}
    </div>
  );
});

export default AssetTile;
