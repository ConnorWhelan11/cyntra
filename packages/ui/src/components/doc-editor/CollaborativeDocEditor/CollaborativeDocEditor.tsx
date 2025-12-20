"use client";

import { useEffect, useMemo } from "react";
import { Block, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import * as Y from "yjs";
import { LiveblocksYjsProvider } from "@liveblocks/yjs";
import { useRoom, useSelf } from "@liveblocks/react";
import "@blocknote/core/style.css";
import { cn } from "../../../lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CollaboratorInfo {
  name: string;
  color: string;
  avatar?: string;
}

export interface CollaborativeDocEditorProps {
  /** Room ID for collaboration (Liveblocks room) */
  roomId?: string;
  
  /** Initial content blocks (used when not collaborative or as fallback) */
  initialContent?: PartialBlock[] | null;
  
  /** Called when content changes (for persistence) */
  onChange?: (content: Block[]) => void;
  
  /** Read-only mode (disables editing but shows cursors) */
  readOnly?: boolean;
  
  /** Editor placeholder text */
  placeholder?: string;
  
  /** Custom class name for container */
  className?: string;
  
  /** Theme override */
  theme?: "light" | "dark";
  
  /** Current user info for presence */
  userInfo?: CollaboratorInfo;
  
  /** Callback when collaborators change */
  onCollaboratorsChange?: (collaborators: CollaboratorInfo[]) => void;
  
  /** Disable collaborative mode (use as regular editor) */
  disableCollaboration?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collaborative Editor (when inside Liveblocks room)
// ─────────────────────────────────────────────────────────────────────────────

function CollaborativeBlockNoteEditor({
  initialContent,
  onChange,
  readOnly = false,
  className,
  theme = "dark",
  userInfo,
}: Omit<CollaborativeDocEditorProps, 'roomId' | 'disableCollaboration' | 'onCollaboratorsChange'>) {
  const room = useRoom();
  const currentUser = useSelf();
  
  // Create Yjs document and Liveblocks provider
  const { doc, provider } = useMemo(() => {
    const yDoc = new Y.Doc();
    const yProvider = new LiveblocksYjsProvider(room, yDoc);
    return { doc: yDoc, provider: yProvider };
  }, [room]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      provider.destroy();
      doc.destroy();
    };
  }, [provider, doc]);

  // Derive user info from props or Liveblocks presence
  const collaborationUser = useMemo(() => {
    const currentUserColor = currentUser?.info?.color;
    return {
      name: userInfo?.name ?? (currentUser?.info?.name as string | undefined) ?? "Anonymous",
      color: userInfo?.color ?? (typeof currentUserColor === 'string' ? currentUserColor : "#00f0ff"),
    };
  }, [userInfo, currentUser]);

  // Create collaborative BlockNote editor
  const editor = useCreateBlockNote({
    collaboration: {
      provider,
      fragment: doc.getXmlFragment("document"),
      user: collaborationUser,
    },
    initialContent: initialContent ?? undefined,
  });

  // Handle content changes for persistence
  useEffect(() => {
    if (onChange) {
      const handler = () => {
        onChange(editor.document);
      };
      editor.onEditorContentChange(handler);
    }
  }, [editor, onChange]);

  return (
    <div
      className={cn(
        "collaborative-doc-editor rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm",
        "relative",
        className
      )}
    >
      {/* Collaboration indicator */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <span className="text-xs text-muted-foreground">Live</span>
      </div>
      
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        theme={theme}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-collaborative fallback (regular RichDocEditor behavior)
// ─────────────────────────────────────────────────────────────────────────────

function StandaloneBlockNoteEditor({
  initialContent,
  onChange,
  readOnly = false,
  className,
  theme = "dark",
}: Omit<CollaborativeDocEditorProps, 'roomId' | 'disableCollaboration' | 'onCollaboratorsChange' | 'userInfo'>) {
  const editor = useCreateBlockNote({
    initialContent: initialContent ?? undefined,
  });

  useEffect(() => {
    if (onChange) {
      editor.onEditorContentChange(() => {
        onChange(editor.document);
      });
    }
  }, [editor, onChange]);

  return (
    <div
      className={cn(
        "collaborative-doc-editor rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm",
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Export - Switches between collaborative and standalone mode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CollaborativeDocEditor - A BlockNote editor with optional real-time collaboration.
 * 
 * When used inside a Liveblocks RoomProvider and `disableCollaboration` is false,
 * it enables real-time cursors and document sync via Yjs.
 * 
 * When used standalone or with `disableCollaboration: true`, it behaves like
 * a regular RichDocEditor.
 * 
 * @example
 * // Collaborative mode (requires RoomProvider wrapper)
 * <RoomProvider id="my-document">
 *   <CollaborativeDocEditor
 *     userInfo={{ name: "Alice", color: "#ff0000" }}
 *     onChange={(content) => saveDocument(content)}
 *   />
 * </RoomProvider>
 * 
 * @example
 * // Standalone mode
 * <CollaborativeDocEditor
 *   disableCollaboration
 *   initialContent={savedContent}
 *   onChange={(content) => saveDocument(content)}
 * />
 */
export function CollaborativeDocEditor({
  disableCollaboration = false,
  ...props
}: CollaborativeDocEditorProps) {
  // When disableCollaboration is true, use standalone editor
  if (disableCollaboration) {
    return <StandaloneBlockNoteEditor {...props} />;
  }

  // When collaborative mode is enabled, assume we're in a RoomProvider
  // The parent component is responsible for wrapping with RoomProvider
  return <CollaborativeBlockNoteEditor {...props} />;
}

