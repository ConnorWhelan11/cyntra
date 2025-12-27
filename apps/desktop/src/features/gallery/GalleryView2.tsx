import { useEffect, useCallback, useMemo } from "react";
import type { GalleryAsset, AssetType } from "@/types/ui";
import { useGalleryState } from "./useGalleryState";
import { GalleryLayout } from "@/components/gallery/GalleryLayout";
import { HolodeckStage } from "@/components/gallery/HolodeckStage";
import { LensRail } from "@/components/gallery/LensRail";
import { AssetStrip } from "@/components/gallery/AssetStrip";
import { GalleryInspector } from "@/components/gallery/GalleryInspector";

// ============================================================================
// Mock Data (Phase A - will be replaced with real data source)
// ============================================================================

const MOCK_ASSETS: GalleryAsset[] = [
  {
    id: "asset-001",
    name: "Rubber Duck",
    type: "prop",
    world: "outora_library",
    tags: ["toy", "yellow", "bath"],
    fitness: 0.92,
    passed: true,
    generation: 12,
    thumbnailUrl: undefined,
    modelUrl: "/models/duck.glb",
    has3D: true,
    vertices: 4212,
    materials: ["Rubber"],
    dimensions: { x: 0.2, y: 0.2, z: 0.2 },
    createdAt: "2024-01-15T10:30:00Z",
    updatedAt: "2024-01-20T14:22:00Z",
    criticScores: { geometry: 0.95, realism: 0.9, alignment: 0.92 },
    gateVerdict: "pass",
  },
  {
    id: "asset-002",
    name: "Damaged Helmet",
    type: "prop",
    world: "outora_library",
    tags: ["scifi", "worn", "metal"],
    fitness: 0.88,
    passed: true,
    generation: 8,
    thumbnailUrl: undefined,
    modelUrl: "/models/damaged_helmet.glb",
    has3D: true,
    vertices: 14556,
    materials: ["Metal", "Visor", "Worn Paint"],
    dimensions: { x: 0.3, y: 0.35, z: 0.3 },
    createdAt: "2024-01-10T09:15:00Z",
    updatedAt: "2024-01-18T16:45:00Z",
    criticScores: { geometry: 0.94, realism: 0.85, alignment: 0.86 },
    gateVerdict: "pass",
  },
  {
    id: "asset-003",
    name: "Fresh Avocado",
    type: "prop",
    world: "outora_library",
    tags: ["food", "organic", "green"],
    fitness: 0.95,
    passed: true,
    generation: 15,
    thumbnailUrl: undefined,
    modelUrl: "/models/avocado.glb",
    has3D: true,
    vertices: 406,
    materials: ["Avocado Skin", "Flesh", "Seed"],
    dimensions: { x: 0.08, y: 0.12, z: 0.08 },
    createdAt: "2024-01-08T11:00:00Z",
    updatedAt: "2024-01-19T09:30:00Z",
    criticScores: { geometry: 0.96, realism: 0.94, alignment: 0.95 },
    gateVerdict: "pass",
  },
  {
    id: "asset-004",
    name: "Antique Lantern",
    type: "lighting",
    world: "outora_library",
    tags: ["vintage", "metal", "warm"],
    fitness: 0.91,
    passed: true,
    generation: 5,
    thumbnailUrl: undefined,
    modelUrl: "/models/lantern.glb",
    has3D: true,
    vertices: 24016,
    materials: ["Brass", "Glass", "Candle"],
    dimensions: { x: 0.15, y: 0.4, z: 0.15 },
    createdAt: "2024-01-12T14:20:00Z",
    updatedAt: "2024-01-17T11:15:00Z",
    criticScores: { geometry: 0.93, realism: 0.9, alignment: 0.91 },
    gateVerdict: "pass",
  },
  {
    id: "asset-005",
    name: "Water Bottle",
    type: "prop",
    world: "outora_library",
    tags: ["container", "glass", "clear"],
    fitness: 0.89,
    passed: true,
    generation: 3,
    thumbnailUrl: undefined,
    modelUrl: "/models/water_bottle.glb",
    has3D: true,
    vertices: 13530,
    materials: ["Glass", "Water", "Cap"],
    dimensions: { x: 0.08, y: 0.25, z: 0.08 },
    createdAt: "2024-01-05T08:45:00Z",
    updatedAt: "2024-01-14T15:30:00Z",
    criticScores: { geometry: 0.92, realism: 0.88, alignment: 0.87 },
    gateVerdict: "pass",
  },
  {
    id: "asset-006",
    name: "Decorative Vase",
    type: "prop",
    world: "test_world",
    tags: ["ceramic", "decorative", "blue"],
    fitness: 0.88,
    passed: true,
    generation: 7,
    thumbnailUrl: undefined,
    modelUrl: undefined,
    has3D: false,
    vertices: 2100,
    materials: ["Ceramic"],
    dimensions: { x: 0.15, y: 0.35, z: 0.15 },
    createdAt: "2024-01-11T13:00:00Z",
    updatedAt: "2024-01-16T10:20:00Z",
    criticScores: { geometry: 0.9, realism: 0.87, alignment: 0.88 },
    gateVerdict: "pass",
  },
  {
    id: "asset-007",
    name: "Victorian Townhouse",
    type: "building",
    world: "test_world",
    tags: ["victorian", "residential", "brick"],
    fitness: 0.72,
    passed: true,
    generation: 9,
    thumbnailUrl: undefined,
    modelUrl: undefined,
    has3D: false,
    vertices: 35000,
    materials: ["Brick", "Wood", "Glass", "Slate"],
    dimensions: { x: 8, y: 12, z: 10 },
    createdAt: "2024-01-09T07:30:00Z",
    updatedAt: "2024-01-15T12:45:00Z",
    criticScores: { geometry: 0.75, realism: 0.7, alignment: 0.72 },
    gateVerdict: "pass",
  },
  {
    id: "asset-008",
    name: "Executive Desk",
    type: "furniture",
    world: "outora_library",
    tags: ["executive", "wood", "premium"],
    fitness: 0.45,
    passed: false,
    generation: 2,
    thumbnailUrl: undefined,
    modelUrl: undefined,
    has3D: false,
    vertices: 5500,
    materials: ["Walnut", "Leather", "Brass"],
    dimensions: { x: 2.0, y: 0.8, z: 1.0 },
    createdAt: "2024-01-06T16:00:00Z",
    updatedAt: "2024-01-13T09:10:00Z",
    criticScores: { geometry: 0.5, realism: 0.42, alignment: 0.44 },
    gateVerdict: "fail",
  },
];

