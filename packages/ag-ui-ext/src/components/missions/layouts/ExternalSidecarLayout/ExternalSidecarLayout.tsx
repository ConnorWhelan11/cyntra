"use client";

/**
 * ExternalSidecarLayout — Missions where user works in external tab
 * Shows instruction surface + quick notes capture in a sidecar
 */

import { ExternalLink, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlowButton } from "../../../atoms/GlowButton";
import type { MissionLayoutRenderProps } from "../../../../missions/types";
import { useMissionRuntime } from "../../../../missions/provider";

export function ExternalSidecarLayout({
  definition,
  state,
  renderTool,
  widgets,
  className,
}: MissionLayoutRenderProps) {
  const { dispatch, completeCurrentStep } = useMissionRuntime();

  // Find tools for different slots
  const secondaryToolRef = definition.tools.find(
    (t) => t.placement?.slot === "secondary" && state.openToolIds.includes(t.toolId)
  );
  const railTools = definition.tools.filter(
    (t) => t.placement?.slot === "rail" && state.openToolIds.includes(t.toolId)
  );

  // Get current step for context
  const currentStep = state.activeStepId
    ? definition.steps.find((s) => s.id === state.activeStepId)
    : null;

  const handleExternalOpened = () => {
    dispatch({
      type: "tool/event",
      toolId: "glia.external",
      name: "external/opened",
    } as Parameters<typeof dispatch>[0]);
  };

  const handleSegmentComplete = () => {
    dispatch({
      type: "tool/event",
      toolId: "glia.external",
      name: "external/segmentComplete",
    } as Parameters<typeof dispatch>[0]);
    completeCurrentStep();
  };

  return (
    <div className={cn("external-sidecar-layout flex h-full gap-3 p-3", className)}>
      {/* External Instruction Surface (Left) */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* External Resource Card */}
        <div className="rounded-lg border border-border/40 bg-card/40 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-neon/20">
              <ExternalLink className="h-6 w-6 text-cyan-neon" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">External Work Session</h3>
              <p className="text-sm text-muted-foreground">
                {currentStep?.title ?? "Work in your external resource"}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-dashed border-border/60 bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">
              {currentStep?.description ??
                "Open your external resource (UWorld, Anki, etc.) and work on the assigned material. Return here when done."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <GlowButton glow="low" onClick={handleExternalOpened} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Open External Resource
            </GlowButton>

            <GlowButton
              variant="outline"
              glow="none"
              onClick={handleSegmentComplete}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark Segment Complete
            </GlowButton>
          </div>

          {/* Extension Status */}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            <span>Extension not connected — manual completion only</span>
          </div>
        </div>

        {/* Secondary Tool (Quick Notes) */}
        {secondaryToolRef && (
          <div className="flex-1 min-h-0 rounded-lg border border-border/40 bg-card/40 overflow-hidden">
            <div className="border-b border-border/40 bg-card/60 px-3 py-2">
              <span className="text-sm font-medium text-muted-foreground">
                {secondaryToolRef.placement?.tabLabel ?? "Quick Notes"}
              </span>
            </div>
            <div className="h-full">{renderTool(secondaryToolRef.toolId, "secondary")}</div>
          </div>
        )}
      </div>

      {/* Right Rail */}
      <div className="flex w-64 flex-col gap-3">
        {/* Widgets */}
        {widgets && (
          <div className="rounded-lg border border-border/40 bg-card/40 p-3">{widgets}</div>
        )}

        {/* Rail Tools */}
        {railTools.map((toolRef) => (
          <div
            key={toolRef.toolId}
            className="rounded-lg border border-border/40 bg-card/40 overflow-hidden"
          >
            {renderTool(toolRef.toolId, "rail")}
          </div>
        ))}

        {/* Step Progress Checklist */}
        <div className="rounded-lg border border-border/40 bg-card/40 p-3">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Steps
          </h4>
          <div className="space-y-2">
            {definition.steps.map((step, index) => {
              const stepState = state.steps[step.id];
              const isCompleted = stepState?.status === "completed";
              const isActive = stepState?.status === "active";

              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    isCompleted && "text-emerald-neon",
                    isActive && "text-cyan-neon",
                    !isCompleted && !isActive && "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                      isCompleted && "bg-emerald-neon/20",
                      isActive && "bg-cyan-neon/20",
                      !isCompleted && !isActive && "bg-muted/40"
                    )}
                  >
                    {isCompleted ? "✓" : index + 1}
                  </span>
                  <span className="truncate">{step.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
