import { useRef, useMemo, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { GalleryAsset } from "@/types/ui";
import { AssetTile } from "./AssetTile";

interface VirtualizedGridProps {
  assets: GalleryAsset[];
  selectedAssetId: string | null;
  hoveredAssetId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  columnsPerRow?: number;
  tileWidth?: number;
  tileHeight?: number;
  gap?: number;
}

export function VirtualizedGrid({
  assets,
  selectedAssetId,
  hoveredAssetId,
  onSelect,
  onHover,
  columnsPerRow: fixedColumns,
  tileWidth = 120,
  tileHeight = 160,
  gap = 8,
}: VirtualizedGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Observe container width changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    // Initial measurement
    setContainerWidth(container.offsetWidth);

    return () => observer.disconnect();
  }, []);

  // Calculate columns based on container width
  const columnsPerRow = useMemo(() => {
    if (fixedColumns) return fixedColumns;
    if (containerWidth === 0) return 6; // Default until measured
    // Calculate how many tiles fit
    const availableWidth = containerWidth - gap * 2; // Account for padding
    const cols = Math.max(1, Math.floor((availableWidth + gap) / (tileWidth + gap)));
    return cols;
  }, [fixedColumns, containerWidth, tileWidth, gap]);

  // Group assets into rows
  const rows = useMemo(() => {
    const result: GalleryAsset[][] = [];
    for (let i = 0; i < assets.length; i += columnsPerRow) {
      result.push(assets.slice(i, i + columnsPerRow));
    }
    return result;
  }, [assets, columnsPerRow]);

  // Virtual row renderer
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => tileHeight + gap,
    overscan: 5,
  });

  // Force virtualizer to recalculate when rows change
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rows.length, rowVirtualizer]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedAssetId) {
      const index = assets.findIndex((a) => a.id === selectedAssetId);
      if (index >= 0) {
        const rowIndex = Math.floor(index / columnsPerRow);
        rowVirtualizer.scrollToIndex(rowIndex, { align: "auto" });
      }
    }
  }, [selectedAssetId, assets, columnsPerRow, rowVirtualizer]);

  if (assets.length === 0) {
    return (
      <div className="virtualized-grid-empty">
        <div className="virtualized-grid-empty-icon">📦</div>
        <div className="virtualized-grid-empty-text">No assets found</div>
        <div className="virtualized-grid-empty-hint">Try adjusting your filters</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="virtualized-grid-container"
      style={{
        height: "100%",
        width: "100%",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <div
        key={`grid-${columnsPerRow}`}
        className="virtualized-grid-inner"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowAssets = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              className="virtualized-grid-row"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${tileHeight}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: "flex",
                gap: `${gap}px`,
                paddingLeft: `${gap}px`,
                paddingRight: `${gap}px`,
              }}
            >
              {rowAssets.map((asset) => (
                <AssetTile
                  key={asset.id}
                  asset={asset}
                  isSelected={selectedAssetId === asset.id}
                  isHovered={hoveredAssetId === asset.id}
                  onSelect={onSelect}
                  onHover={onHover}
                  style={{
                    width: `${tileWidth}px`,
                    height: `${tileHeight}px`,
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualizedGrid;
