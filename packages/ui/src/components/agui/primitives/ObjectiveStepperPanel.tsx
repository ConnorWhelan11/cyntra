"use client";

import { CheckCircle2, Circle, Dot } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GliaObjectiveStepperPanel } from "../schema";
import type { AgUiWorkspaceActionHandler } from "../types";

const statusStyles = {
  todo: "text-muted-foreground",
  doing: "text-cyan-neon",
  done: "text-emerald-300",
} as const;

export function ObjectiveStepperPanel({
  panel,
  className,
}: {
  panel: GliaObjectiveStepperPanel;
  className?: string;
  onAction?: AgUiWorkspaceActionHandler;
}) {
  const steps = panel.props.steps;
  const activeId = panel.props.activeId;

  const counts = steps.reduce(
    (acc, step) => {
      acc.total += 1;
      if (step.status === "done") acc.done += 1;
      if (step.status === "doing") acc.doing += 1;
      if (step.status === "todo") acc.todo += 1;
      return acc;
    },
    { total: 0, done: 0, doing: 0, todo: 0 }
  );

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/40 bg-card/40 p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            objective_stepper
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {panel.title ?? "Objectives"}
          </p>
        </div>
        {panel.props.showCounts ? (
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>{counts.done} done</span>
            <Dot className="h-3 w-3" />
            <span>{counts.doing} doing</span>
            <Dot className="h-3 w-3" />
            <span>{counts.todo} todo</span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {steps.map((step) => {
          const isActive = step.id === activeId;
          const icon =
            step.status === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            ) : (
              <Circle
                className={cn(
                  "h-4 w-4",
                  step.status === "doing"
                    ? "text-cyan-neon"
                    : "text-muted-foreground"
                )}
              />
            );

          return (
            <div
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-border/40 bg-background/40 px-4 py-3",
                isActive && "border-cyan-neon/30 bg-cyan-neon/5"
              )}
            >
              <div className="mt-0.5">{icon}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{step.title}</p>
                <p
                  className={cn(
                    "mt-1 text-[10px] uppercase tracking-[0.18em]",
                    statusStyles[step.status]
                  )}
                >
                  {isActive ? "active" : step.status}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
