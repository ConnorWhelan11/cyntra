"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../../lib/utils";

import {
  createTimerState,
  formatTime,
  getStackGlyphContext,
  getTimerColor,
  type EnforcementState,
  type StackLensProps,
  type StackTask,
  type TimerState,
} from "./types";

/**
 * Timer Display Component
 */
interface TimerDisplayProps {
  timerState: TimerState;
  onPause: () => void;
  onResume: () => void;
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({ timerState, onPause, onResume }) => {
  const remaining = timerState.plannedSeconds - timerState.elapsedSeconds;
  const progress = timerState.elapsedSeconds / timerState.plannedSeconds;
  const color = getTimerColor(remaining, timerState.plannedSeconds);
  const isWarning = remaining <= 300 && remaining > 0;

  const colorClasses = {
    green: "text-green-400 bg-green-500",
    amber: "text-amber-400 bg-amber-500",
    red: "text-red-400 bg-red-500",
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Countdown */}
      <div
        className={cn(
          "text-5xl font-mono font-bold tracking-tight",
          colorClasses[color].split(" ")[0],
          isWarning && "animate-pulse"
        )}
      >
        {formatTime(remaining)}
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-1000 ease-linear rounded-full",
            colorClasses[color].split(" ")[1]
          )}
          style={{ width: `${Math.min(progress * 100, 100)}%` }}
        />
      </div>

      {/* Pause/Resume button */}
      <button
        onClick={timerState.status === "running" ? onPause : onResume}
        className={cn(
          "px-4 py-1.5 rounded-lg text-sm font-medium",
          "bg-white/5 border border-white/10 text-white/60",
          "hover:bg-white/10 hover:text-white/80",
          "transition-all duration-200"
        )}
      >
        {timerState.status === "running" ? "⏸ Pause" : "▶ Resume"}
      </button>
    </div>
  );
};

/**
 * Now Card - The active task card
 */
interface NowCardProps {
  task: StackTask;
  timerState: TimerState;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onSkip: () => void;
}

const NowCard: React.FC<NowCardProps> = ({
  task,
  timerState,
  onPause,
  onResume,
  onComplete,
  onSkip,
}) => {
  return (
    <div
      className={cn(
        "w-full p-6 rounded-2xl",
        "bg-gradient-to-br from-cyan-500/10 via-black/50 to-purple-500/10",
        "border-2 border-cyan-400/30",
        "shadow-lg shadow-cyan-500/10"
      )}
    >
      {/* Task info */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-1">{task.label}</h2>
        {task.description && <p className="text-sm text-white/50">{task.description}</p>}
      </div>

      {/* Timer */}
      <TimerDisplay timerState={timerState} onPause={onPause} onResume={onResume} />

      {/* Actions */}
      <div className="flex justify-center gap-3 mt-6">
        <button
          onClick={onSkip}
          className={cn(
            "px-5 py-2.5 rounded-xl text-sm font-medium",
            "bg-white/5 border border-white/10 text-white/60",
            "hover:bg-white/10 hover:text-white/80",
            "transition-all duration-200"
          )}
        >
          Skip →
        </button>
        <button
          onClick={onComplete}
          className={cn(
            "px-5 py-2.5 rounded-xl text-sm font-medium",
            "bg-green-500/20 border border-green-400/30 text-green-300",
            "hover:bg-green-500/30 hover:border-green-400/50",
            "transition-all duration-200"
          )}
        >
          Done ✓
        </button>
      </div>
    </div>
  );
};

/**
 * Next/Maybe Card - Smaller queue cards
 */
interface QueueCardProps {
  task: StackTask;
  position: "next" | "maybe";
  onPromote?: () => void;
}

const QueueCard: React.FC<QueueCardProps> = ({ task, position, onPromote }) => {
  const isNext = position === "next";

  return (
    <button
      onClick={onPromote}
      className={cn(
        "w-full p-4 rounded-xl text-left",
        "bg-white/5 border border-white/10",
        "hover:bg-white/10 hover:border-white/20",
        "transition-all duration-200",
        isNext ? "opacity-80" : "opacity-50"
      )}
      style={{ width: isNext ? "85%" : "70%" }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-wider text-white/40">
          {isNext ? "Next" : "Maybe"}
        </span>
        <span className="text-sm font-medium text-white/80">{task.label}</span>
        <span className="text-xs text-white/40 ml-auto">{task.plannedDuration}m</span>
      </div>
    </button>
  );
};

/**
 * Enforcement Badge
 */
interface EnforcementBadgeProps {
  state: EnforcementState;
  onToggle?: (enabled: boolean) => void;
}

const EnforcementBadge: React.FC<EnforcementBadgeProps> = ({ state, onToggle }) => {
  const remainingMs = state.endsAt.getTime() - Date.now();
  const remainingMins = Math.max(0, Math.ceil(remainingMs / 60000));

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 rounded-xl",
        state.active
          ? "bg-purple-500/20 border border-purple-400/30"
          : "bg-white/5 border border-white/10"
      )}
    >
      <span className="text-lg">{state.active ? "🛡" : "🔓"}</span>
      <div className="flex-1">
        <div className="text-sm font-medium text-white/80">
          Enforcement {state.active ? "ON" : "OFF"}
        </div>
        {state.active && state.suppressedSites && (
          <div className="text-xs text-white/40">
            {state.suppressedSites.slice(0, 2).join(", ")}
            {state.suppressedSites.length > 2 && ` +${state.suppressedSites.length - 2}`}
          </div>
        )}
      </div>
      {state.active && <span className="text-xs text-purple-300">{remainingMins}m left</span>}
      {onToggle && (
        <button
          onClick={() => onToggle(!state.active)}
          className="text-xs text-white/40 hover:text-white/60"
        >
          {state.active ? "Disable" : "Enable"}
        </button>
      )}
    </div>
  );
};

