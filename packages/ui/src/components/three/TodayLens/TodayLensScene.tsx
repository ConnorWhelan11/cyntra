"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import React, { useMemo, useRef } from "react";
import * as THREE from "three";

import { GlyphObject } from "../Glyph/GlyphObject";
import type { GlyphState } from "../Glyph/types";
import { Graph3D } from "../Graph3D/Graph3D";
import type { Graph3DHandle } from "../Graph3D/types";

import {
  BLOCK_COLORS,
  BLOCK_ICONS,
  blocksToRingGraph,
  computeActiveBlock,
  getGlyphContext,
  STATUS_STYLES,
  type TodayBlock,
  type TodayLensSceneProps,
} from "./types";

/**
 * Glyph for the Today scene
 */
interface TodayGlyphProps {
  state: GlyphState;
  position: [number, number, number];
}

const TodayGlyph: React.FC<TodayGlyphProps> = ({ state, position }) => {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3(...position));

  useFrame(() => {
    if (!groupRef.current) return;
    targetPos.current.set(...position);
    groupRef.current.position.lerp(targetPos.current, 0.05);
  });

  return (
    <group ref={groupRef} position={position}>
      <GlyphObject state={state} variant="inGraph" scale={0.8} />
    </group>
  );
};

/**
 * Timeline Block Component (rendered via Html)
 */
interface TimelineBlockProps {
  block: TodayBlock;
  isActive: boolean;
  onClick?: () => void;
}

