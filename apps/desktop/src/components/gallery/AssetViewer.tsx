import React, { useState } from "react";

interface AssetInfo {
  id: string;
  name: string;
  category: string;
  generation?: number;
  fitness?: number;
  passed?: boolean;
  modelUrl?: string;
  vertices?: number;
  materials?: string[];
  criticScores?: Record<string, number>;
}

interface AssetViewerProps {
  asset: AssetInfo | null;
  onClose?: () => void;
  onCompare?: () => void;
  className?: string;
}

type ViewMode = "solid" | "wireframe" | "textured";

export function AssetViewer({ asset, onClose, onCompare, className = "" }: AssetViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("solid");

  if (!asset) {
    return (
      <div className={`flex items-center justify-center h-full text-tertiary ${className}`}>
        Select an asset to view
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-primary">{asset.name}</h2>
          <span className="mc-badge">{asset.category}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggles */}
          <div className="flex rounded-md border border-slate overflow-hidden">
            {(["solid", "wireframe", "textured"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                className={`px-3 py-1 text-xs ${
                  viewMode === mode
                    ? "bg-obsidian text-primary"
                    : "text-tertiary hover:text-secondary"
                }`}
                onClick={() => setViewMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          {onCompare && (
            <button className="mc-btn text-sm" onClick={onCompare}>
              Compare
            </button>
          )}

          {onClose && (
            <button className="mc-btn-icon" onClick={onClose} title="Close">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 3D Viewport (placeholder) */}
      <div className="flex-1 bg-void relative">
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Placeholder for Three.js viewer */}
          <div className="text-center text-tertiary">
            <div className="text-6xl mb-4">🖼️</div>
            <div className="text-sm">3D Viewer</div>
            <div className="text-xs mt-1">Mode: {viewMode}</div>
          </div>
        </div>

        {/* Viewport controls hint */}
        <div className="absolute bottom-4 left-4 text-xs text-tertiary bg-void/80 px-2 py-1 rounded">
          Drag to rotate • Scroll to zoom • Right-drag to pan
        </div>
      </div>

      {/* Metadata sidebar */}
      <div className="w-full border-t border-slate p-4 space-y-4 max-h-[200px] overflow-y-auto">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-tertiary">Generation</div>
            <div className="font-mono text-primary">{asset.generation ?? "N/A"}</div>
          </div>
          <div>
            <div className="text-xs text-tertiary">Vertices</div>
            <div className="font-mono text-primary">
              {asset.vertices?.toLocaleString() ?? "N/A"}
            </div>
          </div>
          <div>
            <div className="text-xs text-tertiary">Fitness</div>
            <div className="font-mono text-primary">{asset.fitness?.toFixed(3) ?? "N/A"}</div>
          </div>
        </div>

        {/* Materials */}
        {asset.materials && asset.materials.length > 0 && (
          <div>
            <div className="text-xs text-tertiary mb-1">Materials</div>
            <div className="flex flex-wrap gap-1">
              {asset.materials.map((mat) => (
                <span key={mat} className="mc-badge text-xs">
                  {mat}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Critic scores */}
        {asset.criticScores && Object.keys(asset.criticScores).length > 0 && (
          <div>
            <div className="text-xs text-tertiary mb-1">Critic Scores</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(asset.criticScores).map(([name, score]) => (
                <div key={name} className="flex justify-between text-sm">
                  <span className="text-secondary">{name}</span>
                  <span className="font-mono text-primary">{score.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AssetViewer;
