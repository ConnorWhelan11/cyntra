import React, { useState } from "react";
import type { ProjectInfo, AssetInfo } from "@/types";
import { AssetGrid, AssetViewer } from "@/components/gallery";

interface GalleryViewProps {
  activeProject: ProjectInfo | null;
}

// Mock asset data
const MOCK_ASSETS: AssetInfo[] = [
  {
    id: "asset-001",
    name: "outora_lib",
    category: "building",
    generation: 42,
    fitness: 0.87,
    passed: true,
    vertices: 125000,
    materials: ["limestone", "oak_dark", "brass"],
    criticScores: { geometry: 0.91, lighting: 0.85, composition: 0.88 },
  },
  {
    id: "asset-002",
    name: "car_v3",
    category: "vehicle",
    generation: 12,
    fitness: 0.94,
    passed: true,
    vertices: 45000,
    materials: ["car_paint_red", "chrome", "rubber"],
    criticScores: { geometry: 0.96, materials: 0.92, proportions: 0.95 },
  },
  {
    id: "asset-003",
    name: "desk_01",
    category: "furniture",
    fitness: 0.91,
    passed: true,
    vertices: 8500,
    materials: ["walnut", "steel_brushed"],
  },
  {
    id: "asset-004",
    name: "chair_02",
    category: "furniture",
    fitness: 0.88,
    passed: true,
    vertices: 12000,
    materials: ["leather_brown", "oak_light"],
  },
  {
    id: "asset-005",
    name: "shelf_03",
    category: "furniture",
    fitness: 0.85,
    passed: true,
    vertices: 6200,
  },
  {
    id: "asset-006",
    name: "lamp_01",
    category: "lighting",
    fitness: 0.92,
    passed: true,
    vertices: 3400,
  },
  {
    id: "asset-007",
    name: "column_g",
    category: "structure",
    fitness: 0.89,
    passed: true,
    vertices: 18000,
  },
  {
    id: "asset-008",
    name: "arch_01",
    category: "structure",
    fitness: 0.90,
    passed: true,
    vertices: 24000,
  },
];

const CATEGORIES = ["all", "building", "furniture", "lighting", "structure", "vehicle"];

export function GalleryView({ activeProject }: GalleryViewProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [viewerAsset, setViewerAsset] = useState<AssetInfo | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "generation" | "fitness" | "category">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const selectedAsset = MOCK_ASSETS.find((a) => a.id === selectedAssetId) || null;

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center text-tertiary">
        <div className="text-center">
          <div className="text-4xl mb-4">🎨</div>
          <div>Select a project to browse assets</div>
        </div>
      </div>
    );
  }

  // If viewing an asset in full viewer mode
  if (viewerAsset) {
    return (
      <div className="h-full">
        <AssetViewer
          asset={viewerAsset}
          onClose={() => setViewerAsset(null)}
          onCompare={() => console.log("Compare mode")}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-primary tracking-tight">
          GALLERY
        </h1>
        <div className="flex items-center gap-3">
          {/* Filter dropdown */}
          <select
            value={filterCategory || "all"}
            onChange={(e) => setFilterCategory(e.target.value === "all" ? null : e.target.value)}
            className="mc-input w-32"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="mc-input w-32"
          >
            <option value="name">Name</option>
            <option value="generation">Generation</option>
            <option value="fitness">Fitness</option>
            <option value="category">Category</option>
          </select>

          <button
            className="mc-btn-icon"
            onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
            title={`Sort ${sortOrder === "asc" ? "descending" : "ascending"}`}
          >
            {sortOrder === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Asset grid */}
        <div className="col-span-8 mc-panel overflow-auto">
          <AssetGrid
            assets={MOCK_ASSETS}
            selectedAssetId={selectedAssetId}
            onAssetSelect={(a) => setSelectedAssetId(a.id)}
            onAssetOpen={(a) => setViewerAsset(a)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            filterCategory={filterCategory}
          />
        </div>

        {/* Preview panel */}
        <div className="col-span-4 mc-panel flex flex-col min-h-0">
          <div className="mc-panel-header">
            <span className="mc-panel-title">Preview</span>
            {selectedAsset && (
              <button
                className="mc-btn text-xs"
                onClick={() => setViewerAsset(selectedAsset)}
              >
                Full View
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {selectedAsset ? (
              <AssetViewer
                asset={selectedAsset}
                onClose={() => setSelectedAssetId(null)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-tertiary">
                <div className="text-center">
                  <div className="text-4xl mb-2">🖼️</div>
                  <div className="text-sm">Select an asset to preview</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GalleryView;
