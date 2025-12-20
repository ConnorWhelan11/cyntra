"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import React, { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { cn } from "../../../lib/utils";
import { GlyphObject } from "../Glyph/GlyphObject";
import { Graph3D } from "../Graph3D/Graph3D";
import type { Graph3DHandle } from "../Graph3D/types";

import {
  formatRelativeTime,
  getLeaksGlyphContext,
  getSeverityClasses,
  getSeverityIcon,
  type DistractionNode,
  type DurationPreset,
  type EnforcementLevel,
  type LeakAction,
  type LeaksLensProps,
  type SuppressionConfig,
} from "./types";

/**
 * Leaks Graph Scene - Shows attention leaks visualization
 */
interface LeaksGraphSceneProps {
  graph: LeaksLensProps["graph"];
  focusNodeId: string;
  distractionNodeIds: string[];
  focusedPath?: string[];
}

const LeaksGraphScene: React.FC<LeaksGraphSceneProps> = ({
  graph,
  focusNodeId,
  distractionNodeIds,
  focusedPath = [],
}) => {
  const graphRef = useRef<Graph3DHandle>(null);

  return (
    <>
      <color attach="background" args={["#050812"]} />
      <fog attach="fog" args={["#050812", 15, 40]} />

      <ambientLight intensity={0.1} />
      <directionalLight position={[5, 8, 5]} intensity={0.4} />
      <pointLight position={[8, 8, 8]} intensity={0.3} color="#ff3366" />
      <pointLight position={[-8, -4, -8]} intensity={0.2} color="#4060ff" />

      <Graph3D
        ref={graphRef}
        graph={graph}
        layout="force"
        selectedNodeId={focusNodeId}
        highlightedNodeIds={distractionNodeIds}
        focusedPath={focusedPath}
        dimUnhighlighted={true}
        maxNodeCountForLabels={10}
        embedMode={true}
        agentActivity={{ mode: "idle" }}
      />

      {/* Glyph pointing at leaks */}
      <group position={[2, 1.5, 2]}>
        <GlyphObject state="responding" variant="inGraph" scale={0.6} />
      </group>

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={0.3}
          luminanceThreshold={0.7}
          luminanceSmoothing={0.6}
        />
      </EffectComposer>
    </>
  );
};

/**
 * Leak Item Component
 */
interface LeakItemProps {
  distraction: DistractionNode;
  onAction: (nodeId: string, action: LeakAction) => void;
}

