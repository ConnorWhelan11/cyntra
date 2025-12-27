import { useReducer, useCallback, useMemo, useRef, useEffect } from "react";
import type {
  GalleryAsset,
  GalleryLensFilters,
  GallerySortField,
  GallerySortOrder,
  GalleryInspectorTab,
  GalleryStageMode,
  AssetType,
} from "@/types/ui";

// ============================================================================
// Types
// ============================================================================

export interface GalleryState {
  // Selection
  selectedAssetId: string | null;
  hoveredAssetId: string | null;

  // Stage mode
  stageMode: GalleryStageMode;
  featuredIndex: number;

  // Filters
  lensFilters: GalleryLensFilters;
  sortBy: GallerySortField;
  sortOrder: GallerySortOrder;

  // Drawer
  drawerOpen: boolean;
  drawerPinned: boolean;
  activeTab: GalleryInspectorTab;

  // Loading
  stageLoading: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  building: "Building",
  furniture: "Furniture",
  vehicle: "Vehicle",
  lighting: "Lighting",
  structure: "Structure",
  prop: "Prop",
};

export const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  building: "🏢",
  furniture: "🪑",
  vehicle: "🚗",
  lighting: "💡",
  structure: "🏗",
  prop: "📦",
};

const DEFAULT_FILTERS: GalleryLensFilters = {
  types: [],
  worlds: [],
  tags: [],
  fitnessRange: [0, 1],
  has3D: null,
};

// ============================================================================
// Actions
// ============================================================================

type GalleryAction =
  | { type: "SELECT_ASSET"; id: string | null }
  | { type: "HOVER_ASSET"; id: string | null }
  | { type: "SET_STAGE_MODE"; mode: GalleryStageMode }
  | { type: "NEXT_FEATURED" }
  | { type: "SET_FEATURED_INDEX"; index: number }
  | { type: "SET_FILTERS"; filters: Partial<GalleryLensFilters> }
  | { type: "CLEAR_FILTERS" }
  | { type: "TOGGLE_TYPE_FILTER"; assetType: AssetType }
  | { type: "TOGGLE_WORLD_FILTER"; world: string }
  | { type: "TOGGLE_TAG_FILTER"; tag: string }
  | { type: "SET_FITNESS_RANGE"; range: [number, number] }
  | { type: "SET_HAS_3D_FILTER"; has3D: boolean | null }
  | { type: "SET_SORT"; sortBy: GallerySortField; sortOrder: GallerySortOrder }
  | { type: "TOGGLE_SORT_ORDER" }
  | { type: "TOGGLE_DRAWER"; open?: boolean }
  | { type: "PIN_DRAWER"; pinned: boolean }
  | { type: "SET_TAB"; tab: GalleryInspectorTab }
  | { type: "SET_STAGE_LOADING"; loading: boolean }
  | { type: "ESCAPE" };

// ============================================================================
// Initial State
// ============================================================================

const initialState: GalleryState = {
  selectedAssetId: null,
  hoveredAssetId: null,
  stageMode: "featured",
  featuredIndex: 0,
  lensFilters: DEFAULT_FILTERS,
  sortBy: "updated",
  sortOrder: "desc",
  drawerOpen: false,
  drawerPinned: false,
  activeTab: "asset",
  stageLoading: false,
};

// ============================================================================
// Reducer
// ============================================================================

