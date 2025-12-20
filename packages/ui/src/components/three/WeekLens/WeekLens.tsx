"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import React, { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { cn } from "../../../lib/utils";
import { Graph3D } from "../Graph3D/Graph3D";
import type { Graph3DHandle } from "../Graph3D/types";

import {
  BLOCK_TYPE_COLORS,
  BLOCK_TYPE_ICONS,
  computeDayHours,
  DAY_NAMES,
  formatWeekRange,
  getDayDate,
  getWeekGlyphContext,
  type ScheduledBlock,
  type WeekLensProps,
  type WeekSuggestion,
} from "./types";

/**
 * Ghost Graph Background
 */
interface GhostGraphProps {
  graph: WeekLensProps["graph"];
  hoveredNodeId?: string;
}

const GhostGraph: React.FC<GhostGraphProps> = ({ graph, hoveredNodeId }) => {
  const graphRef = useRef<Graph3DHandle>(null);

  return (
    <div className="absolute inset-0 opacity-15 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 12], fov: 45 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
      >
        <color attach="background" args={["transparent"]} />
        <ambientLight intensity={0.3} />
        <Graph3D
          ref={graphRef}
          graph={graph}
          layout="fibonacci"
          selectedNodeId={hoveredNodeId}
          maxNodeCountForLabels={0}
          embedMode={true}
          dimUnhighlighted={false}
        />
        <EffectComposer>
          <Bloom
            mipmapBlur
            intensity={0.3}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.8}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

/**
 * Block Card Component
 */
interface BlockCardProps {
  block: ScheduledBlock;
  onHover?: (nodeId: string | null) => void;
  onRemove?: () => void;
  onDoubleClick?: () => void;
}

const BlockCard: React.FC<BlockCardProps> = ({
  block,
  onHover,
  onRemove,
  onDoubleClick,
}) => {
  const colors = BLOCK_TYPE_COLORS[block.type];
  const icon = BLOCK_TYPE_ICONS[block.type];

  return (
    <div
      className={cn(
        "p-2 rounded-lg border cursor-pointer",
        "transition-all duration-200 hover:scale-[1.02]",
        colors.bg,
        colors.border
      )}
      onMouseEnter={() => onHover?.(block.nodeIds[0])}
      onMouseLeave={() => onHover?.(null)}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex items-start gap-2">
        <span className={cn("text-sm", colors.text)}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className={cn("text-xs font-medium truncate", colors.text)}>
            {block.label}
          </div>
          <div className="text-[10px] text-white/40">{block.duration}m</div>
        </div>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-white/30 hover:text-white/60 text-xs"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Day Column Component
 */
interface DayColumnProps {
  dayIndex: number;
  date: Date;
  blocks: ScheduledBlock[];
  isToday: boolean;
  totalHours: number;
  onBlockHover?: (nodeId: string | null) => void;
  onBlockRemove?: (blockId: string) => void;
  onBlockDoubleClick?: (block: ScheduledBlock) => void;
  onDayClick?: () => void;
}

const DayColumn: React.FC<DayColumnProps> = ({
  dayIndex,
  date,
  blocks,
  isToday,
  totalHours,
  onBlockHover,
  onBlockRemove,
  onBlockDoubleClick,
  onDayClick,
}) => {
  const isOverloaded = totalHours > 8;
  const dayBlocks = blocks
    .filter((b) => b.dayIndex === dayIndex)
    .sort((a, b) => a.order - b.order);

  return (
    <div
      className={cn(
        "flex flex-col min-w-0",
        isToday && "ring-1 ring-cyan-400/30 rounded-lg"
      )}
    >
      {/* Header */}
      <button
        onClick={onDayClick}
        className={cn(
          "py-2 px-1 text-center border-b border-white/5",
          "hover:bg-white/5 transition-colors"
        )}
      >
        <div
          className={cn(
            "text-xs font-medium",
            isToday ? "text-cyan-300" : "text-white/60"
          )}
        >
          {DAY_NAMES[dayIndex]}
        </div>
        <div
          className={cn(
            "text-[10px]",
            isToday ? "text-cyan-400" : "text-white/40"
          )}
        >
          {date.getDate()}
        </div>
      </button>

      {/* Blocks */}
      <div className="flex-1 p-1 space-y-1 min-h-[200px]">
        {dayBlocks.map((block) => (
          <BlockCard
            key={block.id}
            block={block}
            onHover={onBlockHover}
            onRemove={() => onBlockRemove?.(block.id)}
            onDoubleClick={() => onBlockDoubleClick?.(block)}
          />
        ))}
      </div>

      {/* Hours indicator */}
      <div
        className={cn(
          "py-1 text-center text-[10px] border-t border-white/5",
          isOverloaded ? "text-amber-400" : "text-white/30"
        )}
      >
        {totalHours.toFixed(1)}h
      </div>
    </div>
  );
};

/**
 * Suggestion Chip
 */
interface SuggestionChipProps {
  suggestion: WeekSuggestion;
  onClick: () => void;
}

const SuggestionChip: React.FC<SuggestionChipProps> = ({
  suggestion,
  onClick,
}) => {
  const colors = BLOCK_TYPE_COLORS[suggestion.type];

  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-lg text-xs font-medium",
        "border transition-all duration-200",
        colors.bg,
        colors.border,
        colors.text,
        "hover:scale-105"
      )}
    >
      + {suggestion.label}
    </button>
  );
};

