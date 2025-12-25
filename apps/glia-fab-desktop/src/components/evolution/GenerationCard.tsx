/**
 * GenerationCard - Organic thumbnail card for evolution gallery
 * Features fitness gradient border, cellular shape, and mutation type indicator
 */

import React, { useMemo } from "react";
import type { GenerationSummary } from "@/types";

interface GenerationCardProps {
  generation: GenerationSummary;
  isSelected?: boolean;
  onSelect?: (generation: GenerationSummary) => void;
  onOpen?: (generation: GenerationSummary) => void;
  size?: "sm" | "md" | "lg";
}

// Mutation type icons and colors
const mutationStyles = {
  random: { icon: "\u26A1", color: "var(--evo-mitosis)", label: "Random" },      // Lightning
  crossover: { icon: "\u2702", color: "var(--evo-dna-helix)", label: "Cross" },  // Scissors
  guided: { icon: "\u2728", color: "var(--evo-nucleus)", label: "Guided" },      // Sparkles
};

const sizes = {
  sm: { width: 100, height: 100, fontSize: 11, iconSize: 14 },
  md: { width: 120, height: 120, fontSize: 12, iconSize: 16 },
  lg: { width: 150, height: 150, fontSize: 14, iconSize: 20 },
};

// Calculate fitness-based gradient color
function getFitnessColor(fitness: number): string {
  // Interpolate from red (low) through yellow (mid) to green (high)
  if (fitness < 0.33) {
    return `oklch(${60 + fitness * 45}% 0.15 ${25 + fitness * 180}deg)`;
  } else if (fitness < 0.66) {
    const t = (fitness - 0.33) / 0.33;
    return `oklch(${75 - t * 0}% 0.15 ${85 + t * 60}deg)`;
  } else {
    return `oklch(75% 0.16 145deg)`;
  }
}

export function GenerationCard({
  generation,
  isSelected = false,
  onSelect,
  onOpen,
  size = "md",
}: GenerationCardProps) {
  const dims = sizes[size];
  const { bestAsset, fitnessScore, mutationType, criticScores } = generation;
  const mutStyle = mutationStyles[mutationType];

  // Calculate border gradient based on fitness
  const borderGradient = useMemo(() => {
    const color = getFitnessColor(fitnessScore);
    return `linear-gradient(135deg, ${color}, oklch(50% 0.10 180))`;
  }, [fitnessScore]);

  // Calculate average critic score for tooltip
  const _avgCriticScore = useMemo(() => {
    const scores = Object.values(criticScores);
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }, [criticScores]);

  return (
    <div
      className={`
        relative group cursor-pointer
        transition-all duration-300 ease-out
        ${isSelected ? "scale-105 z-10" : "hover:scale-102 hover:z-5"}
      `}
      style={{ width: dims.width, height: dims.height + 32 }}
      onClick={() => onSelect?.(generation)}
      onDoubleClick={() => onOpen?.(generation)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect?.(generation);
        if (e.key === " ") onOpen?.(generation);
      }}
      tabIndex={0}
      role="button"
      aria-label={`Generation ${generation.generation}, Fitness ${fitnessScore.toFixed(2)}`}
    >
      {/* Organic border container */}
      <div
        className={`
          absolute inset-0 shape-cell
          transition-all duration-300
          ${isSelected ? "animate-membrane-flow" : ""}
        `}
        style={{
          background: borderGradient,
          padding: "2px",
          filter: isSelected ? "brightness(1.2)" : undefined,
          boxShadow: isSelected ? `0 0 20px ${getFitnessColor(fitnessScore)}` : undefined,
        }}
      >
        {/* Inner card content */}
        <div
          className="w-full h-full bg-abyss shape-cell overflow-hidden flex flex-col"
        >
          {/* Thumbnail area */}
          <div
            className="flex-1 bg-void relative overflow-hidden flex items-center justify-center"
          >
            {bestAsset.thumbnailUrl ? (
              <img
                src={bestAsset.thumbnailUrl}
                alt={bestAsset.name}
                className="w-full h-full object-cover"
              />
            ) : (
              // Placeholder with organic pattern
              <div className="w-full h-full flex items-center justify-center relative">
                {/* Background cellular pattern */}
                <svg
                  viewBox="0 0 100 100"
                  className="absolute inset-0 w-full h-full opacity-20"
                >
                  <circle cx="30" cy="30" r="15" fill="var(--evo-cell-membrane)" opacity="0.3" />
                  <circle cx="70" cy="40" r="12" fill="var(--evo-cytoplasm)" opacity="0.4" />
                  <circle cx="50" cy="70" r="18" fill="var(--evo-cell-membrane)" opacity="0.25" />
                  <circle cx="80" cy="80" r="10" fill="var(--evo-nucleus)" opacity="0.2" />
                </svg>
                {/* DNA icon */}
                <span className="text-2xl opacity-40">
                  {"\uD83E\uDDEC"}
                </span>
              </div>
            )}

            {/* Generation badge */}
            <div
              className="absolute top-1 left-1 px-1.5 py-0.5 rounded-sm bg-obsidian/80 backdrop-blur-sm"
              style={{ fontSize: dims.fontSize - 2 }}
            >
              <span className="font-mono text-secondary">G</span>
              <span className="font-mono text-primary font-semibold">
                {generation.generation}
              </span>
            </div>

            {/* Mutation type indicator */}
            <div
              className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center bg-obsidian/80 backdrop-blur-sm"
              style={{ color: mutStyle.color }}
              title={`${mutStyle.label} mutation`}
            >
              <span style={{ fontSize: dims.iconSize - 4 }}>{mutStyle.icon}</span>
            </div>

            {/* Fitness indicator bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-void/80">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${fitnessScore * 100}%`,
                  background: `linear-gradient(90deg, var(--evo-low), var(--evo-mid), var(--evo-high))`,
                  backgroundSize: "300% 100%",
                  backgroundPosition: `${fitnessScore * 100}% 0`,
                }}
              />
            </div>
          </div>

          {/* Info footer */}
          <div className="p-1.5 border-t border-slate/50 bg-obsidian/50">
            <div className="flex justify-between items-center">
              <span
                className="font-mono text-primary truncate"
                style={{ fontSize: dims.fontSize - 1 }}
                title={bestAsset.name}
              >
                {fitnessScore.toFixed(2)}
              </span>
              {/* Passed/failed indicator */}
              <span
                className={`text-xs ${bestAsset.passed ? "text-success" : "text-error"}`}
              >
                {bestAsset.passed ? "\u2713" : "\u2717"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hover tooltip with critic scores */}
      <div
        className={`
          absolute left-1/2 -translate-x-1/2 -bottom-2
          opacity-0 group-hover:opacity-100 pointer-events-none
          transition-opacity duration-200 delay-300
          bg-obsidian border border-slate rounded-md px-2 py-1
          text-xs whitespace-nowrap z-20 shadow-lg
        `}
      >
        <div className="flex gap-2">
          {Object.entries(criticScores).slice(0, 3).map(([key, score]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="text-tertiary">{key.slice(0, 3)}:</span>
              <span
                className="font-mono"
                style={{ color: score > 0.6 ? "var(--evo-high)" : score > 0.4 ? "var(--evo-mid)" : "var(--evo-low)" }}
              >
                {score.toFixed(2)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GenerationCard;