const LeakItem: React.FC<LeakItemProps> = ({ distraction, onAction }) => {
  const severityClasses = getSeverityClasses(distraction.severity);
  const icon = getSeverityIcon(distraction.severity);
  const currentAction = distraction.action ?? "block";

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border",
        severityClasses.bg,
        severityClasses.border
      )}
    >
      {/* Icon & Label */}
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className={cn("font-medium", severityClasses.text)}>
          {distraction.label}
        </div>
        {distraction.lastAccessed && (
          <div className="text-xs text-white/40">
            Last: {formatRelativeTime(distraction.lastAccessed)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1">
        {(["block", "mute", "allow"] as LeakAction[]).map((action) => (
          <button
            key={action}
            onClick={() => onAction(distraction.nodeId, action)}
            className={cn(
              "px-2 py-1 rounded text-xs font-medium transition-all",
              currentAction === action
                ? action === "block"
                  ? "bg-red-500/30 text-red-300"
                  : action === "mute"
                    ? "bg-amber-500/30 text-amber-300"
                    : "bg-green-500/30 text-green-300"
                : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
            )}
          >
            {action === "block" ? "Block" : action === "mute" ? "Mute" : "Allow"}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Duration Picker Component
 */
interface DurationPickerProps {
  selected: number;
  onChange: (minutes: number) => void;
}

const DurationPicker: React.FC<DurationPickerProps> = ({
  selected,
  onChange,
}) => {
  const presets: { value: DurationPreset; label: string; minutes: number }[] = [
    { value: 25, label: "25 min", minutes: 25 },
    { value: 50, label: "50 min", minutes: 50 },
    { value: 90, label: "90 min", minutes: 90 },
  ];

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/40 uppercase tracking-wider">
        Duration
      </span>
      <div className="flex gap-2">
        {presets.map(({ value, label, minutes }) => (
          <button
            key={value}
            onClick={() => onChange(minutes)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              selected === minutes
                ? "bg-purple-500/30 border border-purple-400/50 text-purple-200"
                : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * LeaksLens - Distraction Firewall
 *
 * Core Question: "What's pulling me off-course, and can you fence it off?"
 */
export const LeaksLens: React.FC<LeaksLensProps> = ({
  graph,
  focusNodeId,
  goalNodeId: _goalNodeId,
  focusedPath = [],
  distractions,
  telemetryData: _telemetryData,
  className,
  onSuppressionConfirm,
  onSuppressionCancel,
  onLeakToggle,
  onShowWhy,
  onDurationSelect,
}) => {
  // Silence unused
  void _goalNodeId;
  void _telemetryData;

  // State
  const [selectedDuration, setSelectedDuration] = useState(25);
  const [localDistractions, setLocalDistractions] =
    useState<DistractionNode[]>(distractions);

  // Compute which are blocked/muted
  const blockedNodeIds = useMemo(
    () =>
      localDistractions
        .filter((d) => d.action === "block" || d.action === "mute")
        .map((d) => d.nodeId),
    [localDistractions]
  );

  // Get Glyph context
  const glyphContext = useMemo(
    () => getLeaksGlyphContext(localDistractions, blockedNodeIds.length),
    [localDistractions, blockedNodeIds.length]
  );

  // Handlers
  const handleLeakAction = useCallback(
    (nodeId: string, action: LeakAction) => {
      setLocalDistractions((prev) =>
        prev.map((d) => (d.nodeId === nodeId ? { ...d, action } : d))
      );
      onLeakToggle?.(nodeId, action);
    },
    [onLeakToggle]
  );

  const handleDurationChange = useCallback(
    (minutes: number) => {
      setSelectedDuration(minutes);
      onDurationSelect?.(minutes);
    },
    [onDurationSelect]
  );

  const handleConfirm = useCallback(() => {
    const now = new Date();
    const config: SuppressionConfig = {
      targetNodeIds: blockedNodeIds,
      duration: selectedDuration,
      enforcement: "medium" as EnforcementLevel,
      blockedSites: localDistractions
        .filter((d) => d.action === "block" && d.sites)
        .flatMap((d) => d.sites!),
      startedAt: now,
      endsAt: new Date(now.getTime() + selectedDuration * 60 * 1000),
    };
    onSuppressionConfirm?.(config);
  }, [
    blockedNodeIds,
    selectedDuration,
    localDistractions,
    onSuppressionConfirm,
  ]);

  const handleShowWhy = useCallback(
    (nodeId: string) => {
      onShowWhy?.(nodeId);
    },
    [onShowWhy]
  );

  return (
    <div
      className={cn(
        "relative w-full h-[600px] rounded-2xl border border-white/10",
        "bg-gradient-to-br from-[#020312] via-black to-[#050818] overflow-hidden",
        "flex flex-col",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-lg">🛡</span>
          <span className="text-sm font-medium text-white/90">
            Attention Leaks
          </span>
          <span className="text-xs text-white/40">
            {localDistractions.length} detected
          </span>
        </div>
        <button
          onClick={onSuppressionCancel}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium",
            "bg-white/5 border border-white/10 text-white/60",
            "hover:bg-white/10 hover:text-white/80",
            "transition-all duration-200"
          )}
        >
          Cancel
        </button>
      </div>

      {/* Graph Preview */}
      <div className="h-48 border-b border-white/5">
        <Canvas
          camera={{ position: [0, 3, 8], fov: 50 }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 0.9,
          }}
        >
          <LeaksGraphScene
            graph={graph}
            focusNodeId={focusNodeId}
            distractionNodeIds={localDistractions.map((d) => d.nodeId)}
            focusedPath={focusedPath}
          />
        </Canvas>
      </div>

      {/* Leaks List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="text-xs uppercase tracking-wider text-white/40 mb-3">
          Detected Leaks
        </div>
        {localDistractions.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">✨</div>
            <div className="text-white/60">No leaks detected</div>
            <div className="text-sm text-white/40">Your focus is clean!</div>
          </div>
        ) : (
          <div className="space-y-2">
            {localDistractions.map((distraction) => (
              <LeakItem
                key={distraction.nodeId}
                distraction={distraction}
                onAction={handleLeakAction}
              />
            ))}
          </div>
        )}
      </div>

      {/* Duration Picker */}
      {localDistractions.length > 0 && (
        <div className="px-6 py-3 border-t border-white/5">
          <DurationPicker
            selected={selectedDuration}
            onChange={handleDurationChange}
          />
        </div>
      )}

      {/* Bottom Bar - Glyph */}
      <div className="px-6 py-4 border-t border-white/5">
        <div className="flex flex-col items-center gap-3">
          {/* Dialogue */}
          <div className="px-5 py-2.5 rounded-full bg-black/80 border border-white/20 backdrop-blur-md">
            <span className="text-sm font-mono text-cyan-200">
              "{glyphContext.dialogue}"
            </span>
          </div>

          {/* Actions */}
          {localDistractions.length > 0 && (
            <div className="flex gap-3">
              <button
                onClick={() =>
                  localDistractions[0] && handleShowWhy(localDistractions[0].nodeId)
                }
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium",
                  "bg-white/5 border border-white/10 text-white/60",
                  "hover:bg-white/10 hover:text-white/80",
                  "transition-all duration-200"
                )}
              >
                Show why
              </button>
              <button
                onClick={handleConfirm}
                disabled={blockedNodeIds.length === 0}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium",
                  blockedNodeIds.length > 0
                    ? "bg-purple-500/20 border border-purple-400/30 text-purple-200 hover:bg-purple-500/30"
                    : "bg-white/5 border border-white/10 text-white/30 cursor-not-allowed",
                  "transition-all duration-200"
                )}
              >
                Confirm Suppression ({blockedNodeIds.length})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeaksLens;

