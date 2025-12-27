"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import type { GliaNotesPanel } from "../schema";
import type { AgUiWorkspaceActionHandler } from "../types";

function templateLabel(template: GliaNotesPanel["props"]["template"]): string {
  switch (template) {
    case "cornell":
      return "Cornell";
    case "outline":
      return "Outline";
    default:
      return "Blank";
  }
}

export function NotesPanel({
  panel,
  className,
}: {
  panel: GliaNotesPanel;
  className?: string;
  onAction?: AgUiWorkspaceActionHandler;
}) {
  const [text, setText] = useState(panel.props.initialText);

  useEffect(() => {
    setText(panel.props.initialText);
  }, [panel.id, panel.props.initialText]);

  return (
    <div className={cn("rounded-2xl border border-border/40 bg-card/40 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            notes_panel
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">{panel.title ?? "Notes"}</p>
        </div>
        <span className="rounded-full border border-border/40 bg-background/40 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {templateLabel(panel.props.template)}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={panel.props.placeholder || "Write notes…"}
        className="mt-4 h-56 w-full resize-none rounded-xl border border-border/40 bg-background/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-neon/40"
      />
      <p className="mt-3 text-xs text-muted-foreground">Notes are local-only in v0 (no sync).</p>
    </div>
  );
}
