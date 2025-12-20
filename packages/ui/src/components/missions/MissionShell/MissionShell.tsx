"use client";

/**
 * MissionShell — Main mission UI orchestrator
 * Renders HUD, tool dock/rail, and layout preset
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  Clock,
  Pause,
  Play,
  SkipForward,
  Square,
  Users,
} from "lucide-react";
import React, { useCallback, useMemo } from "react";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { HUDProgressRing } from "../../atoms/HUDProgressRing";
import { GlowButton } from "../../atoms/GlowButton";
import { useMissionRuntime } from "../../../missions/provider";
import { getLayout, getTool } from "../../../missions/registry";
import type {
  MissionDefinition,
  MissionLayoutSlotId,
  MissionToolId,
} from "../../../missions/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionShellProps {
  /** Custom class name */
  className?: string;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Custom widgets to render in the rail */
  customWidgets?: React.ReactNode;
  /** Show dev panel */
  showDevPanel?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface PhaseIndicatorProps {
  phase: string;
  status: string;
}

function PhaseIndicator({ phase, status }: PhaseIndicatorProps) {
  const phaseColors: Record<string, string> = {
    briefing: "text-cyan-neon border-cyan-neon/40 bg-cyan-neon/10",
    running: "text-emerald-neon border-emerald-neon/40 bg-emerald-neon/10",
    checkpoint: "text-amber-400 border-amber-400/40 bg-amber-400/10",
    debrief: "text-magenta-neon border-magenta-neon/40 bg-magenta-neon/10",
  };

  const statusColors: Record<string, string> = {
    idle: "bg-slate-500",
    active: "bg-emerald-neon",
    paused: "bg-amber-400",
    completed: "bg-cyan-neon",
    aborted: "bg-red-500",
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          statusColors[status] ?? "bg-slate-500"
        )}
      />
      <span
        className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
          phaseColors[phase] ?? "text-slate-400 border-slate-400/40 bg-slate-400/10"
        )}
      >
        {phase}
      </span>
    </div>
  );
}

interface ToolRailProps {
  definition: MissionDefinition;
  openToolIds: MissionToolId[];
  activeToolId: MissionToolId | null;
  onOpenTool: (toolId: MissionToolId) => void;
  onSetActive: (toolId: MissionToolId) => void;
}

