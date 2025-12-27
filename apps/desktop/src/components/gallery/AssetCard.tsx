import React from "react";
import type { AssetInfo } from "@/types";

interface AssetCardProps {
  asset: AssetInfo;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  className?: string;
}

export function AssetCard({
  asset,
  selected = false,
  onClick,
  onDoubleClick,
  className = "",
}: AssetCardProps) {
  const getVerdictDisplay = () => {
    if (asset.passed === undefined) return null;
    if (asset.passed) {
      return (
        <span className="text-success flex items-center gap-1">
          <span>✓</span>
          {asset.fitness !== undefined && (
            <span className="font-mono">{asset.fitness.toFixed(2)}</span>
          )}
        </span>
      );
    }
    return (
      <span className="text-error flex items-center gap-1">
        <span>✗</span>
        {asset.fitness !== undefined && (
          <span className="font-mono">{asset.fitness.toFixed(2)}</span>
        )}
      </span>
    );
  };

  return (
    <div
      className={`
        w-[180px] overflow-hidden rounded-lg border border-card-border bg-card-bg
        cursor-pointer transition-all
        ${selected ? "border-card-selected-border shadow-glow-accent" : "hover:border-accent-dim"}
        ${className}
      `}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* Thumbnail */}
      <div className="aspect-square bg-void relative overflow-hidden">
        {asset.thumbnailUrl ? (
          <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          // Placeholder 3D icon
          <div className="w-full h-full flex items-center justify-center text-4xl text-tertiary">
            <span role="img" aria-label="3D model">
              🖼️
            </span>
          </div>
        )}

        {/* Auto-rotate indicator (placeholder) */}
        <div className="absolute bottom-2 right-2 text-xs text-tertiary bg-void/80 px-1.5 py-0.5 rounded">
          3D
        </div>
      </div>

      {/* Info */}
      <div className="p-3 border-t border-slate">
        <div className="text-sm font-medium text-primary truncate" title={asset.name}>
          {asset.name}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-tertiary">
            {asset.category}
            {asset.generation !== undefined && (
              <span className="ml-1 font-mono">gen:{asset.generation}</span>
            )}
          </span>
          {getVerdictDisplay()}
        </div>
      </div>
    </div>
  );
}

export default AssetCard;
