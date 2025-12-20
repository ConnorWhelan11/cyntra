"use client";

import React from "react";
import { cn } from "../../lib/utils";
import { DrawboardCanvas, type DrawboardCanvasProps } from "./DrawboardCanvas";
import { DrawboardSidebar, type DrawboardSidebarProps } from "./DrawboardSidebar";
import { DrawboardToolbar, type DrawboardToolbarProps } from "./DrawboardToolbar";

type DrawboardMode = "default" | "lecture" | "agent";

export type DrawboardLayoutProps = {
  mode?: DrawboardMode;
  className?: string;
  canvasProps?: DrawboardCanvasProps;
  toolbarProps?: DrawboardToolbarProps;
  sidebar?: DrawboardSidebarProps & { content?: React.ReactNode };
  showSidebar?: boolean;
};

/**
 * High-level layout that composes toolbar, canvas, and an optional sidebar.
 * It is intentionally mode-agnostic; modes only influence subtle styling/text.
 */
export function DrawboardLayout({
  mode = "default",
  className,
  canvasProps,
  toolbarProps,
  sidebar,
  showSidebar = true,
}: DrawboardLayoutProps) {
  const modeLabel =
    mode === "lecture" ? "Lecture Mode" : mode === "agent" ? "Agent Assist" : "Drawboard";

  return (
    <div className={cn("flex h-full gap-4", className)}>
      <div className="flex-1 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
              {modeLabel}
            </span>
            <span className="text-muted-foreground/80">Canvas</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 h-[680px]">
          <DrawboardToolbar {...toolbarProps} />
          <div className="flex-1 min-h-[480px]">
            <DrawboardCanvas {...canvasProps} />
          </div>
        </div>
      </div>

      {showSidebar && (
        <div className="w-full max-w-[360px]">
          <DrawboardSidebar {...sidebar}>
            {sidebar?.content ?? sidebar?.children}
          </DrawboardSidebar>
        </div>
      )}
    </div>
  );
}