function galleryReducer(state: GalleryState, action: GalleryAction): GalleryState {
  switch (action.type) {
    case "SELECT_ASSET":
      return {
        ...state,
        selectedAssetId: action.id,
        stageMode: action.id ? "selected" : "featured",
        drawerOpen: action.id !== null, // Auto-open on selection
        activeTab: action.id ? "asset" : state.activeTab,
      };

    case "HOVER_ASSET":
      // Don't change stage mode if something is selected
      if (state.selectedAssetId && action.id) {
        return { ...state, hoveredAssetId: action.id };
      }
      return {
        ...state,
        hoveredAssetId: action.id,
        stageMode: action.id ? "hover-preview" : state.selectedAssetId ? "selected" : "featured",
      };

    case "SET_STAGE_MODE":
      return { ...state, stageMode: action.mode };

    case "NEXT_FEATURED":
      return { ...state, featuredIndex: state.featuredIndex + 1 };

    case "SET_FEATURED_INDEX":
      return { ...state, featuredIndex: action.index };

    case "SET_FILTERS":
      return {
        ...state,
        lensFilters: { ...state.lensFilters, ...action.filters },
      };

    case "CLEAR_FILTERS":
      return { ...state, lensFilters: DEFAULT_FILTERS };

    case "TOGGLE_TYPE_FILTER": {
      const types = state.lensFilters.types.includes(action.assetType)
        ? state.lensFilters.types.filter((t) => t !== action.assetType)
        : [...state.lensFilters.types, action.assetType];
      return {
        ...state,
        lensFilters: { ...state.lensFilters, types },
      };
    }

    case "TOGGLE_WORLD_FILTER": {
      const worlds = state.lensFilters.worlds.includes(action.world)
        ? state.lensFilters.worlds.filter((w) => w !== action.world)
        : [...state.lensFilters.worlds, action.world];
      return {
        ...state,
        lensFilters: { ...state.lensFilters, worlds },
      };
    }

    case "TOGGLE_TAG_FILTER": {
      const tags = state.lensFilters.tags.includes(action.tag)
        ? state.lensFilters.tags.filter((t) => t !== action.tag)
        : [...state.lensFilters.tags, action.tag];
      return {
        ...state,
        lensFilters: { ...state.lensFilters, tags },
      };
    }

    case "SET_FITNESS_RANGE":
      return {
        ...state,
        lensFilters: { ...state.lensFilters, fitnessRange: action.range },
      };

    case "SET_HAS_3D_FILTER":
      return {
        ...state,
        lensFilters: { ...state.lensFilters, has3D: action.has3D },
      };

    case "SET_SORT":
      return {
        ...state,
        sortBy: action.sortBy,
        sortOrder: action.sortOrder,
      };

    case "TOGGLE_SORT_ORDER":
      return {
        ...state,
        sortOrder: state.sortOrder === "asc" ? "desc" : "asc",
      };

    case "TOGGLE_DRAWER":
      return {
        ...state,
        drawerOpen: action.open ?? !state.drawerOpen,
      };

    case "PIN_DRAWER":
      return { ...state, drawerPinned: action.pinned };

    case "SET_TAB":
      return { ...state, activeTab: action.tab };

    case "SET_STAGE_LOADING":
      return { ...state, stageLoading: action.loading };

    case "ESCAPE":
      // Clear selection and close drawer (unless pinned)
      return {
        ...state,
        selectedAssetId: null,
        hoveredAssetId: null,
        stageMode: "featured",
        drawerOpen: state.drawerPinned,
      };

    default:
      return state;
  }
}

// ============================================================================
// Filter & Sort Logic
// ============================================================================

function filterAssets(assets: GalleryAsset[], filters: GalleryLensFilters): GalleryAsset[] {
  return assets.filter((asset) => {
    // Type filter
    if (filters.types.length > 0 && !filters.types.includes(asset.type)) {
      return false;
    }

    // World filter
    if (filters.worlds.length > 0 && !filters.worlds.includes(asset.world)) {
      return false;
    }

    // Tag filter (any match)
    if (filters.tags.length > 0 && !asset.tags.some((t) => filters.tags.includes(t))) {
      return false;
    }

    // Fitness range
    if (asset.fitness < filters.fitnessRange[0] || asset.fitness > filters.fitnessRange[1]) {
      return false;
    }

    // Has 3D filter
    if (filters.has3D !== null && asset.has3D !== filters.has3D) {
      return false;
    }

    return true;
  });
}

