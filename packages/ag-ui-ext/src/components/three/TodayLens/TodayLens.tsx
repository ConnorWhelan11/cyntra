"use client";

import { Canvas } from "@react-three/fiber";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import { cn } from "../../../lib/utils";

import { TodayLensScene } from "./TodayLensScene";
import {
  computeActiveBlock,
  getGlyphContext,
  type TodayLensProps,
  type TodayViewMode,
} from "./types";

/**
 * TodayLens - Day timeline / mission loop visualization
 *
 * Core Question: "What's the shape of today?"
 */
export const TodayLens: React.FC<TodayLensProps> = ({
  graph,
  date,
  blocks,
  viewMode: initialViewMode = "timeline",
  currentTime: providedTime,
  className,
  onBlockTap,
  onBlockReorder: _onBlockReorder,
  onBlockStatusChange,
  onDefer: _onDefer,
  onViewModeChange,
  onEndDay,
  onZoomOut,
  onShowContext: _onShowContext,
}) => {
  // State
  const [viewMode, setViewMode] = useState<TodayViewMode>(initialViewMode);

  // Note: These handlers will be used when implementing full block management
  void _onBlockReorder;
  void _onDefer;
  void _onShowContext;

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (providedTime) return;

    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, [providedTime]);

  // Use provided time or current time
  const currentTime = providedTime ?? now;

  // Compute active block
  const { activeBlock, nextBlock } = useMemo(
    () => computeActiveBlock(blocks, currentTime),
    [blocks, currentTime]
  );

  // Get Glyph context
  const glyphContext = useMemo(
    () => getGlyphContext(blocks, currentTime, activeBlock?.id),
    [blocks, currentTime, activeBlock?.id]
  );

  // Format date for header
  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Compute stats
  const stats = useMemo(() => {
    const done = blocks.filter((b) => b.status === "done").length;
    const total = blocks.length;
    const totalMinutes = blocks.reduce((sum, b) => sum + b.duration, 0);
    const doneMinutes = blocks
      .filter((b) => b.status === "done")
      .reduce((sum, b) => sum + b.duration, 0);

    return {
      done,
      total,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      doneHours: Math.round((doneMinutes / 60) * 10) / 10,
    };
  }, [blocks]);

  // Handlers
  const handleViewModeToggle = useCallback(() => {
    const newMode = viewMode === "timeline" ? "ring" : "timeline";
    setViewMode(newMode);
    onViewModeChange?.(newMode);
  }, [viewMode, onViewModeChange]);

  const handleBlockTap = useCallback(
    (blockId: string) => {
      onBlockTap?.(blockId);
    },
    [onBlockTap]
  );

  const handleStartBlock = useCallback(() => {
    if (nextBlock) {
      onBlockStatusChange?.(nextBlock.id, "active");
      onBlockTap?.(nextBlock.id);
    } else if (activeBlock) {
      onBlockTap?.(activeBlock.id);
    }
  }, [nextBlock, activeBlock, onBlockStatusChange, onBlockTap]);

  const handleEndDay = useCallback(() => {
    onEndDay?.();
  }, [onEndDay]);

  const handleZoomOut = useCallback(() => {
    onZoomOut?.();
  }, [onZoomOut]);

  return (
    <div
      className={cn(
        "relative w-full h-[600px] rounded-2xl border border-white/10",
        "bg-gradient-to-br from-[#020312] via-black to-[#050818] overflow-hidden",
        className
      )}
    >
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 2, 8], fov: 50 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.9,
        }}
      >
        <TodayLensScene
          graph={graph}
          blocks={blocks}
          viewMode={viewMode}
          activeBlockId={activeBlock?.id}
          currentTime={currentTime}
          onBlockTap={handleBlockTap}
        />
      </Canvas>

      {/* HUD Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Header */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          {/* Date & Stats */}
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 rounded-lg bg-black/60 border border-white/10 backdrop-blur-sm">
              <span className="text-sm font-medium text-white/90">{formattedDate}</span>
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 backdrop-blur-sm">
              <span className="text-xs text-white/50">
                {stats.done}/{stats.total} done
              </span>
              <span className="mx-2 text-white/20">·</span>
              <span className="text-xs text-cyan-300">{stats.percent}%</span>
            </div>
          </div>

          {/* View Controls */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={handleViewModeToggle}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium",
                "bg-black/60 border border-white/10 text-white/70",
                "hover:bg-white/10 hover:text-white/90",
                "transition-all duration-200"
              )}
            >
              {viewMode === "timeline" ? "⭕ Ring" : "📋 Timeline"}
            </button>

            <button
              onClick={handleZoomOut}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium",
                "bg-black/60 border border-white/10 text-white/70",
                "hover:bg-white/10 hover:text-white/90",
                "transition-all duration-200"
              )}
            >
              ↑ Week
            </button>
          </div>
        </div>

        {/* Bottom Bar - Glyph + Actions */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 w-full max-w-xl px-4">
          {/* Glyph Dialogue */}
          <div className="px-5 py-2.5 rounded-full bg-black/80 border border-white/20 backdrop-blur-md shadow-xl shadow-cyan-900/20">
            <span className="text-sm font-mono text-cyan-200">
              &quot;{glyphContext.dialogue}&quot;
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pointer-events-auto">
            {/* Start/Continue Button */}
            {(nextBlock || activeBlock) && (
              <button
                onClick={handleStartBlock}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium",
                  "bg-cyan-500/20 border border-cyan-400/30 text-cyan-200",
                  "hover:bg-cyan-500/30 hover:border-cyan-400/50",
                  "transition-all duration-200"
                )}
              >
                {activeBlock ? "Continue" : "Start"} {activeBlock?.label || nextBlock?.label}
              </button>
            )}

            {/* End Day Button */}
            <button
              onClick={handleEndDay}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium",
                "bg-white/5 border border-white/10 text-white/60",
                "hover:bg-white/10 hover:text-white/80",
                "transition-all duration-200"
              )}
            >
              End my day
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full max-w-xs">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-500"
                style={{ width: `${stats.percent}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-white/30">
              <span>{stats.doneHours}h done</span>
              <span>{stats.totalHours}h total</span>
            </div>
          </div>
        </div>

        {/* Active Block Indicator */}
        {activeBlock && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <div className="px-4 py-2 rounded-full bg-cyan-500/20 border border-cyan-400/30 backdrop-blur-sm animate-pulse">
              <span className="text-xs font-medium text-cyan-200">
                ◉ Active: {activeBlock.label}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TodayLens;
