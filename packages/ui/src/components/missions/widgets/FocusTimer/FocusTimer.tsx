"use client";

/**
 * FocusTimer — Displays countdown/elapsed based on current step
 */

import { Clock, Pause, Play } from "lucide-react";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { useMissionRuntime } from "../../../../missions/provider";
import { motion } from "framer-motion";

export interface FocusTimerProps {
  /** Show as countdown (remaining time) vs elapsed */
  showCountdown?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom class name */
  className?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function FocusTimer({
  showCountdown = true,
  size = "md",
  className,
}: FocusTimerProps) {
  const { 
    definition, 
    state, 
    elapsedSeconds, 
    isPaused, 
    isActive,
    pauseMission,
    resumeMission,
  } = useMissionRuntime();

  const reducedMotion = prefersReducedMotion();

  if (!definition || !state) {
    return null;
  }

  // Calculate times
  const estimatedTotal = (definition.estimatedDurationMinutes ?? 60) * 60;
  const remaining = Math.max(0, estimatedTotal - elapsedSeconds);
  const displayTime = showCountdown ? remaining : elapsedSeconds;
  const progress = Math.min(1, elapsedSeconds / estimatedTotal);

  // Get current step time info
  const currentStep = state.activeStepId
    ? definition.steps.find((s) => s.id === state.activeStepId)
    : null;
  const stepState = state.activeStepId ? state.steps[state.activeStepId] : null;
  const hasStepTimer =
    currentStep?.completion.kind === "time" && stepState?.elapsedSeconds !== undefined;

  const sizeClasses = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-6 w-6",
  };

  return (
    <div className={cn("focus-timer", className)}>
      {/* Main Timer */}
      <div className="flex items-center gap-3">
        <div className="relative">
          {/* Progress ring */}
          <svg
            className="h-12 w-12 -rotate-90"
            viewBox="0 0 36 36"
          >
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-border/40"
            />
            <motion.circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-cyan-neon"
              strokeDasharray={100}
              initial={{ strokeDashoffset: 100 }}
              animate={{ strokeDashoffset: 100 - progress * 100 }}
              transition={{ duration: reducedMotion ? 0 : 0.5 }}
            />
          </svg>
          
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Clock className={cn("text-muted-foreground", iconSizes[size])} />
          </div>
        </div>

        <div>
          <div className={cn("font-mono font-bold tabular-nums", sizeClasses[size])}>
            {formatTime(displayTime)}
          </div>
          <div className="text-xs text-muted-foreground">
            {showCountdown ? "remaining" : "elapsed"}
          </div>
        </div>

        {/* Pause/Resume button */}
        {(isActive || isPaused) && (
          <button
            onClick={isPaused ? resumeMission : pauseMission}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
              isPaused
                ? "border-cyan-neon/40 bg-cyan-neon/10 text-cyan-neon hover:bg-cyan-neon/20"
                : "border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
            )}
          >
            {isPaused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Step Timer (if applicable) */}
      {hasStepTimer && currentStep?.completion.kind === "time" && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Step time</span>
            <span>
              {formatTime(stepState?.elapsedSeconds ?? 0)} / {formatTime(currentStep.completion.seconds)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-border/40 overflow-hidden">
            <motion.div
              className={cn(
                "h-full rounded-full",
                (stepState?.elapsedSeconds ?? 0) >= currentStep.completion.seconds
                  ? "bg-emerald-neon"
                  : "bg-cyan-neon"
              )}
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, ((stepState?.elapsedSeconds ?? 0) / currentStep.completion.seconds) * 100)}%`,
              }}
              transition={{ duration: reducedMotion ? 0 : 0.3 }}
            />
          </div>
        </div>
      )}

      {/* Paused indicator */}
      {isPaused && (
        <div className="mt-2 text-xs text-amber-400">
          ⏸ Paused
        </div>
      )}
    </div>
  );
}