/**
 * WeekLens - Planning Surface
 *
 * Core Question: "What does this week look like?"
 */
export const WeekLens: React.FC<WeekLensProps> = ({
  graph,
  weekStart,
  goalBias,
  habitTemplates = [],
  existingSchedule = [],
  className,
  onScheduleChange,
  onBlockMove: _onBlockMove,
  onBlockAdd,
  onBlockRemove,
  onDaySelect,
  onGraphFocus,
  onDone,
}) => {
  // Silence unused
  void _onBlockMove;

  // State
  const [schedule, setSchedule] = useState<ScheduledBlock[]>(existingSchedule);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>();

  // Handler for hover to convert null to undefined
  const handleBlockHover = useCallback((nodeId: string | null) => {
    setHoveredNodeId(nodeId ?? undefined);
  }, []);

  // Today check
  const today = new Date();
  const todayDayIndex = useMemo(() => {
    const diff = Math.floor(
      (today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diff >= 0 && diff <= 6 ? diff : -1;
  }, [weekStart, today]);

  // Compute day hours
  const dayHours = useMemo(
    () => Array.from({ length: 7 }, (_, i) => computeDayHours(schedule, i)),
    [schedule]
  );

  // Generate suggestions
  const suggestions: WeekSuggestion[] = useMemo(() => {
    const result: WeekSuggestion[] = [];

    // Add habit templates as suggestions
    habitTemplates.forEach((t) => {
      result.push({
        id: `habit:${t.id}`,
        label: t.label,
        type: "habit",
        duration: t.totalDuration,
        source: "habit",
      });
    });

    // Add some default suggestions
    result.push({
      id: "default:deepwork",
      label: "Deep Work (2h)",
      type: "deepWork",
      duration: 120,
      source: "ai",
    });
    result.push({
      id: "default:buffer",
      label: "Buffer Time",
      type: "buffer",
      duration: 30,
      source: "ai",
    });

    return result;
  }, [habitTemplates]);

  // Get Glyph context
  const glyphContext = useMemo(
    () => getWeekGlyphContext(schedule, goalBias),
    [schedule, goalBias]
  );

  // Handlers
  const handleBlockRemove = useCallback(
    (blockId: string) => {
      setSchedule((prev) => {
        const updated = prev.filter((b) => b.id !== blockId);
        onScheduleChange?.(updated);
        return updated;
      });
      onBlockRemove?.(blockId);
    },
    [onScheduleChange, onBlockRemove]
  );

  const handleBlockDoubleClick = useCallback(
    (block: ScheduledBlock) => {
      if (block.nodeIds[0]) {
        onGraphFocus?.(block.nodeIds[0]);
      }
    },
    [onGraphFocus]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: WeekSuggestion) => {
      // Find first day with least hours
      const minHours = Math.min(...dayHours);
      const targetDay = dayHours.findIndex((h) => h === minHours);

      const newBlock: Omit<ScheduledBlock, "id"> = {
        nodeIds: suggestion.nodeId ? [suggestion.nodeId] : [],
        dayIndex: targetDay,
        order: schedule.filter((b) => b.dayIndex === targetDay).length,
        duration: suggestion.duration,
        type: suggestion.type,
        label: suggestion.label,
      };

      const blockWithId: ScheduledBlock = {
        ...newBlock,
        id: `block:${Date.now()}`,
      };

      setSchedule((prev) => {
        const updated = [...prev, blockWithId];
        onScheduleChange?.(updated);
        return updated;
      });

      onBlockAdd?.(newBlock);
    },
    [dayHours, schedule, onScheduleChange, onBlockAdd]
  );

  const handleAutofill = useCallback(() => {
    // Simple autofill: distribute suggestions across empty-ish days
    const newBlocks: ScheduledBlock[] = [];
    let blockIndex = 0;

    for (let day = 0; day < 7; day++) {
      if (dayHours[day] < 4) {
        // If day has < 4 hours, add a deep work block
        newBlocks.push({
          id: `autofill:${Date.now()}:${blockIndex++}`,
          nodeIds: [],
          dayIndex: day,
          order: schedule.filter((b) => b.dayIndex === day).length,
          duration: 120,
          type: "deepWork",
          label: "Deep Work",
        });
      }
    }

    if (newBlocks.length > 0) {
      setSchedule((prev) => {
        const updated = [...prev, ...newBlocks];
        onScheduleChange?.(updated);
        return updated;
      });
    }
  }, [dayHours, schedule, onScheduleChange]);

  const handleClear = useCallback(() => {
    setSchedule([]);
    onScheduleChange?.([]);
  }, [onScheduleChange]);

  return (
    <div
      className={cn(
        "relative w-full h-[600px] rounded-2xl border border-white/10",
        "bg-gradient-to-br from-[#020312] via-black to-[#050818] overflow-hidden",
        "flex flex-col",
        className
      )}
    >
      {/* Ghost Graph Background */}
      <GhostGraph graph={graph} hoveredNodeId={hoveredNodeId} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/30 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-white/90">
            ← {formatWeekRange(weekStart)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutofill}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium",
              "bg-purple-500/20 border border-purple-400/30 text-purple-200",
              "hover:bg-purple-500/30",
              "transition-all duration-200"
            )}
          >
            Autofill
          </button>
          <button
            onClick={handleClear}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium",
              "bg-white/5 border border-white/10 text-white/60",
              "hover:bg-white/10",
              "transition-all duration-200"
            )}
          >
            Clear
          </button>
          <button
            onClick={onDone}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium",
              "bg-cyan-500/20 border border-cyan-400/30 text-cyan-200",
              "hover:bg-cyan-500/30",
              "transition-all duration-200"
            )}
          >
            Done
          </button>
        </div>
      </div>

      {/* Week Grid */}
      <div className="relative z-10 flex-1 grid grid-cols-7 divide-x divide-white/5 bg-black/20 backdrop-blur-sm">
        {Array.from({ length: 7 }, (_, i) => (
          <DayColumn
            key={i}
            dayIndex={i}
            date={getDayDate(weekStart, i)}
            blocks={schedule}
            isToday={i === todayDayIndex}
            totalHours={dayHours[i]}
            onBlockHover={handleBlockHover}
            onBlockRemove={handleBlockRemove}
            onBlockDoubleClick={handleBlockDoubleClick}
            onDayClick={() => onDaySelect?.(i)}
          />
        ))}
      </div>

      {/* Suggestions Bar */}
      <div className="relative z-10 px-6 py-3 border-t border-white/5 bg-black/30 backdrop-blur-sm">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] uppercase tracking-wider text-white/40 shrink-0">
            Add:
          </span>
          {suggestions.map((s) => (
            <SuggestionChip
              key={s.id}
              suggestion={s}
              onClick={() => handleSuggestionClick(s)}
            />
          ))}
        </div>
      </div>

      {/* Bottom Bar - Glyph */}
      <div className="relative z-10 px-6 py-4 border-t border-white/5 bg-black/30 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="px-4 py-2 rounded-full bg-black/60 border border-white/10">
            <span className="text-sm font-mono text-cyan-200">
              "{glyphContext.dialogue}"
            </span>
          </div>
          <div className="text-xs text-white/30">
            {schedule.length} blocks ·{" "}
            {dayHours.reduce((a, b) => a + b, 0).toFixed(1)}h total
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeekLens;
