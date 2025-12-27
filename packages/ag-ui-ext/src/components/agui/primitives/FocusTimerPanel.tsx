"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { GliaFocusTimerPanel } from "../schema";
import type { AgUiWorkspaceActionHandler } from "../types";

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function FocusTimerPanel({
  panel,
  className,
}: {
  panel: GliaFocusTimerPanel;
  className?: string;
  onAction?: AgUiWorkspaceActionHandler;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(panel.props.autoStart);

  useEffect(() => {
    setElapsedSeconds(0);
    setRunning(panel.props.autoStart);
  }, [panel.props.autoStart, panel.props.durationSeconds, panel.props.mode, panel.id]);

  useEffect(() => {
    if (!running) return;

    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (panel.props.mode !== "countdown") return;
    if (elapsedSeconds < panel.props.durationSeconds) return;
    setRunning(false);
  }, [elapsedSeconds, panel.props.durationSeconds, panel.props.mode]);

  const displaySeconds =
    panel.props.mode === "countdown"
      ? Math.max(0, panel.props.durationSeconds - elapsedSeconds)
      : elapsedSeconds;

  const display = useMemo(() => formatSeconds(displaySeconds), [displaySeconds]);

  return (
    <div className={cn("rounded-2xl border border-border/40 bg-card/40 p-5", className)}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">focus_timer</p>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">
            {panel.props.label || panel.title || "Focus timer"}
          </p>
          <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-cyan-neon">
            {display}
          </p>
        </div>
        <div className="rounded-full border border-border/40 bg-background/40 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {running ? "running" : "paused"} • {panel.props.mode}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        (Safe preview: local timer + validated props)
      </p>
    </div>
  );
}
