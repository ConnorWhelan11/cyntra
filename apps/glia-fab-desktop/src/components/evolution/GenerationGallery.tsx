/**
 * GenerationGallery - Horizontally scrollable evolution generation grid
 * Shows best assets from each generation with connection lines
 */

import React, { useRef, useCallback, useMemo } from "react";
import type { GenerationSummary } from "@/types";
import { GenerationCard } from "./GenerationCard";

interface GenerationGalleryProps {
  generations: GenerationSummary[];
  selectedGeneration?: number | null;
  onGenerationSelect?: (generation: GenerationSummary) => void;
  onGenerationOpen?: (generation: GenerationSummary) => void;
  displayMode?: "grid" | "timeline";
  className?: string;
}

export function GenerationGallery({
  generations,
  selectedGeneration,
  onGenerationSelect,
  onGenerationOpen,
  displayMode = "timeline",
  className = "",
}: GenerationGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sort generations by generation number
  const sortedGenerations = useMemo(
    () => [...generations].sort((a, b) => a.generation - b.generation),
    [generations]
  );

  // Build parent-child connections for SVG lines
  const connections = useMemo(() => {
    const genMap = new Map(sortedGenerations.map((g, i) => [g.generation, i]));
    const lines: Array<{ fromIdx: number; toIdx: number; fitness: number }> = [];

    sortedGenerations.forEach((gen, idx) => {
      if (gen.parentGeneration !== undefined) {
        const parentIdx = genMap.get(gen.parentGeneration);
        if (parentIdx !== undefined) {
          lines.push({
            fromIdx: parentIdx,
            toIdx: idx,
            fitness: gen.fitnessScore,
          });
        }
      }
    });

    return lines;
  }, [sortedGenerations]);

  // Scroll to selected generation
  const scrollToGeneration = useCallback((genNum: number) => {
    if (!scrollRef.current) return;
    const cardWidth = 136; // 120px + gap
    const idx = sortedGenerations.findIndex(g => g.generation === genNum);
    if (idx >= 0) {
      scrollRef.current.scrollTo({
        left: idx * cardWidth - scrollRef.current.clientWidth / 2 + cardWidth / 2,
        behavior: "smooth",
      });
    }
  }, [sortedGenerations]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!selectedGeneration) return;
    const currentIdx = sortedGenerations.findIndex(g => g.generation === selectedGeneration);
    if (currentIdx < 0) return;

    let newIdx = currentIdx;
    if (e.key === "ArrowLeft" && currentIdx > 0) {
      newIdx = currentIdx - 1;
    } else if (e.key === "ArrowRight" && currentIdx < sortedGenerations.length - 1) {
      newIdx = currentIdx + 1;
    }

    if (newIdx !== currentIdx) {
      e.preventDefault();
      onGenerationSelect?.(sortedGenerations[newIdx]);
      scrollToGeneration(sortedGenerations[newIdx].generation);
    }
  }, [selectedGeneration, sortedGenerations, onGenerationSelect, scrollToGeneration]);

  if (sortedGenerations.length === 0) {
    return (
      <div className={`mc-panel ${className}`}>
        <div className="mc-panel-header">
          <span className="mc-panel-title">Generation Gallery</span>
        </div>
        <div className="p-8 flex items-center justify-center text-tertiary">
          <div className="text-center">
            <span className="text-3xl mb-2 block opacity-50">{"\uD83E\uDDEC"}</span>
            <span>No generations yet</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`mc-panel ${className}`}>
      <div className="mc-panel-header">
        <span className="mc-panel-title">Generation Gallery</span>
        <div className="mc-panel-actions flex items-center gap-2">
          <span className="text-xs text-tertiary font-mono">
            {sortedGenerations.length} gen{sortedGenerations.length !== 1 ? "s" : ""}
          </span>
          {/* View mode toggle placeholder */}
        </div>
      </div>

      <div className="relative">
        {/* Connection lines SVG overlay (timeline mode) */}
        {displayMode === "timeline" && connections.length > 0 && (
          <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
            style={{ overflow: "visible" }}
          >
            <defs>
              <linearGradient id="connection-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--evo-cell-membrane)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--evo-cell-membrane)" stopOpacity="0.6" />
              </linearGradient>
            </defs>
            {connections.map((conn, i) => {
              const x1 = conn.fromIdx * 136 + 60;
              const x2 = conn.toIdx * 136 + 60;
              const y = 80; // Middle of cards
              const curveY = y - 20 - (conn.fitness * 20);

              return (
                <path
                  key={i}
                  d={`M ${x1} ${y} Q ${(x1 + x2) / 2} ${curveY}, ${x2} ${y}`}
                  fill="none"
                  stroke="url(#connection-gradient)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity={0.5}
                  className="transition-opacity duration-300"
                />
              );
            })}
          </svg>
        )}

        {/* Scrollable gallery */}
        <div
          ref={scrollRef}
          className="flex gap-4 p-4 overflow-x-auto scroll-smooth relative z-10"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "var(--slate) transparent",
          }}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="listbox"
          aria-label="Generation gallery"
        >
          {sortedGenerations.map((gen) => (
            <GenerationCard
              key={gen.generation}
              generation={gen}
              isSelected={selectedGeneration === gen.generation}
              onSelect={onGenerationSelect}
              onOpen={onGenerationOpen}
              size="md"
            />
          ))}

          {/* Fade edges for scroll indication */}
          <div
            className="sticky left-0 top-0 w-8 h-full bg-gradient-to-r from-abyss to-transparent pointer-events-none"
            style={{ marginLeft: "-32px", marginRight: "-8px" }}
          />
        </div>

        {/* Scroll hint gradient on right */}
        <div
          className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-abyss to-transparent pointer-events-none z-20"
        />
      </div>

      {/* Footer with fitness legend */}
      <div className="px-4 pb-3 pt-1 border-t border-slate/50 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-tertiary">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--evo-low)" }} />
            Low
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--evo-mid)" }} />
            Mid
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--evo-high)" }} />
            High
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-tertiary">
          <span className="flex items-center gap-1">
            <span style={{ color: "var(--evo-mitosis)" }}>{"\u26A1"}</span>
            Random
          </span>
          <span className="flex items-center gap-1">
            <span style={{ color: "var(--evo-dna-helix)" }}>{"\u2702"}</span>
            Cross
          </span>
          <span className="flex items-center gap-1">
            <span style={{ color: "var(--evo-nucleus)" }}>{"\u2728"}</span>
            Guided
          </span>
        </div>
      </div>
    </div>
  );
}

export default GenerationGallery;
