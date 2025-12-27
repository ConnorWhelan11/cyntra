/**
 * Plugin Registry - Hardcoded built-in plugins
 */
import React from "react";
import type { AppPlugin, AppId } from "./types";
import { GameplayProvider } from "@/context/GameplayContext";

// Lazy load feature views
const HomeWorldBuilderView = React.lazy(() =>
  import("@/features/home/HomeWorldBuilderView").then((m) => ({ default: m.HomeWorldBuilderView }))
);
const UniverseSessionView = React.lazy(() =>
  import("./builtins/UniverseSessionView").then((m) => ({ default: m.UniverseSessionView }))
);
const StageView = React.lazy(() =>
  import("@/features/stage/StageView").then((m) => ({ default: m.StageView }))
);
const GalleryView2 = React.lazy(() =>
  import("@/features/gallery/GalleryView2").then((m) => ({ default: m.GalleryView2 }))
);
const EvolutionView = React.lazy(() =>
  import("@/features/evolution/EvolutionView").then((m) => ({ default: m.EvolutionView }))
);
const GameplayView = React.lazy(() =>
  import("@/features/gameplay/GameplayView").then((m) => ({ default: m.GameplayView }))
);

// Wrapper to provide GameplayContext
function GameplayViewWithProvider() {
  return (
    <GameplayProvider>
      <GameplayView />
    </GameplayProvider>
  );
}
// KernelView requires too many props from parent - use placeholder for now
// TODO: Refactor KernelView to use context or internal state
const KernelViewPlaceholder = () => (
  <div className="shell-placeholder">
    <div className="shell-placeholder-title">Kernel Monitor</div>
    <div className="shell-placeholder-text">
      Use the legacy navigation to access the full Kernel view
    </div>
  </div>
);

const universePlugin: AppPlugin = {
  id: "universe",
  name: "Universe",
  sigil: "cosmograph",
  order: 10,
  routes: [
    { path: "", element: <HomeWorldBuilderView />, index: true },
    { path: ":sessionId", element: <UniverseSessionView /> },
  ],
};

const stagePlugin: AppPlugin = {
  id: "stage",
  name: "Stage",
  sigil: "stage",
  order: 20,
  routes: [
    { path: "", element: <StageView activeProject={null} />, index: true },
    { path: ":sessionId", element: <StageView activeProject={null} /> },
  ],
};

const galleryPlugin: AppPlugin = {
  id: "gallery",
  name: "Gallery",
  sigil: "aperture",
  order: 30,
  routes: [
    { path: "", element: <GalleryView2 />, index: true },
    { path: ":sessionId", element: <GalleryView2 /> },
  ],
};

const evolutionPlugin: AppPlugin = {
  id: "evolution",
  name: "Evolution",
  sigil: "helix",
  order: 40,
  routes: [
    { path: "", element: <EvolutionView activeProject={null} />, index: true },
    { path: ":sessionId", element: <EvolutionView activeProject={null} /> },
  ],
};

const gameplayPlugin: AppPlugin = {
  id: "gameplay",
  name: "Gameplay",
  sigil: "gameplay",
  order: 50,
  routes: [
    { path: "", element: <GameplayViewWithProvider />, index: true },
    { path: ":sessionId", element: <GameplayViewWithProvider /> },
  ],
};

const kernelPlugin: AppPlugin = {
  id: "kernel",
  name: "Kernel",
  sigil: "hexcore",
  order: 90,
  routes: [
    { path: "", element: <KernelViewPlaceholder />, index: true },
    { path: ":sessionId", element: <KernelViewPlaceholder /> },
  ],
};

const plugins: AppPlugin[] = [
  universePlugin,
  stagePlugin,
  galleryPlugin,
  evolutionPlugin,
  gameplayPlugin,
  kernelPlugin,
];

export function getPlugins(): AppPlugin[] {
  return [...plugins].sort((a, b) => a.order - b.order);
}

export function getPlugin(id: AppId): AppPlugin | undefined {
  return plugins.find((p) => p.id === id);
}

export const pluginRegistry = { getPlugins, getPlugin };
