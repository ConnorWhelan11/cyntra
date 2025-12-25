import React, { useEffect, useMemo } from "react";
import type { ProjectInfo } from "@/types";
import { useMemoryAtlas, MemoryAtlasContext } from "./hooks/useMemoryAtlas";
import type { MemoryType } from "./hooks/useMemoryAtlas";
import { LensRail } from "./components/LensRail";
import { DetailDrawer } from "./components/DetailDrawer";
import { AtlasCanvas } from "./components/AtlasCanvas";
import { LifecycleStrataCanvas } from "./components/LifecycleStrataCanvas";
import { createMockLifecycleAtlasMemories } from "./lifecycle/mockDataset";

interface MemoryAtlasViewProps {
  activeProject: ProjectInfo | null;
}

function getMemorySceneFromUrl(): "lifecycle" | "atlas" {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("memory_scene") ?? params.get("memoryScene");
  if (raw === "atlas") return "atlas";
  return "lifecycle";
}

// Search bar component
function AtlasHeader() {
  const { state, actions, filteredMemories, memories } = React.useContext(MemoryAtlasContext)!;

  const showIndividual = state.lens.scope === "all" || state.lens.scope === "individual";
  const showCollective = state.lens.scope === "all" || state.lens.scope === "collective";

  const toggleScope = (scope: "individual" | "collective") => {
    if (state.lens.scope === "all") {
      actions.setScope(scope === "individual" ? "collective" : "individual");
      return;
    }
    if (state.lens.scope === scope) {
      actions.setScope("all");
      return;
    }
    actions.setScope("all");
  };

  const TYPES: { id: MemoryType; label: string; icon: string }[] = [
    { id: "pattern", label: "Pattern", icon: "◈" },
    { id: "failure", label: "Failure", icon: "⚠" },
    { id: "dynamic", label: "Dynamic", icon: "◎" },
    { id: "context", label: "Context", icon: "◐" },
    { id: "playbook", label: "Playbook", icon: "▤" },
    { id: "frontier", label: "Frontier", icon: "⟁" },
  ];

  return (
    <header className="memory-atlas-header glass-panel-subtle border-b border-white/5">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-primary tracking-tight">MEMORY</h1>
        <span className="text-sm text-tertiary font-mono">
          {filteredMemories.length}/{memories.length} nodes
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* View toggle */}
        <div className="flex items-center bg-void/50 border border-white/10 rounded-lg p-0.5">
          <button
            onClick={() => actions.setLifecycleView("vault")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              state.lifecycleView === "vault"
                ? "bg-white/10 text-primary"
                : "text-tertiary hover:text-secondary"
            }`}
            title="Vault View"
          >
            Vault
          </button>
          <button
            onClick={() => actions.setLifecycleView("lifecycle")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              state.lifecycleView === "lifecycle"
                ? "bg-white/10 text-primary"
                : "text-tertiary hover:text-secondary"
            }`}
            title="Lifecycle View"
          >
            Lifecycle
          </button>
        </div>

        {/* Playback */}
        <button
          onClick={actions.requestPlayback}
          disabled={state.playback.isRunning}
          className={`
            px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
            ${state.playback.isRunning
              ? "bg-white/5 border-white/10 text-tertiary cursor-not-allowed"
              : "bg-white/5 border-white/10 text-secondary hover:text-primary hover:bg-white/10"
            }
          `}
          title="Playback Run (selected or latest)"
        >
          {state.playback.isRunning ? "Playback…" : "Playback Run"}
        </button>

        {/* Link depth */}
        <div className="flex items-center bg-void/50 border border-white/10 rounded-lg p-0.5">
          {([0, 1, 2] as const).map((depth) => (
            <button
              key={depth}
              onClick={() => actions.setLinkDepth(depth)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                state.linkDepth === depth
                  ? "bg-white/10 text-primary"
                  : "text-tertiary hover:text-secondary"
              }`}
              title={`${depth} hop${depth === 1 ? "" : "s"}`}
            >
              {depth}
            </button>
          ))}
        </div>

        {/* Scope */}
        <div className="flex items-center bg-void/50 border border-white/10 rounded-lg p-0.5">
          <button
            onClick={() => toggleScope("individual")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              showIndividual ? "bg-white/10 text-primary" : "text-tertiary hover:text-secondary"
            }`}
            title="Individual"
          >
            Ind
          </button>
          <button
            onClick={() => toggleScope("collective")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              showCollective ? "bg-white/10 text-primary" : "text-tertiary hover:text-secondary"
            }`}
            title="Collective"
          >
            Coll
          </button>
          <button
            disabled
            className="px-2.5 py-1 text-xs font-medium rounded-md text-tertiary/60 cursor-not-allowed"
            title="World (coming soon)"
          >
            World
          </button>
        </div>

        {/* Type */}
        <details className="relative">
          <summary className="list-none">
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/5 text-secondary hover:text-primary hover:bg-white/10 transition-all"
              title="Type filters"
            >
              Type
            </button>
          </summary>
          <div className="absolute right-0 mt-2 w-56 p-2 rounded-xl glass-panel-strong border border-white/10 shadow-xl z-50">
            <div className="grid grid-cols-2 gap-1">
              {TYPES.map((t) => {
                const isActive = state.lens.types.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => actions.toggleType(t.id)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left border transition-all ${
                      isActive
                        ? "bg-white/10 border-white/20 text-primary"
                        : "bg-white/0 border-transparent text-tertiary hover:bg-white/5 hover:text-secondary hover:border-white/10"
                    }`}
                    title={t.label}
                  >
                    <span className="text-sm">{t.icon}</span>
                    <span className="text-xs font-medium">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </details>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary pointer-events-none"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3 3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search memories..."
            value={state.lens.searchQuery}
            onChange={(e) => actions.setSearchQuery(e.target.value)}
            className="w-56 pl-9 pr-8 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-primary placeholder-tertiary focus:outline-none focus:border-accent-primary/50 transition-colors"
          />
          {state.lens.searchQuery && (
            <button
              onClick={() => actions.setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Reset camera */}
        <button
          onClick={actions.resetCamera}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-tertiary hover:text-secondary hover:bg-white/5 transition-colors"
          title="Reset view (R)"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="5" />
            <circle cx="8" cy="8" r="1" fill="currentColor" />
          </svg>
        </button>

        {/* Keyboard shortcuts hint */}
        <div className="text-xs text-tertiary font-mono hidden lg:block">
          <kbd className="px-1.5 py-0.5 bg-white/5 rounded">Esc</kbd> close
          <span className="mx-2">·</span>
          <kbd className="px-1.5 py-0.5 bg-white/5 rounded">←</kbd>
          <kbd className="px-1.5 py-0.5 bg-white/5 rounded ml-0.5">→</kbd> navigate
        </div>
      </div>
    </header>
  );
}

// Main atlas view
export function MemoryAtlasView({ activeProject }: MemoryAtlasViewProps) {
  const scene = getMemorySceneFromUrl();

  const seed = activeProject?.root ?? "demo";
  const { dataset, memories } = useMemo(() => createMockLifecycleAtlasMemories(seed), [seed]);

  const atlasContext = useMemoryAtlas(memories, { layout: scene === "atlas" ? "atlas" : "lifecycle" });
  const { actions } = atlasContext;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case "/":
          e.preventDefault();
          document.querySelector<HTMLInputElement>('input[placeholder="Search memories..."]')?.focus();
          break;
        case "r":
        case "R":
          actions.resetCamera();
          break;
        case "1":
          actions.toggleType("pattern");
          break;
        case "2":
          actions.toggleType("failure");
          break;
        case "3":
          actions.toggleType("dynamic");
          break;
        case "4":
          actions.toggleType("context");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions]);

  // No project selected state
  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-32 h-32">
            {/* Animated orbital rings */}
            <div className="absolute inset-0 rounded-full border border-dashed border-slate/20 animate-spin" style={{ animationDuration: "20s" }} />
            <div className="absolute inset-4 rounded-full border border-dashed border-slate/30 animate-spin" style={{ animationDuration: "15s", animationDirection: "reverse" }} />
            <div className="absolute inset-8 rounded-full border border-dashed border-accent-primary/20 animate-spin" style={{ animationDuration: "10s" }} />

            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-primary/20 to-signal-active/10 border border-accent-primary/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-accent-primary/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                  <path d="M12 8v1M12 15v1M8 12h1M15 12h1" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>
          <div>
            <p className="text-secondary text-base font-medium">Select a project to explore</p>
            <p className="text-tertiary text-sm mt-1">Agent memories are stored per-project</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MemoryAtlasContext.Provider value={atlasContext}>
      <div className="memory-atlas-layout">
        {/* 3D Canvas (background, full bleed) */}
        <div className="memory-atlas-canvas">
          {scene === "atlas" ? <AtlasCanvas /> : <LifecycleStrataCanvas dataset={dataset} />}
        </div>

        {/* Header with search */}
        <AtlasHeader />

        {/* Lens rail (left) */}
        <div className="memory-atlas-lens">
          <LensRail />
        </div>

        {/* Detail drawer (right, slides in) */}
        <DetailDrawer />
      </div>
    </MemoryAtlasContext.Provider>
  );
}

export default MemoryAtlasView;
