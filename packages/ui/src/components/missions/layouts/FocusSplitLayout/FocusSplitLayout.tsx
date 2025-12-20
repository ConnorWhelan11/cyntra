"use client";

/**
 * FocusSplitLayout — Deep focus on primary tool with stable right rail
 */

import { cn } from "@/lib/utils";
import type { MissionLayoutRenderProps } from "../../../../missions/types";

export function FocusSplitLayout({
  definition,
  state,
  renderTool,
  widgets,
  className,
}: MissionLayoutRenderProps) {
  // Find tools by slot placement
  const primaryToolRef = definition.tools.find(
    (t) => t.placement?.slot === "primary" && state.openToolIds.includes(t.toolId)
  );
  const secondaryToolRef = definition.tools.find(
    (t) => t.placement?.slot === "secondary" && state.openToolIds.includes(t.toolId)
  );
  const dockTools = definition.tools.filter(
    (t) => t.placement?.slot === "dock" && state.openToolIds.includes(t.toolId)
  );

  // Active tool falls back to primary if no explicit selection
  const activeToolId =
    state.activeToolId ??
    primaryToolRef?.toolId ??
    state.openToolIds[0] ??
    null;

  return (
    <div className={cn("focus-split-layout flex h-full gap-3 p-3", className)}>
      {/* Primary Surface (Left) */}
      <div className="flex-1 min-w-0 rounded-lg border border-border/40 bg-card/40 overflow-hidden">
        {activeToolId ? (
          renderTool(activeToolId, "primary")
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No tool selected
          </div>
        )}
      </div>

      {/* Right Rail */}
      <div className="flex w-72 flex-col gap-3">
        {/* Widgets Area */}
        {widgets && (
          <div className="rounded-lg border border-border/40 bg-card/40 p-3">
            {widgets}
          </div>
        )}

        {/* Secondary Tool (if different from active) */}
        {secondaryToolRef && secondaryToolRef.toolId !== activeToolId && (
          <div className="flex-1 min-h-0 rounded-lg border border-border/40 bg-card/40 overflow-hidden">
            {renderTool(secondaryToolRef.toolId, "secondary")}
          </div>
        )}

        {/* Dock: Minimized Tools */}
        {dockTools.length > 0 && (
          <div className="space-y-2">
            {dockTools.map((toolRef) => (
              <div
                key={toolRef.toolId}
                className="rounded-lg border border-border/40 bg-card/40 p-2"
              >
                <div className="text-xs font-medium text-muted-foreground">
                  {toolRef.placement?.tabLabel ?? toolRef.toolId}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

