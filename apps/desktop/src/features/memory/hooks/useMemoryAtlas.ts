import { useState, useMemo, useCallback, createContext, useContext, useEffect } from "react";
import type { MemoryItem } from "@/types";
import type { LifecycleViewMode } from "../lifecycle/strata";
import { getVaultTilePosition } from "../lifecycle/layout";

// Types
export type MemoryType = MemoryItem["type"];
export type MemoryScope = "individual" | "collective" | "all";
export type Agent = "claude" | "codex" | "opencode" | "crush";
export type DrawerState = "collapsed" | "open" | "expanded";
export type MemoryAtlasLayout = "atlas" | "lifecycle";

export interface UseMemoryAtlasOptions {
  layout?: MemoryAtlasLayout;
}

export interface LensState {
  types: MemoryType[];
  scope: MemoryScope;
  agents: Agent[];
  importanceMin: number;
  searchQuery: string;
}

export interface CameraState {
  target: [number, number, number];
  position: [number, number, number];
  isAnimating: boolean;
}

export interface MemoryAtlasState {
  // Selection
  selectedMemoryId: string | null;
  hoveredMemoryId: string | null;

  // Lens (filter state)
  lens: LensState;

  // Links (contextual rendering)
  linkDepth: 0 | 1 | 2;

  // Lifecycle strata layout
  lifecycleView: LifecycleViewMode;

  // Playback (simulated)
  playback: {
    nonce: number;
    isRunning: boolean;
  };

  // Camera
  camera: CameraState;

  // Drawer
  drawerState: DrawerState;
  listExpanded: boolean;
}

export interface MemoryAtlasActions {
  // Selection
  selectMemory: (id: string | null) => void;
  setHoveredMemory: (id: string | null) => void;

  // Lens
  setTypes: (types: MemoryType[]) => void;
  toggleType: (type: MemoryType) => void;
  setScope: (scope: MemoryScope) => void;
  setAgents: (agents: Agent[]) => void;
  toggleAgent: (agent: Agent) => void;
  setImportanceMin: (value: number) => void;
  setSearchQuery: (query: string) => void;
  resetLens: () => void;

  // Links
  setLinkDepth: (depth: 0 | 1 | 2) => void;

  // Data
  appendMemories: (memories: MemoryItem[]) => void;

  // Playback
  requestPlayback: () => void;
  setPlaybackRunning: (running: boolean) => void;

  // Lifecycle strata layout
  setLifecycleView: (view: LifecycleViewMode) => void;
  toggleLifecycleView: () => void;

  // Drawer
  setDrawerState: (state: DrawerState) => void;
  toggleDrawerExpanded: () => void;
  setListExpanded: (expanded: boolean) => void;

  // Camera
  flyToMemory: (id: string) => void;
  resetCamera: () => void;
  setCameraAnimating: (animating: boolean) => void;

  // Navigation
  selectNextMemory: () => void;
  selectPrevMemory: () => void;
}

export interface MemoryAtlasContextValue {
  state: MemoryAtlasState;
  actions: MemoryAtlasActions;
  memories: MemoryItem[];
  filteredMemories: MemoryItem[];
  selectedMemory: MemoryItem | null;
  nodePositions: Map<string, [number, number, number]>;
}

const DEFAULT_LENS: LensState = {
  types: ["pattern", "failure", "dynamic", "context", "playbook", "frontier"],
  scope: "all",
  agents: ["claude", "codex", "opencode", "crush"],
  importanceMin: 0,
  searchQuery: "",
};

const DEFAULT_CAMERA: CameraState = {
  target: [0, 0, 0],
  position: [0, 5, 12],
  isAnimating: false,
};

const TYPE_ORDER: MemoryType[] = [
  "pattern",
  "failure",
  "dynamic",
  "context",
  "playbook",
  "frontier",
];

const AGENT_INDEX: Record<Agent, number> = {
  claude: 0,
  codex: 1,
  opencode: 2,
  crush: 3,
};

// Seeded random for deterministic jitter
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

// Compute 3D position for a memory node
function computeAtlasNodePosition(memory: MemoryItem): [number, number, number] {
  const typeCount = TYPE_ORDER.length;
  const typeIndex = Math.max(0, TYPE_ORDER.indexOf(memory.type as MemoryType));
  const typeAngle = (typeIndex / typeCount) * Math.PI * 2 - Math.PI / 2;
  const baseRadius = 4;

  const agentOffset = AGENT_INDEX[memory.agent as Agent] * 0.6;
  const y = (memory.importance - 0.5) * 3;

  const jitter = seededRandom(memory.id) * 1.2;
  const jitterAngle = seededRandom(memory.id + "angle") * 0.5;

  const x = Math.cos(typeAngle + jitterAngle) * (baseRadius + agentOffset + jitter);
  const z = Math.sin(typeAngle + jitterAngle) * (baseRadius + agentOffset + jitter);

  return [x, y, z];
}