// Generate more mock assets for virtualization testing
function generateMockAssets(count: number): GalleryAsset[] {
  const types: AssetType[] = ["building", "furniture", "vehicle", "lighting", "structure", "prop"];
  const worlds = ["outora_library", "test_world", "urban_demo"];
  const tags = ["modern", "vintage", "industrial", "minimalist", "organic", "geometric"];

  const assets: GalleryAsset[] = [...MOCK_ASSETS];

  for (let i = MOCK_ASSETS.length; i < count; i++) {
    const type = types[i % types.length];
    const world = worlds[i % worlds.length];
    const fitness = 0.3 + Math.random() * 0.7;

    assets.push({
      id: `asset-${String(i + 1).padStart(3, "0")}`,
      name: `Generated ${type} #${i + 1}`,
      type,
      world,
      tags: [tags[i % tags.length], tags[(i + 1) % tags.length]],
      fitness,
      passed: fitness >= 0.5,
      generation: Math.floor(Math.random() * 20) + 1,
      thumbnailUrl: undefined,
      // Note: modelUrl is undefined for mock data - real assets would have actual GLB paths
      modelUrl: undefined,
      has3D: false, // Generated mocks don't have actual 3D models
      vertices: Math.floor(Math.random() * 50000) + 1000,
      materials: ["Material A", "Material B"],
      dimensions: { x: Math.random() * 10, y: Math.random() * 10, z: Math.random() * 10 },
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      criticScores: {
        geometry: 0.3 + Math.random() * 0.7,
        realism: 0.3 + Math.random() * 0.7,
        alignment: 0.3 + Math.random() * 0.7,
      },
      gateVerdict: fitness >= 0.5 ? "pass" : "fail",
    });
  }

  return assets;
}

