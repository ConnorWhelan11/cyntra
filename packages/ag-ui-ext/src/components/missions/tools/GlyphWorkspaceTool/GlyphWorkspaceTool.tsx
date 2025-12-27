"use client";

/**
 * GlyphWorkspaceTool — Stub tool (streamed workspace renderer lives in the app)
 */

import { Sparkles } from "lucide-react";
import type { MissionTool, MissionToolRenderProps } from "../../../../missions/types";

export function GlyphWorkspaceToolPanel(_props: MissionToolRenderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/40 bg-card/40">
        <Sparkles className="h-5 w-5 text-cyan-neon" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Glyph Workspace</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This tool is implemented by the host app. Rebuild and register the app override to enable
          live workspace streaming.
        </p>
      </div>
    </div>
  );
}

export const GlyphWorkspaceTool: MissionTool = {
  id: "glia.glyphWorkspace",
  title: "Workspace",
  description: "Streamed, allowlisted workspace panels",
  icon: <Sparkles className="h-4 w-4" />,
  Panel: GlyphWorkspaceToolPanel,
};
