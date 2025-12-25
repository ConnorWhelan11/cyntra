/**
 * EvolutionView - Biomorphic evolution visualization dashboard
 * Features organic aesthetics with 3D Pareto surface, mutation tree, and generation gallery
 */

import React, { useState, useCallback, useMemo } from "react";
import type { ProjectInfo, GenomeParameter, MutationNode, GenerationSummary } from "@/types";
import {
  FitnessTimeline,
  GenomePanel,
  LiveStatsDashboard,
  GenerationGallery,
  MutationTree,
  ParetoSurface,
} from "@/components/evolution";
import { MOCK_EVOLUTION_STATE, MOCK_GENOME } from "./evolutionMockData";

interface EvolutionViewProps {
  activeProject: ProjectInfo | null;
  worldId?: string;
}

export function EvolutionView({ activeProject, worldId }: EvolutionViewProps) {
  // Evolution state from mock data (would be real API in production)
  const evolutionState = MOCK_EVOLUTION_STATE;

  // Local UI state
  const [genomeParams, setGenomeParams] = useState<GenomeParameter[]>(MOCK_GENOME);
  const [selectedGeneration, setSelectedGeneration] = useState<number | null>(null);
  const [selectedMutationNode, setSelectedMutationNode] = useState<string | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);

  // Handlers
  const handleGenomeChange = useCallback((name: string, value: number | string) => {
    setGenomeParams((prev) =>
      prev.map((p) => (p.name === name ? { ...p, value } : p))
    );
  }, []);

  const handleGenerationSelect = useCallback((gen: GenerationSummary) => {
    setSelectedGeneration(gen.generation);
    // Highlight path in mutation tree to this generation
    const node = evolutionState.mutationHistory.find(
      (n) => n.generation === gen.generation
    );
    if (node) {
      setSelectedMutationNode(node.id);
      // Build path to root
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
      setHighlightedPath(path);
    }
  }, [evolutionState.mutationHistory]);

  const handleMutationNodeClick = useCallback((node: MutationNode) => {
    setSelectedMutationNode(node.id);
    setSelectedGeneration(node.generation);
  }, []);

  const handleMutateRandom = useCallback(() => {
    console.log("Mutate random genome");
  }, []);

  const handleCrossover = useCallback(() => {
    console.log("Crossover genomes");
  }, []);

  const handleResetToBest = useCallback(() => {
    console.log("Reset to best genome");
    setGenomeParams(MOCK_GENOME);
  }, []);

  // Fitness for header display
  const currentFitness = useMemo(() => {
    const latest = evolutionState.fitnessHistory[evolutionState.fitnessHistory.length - 1];
    return latest?.fitness ?? 0;
  }, [evolutionState.fitnessHistory]);

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
          <div className="text-secondary">Select a project to view evolution data</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-primary tracking-tight flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 shape-nucleus animate-nucleus-glow"
              style={{ background: "var(--evo-nucleus)" }}
            />
            EVOLUTION: {worldId?.toUpperCase() || "OUTORA LIBRARY"}
          </h1>
          <p className="text-sm text-secondary mt-1 flex items-center gap-3">
            <span>
              Generation{" "}
              <span className="text-primary font-mono">{evolutionState.currentGeneration}</span>
            </span>
            <span className="text-slate">|</span>
            <span>
              Fitness{" "}
              <span
                className="font-mono font-semibold"
                style={{
                  color:
                    currentFitness > 0.7
                      ? "var(--evo-high)"
                      : currentFitness > 0.4
                      ? "var(--evo-mid)"
                      : "var(--evo-low)",
                }}
              >
                {currentFitness.toFixed(2)}
              </span>
            </span>
            {evolutionState.isRunning && (
              <>
                <span className="text-slate">|</span>
                <span className="flex items-center gap-1 text-active">
                  <span className="w-1.5 h-1.5 rounded-full bg-active animate-pulse" />
                  Evolving
                </span>
              </>
            )}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button className="mc-btn text-sm px-3 py-1.5">
            {"\u25B6"} Start Evolution
          </button>
          <button className="mc-btn text-sm px-3 py-1.5">
            {"\u23F8"} Pause
          </button>
        </div>
      </div>

      {/* Main content area - responsive grid */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: Pareto Surface (takes more space) */}
        <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
          {/* Pareto Surface */}
          <ParetoSurface
            data={evolutionState.paretoFrontier}
            highlightedId={selectedMutationNode}
            className="flex-shrink-0"
          />

          {/* Generation Gallery */}
          <GenerationGallery
            generations={evolutionState.generationGallery}
            selectedGeneration={selectedGeneration}
            onGenerationSelect={handleGenerationSelect}
            displayMode="timeline"
            className="flex-shrink-0"
          />
        </div>

        {/* Right column: Stats + Mutation Tree */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Live Stats Dashboard */}
          <LiveStatsDashboard
            stats={evolutionState.liveStats}
            isRunning={evolutionState.isRunning}
            className="flex-shrink-0"
          />

          {/* Mutation Tree */}
          <MutationTree
            history={evolutionState.mutationHistory}
            selectedNodeId={selectedMutationNode}
            highlightedPath={highlightedPath}
            onNodeClick={handleMutationNodeClick}
            maxGenerationsVisible={25}
            className="flex-1 min-h-0"
          />
        </div>
      </div>

      {/* Bottom panel: Genome controls */}
      <div className="flex-shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Genome Panel */}
        <div className="mc-panel">
          <div className="mc-panel-header">
            <span className="mc-panel-title">Genome Parameters</span>
            <div className="mc-panel-actions">
              <span className="text-xs text-tertiary font-mono">
                gen:{evolutionState.currentGeneration}
              </span>
            </div>
          </div>
          <div className="p-4">
            <GenomePanel
              parameters={genomeParams}
              onChange={handleGenomeChange}
              onMutateRandom={handleMutateRandom}
              onCrossover={handleCrossover}
              onResetToBest={handleResetToBest}
            />
          </div>
        </div>

        {/* Fitness Timeline */}
        <div className="mc-panel">
          <div className="mc-panel-header">
            <span className="mc-panel-title">Fitness Timeline</span>
            <div className="mc-panel-actions">
              <span className="text-xs font-mono" style={{ color: "var(--evo-high)" }}>
                Peak: {Math.max(...evolutionState.fitnessHistory.map((f) => f.fitness)).toFixed(3)}
              </span>
            </div>
          </div>
          <div className="p-4">
            <FitnessTimeline
              data={evolutionState.fitnessHistory}
              currentGeneration={evolutionState.currentGeneration}
              height={160}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default EvolutionView;
