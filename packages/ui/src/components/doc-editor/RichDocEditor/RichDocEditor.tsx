"use client";

import { useEffect } from "react";
import { Block, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/style.css";
import "@blocknote/mantine/style.css";
import { cn } from "@/lib/utils";

export interface RichDocEditorProps {
  /** Initial content blocks (BlockNote JSON format) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialContent?: PartialBlock<any, any, any>[] | null;
  
  /** Called when content changes */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (content: Block<any, any, any>[]) => void;
  
  /** Read-only mode */
  readOnly?: boolean;
  
  /** Editor placeholder text */
  placeholder?: string;
  
  /** AI command callback (stubbed for future) */
  onAICommand?: (command: AICommand) => Promise<void>;
  
  /** Custom class name for container */
  className?: string;
  
  /** Theme override (default follows system) */
  theme?: "light" | "dark";
  
  /** Disable animations */
  disableAnimations?: boolean;
}

export interface AICommand {
  type: "summarize" | "rewrite" | "expand" | "simplify";
  selection: string;
  context?: string;
}

export function RichDocEditor({
  initialContent,
  onChange,
  readOnly = false,
  className,
  theme = "dark",
  disableAnimations = false,
}: RichDocEditorProps) {
  const editor = useCreateBlockNote({
    initialContent: initialContent ?? undefined,
    // Future: custom blocks, slash menu items
  });

  // Handle changes
  useEffect(() => {
    if (onChange) {
      editor.onChange(() => {
        onChange(editor.document);
      });
    }
  }, [editor, onChange]);

  return (
    <div
      className={cn(
        "rich-doc-editor rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm",
        disableAnimations && "transition-none",
        className
      )}
    >
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        theme={theme}
      />
    </div>
  );
}