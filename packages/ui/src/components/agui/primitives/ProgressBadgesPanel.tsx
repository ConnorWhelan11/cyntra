"use client";

import { cn } from "@/lib/utils";
import type { GliaProgressBadgesPanel } from "../schema";
import type { AgUiWorkspaceActionHandler } from "../types";

const badgeToneStyles: Record<
  NonNullable<GliaProgressBadgesPanel["props"]["badges"]>[number]["tone"],
  string
> = {
  cyan: "border-cyan-neon/30 bg-cyan-neon/10 text-cyan-100",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  magenta: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100",
};

export function ProgressBadgesPanel({
  panel,
  className,
}: {
  panel: GliaProgressBadgesPanel;
  className?: string;
  onAction?: AgUiWorkspaceActionHandler;
}) {
  const badges = panel.props.badges ?? [];
  const stats = panel.props.stats ?? [];

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/40 bg-card/40 p-5",
        className
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        progress_badges
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">
        {panel.title ?? "Progress"}
      </p>

      {badges.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {badges.map((badge) => (
            <span
              key={badge.label}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                badgeToneStyles[badge.tone]
              )}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}

      {stats.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border/40 bg-background/40 px-4 py-3"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