function sortAssets(
  assets: GalleryAsset[],
  sortBy: GallerySortField,
  sortOrder: GallerySortOrder
): GalleryAsset[] {
  const sorted = [...assets].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "fitness":
        cmp = a.fitness - b.fitness;
        break;
      case "generation":
        cmp = a.generation - b.generation;
        break;
      case "updated":
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });
  return sorted;
}

// ============================================================================
// Hook
// ============================================================================

export function useGalleryState(assets: GalleryAsset[]) {
  const [state, dispatch] = useReducer(galleryReducer, initialState);
  const hoverTimeoutRef = useRef<number | null>(null);

  // Derive filtered & sorted assets
  const filteredAssets = useMemo(() => {
    const filtered = filterAssets(assets, state.lensFilters);
    return sortAssets(filtered, state.sortBy, state.sortOrder);
  }, [assets, state.lensFilters, state.sortBy, state.sortOrder]);

  // Featured assets (top 10 by fitness, with 3D)
  const featuredAssets = useMemo(() => {
    return assets
      .filter((a) => a.has3D)
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, 10);
  }, [assets]);

  // Current featured asset (cycles)
  const currentFeaturedAsset = useMemo(() => {
    if (featuredAssets.length === 0) return null;
    const index = state.featuredIndex % featuredAssets.length;
    return featuredAssets[index];
  }, [featuredAssets, state.featuredIndex]);

  // Selected asset
  const selectedAsset = useMemo(() => {
    if (!state.selectedAssetId) return null;
    return assets.find((a) => a.id === state.selectedAssetId) ?? null;
  }, [assets, state.selectedAssetId]);

  // Hovered asset
  const hoveredAsset = useMemo(() => {
    if (!state.hoveredAssetId) return null;
    return assets.find((a) => a.id === state.hoveredAssetId) ?? null;
  }, [assets, state.hoveredAssetId]);

  // Asset currently shown on stage
  const stageAsset = useMemo(() => {
    switch (state.stageMode) {
      case "selected":
        return selectedAsset;
      case "hover-preview":
        return hoveredAsset ?? selectedAsset ?? currentFeaturedAsset;
      case "featured":
      default:
        return currentFeaturedAsset;
    }
  }, [state.stageMode, selectedAsset, hoveredAsset, currentFeaturedAsset]);

  // Unique worlds from assets (for filter options)
  const availableWorlds = useMemo(() => {
    return [...new Set(assets.map((a) => a.world))].sort();
  }, [assets]);

  // Unique tags from assets (for filter options)
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    assets.forEach((a) => a.tags.forEach((t) => tags.add(t)));
    return [...tags].sort();
  }, [assets]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    const f = state.lensFilters;
    return (
      f.types.length > 0 ||
      f.worlds.length > 0 ||
      f.tags.length > 0 ||
      f.fitnessRange[0] > 0 ||
      f.fitnessRange[1] < 1 ||
      f.has3D !== null
    );
  }, [state.lensFilters]);

  // Selection index in filtered list (for keyboard nav)
  const selectedIndex = useMemo(() => {
    if (!state.selectedAssetId) return -1;
    return filteredAssets.findIndex((a) => a.id === state.selectedAssetId);
  }, [filteredAssets, state.selectedAssetId]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================================
  // Action Creators
  // ============================================================================

  const selectAsset = useCallback((id: string | null) => {
    dispatch({ type: "SELECT_ASSET", id });
  }, []);

  const hoverAsset = useCallback((id: string | null) => {
    // Clear pending timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    if (id) {
      // Debounce hover by 100ms
      hoverTimeoutRef.current = window.setTimeout(() => {
        dispatch({ type: "HOVER_ASSET", id });
      }, 100);
    } else {
      dispatch({ type: "HOVER_ASSET", id: null });
    }
  }, []);

  const hoverAssetImmediate = useCallback((id: string | null) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    dispatch({ type: "HOVER_ASSET", id });
  }, []);

  const nextFeatured = useCallback(() => {
    dispatch({ type: "NEXT_FEATURED" });
  }, []);

  const setFilters = useCallback((filters: Partial<GalleryLensFilters>) => {
    dispatch({ type: "SET_FILTERS", filters });
  }, []);

  const clearFilters = useCallback(() => {
    dispatch({ type: "CLEAR_FILTERS" });
  }, []);

  const toggleTypeFilter = useCallback((assetType: AssetType) => {
    dispatch({ type: "TOGGLE_TYPE_FILTER", assetType });
  }, []);

  const toggleWorldFilter = useCallback((world: string) => {
    dispatch({ type: "TOGGLE_WORLD_FILTER", world });
  }, []);

  const toggleTagFilter = useCallback((tag: string) => {
    dispatch({ type: "TOGGLE_TAG_FILTER", tag });
  }, []);

  const setFitnessRange = useCallback((range: [number, number]) => {
    dispatch({ type: "SET_FITNESS_RANGE", range });
  }, []);

  const setHas3DFilter = useCallback((has3D: boolean | null) => {
    dispatch({ type: "SET_HAS_3D_FILTER", has3D });
  }, []);

  const setSort = useCallback((sortBy: GallerySortField, sortOrder: GallerySortOrder) => {
    dispatch({ type: "SET_SORT", sortBy, sortOrder });
  }, []);

  const toggleSortOrder = useCallback(() => {
    dispatch({ type: "TOGGLE_SORT_ORDER" });
  }, []);

  const toggleDrawer = useCallback((open?: boolean) => {
    dispatch({ type: "TOGGLE_DRAWER", open });
  }, []);

  const pinDrawer = useCallback((pinned: boolean) => {
    dispatch({ type: "PIN_DRAWER", pinned });
  }, []);

  const setTab = useCallback((tab: GalleryInspectorTab) => {
    dispatch({ type: "SET_TAB", tab });
  }, []);

  const setStageLoading = useCallback((loading: boolean) => {
    dispatch({ type: "SET_STAGE_LOADING", loading });
  }, []);

  const escape = useCallback(() => {
    dispatch({ type: "ESCAPE" });
  }, []);

  // Keyboard navigation
  const navigateGrid = useCallback(
    (direction: "up" | "down" | "left" | "right", columnsPerRow: number) => {
      if (filteredAssets.length === 0) return;

      let newIndex = selectedIndex;

      if (newIndex === -1) {
        // No selection, select first
        newIndex = 0;
      } else {
        switch (direction) {
          case "left":
            newIndex = Math.max(0, newIndex - 1);
            break;
          case "right":
            newIndex = Math.min(filteredAssets.length - 1, newIndex + 1);
            break;
          case "up":
            newIndex = Math.max(0, newIndex - columnsPerRow);
            break;
          case "down":
            newIndex = Math.min(filteredAssets.length - 1, newIndex + columnsPerRow);
            break;
        }
      }

      if (newIndex !== selectedIndex && filteredAssets[newIndex]) {
        dispatch({ type: "SELECT_ASSET", id: filteredAssets[newIndex].id });
      }
    },
    [filteredAssets, selectedIndex]
  );

  return {
    // State
    ...state,

    // Derived data
    filteredAssets,
    featuredAssets,
    currentFeaturedAsset,
    selectedAsset,
    hoveredAsset,
    stageAsset,
    availableWorlds,
    availableTags,
    hasActiveFilters,
    selectedIndex,
    totalAssets: assets.length,

    // Actions
    selectAsset,
    hoverAsset,
    hoverAssetImmediate,
    nextFeatured,
    setFilters,
    clearFilters,
    toggleTypeFilter,
    toggleWorldFilter,
    toggleTagFilter,
    setFitnessRange,
    setHas3DFilter,
    setSort,
    toggleSortOrder,
    toggleDrawer,
    pinDrawer,
    setTab,
    setStageLoading,
    escape,
    navigateGrid,
  };
}

export type GalleryStateReturn = ReturnType<typeof useGalleryState>;
