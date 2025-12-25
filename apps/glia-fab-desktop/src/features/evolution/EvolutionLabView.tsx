/**
 * EvolutionLabView - Specimen-First Lab Interface
 * A lab bench where the current/best candidate is the protagonist
 * The Pareto arena sits behind as ambient context
 */

import React, { useState, useCallback, useMemo } from "react";
import type {
  ProjectInfo,
  CandidateInfo,
  GenomeParameter,
  ParetoPoint,
  MutationNode,
  GenomeDiff,
  InspectorTab,
  RunState,
} from "@/types";
import {
  SpecimenHero,
  ParetoContext,
  InspectorDrawer,
  GenomeConsole,
  FitnessTimeline,
} from "@/components/evolution";
import { MOCK_EVOLUTION_STATE, MOCK_GENOME } from "./evolutionMockData";

interface EvolutionLabViewProps {
  activeProject: ProjectInfo | null;
  worldId?: string;
}

// Convert Pareto points to candidate info for display
function paretoPointToCandidate(point: ParetoPoint, genome: GenomeParameter[]): CandidateInfo {
  return {
    id: point.id,
    generation: point.generation,
    fitness: point.fitness,
    genome,
    criticScores: {
      quality: point.quality,
      speed: point.speed,
      complexity: point.complexity,
    },
    isParetoOptimal: point.isParetoOptimal,
    position: {
      x: point.quality,
      y: point.complexity,
      z: point.speed,
    },
  };
}

// Compute genome diff between two candidates
function computeGenomeDiff(
  current: GenomeParameter[],
  parent: GenomeParameter[]
): GenomeDiff {
  const changed: GenomeDiff["changed"] = [];
  const unchanged: string[] = [];

  current.forEach((param) => {
    const parentParam = parent.find((p) => p.name === param.name);
    if (!parentParam) return;

    if (param.value !== parentParam.value) {
      const delta =
        typeof param.value === "number" && typeof parentParam.value === "number"
          ? param.value - parentParam.value
          : undefined;
      changed.push({
        name: param.name,
        oldValue: parentParam.value,
        newValue: param.value,
        delta,
      });
    } else {
      unchanged.push(param.name);
    }
  });

  const similarity =
    current.length > 0 ? unchanged.length / current.length : 1;

  return { changed, unchanged, similarity };
}

