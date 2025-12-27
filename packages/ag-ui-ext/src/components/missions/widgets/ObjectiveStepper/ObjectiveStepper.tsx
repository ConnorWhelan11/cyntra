"use client";

/**
 * ObjectiveStepper — Shows step list and current step state
 */

import { CheckCircle2, Circle, Play, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMissionRuntime } from "../../../../missions/provider";
import type { MissionStepStatus } from "../../../../missions/types";

export interface ObjectiveStepperProps {
  /** Show step descriptions */
  showDescriptions?: boolean;
  /** Allow clicking to navigate (v0.1: forward only) */
  allowNavigation?: boolean;
  /** Compact mode for rail display */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

export function ObjectiveStepper({
  showDescriptions = false,
  allowNavigation = true,
  compact = false,
  className,
}: ObjectiveStepperProps) {
  const { definition, state, activateStep, completeCurrentStep } = useMissionRuntime();

  if (!definition || !state) {
    return null;
  }

  const getStatusIcon = (status: MissionStepStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-neon" />;
      case "active":
        return <Play className="h-4 w-4 text-cyan-neon" />;
      case "skipped":
        return <SkipForward className="h-4 w-4 text-amber-400" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: MissionStepStatus) => {
    switch (status) {
      case "completed":
        return "border-emerald-neon/40 bg-emerald-neon/10";
      case "active":
        return "border-cyan-neon/40 bg-cyan-neon/10";
      case "skipped":
        return "border-amber-400/40 bg-amber-400/10";
      case "available":
        return "border-border/60 bg-card/40 hover:border-cyan-neon/30";
      default:
        return "border-border/20 bg-muted/20 opacity-50";
    }
  };

  const handleStepClick = (stepId: string, status: MissionStepStatus) => {
    if (!allowNavigation) return;

    // v0.1: Only allow activating available steps or completing active step
    if (status === "available") {
      activateStep(stepId);
    } else if (status === "active") {
      completeCurrentStep();
    }
  };

  return (
    <div className={cn("objective-stepper", className)}>
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Objectives
      </h4>

      <div className={cn("space-y-2", compact && "space-y-1")}>
        {definition.steps.map((step, index) => {
          const stepState = state.steps[step.id];
          const status = stepState?.status ?? "locked";
          const isClickable = allowNavigation && (status === "available" || status === "active");

          return (
            <button
              key={step.id}
              onClick={() => handleStepClick(step.id, status)}
              disabled={!isClickable}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-2 text-left transition-all",
                getStatusColor(status),
                isClickable && "cursor-pointer",
                !isClickable && "cursor-default"
              )}
            >
              {/* Step Number / Icon */}
              <div className="flex-shrink-0 mt-0.5">{getStatusIcon(status)}</div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "text-sm font-medium",
                    status === "completed" && "text-emerald-neon",
                    status === "active" && "text-cyan-neon",
                    status === "skipped" && "text-amber-400",
                    status === "available" && "text-foreground",
                    status === "locked" && "text-muted-foreground"
                  )}
                >
                  {compact ? (
                    <span className="truncate block">{step.title}</span>
                  ) : (
                    <>
                      <span className="mr-2 text-xs text-muted-foreground">{index + 1}.</span>
                      {step.title}
                    </>
                  )}
                </div>

                {showDescriptions && step.description && !compact && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {step.description}
                  </p>
                )}

                {/* Time/progress indicator for active time-based steps */}
                {status === "active" &&
                  step.completion.kind === "time" &&
                  stepState?.elapsedSeconds !== undefined && (
                    <div className="mt-2">
                      <div className="h-1 w-full rounded-full bg-border/40 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan-neon transition-all"
                          style={{
                            width: `${Math.min(100, (stepState.elapsedSeconds / step.completion.seconds) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {Math.floor(stepState.elapsedSeconds / 60)}:
                        {(Math.floor(stepState.elapsedSeconds) % 60).toString().padStart(2, "0")} /{" "}
                        {Math.floor(step.completion.seconds / 60)}:
                        {(step.completion.seconds % 60).toString().padStart(2, "0")}
                      </div>
                    </div>
                  )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
