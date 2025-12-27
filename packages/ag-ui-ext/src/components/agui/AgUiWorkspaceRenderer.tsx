"use client";

import { cn } from "@/lib/utils";
import type { GliaWorkspaceState } from "./schema";
import { gliaComponentRegistry } from "./registry";
import type { AgUiWorkspaceActionHandler } from "./types";

export function AgUiWorkspaceRenderer({
  workspace,
  className,
  onAction,
}: {
  workspace: GliaWorkspaceState;
  className?: string;
  onAction?: AgUiWorkspaceActionHandler;
}) {
  const panels = workspace.panels;
  const toasts = workspace.toasts;
  const highlights = workspace.highlights;

  const modalPanels = panels.filter((panel) => panel.slot === "modal");
  const surfacePanels = panels.filter((panel) => panel.slot !== "modal");

  const renderPanel = (panel: GliaWorkspaceState["panels"][number]) => {
    switch (panel.kind) {
      case "focus_timer": {
        const Panel = gliaComponentRegistry.focus_timer;
        return <Panel key={panel.id} panel={panel} onAction={onAction} />;
      }
      case "objective_stepper": {
        const Panel = gliaComponentRegistry.objective_stepper;
        return <Panel key={panel.id} panel={panel} onAction={onAction} />;
      }
      case "checkpoint_modal": {
        const Panel = gliaComponentRegistry.checkpoint_modal;
        return <Panel key={panel.id} panel={panel} onAction={onAction} />;
      }
      case "notes_panel": {
        const Panel = gliaComponentRegistry.notes_panel;
        return <Panel key={panel.id} panel={panel} onAction={onAction} />;
      }
      case "practice_question": {
        const Panel = gliaComponentRegistry.practice_question;
        return <Panel key={panel.id} panel={panel} onAction={onAction} />;
      }
      case "drawboard": {
        const Panel = gliaComponentRegistry.drawboard;
        return <Panel key={panel.id} panel={panel} onAction={onAction} />;
      }
      case "progress_badges": {
        const Panel = gliaComponentRegistry.progress_badges;
        return <Panel key={panel.id} panel={panel} onAction={onAction} />;
      }
      default:
        return null;
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {surfacePanels.length > 0 ? (
        <div className="space-y-3">
          {(["primary", "secondary", "dock"] as const).map((slot) => {
            const slotPanels = surfacePanels.filter((panel) => panel.slot === slot);
            if (slotPanels.length === 0) return null;

            return (
              <div key={slot} className="space-y-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {slot}
                </p>
                {slotPanels.map(renderPanel)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5 text-sm text-muted-foreground">
          Waiting for a workspace snapshot…
        </div>
      )}

      {toasts.length > 0 ? (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">toasts</p>
          <div className="mt-3 space-y-2">
            {toasts.map((toast) => {
              const action = toast.action;
              return (
                <div
                  key={toast.id}
                  className="rounded-xl border border-border/40 bg-background/40 px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{toast.message}</p>
                      {action ? (
                        <button
                          type="button"
                          onClick={() =>
                            onAction?.({
                              action: "open_tool",
                              targetId: action.targetId,
                              label: action.label,
                              source: { kind: "toast", id: toast.id },
                            })
                          }
                          className="mt-2 inline-flex items-center rounded-md border border-border/40 bg-background/50 px-3 py-1 text-xs text-foreground hover:bg-background/80"
                        >
                          {action.label}
                        </button>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {toast.kind}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {Math.round(toast.ttlMs / 1000)}s
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {highlights.length > 0 ? (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            highlights
          </p>
          <div className="mt-3 space-y-2">
            {highlights.map((highlight) => (
              <div
                key={highlight.id}
                className="rounded-xl border border-border/40 bg-background/40 px-4 py-3 text-sm"
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {highlight.target}
                </p>
                <p className="mt-2 text-foreground">{highlight.message}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {modalPanels.map(renderPanel)}
    </div>
  );
}
