import React from "react";
import type { AssetInfo } from "@/types";
import { AssetCard } from "./AssetCard";

interface AssetGridProps {
  assets: AssetInfo[];
  selectedAssetId?: string | null;
  onAssetSelect?: (asset: AssetInfo) => void;
  onAssetOpen?: (asset: AssetInfo) => void;
  sortBy?: "name" | "generation" | "fitness" | "category";
  sortOrder?: "asc" | "desc";
  filterCategory?: string | null;
  className?: string;
}

export function AssetGrid({
  assets,
  selectedAssetId,
  onAssetSelect,
  onAssetOpen,
  sortBy = "name",
  sortOrder = "asc",
  filterCategory,
  className = "",
}: AssetGridProps) {
  // Filter and sort assets
  const processedAssets = React.useMemo(() => {
    let result = [...assets];

    // Filter by category
    if (filterCategory) {
      result = result.filter((a) => a.category === filterCategory);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "generation":
          comparison = (a.generation ?? 0) - (b.generation ?? 0);
          break;
        case "fitness":
          comparison = (a.fitness ?? 0) - (b.fitness ?? 0);
          break;
        case "category":
          comparison = a.category.localeCompare(b.category);
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    return result;
  }, [assets, sortBy, sortOrder, filterCategory]);

  if (processedAssets.length === 0) {
    return <div className={`p-8 text-center text-tertiary ${className}`}>No assets found</div>;
  }

  return (
    <div className={`flex flex-wrap gap-4 p-4 ${className}`}>
      {processedAssets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          selected={selectedAssetId === asset.id}
          onClick={() => onAssetSelect?.(asset)}
          onDoubleClick={() => onAssetOpen?.(asset)}
        />
      ))}
    </div>
  );
}

export default AssetGrid;