export function useMemoryAtlas(
  memories: MemoryItem[],
  options: UseMemoryAtlasOptions = {}
): MemoryAtlasContextValue {
  const layout = options.layout ?? "atlas";

  // Core state
  const [memoryStore, setMemoryStore] = useState<MemoryItem[]>(memories);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [hoveredMemoryId, setHoveredMemoryId] = useState<string | null>(null);
  const [lens, setLens] = useState<LensState>(DEFAULT_LENS);
  const [linkDepth, setLinkDepth] = useState<0 | 1 | 2>(1);
  const [lifecycleView, setLifecycleViewState] = useState<LifecycleViewMode>("vault");
  const [playbackNonce, setPlaybackNonce] = useState(0);
  const [playbackRunning, setPlaybackRunning] = useState(false);
  const [camera, setCamera] = useState<CameraState>(() => {
    if (layout === "lifecycle") {
      return { target: [0, 0, 0], position: [0, 3.5, 10], isAnimating: false };
    }
    return DEFAULT_CAMERA;
  });
  const [drawerState, setDrawerState] = useState<DrawerState>("collapsed");
  const [listExpanded, setListExpanded] = useState(false);

  useEffect(() => {
    setMemoryStore(memories);
    setSelectedMemoryId(null);
    setHoveredMemoryId(null);
    setDrawerState("collapsed");
    setPlaybackRunning(false);
  }, [memories]);

  // Filter memories
  const filteredMemories = useMemo(() => {
    return memoryStore.filter((m) => {
      if (!lens.types.includes(m.type as MemoryType)) return false;
      if (lens.scope !== "all" && m.scope !== lens.scope) return false;
      if (!lens.agents.includes(m.agent as Agent)) return false;
      if (m.importance < lens.importanceMin) return false;
      if (lens.searchQuery) {
        const query = lens.searchQuery.toLowerCase();
        if (!m.content.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [lens, memoryStore]);

  // Compute node positions
  const nodePositions = useMemo(() => {
    const positions = new Map<string, [number, number, number]>();
    if (layout === "atlas") {
      memoryStore.forEach((memory) => {
        positions.set(memory.id, computeAtlasNodePosition(memory));
      });
      return positions;
    }

    memoryStore.forEach((memory, index) => {
      positions.set(memory.id, getVaultTilePosition(index, memoryStore.length));
    });
    return positions;
  }, [layout, memoryStore]);

  // Get selected memory
  const selectedMemory = useMemo(() => {
    return memoryStore.find((m) => m.id === selectedMemoryId) || null;
  }, [memoryStore, selectedMemoryId]);

  // Actions
  const selectMemory = useCallback(
    (id: string | null) => {
      setSelectedMemoryId(id);
      if (id) {
        setDrawerState("open");
        // Trigger camera animation
        const pos = nodePositions.get(id);
        if (pos) {
          setCamera((prev) => ({ ...prev, target: pos, isAnimating: true }));
        }
      } else {
        setDrawerState("collapsed");
      }
    },
    [nodePositions]
  );

  const flyToMemory = useCallback(
    (id: string) => {
      const pos = nodePositions.get(id);
      if (pos) {
        setCamera((prev) => ({ ...prev, target: pos, isAnimating: true }));
      }
    },
    [nodePositions]
  );

  const resetCamera = useCallback(() => {
    if (layout === "lifecycle") {
      const target: [number, number, number] = [0, 0, 0];
      const offset: [number, number, number] =
        lifecycleView === "vault" ? [0, 3.5, 10] : [0, 6.5, 15.5];
      setCamera({
        target,
        position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]],
        isAnimating: true,
      });
      return;
    }

    setCamera({ target: [0, 0, 0], position: DEFAULT_CAMERA.position, isAnimating: true });
  }, [layout, lifecycleView]);

  const setCameraAnimating = useCallback((animating: boolean) => {
    setCamera((prev) => ({ ...prev, isAnimating: animating }));
  }, []);

  const setLifecycleView = useCallback(
    (view: LifecycleViewMode) => {
      setLifecycleViewState(view);
      if (layout !== "lifecycle") return;

      const fallbackTarget: [number, number, number] = [0, 0, 0];
      const target =
        (selectedMemoryId ? nodePositions.get(selectedMemoryId) : null) ?? fallbackTarget;

      const offset: [number, number, number] = view === "vault" ? [0, 3.5, 10] : [0, 6.5, 15.5];
      setCamera({
        target,
        position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]],
        isAnimating: true,
      });
    },
    [layout, nodePositions, selectedMemoryId]
  );

  const toggleLifecycleView = useCallback(() => {
    setLifecycleView(lifecycleView === "vault" ? "lifecycle" : "vault");
  }, [lifecycleView, setLifecycleView]);

  const toggleType = useCallback((type: MemoryType) => {
    setLens((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type],
    }));
  }, []);

  const toggleAgent = useCallback((agent: Agent) => {
    setLens((prev) => ({
      ...prev,
      agents: prev.agents.includes(agent)
        ? prev.agents.filter((a) => a !== agent)
        : [...prev.agents, agent],
    }));
  }, []);

  const resetLens = useCallback(() => {
    setLens(DEFAULT_LENS);
  }, []);

  const toggleDrawerExpanded = useCallback(() => {
    setDrawerState((prev) => (prev === "expanded" ? "open" : "expanded"));
  }, []);

  const selectNextMemory = useCallback(() => {
    if (!selectedMemoryId || filteredMemories.length === 0) {
      if (filteredMemories.length > 0) {
        selectMemory(filteredMemories[0].id);
      }
      return;
    }
    const currentIndex = filteredMemories.findIndex((m) => m.id === selectedMemoryId);
    const nextIndex = (currentIndex + 1) % filteredMemories.length;
    selectMemory(filteredMemories[nextIndex].id);
  }, [selectedMemoryId, filteredMemories, selectMemory]);

  const selectPrevMemory = useCallback(() => {
    if (!selectedMemoryId || filteredMemories.length === 0) {
      if (filteredMemories.length > 0) {
        selectMemory(filteredMemories[filteredMemories.length - 1].id);
      }
      return;
    }
    const currentIndex = filteredMemories.findIndex((m) => m.id === selectedMemoryId);
    const prevIndex = currentIndex <= 0 ? filteredMemories.length - 1 : currentIndex - 1;
    selectMemory(filteredMemories[prevIndex].id);
  }, [selectedMemoryId, filteredMemories, selectMemory]);

  // Build state object
  const state: MemoryAtlasState = {
    selectedMemoryId,
    hoveredMemoryId,
    lens,
    linkDepth,
    lifecycleView,
    playback: { nonce: playbackNonce, isRunning: playbackRunning },
    camera,
    drawerState,
    listExpanded,
  };

  // Build actions object
  const actions: MemoryAtlasActions = {
    selectMemory,
    setHoveredMemory: setHoveredMemoryId,
    setTypes: (types) => setLens((prev) => ({ ...prev, types })),
    toggleType,
    setScope: (scope) => setLens((prev) => ({ ...prev, scope })),
    setAgents: (agents) => setLens((prev) => ({ ...prev, agents })),
    toggleAgent,
    setImportanceMin: (value) => setLens((prev) => ({ ...prev, importanceMin: value })),
    setSearchQuery: (query) => setLens((prev) => ({ ...prev, searchQuery: query })),
    resetLens,
    setLinkDepth,
    appendMemories: (items) => {
      setMemoryStore((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const next = items.filter((m) => !existing.has(m.id));
        return next.length > 0 ? [...prev, ...next] : prev;
      });
    },
    requestPlayback: () => {
      setPlaybackNonce((n) => n + 1);
      setPlaybackRunning(true);
    },
    setPlaybackRunning,
    setLifecycleView,
    toggleLifecycleView,
    setDrawerState,
    toggleDrawerExpanded,
    setListExpanded,
    flyToMemory,
    resetCamera,
    setCameraAnimating,
    selectNextMemory,
    selectPrevMemory,
  };

  return {
    state,
    actions,
    memories: memoryStore,
    filteredMemories,
    selectedMemory,
    nodePositions,
  };
}

// Context for sharing state across components
export const MemoryAtlasContext = createContext<MemoryAtlasContextValue | null>(null);

export function useMemoryAtlasContext(): MemoryAtlasContextValue {
  const context = useContext(MemoryAtlasContext);
  if (!context) {
    throw new Error("useMemoryAtlasContext must be used within MemoryAtlasProvider");
  }
  return context;
}