// ============================================================================
// Component
// ============================================================================

interface GalleryView2Props {
  activeProject?: { root: string } | null;
}

/**
 * GalleryView2 - Holodeck Stage Gallery
 *
 * Visual-first asset browsing with:
 * - Always-alive 3D stage (hero)
 * - Dense virtualized asset grid
 * - Notion-style inspector drawer
 * - Lens rail filters
 */
export function GalleryView2({ activeProject: _activeProject }: GalleryView2Props) {
  // Generate mock assets (50 for testing virtualization)
  const allAssets = useMemo(() => generateMockAssets(50), []);

  // Gallery state
  const state = useGalleryState(allAssets);
  const { stageMode, featuredAssets, nextFeatured } = state;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focus is in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Escape to clear selection
      if (e.key === "Escape") {
        state.escape();
        return;
      }

      // Arrow keys for grid navigation (assuming 6 columns)
      const columnsPerRow = 6;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          state.navigateGrid("left", columnsPerRow);
          break;
        case "ArrowRight":
          e.preventDefault();
          state.navigateGrid("right", columnsPerRow);
          break;
        case "ArrowUp":
          e.preventDefault();
          state.navigateGrid("up", columnsPerRow);
          break;
        case "ArrowDown":
          e.preventDefault();
          state.navigateGrid("down", columnsPerRow);
          break;
        case "Enter":
          if (state.selectedAssetId) {
            state.toggleDrawer(true);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state]);

  // Featured rotation (cycle every 5 seconds in featured mode)
  useEffect(() => {
    if (stageMode !== "featured" || featuredAssets.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      nextFeatured();
    }, 5000);

    return () => clearInterval(interval);
  }, [stageMode, featuredAssets.length, nextFeatured]);

  // Action handlers
  const handleOpenAsset = useCallback((asset: GalleryAsset) => {
    console.log("Open asset:", asset.id);
    // TODO: Implement full viewer modal
  }, []);

  const handleExportAsset = useCallback((asset: GalleryAsset) => {
    console.log("Export asset:", asset.id);
    // TODO: Implement export
  }, []);

  return (
    <div className="gallery-view-2">
      <GalleryLayout
        inspectorOpen={state.drawerOpen}
        stage={
          <HolodeckStage
            asset={state.stageAsset}
            mode={state.stageMode}
            isLoading={state.stageLoading}
            featuredAssets={state.featuredAssets}
          />
        }
        lensRail={
          <LensRail
            filters={state.lensFilters}
            availableWorlds={state.availableWorlds}
            availableTags={state.availableTags}
            hasActiveFilters={state.hasActiveFilters}
            onToggleType={state.toggleTypeFilter}
            onToggleWorld={state.toggleWorldFilter}
            onToggleTag={state.toggleTagFilter}
            onSetFitnessRange={state.setFitnessRange}
            onSetHas3D={state.setHas3DFilter}
            onClearFilters={state.clearFilters}
          />
        }
        assetStrip={
          <AssetStrip
            assets={state.filteredAssets}
            totalCount={state.totalAssets}
            selectedAssetId={state.selectedAssetId}
            hoveredAssetId={state.hoveredAssetId}
            sortBy={state.sortBy}
            sortOrder={state.sortOrder}
            onSelect={state.selectAsset}
            onHover={state.hoverAsset}
            onSortChange={state.setSort}
            onToggleSortOrder={state.toggleSortOrder}
          />
        }
        inspector={
          <GalleryInspector
            isOpen={state.drawerOpen}
            isPinned={state.drawerPinned}
            activeTab={state.activeTab}
            asset={state.selectedAsset}
            onClose={() => state.toggleDrawer(false)}
            onPin={state.pinDrawer}
            onTabChange={state.setTab}
            onOpenAsset={handleOpenAsset}
            onExportAsset={handleExportAsset}
          />
        }
      />
    </div>
  );
}

export default GalleryView2;