function ToolRail({
  definition,
  openToolIds,
  activeToolId,
  onOpenTool,
  onSetActive,
}: ToolRailProps) {
  return (
    <div className="flex flex-col gap-1">
      {definition.tools.map((toolRef) => {
        const tool = getTool(toolRef.toolId);
        if (!tool) return null;

        const isOpen = openToolIds.includes(toolRef.toolId);
        const isActive = activeToolId === toolRef.toolId;

        return (
          <button
            key={toolRef.toolId}
            onClick={() => {
              if (!isOpen) {
                onOpenTool(toolRef.toolId);
              } else if (!isActive) {
                onSetActive(toolRef.toolId);
              }
            }}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg border transition-all",
              isActive
                ? "border-cyan-neon/60 bg-cyan-neon/20 text-cyan-neon shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                : isOpen
                  ? "border-cyan-neon/30 bg-cyan-neon/10 text-cyan-neon/80"
                  : "border-border/40 bg-card/40 text-muted-foreground hover:border-cyan-neon/30 hover:text-cyan-neon/60"
            )}
            title={tool.title}
          >
            {tool.icon ?? (
              <span className="text-xs font-medium">
                {tool.title.slice(0, 2).toUpperCase()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function MissionShell({
  className,
  disableAnimations = false,
  customWidgets,
  showDevPanel = false,
}: MissionShellProps) {
  const {
    definition,
    state,
    isLoaded,
    progress,
    elapsedSeconds,
    isPaused,
    isActive,
    isComplete,
    startMission,
    pauseMission,
    resumeMission,
    completeMission,
    completeCurrentStep,
    openTool,
    setActiveTool,
    eventLog,
    dispatch,
  } = useMissionRuntime();

  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  // Render tool by ID
  const renderTool = useCallback(
    (toolId: MissionToolId, _slot: MissionLayoutSlotId) => {
      if (!definition || !state) return null;

      const tool = getTool(toolId);
      if (!tool) {
        return (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Tool not found: {toolId}
          </div>
        );
      }

      const toolRef = definition.tools.find((t) => t.toolId === toolId);

      return (
        <tool.Panel
          toolId={toolId}
          config={toolRef?.config}
          context={{
            runId: state.runId,
            definition,
            state,
            dispatch,
            stepState: state.activeStepId
              ? state.steps[state.activeStepId]
              : undefined,
          }}
        />
      );
    },
    [definition, state, dispatch]
  );

  // Get layout component
  const LayoutComponent = useMemo(() => {
    if (!definition) return null;
    const layout = getLayout(definition.layout);
    return layout?.Component ?? null;
  }, [definition]);

  // Loading/empty state
  if (!isLoaded || !definition || !state) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center bg-background",
          className
        )}
      >
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-cyan-neon border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading mission...</p>
        </div>
      </div>
    );
  }

  // Estimated total time
  const estimatedTotal = (definition.estimatedDurationMinutes ?? 60) * 60;

  return (
    <div className={cn("mission-shell flex h-full flex-col", className)}>
      {/* Header/HUD */}
      <motion.header
        className="flex items-center justify-between border-b border-border/40 bg-card/60 px-4 py-3 backdrop-blur-sm"
        initial={shouldAnimate ? { opacity: 0, y: -20 } : {}}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Left: Title + Mode + Phase */}
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {definition.title}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={cn(
                  "flex items-center gap-1 text-[10px] uppercase tracking-wider",
                  definition.mode === "pod"
                    ? "text-magenta-neon"
                    : "text-cyan-neon"
                )}
              >
                {definition.mode === "pod" ? (
                  <Users className="h-3 w-3" />
                ) : null}
                {definition.mode}
              </span>
              <span className="text-muted-foreground">•</span>
              <PhaseIndicator phase={state.phase} status={state.status} />
            </div>
          </div>
        </div>

        {/* Center: Timer + Progress */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono tabular-nums text-foreground">
              {formatTime(elapsedSeconds)}
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatTime(estimatedTotal)}
            </span>
          </div>

          <HUDProgressRing
            value={progress}
            size={48}
            strokeWidth={4}
            theme="cyan"
            showValue={false}
            disableAnimations={disableAnimations}
          />

          {definition.rewardXP && (
            <div className="flex items-center gap-1 rounded-full border border-emerald-neon/30 bg-emerald-neon/10 px-2 py-1">
              <span className="text-xs font-medium text-emerald-neon">
                {definition.rewardXP} XP
              </span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {state.status === "idle" && (
            <GlowButton glow="low" size="sm" onClick={startMission}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Start
            </GlowButton>
          )}

          {isActive && !isPaused && (
            <>
              <GlowButton
                variant="outline"
                glow="none"
                size="sm"
                onClick={pauseMission}
              >
                <Pause className="mr-1.5 h-3.5 w-3.5" />
                Pause
              </GlowButton>

              {state.activeStepId && (
                <GlowButton
                  variant="ghost"
                  glow="none"
                  size="sm"
                  onClick={completeCurrentStep}
                >
                  <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                  Complete Step
                </GlowButton>
              )}
            </>
          )}

          {isPaused && (
            <GlowButton glow="low" size="sm" onClick={resumeMission}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Resume
            </GlowButton>
          )}

          {state.phase === "debrief" && !isComplete && (
            <GlowButton glow="high" size="sm" onClick={completeMission}>
              <Square className="mr-1.5 h-3.5 w-3.5" />
              Complete Mission
            </GlowButton>
          )}

          {isComplete && (
            <div className="flex items-center gap-2 rounded-full bg-emerald-neon/10 px-3 py-1.5 text-sm font-medium text-emerald-neon">
              ✓ Completed
            </div>
          )}
        </div>
      </motion.header>

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0">
        {/* Tool Rail (Left) */}
        <motion.aside
          className="flex flex-col gap-2 border-r border-border/40 bg-card/40 p-2"
          initial={shouldAnimate ? { opacity: 0, x: -20 } : {}}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <ToolRail
            definition={definition}
            openToolIds={state.openToolIds}
            activeToolId={state.activeToolId}
            onOpenTool={openTool}
            onSetActive={setActiveTool}
          />
        </motion.aside>

        {/* Layout Content */}
        <motion.main
          className="flex-1 min-h-0 overflow-hidden"
          initial={shouldAnimate ? { opacity: 0 } : {}}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {LayoutComponent ? (
            <LayoutComponent
              definition={definition}
              state={state}
              renderTool={renderTool}
              widgets={customWidgets}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Layout not found: {definition.layout}
            </div>
          )}
        </motion.main>
      </div>

      {/* Checkpoint Modal */}
      <AnimatePresence>
        {state.checkpoint && (
          <CheckpointModal
            checkpoint={state.checkpoint}
            definition={definition}
            shouldAnimate={shouldAnimate}
          />
        )}
      </AnimatePresence>

      {/* Dev Panel */}
      {showDevPanel && (
        <DevPanel eventLog={eventLog} state={state} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint Modal
// ─────────────────────────────────────────────────────────────────────────────

interface CheckpointModalProps {
  checkpoint: { id: string; openedAt: number };
  definition: MissionDefinition;
  shouldAnimate: boolean;
}

function CheckpointModal({
  checkpoint,
  definition,
  shouldAnimate,
}: CheckpointModalProps) {
  const { ackCheckpoint } = useMissionRuntime();
  const checkpointDef = definition.checkpoints?.find(
    (c) => c.id === checkpoint.id
  );

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={shouldAnimate ? { opacity: 0 } : {}}
      animate={{ opacity: 1 }}
      exit={shouldAnimate ? { opacity: 0 } : {}}
    >
      <motion.div
        className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-card/95 p-6 shadow-2xl"
        initial={shouldAnimate ? { scale: 0.95, y: 20 } : {}}
        animate={{ scale: 1, y: 0 }}
        exit={shouldAnimate ? { scale: 0.95, y: 20 } : {}}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/20">
            <Clock className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Checkpoint</h3>
            <p className="text-sm text-muted-foreground">
              {checkpointDef?.title ?? "Quick check-in"}
            </p>
          </div>
        </div>

        <div className="mb-6 space-y-3">
          <p className="text-sm text-foreground">
            Take a moment to assess your progress. Are you on track?
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <GlowButton
            glow="low"
            onClick={() => ackCheckpoint(checkpoint.id)}
          >
            Continue
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </GlowButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dev Panel
// ─────────────────────────────────────────────────────────────────────────────

interface DevPanelProps {
  eventLog: Array<{ type: string; at: number; [key: string]: unknown }>;
  state: { phase: string; status: string; activeStepId: string | null };
}

function DevPanel({ eventLog, state }: DevPanelProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="mb-2 rounded-full border border-border/40 bg-card/90 px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground"
      >
        {isOpen ? "Close" : "Dev Panel"}
      </button>

      {isOpen && (
        <div className="w-80 max-h-64 overflow-auto rounded-lg border border-border/40 bg-card/95 p-3 text-xs font-mono">
          <div className="mb-2 border-b border-border/40 pb-2">
            <div>Phase: {state.phase}</div>
            <div>Status: {state.status}</div>
            <div>Active Step: {state.activeStepId ?? "none"}</div>
          </div>
          <div className="space-y-1">
            {eventLog.slice(-10).reverse().map((event, i) => (
              <div key={i} className="text-muted-foreground">
                <span className="text-cyan-neon">{event.type}</span>
                <span className="ml-2 text-slate-500">
                  {new Date(event.at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MissionShell;

