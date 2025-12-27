"use client";

/**
 * ProgressBar — Shows mission progress and optional XP
 */

import { Trophy, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { useMissionRuntime } from "../../../../missions/provider";

export interface ProgressBarProps {
  /** Show XP indicator */
  showXP?: boolean;
  /** Compact layout */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

export function ProgressBar({ showXP = true, compact = false, className }: ProgressBarProps) {
  const { definition, state, progress, isComplete } = useMissionRuntime();
  const reducedMotion = prefersReducedMotion();

  if (!definition || !state) {
    return null;
  }

  const completedSteps = Object.values(state.steps).filter((s) => s.status === "completed").length;
  const totalSteps = state.stepOrder.length;
  const percentComplete = Math.round(progress * 100);

  // Calculate potential XP earned
  const potentialXP = definition.rewardXP ?? 0;
  const earnedXP = isComplete ? potentialXP : Math.floor(potentialXP * progress);

  return (
    <div className={cn("progress-bar", className)}>
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Progress</span>
          <span className="text-xs text-foreground">{percentComplete}%</span>
        </div>
      )}

      {/* Progress Bar */}
      <div className="relative">
        <div className="h-2 w-full rounded-full bg-border/40 overflow-hidden">
          <motion.div
            className={cn(
              "h-full rounded-full",
              isComplete ? "bg-gradient-to-r from-emerald-neon to-cyan-neon" : "bg-cyan-neon"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${percentComplete}%` }}
            transition={{ duration: reducedMotion ? 0 : 0.5, ease: "easeOut" }}
          />
        </div>

        {/* Completion badge */}
        {isComplete && (
          <motion.div
            className="absolute -right-1 -top-1"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.5, type: "spring" }}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-neon text-background">
              <Trophy className="h-3 w-3" />
            </div>
          </motion.div>
        )}
      </div>

      {/* Stats row */}
      <div className={cn("flex items-center justify-between mt-2", compact && "mt-1")}>
        <span className="text-xs text-muted-foreground">
          {completedSteps}/{totalSteps} steps
        </span>

        {showXP && potentialXP > 0 && (
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-amber-400" />
            <span
              className={cn(
                "text-xs font-medium",
                isComplete ? "text-emerald-neon" : "text-amber-400"
              )}
            >
              {earnedXP}/{potentialXP} XP
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
