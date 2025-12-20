"use client";

import { RichDocEditor, RichDocEditorProps } from "../RichDocEditor";
import { cn } from "@/lib/utils";

export interface LectureSegment {
  id: string;
  timestamp?: number; // seconds into lecture
  type: "heading" | "note" | "question" | "insight";
  content: string;
}

export interface LectureNoteEditorProps extends Omit<RichDocEditorProps, 'placeholder'> {
  /** Lecture title displayed in header */
  lectureTitle?: string;
  
  /** Lecture date/time */
  lectureDate?: Date;
  
  /** Enable professor stream sidebar */
  professorStreamEnabled?: boolean;
  
  /** Professor stream content (AI/ASR generated) */
  professorStreamContent?: LectureSegment[];
  
  /** Callback when user inserts a segment from stream */
  onInsertSegment?: (segment: LectureSegment) => void;
  
  /** Current lecture timestamp (for live sync) */
  currentTimestamp?: number;
  
  /** Tags/topics for the lecture */
  tags?: string[];
}

export function LectureNoteEditor({
  lectureTitle,
  lectureDate,
  professorStreamEnabled = false,
  professorStreamContent = [],
  onInsertSegment,
  currentTimestamp,
  tags = [],
  className,
  ...editorProps
}: LectureNoteEditorProps) {
  return (
    <div className={cn("lecture-note-editor flex flex-col gap-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div>
          {lectureTitle && (
            <h2 className="text-lg font-semibold text-foreground">
              {lectureTitle}
            </h2>
          )}
          {lectureDate && (
            <p className="text-sm text-muted-foreground">
              {lectureDate.toLocaleDateString()}
            </p>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-cyan-neon/10 px-2 py-0.5 text-xs text-cyan-neon"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex gap-4">
        {/* Editor */}
        <div className="flex-1">
          <RichDocEditor
            {...editorProps}
            placeholder="Take notes during the lecture..."
          />
        </div>

        {/* Professor stream sidebar */}
        {professorStreamEnabled && (
          <aside className="w-64 shrink-0 rounded-lg border border-border/40 bg-card/40 p-3">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              Live Insights
            </h3>
            <div className="space-y-2">
              {professorStreamContent.map((segment) => (
                <button
                  key={segment.id}
                  onClick={() => onInsertSegment?.(segment)}
                  className="w-full rounded border border-border/20 bg-background/50 p-2 text-left text-xs hover:border-cyan-neon/40 transition-colors"
                >
                  <span className="text-muted-foreground">
                    {segment.timestamp != null && `${Math.floor(segment.timestamp / 60)}:${(segment.timestamp % 60).toString().padStart(2, '0')} `}
                  </span>
                  {segment.content}
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}