/**
 * StackLens - Execution interface with Now → Next → Maybe
 *
 * Core Question: "What do I do right now?"
 */
export const StackLens: React.FC<StackLensProps> = ({
  blockId: _blockId,
  blockLabel,
  tasks,
  enforcementState,
  currentTime: _currentTime,
  className,
  onTaskStart,
  onTaskPause,
  onTaskResume,
  onTaskComplete,
  onTaskSkip,
  onReorder: _onReorder,
  onDistractionTrigger,
  onEnforcementToggle,
  onBlockComplete,
  onZoomOut,
  onShowContext: _onShowContext,
}) => {
  // Silence unused warnings
  void _blockId;
  void _currentTime;
  void _onReorder;
  void _onShowContext;

  // Find active task or first pending
  const activeTask = useMemo(
    () => tasks.find((t) => t.status === "active") || tasks.find((t) => t.status === "pending"),
    [tasks]
  );

  // Queue tasks (next and maybe)
  const queueTasks = useMemo(
    () => tasks.filter((t) => t.id !== activeTask?.id && t.status === "pending").slice(0, 2),
    [tasks, activeTask]
  );

  // Timer state
  const [timerState, setTimerState] = useState<TimerState>(() =>
    activeTask ? createTimerState(activeTask) : createTimerState(tasks[0])
  );

  // Timer interval ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start timer tick
  useEffect(() => {
    if (timerState.status === "running" && timerState.startedAt) {
      timerRef.current = setInterval(() => {
        setTimerState((prev) => {
          const now = Date.now();
          const elapsed =
            Math.floor((now - prev.startedAt!.getTime()) / 1000) + (prev.pausedAt ? 0 : 0);
          const newStatus = elapsed >= prev.plannedSeconds ? "overtime" : "running";

          return {
            ...prev,
            elapsedSeconds: elapsed,
            status: newStatus,
          };
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [timerState.status, timerState.startedAt]);

  // Reset timer when active task changes
  useEffect(() => {
    if (activeTask) {
      setTimerState(createTimerState(activeTask));
    }
  }, [activeTask]);

  // Get Glyph context
  const glyphContext = useMemo(() => getStackGlyphContext(tasks, timerState), [tasks, timerState]);

  // Check if all tasks are done
  const allTasksDone = tasks.every((t) => t.status === "done" || t.status === "skipped");

  // Handlers
  const handleStart = useCallback(() => {
    if (activeTask) {
      setTimerState((prev) => ({
        ...prev,
        status: "running",
        startedAt: new Date(),
      }));
      onTaskStart?.(activeTask.id);
    }
  }, [activeTask, onTaskStart]);

  const handlePause = useCallback(() => {
    if (activeTask) {
      setTimerState((prev) => ({
        ...prev,
        status: "paused",
        pausedAt: new Date(),
      }));
      onTaskPause?.(activeTask.id);
    }
  }, [activeTask, onTaskPause]);

  const handleResume = useCallback(() => {
    if (activeTask) {
      setTimerState((prev) => ({
        ...prev,
        status: "running",
        startedAt: new Date(),
        pausedAt: null,
      }));
      onTaskResume?.(activeTask.id);
    }
  }, [activeTask, onTaskResume]);

  const handleComplete = useCallback(() => {
    if (activeTask) {
      onTaskComplete?.(activeTask.id);
      // Check if this was the last task
      const remainingTasks = tasks.filter((t) => t.id !== activeTask.id && t.status === "pending");
      if (remainingTasks.length === 0) {
        onBlockComplete?.();
      }
    }
  }, [activeTask, tasks, onTaskComplete, onBlockComplete]);

  const handleSkip = useCallback(() => {
    if (activeTask) {
      onTaskSkip?.(activeTask.id);
      // Check if this was the last task
      const remainingTasks = tasks.filter((t) => t.id !== activeTask.id && t.status === "pending");
      if (remainingTasks.length === 0) {
        onBlockComplete?.();
      }
    }
  }, [activeTask, tasks, onTaskSkip, onBlockComplete]);

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
          <span className="text-xs uppercase tracking-widest text-white/40">Stack</span>
          {blockLabel && <span className="text-sm font-medium text-white/70">{blockLabel}</span>}
        </div>
        <button
          onClick={onZoomOut}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium",
            "bg-white/5 border border-white/10 text-white/60",
            "hover:bg-white/10 hover:text-white/80",
            "transition-all duration-200"
          )}
        >
          ↑ Today
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-4">
        {/* All done state */}
        {allTasksDone ? (
          <div className="text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">Stack Cleared!</h2>
            <p className="text-white/50 mb-6">Great work on this block.</p>
            <button
              onClick={onBlockComplete}
              className={cn(
                "px-6 py-3 rounded-xl text-sm font-medium",
                "bg-cyan-500/20 border border-cyan-400/30 text-cyan-200",
                "hover:bg-cyan-500/30 hover:border-cyan-400/50",
                "transition-all duration-200"
              )}
            >
              Continue to Debrief
            </button>
          </div>
        ) : activeTask ? (
          <>
            {/* Now Card */}
            {timerState.status === "idle" ? (
              <div
                className={cn(
                  "w-full max-w-md p-6 rounded-2xl text-center",
                  "bg-gradient-to-br from-cyan-500/10 via-black/50 to-purple-500/10",
                  "border-2 border-cyan-400/30"
                )}
              >
                <h2 className="text-2xl font-bold text-white mb-2">{activeTask.label}</h2>
                {activeTask.description && (
                  <p className="text-sm text-white/50 mb-4">{activeTask.description}</p>
                )}
                <p className="text-white/40 mb-6">{activeTask.plannedDuration} minutes planned</p>
                <button
                  onClick={handleStart}
                  className={cn(
                    "px-8 py-3 rounded-xl text-lg font-medium",
                    "bg-cyan-500/30 border border-cyan-400/50 text-cyan-200",
                    "hover:bg-cyan-500/40",
                    "transition-all duration-200"
                  )}
                >
                  Start Timer
                </button>
              </div>
            ) : (
              <NowCard
                task={activeTask}
                timerState={timerState}
                onPause={handlePause}
                onResume={handleResume}
                onComplete={handleComplete}
                onSkip={handleSkip}
              />
            )}

            {/* Queue */}
            <div className="w-full max-w-md flex flex-col items-center gap-2 mt-4">
              {queueTasks.map((task, i) => (
                <QueueCard key={task.id} task={task} position={i === 0 ? "next" : "maybe"} />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center text-white/50">No tasks in stack</div>
        )}
      </div>

      {/* Enforcement Badge */}
      {enforcementState && (
        <div className="px-6 pb-4">
          <EnforcementBadge state={enforcementState} onToggle={onEnforcementToggle} />
        </div>
      )}

      {/* Bottom Bar - Glyph */}
      <div className="px-6 pb-6">
        <div className="flex flex-col items-center gap-3">
          {/* Dialogue */}
          <div className="px-5 py-2.5 rounded-full bg-black/80 border border-white/20 backdrop-blur-md">
            <span className="text-sm font-mono text-cyan-200">
              &quot;{glyphContext.dialogue}&quot;
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onDistractionTrigger}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium",
                "bg-red-500/20 border border-red-400/30 text-red-200",
                "hover:bg-red-500/30 hover:border-red-400/50",
                "transition-all duration-200"
              )}
            >
              I&apos;m distracted
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StackLens;
