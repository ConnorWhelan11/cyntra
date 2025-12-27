"use client";

/**
 * TabsWorkspaceLayout — Fast switching between multiple tool surfaces
 * Reuses LectureWorkspaceLayout concepts for lecture-style missions
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { MissionLayoutRenderProps } from "../../../../missions/types";

export function TabsWorkspaceLayout({
  definition,
  state,
  renderTool,
  widgets,
  className,
}: MissionLayoutRenderProps) {
  // Get all tools in primary slot (tabs)
  const tabTools = definition.tools.filter(
    (t) => t.placement?.slot === "primary" && state.openToolIds.includes(t.toolId)
  );

  // Active tab state
  const [activeTabId, setActiveTabId] = useState<string>(
    state.activeToolId ?? tabTools[0]?.toolId ?? ""
  );

  const handleTabChange = useCallback((toolId: string) => {
    setActiveTabId(toolId);
  }, []);

  return (
    <div className={cn("tabs-workspace-layout flex h-full flex-col", className)}>
      {/* Header with Tabs */}
      <div className="flex items-center justify-between border-b border-border/40 bg-card/60 px-4 py-2">
        {/* Tab Bar */}
        <div className="flex gap-1">
          {tabTools.map((toolRef) => {
            const isActive = activeTabId === toolRef.toolId;
            return (
              <button
                key={toolRef.toolId}
                onClick={() => handleTabChange(toolRef.toolId)}
                className={cn(
                  "flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm transition-all",
                  isActive
                    ? "border-b-2 border-cyan-neon bg-card/80 text-foreground"
                    : "text-muted-foreground hover:bg-card/40 hover:text-foreground"
                )}
              >
                <span>{toolRef.placement?.tabLabel ?? toolRef.toolId}</span>
              </button>
            );
          })}
        </div>

        {/* Widgets Slot */}
        {widgets && <div className="flex items-center gap-2">{widgets}</div>}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden p-3">
        {activeTabId ? (
          <div className="h-full rounded-lg border border-border/40 bg-card/40 overflow-hidden">
            {renderTool(activeTabId, "primary")}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No tools available
          </div>
        )}
      </div>
    </div>
  );
}
