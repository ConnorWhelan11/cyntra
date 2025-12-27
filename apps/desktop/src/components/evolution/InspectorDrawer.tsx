/**
 * InspectorDrawer - Collapsible right panel for specimen inspection
 * Features tab navigation, frosted glass effect, and detailed breakdowns
 */

import React, { useState, useMemo } from "react";
import type { CandidateInfo, GenomeDiff, MutationNode, InspectorTab } from "@/types";
import { MutationTree } from "./MutationTree";

interface InspectorDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  candidate: CandidateInfo | null;
  parentCandidate: CandidateInfo | null;
  genomeDiff: GenomeDiff | null;
  mutationHistory: MutationNode[];
  highlightedPath: string[];
  onMutationNodeClick?: (node: MutationNode) => void;
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  className?: string;
}

const TABS: { id: InspectorTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "\u{1F4CB}" },
  { id: "genomeDiff", label: "Genome \u0394", icon: "\u{1F9EC}" },
  { id: "lineage", label: "Lineage", icon: "\u{1F333}" },
  { id: "notes", label: "Notes", icon: "\u{1F4DD}" },
];

// Overview tab content
function OverviewTab({ candidate }: { candidate: CandidateInfo }) {
  const criticEntries = Object.entries(candidate.criticScores);

  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-void/50">
          <div className="text-[10px] text-tertiary uppercase tracking-wider mb-1">Fitness</div>
          <div
            className="text-2xl font-mono font-bold"
            style={{
              color:
                candidate.fitness > 0.7
                  ? "var(--evo-high)"
                  : candidate.fitness > 0.4
                    ? "var(--evo-mid)"
                    : "var(--evo-low)",
            }}
          >
            {candidate.fitness.toFixed(3)}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-void/50">
          <div className="text-[10px] text-tertiary uppercase tracking-wider mb-1">Generation</div>
          <div className="text-2xl font-mono text-primary">{candidate.generation}</div>
        </div>
      </div>

      {/* Pareto Status */}
      {candidate.isParetoOptimal && (
        <div
          className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          style={{
            background: "var(--evo-frontier)",
            color: "var(--void)",
          }}
        >
          <span>{"\u2B50"}</span>
          Pareto Optimal - Non-dominated solution
        </div>
      )}

      {/* Critic Scores */}
      {criticEntries.length > 0 && (
        <div>
          <div className="text-xs text-tertiary uppercase tracking-wider mb-2">Critic Scores</div>
          <div className="space-y-2">
            {criticEntries.map(([key, score]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-secondary w-24 truncate">{key}</span>
                <div className="flex-1 h-2 bg-void rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${score * 100}%`,
                      background:
                        score > 0.7
                          ? "var(--evo-high)"
                          : score > 0.4
                            ? "var(--evo-mid)"
                            : "var(--evo-low)",
                    }}
                  />
                </div>
                <span className="text-xs font-mono text-secondary w-10 text-right">
                  {score.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Position in Pareto Space */}
      <div>
        <div className="text-xs text-tertiary uppercase tracking-wider mb-2">Pareto Position</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-void/50">
            <div className="text-[10px] text-tertiary">Quality</div>
            <div className="font-mono text-sm" style={{ color: "#ff6b6b" }}>
              {candidate.position.x.toFixed(2)}
            </div>
          </div>
          <div className="p-2 rounded bg-void/50">
            <div className="text-[10px] text-tertiary">Complexity</div>
            <div className="font-mono text-sm" style={{ color: "#4ecdc4" }}>
              {candidate.position.y.toFixed(2)}
            </div>
          </div>
          <div className="p-2 rounded bg-void/50">
            <div className="text-[10px] text-tertiary">Speed</div>
            <div className="font-mono text-sm" style={{ color: "#ffe66d" }}>
              {candidate.position.z.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Genome Diff tab content
function GenomeDiffTab({
  diff,
  parentCandidate,
}: {
  diff: GenomeDiff | null;
  parentCandidate: CandidateInfo | null;
}) {
  if (!diff || !parentCandidate) {
    return (
      <div className="flex items-center justify-center h-32 text-tertiary text-sm">
        <div className="text-center">
          <div className="text-2xl mb-2 opacity-40">{"\u0394"}</div>
          <div>No parent to compare</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Similarity Score */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-void/50">
        <span className="text-sm text-secondary">Similarity</span>
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 bg-void rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${diff.similarity * 100}%` }}
            />
          </div>
          <span className="font-mono text-sm text-primary">
            {(diff.similarity * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Changed Parameters */}
      {diff.changed.length > 0 && (
        <div>
          <div className="text-xs text-tertiary uppercase tracking-wider mb-2">
            Changed ({diff.changed.length})
          </div>
          <div className="space-y-1">
            {diff.changed.map((change) => (
              <div
                key={change.name}
                className="flex items-center justify-between p-2 rounded bg-void/30 text-xs"
              >
                <span className="text-secondary">{change.name}</span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-tertiary">
                    {typeof change.oldValue === "number"
                      ? change.oldValue.toFixed(2)
                      : change.oldValue}
                  </span>
                  <span style={{ color: "var(--evo-mitosis)" }}>{"\u2192"}</span>
                  <span
                    style={{
                      color:
                        change.delta && change.delta > 0 ? "var(--evo-high)" : "var(--evo-low)",
                    }}
                  >
                    {typeof change.newValue === "number"
                      ? change.newValue.toFixed(2)
                      : change.newValue}
                  </span>
                  {change.delta !== undefined && (
                    <span
                      className="text-[10px]"
                      style={{
                        color: change.delta > 0 ? "var(--evo-high)" : "var(--evo-low)",
                      }}
                    >
                      ({change.delta > 0 ? "+" : ""}
                      {change.delta.toFixed(2)})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unchanged Count */}
      <div className="text-xs text-tertiary">{diff.unchanged.length} parameters unchanged</div>
    </div>
  );
}

// Notes tab content
function NotesTab({
  notes,
  onNotesChange,
}: {
  candidateId?: string;
  notes: string;
  onNotesChange: (notes: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-tertiary uppercase tracking-wider">Specimen Notes</div>
      <textarea
        className="w-full h-40 p-3 rounded-lg bg-void/50 border border-slate/30 text-sm text-secondary placeholder-tertiary resize-none focus:outline-none focus:border-slate"
        placeholder="Add notes about this specimen..."
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
      />
      <div className="text-[10px] text-tertiary">Auto-saved on blur</div>
    </div>
  );
}

export function InspectorDrawer({
  isOpen,
  onToggle,
  candidate,
  parentCandidate,
  genomeDiff,
  mutationHistory,
  highlightedPath,
  onMutationNodeClick,
  activeTab,
  onTabChange,
  className = "",
}: InspectorDrawerProps) {
  // Local notes state (would be persisted in real app)
  const [notes, setNotes] = useState<Record<string, string>>({});

  const currentNotes = candidate ? notes[candidate.id] || "" : "";
  const handleNotesChange = (newNotes: string) => {
    if (candidate) {
      setNotes((prev) => ({ ...prev, [candidate.id]: newNotes }));
    }
  };

  // Find current node in mutation history for lineage
  const currentMutationNode = useMemo(() => {
    if (!candidate) return null;
    return mutationHistory.find((n) => n.generation === candidate.generation);
  }, [candidate, mutationHistory]);

  return (
    <div
      className={`
        relative flex flex-col h-full transition-all duration-300
        ${isOpen ? "w-80" : "w-10"}
        ${className}
      `}
    >
      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-6 h-12 rounded-full bg-obsidian border border-slate/50 flex items-center justify-center text-tertiary hover:text-primary hover:border-slate transition-colors"
        title={isOpen ? "Collapse inspector" : "Expand inspector"}
      >
        <span className="text-xs">{isOpen ? "\u276F" : "\u276E"}</span>
      </button>

      {/* Panel Content */}
      <div
        className={`
          flex-1 flex flex-col overflow-hidden rounded-lg
          backdrop-blur-md border border-slate/30
          transition-opacity duration-300
          ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}
        `}
        style={{
          background: "linear-gradient(135deg, var(--obsidian) 0%, var(--abyss) 100%)",
        }}
      >
        {/* Tab Navigation */}
        <div className="flex border-b border-slate/30">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex-1 px-2 py-2.5 text-xs flex flex-col items-center gap-0.5 transition-colors
                ${
                  activeTab === tab.id
                    ? "text-primary border-b-2 border-primary bg-void/20"
                    : "text-tertiary hover:text-secondary"
                }
              `}
              title={tab.label}
            >
              <span className="text-sm">{tab.icon}</span>
              <span className="truncate w-full text-center">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!candidate ? (
            <div className="flex items-center justify-center h-full text-tertiary text-sm">
              <div className="text-center">
                <div className="text-3xl mb-2 opacity-40">{"\uD83D\uDD0D"}</div>
                <div>Select a specimen to inspect</div>
              </div>
            </div>
          ) : (
            <>
              {activeTab === "overview" && <OverviewTab candidate={candidate} />}
              {activeTab === "genomeDiff" && (
                <GenomeDiffTab diff={genomeDiff} parentCandidate={parentCandidate} />
              )}
              {activeTab === "lineage" && (
                <div className="h-full min-h-[300px]">
                  <MutationTree
                    history={mutationHistory}
                    selectedNodeId={currentMutationNode?.id || null}
                    highlightedPath={highlightedPath}
                    onNodeClick={onMutationNodeClick}
                    maxGenerationsVisible={15}
                    className="h-full"
                  />
                </div>
              )}
              {activeTab === "notes" && (
                <NotesTab
                  candidateId={candidate.id}
                  notes={currentNotes}
                  onNotesChange={handleNotesChange}
                />
              )}
            </>
          )}
        </div>

        {/* Candidate ID Footer */}
        {candidate && isOpen && (
          <div className="px-4 py-2 border-t border-slate/30 text-[10px] text-tertiary font-mono truncate">
            ID: {candidate.id}
          </div>
        )}
      </div>

      {/* Collapsed State Icon */}
      {!isOpen && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-tertiary text-lg transform -rotate-90 whitespace-nowrap">
            Inspector
          </span>
        </div>
      )}
    </div>
  );
}

export default InspectorDrawer;
