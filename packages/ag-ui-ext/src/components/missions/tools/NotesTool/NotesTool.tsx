"use client";

/**
 * NotesTool — Document editor tool for missions
 * Wraps MissionDocEditor and emits tool events
 */

import { FileText } from "lucide-react";
import { useCallback } from "react";
import type { MissionTool, MissionToolRenderProps } from "../../../../missions/types";
import { useMissionRuntime } from "../../../../missions/provider";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Panel Component
// ─────────────────────────────────────────────────────────────────────────────

export function NotesToolPanel({ toolId, config }: MissionToolRenderProps) {
  const { dispatch } = useMissionRuntime();

  const handleNotesChange = useCallback(() => {
    // Type assertion needed due to TypeScript union type handling
    dispatch({
      type: "tool/event",
      toolId,
      name: "notes/changed",
    } as Parameters<typeof dispatch>[0]);
  }, [dispatch, toolId]);

  // Get template from config
  const template = (config?.template as string) ?? "blank";
  const placeholder = (config?.placeholder as string) ?? "Start taking notes...";

  return (
    <div className="notes-tool flex h-full flex-col">
      {/* Simple textarea for notes (v0.1 - can integrate MissionDocEditor later) */}
      <div className="flex-1 min-h-0 p-4">
        <textarea
          className="h-full w-full resize-none rounded-lg border border-border/40 bg-background/50 p-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-cyan-neon/40 focus:outline-none focus:ring-1 focus:ring-cyan-neon/20"
          placeholder={placeholder}
          onChange={handleNotesChange}
          aria-label="Mission notes"
        />
      </div>

      {/* Footer */}
      <div className="border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
        Template: {template}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definition
// ─────────────────────────────────────────────────────────────────────────────

export const NotesTool: MissionTool = {
  id: "glia.notes",
  title: "Notes",
  description: "Take notes and annotations during your study session",
  icon: <FileText className="h-4 w-4" />,
  Panel: NotesToolPanel,
  handlesEvents: true,
};
