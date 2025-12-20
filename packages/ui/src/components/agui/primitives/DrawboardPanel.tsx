"use client";

import { cn } from "@/lib/utils";
import { DrawboardCanvas } from "@/components/ai-drawboard";
import type { GliaDrawboardPanel } from "../schema";
import type { AgUiWorkspaceActionHandler } from "../types";

export function DrawboardPanel({
  panel,
  className,
}: {
  panel: GliaDrawboardPanel;
  className?: string;
  onAction?: AgUiWorkspaceActionHandler;
}) {
  const isReadOnly = panel.props.readOnly;

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
            drawboard
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {panel.title ?? "Drawboard"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border/40 bg-background/40 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {panel.props.shareScope}
          </span>
          {isReadOnly ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-200">
              read-only
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative mt-4 h-[520px] overflow-hidden rounded-xl border border-border/40 bg-background/40">
        <div className={cn("h-full w-full", isReadOnly && "pointer-events-none")}>
          <DrawboardCanvas initialXml={panel.props.initialXml || undefined} />
        </div>
        {isReadOnly ? (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30" />
        ) : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Drawboard is sandboxed in v0 (no external libraries, no links).
      </p>
    </div>
  );
}
