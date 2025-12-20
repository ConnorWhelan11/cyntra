"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GliaCheckpointModalPanel } from "../schema";
import type { AgUiWorkspaceActionHandler } from "../types";

export function CheckpointModalPanel({
  panel,
  onAction,
  className,
}: {
  panel: GliaCheckpointModalPanel;
  onAction?: AgUiWorkspaceActionHandler;
  className?: string;
}) {
  const isModal = panel.slot === "modal";
  const actions = panel.props.actions ?? [];

  const card = (
    <div
      className={cn(
        "w-full max-w-xl rounded-2xl border border-border/50 bg-background/80 p-6 shadow-lg backdrop-blur",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            checkpoint_modal
          </p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            {panel.props.title}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() =>
            onAction?.({
              action: "dismiss",
              source: {
                kind: "checkpoint_modal",
                id: panel.id,
                actionId: "dismiss",
              },
            })
          }
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">
        {panel.props.body}
      </p>

      {actions.length > 0 ? (
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant={action.action === "dismiss" ? "secondary" : "default"}
              onClick={() => {
                if (!onAction) return;
                const source = {
                  kind: "checkpoint_modal" as const,
                  id: panel.id,
                  actionId: action.id,
                };
                if (action.action === "dismiss") {
                  onAction({ action: "dismiss", source });
                  return;
                }
                if (action.action === "open_tool" && action.targetId) {
                  onAction({
                    action: "open_tool",
                    targetId: action.targetId,
                    label: action.label,
                    source,
                  });
                  return;
                }
                if (action.action === "complete_step" && action.targetId) {
                  onAction({
                    action: "complete_step",
                    targetId: action.targetId,
                    source,
                  });
                }
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (!isModal) return card;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      {card}
    </div>
  );
}