export function EvolutionLabView({ activeProject, worldId }: EvolutionLabViewProps) {
  // Evolution state from mock data
  const evolutionState = MOCK_EVOLUTION_STATE;

  // UI State
  const [runState, setRunState] = useState<RunState>("idle");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>("overview");
  const [exploitExplore, setExploitExplore] = useState(0.5);
  const [genomeParams, setGenomeParams] = useState<GenomeParameter[]>(MOCK_GENOME);
  const [hasGenomeChanges, setHasGenomeChanges] = useState(false);

  // Derive candidates from Pareto points
  const candidates = useMemo(
    () =>
      evolutionState.paretoFrontier.map((p) =>
        paretoPointToCandidate(p, genomeParams)
      ),
    [evolutionState.paretoFrontier, genomeParams]
  );

  // Current/best candidate (highest fitness Pareto-optimal point)
  const bestCandidate = useMemo(() => {
    const optimal = candidates.filter((c) => c.isParetoOptimal);
    if (optimal.length === 0) return candidates[0] || null;
    return optimal.reduce((best, c) => (c.fitness > best.fitness ? c : best));
  }, [candidates]);

  // Selected candidate
  const selectedCandidate = useMemo(() => {
    if (!selectedPointId) return bestCandidate;
    return candidates.find((c) => c.id === selectedPointId) || bestCandidate;
  }, [selectedPointId, candidates, bestCandidate]);

  // Hovered candidate (for ghost preview)
  const hoveredCandidate = useMemo(() => {
    if (!hoveredPointId) return null;
    return candidates.find((c) => c.id === hoveredPointId) || null;
  }, [hoveredPointId, candidates]);

  // Parent candidate (for diff)
  const parentCandidate = useMemo(() => {
    if (!selectedCandidate?.generation || selectedCandidate.generation <= 1) return null;
    return candidates.find(
      (c) => c.generation === selectedCandidate.generation - 1
    ) || null;
  }, [selectedCandidate, candidates]);

  // Genome diff
  const genomeDiff = useMemo(() => {
    if (!selectedCandidate || !parentCandidate) return null;
    return computeGenomeDiff(selectedCandidate.genome, parentCandidate.genome);
  }, [selectedCandidate, parentCandidate]);

  // Highlighted path in mutation tree
  const highlightedPath = useMemo(() => {
    if (!selectedCandidate) return [];
    const node = evolutionState.mutationHistory.find(
      (n) => n.generation === selectedCandidate.generation
    );
    if (!node) return [];

    const path: string[] = [node.id];
    let current = node;
    while (current.parentId) {
      const parent = evolutionState.mutationHistory.find(
        (n) => n.id === current.parentId
      );
      if (parent) {
        path.push(parent.id);
        current = parent;
      } else break;
    }
    return path;
  }, [selectedCandidate, evolutionState.mutationHistory]);

  // Handlers
  const handlePointClick = useCallback((point: ParetoPoint) => {
    setSelectedPointId(point.id);
    setActiveInspectorTab("overview");
  }, []);

  const handlePointHover = useCallback((point: ParetoPoint | null) => {
    setHoveredPointId(point?.id || null);
  }, []);

  const handleMutationNodeClick = useCallback((node: MutationNode) => {
    const candidate = candidates.find((c) => c.generation === node.generation);
    if (candidate) {
      setSelectedPointId(candidate.id);
    }
  }, [candidates]);

  const handleParameterChange = useCallback((name: string, value: number | string) => {
    setGenomeParams((prev) =>
      prev.map((p) => (p.name === name ? { ...p, value } : p))
    );
    setHasGenomeChanges(true);
  }, []);

  const handleApplyChanges = useCallback(() => {
    console.log("Applying genome changes:", genomeParams);
    setHasGenomeChanges(false);
    // Would trigger next generation with new parameters
  }, [genomeParams]);

  const handleMutateRandom = useCallback(() => {
    console.log("Triggering random mutation");
    // Would trigger a random mutation
  }, []);

  const handlePinParent = useCallback(() => {
    console.log("Pinning as parent:", selectedCandidate?.id);
  }, [selectedCandidate]);

  const handleForkBranch = useCallback(() => {
    console.log("Forking branch from:", selectedCandidate?.id);
  }, [selectedCandidate]);

  const handlePromote = useCallback(() => {
    console.log("Promoting candidate:", selectedCandidate?.id);
  }, [selectedCandidate]);

  const handleStartPause = useCallback(() => {
    setRunState((prev) => (prev === "running" ? "paused" : "running"));
  }, []);

  // Empty state
  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center animate-organic-breathe">
          <div
            className="w-24 h-24 mx-auto mb-4 shape-organic bg-evo-cytoplasm flex items-center justify-center glow-membrane"
          >
            <span className="text-4xl">{"\uD83E\uDDEC"}</span>
          </div>
          <div className="text-secondary">Select a project to enter the lab</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 px-1">
        <div>
          <h1 className="text-xl font-semibold text-primary tracking-tight flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 shape-nucleus"
              style={{
                background: runState === "running"
                  ? "var(--evo-mitosis)"
                  : "var(--evo-nucleus)",
                animation: runState === "running" ? "nucleus-glow 1.5s ease-in-out infinite" : "none",
              }}
            />
            LAB: {worldId?.toUpperCase() || "OUTORA LIBRARY"}
          </h1>
          <p className="text-xs text-secondary mt-0.5 flex items-center gap-2">
            <span>
              Gen <span className="text-primary font-mono">{evolutionState.currentGeneration}</span>
            </span>
            <span className="text-slate">|</span>
            <span>
              Best{" "}
              <span
                className="font-mono font-semibold"
                style={{
                  color: (bestCandidate?.fitness || 0) > 0.7
                    ? "var(--evo-high)"
                    : (bestCandidate?.fitness || 0) > 0.4
                    ? "var(--evo-mid)"
                    : "var(--evo-low)",
                }}
              >
                {(bestCandidate?.fitness || 0).toFixed(3)}
              </span>
            </span>
            {runState === "running" && (
              <>
                <span className="text-slate">|</span>
                <span className="flex items-center gap-1 text-active">
                  <span className="w-1.5 h-1.5 rounded-full bg-active animate-pulse" />
                  Evolving
                </span>
              </>
            )}
            {runState === "paused" && (
              <>
                <span className="text-slate">|</span>
                <span className="text-warning">Paused</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleStartPause}
            className="mc-btn text-sm px-3 py-1.5"
          >
            {runState === "running" ? "\u23F8 Pause" : "\u25B6 Evolve"}
          </button>
        </div>
      </div>

      {/* Main Stage - 3 column layout */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* Left: Hero Specimen */}
        <div className="w-72 flex-shrink-0">
          <SpecimenHero
            candidate={selectedCandidate}
            ghostPreview={hoveredCandidate}
            runState={runState}
            onPinParent={handlePinParent}
            onForkBranch={handleForkBranch}
            onPromote={handlePromote}
            className="h-full"
          />
        </div>

        {/* Center: Pareto Context (ambient) */}
        <div className="flex-1 min-w-0">
          <ParetoContext
            data={evolutionState.paretoFrontier}
            selectedId={selectedPointId}
            hoveredId={hoveredPointId}
            onPointClick={handlePointClick}
            onPointHover={handlePointHover}
            ambientMode={true}
            className="h-full"
          />
        </div>

        {/* Right: Inspector Drawer */}
        <InspectorDrawer
          isOpen={inspectorOpen}
          onToggle={() => setInspectorOpen(!inspectorOpen)}
          candidate={selectedCandidate}
          parentCandidate={parentCandidate}
          genomeDiff={genomeDiff}
          mutationHistory={evolutionState.mutationHistory}
          highlightedPath={highlightedPath}
          onMutationNodeClick={handleMutationNodeClick}
          activeTab={activeInspectorTab}
          onTabChange={setActiveInspectorTab}
        />
      </div>

      {/* Bottom: Genome Console + Timeline */}
      <div className="flex-shrink-0 grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Genome Console (spans 2 cols) */}
        <div className="lg:col-span-2">
          <GenomeConsole
            parameters={genomeParams}
            exploitExplore={exploitExplore}
            onExploitExploreChange={setExploitExplore}
            onParameterChange={handleParameterChange}
            onApplyChanges={handleApplyChanges}
            onMutateRandom={handleMutateRandom}
            isRunning={runState === "running"}
            hasChanges={hasGenomeChanges}
          />
        </div>

        {/* Compact Fitness Timeline */}
        <div className="mc-panel">
          <div className="mc-panel-header py-1.5">
            <span className="mc-panel-title text-xs">Fitness</span>
            <span className="text-[10px] font-mono" style={{ color: "var(--evo-high)" }}>
              Peak: {Math.max(...evolutionState.fitnessHistory.map((f) => f.fitness)).toFixed(3)}
            </span>
          </div>
          <div className="p-3">
            <FitnessTimeline
              data={evolutionState.fitnessHistory}
              currentGeneration={evolutionState.currentGeneration}
              height={100}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default EvolutionLabView;
