import React, { memo, useState, useCallback } from "react";
import type { GalleryAsset, GallerySortField, GallerySortOrder } from "@/types/ui";
import { VirtualizedGrid } from "./VirtualizedGrid";

interface AssetStripProps {
  assets: GalleryAsset[];
  totalCount: number;
  selectedAssetId: string | null;
  hoveredAssetId: string | null;
  sortBy: GallerySortField;
  sortOrder: GallerySortOrder;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onSortChange: (sortBy: GallerySortField, sortOrder: GallerySortOrder) => void;
  onToggleSortOrder: () => void;
}

type ViewMode = "grid" | "filmstrip";

const SORT_OPTIONS: { value: GallerySortField; label: string }[] = [
  { value: "updated", label: "Last Updated" },
  { value: "name", label: "Name" },
  { value: "fitness", label: "Fitness" },
  { value: "generation", label: "Generation" },
];

export const AssetStrip = memo(function AssetStrip({
  assets,
  totalCount,
  selectedAssetId,
  hoveredAssetId,
  sortBy,
  sortOrder,
  onSelect,
  onHover,
  onSortChange,
  onToggleSortOrder,
}: AssetStripProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const handleSortChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onSortChange(e.target.value as GallerySortField, sortOrder);
    },
    [onSortChange, sortOrder]
  );

  return (
    <div className="asset-strip">
      {/* Header */}
      <div className="asset-strip-header">
        <div className="asset-strip-count">
          {assets.length === totalCount
            ? `${assets.length} assets`
            : `${assets.length} of ${totalCount} assets`}
        </div>

        <div className="asset-strip-controls">
          {/* View toggle */}
          <div className="asset-strip-view-toggle" role="group" aria-label="View mode">
            <button
              className={`asset-strip-view-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              title="Grid view"
            >
              <span>⊞</span>
            </button>
            <button
              className={`asset-strip-view-btn ${viewMode === "filmstrip" ? "active" : ""}`}
              onClick={() => setViewMode("filmstrip")}
              aria-pressed={viewMode === "filmstrip"}
              title="Filmstrip view"
            >
              <span>☰</span>
            </button>
          </div>

          {/* Sort controls */}
          <div className="asset-strip-sort">
            <select
              value={sortBy}
              onChange={handleSortChange}
              className="asset-strip-sort-select"
              aria-label="Sort by"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              className="asset-strip-sort-order"
              onClick={onToggleSortOrder}
              aria-label={`Sort ${sortOrder === "asc" ? "ascending" : "descending"}`}
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>
      </div>

      {/* Grid content */}
      <div className="asset-strip-content">
        <VirtualizedGrid
          assets={assets}
          selectedAssetId={selectedAssetId}
          hoveredAssetId={hoveredAssetId}
          onSelect={onSelect}
          onHover={onHover}
          tileWidth={viewMode === "grid" ? 120 : 140}
          tileHeight={viewMode === "grid" ? 160 : 180}
          gap={viewMode === "grid" ? 8 : 12}
        />
      </div>
    </div>
  );
});

export default AssetStrip;
