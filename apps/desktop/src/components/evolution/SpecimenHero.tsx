/**
 * SpecimenHero - The protagonist specimen display for the lab interface
 * Features material glow, HUD overlay, ghost preview on hover, and quick actions
 */

import React, { useMemo } from "react";
import type { CandidateInfo, RunState } from "@/types";

interface SpecimenHeroProps {
  candidate: CandidateInfo | null;
  ghostPreview: CandidateInfo | null; // Translucent overlay on point hover
  runState: RunState;
  onPinParent?: () => void;
  onForkBranch?: () => void;
  onPromote?: () => void;
  className?: string;
}

// Fitness to glow color
function getFitnessGlow(fitness: number): string {
  if (fitness >= 0.8) return "var(--evo-nucleus)"; // Gold for elite
  if (fitness >= 0.6) return "var(--evo-high)"; // Green for good
  if (fitness >= 0.4) return "var(--evo-mid)"; // Yellow for medium
  return "var(--evo-low)"; // Red for low
}

export function SpecimenHero({
  candidate,
  ghostPreview,
  runState,
  onPinParent,
  onForkBranch,
  onPromote,
  className = "",
}: SpecimenHeroProps) {
  // Display candidate (ghost preview takes visual precedence)
  const displayCandidate = ghostPreview || candidate;
  const isGhostMode = ghostPreview !== null;

  // Fitness-based styling
  const glowColor = useMemo(
    () => (displayCandidate ? getFitnessGlow(displayCandidate.fitness) : "var(--slate)"),
    [displayCandidate]
  );

  // Empty state
  if (!displayCandidate) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex-1 flex items-center justify-center bg-void rounded-lg border border-slate">
          <div className="text-center text-tertiary animate-organic-breathe">
            <div className="text-5xl mb-3 opacity-40">{"\uD83E\uDDEC"}</div>
            <div className="text-sm">No specimen selected</div>
            <div className="text-xs mt-1 opacity-60">Select a candidate from the arena</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full gap-3 ${className}`}>
      {/* Preview Container with Material Glow */}
      <div
        className={`
          relative flex-1 min-h-[200px] rounded-lg overflow-hidden
          bg-void border-2 transition-all duration-300
          ${isGhostMode ? "opacity-80" : ""}
          ${runState === "running" ? "animate-cellular-pulse" : ""}
        `}
        style={{
          borderColor: glowColor,
          boxShadow: `
            0 0 30px ${glowColor}40,
            inset 0 0 60px ${glowColor}10
          `,
        }}
      >
        {/* Thumbnail / 3D Preview Area */}
        <div className="absolute inset-0 flex items-center justify-center">
          {displayCandidate.thumbnailUrl ? (
            <img
              src={displayCandidate.thumbnailUrl}
              alt={`Specimen Gen ${displayCandidate.generation}`}
              className={`
                w-full h-full object-cover
                ${isGhostMode ? "opacity-70" : ""}
              `}
            />
          ) : (
            // Placeholder with cellular background
            <div className="w-full h-full relative">
              <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full opacity-10">
                <circle cx="50" cy="60" r="30" fill="var(--evo-cell-membrane)" />
                <circle cx="140" cy="80" r="25" fill="var(--evo-cytoplasm)" />
                <circle cx="100" cy="140" r="35" fill="var(--evo-cell-membrane)" />
                <circle cx="160" cy="160" r="20" fill="var(--evo-nucleus)" />
                <circle cx="40" cy="150" r="22" fill="var(--evo-mitosis)" opacity="0.5" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-6xl opacity-30">{"\uD83E\uDDEC"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Ghost Mode Label */}
        {isGhostMode && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-obsidian/80 rounded text-xs text-tertiary backdrop-blur-sm">
            Preview
          </div>
        )}

        {/* Pareto Optimal Badge */}
        {displayCandidate.isParetoOptimal && (
          <div
            className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium backdrop-blur-sm"
            style={{
              background: "var(--evo-frontier)",
              color: "var(--void)",
            }}
          >
            Pareto Optimal
          </div>
        )}

        {/* Material Depth Overlay (subtle gradient) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at 30% 20%, transparent 0%, var(--void) 70%),
              linear-gradient(180deg, transparent 60%, var(--void) 100%)
            `,
            opacity: 0.4,
          }}
        />
      </div>

      {/* HUD Stats Overlay */}
      <div
        className="p-3 rounded-lg backdrop-blur-md border border-slate/50"
        style={{
          background: "var(--obsidian)",
          backgroundImage: "linear-gradient(135deg, var(--obsidian) 0%, var(--abyss) 100%)",
        }}
      >
        {/* Primary Metrics Row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {/* Fitness */}
            <div className="text-center">
              <div className="text-2xl font-mono font-bold" style={{ color: glowColor }}>
                {displayCandidate.fitness.toFixed(2)}
              </div>
              <div className="text-[10px] text-tertiary uppercase tracking-wider">Fitness</div>
            </div>

            {/* Generation */}
            <div className="text-center border-l border-slate pl-3">
              <div className="text-xl font-mono text-primary">{displayCandidate.generation}</div>
              <div className="text-[10px] text-tertiary uppercase tracking-wider">Gen</div>
            </div>
          </div>

          {/* Run State Indicator */}
          <div className="flex items-center gap-2">
            {runState === "running" && (
              <span className="flex items-center gap-1 text-xs text-active">
                <span className="w-2 h-2 rounded-full bg-active animate-pulse" />
                Evolving
              </span>
            )}
            {runState === "paused" && <span className="text-xs text-warning">Paused</span>}
            {runState === "idle" && <span className="text-xs text-tertiary">Idle</span>}
          </div>
        </div>

        {/* Critic Scores Preview (top 3) */}
        {displayCandidate.criticScores && Object.keys(displayCandidate.criticScores).length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {Object.entries(displayCandidate.criticScores)
              .slice(0, 4)
              .map(([key, score]) => (
                <div key={key} className="flex-shrink-0 px-2 py-1 rounded bg-void/50 text-xs">
                  <span className="text-tertiary">{key.slice(0, 5)}: </span>
                  <span
                    className="font-mono"
                    style={{
                      color:
                        score > 0.7
                          ? "var(--evo-high)"
                          : score > 0.4
                            ? "var(--evo-mid)"
                            : "var(--evo-low)",
                    }}
                  >
                    {score.toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2">
          <button
            onClick={onPinParent}
            className="flex-1 mc-btn text-xs py-1.5"
            disabled={isGhostMode}
            title="Lock as parent for next mutations"
          >
            {"\uD83D\uDCCC"} Pin Parent
          </button>
          <button
            onClick={onForkBranch}
            className="flex-1 mc-btn text-xs py-1.5"
            disabled={isGhostMode}
            title="Create new branch from this specimen"
          >
            {"\uD83C\uDF3F"} Fork
          </button>
          <button
            onClick={onPromote}
            className="flex-1 mc-btn text-xs py-1.5"
            disabled={isGhostMode}
            title="Mark for export/approval"
          >
            {"\u2B50"} Promote
          </button>
        </div>
      </div>
    </div>
  );
}

export default SpecimenHero;
