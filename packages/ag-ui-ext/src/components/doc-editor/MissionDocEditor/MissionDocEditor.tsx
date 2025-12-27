"use client";

import { RichDocEditor, RichDocEditorProps } from "../RichDocEditor";
import { cn } from "@/lib/utils";

export type MissionDocTemplate =
  | "brief" // Mission overview
  | "checklist" // Task checklist
  | "reflection" // What went well / didn't
  | "notes" // Freeform notes
  | "custom";

export interface MissionDocEditorProps extends Omit<RichDocEditorProps, "placeholder"> {
  /** Mission title */
  missionTitle?: string;

  /** Mission status */
  missionStatus?: "active" | "completed" | "paused" | "archived";

  /** Pre-selected template */
  template?: MissionDocTemplate;

  /** Template blocks (used when template is selected) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templateContent?: any[];

  /** Callback when agent suggests content */
  onAgentSuggestion?: (suggestion: AgentSuggestion) => void;

  /** Show template selector */
  showTemplateSelector?: boolean;

  /** Callback when template is selected */
  onTemplateSelect?: (template: MissionDocTemplate) => void;
}

export interface AgentSuggestion {
  id: string;
  type: "append" | "replace" | "comment";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: any[];
  reasoning?: string;
}

const TEMPLATE_PLACEHOLDERS: Record<MissionDocTemplate, string> = {
  brief: "Describe your mission objectives...",
  checklist: "Add your action items...",
  reflection: "Reflect on your progress...",
  notes: "Capture your thoughts...",
  custom: "Start writing...",
};

export function MissionDocEditor({
  missionTitle,
  missionStatus = "active",
  template = "notes",
  templateContent,
  onAgentSuggestion: _onAgentSuggestion,
  showTemplateSelector = false,
  onTemplateSelect,
  className,
  initialContent,
  ...editorProps
}: MissionDocEditorProps) {
  const effectiveContent = templateContent ?? initialContent;

  return (
    <div className={cn("mission-doc-editor flex flex-col gap-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-3">
          {missionTitle && (
            <h2 className="text-lg font-semibold text-foreground">{missionTitle}</h2>
          )}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs",
              missionStatus === "active" && "bg-green-500/20 text-green-400",
              missionStatus === "completed" && "bg-cyan-neon/20 text-cyan-neon",
              missionStatus === "paused" && "bg-yellow-500/20 text-yellow-400",
              missionStatus === "archived" && "bg-muted text-muted-foreground"
            )}
          >
            {missionStatus}
          </span>
        </div>

        {showTemplateSelector && (
          <select
            value={template}
            onChange={(e) => onTemplateSelect?.(e.target.value as MissionDocTemplate)}
            className="rounded border border-border/40 bg-background px-2 py-1 text-sm"
          >
            <option value="brief">Mission Brief</option>
            <option value="checklist">Checklist</option>
            <option value="reflection">Reflection</option>
            <option value="notes">Free Notes</option>
          </select>
        )}
      </div>

      {/* Editor */}
      <RichDocEditor
        {...editorProps}
        initialContent={effectiveContent}
        placeholder={TEMPLATE_PLACEHOLDERS[template]}
      />
    </div>
  );
}