const TimelineBlock: React.FC<TimelineBlockProps> = ({
  block,
  isActive,
  onClick,
}) => {
  const baseClasses = BLOCK_COLORS[block.type];
  const statusClasses = STATUS_STYLES[block.status];
  const icon = BLOCK_ICONS[block.type];

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg border backdrop-blur-sm
        transition-all duration-200 hover:scale-[1.02]
        ${baseClasses}
        ${statusClasses}
        ${isActive ? "ring-2 ring-cyan-400 shadow-lg shadow-cyan-400/30" : ""}
      `}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg opacity-70">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-white/90 truncate">
              {block.label}
            </span>
            <span className="text-xs text-white/50 whitespace-nowrap">
              {block.duration}m
            </span>
          </div>
          {block.description && (
            <p className="text-xs text-white/50 mt-1 truncate">
              {block.description}
            </p>
          )}
          <div className="text-[10px] text-white/40 mt-1">
            {formatTime(block.scheduledStart)}
          </div>
        </div>
        {block.status === "done" && <span className="text-green-400">✓</span>}
        {block.status === "active" && (
          <span className="text-cyan-400 animate-pulse">◉</span>
        )}
      </div>
    </button>
  );
};

/**
 * Now Marker Component
 */
interface NowMarkerProps {
  currentTime: Date;
  blocks: TodayBlock[];
}

const NowMarker: React.FC<NowMarkerProps> = ({ currentTime }) => {
  const timeStr = currentTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-red-500 to-transparent" />
      <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider">
        NOW · {timeStr}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-red-500 to-transparent" />
    </div>
  );
};

/**
 * Timeline View (2D HTML embedded in 3D)
 */
interface TimelineViewProps {
  blocks: TodayBlock[];
  currentTime: Date;
  activeBlockId?: string;
  onBlockTap?: (blockId: string) => void;
}

const TimelineView: React.FC<TimelineViewProps> = ({
  blocks,
  currentTime,
  activeBlockId,
  onBlockTap,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sort blocks by scheduled start
  const sortedBlocks = useMemo(
    () =>
      [...blocks].sort(
        (a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime()
      ),
    [blocks]
  );

  // Find where to insert the Now marker
  const nowMs = currentTime.getTime();
  const nowIndex = sortedBlocks.findIndex(
    (b) => b.scheduledStart.getTime() > nowMs
  );

  // Prevent scroll events from propagating to the 3D canvas
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    // Manually scroll the container
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop += e.deltaY;
    }
  };

  return (
    <Html
      center
      position={[0, 0, 0]}
      style={{
        width: "340px",
        pointerEvents: "auto",
      }}
      className="today-timeline"
    >
      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        className="bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 p-4 overflow-y-auto max-h-[420px] scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
      >
        <div className="space-y-2">
          {sortedBlocks.map((block, index) => (
            <React.Fragment key={block.id}>
              {/* Insert Now marker at the right position */}
              {nowIndex === index && (
                <NowMarker currentTime={currentTime} blocks={blocks} />
              )}
              <TimelineBlock
                block={block}
                isActive={block.id === activeBlockId}
                onClick={() => onBlockTap?.(block.id)}
              />
            </React.Fragment>
          ))}
          {/* Now marker at end if all blocks are past */}
          {nowIndex === -1 && sortedBlocks.length > 0 && (
            <NowMarker currentTime={currentTime} blocks={blocks} />
          )}
        </div>
      </div>
    </Html>
  );
};

/**
 * Ring View (3D Graph)
 */
interface RingViewProps {
  blocks: TodayBlock[];
  activeBlockId?: string;
  onBlockTap?: (blockId: string) => void;
}

const RingView: React.FC<RingViewProps> = ({
  blocks,
  activeBlockId,
  onBlockTap,
}) => {
  const graphRef = useRef<Graph3DHandle>(null);
  const ringGraph = useMemo(() => blocksToRingGraph(blocks), [blocks]);

  return (
    <Graph3D
      ref={graphRef}
      graph={ringGraph}
      layout="ring"
      layoutOptions={{ radius: 4 }}
      selectedNodeId={activeBlockId}
      focusedPath={blocks.map((b) => b.id)}
      maxNodeCountForLabels={blocks.length}
      embedMode={true}
      onNodeClick={onBlockTap}
    />
  );
};

/**
 * TodayLensScene - The 3D scene for the Today lens
 */
export const TodayLensScene: React.FC<TodayLensSceneProps> = ({
  graph,
  blocks,
  viewMode,
  activeBlockId,
  currentTime,
  onBlockTap,
}) => {
  // Compute active block if not provided
  const { activeBlock } = computeActiveBlock(blocks, currentTime);
  const effectiveActiveId = activeBlockId ?? activeBlock?.id;

  // Get Glyph context
  const glyphContext = getGlyphContext(blocks, currentTime, effectiveActiveId);

  // Glyph position based on view mode
  const glyphPosition: [number, number, number] =
    viewMode === "ring" ? [0, 2, 0] : [3, 0, 2];

  return (
    <>
      {/* Environment */}
      <color attach="background" args={["#050812"]} />
      <fog attach="fog" args={["#050812", 15, 50]} />

      {/* Lighting */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 8, 5]} intensity={0.5} />
      <pointLight position={[8, 8, 8]} intensity={0.4} color="#4060ff" />
      <pointLight position={[-8, -4, -8]} intensity={0.25} color="#ff0080" />

      {/* Mini Graph Context (always visible, positioned to the side) */}
      {viewMode === "timeline" && (
        <group position={[-4, 0, -2]} scale={0.5}>
          <Graph3D
            graph={graph}
            layout="fibonacci"
            selectedNodeId={
              effectiveActiveId
                ? blocks.find((b) => b.id === effectiveActiveId)?.nodeIds[0]
                : undefined
            }
            maxNodeCountForLabels={5}
            embedMode={true}
            dimUnhighlighted={true}
          />
        </group>
      )}

      {/* Main View */}
      {viewMode === "timeline" ? (
        <TimelineView
          blocks={blocks}
          currentTime={currentTime}
          activeBlockId={effectiveActiveId}
          onBlockTap={onBlockTap}
        />
      ) : (
        <RingView
          blocks={blocks}
          activeBlockId={effectiveActiveId}
          onBlockTap={onBlockTap}
        />
      )}

      {/* Glyph */}
      <TodayGlyph state={glyphContext.state} position={glyphPosition} />

      {/* Post Processing */}
      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={0.2}
          luminanceThreshold={0.85}
          luminanceSmoothing={0.7}
        />
      </EffectComposer>
    </>
  );
};

export default TodayLensScene;
